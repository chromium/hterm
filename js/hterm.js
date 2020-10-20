// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview Declares the hterm.* namespace and some basic shared utilities
 * that are too small to deserve dedicated files.
 */
const hterm = {};

/**
 * The type of window hosting hterm.
 *
 * This is set as part of hterm.init().  The value is invalid until
 * initialization completes.
 */
hterm.windowType = null;

/**
 * The OS we're running under.
 *
 * Used when setting up OS-specific behaviors.
 *
 * This is set as part of hterm.init().  The value is invalid until
 * initialization completes.
 */
hterm.os = null;

/**
 * Warning message to display in the terminal when browser zoom is enabled.
 *
 * You can replace it with your own localized message.
 */
hterm.zoomWarningMessage = 'ZOOM != 100%';

/**
 * Text shown in a desktop notification for the terminal
 * bell.  \u226a is a unicode EIGHTH NOTE, %(title) will
 * be replaced by the terminal title.
 */
hterm.desktopNotificationTitle = '\u266A %(title) \u266A';

/** @type {?lib.MessageManager} */
hterm.messageManager = null;

lib.registerInit(
    'hterm',
    /**
     * The hterm init function, registered with lib.registerInit().
     *
     * This is called during lib.init().
     *
     * @return {!Promise<void>}
     */
    async () => {
      function initMessageManager() {
        return lib.i18n.getAcceptLanguages()
          .then((languages) => {
            if (!hterm.messageManager) {
              hterm.messageManager = new lib.MessageManager(languages);
            }
          })
          .then(() => {
            // If OS detection fails, then we'll still set the value to
            // something.  The OS logic in hterm tends to be best effort
            // anyways.
            const initOs = (os) => { hterm.os = os; };
            return lib.f.getOs().then(initOs).catch(initOs);
          });
      }

      function onWindow(window) {
        hterm.windowType = window.type;
        return initMessageManager();
      }

      function onTab(tab = undefined) {
        if (tab && window.chrome) {
          return new Promise((resolve) => {
            chrome.windows.get(tab.windowId, null, (win) => {
              onWindow(win).then(resolve);
            });
          });
        } else {
          // TODO(rginda): This is where we end up for a v1 app's background
          // page. Maybe windowType = 'none' would be more appropriate, or
          // something.
          hterm.windowType = 'normal';
          return initMessageManager();
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
      let isPackagedApp = false;
      if (window.chrome && chrome.runtime && chrome.runtime.getManifest) {
        const manifest = chrome.runtime.getManifest();
        isPackagedApp = manifest.app && manifest.app.background;
      }

      return new Promise((resolve) => {
        if (isPackagedApp) {
          // Packaged apps are never displayed in browser tabs.
          onWindow({type: 'popup'}).then(resolve);
        } else {
          if (window.chrome && chrome.tabs) {
            // The getCurrent method gets the tab that is "currently running",
            // not the topmost or focused tab.
            chrome.tabs.getCurrent((tab) => onTab(tab).then(resolve));
          } else {
            onWindow({type: 'normal'}).then(resolve);
          }
        }
      });
    });

/**
 * Return decimal { width, height } for a given DOM element.
 *
 * @param {!Element} element The element whose size to lookup.
 * @return {!DOMRect} The size of the element.
 */
hterm.getClientSize = function(element) {
  return element.getBoundingClientRect();
};

/**
 * Return decimal width for a given DOM element.
 *
 * @param {!Element} element The element whose width to lookup.
 * @return {number} The width of the element.
 */
hterm.getClientWidth = function(element) {
  return element.getBoundingClientRect().width;
};

/**
 * Return decimal height for a given DOM element.
 *
 * @param {!Element} element The element whose height to lookup.
 * @return {number} The height of the element.
 */
hterm.getClientHeight = function(element) {
  return element.getBoundingClientRect().height;
};

/**
 * Copy the specified text to the system clipboard.
 *
 * We'll create selections on demand based on the content to copy.
 *
 * @param {!Document} document The document with the selection to copy.
 * @param {string} str The string data to copy out.
 * @return {!Promise<void>}
 */
hterm.copySelectionToClipboard = function(document, str) {
  // Request permission if need be.
  const requestPermission = () => {
    // Use the Permissions API if available.
    if (navigator.permissions && navigator.permissions.query) {
      return navigator.permissions.query({name: 'clipboard-write'})
        .then((status) => {
          const checkState = (resolve, reject) => {
            switch (status.state) {
              case 'granted':
                return resolve();
              case 'denied':
                return reject();
              default:
                // Wait for the user to approve/disprove.
                return new Promise((resolve, reject) => {
                  status.onchange = () => checkState(resolve, reject);
                });
            }
          };

          return new Promise(checkState);
        })
        // If the platform doesn't support "clipboard-write", or is denied,
        // we move on to the copying step anyways.
        .catch(() => Promise.resolve());
    } else {
      // No permissions API, so resolve right away.
      return Promise.resolve();
    }
  };

  // Write to the clipboard.
  const writeClipboard = () => {
    // Use the Clipboard API if available.
    if (navigator.clipboard && navigator.clipboard.writeText) {
      // If this fails (perhaps due to focus changing windows), fallback to the
      // legacy copy method.
      return navigator.clipboard.writeText(str)
        .catch(execCommand);
    } else {
      // No Clipboard API, so use the old execCommand style.
      return execCommand();
    }
  };

  // Write to the clipboard using the legacy execCommand method.
  // TODO: Once we can rely on the Clipboard API everywhere, we can simplify
  // this a lot by deleting the custom selection logic.
  const execCommand = () => {
    const copySource = document.createElement('pre');
    copySource.id = 'hterm:copy-to-clipboard-source';
    copySource.textContent = str;
    copySource.style.cssText = (
        'user-select: text;' +
        'position: absolute;' +
        'top: -99px');

    document.body.appendChild(copySource);

    const selection = document.getSelection();
    const anchorNode = selection.anchorNode;
    const anchorOffset = selection.anchorOffset;
    const focusNode = selection.focusNode;
    const focusOffset = selection.focusOffset;

    // FF sometimes throws NS_ERROR_FAILURE exceptions when we make this call.
    // Catch it because a failure here leaks the copySource node.
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1178676
    try {
      selection.selectAllChildren(copySource);
    } catch (ex) {
      // FF workaround.
    }

    try {
      document.execCommand('copy');
    } catch (firefoxException) {
      // Ignore this. FF throws an exception if there was an error, even
      // though the spec says just return false.
    }

    // IE doesn't support selection.extend.  This means that the selection won't
    // return on IE.
    if (selection.extend) {
      // When running in the test harness, we won't have any related nodes.
      if (anchorNode) {
        selection.collapse(anchorNode, anchorOffset);
      }
      if (focusNode) {
        selection.extend(focusNode, focusOffset);
      }
    }

    copySource.parentNode.removeChild(copySource);

    // Since execCommand is synchronous, resolve right away.
    return Promise.resolve();
  };

  // Kick it all off!
  return requestPermission().then(writeClipboard);
};

/**
 * Return a formatted message in the current locale.
 *
 * @param {string} name The name of the message to return.
 * @param {!Array<string>=} args The message arguments, if required.
 * @param {string=} string The default message text.
 * @return {string} The localized message.
 */
hterm.msg = function(name, args = [], string = '') {
  return hterm.messageManager.get('HTERM_' + name, args, string);
};

/**
 * Create a new notification.
 *
 * @param {{title:(string|undefined), body:(string|undefined)}=} params Various
 *     parameters for the notification.
 *     title The title (defaults to the window's title).
 *     body The message body (main text).
 * @return {!Notification}
 */
hterm.notify = function(params) {
  const def = (curr, fallback) => curr !== undefined ? curr : fallback;
  if (params === undefined || params === null) {
    params = {};
  }

  // Merge the user's choices with the default settings.  We don't take it
  // directly in case it was stuffed with excess junk.
  const options = {
      'body': params.body,
      'icon': def(params.icon, lib.resource.getDataUrl('hterm/images/icon-96')),
  };

  let title = def(params.title, window.document.title);
  if (!title) {
    title = 'hterm';
  }
  title = lib.f.replaceVars(hterm.desktopNotificationTitle, {'title': title});

  const n = new Notification(title, options);
  n.onclick = function() {
    window.focus();
    n.close();
  };
  return n;
};

/**
 * Launches url in a new tab.
 *
 * @param {string} url URL to launch in a new tab.
 */
hterm.openUrl = function(url) {
  if (window.chrome && chrome.browser && chrome.browser.openTab) {
    // For Chrome v2 apps, we need to use this API to properly open windows.
    chrome.browser.openTab({'url': url});
  } else {
    const win = lib.f.openWindow(url, '_blank');
    win.focus();
  }
};

/**
 * Constructor for a hterm.Size record.
 *
 * Instances of this class have public read/write members for width and height.
 *
 * @param {number} width The width of this record.
 * @param {number} height The height of this record.
 * @constructor
 */
hterm.Size = function(width, height) {
  this.width = width;
  this.height = height;
};

/**
 * Adjust the width and height of this record.
 *
 * @param {number} width The new width of this record.
 * @param {number} height The new height of this record.
 */
hterm.Size.prototype.resize = function(width, height) {
  this.width = width;
  this.height = height;
};

/**
 * Return a copy of this record.
 *
 * @return {!hterm.Size} A new hterm.Size instance with the same width and
 *     height.
 */
hterm.Size.prototype.clone = function() {
  return new hterm.Size(this.width, this.height);
};

/**
 * Set the height and width of this instance based on another hterm.Size.
 *
 * @param {!hterm.Size} that The object to copy from.
 */
hterm.Size.prototype.setTo = function(that) {
  this.width = that.width;
  this.height = that.height;
};

/**
 * Test if another hterm.Size instance is equal to this one.
 *
 * @param {!hterm.Size} that The other hterm.Size instance.
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
 * @override
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
 * @param {number} row The row of this record.
 * @param {number} column The column of this record.
 * @param {boolean=} overflow Optional boolean indicating that the RowCol
 *     has overflowed.
 * @constructor
 */
hterm.RowCol = function(row, column, overflow = false) {
  this.row = row;
  this.column = column;
  this.overflow = !!overflow;
};

/**
 * Adjust the row and column of this record.
 *
 * @param {number} row The new row of this record.
 * @param {number} column The new column of this record.
 * @param {boolean=} overflow Optional boolean indicating that the RowCol
 *     has overflowed.
 */
hterm.RowCol.prototype.move = function(row, column, overflow = false) {
  this.row = row;
  this.column = column;
  this.overflow = !!overflow;
};

/**
 * Return a copy of this record.
 *
 * @return {!hterm.RowCol} A new hterm.RowCol instance with the same row and
 *     column.
 */
hterm.RowCol.prototype.clone = function() {
  return new hterm.RowCol(this.row, this.column, this.overflow);
};

/**
 * Set the row and column of this instance based on another hterm.RowCol.
 *
 * @param {!hterm.RowCol} that The object to copy from.
 */
hterm.RowCol.prototype.setTo = function(that) {
  this.row = that.row;
  this.column = that.column;
  this.overflow = that.overflow;
};

/**
 * Test if another hterm.RowCol instance is equal to this one.
 *
 * @param {!hterm.RowCol} that The other hterm.RowCol instance.
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
 * @override
 */
hterm.RowCol.prototype.toString = function() {
  return ('[hterm.RowCol: ' + this.row + ', ' + this.column + ', ' +
          this.overflow + ']');
};
