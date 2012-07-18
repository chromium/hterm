// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Base class of XHR or WebSocket backed streams.
 *
 * This class implements session initialization and back-off logic common for
 * both types of streams.
 */
nassh.Stream.GoogleRelay = function(fd) {
  nassh.Stream.apply(this, [fd]);

  this.host_ = null;
  this.port_ = null;
  this.relay_ = null;

  this.sessionID_ = null;

  this.backoffMS_ = 0;
  this.backoffTimeout_ = null;

  this.writeBuffer_ = '';
  this.writeCount_ = 0;
  this.onWriteSuccess_ = null;

  this.readCount_ = 0;
};

/**
 * We are a subclass of nassh.Stream.
 */
nassh.Stream.GoogleRelay.prototype = {
  __proto__: nassh.Stream.prototype
};

/**
 * Open a relay socket.
 *
 * This fires off the /proxy request, and if it succeeds starts the /read
 * hanging GET.
 */
nassh.Stream.GoogleRelay.prototype.asyncOpen_ = function(args, onComplete) {
  this.relay_ = args.relay;
  this.host_ = args.host;
  this.port_ = args.port;

  var self = this;
  var sessionRequest = new XMLHttpRequest();

  function onError() {
    console.error('Failed to get session id:', sessionRequest);
    onComplete(false);
  }

  function onReady() {
    if (sessionRequest.readyState != XMLHttpRequest.DONE)
      return;

    if (sessionRequest.status != 200)
      return onError();

    self.sessionID_ = this.responseText;
    self.resumeRead_();
    onComplete(true);
  }

  sessionRequest.open('GET', this.relay_.relayServer +
                      'proxy?host=' + this.host_ + '&port=' + this.port_,
                      true);
  sessionRequest.withCredentials = true;  // We need to see cookies for /proxy.
  sessionRequest.onabort = sessionRequest.ontimeout =
      sessionRequest.onerror = onError;
  sessionRequest.onloadend = onReady;
  sessionRequest.send();
};

nassh.Stream.GoogleRelay.prototype.resumeRead_ = function() {
  throw nassh.Stream.ERR_NOT_IMPLEMENTED;
};

/**
 * Queue up some data to write.
 */
nassh.Stream.GoogleRelay.prototype.asyncWrite = function(data, onSuccess) {
  if (!data.length)
    return;

  this.writeBuffer_ = this.writeBuffer_ + atob(data);
  this.onWriteSuccess_ = onSuccess;

  if (!this.backoffTimeout_)
    this.sendWrite_();
};

/**
 * Send the next pending write.
 */
nassh.Stream.GoogleRelay.prototype.sendWrite_ = function() {
  throw nassh.Stream.ERR_NOT_IMPLEMENTED;
};

/**
 * The asyncRead method is a no-op for this class.
 *
 * Instead we push data to the client using the onDataAvailable event.
 */
nassh.Stream.GoogleRelay.prototype.asyncRead = function(size, onRead) {
  setTimeout(function() { onRead('') }, 0);
};

/**
 * Indicates that the backoff timer has expired and we can try again.
 *
 * This does not guarantee that communications have been restored, only
 * that we can try again.
 */
nassh.Stream.GoogleRelay.prototype.onBackoffExpired_ = function() {
  this.backoffTimeout_ = null;
  this.resumeRead_();
  this.sendWrite_();
};

/**
 * Called after a successful read or write to indicate that communication
 * is working as expected.
 */
nassh.Stream.GoogleRelay.prototype.requestSuccess_ = function(isRead) {
  this.backoffMS_ = 0;

  if (this.backoffTimeout_) {
    // Sometimes we end up clearing the backoff before the timeout actually
    // expires.  This is the case if a read and write request are in progress
    // and one fails while the other succeeds.  If the success completes *after*
    // the failure, we end up here.
    //
    // We assume we're free to clear the backoff and continue as normal.
    clearTimeout(this.backoffTimeout_);
    this.onBackoffExpired_();
  } else {
    if (isRead) {
      this.resumeRead_();
    } else {
      this.sendWrite_();
    }
  }
};

