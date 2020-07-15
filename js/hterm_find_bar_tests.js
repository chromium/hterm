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
  assert.isFalse(this.findBarDiv.classList.contains('enabled'));
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
  const doc = this.terminal.getDocument();
  this.findBar.display();

  setInputElementValue('Hello World', this.inputElement);

  assert.equal(this.inputElement.value, 'Hello World');
  assert.equal(doc.activeElement, this.inputElement);
});

const extractIndexes = (results) => {
  return Object.fromEntries(Object.entries(results).map(
      ([rowNum, v]) => [rowNum, v.rowResult.map((row) => row.index)]));
};

/**
 * Test findInRow.
 */
it('finds-matches-in-a-row', function() {
  this.terminal.io.println('Findbar Findbar Findbar');
  this.terminal.io.println('No matches in this row.');
  this.findBar.searchText_ = 'findbar';

  // Rows with matches should be added to results.
  this.findBar.findInRow_(0);
  assert.deepEqual(extractIndexes(this.findBar.results_), {0: [0, 8, 16]});

  // Rows with no matches should not be added to results.
  this.findBar.findInRow_(1);
  assert.deepEqual(extractIndexes(this.findBar.results_), {0: [0, 8, 16]});
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

});
