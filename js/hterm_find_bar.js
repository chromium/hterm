// Copyright 2020 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview Find bar handling.
 */

/**
 * Manage the find bar.
 *
 * @param {!hterm.Terminal} terminal
 * @constructor
 */
hterm.FindBar = function(terminal) {
  /**
   * @private {!hterm.Terminal}
   * @const
   */
  this.terminal_ = terminal;

  /** @private {?Element} */
  this.findBar_ = null;

  /** @private {?Element} */
  this.input_ = null;

  /** @private {?Element} */
  this.upArrow_ = null;

  /** @private {?Element} */
  this.downArrow_ = null;

  /** @private {?Element} */
  this.closeButton_ = null;

  /** @type {boolean} */
  this.underTest = false;

  /**
   * Stores current search results mapping row number to a list of row indices.
   *
   * @private {!Object<number, !Array<number>>}
   */
  this.results_ = {};

  /**
   * Timeout ID of pending find batch to run.
   * Null indicates no search in progress.
   *
   * @private {?number}
   */
  this.pendingFind_ = null;

  /**
   * Lower case of find input field.
   *
   * @private {string}
   */
  this.searchText_ = '';

  /** @private {number} */
  this.batchNum_ = 0;

  /**
   * Callbacks to run after the specified batch. Used for testing.
   *
   * @private {!Object<number, function()>}
   * @const
   */
  this.batchCallbacksForTest_ = {};

  /** @type {number} */
  this.batchSize = 50;
};

/**
 * Add find bar to the terminal.
 *
 * @param {!Document} document
 */
hterm.FindBar.prototype.decorate = function(document) {
  this.findBar_ = document.createElement('div');
  this.findBar_.id = 'hterm:find-bar';
  this.findBar_.setAttribute('aria-hidden', 'true');
  this.findBar_.innerHTML = lib.resource.getData('hterm/html/find_bar');

  this.input_ = this.findBar_.querySelector('input');
  this.upArrow_ = this.findBar_.querySelector('#hterm\\:find-bar-up');
  this.downArrow_ = this.findBar_.querySelector('#hterm\\:find-bar-down');
  this.closeButton_ = this.findBar_.querySelector('#hterm\\:find-bar-close');

  // Add aria-label and svg icons.
  this.upArrow_.innerHTML = lib.resource
      .getData('hterm/images/keyboard_arrow_up');
  this.downArrow_.innerHTML = lib.resource
      .getData('hterm/images/keyboard_arrow_down');
  this.closeButton_.innerHTML = lib.resource.getData('hterm/images/close');

  this.upArrow_.setAttribute('aria-label', hterm.msg('BUTTON_PREVIOUS'));
  this.downArrow_.setAttribute('aria-label', hterm.msg('BUTTON_NEXT'));
  this.input_.setAttribute('aria-label', hterm.msg('BUTTON_FIND'));
  this.closeButton_.setAttribute('aria-label', hterm.msg('BUTTON_CLOSE'));

  // Add event listeners to the elements.
  const el = (e) => /** @type {!EventListener} */ (e.bind(this));
  this.input_.addEventListener('input', el(this.onInput_));
  this.input_.addEventListener('keydown', el(this.onKeyDown_));
  this.input_.addEventListener('keypress', el(this.onKeyPressed_));
  this.input_.addEventListener('textInput', el(this.onInputText_));
  this.closeButton_.addEventListener('click', el(this.close));

  document.body.appendChild(this.findBar_);
};

/**
 * Display find bar.
 */
hterm.FindBar.prototype.display = function() {
  if (!this.underTest) {
    // TODO(crbug.com/209178): To be implemented.
    return;
  }
  this.findBar_.classList.add('enabled');
  this.findBar_.removeAttribute('aria-hidden');
  this.input_.focus();

  // Start searching for stored text in findbar.
  this.input_.dispatchEvent(new Event('input'));
};

/**
 * Close find bar.
 */