nassh.Stream.GoogleRelay.prototype.requestError_ = function(isRead) {
  if (!this.sessionID_ || this.backoffTimeout_)
    return;

  if (!this.backoffMS_) {
    this.backoffMS_ = 1;
  } else {
    this.backoffMS_ = this.backoffMS_ * 2 + 93;  // Exponential backoff.
  }

  var requestType = isRead ? 'read' : 'write';
  console.log('Error during ' + requestType +
              ', backing off: ' + this.backoffMS_ + 'ms');

  if (this.backoffMS_ >= 1000) {
    // Browser timeouts tend to have a wide margin for error.  We want to reduce
    // the risk that a failed retry will redisplay this message just as its
    // fading away.  So we show the retry message for a little longer than we
    // expect to back off.
    this.relay_.io.showOverlay(hterm.msg('RELAY_RETRY'), this.backoffMS_ + 500);
  }

  this.backoffTimeout_ =
      setTimeout(this.onBackoffExpired_.bind(this), this.backoffMS_);
};

/**
 * XHR backed stream.
 *
 * This class manages the read and write XML http requests used to communicate
 * with the Google relay server.
 */
nassh.Stream.GoogleRelayXHR = function(fd) {
  nassh.Stream.GoogleRelay.apply(this, [fd]);

  this.writeRequest_ = new XMLHttpRequest();
  this.writeRequest_.ontimeout = this.writeRequest_.onabort =
      this.writeRequest_.onerror = this.onRequestError_.bind(this);
  this.writeRequest_.onloadend = this.onWriteDone_.bind(this);

  this.readRequest_ = new XMLHttpRequest();
  this.readRequest_.ontimeout = this.readRequest_.onabort =
      this.readRequest_.onerror = this.onRequestError_.bind(this);
  this.readRequest_.onloadend = this.onReadReady_.bind(this);

  this.lastWriteSize_ = 0;
};

/**
 * We are a subclass of nassh.Stream.GoogleRelay.
 */
nassh.Stream.GoogleRelayXHR.prototype = {
  __proto__: nassh.Stream.GoogleRelay.prototype
};

/**
 * Maximum length of message that can be sent to avoid request limits.
 */
nassh.Stream.GoogleRelayXHR.prototype.maxMessageLength = 1024;

nassh.Stream.GoogleRelayXHR.prototype.resumeRead_ = function() {
  if (this.isRequestBusy_(this.readRequest_)) {
    // Read request is in progress.
    return;
  }

  if (this.backoffTimeout_) {
    console.warn('Attempt to read while backing off.');
    return;
  }

  this.readRequest_.open('GET', this.relay_.relayServer + 'read?sid=' +
                         this.sessionID_ + '&rcnt=' + this.readCount_, true);
  this.readRequest_.send();
};

/**
 * Send the next pending write.
 */
nassh.Stream.GoogleRelayXHR.prototype.sendWrite_ = function() {
  if (!this.writeBuffer_.length || this.isRequestBusy_(this.writeRequest_)) {
    // Nothing to write, or a write is in progress.
    return;
  }

  if (this.backoffTimeout_) {
    console.warn('Attempt to write while backing off.');
    return;
  }

  var size = Math.min(this.writeBuffer_.length, this.maxMessageLength);
  var data = this.writeBuffer_.substr(0, size);
  data = this.base64ToWebSafe_(btoa(data));
  this.writeRequest_.open('GET', this.relay_.relayServer +
                          'write?sid=' + this.sessionID_ +
                          '&wcnt=' + this.writeCount_ + '&data=' + data, true);
  this.writeRequest_.send();
  this.lastWriteSize_ = size;
};

/**
 * Called when the readRequest_ has finished loading.
 *
 * This indicates that the response entity has the data for us to send to the
 * terminal.
 */
