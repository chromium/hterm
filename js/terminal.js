// Copyright (c) 2011 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Constructor for the Terminal class.
 *
 * A Terminal pulls together the hterm.ScrollPort, hterm.Screen and hterm.VT100
 * classes to provide the complete terminal functionality.
 *
 * There are a number of lower-level Terminal methods that can be called
 * directly to manipulate the cursor, text, scroll region, and other terminal
 * attributes.  However, the primary method is interpret(), which parses VT
 * escape sequences and invokes the appropriate Terminal methods.
 *
 * This class was heavily influenced by Cory Maccarrone's Framebuffer class.
 *
 * TODO(rginda): Eventually we're going to need to support characters which are
 * displayed twice as wide as standard latin characters.  This is to support
 * CJK (and possibly other character sets).
 */
hterm.Terminal = function() {
  // Two screen instances.
  this.primaryScreen_ = new hterm.Screen();
  this.alternateScreen_ = new hterm.Screen();

  // The "current" screen.
  this.screen_ = this.primaryScreen_;

  // The VT escape sequence interpreter.
  this.vt100_ = new hterm.VT100(this);

  // The local notion of the screen size.  ScreenBuffers also have a size which
  // indicates their present size.  During size changes, the two may disagree.
  // Also, the inactive screen's size is not altered until it is made the active
  // screen.
  this.screenSize = new hterm.Size(0, 0);

  // The pixel dimensions of a single character on the screen.
  this.characterSize_ = new hterm.Size(0, 0);

  // The scroll port we'll be using to display the visible rows.
  this.scrollPort_ = new hterm.ScrollPort(this, 15);
  this.scrollPort_.subscribe('resize', this.onResize_.bind(this));
  this.scrollPort_.subscribe('scroll', this.onScroll_.bind(this));

  // The rows that have scrolled off screen and are no longer addressable.
  this.scrollbackRows_ = [];

  // The VT's notion of the top and bottom rows.  Used during some VT
  // cursor positioning and scrolling commands.
  this.vtScrollTop_ = null;
  this.vtScrollBottom_ = null;

  // The DIV element for the visible cursor.
  this.cursorNode_ = null;

  // The default colors for text with no other color attributes.
  this.backgroundColor = 'black';
  this.foregroundColor = 'white';

  // The color of the cursor.
  this.cursorColor = 'rgba(255,0,0,0.5)';

  // The current mode bits for the terminal.
  this.options_ = new hterm.Options();

  // Timeouts we might need to clear.
  this.timeouts_ = {};
};

/**
 * Methods called by Cory's vt100 interpreter which we haven't implemented yet.
 */
hterm.Terminal.prototype.reset =
hterm.Terminal.prototype.clearColorAndAttributes =
hterm.Terminal.prototype.setForegroundColor256 =
hterm.Terminal.prototype.setBackgroundColor256 =
hterm.Terminal.prototype.setForegroundColor =
hterm.Terminal.prototype.setBackgroundColor =
hterm.Terminal.prototype.setAttributes =
hterm.Terminal.prototype.resize =
hterm.Terminal.prototype.setSpecialCharactersEnabled =
hterm.Terminal.prototype.setTabStopAtCursor =
hterm.Terminal.prototype.clearTabStops =
hterm.Terminal.prototype.saveCursor =
hterm.Terminal.prototype.restoreCursor =
hterm.Terminal.prototype.reverseLineFeed = function() {
  throw 'NOT IMPLEMENTED';
};

/**
 * Interpret a sequence of characters.
 *
 * Incomplete escape sequences are buffered until the next call.
 *
 * @param {string} str Sequence of characters to interpret or pass through.
 */
hterm.Terminal.prototype.interpret = function(str) {
  this.vt100_.interpretString(str);
  this.scheduleSyncCursorPosition_();
};

/**
 * Take over the given DIV for use as the terminal display.
 *
 * @param {HTMLDivElement} div The div to use as the terminal display.
 */
