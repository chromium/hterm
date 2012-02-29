// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
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

  // The local notion of the screen size.  ScreenBuffers also have a size which
  // indicates their present size.  During size changes, the two may disagree.
  // Also, the inactive screen's size is not altered until it is made the active
  // screen.
  this.screenSize = new hterm.Size(0, 0);

  // The scroll port we'll be using to display the visible rows.
  this.scrollPort_ = new hterm.ScrollPort(this);
  this.scrollPort_.subscribe('resize', this.onResize_.bind(this));
  this.scrollPort_.subscribe('scroll', this.onScroll_.bind(this));
  this.scrollPort_.subscribe('paste', this.onPaste_.bind(this));

  // The div that contains this terminal.
  this.div_ = null;

  // The document that contains the scrollPort.  Defaulted to the global
  // document here so that the terminal is functional even if it hasn't been
  // inserted into a document yet, but re-set in decorate().
  this.document_ = window.document;

  // The rows that have scrolled off screen and are no longer addressable.
  this.scrollbackRows_ = [];

  // Saved tab stops.
  this.tabStops_ = [];

  // The VT's notion of the top and bottom rows.  Used during some VT
  // cursor positioning and scrolling commands.
  this.vtScrollTop_ = null;
  this.vtScrollBottom_ = null;

  // The DIV element for the visible cursor.
  this.cursorNode_ = null;

  // Terminal bell sound.
  this.bellAudio_ = this.document_.createElement('audio');
  this.bellAudio_.setAttribute('src', '../audio/bell.ogg');
  this.bellAudio_.setAttribute('preload', 'auto');

  // Cursor position and attributes saved with DECSC.
  this.savedOptions_ = {};

  // The current mode bits for the terminal.
  this.options_ = new hterm.Options();

  // Timeouts we might need to clear.
  this.timeouts_ = {};

  // The VT escape sequence interpreter.
  this.vt = new hterm.VT(this);

  // The keyboard hander.
  this.keyboard = new hterm.Keyboard(this);

  // General IO interface that can be given to third parties without exposing
  // the entire terminal object.
  this.io = new hterm.Terminal.IO(this);

  this.realizeSize_(80, 24);
  this.setDefaultTabStops();
};

/**
 * Default font family for the terminal text.
 */

hterm.Terminal.prototype.defaultFontFamily =
    '"DejaVu Sans Mono", "Everson Mono", FreeMono, ' +
    '"Menlo", "Lucida Console", monospace';

/**
 * The default colors for text with no other color attributes.
 */
hterm.Terminal.prototype.backgroundColor = 'black';
hterm.Terminal.prototype.foregroundColor = 'white';

/**
 * Default tab with of 8 to match xterm.
 */
hterm.Terminal.prototype.tabWidth = 8;

/**
 * The color of the visible cursor.
 */
hterm.Terminal.prototype.cursorColor = 'rgba(255,0,0,0.5)';

/**
 * If true, scroll to the bottom on any keystroke.
 */
hterm.Terminal.prototype.scrollOnKeystroke = true;

/**
 * If true, scroll to the bottom on terminal output.
 */
hterm.Terminal.prototype.scrollOnOutput = false;

/**
 * The default font size in pixels.
 */
hterm.Terminal.prototype.defaultFontSizePx = 15;

/**
 * The assumed width of a scrollbar.
 */
hterm.Terminal.prototype.scrollbarWidthPx = 16;

/**
 * Create a new instance of a terminal command and run it with a given
 * argument string.
 *
 * @param {function} commandClass The constructor for a terminal command.
 * @param {string} argString The argument string to pass to the command.
 */
hterm.Terminal.prototype.runCommandClass = function(commandClass, argString) {
  var self = this;
  this.command = new commandClass(
      { argString: argString || '',
        io: this.io.push(),
        onExit: function(code) {
          self.io.pop();
          self.io.println(hterm.msg('COMMAND_COMPLETE',
                                    [self.command.commandName, code]));
          self.uninstallKeyboard();
        }
      });

  this.installKeyboard();
  this.command.run();
};

/**
 * Returns true if the current screen is the primary screen, false otherwise.
 */
hterm.Terminal.prototype.isPrimaryScreen = function() {
  return this.screen_ = this.primaryScreen_;
};

/**
 * Install the keyboard handler for this terminal.
 *
 * This will prevent the browser from seeing any keystrokes sent to the
 * terminal.
 */
hterm.Terminal.prototype.installKeyboard = function() {
  this.keyboard.installKeyboard(this.document_.body.firstChild);
}

/**
 * Uninstall the keyboard handler for this terminal.
 */
hterm.Terminal.prototype.uninstallKeyboard = function() {
  this.keyboard.installKeyboard(null);
}

/**
 * Set the font size for this terminal.
 */
