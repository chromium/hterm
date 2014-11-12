// Copyright (c) 2014 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

export var dom = {};
export default dom;

/**
 * Return decimal { width, height } for a given dom node.
 */
dom.getClientSize = function(elem) {
  return elem.getBoundingClientRect();
};

/**
 * Return decimal width for a given dom node.
 */
dom.getClientWidth = function(elem) {
  return elem.getBoundingClientRect().width;
};

/**
 * Return decimal height for a given dom node.
 */
dom.getClientHeight = function(elem) {
  return elem.getBoundingClientRect().height;
};

/**
 * Copy the current selection to the system clipboard.
 *
 * @param {HTMLDocument} The document with the selection to copy.
 */
dom.copySelectionToClipboard = function(document) {
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
 * @param {HTMLDocument} The document to paste into.
 */
dom.pasteFromClipboard = function(document) {
  try {
    document.execCommand('paste');
  } catch (firefoxException) {
    // Ignore this. FF throws an exception if there was an error, even though
    // the spec says just return false.
  }
};