hterm.Terminal.prototype.decorate = function(div) {
  this.scrollPort_.decorate(div);
  this.document_ = this.scrollPort_.getDocument();

  // Get character dimensions from the scrollPort.
  this.characterSize_.height = this.scrollPort_.getRowHeight();
  this.characterSize_.width = this.scrollPort_.getCharacterWidth();

  this.cursorNode_ = this.document_.createElement('div');
  this.cursorNode_.style.cssText =
      ('position: absolute;' +
       'display: none;' +
       'width: ' + this.characterSize_.width + 'px;' +
       'height: ' + this.characterSize_.height + 'px;' +
       'background-color: ' + this.cursorColor);
  this.document_.body.appendChild(this.cursorNode_);

  this.setReverseVideo(false);
};

/**
 * Return the HTML Element for a given row index.
 *
 * This is a method from the RowProvider interface.  The ScrollPort uses
 * it to fetch rows on demand as they are scrolled into view.
 *
 * TODO(rginda): Consider saving scrollback rows as (HTML source, text content)
 * pairs to conserve memory.
 *
 * @param {integer} index The zero-based row index, measured relative to the
 *     start of the scrollback buffer.  On-screen rows will always have the
 *     largest indicies.
 * @return {HTMLElement} The 'x-row' element containing for the requested row.
 */
hterm.Terminal.prototype.getRowNode = function(index) {
  if (index < this.scrollbackRows_.length)
    return this.scrollbackRows_[index];

  var screenIndex = index - this.scrollbackRows_.length;
  return this.screen_.rowsArray[screenIndex];
};

/**
 * Return the text content for a given range of rows.
 *
 * This is a method from the RowProvider interface.  The ScrollPort uses
 * it to fetch text content on demand when the user attempts to copy their
 * selection to the clipboard.
 *
 * @param {integer} start The zero-based row index to start from, measured
 *     relative to the start of the scrollback buffer.  On-screen rows will
 *     always have the largest indicies.
 * @param {integer} end The zero-based row index to end on, measured
 *     relative to the start of the scrollback buffer.
 * @return {string} A single string containing the text value of the range of
 *     rows.  Lines will be newline delimited, with no trailing newline.
 */
hterm.Terminal.prototype.getRowsText = function(start, end) {
  var ary = [];
  for (var i = start; i < end; i++) {
    var node = this.getRowNode(i);
    ary.push(node.textContent);
  }

  return ary.join('\n');
};

/**
 * Return the text content for a given row.
 *
 * This is a method from the RowProvider interface.  The ScrollPort uses
 * it to fetch text content on demand when the user attempts to copy their
 * selection to the clipboard.
 *
 * @param {integer} index The zero-based row index to return, measured
 *     relative to the start of the scrollback buffer.  On-screen rows will
 *     always have the largest indicies.
 * @return {string} A string containing the text value of the selected row.
 */
hterm.Terminal.prototype.getRowText = function(index) {
  var node = this.getRowNode(index);
  return row.textContent;
};

/**
 * Return the total number of rows in the addressable screen and in the
 * scrollback buffer of this terminal.
 *
 * This is a method from the RowProvider interface.  The ScrollPort uses
 * it to compute the size of the scrollbar.
 *
 * @return {integer} The number of rows in this terminal.
 */
hterm.Terminal.prototype.getRowCount = function() {
  return this.scrollbackRows_.length + this.screen_.rowsArray.length;
};

/**
 * Create DOM nodes for new rows and append them to the end of the terminal.
 *
 * This is the only correct way to add a new DOM node for a row.  Notice that
 * the new row is appended to the bottom of the list of rows, and does not
 * require renumbering (of the rowIndex property) of previous rows.
 *
 * If you think you want a new blank row somewhere in the middle of the
 * terminal, look into moveRows_().
 *
 * This method does not pay attention to vtScrollTop/Bottom, since you should
 * be using moveRows() in cases where they would matter.
 *
 * The cursor will be positioned at column 0 of the first inserted line.
 */
hterm.Terminal.prototype.appendRows_ = function(count) {
  var cursorRow = this.screen_.rowsArray.length;
  var offset = this.scrollbackRows_.length + cursorRow;
  for (var i = 0; i < count; i++) {
    var row = this.document_.createElement('x-row');
    row.appendChild(this.document_.createTextNode(''));
    row.rowIndex = offset + i;
    this.screen_.pushRow(row);
  }

  var extraRows = this.screen_.rowsArray.length - this.screenSize.height;
  if (extraRows > 0) {
    var ary = this.screen_.shiftRows(extraRows);
    Array.prototype.push.apply(this.scrollbackRows_, ary);
    this.scheduleScrollDown_();
  }

  if (cursorRow >= this.screen_.rowsArray.length)
    cursorRow = this.screen_.rowsArray.length - 1;

  this.screen_.setCursorPosition(cursorRow, 0);
};

