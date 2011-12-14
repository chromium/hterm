// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview This class represents a single terminal screen full of text.
 *
 * It maintains the current cursor position and has basic methods for text
 * insert and overwrite, and adding or removing rows from the screen.
 *
 * This class has no knowledge of the scrollback buffer.
 *
 * The number of rows on the screen is determined only by the number of rows
 * that the caller inserts into the screen.  If a caller wants to ensure a
 * constant number of rows on the screen, it's their responsibility to remove a
 * row for each row inserted.
 *
 * The screen width, in contrast, is enforced locally.
 *
 *
 * In practice...
 * - The hterm.Terminal class holds two hterm.Screen instances.  One for the
 * primary screen and one for the alternate screen.
 *
 * - The html.Screen class only cares that rows are HTMLElements.  In the
 * larger context of hterm, however, the rows happen to be displayed by an
 * hterm.ScrollPort and have to follow a few rules as a result.  Each
 * row must be rooted by the custom HTML tag 'x-row', and each must have a
 * rowIndex property that corresponds to the index of the row in the context
 * of the scrollback buffer.  These invariants are enforced by hterm.Terminal
 * because that is the class using the hterm.Screen in the context of an
 * hterm.ScrollPort.
 */

/**
 * Create a new screen instance.
 *
 * The screen initially has no rows and a maximum column count of 0.
 *
 * @param {integer} opt_columnCount The maximum number of columns for this
 *    screen.  See insertString() and overwriteString() for information about
 *    what happens when too many characters are added too a row.  Defaults to
 *    0 if not provided.
 */
hterm.Screen = function(opt_columnCount) {
  /**
   * Public, read-only access to the rows in this screen.
   */
  this.rowsArray = [];

  // The max column width for this screen.
  this.columnCount_ = opt_columnCount || 80;

  // Current zero-based cursor coordinates.
  this.cursorPosition = new hterm.RowCol(0, 0);

  // The node containing the row that the cursor is positioned on.
  this.cursorRowNode_ = null;

  // The node containing the span of text that the cursor is positioned on.
  this.cursorNode_ = null;

  // The offset into cursorNode_ where the cursor is positioned.
  this.cursorOffset_ = null;
};

/**
 * Return the screen size as an hterm.Size object.
 *
 * @return {hterm.Size} hterm.Size object representing the current number
 *     of rows and columns in this screen.
 */
hterm.Screen.prototype.getSize = function() {
  return new hterm.Size(this.columnCount_, this.rowsArray.length);
};

/**
 * Return the current number of rows in this screen.
 *
 * @return {integer} The number of rows in this screen.
 */
hterm.Screen.prototype.getHeight = function() {
  return this.rowsArray.length;
};

/**
 * Return the current number of columns in this screen.
 *
 * @return {integer} The number of columns in this screen.
 */
hterm.Screen.prototype.getWidth = function() {
  return this.columnCount_;
};

/**
 * Set the maximum number of columns per row.
 *
 * TODO(rginda): This should probably clip existing rows if the count is
 *    decreased.
 *
 * @param {integer} count The maximum number of columns per row.
 */
hterm.Screen.prototype.setColumnCount = function(count) {
  if (this.rowsArray.length) {
    var p = this.cursorPosition.clone();

    for (var i = 0; i < this.rowsArray.length; i++) {
      var overflow = this.rowsArray[i].textContent.length - count;
      if (overflow > 0) {
        this.setCursorPosition(i, count - 1);
        this.deleteChars(overflow);
      }
    }

    if (p.column >= count)
      p.column = count - 1;

    this.setCursorPosition(p.row, p.column);
  }

  this.columnCount_ = count;
};

/**
 * Remove the first row from the screen and return it.
 *
 * @return {HTMLElement} The first row in this screen.
 */
hterm.Screen.prototype.shiftRow = function() {
  return this.shiftRows(1)[0];
};

/**
 * Remove rows from the top of the screen and return them as an array.
 *
 * @param {integer} count The number of rows to remove.
 * @return {Array.<HTMLElement>} The selected rows.
 */
hterm.Screen.prototype.shiftRows = function(count) {
  return this.rowsArray.splice(0, count);
};

/**
 * Insert a row at the top of the screen.
 *
 * @param {HTMLElement} The row to insert.
 */
hterm.Screen.prototype.unshiftRow = function(row) {
  this.rowsArray.splice(0, 0, row);
};

/**
 * Insert rows at the top of the screen.
 *
 * @param {Array.<HTMLElement>} The rows to insert.
 */
hterm.Screen.prototype.unshiftRows = function(rows) {
  this.rowsArray.unshift.apply(this.rowsArray, rows);
};

