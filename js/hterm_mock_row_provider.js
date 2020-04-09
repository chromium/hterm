// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * MockRowProvider implements RowProvider for tests.
 *
 * @param {!Document} document Document.
 * @param {number} count Number of visible rows.
 * @constructor
 * @implements {hterm.RowProvider}
 */
function MockRowProvider(document, count) {
  this.document_ = document;
  this.rows_ = new Array();
  this.rows_.length = count;

  this.rowNodeCache_ = null;

  this.callCounts_ = {
    getRowNode: 0,
  };
}

/**
 * Reset the call count for the specified function.
 *
 * @param {string} name
 */
MockRowProvider.prototype.resetCallCount = function(name) {
  this.callCounts_[name] = 0;
};

/**
 * Get the number of times a specified function has been called.
 *
 * @param {string} name Function name.
 * @return {number} The number of times the function has been called.
 */
MockRowProvider.prototype.getCallCount = function(name) {
  if (!(name in this.callCounts_)) {
    throw 'Unknown name: ' + name;
  }

  return this.callCounts_[name];
};

/**
 * Increment call count for the specified function.
 *
 * @param {string} name Function name.
 */
MockRowProvider.prototype.addCallCount = function(name) {
  if (!(name in this.callCounts_)) {
    this.callCounts_[name] = 1;
  } else {
    this.callCounts_[name]++;
  }
};

/**
 * Set whether caching is enabled.
 *
 * @param {boolean} state Whether caching is enabled.
 */
MockRowProvider.prototype.setCacheEnabled = function(state) {
  this.rowNodeCache_ = state ? {} : null;
};

/**
 * @return {number} The row count.
 * @override
 */
MockRowProvider.prototype.getRowCount = function() {
  return this.rows_.length;
};

/**
 * Get the specified row record.
 *
 * @param {number} index The index of the row record to retrieve.
 * @return {!Object} The specified row record.
 */
MockRowProvider.prototype.getRowRecord_ = function(index) {
  if (index < 0 || index >= this.rows_.length) {
    throw 'Index out of bounds: ' + index;
  }

  if (!this.rows_[index]) {
    this.rows_[index] = {
      html:
      '<x-state data-fg=7 data-bg=0>This is line ' + index +
      '</x-state>' +
      '<x-state data-fg=1 data-bg=0> red</x-state>' +
      '<x-state data-fg=2 data-bg=0> green</x-state>' +
      '<x-state data-fg=3 data-bg=0> yellow</x-state>' +
      '<x-state data-fg=4 data-bg=0> blue</x-state>' +
      '<x-state data-fg=5 data-bg=0> magenta</x-state>' +
      '<x-state data-fg=6 data-bg=0> cyan</x-state>',
      text:
      'This is line ' + index + ' red green yellow blue magenta cyan',
    };
  }

  return this.rows_[index];
};

/**
 * Get the text of the specified rows.
 *
 * @param {number} start The index of the first row of text.
 * @param {number} end The index of the last row of text.
 * @return {string} The text of the specified rows.
 */
MockRowProvider.prototype.getRowsText = function(start, end) {
  if (start < 0 || end >= this.rows_.length) {
    throw 'Index out of bounds.';
  }

  var text = this.rows_.slice(start, end);
  return text.map(function(e) { return e.text; }).join('\n');
};

/**
 * Get the text of the specified row.
 *
 * @param {number} index The index of the row.
 * @return {string} The text of the specified row.
 */
MockRowProvider.prototype.getRowText = function(index) {
  var rec = this.getRowRecord_(index);
  return rec.text;
};

/**
 * Get the specifed row node.
 *
 * @param {number} index The index of the node.
 * @return {!Element} The specified node.
 * @override
 */
MockRowProvider.prototype.getRowNode = function(index) {
  this.addCallCount('getRowNode');

  if (this.rowNodeCache_ && index in this.rowNodeCache_) {
    return this.rowNodeCache_[index];
  }

  var rec = this.getRowRecord_(index);
  var rowNode = this.document_.createElement('x-row');
  rowNode.rowIndex = index;
  rowNode.innerHTML = rec.html;

  if (this.rowNodeCache_) {
    this.rowNodeCache_[index] = rowNode;
  }

  return rowNode;
};
