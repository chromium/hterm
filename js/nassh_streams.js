// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview: The NaCl plugin leans on its host to provide some basic
 * stream-like objects for persistent file access and sockets.  The interface
 * is likely to change in the near future, so documentation in this file is
 * a bit sparse.
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
 * File stream backed by the HTML5 filesystem.
 */
hterm.NaSSH.Stream.File = function(fd) {
  hterm.NaSSH.Stream.apply(this, [fd]);

  this.fileEntry_ = null;

  if (!('filesystem_' in hterm.NaSSH.Stream.File))
    hterm.NaSSH.Stream.File.getFileSystem_();
};

hterm.NaSSH.Stream.File.prototype = {
  __proto__: hterm.NaSSH.Stream.prototype
};

hterm.NaSSH.Stream.File.pendingOpens_ = [];

/**
 * Get a reference to our HTML5 persistent filesystem.
 */
hterm.NaSSH.Stream.File.getFileSystem_ = function() {
  var self = this;

  function onFileSystemFound(fs) {
    self.filesystem_ = fs;
    for (var i = 0; i < self.pendingOpens_.length; i++) {
      self.pendingOpens_[i](fs);
    }
  }

  function onFileSystemError(err) {
    console.log('Error opening filesystem: ' + err);

    self.filesystem_ = null;
    for (var i = 0; i < self.pendingOpens_.length; i++) {
      self.pendingOpens_(null);
    }
  }

  var requestFileSystem = (window.requestFileSystem ||
                           window.webkitRequestFileSystem);
  requestFileSystem(window.PERSISTENT, 1024 * 1024,
                    onFileSystemFound,
                    onFileSystemError);
};

hterm.NaSSH.Stream.File.prototype.asyncOpen_ = function(path, onOpen) {
  this.path = path;

  var self = this;

  if (!('filesystem_' in hterm.NaSSH.Stream.File)) {
    // We haven't gotten the filesystem yet, add ourselves to the list of
    // pending opens.
    hterm.NaSSH.Stream.File.pendingOpens_.push(function(filesystem) {
        if (!filesystem) {
          // Failed to get the filesystem, we can't possibly open the file.
          onOpen(false);
          return;
        }

        // Now that we have the filesystem, try again to open the file.
        self.asyncOpen_(path, onOpen);
      });

    return;
  }

  function onFileFound(fileEntry) {
    self.fileEntry_ = fileEntry;
    onOpen(true);
  }

  function onFileError(err) {
    console.log('Error opening file: ' + err);
    onOpen(false);
  }

  hterm.getOrCreateFile(hterm.NaSSH.Stream.File.filesystem_.root,
                        path,
                        onFileFound, onFileError);
};

hterm.NaSSH.Stream.File.prototype.asyncWrite = function(b64bytes, onWrite) {
  var BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder;
  this.fileEntry_.createWriter(function(fileWriter) {
      var bb = new BlobBuilder();
      bb.append(atob(b64bytes));
      fileWriter.seek(fileWriter.length);
      fileWriter.write(bb.getBlob());
      if (onWrite)
        onWrite(true);
    });
};

/**
 * TODO(rginda): The sample NaCl-ssh code I copied this from ignored the size
 * parameter, so I did here too.
 */
hterm.NaSSH.Stream.File.prototype.asyncRead = function(size, onRead) {
  var reader = new FileReader();

  reader.onload = function() {
    onRead(btoa(this.result));
  };

  reader.onerror = function(err) {
    console.log('Error reading file: ' + err);
    onRead(null);
  };

  this.fileEntry_.file(function(file) { reader.readAsBinaryString(file) });
};

/**
 * WebSocket backed streams.
 */
hterm.NaSSH.Stream.Socket = function(fd) {
  hterm.NaSSH.Stream.apply(this, [fd]);
};

hterm.NaSSH.Stream.Socket.prototype = {
  __proto__: hterm.NaSSH.Stream.prototype
};

hterm.NaSSH.Stream.Socket.prototype.asyncOpen_ = function(path, onOpen) {
  this.path = path;

  this.webSocket_ = new WebSocket(path);
  this.webSocket_.onopen = function() {
    onOpen(true);
  };

  this.webSocket_.onmessage = this.onWebSocketMessage_.bind(this);
  this.webSocket_.onerror = this.onWebSocketError_.bind(this);
}

hterm.NaSSH.Stream.Socket.prototype.asyncWrite = function(data, onWrite) {
  this.webSocket_.send(data);
  if (onWrite)
    setTimeout(onWrite, 0);
};

hterm.NaSSH.Stream.Socket.prototype.close = function() {
  this.webSocket_.close();
  hterm.NaSSH.Stream.prototype.close.apply(this, [null]);
};

hterm.NaSSH.Stream.Socket.prototype.onDataAvailable = function(data) { };

hterm.NaSSH.Stream.Socket.prototype.onWebSocketMessage_ = function(e) {
  this.onDataAvailable(e.data);
};

hterm.NaSSH.Stream.Socket.prototype.onWebSocketError_ = function(e) {
  this.close()
};