/**
 * Relocate rows from one part of the addressable screen to another.
 *
 * This is used to recycle rows during VT scrolls (those which are driven
 * by VT commands, rather than by the user manipulating the scrollbar.)
 *
 * In this case, the blank lines scrolled into the scroll region are made of
 * the nodes we scrolled off.  These have their rowIndex properties carefully
 * renumbered so as not to confuse the ScrollPort.
 *
 * TODO(rginda): I'm not sure why this doesn't require a scrollport repaint.
 * It may just be luck.  I wouldn't be surprised if we actually needed to call
 * scrollPort_.invalidateRowRange, but I'm going to wait for evidence before
 * adding it.
 */
hterm.Terminal.prototype.moveRows_ = function(fromIndex, count, toIndex) {
  var ary = this.screen_.removeRows(fromIndex, count);
  this.screen_.insertRows(toIndex, ary);

  var start, end;
  if (fromIndex < toIndex) {
    start = fromIndex;
    end = fromIndex + count;
  } else {
    start = toIndex;
    end = toIndex + count;
  }

  this.renumberRows_(start, end);
};

/**
 * Renumber the rowIndex property of the given range of rows.
 *
 * The start and end indicies are relative to the screen, not the scrollback.
 * Rows in the scrollback buffer cannot be renumbered.  Since they are not
 * addressable (you cant delete them, scroll them, etc), you should have
 * no need to renumber scrollback rows.
 */
hterm.Terminal.prototype.renumberRows_ = function(start, end) {
  var offset = this.scrollbackRows_.length;
  for (var i = start; i < end; i++) {
    this.screen_.rowsArray[i].rowIndex = offset + i;
  }
};

/**
 * Print a string to the terminal.
 *
 * This respects the current insert and wraparound modes.  It will add new lines
 * to the end of the terminal, scrolling off the top into the scrollback buffer
 * if necessary.
 *
 * The string is *not* parsed for escape codes.  Use the interpret() method if
 * that's what you're after.
 *
 * @param{string} str The string to print.
 */
hterm.Terminal.prototype.print = function(str) {
  do {
    if (this.options_.insertMode) {
      str = this.screen_.insertString(str);
    } else {
      str = this.screen_.overwriteString(str);
    }

    if (this.options_.wraparound && str) {
      this.newLine();
    } else {
      break;
    }
  } while (str);

  this.scheduleSyncCursorPosition_();
};

/**
 * Return the top row index according to the VT.
 *
 * This will return 0 unless the terminal has been told to restrict scrolling
 * to some lower row.  It is used for some VT cursor positioning and scrolling
 * commands.
 *
 * @return {integer} The topmost row in the terminal's scroll region.
 */
hterm.Terminal.prototype.getVTScrollTop = function() {
  if (this.vtScrollTop_ != null)
    return this.vtScrollTop_;

  return 0;
}

/**
 * Return the bottom row index according to the VT.
 *
 * This will return the height of the terminal unless the it has been told to
 * restrict scrolling to some higher row.  It is used for some VT cursor
 * positioning and scrolling commands.
 *
 * @return {integer} The bottommost row in the terminal's scroll region.
 */
hterm.Terminal.prototype.getVTScrollBottom = function() {
  if (this.vtScrollBottom_ != null)
    return this.vtScrollBottom_;

  return this.screenSize.height;
}

/**
 * Process a '\n' character.
 *
 * If the cursor is on the final row of the terminal this will append a new
 * blank row to the screen and scroll the topmost row into the scrollback
 * buffer.
 *
 * Otherwise, this moves the cursor to column zero of the next row.
 */
hterm.Terminal.prototype.newLine = function() {
  if (this.screen_.cursorPosition.row == this.screen_.rowsArray.length - 1) {
    this.appendRows_(1);
  } else {
    this.screen_.setCursorPosition(this.screen_.cursorPosition.row + 1, 0);
  }
};

