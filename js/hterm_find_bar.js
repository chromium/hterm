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

  /**
   * True if find bar input has focus.
   *
   * @type {boolean}
   */
  this.hasFocus = false;

  /** @private {?Element} */
  this.upArrowButton_ = null;

  /** @private {?Element} */
  this.downArrowButton_ = null;

  /** @private {?Element} */
  this.closeButton_ = null;

  /** @private {?Element} */
  this.counterLabel_ = null;

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
   * Timeout ID of pending row changes.
   * Null indicates no row change is scheduled.
   *
   * @private {?number}
   */
  this.pendingNotifyChanges_ = null;

  /**
   * List of rows which are changed on terminal.
   *
   * @private {!Set<number>}
   * @const
   */
  this.changedRows_ = new Set();

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
  this.batchSize = 500;

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
  this.selectedRowNum_ = 0;

  /**
   * Index of selected result in its row.
   *
   * @private {number}
   */
  this.selectedRowIndex_ = 0;

  /**
   * Index of selected result among all results.
   * -1 indicates that there is no current selected result.
   *
   * @private {number}
   */
  this.selectedOrdinal_ = -1;

  /** @private {number} */
  this.resultCount_ = 0;

  /**
   * Search match which is currently selected and will have a different
   * highlight color.
   *
   * @private {?Element}
   */
  this.selectedResult_ = null;

  /**
   * Sorted list of matching row numbers.
   *
   * @private {!Array<number>}
   * @const
   */
  this.matchingRowsIndex_ = [];

  /**
   * Set to false when the line with the current selected result is
   * changed by the terminal and there is no longer a match on that line.
   * This will be set back to true when the user next selects up or down.
   *
   * @private {boolean}
   */
  this.selectedResultKnown_ = true;
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
  this.upArrowButton_ = this.findBar_.querySelector('#hterm\\:find-bar-up');
  this.downArrowButton_ = this.findBar_.querySelector('#hterm\\:find-bar-down');
  this.closeButton_ = this.findBar_.querySelector('#hterm\\:find-bar-close');
  this.counterLabel_ = this.findBar_.querySelector('#hterm\\:find-bar-count');

  // Add aria-label and svg icons.
  this.upArrowButton_.innerHTML = lib.resource
      .getData('hterm/images/keyboard_arrow_up');
  this.downArrowButton_.innerHTML = lib.resource
      .getData('hterm/images/keyboard_arrow_down');
  this.closeButton_.innerHTML = lib.resource.getData('hterm/images/close');

  this.upArrowButton_.setAttribute('aria-label', hterm.msg('BUTTON_PREVIOUS'));
  this.downArrowButton_.setAttribute('aria-label', hterm.msg('BUTTON_NEXT'));
  this.input_.setAttribute('aria-label', hterm.msg('BUTTON_FIND'));
  this.closeButton_.setAttribute('aria-label', hterm.msg('BUTTON_CLOSE'));

  // Add event listeners to the elements.
  const el = (e) => /** @type {!EventListener} */ (e.bind(this));
  this.input_.addEventListener('input', el(this.onInput_));
  this.input_.addEventListener('keydown', el(this.onKeyDown_));
  this.input_.addEventListener('keypress', el(this.onKeyPressed_));
  this.input_.addEventListener('textInput', el(this.onInputText_));
  this.input_.addEventListener('focus', el(() => { this.hasFocus = true; }));
  this.input_.addEventListener('blur', el(() => { this.hasFocus = false; }));
  this.closeButton_.addEventListener('click', el(this.close));
  this.upArrowButton_.addEventListener('click', el(this.onPrevious_));
  this.downArrowButton_.addEventListener('click', el(this.onNext_));

  document.body.appendChild(this.findBar_);

  this.resultScreen_ = document.createElement('div');
  this.resultScreen_.id = 'hterm:find-result-screen';
  this.resultScreen_.innerHTML = lib.resource.getData('hterm/html/find_screen');
  this.resultScreen_.style.display = 'none';
  document.body.appendChild(this.resultScreen_);
};

/**
 * Display find bar.
 */
