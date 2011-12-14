// Copyright (c) 2011 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview This file implements the VT100 interpreter, which
 * operates in conjunction with a hterm.Terminal to provide
 * interpretation of VT100-style control sequences.
 *
 * Original code by Cory Maccarrone.
 */

/**
 * Constructor for the VT100 Interpreter.
 *
 * The interpreter operates on a terminal object capable of performing cursor
 * move operations, painting characters, etc.
 *
 * @param {hterm.Terminal} terminal Terminal to use with
 *     the interpreter.  Direct commands are sent to it in the presence of
 *     control characters -- otherwise, normal characters are passed straight
 *     through to its render functions.
 * @constructor
 */
hterm.VT100 = function(terminal) {
  this.terminal_ = terminal;

  // Sequence being processed -- that seen so far
  this.pendingSequence_ = [];

  // Response to be sent back to the guest
  this.pendingResponse_ = '';

  /**
   * Enable/disable application keypad.
   *
   * This changes the way numeric keys are sent from the keyboard.
   */
  this.applicationKeypad = false;

  /**
   * Enable/disable the application cursor mode.
   *
   * This changes the way cursor keys are sent from the keyboard.
   */
  this.applicationCursor = false;

  /**
   * Whether backspace should send ^H or not.
   */
  this.backspaceSendsBackspace = false;

  /**
   * Set whether the alt key sends a leading escape or not.
   */
  this.altSendsEscape = true;

  /**
   * Set whether the meta key sends a leading escape or not.
   */
  this.metaSendsEscape = true;
};

/**
 * Interpret a sequence of characters.
 *
 * Incomplete escape sequences are buffered until the next call.
 *
 * @param {string} str Sequence of characters to interpret or pass through.
 */
hterm.VT100.prototype.interpretString = function(str) {
  var i = 0;

  while (i < str.length) {
    while (this.pendingSequence_.length && i < str.length) {
      this.interpretCharacter(str.substr(i, 1));
      i++;
    }

    if (i == str.length)
      break;

    var nextEscape = str.substr(i).search(/[\x1b\n\t]|$/);

    if (nextEscape == -1)
      nextEscape = str.length;

    if (nextEscape != 0) {
      var plainText = str.substr(i, nextEscape);
      this.terminal_.print(plainText);
      i += nextEscape;
    }

    if (i == str.length)
      break;

    this.interpretCharacter(str.substr(i, 1));
    i++;
  }
};

/**
 * Interpret a single character in a sequence.
 *
 * This function is called for each character in terminal input, and
 * accumulates characters until a recognized control sequence is read.  If the
 * character is not part of a control sequence, it is queued up for rendering.
 *
 * @param {string} character Character to interpret or pass through.
 */
hterm.VT100.prototype.interpretCharacter = function(character) {
  var interpret = false;

  if (character == '\n') {
    this.terminal_.newLine();
    return;
  }

  if (character == '\t') {
    // TODO(rginda): I don't think this is the correct behavior.
    this.terminal_.cursorRight(4);
    return;
  }

  if (character == '\x1b') {
    this.pendingSequence_.length = 1;
    this.pendingSequence_[0] = character;
    return;
  }

  if (!this.pendingSequence_.length ||
      (character < '\x20' && character != '\x07')) {
    // We don't have a pending escape, or this character is invalid in the
    // context of an escape sequence.  The VT100 spec says to just print it.
    this.terminal_.print(character);
    return;
  }

  this.pendingSequence_.push(character);
  var sequence = this.pendingSequence_;

  var processed = true;
  switch (sequence[1]) {
    case '[':
      if (!this.interpretControlSequenceInducer_(sequence.slice(2))) {
        processed = false;
      }
      break;

    case ']':
      if (!this.interpretOperatingSystemCommand_(sequence.slice(2))) {
        processed = false;
      }
      break;

    case '=':  // Application keypad
      this.applicationKeypad = true;
      break;

    case '>':  // Normal keypad
      this.applicationKeypad = false;
      break;

    case '7':  // Save cursor
      this.terminal_.saveCursor();
      break;

    case '8':  // Restore cursor
      this.terminal_.restoreCursor();
      break;

    case 'D':  // Index, like newline, only keep the X position
      this.terminal_.lineFeed();
      break;

    case 'E':  // Next line.  Like newline, but doesn't add lines.
      this.terminal_.setCursorColumn(0);
      this.terminal_.cursorDown(1);
      break;

    case 'M':  // Reverse index.
      // This is like newline, but in reverse.  When we hit the top of the
      // terminal, lines are added at the top while swapping out the bottom
      // lines.
      this.terminal_.reverseLineFeed();
      break;

    case 'c':  // Full reset
      this.terminal_.reset();
      break;

    case '#':  // DEC commands
      if (sequence.length < 3) {
        processed = false;
        break;
      }
      switch (sequence[2]) {
        case '8':  // DEC screen alignment test
          this.fill('E');
          break;
        default:
          console.log('Unsupported DEC command: ' + sequence[2]);
          break;
      }
      break;

    case '(':  // Designate G0 character set
      if (sequence.length < 3) {
        processed = false;
        break;
      }
      switch (sequence[2]) {
        case '0':  // Line drawing
          this.terminal_.setSpecialCharsEnabled(true);
          break;
        default:
          this.terminal_.setSpecialCharsEnabled(false);
          break;
      }
      break;

    case ')':  // Designate G1 character set
    case '*':  // Designate G2 character set
    case '+':  // Designate G3 character set
      if (sequence.length < 3) {
        processed = false;
        break;
      }
      console.log('Code ' + sequence[2]);
      break;

    case 'H':  // Set a tab stop at the cursor position
      this.terminal_.setTabStopAtCursor(true);
      break;

    default:
      console.log('Unsupported escape sequence: ' + sequence[1]);
      break;
  }

  if (processed) {
    //console.log('Escape sequence: ' + sequence.slice(1));
    this.pendingSequence_.length = 0;
  }

  return;
};