/**
 * Remove the last row from the screen and return it.
 *
 * @return {HTMLElement} The last row in this screen.
 */
hterm.Screen.prototype.popRow = function() {
  return this.popRows(1)[0];
};

/**
 * Remove rows from the bottom of the screen and return them as an array.
 *
 * @param {integer} count The number of rows to remove.
 * @return {Array.<HTMLElement>} The selected rows.
 */
hterm.Screen.prototype.popRows = function(count) {
  return this.rowsArray.splice(this.rowsArray.length - count, count);
};

/**
 * Insert a row at the bottom of the screen.
 *
 * @param {HTMLElement} The row to insert.
 */
hterm.Screen.prototype.pushRow = function(row) {
  this.rowsArray.push(row);
};

/**
 * Insert rows at the bottom of the screen.
 *
 * @param {Array.<HTMLElement>} The rows to insert.
 */
hterm.Screen.prototype.pushRows = function(rows) {
  rows.push.apply(this.rowsArray, rows);
};

/**
 * Insert a row at the specified column of the screen.
 *
 * @param {HTMLElement} The row to insert.
 */
hterm.Screen.prototype.insertRow = function(index, row) {
  this.rowsArray.splice(index, 0, row);
};

/**
 * Insert rows at the specified column of the screen.
 *
 * @param {Array.<HTMLElement>} The rows to insert.
 */
hterm.Screen.prototype.insertRows = function(index, rows) {
  for (var i = 0; i < rows.length; i++) {
    this.rowsArray.splice(index + i, 0, rows[i]);
  }
};

/**
 * Remove a last row from the specified column of the screen and return it.
 *
 * @return {HTMLElement} The selected row.
 */
hterm.Screen.prototype.removeRow = function(index) {
  return this.rowsArray.splice(index, 1)[0];
};

/**
 * Remove rows from the bottom of the screen and return them as an array.
 *
 * @param {integer} count The number of rows to remove.
 * @return {Array.<HTMLElement>} The selected rows.
 */
hterm.Screen.prototype.removeRows = function(index, count) {
  return this.rowsArray.splice(index, count);
};

/**
 * Invalidate the current cursor position.
 *
 * This sets this.cursorPosition to (0, 0) and clears out some internal
 * data.
 *
 * Attempting to insert or overwrite text while the cursor position is invalid
 * will raise an obscure exception.
 */
hterm.Screen.prototype.invalidateCursorPosition = function() {
  this.cursorPosition.move(0, 0);
  this.cursorRowNode_ = null;
  this.cursorNode_ = null;
  this.cursorOffset_ = null;
};

/**
 * Clear the contents of a selected row.
 *
 * TODO: Make this clear in the current style... somehow.  We can't just
 * fill the row with spaces, since they would have potential to mess up the
 * terminal (for example, in insert mode, they might wrap around to the next
 * line.
 *
 * @param {integer} index The zero-based index to clear.
 */
hterm.Screen.prototype.clearRow = function(index) {
  if (index == this.cursorPosition.row) {
    this.clearCursorRow();
  } else {
    var row = this.rowsArray[index];
    row.innerHTML = '';
    row.appendChild(row.ownerDocument.createTextNode(''));
  }
};

/**
 * Clear the contents of the cursor row.
 *
 * TODO: Same comment as clearRow().
 */
hterm.Screen.prototype.clearCursorRow = function() {
  this.cursorRowNode_.innerHTML = '';
  var text = this.cursorRowNode_.ownerDocument.createTextNode('');
  this.cursorRowNode_.appendChild(text);
  this.cursorOffset_ = 0;
  this.cursorNode_ = text;
  this.cursorPosition.column = 0;
};

/**
 * Relocate the cursor to a give row and column.
 *
 * @param {integer} row The zero based row.
 * @param {integer} column The zero based column.
 */
hterm.Screen.prototype.setCursorPosition = function(row, column) {
  var currentColumn = 0;
  if (row >= this.rowsArray.length) {
    console.log('Row out of bounds: ' + row, hterm.getStack(1));
    row = this.rowsArray.length - 1;
  } else if (row < 0) {
    console.log('Row out of bounds: ' + row, hterm.getStack(1));
    row = 0;
  }

  if (column >= this.columnCount_) {
    console.log('Column out of bounds: ' + column, hterm.getStack(1));
    column = this.columnCount_ - 1;
  } else if (column < 0) {
    console.log('Column out of bounds: ' + column, hterm.getStack(1));
    column = 0;
  }

  var rowNode = this.rowsArray[row];
  var node = rowNode.firstChild;

  if (!node) {
    node = rowNode.ownerDocument.createTextNode('');
    rowNode.appendChild(node);
  }

  if (rowNode == this.cursorRowNode_) {
    if (column >= this.cursorPosition.column - this.cursorOffset_) {
      node = this.cursorNode_;
      currentColumn = this.cursorPosition.column - this.cursorOffset_;
    }
  } else {
    this.cursorRowNode_ = rowNode;
  }

  this.cursorPosition.move(row, column);

  while (node) {
    var offset = column - currentColumn;
    var textContent = node.textContent;
    if (!node.nextSibling || textContent.length > offset) {
      this.cursorNode_ = node;
      this.cursorOffset_ = offset;
      return;
    }

    currentColumn += textContent.length;
    node = node.nextSibling;
  }
};

