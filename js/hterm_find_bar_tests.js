// Copyright 2020 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview hterm.FindBar unit tests.
 */

describe('hterm_find_bar_tests.js', () => {

/**
 * Ensure fresh terminal is used for every test case.
 */
beforeEach(function(done) {
  const document = window.document;

  const div = this.div = document.createElement('div');
  div.style.position = 'absolute';
  div.style.height = '100%';
  div.style.width = '100%';

  const width = 25;
  const height = 4;

  document.body.appendChild(div);

  this.terminal = new hterm.Terminal();
  this.terminal.decorate(div);
  this.terminal.setWidth(width);
  this.terminal.setHeight(height);
  this.terminal.onTerminalReady = () => {
    this.terminal.installKeyboard();
    this.findBar = this.terminal.findBar;
    this.document = this.terminal.getDocument();
    this.scrollPort = this.terminal.getScrollPort();

    // Store HTML elements.
    /** @suppress {visibility} */
    this.findBarDiv = this.findBar.findBar_;
    /** @suppress {visibility} */
    this.inputElement = this.findBar.input_;
    /** @suppress {visibility} */
    this.closeButton = this.findBar.closeButton_;

    // Add check to indicate test state.
    this.findBar.underTest = true;
    done();
  };
});

/**
 * Remove the terminal.
 */
afterEach(function() {
  window.document.body.removeChild(this.div);
});

function setInputElementValue(value, inputElement) {
  inputElement.value = value;
  inputElement.dispatchEvent(new Event('input'), {
    bubbles: true,
  });
}

const classes = (ele) => Array.from(ele.classList.values());

/**
 * Test if find bar is not visible when disabled and vice-versa.
 */
it('findbar-visible', function() {
  // Find bar should be non-null, closed by default and not visible.
  assert(this.findBarDiv);
  assert.notInclude(classes(this.findBarDiv), 'enabled');
  assert.isAtMost(this.findBarDiv.getBoundingClientRect().bottom, 0);

  this.findBar.display();
  assert.include(classes(this.findBarDiv), 'enabled');

  this.findBar.close();
  assert.notInclude(classes(this.findBarDiv), 'enabled');
});

/**
 * Test if find bar opens when Ctrl+Shift+F key is pressed
 * and closes when ESC key is pressed.
 */
it('open-findbar-on-keys-pressed', function() {
  this.document.body.dispatchEvent(new KeyboardEvent('keydown', {
    keyCode: 70,   // keyCode for key F.
    ctrlKey: true,
    shiftKey: true,
    bubbles: true,
  }));

  assert.include(classes(this.findBarDiv), 'enabled');
  assert.equal(this.document.activeElement, this.inputElement);

  this.inputElement.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
  }));
  assert.notInclude(classes(this.findBarDiv), 'enabled');
});

/**
 * Test find bar close button.
 */
it('close-findbar-on-close-button-clicked', function() {
  this.findBar.display();
  this.closeButton.dispatchEvent(new Event('click', {
    bubbles: true,
  }));
  assert.notInclude(classes(this.findBarDiv), 'enabled');
});

/**
 * Test with fake input in find bar.
 */
it('handles-findbar-input', function() {
  this.findBar.display();

  setInputElementValue('Hello World', this.inputElement);

  assert.equal(this.inputElement.value, 'Hello World');
  assert.equal(this.document.activeElement, this.inputElement);
});

const extractIndexes = (results) => {
  return Object.fromEntries(Object.entries(results).map(
      ([rowNum, v]) => [rowNum, v.rowResult.map((row) => row.index)]));
};

/**
 * Test findInRow.
 */
it('finds-matches-in-a-row-and-updates-count', function(done) {
  this.terminal.io.println('Findbar Findbar Findbar');
  for (let i = 0; i < 10; i++) {
    this.terminal.io.println('No matches in this row.');
  }
  this.terminal.io.println('Findbar Findbar Findbar');
  this.findBar.searchText_ = 'findbar';

  // Wait for scrollDown in terminal.js.
  setTimeout(() => {
    this.scrollPort.scrollRowToTop(0);
    // Wait to scroll to top.
    setTimeout(() => {
      // Rows with matches should be added to results and scroll to
      // first result at middle of screen.
      this.findBar.findInRow_(11);
      assert.deepEqual(extractIndexes(this.findBar.results_), {11: [0, 8, 16]});
      assert.equal(this.findBar.resultCount_, 3);
      assert.equal(this.scrollPort.getTopRowIndex(), 10);
      assert.equal(this.findBar.selectedOrdinal_, 0);

      // Rows with no matches should not be added to results.
      this.findBar.findInRow_(1);
      assert.deepEqual(extractIndexes(this.findBar.results_), {11: [0, 8, 16]});
      assert.equal(this.findBar.resultCount_, 3);
      assert.equal(this.scrollPort.getTopRowIndex(), 10);
      assert.equal(this.findBar.selectedOrdinal_, 0);

      // Rows above selected result with matches should be added to results.
      this.findBar.findInRow_(0);
      assert.deepEqual(extractIndexes(this.findBar.results_), {11: [0, 8, 16],
          0: [0, 8, 16]});
      assert.equal(this.findBar.resultCount_, 6);
      assert.equal(this.scrollPort.getTopRowIndex(), 10);
      assert.equal(this.findBar.selectedOrdinal_, 3);
      done();
    });
  }, 10);
});

