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

  /** @private {?Element} */
  this.counterLabel_ = null;

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

  /**
   * Row number of selected result.
   *
   * @private {number}
   */
  this.selectedRow_ = 0;

  /**
   * Index of selected result in its row.
   *
   * @private {number}
   */
  this.selectedRowIndex_ = 0;

  /**
   * Index of selected result among all results.
   *
   * @private {number}
   */
  this.selectedOrdinal_ = -1;

  /** @private {number} */
  this.resultCount_ = 0;

  /** @private {?Element} */
  this.selectedResult_ = null;
};

/** @typedef {{findRow: ?Element, rowResult: !Array<!hterm.FindBar.Result>}} */
hterm.FindBar.RowResult;

/** @typedef {{index: number, highlighter: ?Element}} */
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
  this.closeButton_ = this.findBar_.querySelector('#hterm\\:find-bar-close');
  this.counterLabel_ = this.findBar_.querySelector('#hterm\\:find-bar-count');

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
  this.resultScreen_.style.display = 'none';
  this.terminal_.getDocument().body.appendChild(this.resultScreen_);
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
  this.resultScreen_.style.display = '';

  // Start searching for stored text in findbar.
  this.input_.dispatchEvent(new Event('input'));
};

/**
 * Close find bar.
 */
hterm.FindBar.prototype.close = function() {
  // Clear all results of findbar.
  this.resultScreen_.style.display = 'none';

  this.scrollPort_.unsubscribe('scroll', this.onScroll_);

  this.findBar_.classList.remove('enabled');
  this.findBar_.setAttribute('aria-hidden', 'true');
  this.terminal_.focus();

  this.stopSearch();
  this.results_ = {};
  this.resultCount_ = 0;
  this.updateCounterLabel_();
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
  this.resultCount_ = 0;
  this.redraw_();
  this.updateCounterLabel_();

  // No input means no result. Just redraw the results.
  if (!this.searchText_) {
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
    ++this.batchNum_;
    this.runBatchCallbackForTest_(this.batchNum_);
    this.updateCounterLabel_();
  };
  runNextBatch();
};

/**
 * Find the results for a particular row and set them in result map.
 * TODO(crbug.com/209178): Add support for overflowed rows.
 *
 * @param {number} rowNum
 */
hterm.FindBar.prototype.findInRow_ = function(rowNum) {
  if (!this.searchText_ || this.results_[rowNum]) {
    return;
  }
  const rowText = this.terminal_.getRowText(rowNum).toLowerCase();
  const rowResult = [];

  let i;
  let startIndex = 0;
  // Find and create highlight for matching texts.
  while ((i = rowText.indexOf(this.searchText_, startIndex)) != -1) {
    rowResult.push({index: i, highlighter: null});
    startIndex = i + this.searchText_.length;
  }

  if (rowResult.length) {
    this.results_[rowNum] = {findRow: null, rowResult};
    if (this.resultCount_ === 0) {
      this.selectedRow_ = rowNum;
      this.selectedOrdinal_ = 0;
      this.scrollToResult_();
    }
  }

  this.resultCount_ += rowResult.length;
  if (rowNum < this.selectedRow_) {
    this.selectedOrdinal_ += rowResult.length;
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
 * Set the background color to highlight the selected find result.
 *
 * @param {string=} color The color to set.  If not defined, we reset to the
 *     saved user preference.
 */
hterm.FindBar.prototype.setFindResultSelectedColor =
    function(color = undefined) {
  if (color === undefined) {
    color = this.terminal_.getPrefs().getString('find-result-selected-color');
  }

  this.terminal_.setCssVar('find-result-selected-color', color);
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

  for (let rowNum = topRowIndex; rowNum <= bottomRowIndex; rowNum++) {
    const newRow = this.fetchRowNode_(rowNum);
    this.resultScreen_.appendChild(newRow);
    this.visibleRows_.push(newRow);
  }

  delete this.pendingRedraw_;
  this.highlightSelectedResult_();
};

/**
 * Fetch find row element. If find-row is not available in results, it creates
 * a new one and store it in results.
 *
 * @param {number} rowNum
 * @return {!Element}
 */
hterm.FindBar.prototype.fetchRowNode_ = function(rowNum) {
  // Process row if batch hasn't yet got to it.
  if (rowNum >= this.batchRow_) {
    this.findInRow_(rowNum);
  }
  const row = this.results_[rowNum];
  if (row && row.findRow) {
    return row.findRow;
  }

  // Create a new find-row.
  const findRow = this.terminal_.getDocument().createElement('find-row');
  if (!row) {
    return findRow;
  }
  row.rowResult.forEach((result) => {
    const highlighter = this.terminal_.getDocument().createElement('div');
    highlighter.classList.add('find-highlighter');
    highlighter.style.left =
        `calc(var(--hterm-charsize-width) * ${result.index})`;
    highlighter.style.width =
       `calc(var(--hterm-charsize-width) * ${this.searchText_.length})`;
    result.highlighter = highlighter;
    findRow.appendChild(highlighter);
  });
  return row.findRow = findRow;
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

/**
 * Update the counterLabel for findbar.
 */
hterm.FindBar.prototype.updateCounterLabel_ = function() {
  // Reset the counterLabel if no results are present.
  if (this.resultCount_ === 0) {
    this.selectedRow_ = 0;
    this.selectedRowIndex_ = 0;
    this.selectedOrdinal_ = -1;
  }
  // Update the counterLabel.
  this.counterLabel_.textContent = hterm.msg('FIND_MATCH_COUNT',
      [this.selectedOrdinal_ + 1, this.resultCount_]);
  this.highlightSelectedResult_();
};

/**
 * Scroll the terminal up/down depending upon the row of selected result.
 */
hterm.FindBar.prototype.scrollToResult_ = function() {
  const topRowIndex = this.scrollPort_.getTopRowIndex();
  const bottomRowIndex = this.scrollPort_.getBottomRowIndex(topRowIndex);

  if (this.selectedRow_ < topRowIndex || this.selectedRow_ > bottomRowIndex) {
    this.scrollPort_.scrollRowToMiddle(this.selectedRow_);
  }
};

/**
 * Sets CSS to highlight selected result.
 */
hterm.FindBar.prototype.highlightSelectedResult_ = function() {
  // Remove selected result.
  if (this.selectedResult_) {
    this.selectedResult_.classList.remove('selected');
    this.selectedResult_ = null;
  }

  // Select new instance of result.
  if (this.resultCount_) {
    this.selectedResult_ = this.results_[this.selectedRow_]
        .rowResult[this.selectedRowIndex_].highlighter;
    if (this.selectedResult_) {
      this.selectedResult_.classList.add('selected');
    }
  }
};
