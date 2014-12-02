// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

module.exports = function(grunt) {
  // Load the grunt related dev deps listed in package.json.
  require('matchdep').filterDev('grunt-*').forEach(grunt.loadNpmTasks);

  // Load our custom tasks.
  grunt.loadTasks('./build/tasks/');

  // Read in our own package file.
  var pkg = grunt.file.readJSON('./package.json');

  grunt.initConfig({
    pkg: pkg,
    env: process.env,

    clean: {
      all: ['out', 'dist'],
      transpile: ['out/amd', 'out/cjs']
    },

    copy: {
      dist: {
        files: [{
          expand: true,
          cwd: 'out/concat/lib',
          src: [pkg.name + '.amd.js',
                pkg.name + '.amd.min.js'],
          dest: 'dist/amd/lib'
        },
        {
          expand: true,
          cwd: 'out/cjs',
          src: ['lib/**/*.js'],
          dest: 'dist/cjs'
        }]
      }
    },

    // Convert our ES6 import/export keywords into plain js.  We generate an
    // AMD version for use in the browser, and a CommonJS version for use in
    // node.js.
    transpile: {
      amd: {
        type: "amd",
        files: [{
          expand: true,
          cwd: 'lib/',
          src: ['**/*.js'],
          dest: 'out/amd/lib/'
        }]
      },
      cjs: {
        type: "cjs",
        files: [{
          expand: true,
          cwd: 'lib/',
          src: ['**/*.js'],
          dest: 'out/cjs/lib/'
        }]
      },
      test: {
        type: "amd",
        files: [{
          expand: true,
          cwd: '',
          src: ['test/**/*.js'],
          dest: 'out/amd/'
        }]
      }

    },

    resourcify: {
      test: {
        files: [{
          modulePrefix: 'test/resource/',
          expand: true,
          cwd: 'test/data',
          src: ['*.log'],
          dest: 'out/amd/test/'
        }]
      }
    },

    concat: {
      lib: {
        // Concatenate the AMD version of the transpiled source into a single
        // library.
        src: ['out/amd/lib/' + pkg.name + '/**/*.js'],
        dest: 'out/concat/lib/' + pkg.name + '.amd.js'
      },
      test: {
        // Concatenate the AMD version of the transpiled source into a single
        // library.
        src: ['out/amd/test/**/*.js'],
        dest: 'out/concat/test/' + pkg.name + '_test.amd.js'
      }
    },

    // Linting.
    jshint: {
      lib: {
        src: ['lib/**/*.js'],
        options: {
          jshintrc: '.jshintrc',
          force: false,
          verbose: true
        }
      },
      test: {
        src: ['test/**/*.js'],
        options: {
          jshintrc: '.jshintrc',
          force: false
        }
      }
    },

    // Minification.
    uglify: {
      lib: {
       src: ['out/concat/lib/' + pkg.name + '.amd.js'],
        dest: 'out/concat/lib/' + pkg.name + '.amd.min.js'
      },
    },

    shell: {
      load_tests: {
        command: 'google-chrome-unstable ' +
            '--user-data-dir=./out/chrome-profile/ ' +
            './test/test.html',
        options: {
          async: true
        }
      }
    }

  });

  grunt.registerTask('build', ['jshint',
                               'clean:transpile', 'transpile',
                               'resourcify', 'concat', 'uglify']);
  grunt.registerTask('dist', ['build', 'copy:dist']);

  grunt.registerTask('load_tests', ['shell:load_tests']);
  grunt.registerTask('default', ['build']);
};