/**
 * Set the provided selection object to be a caret selection at the current
 * cursor position.
 */
hterm.Screen.prototype.syncSelectionCaret = function(selection) {
  selection.collapse(this.cursorNode_, this.cursorOffset_);
};

/**
 * Insert the given string at the cursor position, with the understanding that
 * the insert will cause the column to overflow, and the overflow will be
 * in a different text style than where the cursor is currently located.
 *
 * TODO: Implement this.
 */
hterm.Screen.prototype.spliceStringAndWrap_ = function(str) {
  throw 'NOT IMPLEMENTED';
};

/**
 * Insert a string at the current cursor position.
 *
 * If the insert causes the column to overflow, the extra text is returned.
 * If only the cursor overflows (ie, you print exactly enough to fill the
 * last column) then the empty string is returned.
 *
 * @return {string} Text that overflowed the column, or null if nothing
 *     overflowed.
 */
hterm.Screen.prototype.insertString = function(str) {
  if (this.cursorPosition.column == this.columnCount_)
    return str;

  var totalRowText = this.cursorRowNode_.textContent;

  // There may not be underlying characters to support the current cursor
  // position, since they don't get inserted until they're necessary.
  var missingSpaceCount = Math.max(this.cursorPosition.column -
                                   totalRowText.length,
                                   0);

  var overflowCount = Math.max(totalRowText.length + missingSpaceCount +
                               str.length - this.columnCount_,
                               0);

  if (overflowCount > 0 && this.cursorNode_.nextSibling) {
    // We're going to overflow, but there is text after the cursor with a
    // different set of attributes. This is going to take some effort.
    return this.spliceStringAndWrap_(str);
  }

  // Wrapping is simple since the cursor is located in the last block of text
  // on the line.

  var cursorNodeText = this.cursorNode_.textContent;
  var leadingText = cursorNodeText.substr(0, this.cursorOffset_);
  var trailingText = str + cursorNodeText.substr(this.cursorOffset_);
  var overflowText = trailingText.substr(trailingText.length - overflowCount);
  trailingText = trailingText.substr(0, trailingText.length - overflowCount);

  if (!overflowText)
    overflowText = null;

  this.cursorNode_.textContent = (
      leadingText +
      hterm.getWhitespace(missingSpaceCount) +
      trailingText
      );

  var cursorDelta = Math.min(str.length, trailingText.length);
  if (this.cursorPosition.column + cursorDelta >= this.columnCount_) {
    cursorDelta = this.columnCount_ - this.cursorPosition.column - 1;
    if (!overflowText)
      overflowText = '';
  }

  this.cursorOffset_ += cursorDelta;
  this.cursorPosition.column += cursorDelta;

  return overflowText;
};

/**
 * Overwrite the text at the current cursor position.
 *
 * If the text causes the column to overflow, the extra text is returned.
 *
 * @return {string} Text that overflowed the column, or null if nothing
 *     overflowed.
 */
hterm.Screen.prototype.overwriteString = function(str) {
  var maxLength = this.columnCount_ - this.cursorPosition.column;
  if (!maxLength)
    return str;

  this.deleteChars(Math.min(str.length, maxLength));
  return this.insertString(str);
};

/**
 * Forward-delete one or more characters at the current cursor position.
 *
 * Text to the right of the deleted characters is shifted left.  Only affects
 * characters on the same row as the cursor.
 *
 * @param {integer} count The number of characters to delete.  This is clamped
 *     to the column width minus the cursor column.
 */
hterm.Screen.prototype.deleteChars = function(count) {
  var node = this.cursorNode_;
  var offset = this.cursorOffset_;

  while (node && count) {
    var startLength = node.textContent.length;

    node.textContent = node.textContent.substr(0, offset) +
        node.textContent.substr(offset + count);

    var endLength = node.textContent.length;
    count -= startLength - endLength;

    if (endLength == 0 && node != this.cursorNode_) {
      var nextNode = node.nextSibling;
      node.parentNode.removeChild(node);
      node = nextNode;
    } else {
      node = node.nextSibling;
    }

    offset = 0;
  }
};
