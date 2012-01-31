// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview: The NaCl plugin leans on its host to provide some basic
 * stream-like objects for /dev/random. The interface is likely to change
 * in the near future, so documentation in this file is a bit sparse.
 */

/**
 * Base class for streams required by the plugin.
 */
hterm.NaSSH.Stream = function(fd, path) {
  this.fd_ = fd;
  this.path = path;
  this.open = false;
};

/**
 * Errors we may raise.
 */
hterm.NaSSH.Stream.ERR_STREAM_CLOSED = 'Stream closed';
hterm.NaSSH.Stream.ERR_STREAM_OPENED = 'Stream opened';
hterm.NaSSH.Stream.ERR_FD_IN_USE = 'File descriptor in use';
hterm.NaSSH.Stream.ERR_NOT_IMPLEMENTED = 'Not implemented';

/**
 * Collection of currently open stream instances.
 */
hterm.NaSSH.Stream.openStreams_ = {};

/**
 * Look up a stream instance.
 */
hterm.NaSSH.Stream.getStreamByFd = function(fd) {
  return this.openStreams_[fd];
};

/**
 * Open a new stream of a given class.
 */
hterm.NaSSH.Stream.openStream = function(streamClass, fd, path, onOpen) {
  if (fd in this.openStreams_)
    throw hterm.NaSSH.Stream.ERR_FD_IN_USE;

  var stream = new streamClass(fd, path);
  var self = this;

  stream.asyncOpen_(path, function(success) {
      if (success) {
        self.openStreams_[fd] = stream;
        stream.open = true;
      }

      onOpen(success);
    });

  return stream;
};

/**
 * Clean up after a stream is closed.
 */
hterm.NaSSH.Stream.onClose_ = function(stream) {
  if (stream.open)
    throw hterm.NaSSH.Stream.ERR_STREAM_OPENED;

  delete this.openStreams_[stream.fd_];
};

/**
 * Open a stream, calling back when complete.
 */
hterm.NaSSH.Stream.prototype.asyncOpen_ = function(path, onOpen) {
  setTimeout(function() { onOpen(false)}, 0);
};

/**
 * Read from a stream, calling back with the result.
 */
hterm.NaSSH.Stream.prototype.asyncRead = function(size, onRead) {
  throw hterm.NaSSH.Stream.ERR_NOT_IMPLEMENTED;
};

/**
 * Read from a stream, calling back when complete.
 */
hterm.NaSSH.Stream.prototype.asyncWrite = function(data, onWrite) {
  if (onWrite)
    setTimeout(function() { onWrite(false)}, 0);
};

/**
 * Close a stream.
 */
hterm.NaSSH.Stream.prototype.close = function(reason) {
  this.open = false;

  if (this.onClose)
    this.onClose(reason || 'closed');

  hterm.NaSSH.Stream.onClose_(this);
};

/**
 * The /dev/random stream.
 *
 * This special case stream just returns random bytes when read.
 */
hterm.NaSSH.Stream.Random = function(fd) {
  hterm.NaSSH.Stream.apply(this, [fd]);
};

hterm.NaSSH.Stream.Random.prototype = {
  __proto__: hterm.NaSSH.Stream.prototype
};

hterm.NaSSH.Stream.Random.prototype.asyncOpen_ = function(path, onOpen) {
  this.path = path;
  setTimeout(function() { onOpen(true)}, 0);
};

hterm.NaSSH.Stream.Random.prototype.asyncRead = function(size, onRead) {
  if (!this.open)
    throw hterm.NaSSH.Stream.ERR_STREAM_CLOSED;

  var bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  Array.prototype.map.apply(
      bytes, [function(el) { return String.fromCharCode(el) }]);

  var b64bytes = btoa(Array.prototype.join.apply(bytes, ['']));

  setTimeout(function() { onRead(b64bytes) }, 0);
};

/**
 * XHR backed streams.
 */
hterm.NaSSH.Stream.XHRSocket = function(fd) {
  hterm.NaSSH.Stream.apply(this, [fd]);
};

hterm.NaSSH.Stream.XHRSocket.prototype = {
  __proto__: hterm.NaSSH.Stream.prototype
};