/**
 * Like newLine(), except maintain the cursor column.
 */
hterm.Terminal.prototype.lineFeed = function() {
  var column = this.screen_.cursorPosition.column;
  this.newLine();
  this.setCursorColumn(column);
};

/**
 * Replace all characters to the left of the current cursor with the space
 * character.
 *
 * TODO(rginda): This should probably *remove* the characters (not just replace
 * with a space) if there are no characters at or beyond the current cursor
 * position.  Once it does that, it'll have the same text-attribute related
 * issues as hterm.Screen.prototype.clearCursorRow :/
 */
hterm.Terminal.prototype.eraseToLeft = function() {
  var currentColumn = this.screen_.cursorPosition.column;
  this.setCursorColumn(0);
  this.screen_.overwriteString(hterm.getWhitespace(currentColumn + 1));
  this.setCursorColumn(currentColumn);
};

/**
 * Erase a given number of characters to the right of the cursor, shifting
 * remaining characters to the left.
 *
 * The cursor position is unchanged.
 *
 * TODO(rginda): Test that this works even when the cursor is positioned beyond
 * the end of the text.
 *
 * TODO(rginda): This likely has text-attribute related troubles similar to the
 * todo on hterm.Screen.prototype.clearCursorRow.
 */
hterm.Terminal.prototype.eraseToRight = function(opt_count) {
  var currentColumn = this.screen_.cursorPosition.column;

  var maxCount = this.screenSize.width - currentColumn;
  var count = (opt_count && opt_count < maxCount) ? opt_count : maxCount;
  this.screen_.deleteChars(count);
  this.setCursorColumn(currentColumn);
};

/**
 * Erase the current line.
 *
 * The cursor position is unchanged.
 *
 * TODO(rginda): This relies on hterm.Screen.prototype.clearCursorRow, which
 * has a text-attribute related TODO.
 */
hterm.Terminal.prototype.eraseLine = function() {
  var currentColumn = this.screen_.cursorPosition.column;
  this.screen_.clearCursorRow();
  this.setCursorColumn(currentColumn);
};

/**
 * Erase all characters from the start of the scroll region to the current
 * cursor position.
 *
 * The cursor position is unchanged.
 *
 * TODO(rginda): This relies on hterm.Screen.prototype.clearCursorRow, which
 * has a text-attribute related TODO.
 */
hterm.Terminal.prototype.eraseAbove = function() {
  var currentRow = this.screen_.cursorPosition.row;
  var currentColumn = this.screen_.cursorPosition.column;

  var top = this.getVTScrollTop();
  for (var i = top; i < currentRow; i++) {
    this.screen_.setCursorPosition(i, 0);
    this.screen_.clearCursorRow();
  }

  this.screen_.setCursorPosition(currentRow, currentColumn);
};

/**
 * Erase all characters from the current cursor position to the end of the
 * scroll region.
 *
 * The cursor position is unchanged.
 *
 * TODO(rginda): This relies on hterm.Screen.prototype.clearCursorRow, which
 * has a text-attribute related TODO.
 */
hterm.Terminal.prototype.eraseBelow = function() {
  var currentRow = this.screen_.cursorPosition.row;
  var currentColumn = this.screen_.cursorPosition.column;

  var bottom = this.getVTScrollBottom();
  for (var i = currentRow + 1; i < bottom; i++) {
    this.screen_.setCursorPosition(i, 0);
    this.screen_.clearCursorRow();
  }

  this.screen_.setCursorPosition(currentRow, currentColumn);
};

/**
 * Erase the entire scroll region.
 *
 * The cursor position is unchanged.
 *
 * TODO(rginda): This relies on hterm.Screen.prototype.clearCursorRow, which
 * has a text-attribute related TODO.
 */
hterm.Terminal.prototype.clear = function() {
  var currentRow = this.screen_.cursorPosition.row;
  var currentColumn = this.screen_.cursorPosition.column;

  var top = this.getVTScrollTop();
  var bottom = this.getVTScrollBottom();

  for (var i = top; i < bottom; i++) {
    this.screen_.setCursorPosition(i, 0);
    this.screen_.clearCursorRow();
  }

  this.screen_.setCursorPosition(currentRow, currentColumn);
};

