// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('lib.f.getStack');

/**
 * HTML5 FileSystem related utility functions.
 */
lib.fs = {};

if (typeof addEventListener == 'function')
  addEventListener('load', function() { lib.fs.installFileErrorToString() });

/**
 * Returns a function that console.log()'s its arguments, prefixed by |msg|.
 *
 * This is a useful utility function when working with the FileSystem's many
 * async, callbacktastic methods.
 *
 * * Use it when you don't think you care about a callback.  If it ever gets
 *   called, you get a log message that includes any parameters passed to the
 *   callback.
 *
 * * Use it as your "log a messages, then invoke this other method" pattern.
 *   Great for debugging or times when you want to log a message before
 *   invoking a callback passed in to your method.
 *
 * @param {string} msg The message prefix to use in the log.
 * @param {function(*)} opt_callback A function to invoke after logging.
 */
lib.fs.log = function(msg, opt_callback) {
  return function() {
    var ary = Array.apply(null, arguments);
    console.log(msg + ': ' + ary.join(', '));
    if (opt_callback)
      opt_callback.call(null, arguments);
  };
};

/**
 * Returns a function that console.error()'s its arguments, prefixed by |msg|.
 *
 * This is exactly like fs.log(), except the message in the JS console will
 * be styled as an error.  See fs.log() for some use cases.
 *
 * @param {string} msg The message prefix to use in the log.
 * @param {function(*)} opt_callback A function to invoke after logging.
 */
lib.fs.err = function(msg, opt_callback) {
  return function() {
    var ary = Array.apply(null, arguments);
    console.error(msg + ': ' + ary.join(', '), lib.f.getStack());
    if (opt_callback)
      opt_callback.call(null, arguments);
  };
};

/**
 * Install a sensible toString() on the FileError object.
 *
 * FileError.prototype.code is a numeric code describing the cause of the
 * error.  The FileError constructor has a named property for each possible
 * error code, but provides no way to map the code to the named property.
 * This toString() implementation fixes that.
 */
lib.fs.installFileErrorToString = function() {
  FileError.prototype.toString = function() {
    return '[object FileError: ' + lib.fs.getFileErrorMnemonic(this.code) + ']';
  }
};

/**
 * Return a mnemonic code for a given FileError code.
 *
 * @param {integer} code A FileError code.
 * @return {string} The corresponding mnemonic value.
 */
lib.fs.getFileErrorMnemonic = function(code) {
  for (var key in FileError) {
    if (key.search(/_ERR$/) != -1 && FileError[key] == code)
      return key;
  }

  return code;
};

/**
 * Overwrite a file on an HTML5 filesystem.
 *
 * Replace the contents of a file with the string provided.  If the file
 * doesn't exist it is created.  If it does, it is removed and re-created.
 *
 * @param {DirectoryEntry} root The directory to consider as the root of the
 *     path.
 * @param {string} path The path of the target file, relative to root.
 * @param {Blob|string} contents The new contents of the file.
 * @param {function()} onSuccess The function to invoke after success.
 * @param {function(FileError)} opt_onError Optional function to invoke if the
 *     operation fails.
 */
lib.fs.overwriteFile = function(root, path, contents, onSuccess, opt_onError) {
  function onFileRemoved() {
    lib.fs.getOrCreateFile(root, path,
                          onFileFound,
                          lib.fs.log('Error creating: ' + path, opt_onError));
  }

  function onFileFound(fileEntry) {
    fileEntry.createWriter(onFileWriter,
                           lib.fs.log('Error creating writer for: ' + path,
                                      opt_onError));
  }

  function onFileWriter(writer) {
    writer.onwriteend = onSuccess;
    writer.onerror = lib.fs.log('Error writing to: ' + path, opt_onError);

    if (!(contents instanceof Blob)) {
      var bb = new (window.BlobBuilder || window.WebKitBlobBuilder)();
      bb.append(contents);
      contents = bb.getBlob('text/plain');
    }

    writer.write(contents);
  }

  root.getFile(path, {create: false},
               function(fileEntry) {
                 fileEntry.remove(onFileRemoved, onFileRemoved);
               },
               onFileRemoved);
};