/**
 * Return any pending response from the interpretation of control sequences.
 *
 * The response should be returned as if the user typed it, and the pending
 * response is cleared from the interpreter.
 *
 * @return {string} response to send.
 */
hterm.VT100.prototype.getAndClearPendingResponse = function() {
  var response = this.pendingResponse_;
  this.pendingResponse_ = '';
  return response;
};

/**
 * Interpret an operating system command (OSC) sequence.
 *
 * @param {Array} sequence Sequence to interpret.
 * @return {boolean} Whether the sequence was interpreted or not.
 * @private
 */
hterm.VT100.prototype.interpretOperatingSystemCommand_ =
    function(sequence) {
  // These commands tend to do things like change the window title and other
  // things.
  var processed = false;
  var length = sequence.length;
  var i = 0;
  var args = [];
  var currentArg = '';
  var leadingZeroFilter = true;

  // Parse the command into a sequence command and series of numeric arguments.
  while (true) {
    if (i >= length) {
      // We ran out of characters interpreting the string
      break;
    }

    if (sequence[i] == ';') {
      // New argument
      args.push(currentArg);
      currentArg = '';
      leadingZeroFilter = true;
    } else if (sequence[i] == '\x7' ||
               (sequence[i] == '\x1b' &&
                sequence[i + 1] == '\\')) {
      // Terminating character.  This'll tell us how to interpret the control
      // sequence.
      if (currentArg != '') {
        args.push(currentArg);
      }
      processed = true;
      break;
    } else {
      // Part of the arg, just add it, filtering out leadining zeros.
      if (!(leadingZeroFilter && sequence[i] == '0')) {
        leadingZeroFilter = false;
        currentArg += sequence[i];
      }
    }
    i++;
  }

  if (!processed)
    return processed;

  // Interpret the command
  if (args[0] == '') {
    // The leading-zero filter dropped our zero, so put it back.
    args[0] = 0;
  }

  switch (parseInt(args[0], 10)) {
    case 0:
    case 2:
      // Change the window title to args[1]
      // TODO(rginda): this.
      break;
    default:
      console.log('Unsupported OSC command: ' + sequence.slice(0, i + 1));
      break;
  }

  return processed;
};

/**
 * Interpret a control sequence inducer (CSI) command.
 *
 * @param {Array} sequence Sequence to interpret.
 * @return {boolean} Whether the sequence was interpreted succesfully or not.
 * @private
 */
