// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('lib.fs');

var nassh = {};

/**
 * Register a static initializer for nassh.*.
 *
 * @param {function} onInit The function lib.init() wants us to invoke when
 *     initialization is complete.
 */
lib.registerInit('nassh', function(onInit) {
  if (!nassh.defaultStorage) {
    var ary = navigator.userAgent.match(/\sChrome\/(\d\d)/);
    var version = parseInt(ary[1]);
    if (chrome.storage && chrome.storage.sync && version > 21) {
      nassh.defaultStorage = new lib.Storage.Chrome(chrome.storage.sync);
    } else {
      nassh.defaultStorage = new lib.Storage.Local();
    }
  }

  onInit();
});

nassh.test = function() {
  window.open(chrome.extension.getURL('html/nassh_test.html'));
};

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
    lib.fs.getOrCreateDirectory(fileSystem.root, '/.ssh',
                                onSuccess.bind(null, fileSystem),
                                lib.fs.err('Error creating /.ssh',
                                           opt_onError));
  }

  var requestFS = window.requestFileSystem || window.webkitRequestFileSystem;
  requestFS(window.PERSISTENT,
            16 * 1024 * 1024,
            onFileSystem,
            lib.fs.err('Error initializing filesystem', opt_onError));
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
    lib.fs.overwriteFile(fileSystem.root, targetPath, file,
                         lib.fs.log('Imported: '+ targetPath, opt_onSuccess),
                         lib.fs.err('Error importing: ' + targetPath,
                                    opt_onError));
  }
};