/**
 * Close findbar during search.
 */
it('stops-search-when-findbar-closes', function(done) {
  for (let i = 0; i < 10; i++) {
    this.terminal.io.println('Findbar Findbar Findbar');
  }

  // Close after 3rd batch and ensure search stops.
  this.findBar.setBatchCallbackForTest(0, done);
  this.findBar.setBatchCallbackForTest(3, () => {
    this.findBar.close();
  });
  this.findBar.setBatchCallbackForTest(4, assert.fail);

  this.findBar.display();
  this.findBar.batchSize = 2;
  setInputElementValue('fInDbAr', this.inputElement);
});

/**
 * Change search in the middle of the searching process.
 */
it('clears-results-and-restarts-when-input-changes', function(done) {
  this.terminal.io.println('Findbar Findbar Findbar');
  for (let i = 0; i < 9; i++) {
    this.terminal.io.println('No match');
  }

  this.findBar.setBatchCallbackForTest(0, () => {
    assert.deepEqual(extractIndexes(this.findBar.results_), {0: [4, 12, 20]});
    done();
  });

  this.findBar.setBatchCallbackForTest(3, () => {
    assert.deepEqual(extractIndexes(this.findBar.results_), {0: [0, 8, 16]});
    setInputElementValue('bAr', this.inputElement);
  });

  this.findBar.setBatchCallbackForTest(4, () => {
    assert.deepEqual(extractIndexes(this.findBar.results_), {0: [4, 12, 20]});
  });

  this.findBar.display();
  this.findBar.batchSize = 2;
  setInputElementValue('fInDbAr', this.inputElement);
});

const getDiffBoundingClientRect = (element1, element2) => {
  const rect1 = element1.getBoundingClientRect();
  const rect2 = element2.getBoundingClientRect();
  return {
    top: Math.abs(rect1.top - rect2.top),
    left: Math.abs(rect1.left - rect2.left),
    width: Math.abs(rect1.width - rect2.width),
    height: Math.abs(rect1.height - rect2.height),
  };
};

/**
 * Test redraw.
 */
it('draws-results-on-screen-and-first-result-is-selected', function() {
  this.terminal.io.println('Findbar is here.');
  this.terminal.io.println('Here is the findbar.');

  this.findBar.searchText_ = 'findbar';
  this.findBar.batchRow_ = 0;
  const doc = this.document;
  doc.body.appendChild(this.findBar.resultScreen_);
  this.findBar.redraw_();
  this.findBar.resultScreen_.style.display = '';

  // First result should be selected.
  const highlighter1 = this.findBar.results_[0].rowResult[0].highlighter;
  assert.include(classes(highlighter1), 'selected');

  // highlighter should be on top of matching text.
  const range = doc.createRange();
  this.terminal.screen_.setRange_(this.terminal.getRowNode(0), 0, 7, range);
  Object.values(getDiffBoundingClientRect(range, highlighter1))
      .forEach((value) => {
        assert.isAtMost(value, 1);
      });

  // highlighter should be on top of matching text.
  const highlighter2 = this.findBar.results_[1].rowResult[0].highlighter;
  this.terminal.screen_.setRange_(this.terminal.getRowNode(1), 12, 19, range);
  Object.values(getDiffBoundingClientRect(range, highlighter2))
      .forEach((value) => {
        assert.isAtMost(value, 1);
      });
});

/**
 * Test findbar counter.
 */
it('changes-count-of-results', function(done) {
  for (let i = 0; i < 6; i++) {
    this.terminal.io.println('Findbar Findbar Findbar');
  }

  this.findBar.setBatchCallbackForTest(0, () => {
    assert.equal(this.findBar.counterLabel_.textContent,
        hterm.msg('FIND_MATCH_COUNT', [13, 18]));
    done();
  });

  this.findBar.display();
  this.findBar.batchSize = 2;
  setInputElementValue('fInDbAr', this.inputElement);
});

/**
 * Test indexOf.
 */
it('finds-index-of', function() {
  const arr = [1, 2, 4, 4, 5];
  [
    [0, -1],
    [1, 0],
    [2, 1],
    [3, 1],
    [4, 3],
    [5, 4],
    [6, 4],
  ].forEach(([n, expected]) => {
    assert.equal(hterm.FindBar.indexOf(arr, n), expected);
  });
});

/**
 * Test canUseMatchingRowsIndex_.
 */