/**
 * Read a file on an HTML5 filesystem.
 *
 * @param {DirectoryEntry} root The directory to consider as the root of the
 *     path.
 * @param {string} path The path of the target file, relative to root.
 * @param {function(string)} onSuccess The function to invoke after
 *     success.
 * @param {function(FileError)} opt_onError Optional function to invoke if the
 *     operation fails.
 */
lib.fs.readFile = function(root, path, onSuccess, opt_onError) {
  function onFileFound(fileEntry) {
    fileEntry.file(function(file) {
        var reader = new FileReader();
        reader.onloadend = function() { onSuccess(reader.result) };

        reader.readAsText(file);
      }, opt_onError);
  }

  root.getFile(path, {create: false}, onFileFound, opt_onError);
};


/**
 * Remove a file from an HTML5 filesystem.
 *
 * @param {DirectoryEntry} root The directory to consider as the root of the
 *     path.
 * @param {string} path The path of the target file, relative to root.
 * @param {function(string)} opt_onSuccess Optional function to invoke after
 *     success.
 * @param {function(FileError)} opt_onError Optional function to invoke if the
 *     operation fails.
 */
lib.fs.removeFile = function(root, path, opt_onSuccess, opt_onError) {
  root.getFile(
      path, {},
      function (f) {
        f.remove(lib.fs.log('Removed: ' + path, opt_onSuccess),
                 lib.fs.err('Error removing' + path, opt_onError));
      },
      lib.fs.log('Error finding: ' + path, opt_onError)
  );
};

/**
 * Build a list of all FileEntrys in an HTML5 filesystem.
 *
 * @param {DirectoryEntry} root The directory to consider as the root of the
 *     path.
 * @param {string} path The path of the target file, relative to root.
 * @param {function(Object)} onSuccess The function to invoke after
 *     success.
 * @param {function(FileError)} opt_onError Optional function to invoke
 *     if the operation fails.
 */
lib.fs.readDirectory = function(root, path, onSuccess, opt_onError) {
  var entries = {};

  function onDirectoryFound(dirEntry) {
    var reader = dirEntry.createReader();
    reader.readEntries(function(results) {
        for (var i = 0; i < results.length; i++) {
          entries[results[i].name] = results[i];
        }

        if (true || !results.length) {
          onSuccess(entries);
          return;
        }
      }, opt_onError);
  }

  root.getDirectory(path, {create: false}, onDirectoryFound, opt_onError);
};

/**
 * Locate the file referred to by path, creating directories or the file
 * itself if necessary.
 *
 * @param {DirectoryEntry} root The directory to consider as the root of the
 *     path.
 * @param {string} path The path of the target file, relative to root.
 * @param {function(string)} onSuccess The function to invoke after
 *     success.
 * @param {function(FileError)} opt_onError Optional function to invoke if the
 *     operation fails.
 */
lib.fs.getOrCreateFile = function(root, path, onSuccess, opt_onError) {
  var dirname = null;
  var basename = null;

  function onDirFound(dirEntry) {
    dirEntry.getFile(basename, { create: true }, onSuccess, opt_onError);
  }

  var i = path.lastIndexOf('/');
  if (i > -1) {
    dirname = path.substr(0, i);
    basename = path.substr(i + 1);
  } else {
    basename = path;
  }

  if (!dirname)
    return onDirFound(root);

  lib.fs.getOrCreateDirectory(root, dirname, onDirFound, opt_onError);
};

/**
 * Locate the directory referred to by path, creating directories along the
 * way.
 *
 * @param {DirectoryEntry} root The directory to consider as the root of the
 *     path.
 * @param {string} path The path of the target file, relative to root.
 * @param {function(string)} onSuccess The function to invoke after success.
 * @param {function(FileError)} opt_onError Optional function to invoke if the
 *     operation fails.
 */
lib.fs.getOrCreateDirectory = function(root, path, onSuccess, opt_onError) {
  var names = path.split('/');

  function getOrCreateNextName(dir) {
    if (!names.length)
      return onSuccess(dir);

    var name = names.shift();

    if (!name || name == '.') {
      getOrCreateNextName(dir);
    } else {
      dir.getDirectory(name, { create: true }, getOrCreateNextName,
                       opt_onError);
    }
  }

  getOrCreateNextName(root);
};
