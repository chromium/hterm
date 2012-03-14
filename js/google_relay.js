// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * This file contains the support required to make connections to Google's
 * HTTP-to-SSH relay.
 *
 * The relay is only available within Google at the moment.  If you'd like
 * to create one of your own though, you could follow the same conventions
 * and have a client ready to go.
 *
 * The connection looks like this...
 *
 *  +------+   +-------+   +---------------+
 *  | USER |   | PROXY |   | COOKIE_SERVER |
 *  +------+   +-------+   +---------------+
 *
 *                         +-----------+
 *                         | SSH_RELAY |
 *                         +-----------+
 *
 * 1. User specifies that they'd like to make their ssh connection through a
 *    web server.  In this code, that web server is called the 'proxy', since
 *    it happens to be an HTTP proxy.
 *
 * 2. We redirect to the 'http://HOST:8022/cookie?ext=RETURN_TO'.
 *
 *      HOST is the user-specified hostname for the proxy.  Port 8022 on the
 *      proxy is assumed to be the cookie server.
 *
 *      RETURN_TO is the location that the cookie server should redirect to
 *      when the cookie server is satisfied.
 *
 *    This connects us to the 'cookie server', which can initiate a
 *    single-sign-on flow if necessary.  It's also responsible for telling us
 *    which SSH_RELAY server we should talk to for the actual ssh read/write
 *    operations.
 *
 * 3. When the cookie server is done with its business it redirects to
 *    /html/google_relay.html#USER@RELAY_HOST.
 *
 *    The RELAY_HOST is the host that we should use as the socket relay.
 *    This allows the cookie server to choose a relay server from a
 *    pool of hosts.  This is *just* the host name, it's up to clients to
 *    know the uri scheme and port number.
 *
 *    The RELAY_HOST is expected to respond to requests for /proxy, /write,
 *    and /read.
 *
 * 4. We send a request to /proxy, which establishes the ssh session with
 *    a remote host.
 *
 * 5. We establish a hanging GET on /read.  If the read completes with a
 *    HTTP 200 OK then we consider the response entity as web-safe base 64
 *    encoded data.  If the read completes with an HTTP 401 GONE, we assume
 *    the relay has discarded the ssh session.  Any other responses are
 *    ignored.  The /read request is reestablished for anything other than
 *    401.
 *
 * 6. Writes are queued up and sent to /write.
 */

hterm.NaSSH.GoogleRelay = function(proxy) {
  this.proxy = proxy;
};

/**
 * The pattern for the cookie server's url.
 */
hterm.NaSSH.GoogleRelay.prototype.cookieServerPattern =
    'http://%(host):8022/cookie?ext=%encodeURIComponent(return_to)' +
    '&path=html/google_relay.html';

/**
 * The pattern for the relay server's url.
 *
 * We'll be appending 'proxy', 'read' and 'write' to this as necessary.
 */
hterm.NaSSH.GoogleRelay.prototype.relayServerPattern =
    'http://%(host):8023/';

hterm.NaSSH.GoogleRelay.prototype.requestRelayServer = function(destination) {
  // Save off our destination in session storage before we leave for the
  // proxy page.
  sessionStorage.setItem('googleRelayDestination', destination);
  var queryString = document.location.search;
  if (queryString.length < 2)
    queryString = '';
  sessionStorage.setItem('googleRelayQueryString', queryString);

  document.location = hterm.replaceVars(
      this.cookieServerPattern,
      { host: this.proxy,
        return_to:  document.location.host
      });
};

/**
 * Initialize this relay object.
 *
 * If we haven't just come back from the cookie server, then this function
 * will redirect to the cookie server and return false.
 *
 * If we have just come back from the cookie server, then we'll return true.
 */
hterm.NaSSH.GoogleRelay.prototype.init = function(username, hostname, port) {
  var destination = (username + '@' + hostname + ':' +
                     (port || 22) + '@' + this.proxy);

  // This session storage item comes from /html/google_relay.html.
  var relayHost = sessionStorage.getItem('googleRelayHost');
  if (relayHost) {
    var savedDestination = sessionStorage.getItem('googleRelayDestination');
    if (savedDestination == destination) {
      this.relayServer = hterm.replaceVars(this.relayServerPattern,
                                           {host: relayHost});
    } else {
      console.warn('Destination mismatch: ' + savedDestination + ' != ' +
                   destination);
    }
  }

  sessionStorage.removeItem('googleRelayServer');
  sessionStorage.removeItem('googleRelayDestination');

  if (this.relayServer)
    return true;

  this.requestRelayServer(destination);
  return false;
};

/**
 * Return an hterm.NaSSH.Stream object that will handle the socket stream
 * for this relay.
 */
hterm.NaSSH.GoogleRelay.prototype.openSocket = function(
    fd, host, port, onOpen) {
  return hterm.NaSSH.Stream.openStream(hterm.NaSSH.GoogleRelay.Socket,
            fd, {relay: this, host: host, port: port}, onOpen);
};

/**
 * XHR backed streams.
 *
 * This class manages the read and write XML http requests used to communicate
 * with the Google relay server.
 */