it('uses-index-correctly', function() {
  const expectCanUseMatchingRowsIndex = (selectedRow, step, expected) => {
    this.findBar.selectedRow_ = selectedRow;
    assert.equal(this.findBar.canUseMatchingRowsIndex_(step), expected);
  };

  // Screen height is 4, topRowIndex == 0, bottomRowIndex == 2.
  // Test when batching is complete.
  assert.equal(this.terminal.getRowCount(), 4);
  assert.equal(this.findBar.scrollPort_.getTopRowIndex(), 0);
  assert.equal(this.findBar.scrollPort_.getBottomRowIndex(0), 2);
  this.findBar.batchRow_ = 5;
  for (let i = 0; i < 4; i++) {
    expectCanUseMatchingRowsIndex(i, -1, true);
    expectCanUseMatchingRowsIndex(i, 1, true);
  }

  // Test when batching is incomplete
  this.findBar.batchRow_ = 2;
  this.findBar.matchingRowsIndex_ = [0, 1];

  expectCanUseMatchingRowsIndex(0, 1, true);
  expectCanUseMatchingRowsIndex(1, 1, false);
  expectCanUseMatchingRowsIndex(2, 1, false);
  expectCanUseMatchingRowsIndex(3, 1, false);
  expectCanUseMatchingRowsIndex(0, -1, false);
  expectCanUseMatchingRowsIndex(1, -1, true);
  expectCanUseMatchingRowsIndex(2, -1, false);
  expectCanUseMatchingRowsIndex(3, -1, false);
});

/**
 * Test onNext.
 */
it('finds-next', function() {
  this.terminal.io.println('Findbar Findbar');
  this.terminal.io.println('FindBar');
  for (let i = 0; i < 2; i++) {
    this.terminal.io.println('No matches in this row.');
  }
  this.terminal.io.println('Findbar FindBar');
  this.findBar.searchText_ = 'findbar';

  const expectNext = (row, index, ordinal) => {
    this.findBar.onNext_();
    assert.equal(this.findBar.selectedRow_, row);
    assert.equal(this.findBar.selectedRowIndex_, index);
    assert.equal(this.findBar.selectedOrdinal_, ordinal);
  };

  this.findBar.downArrowButton_.classList.add('enabled');

  // Searching process incomplete and canUseMatchingRowsIndex_ returns false.
  this.batchRow_ = 0;

  // Set first selected result at row 0.
  this.findBar.findInRow_(0);
  this.findBar.findInRow_(1);

  expectNext(0, 1, 1);
  expectNext(1, 0, 2);

  // Searching process partial complete and
  // canUseMatchingRowsIndex_ returns false.
  this.batchRow_ = 1;
  this.findBar.matchingRowsIndex_ = [0];

  // Selected Result outside visible screen.
  // Screen height is 4, topRowIndex == 3, bottomRowIndex == 5.
  this.scrollPort.scrollRowToTop(4);
  this.findBar.findInRow_(4);
  expectNext(4, 0, 3);
  expectNext(4, 1, 4);

  expectNext(0, 0, 0);
  assert.equal(this.scrollPort.getTopRowIndex(), 0);

  // Searching process complete and canUseMatchingRowsIndex_ returns true.
  this.findBar.batchRow_ = 5;
  this.findBar.matchingRowsIndex_ = [0, 1, 4];
  expectNext(0, 1, 1);
  expectNext(1, 0, 2);
  expectNext(4, 0, 3);
  expectNext(4, 1, 4);
  expectNext(0, 0, 0);
});

/**
 * Test onPrevious.
 */
it('finds-previous', function() {
  this.terminal.io.println('Findbar Findbar');
  this.terminal.io.println('FindBar');
  for (let i = 0; i < 2; i++) {
    this.terminal.io.println('No matches in this row.');
  }
  this.terminal.io.println('Findbar FindBar');
  this.findBar.searchText_ = 'findbar';

  const expectPrevious = (row, index, ordinal) => {
    this.findBar.onPrevious_();
    assert.equal(this.findBar.selectedRow_, row);
    assert.equal(this.findBar.selectedRowIndex_, index);
    assert.equal(this.findBar.selectedOrdinal_, ordinal);
  };

  this.findBar.downArrowButton_.classList.add('enabled');

  // Searching process incomplete and canUseMatchingRowsIndex_ returns false.
  this.batchRow_ = 0;

  // Set first selected result at row 1.
  this.findBar.findInRow_(1);
  this.findBar.findInRow_(0);

  expectPrevious(0, 1, 1);
  expectPrevious(0, 0, 0);

  // Searching process partial complete and
  // canUseMatchingRowsIndex_ returns false.
  this.batchRow_ = 2;
  this.findBar.matchingRowsIndex_ = [0, 1];

  // Selected Result outside visible screen.
  // Screen height is 4, topRowIndex == 3, bottomRowIndex == 5.
  this.scrollPort.scrollRowToTop(4);
  this.findBar.findInRow_(4);
  expectPrevious(4, 1, 4);
  expectPrevious(4, 0, 3);

  expectPrevious(1, 0, 2);
  assert.equal(this.scrollPort.getTopRowIndex(), 0);

  // Searching process complete and canUseMatchingRowsIndex_ returns true.
  this.findBar.batchRow_ = 5;
  this.findBar.matchingRowsIndex_ = [0, 1, 4];
  expectPrevious(0, 1, 1);
  expectPrevious(0, 0, 0);
  expectPrevious(4, 1, 4);
  expectPrevious(4, 0, 3);
  expectPrevious(1, 0, 2);
});

});
