// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview Declares the hterm.* namespace and some basic shared utilities
 * that are too small to deserve dedicated files.
 */
var hterm = {};

/**
 * Static initialization for hterm.*, call this once before using anything
 * else in the hterm namespace.
 *
 * @param {function} opt_onInit Optional function to invoke once the
 *     initialization is complete.
 */
hterm.init = function(opt_onInit) {
  hterm.installFileErrorToString();

  BaseDialog.OK_LABEL = hterm.msg('OK_BUTTON_LABEL');
  BaseDialog.CANCEL_LABEL = hterm.msg('CANCEL_BUTTON_LABEL');

  // Eventually this init may need to be async, hence the callback.
  if (opt_onInit)
    opt_onInit();
};

/**
 * Return a formatted message in the current locale.
 *
 * @param {string} name The name of the message to return.
 * @param {Array} opt_args The message arguments, if required.
 */
hterm.msg = function(name, opt_args) {
  return chrome.i18n.getMessage(name, opt_args);
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
hterm.parseQuery = function(queryString) {
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
 * Return the current call stack after skipping a given number of frames.
 *
 * This method is intended to be used for debugging only.  It returns an
 * Object instead of an Array, because the console stringifies arrays by
 * default and that's not what we want.
 *
 * A typical call might look like...
 *
 *    console.log('Something wicked this way came', hterm.getStack());
 *    //                         Notice the comma ^
 *
 * This would print the message to the js console, followed by an object
 * which can be clicked to reveal the stack.
 *
 * @param {number} opt_ignoreFrames The optional number of stack frames to
 *     ignore.  The actual 'getStack' call is always ignored.
 */
hterm.getStack = function(opt_ignoreFrames) {
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
}

/**
 * Clamp a given integer to a specified range.
 *
 * @param {integer} v The value to be clamped.
 * @param {integer} min The minimum acceptable value.
 * @param {integer} max The maximum acceptable value.
 */
hterm.clamp = function(v, min, max) {
  if (v < min)
    return min;
  if (v > max)
    return max;
  return v;
};

/**
 * Left pad a string to a given length using a given character.
 *
 * @param {string} str The string to pad.
 * @param {integer} length The desired length.
 * @param {string} opt_ch The optional padding character, defaults to ' '.
 * @return {string} The padded string.
 */
hterm.lpad = function(str, length, opt_ch) {
  str = String(str);
  opt_ch = opt_ch || ' ';

  while (str.length < length)
    str = opt_ch + str;

  return str;
};

/**
 * Left pad a number to a given length with leading zeros.
 *
 * @param {string|integer} number The number to pad.
 * @param {integer} length The desired length.
 * @return {string} The padded number as a string.
 */
hterm.zpad = function(number, length) {
  return hterm.lpad(number, length, '0');
};

/**
 * Returns a function that console.log's its arguments, prefixed by |msg|.
 *
 * @param {string} msg The message prefix to use in the log.
 * @param {function(*)} opt_callback A function to invoke after logging.
 */
hterm.flog = function(msg, opt_callback) {
  return function() {
    var ary = Array.apply(null, arguments);
    console.log(msg + ': ' + ary.join(', '));
    if (opt_callback)
      opt_callback.call(null, arguments);
  };
};

/**
 * Returns a function that throws an exception that includes its arguments
 * prefixed by |msg|.
 *
 * @param {string} msg The message prefix to use in the exception.
 */
hterm.ferr = function(msg) {
  return function() {
    var ary = Array.apply(null, arguments);
    throw new Error(msg + ': ' + ary.join(', '));
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
hterm.installFileErrorToString = function() {
  FileError.prototype.toString = function() {
    return '[object FileError: ' + hterm.getFileErrorMnemonic(this.code) + ']';
  }
};

/**
 * Return a mnemonic code for a given FileError code.
 *
 * @param {integer} code A FileError code.
 * @return {string} The corresponding mnemonic value.
 */
hterm.getFileErrorMnemonic = function(code) {
  for (var key in FileError) {
    if (key.search(/_ERR$/) != -1 && FileError[key] == code)
      return key;
  }

  return code;
};

/**
 * Locate the file referred to by path, creating directories or the file
 * itself if necessary.
 */
hterm.getOrCreateFile = function(root, path, successCallback, errorCallback) {
  var dirname = null;
  var basename = null;

  function onDirFound(dirEntry) {
    dirEntry.getFile(basename, { create: true },
                     successCallback, errorCallback);
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

  hterm.getOrCreateDirectory(root, dirname, onDirFound, errorCallback);
};

/**
 * Locate the directory referred to by path, creating directories along the
 * way.
 */
hterm.getOrCreateDirectory = function(
    root, path, successCallback, errorCallback) {
  var names = path.split('/');

  function getOrCreateNextName(dir) {
    if (!names.length)
      return successCallback(dir);

    var name = names.shift();

    if (!name || name == '.') {
      getOrCreateNextName(dir);
    } else {
      dir.getDirectory(name, { create: true }, getOrCreateNextName,
                       errorCallback);
    }
  }

  getOrCreateNextName(root);
};


/**
 * Return a string containing a given number of space characters.
 *
 * This method maintains a static cache of the largest amount of whitespace
 * ever requested.  It shouldn't be used to generate an insanely huge amount of
 * whitespace.
 *
 * @param {integer} length The desired amount of whitespace.
 * @param {string} A string of spaces of the requested length.
 */
hterm.getWhitespace = function(length) {
  if (length == 0)
    return '';

  var f = this.getWhitespace;
  if (!f.whitespace)
    f.whitespace = '          ';

  while (length > f.whitespace.length) {
    f.whitespace += f.whitespace;
  }

  return f.whitespace.substr(0, length);
};

/**
 * Constructor for a hterm.Size record.
 *
 * Instances of this class have public read/write members for width and height.
 *
 * @param {integer} width The width of this record.
 * @param {integer} height The height of this record.
 */
hterm.Size = function(width, height) {
  this.width = width;
  this.height = height;
};

/**
 * Adjust the width and height of this record.
 *
 * @param {integer} width The new width of this record.
 * @param {integer} height The new height of this record.
 */
hterm.Size.prototype.resize = function(width, height) {
  this.width = width;
  this.height = height;
};

/**
 * Return a copy of this record.
 *
 * @return {hterm.Size} A new hterm.Size instance with the same width and
 * height.
 */
hterm.Size.prototype.clone = function() {
  return new hterm.Size(this.width, this.height);
};

/**
 * Set the height and width of this instance based on another hterm.Size.
 *
 * @param {hterm.Size} that The object to copy from.
 */
hterm.Size.prototype.setTo = function(that) {
  this.width = that.width;
  this.height = that.height;
};

/**
 * Test if another hterm.Size instance is equal to this one.
 *
 * @param {hterm.Size} that The other hterm.Size instance.
 * @return {boolen} True if both instances have the same width/height, false
 *     otherwise.
 */
hterm.Size.prototype.equals = function(that) {
  return this.width == that.width && this.height == that.height;
};

/**
 * Return a string representation of this instance.
 *
 * @return {string} A string that identifies the width and height of this
 *     instance.
 */
hterm.Size.prototype.toString = function() {
  return '[hterm.Size: ' + this.width + ', ' + this.height + ']';
};

/**
 * Constructor for a hterm.RowCol record.
 *
 * Instances of this class have public read/write members for row and column.
 *
 * This class includes an 'overflow' bit which is use to indicate that the an
 * attempt has been made to move the cursor column passed the end of the
 * screen.  When this happens we leave the cursor column set to the last column
 * of the screen but set the overflow bit.  In this state cursor movement
 * happens normally, but any attempt to print new characters causes a cr/lf
 * first.
 *
 * @param {integer} row The row of this record.
 * @param {integer} column The column of this record.
 * @param {boolean} opt_overflow Optional boolean indicating that the RowCol
 *     has overflowed.
 */
hterm.RowCol = function(row, column, opt_overflow) {
  this.row = row;
  this.column = column;
  this.overflow = !!opt_overflow;
};

/**
 * Adjust the row and column of this record.
 *
 * @param {integer} row The new row of this record.
 * @param {integer} column The new column of this record.
 * @param {boolean} opt_overflow Optional boolean indicating that the RowCol
 *     has overflowed.
 */
hterm.RowCol.prototype.move = function(row, column, opt_overflow) {
  this.row = row;
  this.column = column;
  this.overflow = !!opt_overflow;
};

/**
 * Return a copy of this record.
 *
 * @return {hterm.RowCol} A new hterm.RowCol instance with the same row and
 * column.
 */
hterm.RowCol.prototype.clone = function() {
  return new hterm.RowCol(this.row, this.column, this.overflow);
};

/**
 * Set the row and column of this instance based on another hterm.RowCol.
 *
 * @param {hterm.RowCol} that The object to copy from.
 */
hterm.RowCol.prototype.setTo = function(that) {
  this.row = that.row;
  this.column = that.column;
  this.overflow = that.overflow;
};

/**
 * Test if another hterm.RowCol instance is equal to this one.
 *
 * @param {hterm.RowCol} that The other hterm.RowCol instance.
 * @return {boolen} True if both instances have the same row/column, false
 *     otherwise.
 */
hterm.RowCol.prototype.equals = function(that) {
  return (this.row == that.row && this.column == that.column &&
          this.overflow == that.overflow);
};

/**
 * Return a string representation of this instance.
 *
 * @return {string} A string that identifies the row and column of this
 *     instance.
 */
hterm.RowCol.prototype.toString = function() {
  return ('[hterm.RowCol: ' + this.row + ', ' + this.column + ', ' +
          this.overflow + ']');
};