hterm.VT100.prototype.interpretControlSequenceInducer_ =
    function(sequence) {
  // These escape codes all end with a letter, and have arguments separated by
  // a semicolon.
  var processed = false;
  var args = [];
  var currentArg = '';
  var terminator = /[A-Za-z@]/;
  var seqCommand = '';
  var query = false;
  var leadingZeroFilter = true;

  // Parse the command into a sequence command and series of numeric arguments.
  for (var i = 0; i < sequence.length; ++i) {
    if (sequence[i] == '?') {
      // Some commands have different meaning with a leading '?'.  We'll call
      // that the 'query' flag.
      query = true;
      leadingZeroFilter = true;
    } else if (sequence[i] == ';') {
      // New argument
      args.push(parseInt(currentArg, 10));
      currentArg = '';
      leadingZeroFilter = true;
    } else if (terminator.test(sequence[i])) {
      // Terminating character.  This'll tell us how to interpret the control
      // sequence.
      seqCommand = sequence[i];
      if (currentArg != '') {
        args.push(parseInt(currentArg, 10));
      }
      processed = true;
      break;
    } else {
      // Part of the arg, just add it, filtering out leading zeros.
      if (!(leadingZeroFilter && sequence[i] == '0')) {
        leadingZeroFilter = false;
        currentArg += sequence[i];
      }
    }
  }

  if (!processed) {
    return processed;
  }

  // Interpret the command
  switch (seqCommand) {
    case 'A':  // Cursor up
      this.terminal_.cursorUp(args[0] || 1);
      break;

    case 'B':  // Cursor down
      this.terminal_.cursorDown(args[0] || 1);
      break;

    case 'C':  // Cursor right
      this.terminal_.cursorRight(args[0] || 1);
      break;

    case 'D':  // Cursor left
      this.terminal_.cursorLeft(args[0] || 1);
      break;

    case 'E':  // Next line
      // This is like Cursor Down, except the cursor moves to the beginning of
      // the line as well.
      this.terminal_.cursorDown(args[0] || 1);
      this.terminal_.setCursorColumn(0);
      break;

    case 'F':  // Previous line
      // This is like Cursor Up, except the cursor moves to the beginning of the
      // line as well.
      this.terminal_.cursorUp(args[0] || 1);
      this.terminal_.setCursorColumn(0);
      break;

    case 'G':  // Cursor absolute column
      var position = args[0] ? args[0] - 1 : 0;
      this.terminal_.setCursorColumn(position);
      break;

    case 'H':  // Cursor absolute row;col
    case 'f':  // Horizontal & Vertical Position
      var row = args[0] ? args[0] - 1 : 0;
      var col = args[1] ? args[1] - 1 : 0;
      this.terminal_.setCursorPosition(row, col);
      break;

    case 'K':  // Erase in Line
      switch (args[0]) {
        case 1:  // Erase to left
          this.terminal_.eraseToLeft();
          break;
        case 2:  // Erase the line
          this.terminal_.eraseLine();
          break;
        case 0:  // Erase to right
        default:
          // Erase to right
          this.terminal_.eraseToRight();
          break;
      }
      break;

    case 'J':  // Erase in display
      switch (args[0]) {
        case 1:  // Erase above
          this.terminal_.eraseToLeft();
          this.terminal_.eraseAbove();
          break;
        case 2:  // Erase all
          this.terminal_.clear();
          break;
        case 0:  // Erase below
        default:
          this.terminal_.eraseToRight();
          this.terminal_.eraseBelow();
          break;
      }
      break;

    case 'X':  // Erase character
      this.terminal_.eraseToRight(args[0] || 1);
      break;

    case 'L':  // Insert lines
      this.terminal_.insertLines(args[0] || 1);
      break;

    case 'M':  // Delete lines
      this.terminal_.deleteLines(args[0] || 1);
      break;

    case '@':  // Insert characters
      var amount = 1;
      if (args[0]) {
        amount = args[0];
      }
      this.terminal_.insertSpace(amount);
      break;

    case 'P':  // Delete characters
      // This command shifts the line contents left, starting at the cursor
      // position.
      this.terminal_.deleteChars(args[0] || 1);
      break;

    case 'S':  // Scroll up an amount
      this.terminal_.vtScrollUp(args[0] || 1);
      break;

    case 'T':  // Scroll down an amount
      this.terminal_.vtScrollDown(args[0] || 1);
      break;

    case 'c':  // Send device attributes
      if (!args[0]) {
        this.pendingResponse_ += '\x1b[?1;2c';
      }
      break;

    case 'd':  // Line position absolute
      this.terminal_.setCursorRow((args[0] - 1) || 0);
      break;

    case 'g':  // Clear tab stops
      switch (args[0] || 0) {
        case 0:
          this.terminal_.setTabStopAtCursor(false);
          break;
        case 3:  // Clear all tab stops in the page
          this.terminal_.clearTabStops();
          break;
        default:
          break;
      }
      break;

    case 'm':  // Color change
      if (args.length == 0) {
        this.terminal_.clearColorAndAttributes();
      } else {
        if (args.length == 3 &&
            (args[0] == 38 || args[0] == 48) && args[1] == 5) {
          // This is code for the 256-color palette, skip the normal processing.
          if (args[0] == 38) {
            // Set the foreground color to the 3rd argument.
            this.terminal_.setForegroundColor256(args[2]);
          } else if (args[0] == 48) {
            // Set the background color to the 3rd argument.
            this.terminal_.setBackgroundColor256(args[2]);
          }
        } else {
          var numArgs = args.length;
          for (var argNum = 0; argNum < numArgs; ++argNum) {
            var arg = args[argNum];
            if (isNaN(arg)) {
              // This is the same as an attribute of zero.
              this.terminal_.setAttributes(0);
            } else if (arg < 30) {
              // This is an attribute argument.
              this.terminal_.setAttributes(arg);
            } else if (arg < 40) {
              // This is a foreground color argument.
              this.terminal_.setForegroundColor(arg);
            } else if (arg < 50) {
              // This is a background color argument.
              this.terminal_.setBackgroundColor(arg);
            }
          }
        }
      }
      break;

    case 'n':  // Device status report
      switch (args[0]) {
        case 5:
          if (!query) {
            var response = '\x1b0n';
            this.pendingResponse_ += response;
          }
          break;

        case 6:
          var curX = this.terminal_.getCursorColumn() + 1;
          var curY = this.terminal_.getCursorRow() + 1;
          var response = '\x1b[' + curY + ';' + curX + 'R';
          this.pendingResponse_ += response;
          break;
      }
      break;

    case 'l':  // Reset mode
    case 'h':  // Set mode
      var set = (seqCommand == 'h' ? true : false);
      if (query) {
        switch (args[0]) {
          case 1:  // Normal (l) or application (h) cursor keys
            this.applicationCursor = set;
            break;
          case 3:  // 80 (if l) or 132 (if h) column mode
            // Our size is always determined by the window size, so we ignore
            // attempts to resize from remote end.
            break;
          case 4:  // Fast (l) or slow (h) scroll
            // This is meaningless to us.
            break;
          case 5:  // Normal (l) or reverse (h) video mode
            this.terminal_.setReverseVideo(set);
            break;
          case 6:  // Normal (l) or origin (h) cursor mode
            this.terminal_.setOriginMode(set);
            break;
          case 7:  // No (l) wraparound mode or wraparound (h) mode
            this.terminal_.setWraparound(set);
            break;
          case 12:  // Stop (l) or start (h) blinking cursor
            this.terminal_.setCursorBlink(set);
            break;
          case 25:  // Hide (l) or show (h) cursor
            this.terminal_.setCursorVisible(set);
            break;
          case 45:  // Disable (l) or enable (h) reverse wraparound
            this.terminal_.setReverseWraparound(set);
            break;
          case 67:  // Backspace is delete (h) or backspace (l)
            this.backspaceSendsBackspace = set;
            break;
          case 1036:  // Meta sends (h) or doesn't send (l) escape
            this.metaSendsEscape = set;
            break;
          case 1039:  // Alt sends (h) or doesn't send (l) escape
            this.altSendsEscape = set;
            break;
          case 1049:  // Switch to/from alternate, save/restore cursor
            this.terminal_.setAlternateMode(set);
            break;
          default:
            console.log('Unimplemented l/h command: ' +
                        (query ? '?' : '') + args[0]);
            break;
        }

      } else {
        switch (args[0]) {
          case 4:  // Replace (l) or insert (h) mode
            this.terminal_.setInsertMode(set);
            break;
          case 20:
            // Normal linefeed (l), \n means move down only
            // Automatic linefeed (h), \n means \n\r
            this.terminal_.setAutoLinefeed(set);
            break;
          default:
            console.log('Unimplemented l/h command: ' +
                        (query ? '?' : '') + args[0]);
            break;
        }
      }
      break;

    case 'r':
      if (query) {
        // Restore DEC private mode values
        // TODO(maccarro): Implement this
      } else {
        // Set scroll region
        var scrollTop = args[0] || null;
        var scrollBottom = args[1] || null;
        this.terminal_.setScrollRegion(scrollTop, scrollBottom);
      }
      break;

    default:
      console.log('Unknown control: ' + seqCommand);
      break;
  }
  return processed;
};