hterm.NaSSH.GoogleRelay.Socket = function(fd) {
  hterm.NaSSH.Stream.apply(this, [fd]);

  this.host_ = null;
  this.port_ = null;
  this.relay_ = null;

  this.writeSocket_ = new XMLHttpRequest();
  this.writeSocket_.onerror = this.onSocketError_.bind(this);
  this.writeSocket_.onreadystatechange = this.onWriteDone_.bind(this);
  this.writeQueue_ = [];

  this.writeCount_ = 0;

  this.readStream_ = new XMLHttpRequest();
  this.readStream_.onerror = this.onSocketError_.bind(this);
  this.readStream_.onreadystatechange = this.onReadReady_.bind(this);

  this.readCount_ = 0;
};

/**
 * We are a subclass of hterm.NaSSH.Stream.
 */
hterm.NaSSH.GoogleRelay.Socket.prototype = {
  __proto__: hterm.NaSSH.Stream.prototype
};

/**
 * Maximum length of message that can be sent to avoid request limits.
 */
hterm.NaSSH.GoogleRelay.Socket.prototype.maxMessageLength = 1024;

/**
 * Open a relay socket.
 *
 * This fires off the /proxy request, and if it succeeds starts the /read
 * hanging GET.
 */
hterm.NaSSH.GoogleRelay.Socket.prototype.asyncOpen_ = function(
    args, onComplete) {

  this.relay_ = args.relay;
  this.host_ = args.host;
  this.port_ = args.port;

  var self = this;
  var sessionRequest = new XMLHttpRequest();

  function onError() {
    console.log('Failed to get session id:', sessionRequest);
    onComplete(false);
  }

  function onReady() {
    if (sessionRequest.readyState != 4)
      return;

    if (sessionRequest.status != 200)
      return onError();

    self.sessionID_ = this.responseText;
    self.readStream_.open("GET", self.relay_.relayServer + "read?sid=" +
                          self.sessionID_ + "&rcnt=" + self.readCount_, true);
    self.readStream_.send();

    onComplete(true);
  }

  sessionRequest.open('GET', this.relay_.relayServer +
                      '/proxy?host=' + this.host_ + '&port=' + this.port_,
                      true);
  sessionRequest.withCredentials = true;  // We need to see cookies for /proxy.
  sessionRequest.onerror = onError;
  sessionRequest.onreadystatechange = onReady;
  sessionRequest.send();
}

/**
 * Queue up some data to write.
 *
 * This does not implement the onWrite callback.  Maybe it should, but at the
 * moment none of the callers care.
 */
hterm.NaSSH.GoogleRelay.Socket.prototype.asyncWrite = function(data, onWrite) {
  if (onWrite)
    throw 'Write callback not implemented.';

  if (!data.length)
    return;

  var needService = !this.writeQueue_.length;

  data = this.base64ToWebSafe_(data);
  while (data.length > this.maxMessageLength) {
    this.writeQueue_.push(data.substr(0, this.maxMessageLength));
    data = data.substr(this.maxMessageLength);
  }

  this.writeQueue_.push(data);

  if (needService)
    this.serviceWriteQueue_();
}

/**
 * Send the next pending write.
 */
hterm.NaSSH.GoogleRelay.Socket.prototype.serviceWriteQueue_ = function() {
  if (!this.writeQueue_.length)
    return;

  var msg = this.writeQueue_[0];
  this.writeSocket_.open("GET", this.relay_.relayServer +
                         "write?sid=" + this.sessionID_ +
                         "&wcnt=" + this.writeCount_ + "&data=" + msg, true);
  this.writeSocket_.send();
};

hterm.NaSSH.GoogleRelay.Socket.prototype.webSafeToBase64_ = function(s) {
  s = s.replace(/[-_]/g, function(ch) { return (ch == '-' ? '+' : '/'); });

  if (s.length % 4 == 2) {
    s = s + '==';
  } else if (s.length % 4 == 3) {
    s = s + '=';
  } else if (s.length % 4 != 0) {
    this.close();
    throw 'Invalid web safe base64 string length: ' + s.length;
  }
  return s;
}

hterm.NaSSH.GoogleRelay.Socket.prototype.base64ToWebSafe_ = function(s) {
  return s.replace(/[+/=]/g, function(ch) {
      if (ch == '+')
        return '-';
      if (ch == '/')
        return '_';
      return "";
  });
}

hterm.NaSSH.GoogleRelay.Socket.prototype.onReadReady_ = function(e) {
  if (this.readStream_.readyState != 4)
    return;

  if (this.readStream_.status == 200) {
    this.readCount_ += Math.floor(this.readStream_.responseText.length * 3 / 4);
    var data = this.webSafeToBase64_(this.readStream_.responseText);
    this.onDataAvailable(data);

  } else if (this.readStream_.status == 410) {
    // Session gone.
    this.close();
    return;
  }

  this.readStream_.open("GET", this.relay_.relayServer + "read?sid=" +
                        this.sessionID_ + "&rcnt=" + this.readCount_, true);
  this.readStream_.send();
};

hterm.NaSSH.GoogleRelay.Socket.prototype.onWriteDone_ = function(e) {
  if (this.writeSocket_.readyState != 4)
    return;

  if (this.writeSocket_.status == 410) {
    // Session gone.
    this.close();
    return;
  }

  if (this.writeSocket_.status == 200) {
    var lastCount = this.writeQueue_[0].length;
    this.writeQueue_.shift();
    this.writeCount_ += Math.floor(lastCount * 3 / 4);
  }

  if (this.writeQueue_.length)
    this.serviceWriteQueue_();
};

hterm.NaSSH.GoogleRelay.Socket.prototype.onSocketError_ = function(e) {
  this.close()
};