hterm.Terminal.prototype.setFontSize = function(px) {
  this.scrollPort_.setFontSize(px);
};

/**
 * Get the current font size.
 */
hterm.Terminal.prototype.getFontSize = function() {
  return this.scrollPort_.getFontSize();
};

/**
 * Set the CSS "font-family" for this terminal.
 */
hterm.Terminal.prototype.setFontFamily = function(str) {
  this.scrollPort_.setFontFamily(str);
  var normalSize = this.scrollPort_.measureCharacterSize();
  var boldSize = this.scrollPort_.measureCharacterSize('bold');

  var isBoldSafe = normalSize.equals(boldSize);
  this.screen_.textAttributes.enableBold = isBoldSafe;
  if (!isBoldSafe) {
    console.warn('Bold characters disabled: Size of bold weight differs ' +
                 'from normal.  Font family is: ' + str);
  }
};

/**
 * Return a copy of the current cursor position.
 *
 * @return {hterm.RowCol} The RowCol object representing the current position.
 */
hterm.Terminal.prototype.saveCursor = function() {
  return this.screen_.cursorPosition.clone();
};

hterm.Terminal.prototype.getTextAttributes = function() {
  return this.screen_.textAttributes;
};

/**
 * Change the title of this terminal's window.
 */
hterm.Terminal.prototype.setWindowTitle = function(title) {
  window.document.title = title;
};

/**
 * Restore a previously saved cursor position.
 *
 * @param {hterm.RowCol} cursor The position to restore.
 */
hterm.Terminal.prototype.restoreCursor = function(cursor) {
  var row = hterm.clamp(cursor.row, 0, this.screenSize.height - 1);
  var column = hterm.clamp(cursor.column, 0, this.screenSize.width - 1);
  this.screen_.setCursorPosition(row, column);
  if (cursor.column > column ||
      cursor.column == column && cursor.overflow) {
    this.screen_.cursorPosition.overflow = true;
  }
};

/**
 * Set the width of the terminal, resizing the UI to match.
 */
hterm.Terminal.prototype.setWidth = function(columnCount) {
  if (columnCount == null) {
    this.div_.style.width = '100%';
    return;
  }

  this.div_.style.width = this.scrollPort_.characterSize.width *
      columnCount + this.scrollbarWidthPx + 'px';
  this.realizeSize_(columnCount, this.screenSize.height);
  this.scheduleSyncCursorPosition_();
};

/**
 * Set the height of the terminal, resizing the UI to match.
 */
hterm.Terminal.prototype.setHeight = function(rowCount) {
  if (rowCount == null) {
    this.div_.style.height = '100%';
    return;
  }

  this.div_.style.height =
      this.scrollPort_.characterSize.height * rowCount + 'px';
  this.realizeSize_(this.screenSize.width, rowCount);
  this.scheduleSyncCursorPosition_();
};

/**
 * Deal with terminal size changes.
 *
 */
hterm.Terminal.prototype.realizeSize_ = function(columnCount, rowCount) {
  if (columnCount != this.screenSize.width)
    this.realizeWidth_(columnCount);

  if (rowCount != this.screenSize.height)
    this.realizeHeight_(rowCount);

  // Send new terminal size to plugin.
  this.io.onTerminalResize(columnCount, rowCount);
};

/**
 * Deal with terminal width changes.
 *
 * This function does what needs to be done when the terminal width changes
 * out from under us.  It happens here rather than in onResize_() because this
 * code may need to run synchronously to handle programmatic changes of
 * terminal width.
 *
 * Relying on the browser to send us an async resize event means we may not be
 * in the correct state yet when the next escape sequence hits.
 */
hterm.Terminal.prototype.realizeWidth_ = function(columnCount) {
  var deltaColumns = columnCount - this.screen_.getWidth();

  this.screenSize.width = columnCount;
  this.screen_.setColumnCount(columnCount);

  if (deltaColumns > 0) {
    this.setDefaultTabStops(this.screenSize.width - deltaColumns);
  } else {
    for (var i = this.tabStops_.length - 1; i >= 0; i--) {
      if (this.tabStops_[i] <= columnCount)
        break;

      this.tabStops_.pop();
    }
  }

  this.screen_.setColumnCount(this.screenSize.width);
};

/**
 * Deal with terminal height changes.
 *
 * This function does what needs to be done when the terminal height changes
 * out from under us.  It happens here rather than in onResize_() because this
 * code may need to run synchronously to handle programmatic changes of
 * terminal height.
 *
 * Relying on the browser to send us an async resize event means we may not be
 * in the correct state yet when the next escape sequence hits.
 */
