// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

if (typeof lib != 'undefined')
  throw new Error('Global "lib" object already exists.');

var lib = {};

/**
 * Map of "dependency" to ["source", ...].
 *
 * Each dependency is a object name, like "lib.fs", "source" is the url that
 * depdends on the object.
 */
lib.runtimeDependencies_ = {};

/**
 * List of functions that need to be invoked during library initialization.
 *
 * Each element in the initCallbacks_ array is itself a two-element array.
 * Element 0 is a short string describing the owner of the init routine, useful
 * for debugging.  Element 1 is the callback function.
 */
lib.initCallbacks_ = [];

/**
 * Records a runtime dependency.
 *
 * This can be useful when you want to express a run-time dependency at
 * compile time.  It is not intended to be a full-fledged library system or
 * dependency tracker.  It's just there to make it possible to debug the
 * deps without running all the code.
 *
 * Object names are specified as strings.  For example...
 *
 *     lib.rtdep('lib.colors', 'lib.PreferenceManager');
 *
 * Object names need not be rooted by 'lib'.  You may use this to declare a
 * dependency on any object.
 *
 * The client program may call lib.ensureRuntimeDependencies() at startup in
 * order to ensure that all runtime dependencies have been met.
 *
 * @param {string} var_args One or more objects specified as strings.
 */
lib.rtdep = function(var_args) {
  var source;

  try {
    throw new Error();
  } catch (ex) {
    var stackArray = ex.stack.split('\n');
    source = stackArray[2].replace(/^\s*at\s+/, '');
  }

  for (var i = 0; i < arguments.length; i++) {
    var path = arguments[i];
    if (path instanceof Array) {
      lib.rtdep.apply(lib, path);
    } else {
      var ary = this.runtimeDependencies_[path];
      if (!ary)
        ary = this.runtimeDependencies_[path] = [];
      ary.push(source);
    }
  }
};

/**
 * Ensures that all runtime dependencies are met, or an exception is thrown.
 *
 * Every unmet runtime dependency will be logged to the JS console.  If at
 * least one dependency is unmet this will raise an exception.
 */
lib.ensureRuntimeDependencies_ = function() {
  var passed = true;

  for (var path in lib.runtimeDependencies_) {
    var sourceList = lib.runtimeDependencies_[path];
    var names = path.split('.');

    // In a document context 'window' is the global object.  In a worker it's
    // called 'self'.
    var obj = (window || self);
    for (var i = 0; i < names.length; i++) {
      if (!(names[i] in obj)) {
        console.warn('Missing "' + path + '" is needed by', sourceList);
        passed = false;
        break;
      }

      obj = obj[names[i]];
    }
  }

  if (!passed)
    throw new Error('Failed runtime dependency check');
};

/**
 * Register an initialization function.
 *
 * The initialization functions are invoked in registration order when
 * lib.init() is invoked.  Each function will receive a single parameter, which
 * is a function to be invoked when it completes its part of the initialization.
 *
 * @param {string} name A short descriptive name of the init routine useful for
 *     debugging.
 * @param {function(function)} callback The initialization function to register.
 * @return {function} The callback parameter.
 */
lib.registerInit = function(name, callback) {
  lib.initCallbacks_.push([name, callback]);
  return callback;
};

/**
 * Initialize the library.
 *
 * This will ensure that all registered runtime dependencies are met, and
 * invoke any registered initialization functions.
 *
 * Initialization is asynchronous.  The library is not ready for use until
 * the onInit function is invoked.
 *
 * @param {function()} onInit The function to invoke when initialization is
 *     complete.
 * @param {function(*)} opt_logFunction An optional function to send
 *     initialization related log messages to.
 */
lib.init = function(onInit, opt_logFunction) {
  var ary = lib.initCallbacks_;

  var initNext = function() {
    if (ary.length) {
      var rec = ary.shift();
      if (opt_logFunction)
        opt_logFunction('init: ' + rec[0]);
      rec[1](lib.f.alarm(initNext));
    } else {
      onInit();
    }
  };

  if (typeof onInit != 'function')
    throw new Error('Missing or invalid argument: onInit');

  lib.ensureRuntimeDependencies_();

  setTimeout(initNext, 0);
};
