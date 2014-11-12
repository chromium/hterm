// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Grab bag of utility functions.
 */
export var f = {};
export default f;

/**
 * Get the list of accepted UI languages.
 *
 * @param {function(Array)} callback Function to invoke with the results.  The
 *     parameter is a list of locale names.
 */
f.getAcceptLanguages = function(callback) {
  if (window.chrome && window.chrome.i18n) {
    window.chrome.i18n.getAcceptLanguages(callback);
  } else {
    setTimeout(function() {
        callback([navigator.language.replace(/-/g, '_')]);
      }, 0);
  }
};

/**
 * Parse a query string into a hash.
 *
 * This takes a url query string in the form 'name1=value&name2=value' and
 * converts it into an object of the form { name1: 'value', name2: 'value' }.
 * If a given name appears multiple times in the query string, only the
 * last value will appear in the result.
 *
 * Names and values are passed through decodeURIComponent before being added
 * to the result object.
 *
 * @param {string} queryString The string to parse.  If it starts with a
 *     leading '?', the '?' will be ignored.
 */
f.parseQuery = function(queryString) {
  if (queryString.substr(0, 1) == '?')
    queryString = queryString.substr(1);

  var rv = {};

  var pairs = queryString.split('&');
  for (var i = 0; i < pairs.length; i++) {
    var pair = pairs[i].split('=');
    rv[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
  }

  return rv;
};

/**
 * Clamp a given integer to a specified range.
 *
 * @param {integer} v The value to be clamped.
 * @param {integer} min The minimum acceptable value.
 * @param {integer} max The maximum acceptable value.
 */
f.clamp = function(v, min, max) {
  if (v < min)
    return min;
  if (v > max)
    return max;
  return v;
};

 /**
 * Ensure that a function is called within a certain time limit.
 *
 * Simple usage looks like this...
 *
 *  asyncWithOneCallback(f.alarm(myCallback));
 *
 * This will log a warning to the console if onInit() is not invoked within
 * 5 seconds.
 *
 * If you're performing some operation that may take longer than 5 seconds you
 * can pass a duration in milliseconds as the optional second parameter.
 *
 * If you pass a string identifier instead of a callback function, you'll get a
 * wrapper generator rather than a single wrapper.  Each call to the
 * generator will return a wrapped version of the callback wired to
 * a shared timeout.  This is for cases where you want to ensure that at least
 * one of a set of callbacks is invoked before a timeout expires.
 *
 *   var alarm = f.alarm('fetch object');
 *   asyncWithTwoCallbacks(alarm(onSuccess), alarm(onFailure));
 *
 * @param {function(*)} callback The function to wrap in an alarm.
 * @param {int} opt_ms Optional number of milliseconds to wait before raising
 *     an alarm.  Default is 5000 (5 seconds).
 * @return {function} If callback is a function then the return value will be
 *     the wrapped callback.  If callback is a string then the return value will
 *     be a function that generates new wrapped callbacks.
 */
f.alarm = function(callback, opt_ms) {
  var ms = opt_ms || 5 * 1000;
  var stack = f.getStack(1);

  return (function() {
    // This outer function is called immediately.  It's here to capture a new
    // scope for the timeout variable.

    // The 'timeout' variable is shared by this timeout function, and the
    // callback wrapper.
    var timeout = setTimeout(function() {
      var name = (typeof callback == 'string') ? name : callback.name;
      name = name ? (': ' + name) : '';
      console.warn('f.alarm: timeout expired: ' + (ms / 1000) + 's' + name);
      console.log(stack);
      timeout = null;
    }, ms);

    var wrapperGenerator = function(callback) {
      return function() {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }

        return callback.apply(null, arguments);
      };
    };

    if (typeof callback == 'string')
      return wrapperGenerator;

    return wrapperGenerator(callback);
  })();
};

/**
 * Return the current call stack after skipping a given number of frames.
 *
 * This method is intended to be used for debugging only.  It returns an
 * Object instead of an Array, because the console stringifies arrays by
 * default and that's not what we want.
 *
 * A typical call might look like...
 *
 *    console.log('Something wicked this way came', f.getStack());
 *    //                         Notice the comma ^
 *
 * This would print the message to the js console, followed by an object
 * which can be clicked to reveal the stack.
 *
 * @param {number} opt_ignoreFrames The optional number of stack frames to
 *     ignore.  The actual 'getStack' call is always ignored.
 */
f.getStack = function(opt_ignoreFrames) {
  var ignoreFrames = opt_ignoreFrames ? opt_ignoreFrames + 2 : 2;

  var stackArray;

  try {
    throw new Error();
  } catch (ex) {
    stackArray = ex.stack.split('\n');
  }

  var stackObject = {};
  for (var i = ignoreFrames; i < stackArray.length; i++) {
    stackObject[i - ignoreFrames] = stackArray[i].replace(/^\s*at\s+/, '');
  }

  return stackObject;
};