/**
 * VT command to insert lines at the current cursor row.
 *
 * This respects the current scroll region.  Rows pushed off the bottom are
 * lost (they won't show up in the scrollback buffer).
 *
 * TODO(rginda): This relies on hterm.Screen.prototype.clearCursorRow, which
 * has a text-attribute related TODO.
 *
 * @param {integer} count The number of lines to insert.
 */
hterm.Terminal.prototype.insertLines = function(count) {
  var currentRow = this.screen_.cursorPosition.row;

  var bottom = this.getVTScrollBottom();
  count = Math.min(count, bottom - currentRow);

  var start = bottom - count;
  if (start != currentRow)
    this.moveRows_(start, count, currentRow);

  for (var i = 0; i < count; i++) {
    this.screen_.setCursorPosition(currentRow + i, 0);
    this.screen_.clearCursorRow();
  }

  this.screen_.setCursorPosition(currentRow, 0);
};

/**
 * VT command to delete lines at the current cursor row.
 *
 * New rows are added to the bottom of scroll region to take their place.  New
 * rows are strictly there to take up space and have no content or style.
 */
hterm.Terminal.prototype.deleteLines = function(count) {
  var currentRow = this.screen_.cursorPosition.row;
  var currentColumn = this.screen_.cursorPosition.column;

  var top = currentRow;
  var bottom = this.getVTScrollBottom();

  var maxCount = bottom - top;
  count = Math.min(count, maxCount);

  var moveStart = bottom - count;
  if (count != maxCount)
    this.moveRows_(top, count, moveStart);

  for (var i = 0; i < count; i++) {
    this.screen_.setCursorPosition(moveStart + i, 0);
    this.screen_.clearCursorRow();
  }

  this.screen_.setCursorPosition(currentRow, currentColumn);
};

/**
 * Inserts the given number of spaces at the current cursor position.
 *
 * The cursor is left at the end of the inserted spaces.
 */
hterm.Terminal.prototype.insertSpace = function(count) {
  var ws = hterm.getWhitespace(count);
  this.screen_.insertString(ws);
};

/**
 * Forward-delete the specified number of characters starting at the cursor
 * position.
 *
 * @param {integer} count The number of characters to delete.
 */
hterm.Terminal.prototype.deleteChars = function(count) {
  this.screen_.deleteChars(count);
};

/**
 * Shift rows in the scroll region upwards by a given number of lines.
 *
 * New rows are inserted at the bottom of the scroll region to fill the
 * vacated rows.  The new rows not filled out with the current text attributes.
 *
 * This function does not affect the scrollback rows at all.  Rows shifted
 * off the top are lost.
 *
 * @param {integer} count The number of rows to scroll.
 */
hterm.Terminal.prototype.vtScrollUp = function(count) {
  var currentRow = this.screen_.cursorPosition.row;
  var currentColumn = this.screen_.cursorPosition.column;

  this.setCursorRow(this.getVTScrollTop());
  this.deleteLines(count);

  this.screen_.setCursorPosition(currentRow, currentColumn);
};

/**
 * Shift rows below the cursor down by a given number of lines.
 *
 * This function respects the current scroll region.
 *
 * New rows are inserted at the top of the scroll region to fill the
 * vacated rows.  The new rows not filled out with the current text attributes.
 *
 * This function does not affect the scrollback rows at all.  Rows shifted
 * off the bottom are lost.
 *
 * @param {integer} count The number of rows to scroll.
 */
hterm.Terminal.prototype.vtScrollDown = function(opt_count) {
  var currentRow = this.screen_.cursorPosition.row;
  var currentColumn = this.screen_.cursorPosition.column;

  this.setCursorRow(this.getVTScrollTop());
  this.insertLines(opt_count);

  this.screen_.setCursorPosition(currentRow, currentColumn);
};

/**
 * Set the cursor position.
 *
 * The cursor row is relative to the scroll region if the terminal has
 * 'origin mode' enabled, or relative to the addressable screen otherwise.
 *
 * @param {integer} row The new zero-based cursor row.
 * @param {integer} row The new zero-based cursor column.
 */
