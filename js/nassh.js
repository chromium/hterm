// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

var nassh = {};

/**
 * Load and parse the manifest file for this extension.
 */
nassh.loadManifest = function(onSuccess, opt_onError) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/manifest.json');

  var self = this;
  xhr.onloadend = function() {
    if (xhr.status == 200) {
      onSuccess(JSON.parse(xhr.responseText));
    } else {
      if (opt_onError)
        opt_onError(xhr.status);
    }
  };

  xhr.send();
};

/**
 * Request the persistent HTML5 filesystem for this extension.
 *
 * This will also create the /.ssh/ directory if it does not exits.
 *
 * @param {function(FileSystem, DirectoryEntry)} onSuccess The function to
 *     invoke when the operation succeeds.
 * @param {function(FileError)} opt_onError Optional function to invoke if
 *     the operation fails.
 */
nassh.getFileSystem = function(onSuccess, opt_onError) {
  function onFileSystem(fileSystem) {
    hterm.getOrCreateDirectory(fileSystem.root, '/.ssh',
                               onSuccess.bind(null, fileSystem),
                               hterm.ferr('Error creating /.ssh', opt_onError));
  }

  var requestFS = window.requestFileSystem || window.webkitRequestFileSystem;
  requestFS(window.PERSISTENT,
            16 * 1024 * 1024,
            onFileSystem,
            hterm.ferr('Error initializing filesystem', opt_onError));
};

/**
 * Import File objects into the HTML5 filesystem.
 *
 * @param {FileSysetm} fileSystem The FileSystem object to operate on.
 * @param {string} dest The target directory for the import.
 * @param {FileList} fileList A FileList object containing one or more File
 *     objects to import.
 */
nassh.importFiles = function(fileSystem, dest, fileList,
                             opt_onSuccess, opt_onError) {
  if (dest.substr(dest.length - 1) != '/')
    dest += '/';

  for (var i = 0; i < fileList.length; ++i) {
    var file = fileList[i];
    var targetPath = dest + file.name;
    hterm.overwriteFile(fileSystem.root, targetPath, file,
                        hterm.flog('Imported: '+ targetPath,
                                   opt_onSuccess),
                        hterm.ferr('Error importing: ' + targetPath,
                                   opt_onError));
  }
};