hterm.FindBar.prototype.close = function() {
  this.findBar_.classList.remove('enabled');
  this.findBar_.setAttribute('aria-hidden', 'true');
  this.terminal_.focus();

  this.stopSearch();
  this.results_ = {};
};

/**
 * Clears any pending find batch.
 */
hterm.FindBar.prototype.stopSearch = function() {
  if (this.pendingFind_ !== null) {
    clearTimeout(this.pendingFind_);
    this.pendingFind_ = null;
  }
  this.runBatchCallbackForTest_(0);
};

/**
 * Enable batch-wise searching when search text changes.
 */
hterm.FindBar.prototype.syncResults_ = function() {
  this.batchNum_ = 0;
  // Clear all the results.
  this.results_ = {};

  // No input text means no results.
  if (this.searchText_ == '') {
    return;
  }

  let row = 0;
  const rowCount = this.terminal_.getRowCount();
  const runNextBatch = () => {
    const batchEnd = Math.min(row + this.batchSize, rowCount);
    while (row < batchEnd) {
      this.findInRow_(row++);
    }
    this.runBatchCallbackForTest_(++this.batchNum_);
    if (row < rowCount) {
      this.pendingFind_ = setTimeout(runNextBatch);
    } else {
      this.stopSearch();
    }
  };
  runNextBatch();
};

/**
 * Find the results for a particular row and set them in result map.
 * TODO(crbug.com/209178): Add support for overflowed rows.
 *
 * @param {number} row
 */
hterm.FindBar.prototype.findInRow_ = function(row) {
  const rowText = this.terminal_.getRowText(row).toLowerCase();
  const rowResult = [];
  let i;
  let startIndex = 0;

  // Find and create highlight for matching texts.
  while ((i = rowText.indexOf(this.searchText_, startIndex)) != -1) {
    rowResult.push(i);
    startIndex = i + this.searchText_.length;
  }

  if (rowResult.length) {
    this.results_[row] = rowResult;
  }
};

/**
 * @param {!Event} event The event triggered on input in find bar.
 */
hterm.FindBar.prototype.onInput_ = function(event) {
  this.searchText_ = event.target.value.toLowerCase();

  // If a batch is already pending, reset it.
  clearTimeout(this.pendingFind_);
  this.pendingFind_ = setTimeout(() => this.syncResults_());
};

/**
 * @param {!Event} event The event triggered on key press in find bar.
 */
hterm.FindBar.prototype.onKeyPressed_ = function(event) {
  event.stopPropagation();
};

/**
 * @param {!Event} event The event triggered on text input in find bar.
 */
hterm.FindBar.prototype.onInputText_ = function(event) {
  event.stopPropagation();
};

/**
 * @param {!Event} event The event triggered on keydown in find bar.
 */
hterm.FindBar.prototype.onKeyDown_ = function(event) {
  if (event.key == 'Escape') {
    this.close();
  }
  // TODO(crbug.com/209178): To be implemented.
  event.stopPropagation();
};

/**
 * Set the background color to highlight find results.
 *
 * @param {string=} color The color to set.  If not defined, we reset to the
 *     saved user preference.
 */
hterm.FindBar.prototype.setFindResultColor = function(color) {
  if (color === undefined) {
    color = this.terminal_.getPrefs().getString('find-result-color');
  }

  this.terminal_.setCssVar('find-result-color', color);
};

/**
 * Register a callback to be run after the specified batch (1-based).
 * Use batchNum 0 to set a callback to be run when search stops.
 * Used for testing.
 *
 * @param {number} batchNum
 * @param {function()} callback
 */
hterm.FindBar.prototype.setBatchCallbackForTest = function(batchNum, callback) {
  this.batchCallbacksForTest_[batchNum] = callback;
};

/**
 * Runs the specified batch callback if it exists and removes it.
 *
 * @param {number} batchNum
 * @private
 */
hterm.FindBar.prototype.runBatchCallbackForTest_ = function(batchNum) {
  const callback = this.batchCallbacksForTest_[batchNum];
  if (callback) {
    callback();
    delete this.batchCallbacksForTest_[batchNum];
  }
};
