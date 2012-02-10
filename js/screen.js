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

  // The current color, bold, underline and blink attributes.
  this.textAttributes = new hterm.TextAttributes(window.document);

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
 * @param {integer} count The maximum number of columns per row.
 */
hterm.Screen.prototype.setColumnCount = function(count) {
  this.columnCount_ = count;

  if (this.cursorPosition.column >= count) {
    this.setCursorPosition(this.cursorPosition.row,
                           this.cursorPosition.column - 1);
  }
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
  this.cursorPosition.overflow = false;
};

/**
 * Relocate the cursor to a give row and column.
 *
 * @param {integer} row The zero based row.
 * @param {integer} column The zero based column.
 */
hterm.Screen.prototype.setCursorPosition = function(row, column) {
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

  this.cursorPosition.overflow = false;

  var rowNode = this.rowsArray[row];
  var node = rowNode.firstChild;

  if (!node) {
    node = rowNode.ownerDocument.createTextNode('');
    rowNode.appendChild(node);
  }

  var currentColumn = 0;

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
 * Split a single node into two nodes at the given offset.
 *
 * For example:
 * Given the DOM fragment '<div><span>Hello World</span></div>', call splitNode_
 * passing the span and an offset of 6.  This would modifiy the fragment to
 * become: '<div><span>Hello </span><span>World</span></div>'.  If the span
 * had any attributes they would have been copied to the new span as well.
 *
 * The to-be-split node must have a container, so that the new node can be
 * placed next to it.
 *
 * @param {HTMLNode} node The node to split.
 * @param {integer} offset The offset into the node where the split should
 *     occur.
 */
hterm.Screen.prototype.splitNode_ = function(node, offset) {
  var afterNode = node.cloneNode(false);

  var textContent = node.textContent;
  node.textContent = textContent.substr(0, offset);
  afterNode.textContent = textContent.substr(offset);

  node.parentNode.insertBefore(afterNode, node.nextSibling);
};

/**
 * Remove and return all content past the end of the current cursor position.
 *
 * If necessary, the cursor's current node will be split.  Everything past
 * the end of the cursor will be returned in an array.  Any empty nodes
 * will be omitted from the result array.  If the resulting array is empty,
 * this function will return null.
 *
 * @return {Array} An array of DOM nodes that used to appear after the cursor,
 *     or null if the cursor was already at the end of the line.
 */
hterm.Screen.prototype.clipAtCursor_ = function() {
  if (this.cursorOffset_ < this.cursorNode_.textContent.length - 1)
    this.splitNode_(this.cursorNode_, this.cursorOffset_ + 1);

  var rv = null;
  var rowNode = this.cursorRowNode_;
  var node = this.cursorNode_.nextSibling;

  while (node) {
    var length = node.textContent.length;
    if (length) {
      if (rv) {
        rv.push(node);
        rv.characterLength += length;
      } else {
        rv = [node];
        rv.characterLength = length;
      }
    }

    rowNode.removeChild(node);
    node = this.cursorNode_.nextSibling;
  }

  return rv;
};

/**
 * Ensure that the current row does not overflow the current column count.
 *
 * If the current row is too long, it will be clipped and the overflow content
 * will be returned as an array of DOM nodes.  Otherwise this function returns
 * null.
 *
 * @return {Array} An array of DOM nodes that overflowed in the current row,
 *     or null if the row did not overflow.
 */
hterm.Screen.prototype.maybeClipCurrentRow = function() {
  var currentColumn = this.cursorPosition.column;

  if (currentColumn >= this.columnCount_) {
    this.setCursorPosition(this.cursorPosition.row, this.columnCount_ - 1);
    this.cursorPosition.overflow = true;
    return this.clipAtCursor_();
  }

  if (this.cursorRowNode_.textContent.length > this.columnCount_) {
    this.setCursorPosition(this.cursorPosition.row, this.columnCount_ - 1);
    var overflow = this.clipAtCursor_();
    this.setCursorPosition(this.cursorPosition.row, currentColumn);
    return overflow;
  }

  return null;
};

/**
 * Insert a string at the current character position using the current
 * text attributes.
 *
 * You must call maybeClipCurrentRow() after in order to check overflow.
 */
hterm.Screen.prototype.insertString = function(str) {
  var cursorNode = this.cursorNode_;
  var cursorNodeText = cursorNode.textContent;

  // We may alter the length of the string by prepending some missing
  // whitespace, so we need to record the string length ahead of time.
  var strLength = str.length;

  // No matter what, before this function exits the cursor column will have
  // moved this much.
  this.cursorPosition.column += strLength;

  // Local cache of the cursor offset.
  var offset = this.cursorOffset_;

  // Reverse offset is the offset measured from the end of the string.
  // Zero implies that the cursor is at the end of the cursor node.
  var reverseOffset = cursorNodeText.length - offset

  if (reverseOffset < 0) {
    // A negative reverse offset means the cursor is positioned past the end
    // of the characters on this line.  We'll need to insert the missing
    // whitespace.
    var ws = hterm.getWhitespace(-reverseOffset);

    // This whitespace should be completely unstyled.  Underline and background
    // color would be visible on whitespace, so we can't use one of those
    // spans to hold the text.
    if (!(this.textAttributes.underline || this.textAttributes.background)) {
      // Best case scenario, we can just pretend the spaces were part of the
      // original string.
      str = ws + str;
    } else if (cursorNode.nodeType == 3 ||
               !(cursorNode.style.textDecoration ||
                 cursorNode.style.backgroundColor)) {
      // Second best case, the current node is able to hold the whitespace.
      cursorNode.textContent = (cursorNodeText += ws);
    } else {
      // Worst case, we have to create a new node to hold the whitespace.
      var wsNode = cursorNode.ownerDocument.createTextNode(ws);
      this.cursorRowNode_.insertBefore(wsNode, cursorNode.nextSibling);
      this.cursorNode_ = cursorNode = wsNode;
      this.cursorOffset_ = offset = -reverseOffset;
      cursorNodeText = ws;
    }

    // We now know for sure that we're at the last character of the cursor node.
    reverseOffset = 0;
  }

  if (this.textAttributes.matchesContainer(cursorNode)) {
    // The new text can be placed directly in the cursor node.
    if (reverseOffset == 0) {
      cursorNode.textContent = cursorNodeText + str;
    } else if (offset == 0) {
      cursorNode.textContent = str + cursorNodeText;
    } else {
      cursorNode.textContent = cursorNodeText.substr(0, offset) + str +
          cursorNodeText.substr(offset);
    }

    this.cursorOffset_ += strLength;
    return;
  }

  // The cursor node is the wrong style for the new text.  If we're at the
  // beginning or end of the cursor node, then the adjacent node is also a
  // potential candidate.

  if (offset == 0) {
    // At the beginning of the cursor node, the check the previous sibling.
    var previousSibling = cursorNode.previousSibling;
    if (previousSibling &&
        this.textAttributes.matchesContainer(previousSibling)) {
      previousSibling.textContent += str;
      this.cursorNode_ = previousSibling;
      this.cursorOffset_ = previousSibling.textContent.length;
      return;
    }

    var newNode = this.textAttributes.createContainer(str);
    this.cursorRowNode_.insertBefore(newNode, cursorNode);
    this.cursorNode_ = newNode;
    this.cursorOffset_ = strLength;
    return;
  }

  if (reverseOffset == 0) {
    // At the end of the cursor node, the check the next sibling.
    var nextSibling = cursorNode.nextSibling;
    if (nextSibling &&
        this.textAttributes.matchesContainer(nextSibling)) {
      nextSibling.textContent = str + nextSibling.textContent;
      this.cursorNode_ = nextSibling;
      this.cursorOffset_ = strLength;
      return;
    }

    var newNode = this.textAttributes.createContainer(str);
    this.cursorRowNode_.insertBefore(newNode, nextSibling);
    this.cursorNode_ = newNode;
    // We specifically need to include any missing whitespace here, since it's
    // going in a new node.
    this.cursorOffset_ = str.length;
    return;
  }

  // Worst case, we're somewhere in the middle of the cursor node.  We'll
  // have to split it into two nodes and insert our new container in between.
  this.splitNode_(cursorNode, offset);
  var newNode = this.textAttributes.createContainer(str);
  this.cursorRowNode_.insertBefore(newNode, cursorNode.nextSibling);
  this.cursorNode_ = newNode;
  this.cursorOffset_ = strLength;
};

/**
 * Insert an array of DOM nodes at the beginning of the cursor row.
 *
 * This does not pay attention to the cursor column, it only prepends to the
 * beginning of the current row.
 *
 * This method does not attempt to coalesce rows of the same style.  It assumes
 * that the rows being inserted have already been coalesced, and that there
 * would be no gain in coalescing only the final node.
 *
 * The cursor will be reset to the zero'th column.
 */
hterm.Screen.prototype.prependNodes = function(ary) {
  var parentNode = this.cursorRowNode_;

  for (var i = ary.length - 1; i >= 0; i--) {
    parentNode.insertBefore(ary[i], parentNode.firstChild);
  }

  // We have to leave the cursor in a sensible state so we don't confuse
  // setCursorPosition.  It's fastest to just leave it at the start of
  // the row.  If the caller wants it somewhere else, they can move it
  // on their own.
  this.cursorPosition.column = 0;
  this.cursorNode_ = parentNode.firstChild;
  this.cursorOffset_ = 0;
};

/**
 * Overwrite the text at the current cursor position.
 *
 * You must call maybeClipCurrentRow() after in order to check overflow.
 */
hterm.Screen.prototype.overwriteString = function(str) {
  var maxLength = this.columnCount_ - this.cursorPosition.column;
  if (!maxLength)
    return [str];

  if ((this.cursorNode_.textContent.substr(this.cursorOffset_) == str) &&
      this.textAttributes.matchesContainer(this.cursorNode_)) {
    // This overwrite would be a no-op, just move the cursor and return.
    this.cursorOffset_ += str.length;
    this.cursorPosition.column += str.length;
    return;
  }

  this.deleteChars(Math.min(str.length, maxLength));
  this.insertString(str);
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

  if (node.textContent.length <= offset && !node.nextSibling) {
    // There's nothing after this node/offset to delete, buh bye.
    return;
  }

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
