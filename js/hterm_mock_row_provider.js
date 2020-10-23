// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * MockRowProvider implements RowProvider for tests.
 *
 * @implements {hterm.RowProvider}
 */
class MockRowProvider {
  /**
   * @param {!Document} document Document.
   * @param {number} count Number of visible rows.
   */
  constructor(document, count) {
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
  resetCallCount(name) {
    this.callCounts_[name] = 0;
  }

  /**
   * Get the number of times a specified function has been called.
   *
   * @param {string} name Function name.
   * @return {number} The number of times the function has been called.
   */
  getCallCount(name) {
    if (!(name in this.callCounts_)) {
      throw new Error(`Unknown name: ${name}`);
    }

    return this.callCounts_[name];
  }

  /**
   * Increment call count for the specified function.
   *
   * @param {string} name Function name.
   */
  addCallCount(name) {
    if (!(name in this.callCounts_)) {
      this.callCounts_[name] = 1;
    } else {
      this.callCounts_[name]++;
    }
  }

  /**
   * Set whether caching is enabled.
   *
   * @param {boolean} state Whether caching is enabled.
   */
  setCacheEnabled(state) {
    this.rowNodeCache_ = state ? {} : null;
  }

  /**
   * @return {number} The row count.
   * @override
   */
  getRowCount() {
    return this.rows_.length;
  }

  /**
   * Get the specified row record.
   *
   * @param {number} index The index of the row record to retrieve.
   * @return {!Object} The specified row record.
   */
  getRowRecord_(index) {
    if (index < 0 || index >= this.rows_.length) {
      throw new Error(`Index out of bounds: ${index}`);
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
  }

  /**
   * Get the text of the specified rows.
   *
   * @param {number} start The index of the first row of text.
   * @param {number} end The index of the last row of text.
   * @return {string} The text of the specified rows.
   */
  getRowsText(start, end) {
    if (start < 0 || end >= this.rows_.length) {
      throw new Error('Index out of bounds.');
    }

    const text = this.rows_.slice(start, end);
    return text.map((e) => e.text).join('\n');
  }

  /**
   * Get the text of the specified row.
   *
   * @param {number} index The index of the row.
   * @return {string} The text of the specified row.
   */
  getRowText(index) {
    const rec = this.getRowRecord_(index);
    return rec.text;
  }

  /**
   * Get the specifed row node.
   *
   * @param {number} index The index of the node.
   * @return {!Element} The specified node.
   * @override
   */
  getRowNode(index) {
    this.addCallCount('getRowNode');

    if (this.rowNodeCache_ && index in this.rowNodeCache_) {
      return this.rowNodeCache_[index];
    }

    const rec = this.getRowRecord_(index);
    const rowNode = this.document_.createElement('x-row');
    rowNode.rowIndex = index;
    rowNode.innerHTML = rec.html;

    if (this.rowNodeCache_) {
      this.rowNodeCache_[index] = rowNode;
    }

    return rowNode;
  }
}
