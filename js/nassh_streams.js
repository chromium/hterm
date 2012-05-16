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
NaSSH.Stream = function(fd, path) {
  this.fd_ = fd;
  this.path = path;
  this.open = false;
};

/**
 * Errors we may raise.
 */
NaSSH.Stream.ERR_STREAM_CLOSED = 'Stream closed';
NaSSH.Stream.ERR_STREAM_OPENED = 'Stream opened';
NaSSH.Stream.ERR_FD_IN_USE = 'File descriptor in use';
NaSSH.Stream.ERR_NOT_IMPLEMENTED = 'Not implemented';

/**
 * Collection of currently open stream instances.
 */
NaSSH.Stream.openStreams_ = {};

/**
 * Look up a stream instance.
 */
NaSSH.Stream.getStreamByFd = function(fd) {
  return this.openStreams_[fd];
};

/**
 * Open a new stream of a given class.
 */
NaSSH.Stream.openStream = function(streamClass, fd, arg, onOpen) {
  if (fd in this.openStreams_)
    throw NaSSH.Stream.ERR_FD_IN_USE;

  var stream = new streamClass(fd, arg);
  var self = this;

  stream.asyncOpen_(arg, function(success) {
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
NaSSH.Stream.onClose_ = function(stream) {
  if (stream.open)
    throw NaSSH.Stream.ERR_STREAM_OPENED;

  delete this.openStreams_[stream.fd_];
};

/**
 * Open a stream, calling back when complete.
 */
NaSSH.Stream.prototype.asyncOpen_ = function(path, onOpen) {
  setTimeout(function() { onOpen(false)}, 0);
};

/**
 * Read from a stream, calling back with the result.
 */
NaSSH.Stream.prototype.asyncRead = function(size, onRead) {
  throw NaSSH.Stream.ERR_NOT_IMPLEMENTED;
};

/**
 * Read from a stream, calling back when complete.
 */
NaSSH.Stream.prototype.asyncWrite = function(data, onWrite) {
  if (onWrite)
    setTimeout(function() { onWrite(false)}, 0);
};

/**
 * Close a stream.
 */
NaSSH.Stream.prototype.close = function(reason) {
  if (!this.open)
    return;

  this.open = false;

  if (this.onClose)
    this.onClose(reason || 'closed');

  NaSSH.Stream.onClose_(this);
};

/**
 * The /dev/random stream.
 *
 * This special case stream just returns random bytes when read.
 */
NaSSH.Stream.Random = function(fd) {
  NaSSH.Stream.apply(this, [fd]);
};

NaSSH.Stream.Random.prototype = {
  __proto__: NaSSH.Stream.prototype
};

NaSSH.Stream.Random.prototype.asyncOpen_ = function(path, onOpen) {
  this.path = path;
  setTimeout(function() { onOpen(true)}, 0);
};

NaSSH.Stream.Random.prototype.asyncRead = function(size, onRead) {
  if (!this.open)
    throw NaSSH.Stream.ERR_STREAM_CLOSED;

  var bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  Array.prototype.map.apply(
      bytes, [function(el) { return String.fromCharCode(el) }]);

  var b64bytes = btoa(Array.prototype.join.apply(bytes, ['']));

  setTimeout(function() { onRead(b64bytes) }, 0);
};
