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

  /**
   * @private {!hterm.ScrollPort}
   * @const
   */
  this.scrollPort_ = terminal.getScrollPort();

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
   * Stores current search results mapping row number to row results.
   * Also works as cache for find-rows.
   *
   * @private {!Object<number, !hterm.FindBar.RowResult>}
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
   * Timeout ID of pending redraw.
   * Null indicates no redraw is scheduled.
   *
   * @private {?number}
   */
  this.pendingRedraw_ = null;

  /**
   * Lower case of find input field.
   *
   * @private {string}
   */
  this.searchText_ = '';

  /** @private {number} */
  this.batchRow_ = 0;

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

  /**
   * Findbar is visible or not.
   *
   * @type {boolean}
   */
  this.isVisible = false;

  /**
   * Keep track of visible rows.
   *
   * @private {!Array<!Element>}
   */
  this.visibleRows_ = [];

  /**
   * Listens for scroll events and redraws results.
   *
   * @private {function()}
   * @const
   */
  this.onScroll_ = this.scheduleRedraw_.bind(this);
};

/** @typedef {{findRow: ?Element, rowResult: !Array<!hterm.FindBar.Result>}} */
hterm.FindBar.RowResult;

/** @typedef {{index: number, wrapper: ?Element}} */
hterm.FindBar.Result;

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

  this.resultScreen_ = document.createElement('div');
  this.resultScreen_.id = 'hterm:find-result-screen';
  this.resultScreen_.innerHTML = lib.resource.getData('hterm/html/find_screen');
};

/**
 * Display find bar.
 */
hterm.FindBar.prototype.display = function() {
  if (!this.underTest) {
    // TODO(crbug.com/209178): To be implemented.
    return;
  }

  this.scrollPort_.subscribe('scroll', this.onScroll_);

  this.findBar_.classList.add('enabled');
  this.findBar_.removeAttribute('aria-hidden');
  this.input_.focus();

  this.terminal_.getDocument().body.appendChild(this.resultScreen_);

  // Start searching for stored text in findbar.
  this.input_.dispatchEvent(new Event('input'));
};

/**
 * Close find bar.
 */
hterm.FindBar.prototype.close = function() {
  // Clear all results of findbar.
  this.resultScreen_.remove();

  this.scrollPort_.unsubscribe('scroll', this.onScroll_);

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
  this.batchRow_ = 0;
  this.batchNum_ = 0;
  this.results_ = {};
  this.redraw_();

  // No input means no result. Just redraw the results.
  if (this.searchText_ == '') {
    return;
  }

  const rowCount = this.terminal_.getRowCount();
  const runNextBatch = () => {
    const batchEnd = Math.min(this.batchRow_ + this.batchSize, rowCount);
    while (this.batchRow_ < batchEnd) {
      this.findInRow_(this.batchRow_++);
    }
    if (this.batchRow_ < rowCount) {
      this.pendingFind_ = setTimeout(runNextBatch);
    } else {
      this.stopSearch();
    }
    this.runBatchCallbackForTest_(++this.batchNum_);
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
  if (this.searchText_ == '') {
    return;
  }
  const rowText = this.terminal_.getRowText(row).toLowerCase();
  const rowResult = [];

  let i;
  let startIndex = 0;
  // Find and create highlight for matching texts.
  while ((i = rowText.indexOf(this.searchText_, startIndex)) != -1) {
    rowResult.push({index: i, wrapper: null});
    startIndex = i + this.searchText_.length;
  }
  if (rowResult.length && !this.results_[row]) {
    this.results_[row] = {findRow: null, rowResult};
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
  // Stop Ctrl+F inside hterm find input opening browser find.
  if (event.ctrlKey && event.key == 'f') {
    event.preventDefault();
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
 * Redraws the results of findbar on find result screen.
 */
hterm.FindBar.prototype.redraw_ = function() {
  const topRowIndex = this.scrollPort_.getTopRowIndex();
  const bottomRowIndex = this.scrollPort_.getBottomRowIndex(topRowIndex);

  // Clear the find result screen.
  this.visibleRows_.forEach((row) => {
    row.remove();
  });
  this.visibleRows_ = [];

  for (let row = topRowIndex; row <= bottomRowIndex; row++) {
    const newRow = this.fetchRowNode_(row);
    this.resultScreen_.appendChild(newRow);
    this.visibleRows_.push(newRow);
  }
};

/**
 * Fetch find row element. If find-row is not available in results, it creates
 * a new one and store it in results.
 *
 * @param {number} row
 * @return {!Element}
 */
hterm.FindBar.prototype.fetchRowNode_ = function(row) {
  // Process row if batch hasn't yet got to it.
  if (row > this.batchRow_) {
    this.findInRow_(row);
  }
  const result = this.results_[row];
  if (result && result.findRow) {
    return result.findRow;
  }

  // Create a new find-row.
  const findRow = this.terminal_.getDocument().createElement('find-row');
  if (!result) {
    return findRow;
  }
  result.rowResult.forEach((result) => {
    const wrapper = this.terminal_.getDocument().createElement('div');
    wrapper.classList.add('wrapper');
    wrapper.style.left = `calc(var(--hterm-charsize-width) * ${result.index})`;
    wrapper.style.width =
       `calc(var(--hterm-charsize-width) * ${this.searchText_.length})`;
    result.wrapper = wrapper;
    findRow.appendChild(wrapper);
  });
  return result.findRow = findRow;
};

/**
 * Synchronize redrawing of search results present on the screen.
 *
 * The sync will happen asynchronously, soon after the call stack winds down.
 * Multiple calls will be coalesced into a single sync.
 */
hterm.FindBar.prototype.scheduleRedraw_ = function() {
  if (this.pendingRedraw_) {
    return;
  }
  this.pendingRedraw_ = setTimeout(() => {
    this.redraw_();
    delete this.pendingRedraw_;
  });
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
