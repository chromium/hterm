// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('lib.Storage');

/**
 * @fileoverview Declares the hterm.* namespace and some basic shared utilities
 * that are too small to deserve dedicated files.
 */
var hterm = {};

/**
 * The type of window hosting hterm.
 *
 * This is set as part of hterm.init().  The value is invalid until
 * initialization completes.
 */
hterm.windowType = null;

/**
 * Warning message to display in the terminal when browser zoom is enabled.
 *
 * You can replace it with your own localized message.
 */
hterm.zoomWarningMessage = 'ZOOM != 100%';

/**
 * Brief overlay message displayed when text is copied to the clipboard.
 *
 * By default it is the unicode BLACK SCISSORS character, but you can
 * replace it with your own localized message.
 *
 * This is only displayed when the 'enable-clipboard-notice' preference
 * is enabled.
 */
hterm.notifyCopyMessage = '\u2702';


/**
 * Text shown in a desktop notification for the terminal
 * bell.  \u226a is a unicode EIGHTH NOTE, %(title) will
 * be replaced by the terminal title.
 */
hterm.desktopNotificationTitle = '\u266A %(title) \u266A';

/**
 * List of known hterm test suites.
 *
 * A test harness should ensure that they all exist before running.
 */
hterm.testDeps = ['hterm.ScrollPort.Tests', 'hterm.Screen.Tests',
                  'hterm.Terminal.Tests', 'hterm.VT.Tests',
                  'hterm.VT.CannedTests'];

/**
 * The hterm init function, registered with lib.registerInit().
 *
 * This is called during lib.init().
 *
 * @param {function} onInit The function lib.init() wants us to invoke when
 *     initialization is complete.
 */
lib.registerInit('hterm', function(onInit) {
  function onWindow(window) {
    hterm.windowType = window.type;
    setTimeout(onInit, 0);
  }

  function onTab(tab) {
    if (tab && window.chrome) {
      chrome.windows.get(tab.windowId, null, onWindow);
    } else {
      // TODO(rginda): This is where we end up for a v1 app's background page.
      // Maybe windowType = 'none' would be more appropriate, or something.
      hterm.windowType = 'normal';
      setTimeout(onInit, 0);
    }
  }

  if (!hterm.defaultStorage) {
    if (window.chrome && chrome.storage && chrome.storage.sync) {
      hterm.defaultStorage = new lib.Storage.Chrome(chrome.storage.sync);
    } else {
      hterm.defaultStorage = new lib.Storage.Local();
    }
  }

  // The chrome.tabs API is not supported in packaged apps, and detecting if
  // you're a packaged app is a little awkward.
  var isPackagedApp = false;
  if (window.chrome && chrome.runtime && chrome.runtime.getManifest) {
    var manifest = chrome.runtime.getManifest();
    isPackagedApp = manifest.app && manifest.app.background;
  }

  if (isPackagedApp) {
    // Packaged apps are never displayed in browser tabs.
    setTimeout(onWindow.bind(null, {type: 'popup'}), 0);
  } else {
    if (window.chrome && chrome.tabs) {
      // The getCurrent method gets the tab that is "currently running", not the
      // topmost or focused tab.
      chrome.tabs.getCurrent(onTab);
    } else {
      setTimeout(onWindow.bind(null, {type: 'normal'}), 0);
    }
  }
});

/**
 * Return decimal { width, height } for a given dom node.
 */
hterm.getClientSize = function(dom) {
  return dom.getBoundingClientRect();
};

/**
 * Return decimal width for a given dom node.
 */
hterm.getClientWidth = function(dom) {
  return dom.getBoundingClientRect().width;
};

/**
 * Return decimal height for a given dom node.
 */
hterm.getClientHeight = function(dom) {
  return dom.getBoundingClientRect().height;
};

/**
 * Copy the current selection to the system clipboard.
 *
 * @param {HTMLDocument} The document with the selection to copy.
 */
hterm.copySelectionToClipboard = function(document) {
  try {
    document.execCommand('copy');
  } catch (firefoxException) {
    // Ignore this. FF throws an exception if there was an error, even though
    // the spec says just return false.
  }
};

/**
 * Paste the system clipboard into the element with focus.
 *
 * Note: In Chrome/Firefox app/extension environments, you'll need the
 * "clipboardRead" permission.  In other environments, this might always
 * fail as the browser frequently blocks access for security reasons.
 *
 * @param {HTMLDocument} The document to paste into.
 * @return {boolean} True if the paste succeeded.
 */
hterm.pasteFromClipboard = function(document) {
  try {
    return document.execCommand('paste');
  } catch (firefoxException) {
    // Ignore this.  FF 40 and older would incorrectly throw an exception if
    // there was an error instead of returning false.
    return false;
  }
};

/**
 * Create a new notification.
 *
 * @param {Object} params Various parameters for the notification.
 * @param {string} params.title The title (defaults to the window's title).
 * @param {string} params.body The message body (main text).
 */
hterm.notify = function(params) {
  var def = (curr, fallback) => curr !== undefined ? curr : fallback;
  if (params === undefined || params === null)
    params = {};

  // Merge the user's choices with the default settings.  We don't take it
  // directly in case it was stuffed with excess junk.
  var options = {
      'body': params.body,
      'icon': def(params.icon, lib.resource.getDataUrl('hterm/images/icon-96')),
  }

  var title = def(params.title, window.document.title);
  if (!title)
    title = 'hterm';
  title = lib.f.replaceVars(hterm.desktopNotificationTitle, {'title': title});

  var n = new Notification(title, options);
  n.onclick = function() {
    window.focus();
    this.close();
  };
  return n;
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
 * @return {boolean} True if both instances have the same width/height, false
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
 * This class includes an 'overflow' bit which is use to indicate that an
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
 * @return {boolean} True if both instances have the same row/column, false
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