nassh.Stream.GoogleRelayXHR.prototype.onReadReady_ = function(e) {
  if (this.readRequest_.readyState != XMLHttpRequest.DONE)
    return;

  if (this.readRequest_.status == 410) {
    // HTTP 410 Gone indicates that the relay has dropped our ssh session.
    this.close();
    this.sessionID_ = null;
    return;
  }

  if (this.readRequest_.status != 200)
    return this.onRequestError_(e);

  this.readCount_ += Math.floor(
      this.readRequest_.responseText.length * 3 / 4);
  var data = this.webSafeToBase64_(this.readRequest_.responseText);
  this.onDataAvailable(data);

  this.requestSuccess_(true);
};

/**
 * Called when the writeRequest_ has finished loading.
 *
 * This indicates that data we wrote has either been successfully written, or
 * failed somewhere along the way.
 */
nassh.Stream.GoogleRelayXHR.prototype.onWriteDone_ = function(e) {
  if (this.writeRequest_.readyState != XMLHttpRequest.DONE)
    return;

  if (this.writeRequest_.status == 410) {
    // HTTP 410 Gone indicates that the relay has dropped our ssh session.
    this.close();
    return;
  }

  if (this.writeRequest_.status != 200)
    return this.onRequestError_(e);

  this.writeBuffer_ = this.writeBuffer_.substr(this.lastWriteSize_);
  this.writeCount_ += this.lastWriteSize_;

  this.requestSuccess_(false);

  if (typeof this.onWriteSuccess_ == 'function')
    this.onWriteSuccess_(this.writeCount_);
};

nassh.Stream.GoogleRelayXHR.prototype.onRequestError_ = function(e) {
  this.requestError_(e.target == this.readRequest_);
}

/**
 * Returns true if the given XHR is busy.
 */
nassh.Stream.GoogleRelayXHR.prototype.isRequestBusy_ = function(r) {
  return (r.readyState != XMLHttpRequest.DONE &&
          r.readyState != XMLHttpRequest.UNSENT);
};

nassh.Stream.GoogleRelayXHR.prototype.webSafeToBase64_ = function(s) {
  s = s.replace(/[-_]/g, function(ch) { return (ch == '-' ? '+' : '/'); });

  var mod4 = s.length % 4;

  if (mod4 == 2) {
    s = s + '==';
  } else if (mod4 == 3) {
    s = s + '=';
  } else if (mod4 != 0) {
    this.close();
    throw 'Invalid web safe base64 string length: ' + s.length;
  }

  return s;
};

nassh.Stream.GoogleRelayXHR.prototype.base64ToWebSafe_ = function(s) {
  return s.replace(/[+/=]/g, function(ch) {
      if (ch == '+')
        return '-';
      if (ch == '/')
        return '_';
      return '';
  });
};

/**
 * WebSocket backed stream.
 *
 * This class manages the read and write through WebSocket to communicate
 * with the Google relay server.
 */
nassh.Stream.GoogleRelayWS = function(fd) {
  nassh.Stream.GoogleRelay.apply(this, [fd]);

  this.socket_ = null;

  // Amount of data in buffer that were sent but not acknowledged yet.
  this.sentCount_ = 0;
};

/**
 * We are a subclass of nassh.Stream.GoogleRelay.
 */
nassh.Stream.GoogleRelayWS.prototype = {
  __proto__: nassh.Stream.GoogleRelay.prototype
};

/**
 * Maximum length of message that can be sent to avoid request limits.
 * -4 for 32-bit ack that is sent before payload.
 */
nassh.Stream.GoogleRelayWS.prototype.maxMessageLength = 32 * 1024 - 4;