hterm.FindBar.prototype.display = function() {
  this.scrollPort_.subscribe('scroll', this.onScroll_);

  this.findBar_.classList.add('enabled');
  this.findBar_.removeAttribute('aria-hidden');
  this.input_.focus();
  this.resultScreen_.style.display = '';
  this.isVisible = true;

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
  this.isVisible = false;

  this.stopSearch();
  this.results_ = {};
  this.resultCount_ = 0;
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
  this.matchingRowsIndex_.length = 0;
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
      // Matching rows are pushed in order of searching to keep list sorted.
      if (this.findInRow_(this.batchRow_)) {
        this.matchingRowsIndex_.push(this.batchRow_);
      }
      this.batchRow_++;
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
 * @param {boolean=} update True if row should be updated.
 * @return {boolean} True if there is a match.
 */
hterm.FindBar.prototype.findInRow_ = function(rowNum, update = false) {
  if (!this.searchText_) {
    return false;
  }

  const prev = this.results_[rowNum];
  if (prev && !update) {
    return true;
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
      this.selectedRowNum_ = rowNum;
      this.selectedOrdinal_ = 0;
      this.upArrowButton_.classList.add('enabled');
      this.downArrowButton_.classList.add('enabled');
      this.scrollToResult_();
    }
  } else {
    delete this.results_[rowNum];
  }

  // Update the matchCount.
  const diff = rowResult.length - (prev ? prev.rowResult.length : 0);
  this.resultCount_ += diff;
  if (rowNum < this.selectedRowNum_) {
    this.selectedOrdinal_ += diff;
  }

  return rowResult.length > 0;
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
  if (event.metaKey || event.altKey) {
    event.stopPropagation();
    return;
  }
  if (event.key == 'Escape') {
    this.close();
  }
  if (event.key == 'Enter') {
    if (event.shiftKey) {
      this.onPrevious_();
    } else {
      this.onNext_();
    }
  }
  // keyCode for G.
  if (event.ctrlKey && event.keyCode == 71) {
    if (event.shiftKey) {
      this.onPrevious_();
    } else {
      this.onNext_();
    }
    event.preventDefault();
  }
  // Stop Ctrl+F inside hterm find input opening browser find.
  // keyCode for F.
  if (event.ctrlKey && event.keyCode == 70) {
    event.preventDefault();
  }
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
    this.selectedRowNum_ = 0;
    this.selectedRowIndex_ = 0;
    this.selectedOrdinal_ = -1;
    this.selectedResultKnown_ = true;
    this.upArrowButton_.classList.remove('enabled');
    this.downArrowButton_.classList.remove('enabled');
  }
   // Update the counterLabel.
  if (this.selectedResultKnown_) {
    this.counterLabel_.textContent = hterm.msg(
        'FIND_COUNTER_LABEL', [this.selectedOrdinal_ + 1, this.resultCount_]);
  } else {
    this.counterLabel_.textContent = hterm.msg(
        'FIND_RESULT_COUNT', [this.resultCount_]);
  }
  this.highlightSelectedResult_();
};

/**
 * Returns the largest index of arr with arr[index] <= value, or -1.
 *
 * @param {!Array<number>} arr Array to be searched
 * @param {number} value
 * @return {number}
 */
