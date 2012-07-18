// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('lib.f');

/**
 * This file contains the support required to make connections to Google's
 * HTTP-to-SSH relay.
 *
 * See Also: nassh_stream_google_relay.js, which defines the hterm stream class
 * for this relay mechanism.
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

nassh.GoogleRelay = function(io, proxy, options) {
  this.io = io;
  this.proxy = proxy;
  this.useSecure = options.search('--use-ssl') != -1;
  this.useWebsocket = !(options.search('--use-xhr') != -1);
  this.relayServer = null;
  this.relayServerSocket = null;
};

/**
 * The pattern for the cookie server's url.
 */
nassh.GoogleRelay.prototype.cookieServerPattern =
    '%(protocol)://%(host):8022/cookie?ext=%encodeURIComponent(return_to)' +
    '&path=html/nassh_google_relay.html';

/**
 * The pattern for XHR relay server's url.
 *
 * We'll be appending 'proxy', 'read' and 'write' to this as necessary.
 */
nassh.GoogleRelay.prototype.relayServerPattern =
    '%(protocol)://%(host):8023/';

/**
 * The pattern for WebSocket relay server's url.
 */
nassh.GoogleRelay.prototype.relayServerSocketPattern =
    '%(protocol)://%(host):8022/';

nassh.GoogleRelay.prototype.redirect = function(opt_resumePath) {
  var resumePath = opt_resumePath ||
      document.location.href.substr(document.location.origin.length);

  // Save off our destination in session storage before we leave for the
  // proxy page.
  sessionStorage.setItem('googleRelay.resumePath', resumePath);

  document.location = lib.f.replaceVars(
      this.cookieServerPattern,
      { host: this.proxy,
        protocol: this.useSecure ? 'https' : 'http',
        // This returns us to nassh_google_relay.html so we can pick the relay
        // host out of the reply.  From there we continue on to the resumePath.
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
nassh.GoogleRelay.prototype.init = function(opt_resumePath) {
  var resumePath = opt_resumePath ||
      document.location.href.substr(document.location.origin.length);

  // This session storage item is created by /html/nassh_google_relay.html
  // if we succeed at finding a relay host.
  var relayHost = sessionStorage.getItem('googleRelay.relayHost');
  if (relayHost) {
    var expectedResumePath =
        sessionStorage.getItem('googleRelay.resumePath');
    if (expectedResumePath == resumePath) {
      var protocol = this.useSecure ? 'https' : 'http';
      var pattern = this.useWebsocket ? this.relayServerSocketPattern :
                                        this.relayServerPattern;
      this.relayServer = lib.f.replaceVars(pattern,
          {host: relayHost, protocol: protocol});
      if (this.useWebsocket) {
        protocol = this.useSecure ? 'wss' : 'ws';
        this.relayServerSocket = lib.f.replaceVars(pattern,
            {host: relayHost, protocol: protocol});
      }
    } else {
      // If everything is ok, this should be the second time we've been asked
      // to do the same init.  (The first time would have redirected.)  If this
      // init specifies a different resumePath, then something is probably
      // wrong.
      console.warn('Destination mismatch: ' + expectedResumePath + ' != ' +
                   resumePath);
      this.relayServer = null;
    }
  }

  sessionStorage.removeItem('googleRelay.relayHost');
  sessionStorage.removeItem('googleRelay.resumePath');

  if (this.relayServer)
    return true;

  return false;
};

/**
 * Return an nassh.Stream object that will handle the socket stream
 * for this relay.
 */
nassh.GoogleRelay.prototype.openSocket = function(fd, host, port, onOpen) {
  var streamClass = this.useWebsocket ? nassh.Stream.GoogleRelayWS :
                                        nassh.Stream.GoogleRelayXHR;
  return nassh.Stream.openStream(streamClass,
      fd, {relay: this, host: host, port: port}, onOpen);
};