hterm.Terminal.prototype.realizeHeight_ = function(rowCount) {
  var deltaRows = rowCount - this.screen_.getHeight();

  this.screenSize.height = rowCount;

  var cursor = this.saveCursor();

  if (deltaRows < 0) {
    // Screen got smaller.
    deltaRows *= -1;
    while (deltaRows) {
      var lastRow = this.getRowCount() - 1;
      if (lastRow - this.scrollbackRows_.length == cursor.row)
        break;

      if (this.getRowText(lastRow))
        break;

      this.screen_.popRow();
      deltaRows--;
    }

    var ary = this.screen_.shiftRows(deltaRows);
    this.scrollbackRows_.push.apply(this.scrollbackRows_, ary);

    // We just removed rows from the top of the screen, we need to update
    // the cursor to match.
    cursor.row = Math.max(cursor.row - deltaRows, 0);
  } else if (deltaRows > 0) {
    // Screen got larger.

    if (deltaRows <= this.scrollbackRows_.length) {
      var scrollbackCount = Math.min(deltaRows, this.scrollbackRows_.length);
      var rows = this.scrollbackRows_.splice(
          this.scrollbackRows_.length - scrollbackCount, scrollbackCount);
      this.screen_.unshiftRows(rows);
      deltaRows -= scrollbackCount;
      cursor.row += scrollbackCount;
    }

    if (deltaRows)
      this.appendRows_(deltaRows);
  }

  this.setVTScrollRegion(null, null);
  this.restoreCursor(cursor);
};

/**
 * Scroll the terminal to the top of the scrollback buffer.
 */
hterm.Terminal.prototype.scrollHome = function() {
  this.scrollPort_.scrollRowToTop(0);
};

/**
 * Scroll the terminal to the end.
 */
hterm.Terminal.prototype.scrollEnd = function() {
  this.scrollPort_.scrollRowToBottom(this.getRowCount());
};

/**
 * Scroll the terminal one page up (minus one line) relative to the current
 * position.
 */
hterm.Terminal.prototype.scrollPageUp = function() {
  var i = this.scrollPort_.getTopRowIndex();
  this.scrollPort_.scrollRowToTop(i - this.screenSize.height + 1);
};

/**
 * Scroll the terminal one page down (minus one line) relative to the current
 * position.
 */
hterm.Terminal.prototype.scrollPageDown = function() {
  var i = this.scrollPort_.getTopRowIndex();
  this.scrollPort_.scrollRowToTop(i + this.screenSize.height - 1);
};

/**
 * Full terminal reset.
 */
hterm.Terminal.prototype.reset = function() {
  this.clearAllTabStops();
  this.setDefaultTabStops();
  this.clearColorAndAttributes();
  this.setVTScrollRegion(null, null);
  this.clear();
  this.setAbsoluteCursorPosition(0, 0);
  this.softReset();
};

/**
 * Soft terminal reset.
 */
hterm.Terminal.prototype.softReset = function() {
  this.options_ = new hterm.Options();
  this.setCursorVisible(true);
  this.setCursorBlink(false);
};

hterm.Terminal.prototype.clearColorAndAttributes = function() {
  //console.log('clearColorAndAttributes');
};

hterm.Terminal.prototype.setForegroundColor256 = function() {
  console.log('setForegroundColor256');
};

hterm.Terminal.prototype.setBackgroundColor256 = function() {
  console.log('setBackgroundColor256');
};

hterm.Terminal.prototype.setForegroundColor = function() {
  //console.log('setForegroundColor');
};

hterm.Terminal.prototype.setBackgroundColor = function() {
  //console.log('setBackgroundColor');
};

hterm.Terminal.prototype.setAttributes = function() {
  //console.log('setAttributes');
};

hterm.Terminal.prototype.resize = function() {
  console.log('resize');
};

hterm.Terminal.prototype.setCharacterSet = function() {
  //console.log('setCharacterSet');
};

/**
 * Move the cursor forward to the next tab stop, or to the last column
 * if no more tab stops are set.
 */
hterm.Terminal.prototype.forwardTabStop = function() {
  var column = this.screen_.cursorPosition.column;

  for (var i = 0; i < this.tabStops_.length; i++) {
    if (this.tabStops_[i] > column) {
      this.setCursorColumn(this.tabStops_[i]);
      return;
    }
  }

  this.setCursorColumn(this.screenSize.width - 1);
};

/**
 * Move the cursor backward to the previous tab stop, or to the first column
 * if no previous tab stops are set.
 */
hterm.Terminal.prototype.backwardTabStop = function() {
  var column = this.screen_.cursorPosition.column;

  for (var i = this.tabStops_.length - 1; i >= 0; i--) {
    if (this.tabStops_[i] < column) {
      this.setCursorColumn(this.tabStops_[i]);
      return;
    }
  }

  this.setCursorColumn(1);
};