hterm.Terminal.prototype.setCursorPosition = function(row, column) {
  if (this.options_.originMode) {
    var scrollTop = this.getScrollTop();
    row = hterm.clamp(row + scrollTop, scrollTop, this.getScrollBottom());
  } else {
    row = hterm.clamp(row, 0, this.screenSize.height);
  }

  this.screen_.setCursorPosition(row, column);
};

/**
 * Set the cursor column.
 *
 * @param {integer} column The new zero-based cursor column.
 */
hterm.Terminal.prototype.setCursorColumn = function(column) {
  this.screen_.setCursorPosition(this.screen_.cursorPosition.row, column);
};

/**
 * Return the cursor column.
 *
 * @return {integer} The zero-based cursor column.
 */
hterm.Terminal.prototype.getCursorColumn = function() {
  return this.screen_.cursorPosition.column;
};

/**
 * Set the cursor row.
 *
 * The cursor row is relative to the scroll region if the terminal has
 * 'origin mode' enabled, or relative to the addressable screen otherwise.
 *
 * @param {integer} row The new cursor row.
 */
hterm.Terminal.prototype.setCursorRow = function(row) {
  this.setCursorPosition(row, this.screen_.cursorPosition.column);
};

/**
 * Return the cursor row.
 *
 * @return {integer} The zero-based cursor row.
 */
hterm.Terminal.prototype.getCursorRow = function(row) {
  return this.screen_.cursorPosition.row;
};

/**
 * Request that the ScrollPort redraw itself soon.
 *
 * The redraw will happen asynchronously, soon after the call stack winds down.
 * Multiple calls will be coalesced into a single redraw.
 */
hterm.Terminal.prototype.scheduleRedraw_ = function() {
  if (this.redrawTimeout_)
    clearTimeout(this.redrawTimeout_);

  var self = this;
  setTimeout(function() {
      self.redrawTimeout_ = null;
      self.scrollPort_.redraw_();
    }, 0);
};

/**
 * Request that the ScrollPort be scrolled to the bottom.
 *
 * The scroll will happen asynchronously, soon after the call stack winds down.
 * Multiple calls will be coalesced into a single scroll.
 *
 * This affects the scrollbar position of the ScrollPort, and has nothing to
 * do with the VT scroll commands.
 */
hterm.Terminal.prototype.scheduleScrollDown_ = function() {
  if (this.timeouts_.scrollDown)
    clearTimeout(this.timeouts_.scrollDown);

  var self = this;
  this.timeouts_.scrollDown = setTimeout(function() {
      delete self.timeouts_.scrollDown;
      self.scrollPort_.scrollRowToBottom(self.getRowCount());
    }, 10);
};

/**
 * Move the cursor up a specified number of rows.
 *
 * @param {integer} count The number of rows to move the cursor.
 */
hterm.Terminal.prototype.cursorUp = function(count) {
  return this.cursorDown(-count);
};

/**
 * Move the cursor down a specified number of rows.
 *
 * @param {integer} count The number of rows to move the cursor.
 */
hterm.Terminal.prototype.cursorDown = function(count) {
  var minHeight = (this.options_.originMode ? this.getVTScrollTop() : 0);
  var maxHeight = (this.options_.originMode ? this.getVTScrollBottom() :
                   this.screenSize.height - 1);

  var row = hterm.clamp(this.screen_.cursorPosition.row + count,
                        minHeight, maxHeight);
  this.setCursorRow(row);
};

/**
 * Move the cursor left a specified number of columns.
 *
 * @param {integer} count The number of columns to move the cursor.
 */
hterm.Terminal.prototype.cursorLeft = function(count) {
  return this.cursorRight(-count);
};

/**
 * Move the cursor right a specified number of columns.
 *
 * @param {integer} count The number of columns to move the cursor.
 */
hterm.Terminal.prototype.cursorRight = function(count) {
  var column = hterm.clamp(this.screen_.cursorPosition.column + count,
                           0, this.screenSize.width);
  this.setCursorColumn(column);
};

/**
 * Reverse the foreground and background colors of the terminal.
 *
 * This only affects text that was drawn with no attributes.
 *
 * TODO(rginda): Test xterm to see if reverse is respected for text that has
 * been drawn with attributes that happen to coincide with the default
 * 'no-attribute' colors.  My guess is probably not.
 */