hterm.FindBar.indexOf = function(arr, value) {
  let index = -1;
  let low = 0;
  let high = arr.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (arr[mid] <= value) {
      index = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return index;
};

/**
 * Returns true if matchingRowsIndex_ index can be used to find next
 * via binary search.
 *
 * @private
 * @param {number} step 1 to find next in down direction, -1 to find next in up
 *     direction
 * @return {boolean}
 */
hterm.FindBar.prototype.canUseMatchingRowsIndex_ = function(step) {
  // We can use the matchingRowsIndex_ index to find next via binary search
  // if either all batches are done, or if selectedRowNum_ is within the index.
  const topRowIndex = this.scrollPort_.getTopRowIndex();
  const bottomRowIndex = this.scrollPort_.getBottomRowIndex(topRowIndex);
  const index = this.matchingRowsIndex_;
  const current = this.selectedRowNum_;

  return this.batchRow_ > bottomRowIndex ||
      (step > 0 && current < index[index.length - 1]) ||
      (step < 0 && current < this.batchRow_ && current > index[0]);
};

/**
 * Select the next matching row from the current selected row in either up or
 * down direction. If batch searching is complete, moving between
 * results can be done by finding the adjacent item in matchingRowsIndex_.
 * When batching is not yet complete, we will use matchingRowsIndex_ when we
 * can, and also do a brute force search across the current visible screen,
 * but we will not allow the user to select results that are outside of the
 * visible screen, or the index.
 *
 * @param {number} step 1 to find next in down direction, -1 to find next in up
 *     direction.
 */
hterm.FindBar.prototype.selectNext_ = function(step) {
  // Increment/decrement i by s modulo len.
  const circularStep = (i, s, len) => (i + s + len) % len;
  const stepOnce = (prev, next) => step > 0 ? prev : next;

  const row = this.results_[this.selectedRowNum_];
  if (row && row.rowResult[this.selectedRowIndex_ + step] !== undefined) {
    // Move to another match on the same row.
    this.selectedRowIndex_ += step;
  } else {
    let topRowIndex = this.scrollPort_.getTopRowIndex();
    const bottomRowIndex = this.scrollPort_.getBottomRowIndex(topRowIndex);
    const index = this.matchingRowsIndex_;
    const current = this.selectedRowNum_;

    if (this.canUseMatchingRowsIndex_(step)) {
      let i = hterm.FindBar.indexOf(index, current);
      if (!this.selectedResultKnown_ && step < 0) {
        i++;
      }
      this.selectedRowNum_ = index[circularStep(i, step, index.length)];
    } else {
      // Not using the index, so brute force search in visible screen.
      let start = current + step;
      // If outside visible screen, then move to the boundary, but first adjust
      // topRowIndex for if a batch has partially covered the screen.
      topRowIndex = Math.max(topRowIndex, this.batchRow_);
      if (current < topRowIndex || current > bottomRowIndex) {
        start = stepOnce(topRowIndex, bottomRowIndex);
      }
      const end = stepOnce(bottomRowIndex + 1, topRowIndex - 1);

      // If we don't end up finding anything, use the first or last in index.
      // If the index is empty, stay where we are.
      if (index.length > 0) {
        this.selectedRowNum_ = index[stepOnce(0, index.length - 1)];
      }
      for (let i = start; i != end; i += step) {
        if (this.results_[i]) {
          this.selectedRowNum_ = i;
          break;
        }
      }
    }
    const row = this.results_[this.selectedRowNum_];
    this.selectedRowIndex_ = stepOnce(0, row.rowResult.length - 1);
  }

  // If the previous selected result was deleted and we move down,
  // then ordinal stays the same.
  const s = !this.selectedResultKnown_ && step > 0 ? 0 : step;
  this.selectedOrdinal_ = circularStep(
      this.selectedOrdinal_, s, this.resultCount_);

  this.selectedResultKnown_ = true;
  this.scrollToResult_();
  this.updateCounterLabel_();
};

/**
 * Select the next match.
 */
hterm.FindBar.prototype.onNext_ = function() {
  if (!this.downArrowButton_.classList.contains('enabled')) {
    return;
  }
  this.selectNext_(1);
};

/**
 * Select the previous match.
 */
hterm.FindBar.prototype.onPrevious_ = function() {
  if (!this.upArrowButton_.classList.contains('enabled')) {
    return;
  }
  this.selectNext_(-1);
};

/**
 * Scroll the terminal up/down depending upon the row of selected result.
 */
hterm.FindBar.prototype.scrollToResult_ = function() {
  const topRowIndex = this.scrollPort_.getTopRowIndex();
  const bottomRowIndex = this.scrollPort_.getBottomRowIndex(topRowIndex);

  if (this.selectedRowNum_ < topRowIndex ||
      this.selectedRowNum_ > bottomRowIndex) {
    this.scrollPort_.scrollRowToMiddle(this.selectedRowNum_);
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
  if (this.resultCount_ && this.selectedResultKnown_) {
    this.selectedResult_ = this.results_[this.selectedRowNum_]
        .rowResult[this.selectedRowIndex_].highlighter;
    if (this.selectedResult_) {
      this.selectedResult_.classList.add('selected');
    }
  }
};

/**
 * Synchronize changing of rows on terminal.
 *
 * The sync will happen asynchronously, soon after the call stack winds down.
 * Multiple calls will be coalesced into a single sync.
 *
 * @param {number} rowNum
 */
hterm.FindBar.prototype.scheduleNotifyChanges = function(rowNum) {
  if (!this.isVisible) {
    return;
  }
  this.changedRows_.add(rowNum);
  if (this.pendingNotifyChanges_) {
    return;
  }

  this.pendingNotifyChanges_ = setTimeout(() => {
    this.notifyChanges_();
  });
};

/**
 * Change results of all changed rows.
 */
hterm.FindBar.prototype.notifyChanges_ = function() {
  this.changedRows_.forEach((rowNum) => {
    rowNum += this.scrollPort_.getTopRowIndex();
    const prev = this.results_[rowNum];
    const found = this.findInRow_(rowNum, true);
    if (this.selectedRowNum_ == rowNum) {
      // If selected row is modified the first result of the row is selected.
      this.selectedOrdinal_ -= this.selectedRowIndex_;
      this.selectedRowIndex_ = 0;
      this.selectedResultKnown_ = found;
    }

    // Update the index if the changed row needs to be added or removed.
    if (!!prev !== found) {
      const i = hterm.FindBar.indexOf(this.matchingRowsIndex_, rowNum);
      if (found) {
        this.matchingRowsIndex_.splice(i + 1, 0, rowNum);
      } else {
        this.matchingRowsIndex_.splice(i, 1);
      }
    }
  });

  this.updateCounterLabel_();
  this.redraw_();
  this.changedRows_.clear();
  delete this.pendingNotifyChanges_;
};