/**
 * Maximum length of message that can be sent to avoid request limits.
 */
hterm.NaSSH.Stream.XHRSocket.prototype.maxMessage = 1024;

hterm.NaSSH.Stream.XHRSocket.prototype.asyncOpen_ = function(args, onOpen) {
  this.id_ = args.id;
  this.relay_ = args.relay;

  // Write steam.
  this.wcnt_ = 0;
  this.ws_ = new XMLHttpRequest();
  this.ws_.onerror = this.onSocketError_.bind(this);
  this.ws_.onreadystatechange = this.onWriteReady_.bind(this);
  this.ws_.queue_ = [];
  this.sent_ = 0;

  // Read stream.
  this.rcnt_ = 0;
  this.rs_ = new XMLHttpRequest();
  this.rs_.onerror = this.onSocketError_.bind(this);
  this.rs_.onreadystatechange = this.onReadReady_.bind(this);
  this.rs_.open("GET", "http://" + this.relay_ + "/read?sid=" +
      this.id_ + "&rcnt=" + this.rcnt_, true);
  this.rs_.send();

  onOpen(true);
}

hterm.NaSSH.Stream.XHRSocket.prototype.asyncRead = function(size, onRead) {
  // Do nothing we will push data.
};

hterm.NaSSH.Stream.XHRSocket.prototype.asyncWrite = function(data, onWrite) {
  if (data.length)
    this.ws_.queue_.push(this.base64ToWebSafe_(data));

  if (this.sent_ == 0 && this.ws_.queue_.length) {
    var msg = this.ws_.queue_[0];
    if (msg.length > this.maxMessage) {
      msg = msg.substr(0, this.maxMessage);
    }
    this.sent_ = msg.length;
    this.ws_.open("GET", "http://" + this.relay_ + "/write?sid=" +
        this.id_ + "&wcnt=" + this.wcnt_ + "&data=" + msg, true);
    this.ws_.send();
  }

  if (onWrite)
    setTimeout(onWrite, 0);
};

hterm.NaSSH.Stream.XHRSocket.prototype.close = function() {
  hterm.NaSSH.Stream.prototype.close.apply(this, [null]);
};

hterm.NaSSH.Stream.XHRSocket.prototype.onDataAvailable = function(data) { };

hterm.NaSSH.Stream.XHRSocket.prototype.webSafeToBase64_ = function(s) {
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

hterm.NaSSH.Stream.XHRSocket.prototype.base64ToWebSafe_ = function(s) {
  s = s.replace(/[+/=]/g,
      function(ch) { return (ch == '+' ? '-' : (ch == '/' ? '_' : "")); });
  return s;
}

hterm.NaSSH.Stream.XHRSocket.prototype.onReadReady_ = function(e) {
  if (this.rs_.readyState == 4) {
    if (this.rs_.status == 200) {
      this.rcnt_ += Math.floor(this.rs_.responseText.length * 3 / 4);
      var data = this.webSafeToBase64_(this.rs_.responseText);
      this.onDataAvailable(data);
    }

    if (this.rs_.status == 410) { // session gone
      this.close();
      return;
    }

    this.rs_.open("GET", "http://" + this.relay_ + "/read?sid=" +
        this.id_ + "&rcnt=" + this.rcnt_, true);
    this.rs_.send();
  }
};

hterm.NaSSH.Stream.XHRSocket.prototype.onWriteReady_ = function(e) {
  if (this.ws_.readyState == 4) {
    if (this.ws_.status == 200) {
      if (this.sent_ == this.ws_.queue_[0].length) {
        this.ws_.queue_.shift();
      } else {
        this.ws_.queue_[0] = this.ws_.queue_[0].substr(this.sent_);
      }
      this.wcnt_ += Math.floor(this.sent_ * 3 / 4);
      this.sent_ = 0;
    }

    if (this.ws_.status == 410) { // session gone
      this.close();
      return;
    }

    this.asyncWrite('', null);
  }
};

hterm.NaSSH.Stream.XHRSocket.prototype.onSocketError_ = function(e) {
  this.close()
};