hterm.Terminal.prototype.setReverseVideo = function(state) {
  if (state) {
    this.scrollPort_.setForegroundColor(this.backgroundColor);
    this.scrollPort_.setBackgroundColor(this.foregroundColor);
  } else {
    this.scrollPort_.setForegroundColor(this.foregroundColor);
    this.scrollPort_.setBackgroundColor(this.backgroundColor);
  }
};

/**
 * Set the origin mode bit.
 *
 * If origin mode is on, certain VT cursor and scrolling commands measure their
 * row parameter relative to the VT scroll region.  Otherwise, row 0 corresponds
 * to the top of the addressable screen.
 *
 * Defaults to off.
 *
 * @param {boolean} state True to set origin mode, false to unset.
 */
hterm.Terminal.prototype.setOriginMode = function(state) {
  this.options_.originMode = state;
};

/**
 * Set the insert mode bit.
 *
 * If insert mode is on, existing text beyond the cursor position will be
 * shifted right to make room for new text.  Otherwise, new text overwrites
 * any existing text.
 *
 * Defaults to off.
 *
 * @param {boolean} state True to set insert mode, false to unset.
 */
hterm.Terminal.prototype.setInsertMode = function(state) {
  this.options_.insertMode = state;
};

/**
 * Set the wraparound mode bit.
 *
 * If wraparound mode is on, certain VT commands will allow the cursor to wrap
 * to the start of the following row.  Otherwise, the cursor is clamped to the
 * end of the screen and attempts to write past it are ignored.
 *
 * Defaults to on.
 *
 * @param {boolean} state True to set wraparound mode, false to unset.
 */
hterm.Terminal.prototype.setWraparound = function(state) {
  this.options_.wraparound = state;
};

/**
 * Set the reverse-wraparound mode bit.
 *
 * If wraparound mode is off, certain VT commands will allow the cursor to wrap
 * to the end of the previous row.  Otherwise, the cursor is clamped to column
 * 0.
 *
 * Defaults to off.
 *
 * @param {boolean} state True to set reverse-wraparound mode, false to unset.
 */
hterm.Terminal.prototype.setReverseWraparound = function(state) {
  this.options_.reverseWraparound = state;
};

/**
 * Selects between the primary and alternate screens.
 *
 * If alternate mode is on, the alternate screen is active.  Otherwise the
 * primary screen is active.
 *
 * Swapping screens has no effect on the scrollback buffer.
 *
 * Each screen maintains its own cursor position.
 *
 * Defaults to off.
 *
 * @param {boolean} state True to set alternate mode, false to unset.
 */
hterm.Terminal.prototype.setAlternateMode = function(state) {
  this.screen_ = state ? this.alternateScreen_ : this.primaryScreen_;

  this.screen_.setColumnCount(this.screenSize.width);

  var rowDelta = this.screenSize.height - this.screen_.getHeight();
  if (rowDelta > 0)
    this.appendRows_(rowDelta);

  this.scrollPort_.invalidateRowRange(
      this.scrollbackRows_.length,
      this.scrollbackRows_.length + this.screenSize.height);

  if (this.screen_.cursorPosition.row == -1)
    this.screen_.setCursorPosition(0, 0);

  this.syncCursorPosition_();
};

/**
 * Set the cursor-blink mode bit.
 *
 * If cursor-blink is on, the cursor will blink when it is visible.  Otherwise
 * a visible cursor does not blink.
 *
 * You should make sure to turn blinking off if you're going to dispose of a
 * terminal, otherwise you'll leak a timeout.
 *
 * Defaults to on.
 *
 * @param {boolean} state True to set cursor-blink mode, false to unset.
 */
hterm.Terminal.prototype.setCursorBlink = function(state) {
  this.options_.cursorBlink = state;

  if (!state && this.timeouts_.cursorBlink) {
    clearTimeout(this.timeouts_.cursorBlink);
    delete this.timeouts_.cursorBlink;
  }

  if (this.options_.cursorVisible)
    this.setCursorVisible(true);
};