nassh.Stream.GoogleRelayWS.prototype.resumeRead_ = function() {
  if (this.backoffTimeout_) {
    console.warn('Attempt to read while backing off.');
    return;
  }

  if (this.sessionID_ && !this.socket_) {
    this.socket_ = new WebSocket(this.relay_.relayServerSocket +
        'connect?sid=' + this.sessionID_ +
        '&ack=' + (this.readCount_ & 0xffffff) +
        '&pos=' + (this.writeCount_ & 0xffffff));
    this.socket_.binaryType = 'arraybuffer';
    this.socket_.onopen = this.onSocketOpen_.bind(this);
    this.socket_.onmessage = this.onSocketData_.bind(this);
    this.socket_.onclose = this.socket_.onerror =
        this.onSocketError_.bind(this);

    this.sentCount_ = 0;
  }
};

nassh.Stream.GoogleRelayWS.prototype.onSocketOpen_ = function(e) {
  if (e.target !== this.socket_)
    return;

  this.requestSuccess_(false);
};

nassh.Stream.GoogleRelayWS.prototype.onSocketData_ = function(e) {
  if (e.target !== this.socket_)
    return;

  var u8 = new Uint8Array(e.data);
  var ack = (u8[0] << 24) |
            (u8[1] << 16) |
            (u8[2] <<  8) |
            (u8[3] <<  0);

  // Acks are unsigned 24 bits. Negative means error.
  if (ack < 0) {
    this.close();
    this.sessionID_ = null;
    return;
  }

  // Unsigned 24 bits wrap-around delta.
  var delta = ((ack & 0xffffff) - (this.writeCount_ & 0xffffff)) & 0xffffff;
  this.writeBuffer_ = this.writeBuffer_.substr(delta);
  this.sentCount_ -= delta;
  this.writeCount_ += delta;

  // TODO: use Uint8Array throughout rather than copy.
  var data = '';
  for (var i = 4; i < u8.length; ++i)
    data = data + String.fromCharCode(u8[i]);
  if (data.length)
    this.onDataAvailable(btoa(data));
  this.readCount_ += (u8.length - 4);

  // isRead == false since for WebSocket we don't need to send another read
  // request, we will get new data as soon as it comes.
  this.requestSuccess_(false);
};

nassh.Stream.GoogleRelayWS.prototype.onSocketError_ = function(e) {
  if (e.target !== this.socket_)
    return;

  this.socket_ = null;
  this.requestError_(true);
};

nassh.Stream.GoogleRelayWS.prototype.sendWrite_ = function() {
  if (!this.socket_ || this.socket_.readyState != 1 ||
      this.sentCount_ == this.writeBuffer_.length) {
    // Nothing to write or socket is not ready.
    return;
  }

  if (this.backoffTimeout_) {
    console.warn('Attempt to write while backing off.');
    return;
  }

  var size = Math.min(this.maxMessageLength,
                      this.writeBuffer_.length - this.sentCount_);
  var buf = new ArrayBuffer(size + 4);
  var u8 = new Uint8Array(buf);

  // Every ws.send() maps to a Websocket frame on wire.
  // Use first 4 bytes to send ack.
  u8[0] = (((this.readCount_ & 0xffffff) >> 24) & 255);
  u8[1] = (((this.readCount_ & 0xffffff) >> 16) & 255);
  u8[2] = (((this.readCount_ & 0xffffff) >>  8) & 255);
  u8[3] = (((this.readCount_ & 0xffffff) >>  0) & 255);

  for (var i = 0; i < size; ++i)
    u8[i + 4] = this.writeBuffer_.charCodeAt(this.sentCount_ + i);

  u8 = null;
  this.socket_.send(buf);
  this.sentCount_ += size;

  if (typeof this.onWriteSuccess_ == 'function') {
    // Notify nassh that we are ready to consume more data.
    this.onWriteSuccess_(this.writeCount_ + this.sentCount_);
  }

  if (this.sentCount_ < this.writeBuffer_.length) {
    // We have more data to send but due to message limit we didn't send it.
    // We don't know when data was sent so just send new portion async.
    setTimeout(this.sendWrite_.bind(this), 0);
  }
};
