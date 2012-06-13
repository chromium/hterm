// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * XHR backed streams.
 *
 * This class manages the read and write XML http requests used to communicate
 * with the Google relay server.
 */
nassh.Stream.GoogleRelay = function(fd) {
  nassh.Stream.apply(this, [fd]);

  this.host_ = null;
  this.port_ = null;
  this.relay_ = null;

  this.backoffMS_ = 0;
  this.backoffTimeout_ = null;

  this.writeRequest_ = new XMLHttpRequest();
  this.writeRequest_.ontimeout = this.writeRequest_.onabort =
      this.writeRequest_.onerror = this.onRequestError_.bind(this);
  this.writeRequest_.onloadend = this.onWriteDone_.bind(this);
  this.writeQueue_ = [];

  this.writeCount_ = 0;

  this.readRequest_ = new XMLHttpRequest();
  this.readRequest_.ontimeout = this.readRequest_.onabort =
      this.readRequest_.onerror = this.onRequestError_.bind(this);
  this.readRequest_.onloadend = this.onReadReady_.bind(this);

  this.readCount_ = 0;
};

/**
 * We are a subclass of nassh.Stream.
 */
nassh.Stream.GoogleRelay.prototype = {
  __proto__: nassh.Stream.prototype
};

/**
 * Maximum length of message that can be sent to avoid request limits.
 */
nassh.Stream.GoogleRelay.prototype.maxMessageLength = 1024;

/**
 * Open a relay socket.
 *
 * This fires off the /proxy request, and if it succeeds starts the /read
 * hanging GET.
 */
nassh.Stream.GoogleRelay.prototype.asyncOpen_ = function(
    args, onComplete) {

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
  if (this.isRequestBusy_(this.readRequest_))
    return;

  if (this.backoffTimeout_) {
    console.warn('Attempt to read while backing off.');
    return;
  }

  this.readRequest_.open('GET', this.relay_.relayServer + 'read?sid=' +
                         this.sessionID_ + '&rcnt=' + this.readCount_, true);
  this.readRequest_.send();
};

/**
 * Queue up some data to write.
 */
nassh.Stream.GoogleRelay.prototype.asyncWrite = function(
    data, onSuccess) {
  if (!data.length)
    return;

  var needService = (!this.backoffTimeout_ && !this.writeQueue_.length);

  data = this.base64ToWebSafe_(data);
  while (data.length > this.maxMessageLength) {
    this.writeQueue_.push({data: data.substr(0, this.maxMessageLength),
                           onSuccess: onSuccess});
    data = data.substr(this.maxMessageLength);
  }

  this.writeQueue_.push({data: data, onSuccess: onSuccess});

  if (needService)
    this.serviceWriteQueue_();
};

/**
 * Returns true if the given XHR is busy.
 */
nassh.Stream.GoogleRelay.prototype.isRequestBusy_ = function(r) {
  return (r.readyState != XMLHttpRequest.DONE &&
          r.readyState != XMLHttpRequest.UNSENT);
};

/**
 * Send the next pending write.
 */
nassh.Stream.GoogleRelay.prototype.serviceWriteQueue_ = function() {
  if (!this.writeQueue_.length || this.isRequestBusy_(this.writeRequest_)) {
    // Nothing to write, or a write is in progress.
    return;
  }

  if (this.backoffTimeout_) {
    console.warn('Attempt to write while backing off.');
    return;
  }

  var data = this.writeQueue_[0].data;
  this.writeRequest_.open('GET', this.relay_.relayServer +
                          'write?sid=' + this.sessionID_ +
                          '&wcnt=' + this.writeCount_ + '&data=' + data, true);
  this.writeRequest_.send();
};

nassh.Stream.GoogleRelay.prototype.webSafeToBase64_ = function(s) {
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

nassh.Stream.GoogleRelay.prototype.base64ToWebSafe_ = function(s) {
  return s.replace(/[+/=]/g, function(ch) {
      if (ch == '+')
        return '-';
      if (ch == '/')
        return '_';
      return '';
  });
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
 * Called when the readRequest_ has finished loading.
 *
 * This indicates that the response entity has the data for us to send to the
 * terminal.
 */
nassh.Stream.GoogleRelay.prototype.onReadReady_ = function(e) {
  if (this.readRequest_.readyState != XMLHttpRequest.DONE)
    return;

  if (this.readRequest_.status == 410) {
    // HTTP 410 Gone indicates that the relay has dropped our ssh session.
    this.close();
    return;
  }

  if (this.readRequest_.status != 200)
    return this.onRequestError_(e);

  this.readCount_ += Math.floor(
      this.readRequest_.responseText.length * 3 / 4);
  var data = this.webSafeToBase64_(this.readRequest_.responseText);
  this.onDataAvailable(data);

  this.onRequestSuccess_(this.readRequest_);
};

/**
 * Called when the writeRequest_ has finished loading.
 *
 * This indicates that data we wrote has either been successfully written, or
 * failed somewhere along the way.
 */
nassh.Stream.GoogleRelay.prototype.onWriteDone_ = function(e) {
  if (this.writeRequest_.readyState != XMLHttpRequest.DONE)
    return;

  if (this.writeRequest_.status == 410) {
    // HTTP 410 Gone indicates that the relay has dropped our ssh session.
    this.close();
    return;
  }

  if (this.writeRequest_.status != 200)
    return this.onRequestError_(e);

  var lastWrite = this.writeQueue_.shift();

  this.writeCount_ += Math.floor(lastWrite.data.length * 3 / 4);

  this.onRequestSuccess_(this.writeRequest_);

  if (typeof lastWrite.onSuccess == 'function')
    lastWrite.onSuccess(this.writeCount_);
};

/**
 * Called after a successful read or write to indicate that communication
 * is working as expected.
 */
nassh.Stream.GoogleRelay.prototype.onRequestSuccess_ = function(
    request) {
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
    if (request == this.readRequest_) {
      this.resumeRead_();
    } else {
      this.serviceWriteQueue_();
    }
  }
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
  this.serviceWriteQueue_();
};

nassh.Stream.GoogleRelay.prototype.onRequestError_ = function(e) {
  if (this.backoffTimeout_)
    return;

  var retryFunction;

  if (!this.backoffMS_) {
    this.backoffMS_ = 1;
  } else {
    this.backoffMS_ = this.backoffMS_ * 2 + 93;  // Exponential backoff.
  }

  var requestType = (e.target == this.readRequest_) ? 'read' : 'write';
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