/**
 * Set the cursor-visible mode bit.
 *
 * If cursor-visible is on, the cursor will be visible.  Otherwise it will not.
 *
 * Defaults to on.
 *
 * @param {boolean} state True to set cursor-visible mode, false to unset.
 */
hterm.Terminal.prototype.setCursorVisible = function(state) {
  this.options_.cursorVisible = state;

  if (!state) {
    this.cursorNode_.style.display = 'none';
    return;
  }

  this.cursorNode_.style.display = 'block';

  if (this.options_.cursorBlink) {
    if (this.timeouts_.cursorBlink)
      return;

    this.timeouts_.cursorBlink = setInterval(this.onCursorBlink_.bind(this),
                                             500);
  } else {
    if (this.timeouts_.cursorBlink) {
      clearTimeout(this.timeouts_.cursorBlink);
      delete this.timeouts_.cursorBlink;
    }
  }
};

/**
 * Synchronizes the visible cursor with the current cursor coordinates.
 */
hterm.Terminal.prototype.syncCursorPosition_ = function() {
  var topRowIndex = this.scrollPort_.getTopRowIndex();
  var bottomRowIndex = this.scrollPort_.getBottomRowIndex(topRowIndex);
  var cursorRowIndex = this.scrollbackRows_.length +
      this.screen_.cursorPosition.row;

  if (cursorRowIndex > bottomRowIndex) {
    // Cursor is scrolled off screen, move it outside of the visible area.
    this.cursorNode_.style.top = -this.characterSize_.height;
    return;
  }

  this.cursorNode_.style.top = this.scrollPort_.visibleRowTopMargin +
      this.characterSize_.height * (cursorRowIndex - topRowIndex);
  this.cursorNode_.style.left = this.characterSize_.width *
      this.screen_.cursorPosition.column;
};

/**
 * Synchronizes the visible cursor with the current cursor coordinates.
 *
 * The sync will happen asynchronously, soon after the call stack winds down.
 * Multiple calls will be coalesced into a single sync.
 */
hterm.Terminal.prototype.scheduleSyncCursorPosition_ = function() {
  if (this.timeouts_.syncCursor)
    clearTimeout(this.timeouts_.syncCursor);

  var self = this;
  this.timeouts_.syncCursor = setTimeout(function() {
      self.syncCursorPosition_();
      delete self.timeouts_.syncCursor;
    }, 100);
};

/**
 * React when the ScrollPort is scrolled.
 */
hterm.Terminal.prototype.onScroll_ = function() {
  this.scheduleSyncCursorPosition_();
};

/**
 * React when the ScrollPort is resized.
 */
hterm.Terminal.prototype.onResize_ = function() {
  var width = Math.floor(this.scrollPort_.getScreenWidth() /
                         this.characterSize_.width);
  var height = this.scrollPort_.visibleRowCount;

  if (width == this.screenSize.width && height == this.screenSize.height)
    return;

  this.screenSize.resize(width, height);

  var screenHeight = this.screen_.getHeight();

  var deltaRows = this.screenSize.height - screenHeight;

  if (deltaRows < 0) {
    // Screen got smaller.
    var ary = this.screen_.shiftRows(-deltaRows);
    this.scrollbackRows_.push.apply(this.scrollbackRows_, ary);
  } else if (deltaRows > 0) {
    // Screen got larger.

    if (deltaRows <= this.scrollbackRows_.length) {
      var scrollbackCount = Math.min(deltaRows, this.scrollbackRows_.length);
      var rows = this.scrollbackRows_.splice(
          0, this.scrollbackRows_.length - scrollbackCount);
      this.screen_.unshiftRows(rows);
      deltaRows -= scrollbackCount;
    }

    if (deltaRows)
      this.appendRows_(deltaRows);
  }

  this.screen_.setColumnCount(this.screenSize.width);

  if (this.screen_.cursorPosition.row == -1)
    this.screen_.setCursorPosition(0, 0);
};

/**
 * Service the cursor blink timeout.
 */
hterm.Terminal.prototype.onCursorBlink_ = function() {
  if (this.cursorNode_.style.display == 'block') {
    this.cursorNode_.style.display = 'none';
  } else {
    this.cursorNode_.style.display = 'block';
  }
};