/**
 * Set a tab stop at the given column.
 *
 * @param {int} column Zero based column.
 */
hterm.Terminal.prototype.setTabStop = function(column) {
  for (var i = this.tabStops_.length - 1; i >= 0; i--) {
    if (this.tabStops_[i] == column)
      return;

    if (this.tabStops_[i] < column) {
      this.tabStops_.splice(i + 1, 0, column);
      return;
    }
  }

  this.tabStops_.splice(0, 0, column);
};

/**
 * Clear the tab stop at the current cursor position.
 *
 * No effect if there is no tab stop at the current cursor position.
 */
hterm.Terminal.prototype.clearTabStopAtCursor = function() {
  var column = this.screen_.cursorPosition.column;

  var i = this.tabStops_.indexOf(column);
  if (i == -1)
    return;

  this.tabStops_.splice(i, 1);
};

/**
 * Clear all tab stops.
 */
hterm.Terminal.prototype.clearAllTabStops = function() {
  this.tabStops_.length = 0;
};

/**
 * Set up the default tab stops, starting from a given column.
 *
 * This sets a tabstop every (column % this.tabWidth) column, starting
 * from the specified column, or 0 if no column is provided.
 *
 * This does not clear the existing tab stops first, use clearAllTabStops
 * for that.
 *
 * @param {int} opt_start Optional starting zero based starting column, useful
 *     for filling out missing tab stops when the terminal is resized.
 */
hterm.Terminal.prototype.setDefaultTabStops = function(opt_start) {
  var start = opt_start || 0;
  var w = this.tabWidth;
  var stopCount = Math.floor((this.screenSize.width - start) / this.tabWidth)
  for (var i = 0; i < stopCount; i++) {
    this.setTabStop(Math.floor((start + i * w) / w) * w + w);
  }
};

/**
 * Save cursor position and attributes.
 *
 * TODO(rginda): Save attributes once we support them.
 */
hterm.Terminal.prototype.saveOptions = function() {
  this.savedOptions_.cursor = this.saveCursor();
  this.savedOptions_.textAttributes = this.screen_.textAttributes.clone();
};

/**
 * Restore cursor position and attributes.
 *
 * TODO(rginda): Restore attributes once we support them.
 */
hterm.Terminal.prototype.restoreOptions = function() {
  if (this.savedOptions_.cursor)
    this.restoreCursor(this.savedOptions_.cursor);
  if (this.savedOptions_.textAttributes)
    this.screen_.textAttributes = this.savedOptions_.textAttributes;
};

/**
 * Interpret a sequence of characters.
 *
 * Incomplete escape sequences are buffered until the next call.
 *
 * @param {string} str Sequence of characters to interpret or pass through.
 */
hterm.Terminal.prototype.interpret = function(str) {
  this.vt.interpret(str);
  this.scheduleSyncCursorPosition_();
};

/**
 * Take over the given DIV for use as the terminal display.
 *
 * @param {HTMLDivElement} div The div to use as the terminal display.
 */
hterm.Terminal.prototype.decorate = function(div) {
  this.div_ = div;

  this.scrollPort_.decorate(div);

  this.setFontSize(this.defaultFontSize);
  this.setFontFamily(this.defaultFontFamily);

  this.document_ = this.scrollPort_.getDocument();

  this.cursorNode_ = this.document_.createElement('div');
  this.cursorNode_.style.cssText =
      ('position: absolute;' +
       'top: -99px;' +
       'display: block;' +
       'width: ' + this.scrollPort_.characterSize.width + 'px;' +
       'height: ' + this.scrollPort_.characterSize.height + 'px;' +
       '-webkit-transition: opacity, background-color 100ms linear;' +
       'background-color: ' + this.cursorColor);
  this.document_.body.appendChild(this.cursorNode_);

  this.setReverseVideo(false);

  var link = this.document_.createElement('link');
  link.setAttribute('href', '../css/dialogs.css');
  link.setAttribute('rel', 'stylesheet');
  this.document_.head.appendChild(link);

  this.alertDialog = new AlertDialog(this.document_.body);
  this.promptDialog = new PromptDialog(this.document_.body);
  this.confirmDialog = new ConfirmDialog(this.document_.body);

  this.scrollPort_.focus();
  this.scrollPort_.scheduleRedraw();
};

