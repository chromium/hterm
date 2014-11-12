// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

module.exports = function(grunt) {
  'use strict';

  var path = require('path');

  grunt.registerMultiTask
  ('resourcify',
   'Convert a text file into a module exporting a string.',
   function() {
    this.files.forEach(function(filePair) {
        var dest = filePair.dest;
        var modulePrefix = filePair.modulePrefix;

        filePair.src.forEach(function(src) {
           var baseName = path.basename(src);
           var contents = grunt.file.read(src);

           grunt.file.write(
               dest + '.js',
               'define("' + modulePrefix + baseName.replace(/\.js$/, '') + '"' +
               ',["exports"], function(__exports__) { ' +
               '__exports__["default"] = ' +
               JSON.stringify(contents) +
               '});\n');
          });
      });
  });
};