hterm.Terminal.prototype.getDocument = function() {
  return this.document_;
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
  return node.textContent;
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

  this.setAbsoluteCursorPosition(cursorRow, 0);
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
 */
hterm.Terminal.prototype.moveRows_ = function(fromIndex, count, toIndex) {
  var ary = this.screen_.removeRows(fromIndex, count);
  this.screen_.insertRows(toIndex, ary);

  var start, end;
  if (fromIndex < toIndex) {
    start = fromIndex;
    end = toIndex + count;
  } else {
    start = toIndex;
    end = fromIndex + count;
  }

  this.renumberRows_(start, end);
  this.scrollPort_.scheduleInvalidate();
};

/**
 * Renumber the rowIndex property of the given range of rows.
 *
 * The start and end indicies are relative to the screen, not the scrollback.
 * Rows in the scrollback buffer cannot be renumbered.  Since they are not
 * addressable (you can't delete them, scroll them, etc), you should have
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
  if (this.options_.wraparound && this.screen_.cursorPosition.overflow)
    this.newLine();

  if (this.options_.insertMode) {
    this.screen_.insertString(str);
  } else {
    this.screen_.overwriteString(str);
  }

  var overflow = this.screen_.maybeClipCurrentRow();

  if (this.options_.wraparound && overflow) {
    var lastColumn;

    do {
      this.newLine();
      lastColumn = overflow.characterLength;

      if (!this.options_.insertMode)
        this.screen_.deleteChars(overflow.characterLength);

      this.screen_.prependNodes(overflow);

      overflow = this.screen_.maybeClipCurrentRow();
    } while (overflow);

    this.setCursorColumn(lastColumn);
  }

  this.scheduleSyncCursorPosition_();

  if (this.scrollOnOutput)
    this.scrollPort_.scrollRowToBottom(this.getRowCount());
};

/**
 * Set the VT scroll region.
 *
 * This also resets the cursor position to the absolute (0, 0) position, since
 * that's what xterm appears to do.
 *
 * @param {integer} scrollTop The zero-based top of the scroll region.
 * @param {integer} scrollBottom The zero-based bottom of the scroll region,
 *     inclusive.
 */
hterm.Terminal.prototype.setVTScrollRegion = function(scrollTop, scrollBottom) {
  this.vtScrollTop_ = scrollTop;
  this.vtScrollBottom_ = scrollBottom;
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
};

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

  return this.screenSize.height - 1;
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
    // If we're at the end of the screen we need to append a new line and
    // scroll the top line into the scrollback buffer.
    this.appendRows_(1);
  } else if (this.screen_.cursorPosition.row == this.getVTScrollBottom()) {
    // End of the scroll region does not affect the scrollback buffer.
    this.vtScrollUp(1);
    this.setAbsoluteCursorPosition(this.screen_.cursorPosition.row, 0);
  } else {
    // Anywhere else in the screen just moves the cursor.
    this.setAbsoluteCursorPosition(this.screen_.cursorPosition.row + 1, 0);
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
 * If autoCarriageReturn is set then newLine(), else lineFeed().
 */
hterm.Terminal.prototype.formFeed = function() {
  if (this.options_.autoCarriageReturn) {
    this.newLine();
  } else {
    this.lineFeed();
  }
};

/**
 * Move the cursor up one row, possibly inserting a blank line.
 *
 * The cursor column is not changed.
 */
hterm.Terminal.prototype.reverseLineFeed = function() {
  var scrollTop = this.getVTScrollTop();
  var currentRow = this.screen_.cursorPosition.row;

  if (currentRow == scrollTop) {
    this.insertLines(1);
  } else {
    this.setAbsoluteCursorRow(currentRow - 1);
  }
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
  var cursor = this.saveCursor();
  this.setCursorColumn(0);
  this.screen_.overwriteString(hterm.getWhitespace(cursor.column + 1));
  this.restoreCursor(cursor);
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
  var cursor = this.saveCursor();

  var maxCount = this.screenSize.width - cursor.column;
  var count = (opt_count && opt_count < maxCount) ? opt_count : maxCount;
  this.screen_.deleteChars(count);
  this.restoreCursor(cursor);
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
  var cursor = this.saveCursor();
  this.screen_.clearCursorRow();
  this.restoreCursor(cursor);
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
  var cursor = this.saveCursor();

  this.eraseToLeft();

  var top = this.getVTScrollTop();
  for (var i = top; i < cursor.row; i++) {
    this.setAbsoluteCursorPosition(i, 0);
    this.screen_.clearCursorRow();
  }

  this.restoreCursor(cursor);
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
  var cursor = this.saveCursor();

  this.eraseToRight();

  var bottom = this.getVTScrollBottom();
  for (var i = cursor.row + 1; i <= bottom; i++) {
    this.setAbsoluteCursorPosition(i, 0);
    this.screen_.clearCursorRow();
  }

  this.restoreCursor(cursor);
};

/**
 * Fill the terminal with a given character.
 *
 * This methods does not respect the VT scroll region.
 *
 * @param {string} ch The character to use for the fill.
 */
hterm.Terminal.prototype.fill = function(ch) {
  var cursor = this.saveCursor();

  this.setAbsoluteCursorPosition(0, 0);
  for (var row = 0; row < this.screenSize.height; row++) {
    for (var col = 0; col < this.screenSize.width; col++) {
      this.setAbsoluteCursorPosition(row, col);
      this.screen_.overwriteString(ch);
    }
  }

  this.restoreCursor(cursor);
};

/**
 * Erase the entire display.
 *
 * The cursor position is unchanged.  This does not respect the scroll
 * region.
 *
 * TODO(rginda): This relies on hterm.Screen.prototype.clearCursorRow, which
 * has a text-attribute related TODO.
 */
hterm.Terminal.prototype.clear = function() {
  var cursor = this.saveCursor();

  var bottom = this.screenSize.height;

  for (var i = 0; i < bottom; i++) {
    this.setAbsoluteCursorPosition(i, 0);
    this.screen_.clearCursorRow();
  }

  this.restoreCursor(cursor);
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
  var cursor = this.saveCursor();

  var bottom = this.getVTScrollBottom();
  count = Math.min(count, bottom - cursor.row);

  var start = bottom - count + 1;
  if (start != cursor.row)
    this.moveRows_(start, count, cursor.row);

  for (var i = 0; i < count; i++) {
    this.setAbsoluteCursorPosition(cursor.row + i, 0);
    this.screen_.clearCursorRow();
  }

  cursor.column = 0;
  this.restoreCursor(cursor);
};

/**
 * VT command to delete lines at the current cursor row.
 *
 * New rows are added to the bottom of scroll region to take their place.  New
 * rows are strictly there to take up space and have no content or style.
 */
hterm.Terminal.prototype.deleteLines = function(count) {
  var cursor = this.saveCursor();

  var top = cursor.row;
  var bottom = this.getVTScrollBottom();

  var maxCount = bottom - top + 1;
  count = Math.min(count, maxCount);

  var moveStart = bottom - count + 1;
  if (count != maxCount)
    this.moveRows_(top, count, moveStart);

  for (var i = 0; i < count; i++) {
    this.setAbsoluteCursorPosition(moveStart + i, 0);
    this.screen_.clearCursorRow();
  }

  this.restoreCursor(cursor);
};

/**
 * Inserts the given number of spaces at the current cursor position.
 *
 * The cursor position is not changed.
 */
hterm.Terminal.prototype.insertSpace = function(count) {
  var cursor = this.saveCursor();

  var ws = hterm.getWhitespace(count || 1);
  this.screen_.insertString(ws);
  this.screen_.maybeClipCurrentRow();

  this.restoreCursor(cursor);
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
 * The cursor position is not altered.
 *
 * @param {integer} count The number of rows to scroll.
 */
hterm.Terminal.prototype.vtScrollUp = function(count) {
  var cursor = this.saveCursor();

  this.setAbsoluteCursorRow(this.getVTScrollTop());
  this.deleteLines(count);

  this.restoreCursor(cursor);
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
  var cursor = this.saveCursor();

  this.setAbsoluteCursorPosition(this.getVTScrollTop(), 0);
  this.insertLines(opt_count);

  this.restoreCursor(cursor);
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
    this.setRelativeCursorPosition(row, column);
  } else {
    this.setAbsoluteCursorPosition(row, column);
  }
};

hterm.Terminal.prototype.setRelativeCursorPosition = function(row, column) {
  var scrollTop = this.getVTScrollTop();
  row = hterm.clamp(row + scrollTop, scrollTop, this.getVTScrollBottom());
  column = hterm.clamp(column, 0, this.screenSize.width - 1);
  this.screen_.setCursorPosition(row, column);
};

hterm.Terminal.prototype.setAbsoluteCursorPosition = function(row, column) {
  row = hterm.clamp(row, 0, this.screenSize.height - 1);
  column = hterm.clamp(column, 0, this.screenSize.width - 1);
  this.screen_.setCursorPosition(row, column);
};

/**
 * Set the cursor column.
 *
 * @param {integer} column The new zero-based cursor column.
 */
hterm.Terminal.prototype.setCursorColumn = function(column) {
  this.setAbsoluteCursorPosition(this.screen_.cursorPosition.row, column);
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
hterm.Terminal.prototype.setAbsoluteCursorRow = function(row) {
  this.setAbsoluteCursorPosition(row, this.screen_.cursorPosition.column);
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
  if (this.timeouts_.redraw)
    return;

  var self = this;
  this.timeouts_.redraw = setTimeout(function() {
      delete self.timeouts_.redraw;
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
    return;

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
  return this.cursorDown(-(count || 1));
};

/**
 * Move the cursor down a specified number of rows.
 *
 * @param {integer} count The number of rows to move the cursor.
 */
hterm.Terminal.prototype.cursorDown = function(count) {
  count = count || 1;
  var minHeight = (this.options_.originMode ? this.getVTScrollTop() : 0);
  var maxHeight = (this.options_.originMode ? this.getVTScrollBottom() :
                   this.screenSize.height - 1);

  var row = hterm.clamp(this.screen_.cursorPosition.row + count,
                        minHeight, maxHeight);
  this.setAbsoluteCursorRow(row);
};

/**
 * Move the cursor left a specified number of columns.
 *
 * @param {integer} count The number of columns to move the cursor.
 */
hterm.Terminal.prototype.cursorLeft = function(count) {
  return this.cursorRight(-(count || 1));
};

/**
 * Move the cursor right a specified number of columns.
 *
 * @param {integer} count The number of columns to move the cursor.
 */
hterm.Terminal.prototype.cursorRight = function(count) {
  count = count || 1;
  var column = hterm.clamp(this.screen_.cursorPosition.column + count,
                           0, this.screenSize.width - 1);
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
  this.options_.reverseVideo = state;
  if (state) {
    this.scrollPort_.setForegroundColor(this.backgroundColor);
    this.scrollPort_.setBackgroundColor(this.foregroundColor);
  } else {
    this.scrollPort_.setForegroundColor(this.foregroundColor);
    this.scrollPort_.setBackgroundColor(this.backgroundColor);
  }
};

/**
 * Ring the terminal bell.
 *
 * We only have a visual bell, which quickly toggles inverse video in the
 * terminal.
 */
hterm.Terminal.prototype.ringBell = function() {
  this.bellAudio_.play();

  this.cursorNode_.style.backgroundColor =
      this.scrollPort_.getForegroundColor();

  var self = this;
  setTimeout(function() {
      self.cursorNode_.style.backgroundColor = self.cursorColor;
    }, 200);
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
  this.setCursorPosition(0, 0);
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
 * Set the auto carriage return bit.
 *
 * If auto carriage return is on then a formfeed character is interpreted
 * as a newline, otherwise it's the same as a linefeed.  The difference boils
 * down to whether or not the cursor column is reset.
 */
hterm.Terminal.prototype.setAutoCarriageReturn = function(state) {
  this.options_.autoCarriageReturn = state;
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
  var cursor = this.saveCursor();
  this.screen_ = state ? this.alternateScreen_ : this.primaryScreen_;

  if (this.screen_.rowsArray.length &&
      this.screen_.rowsArray[0].rowIndex != this.scrollbackRows_.length) {
    // If the screen changed sizes while we were away, our rowIndexes may
    // be incorrect.
    var offset = this.scrollbackRows_.length;
    var ary = this.screen_.rowsArray;
    for (i = 0; i < ary.length; i++) {
      ary[i].rowIndex = offset + i;
    }
  }

  this.realizeWidth_(this.screenSize.width);
  this.realizeHeight_(this.screenSize.height);
  this.scrollPort_.syncScrollHeight();
  this.scrollPort_.invalidate();

  this.restoreCursor(cursor);
  this.scrollPort_.resize();
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
    this.cursorNode_.style.opacity = '0';
    return;
  }

  this.syncCursorPosition_();

  this.cursorNode_.style.opacity = '1';

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
 * Synchronizes the visible cursor and document selection with the current
 * cursor coordinates.
 */
hterm.Terminal.prototype.syncCursorPosition_ = function() {
  var topRowIndex = this.scrollPort_.getTopRowIndex();
  var bottomRowIndex = this.scrollPort_.getBottomRowIndex(topRowIndex);
  var cursorRowIndex = this.scrollbackRows_.length +
      this.screen_.cursorPosition.row;

  if (cursorRowIndex > bottomRowIndex) {
    // Cursor is scrolled off screen, move it outside of the visible area.
    this.cursorNode_.style.top = -this.scrollPort_.characterSize.height + 'px';
    return;
  }

  this.cursorNode_.style.width = this.scrollPort_.characterSize.width + 'px';
  this.cursorNode_.style.height = this.scrollPort_.characterSize.height + 'px';

  this.cursorNode_.style.top = this.scrollPort_.visibleRowTopMargin +
      this.scrollPort_.characterSize.height * (cursorRowIndex - topRowIndex) +
      'px';
  this.cursorNode_.style.left = this.scrollPort_.characterSize.width *
      this.screen_.cursorPosition.column + 'px';

  this.cursorNode_.setAttribute('title',
                                '(' + this.screen_.cursorPosition.row +
                                ', ' + this.screen_.cursorPosition.column +
                                ')');

  // Update the caret for a11y purposes.
  var selection = this.document_.getSelection();
  if (selection && selection.isCollapsed)
    this.screen_.syncSelectionCaret(selection);
};

/**
 * Synchronizes the visible cursor with the current cursor coordinates.
 *
 * The sync will happen asynchronously, soon after the call stack winds down.
 * Multiple calls will be coalesced into a single sync.
 */
hterm.Terminal.prototype.scheduleSyncCursorPosition_ = function() {
  if (this.timeouts_.syncCursor)
    return;

  var self = this;
  this.timeouts_.syncCursor = setTimeout(function() {
      self.syncCursorPosition_();
      delete self.timeouts_.syncCursor;
    }, 0);
};

/**
 * Show the terminal overlay for a given amount of time.
 *
 * The terminal overlay appears in inverse video in a large font, centered
 * over the terminal.  You should probably keep the overlay message brief,
 * since it's in a large font and you probably aren't going to check the size
 * of the terminal first.
 *
 * @param {string} msg The text (not HTML) message to display in the overlay.
 * @param {number} opt_timeout The amount of time to wait before fading out
 *     the overlay.  Defaults to 1.5 seconds.  Pass null to have the overlay
 *     stay up forever (or until the next overlay).
 */
hterm.Terminal.prototype.showOverlay = function(msg, opt_timeout) {
  if (!this.overlayNode_) {
    if (!this.div_)
      return;

    this.overlayNode_ = this.document_.createElement('div');
    this.overlayNode_.style.cssText = (
        'background-color: ' + this.foregroundColor + ';' +
        'border-radius: 15px;' +
        'color: ' + this.backgroundColor + ';' +
        'font-family: ' + this.defaultFontFamily + ';' +
        'font-size: xx-large;' +
        'opacity: 0.75;' +
        'padding: 0.2em 0.5em 0.2em 0.5em;' +
        'position: absolute;' +
        '-webkit-user-select: none;' +
        '-webkit-transition: opacity 180ms ease-in;');
  }

  this.overlayNode_.textContent = msg;
  this.overlayNode_.style.opacity = '0.75';

  if (!this.overlayNode_.parentNode)
    this.div_.appendChild(this.overlayNode_);

  this.overlayNode_.style.top = (
      this.div_.clientHeight - this.overlayNode_.clientHeight) / 2;
  this.overlayNode_.style.left = (
      this.div_.clientWidth - this.overlayNode_.clientWidth -
      this.scrollbarWidthPx) / 2;

  var self = this;

  if (this.overlayTimeout_)
    clearTimeout(this.overlayTimeout_);

  if (opt_timeout === null)
    return;

  this.overlayTimeout_ = setTimeout(function() {
      self.overlayNode_.style.opacity = '0';
      setTimeout(function() {
          self.overlayNode_.parentNode.removeChild(self.overlayNode_);
          self.overlayTimeout_ = null;
          self.overlayNode_.style.opacity = '0.75';
        }, 200);
    }, opt_timeout || 1500);
};

hterm.Terminal.prototype.overlaySize = function() {
  this.showOverlay(this.screenSize.width + 'x' + this.screenSize.height);
};

/**
 * Invoked by hterm.Terminal.Keyboard when a VT keystroke is detected.
 *
 * @param {string} string The VT string representing the keystroke.
 */
hterm.Terminal.prototype.onVTKeystroke = function(string) {
  if (this.scrollOnKeystroke)
    this.scrollPort_.scrollRowToBottom(this.getRowCount());

  this.io.onVTKeystroke(string);
};

/**
 * React when the ScrollPort is scrolled.
 */
hterm.Terminal.prototype.onScroll_ = function() {
  this.scheduleSyncCursorPosition_();
};

/**
 * React when text is pasted into the scrollPort.
 */
hterm.Terminal.prototype.onPaste_ = function(e) {
  this.io.onVTKeystroke(e.text);
};

/**
 * React when the ScrollPort is resized.
 *
 * Note: This function should not directly contain code that alters the internal
 * state of the terminal.  That kind of code belongs in realizeWidth or
 * realizeHeight, so that it can be executed synchronously in the case of a
 * programmatic width change.
 */
hterm.Terminal.prototype.onResize_ = function() {
  var columnCount = Math.floor(this.scrollPort_.getScreenWidth() /
                               this.scrollPort_.characterSize.width);
  var rowCount = Math.floor(this.scrollPort_.getScreenHeight() /
                            this.scrollPort_.characterSize.height);

  if (!(columnCount || rowCount)) {
    // We avoid these situations since they happen sometimes when the terminal
    // gets removed from the document, and we can't deal with that.
    return;
  }

  this.realizeSize_(columnCount, rowCount);
  this.scheduleSyncCursorPosition_();
  this.overlaySize();
};

/**
 * Service the cursor blink timeout.
 */
hterm.Terminal.prototype.onCursorBlink_ = function() {
  if (this.cursorNode_.style.opacity == '0') {
    this.cursorNode_.style.opacity = '1';
  } else {
    this.cursorNode_.style.opacity = '0';
  }
};
