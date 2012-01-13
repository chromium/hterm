// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.




/*******************************************************************************
 * NOTE(rginda, 01/13/2012): This file is no longer in use.  It has been
 * replaced by vt.js.
 *
 * It will be kept around for a little while longer for reference, but
 * should be removed once vt.js has stabilized.
 ******************************************************************************/




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
  this.terminal = terminal;

  this.keyboard = new hterm.VT100.Keyboard(this);

  // Sequence being processed -- that seen so far
  this.pendingSequence_ = [];

  // Response to be sent back to the guest
  this.pendingResponse_ = '';

  // If true, invoke the JS debugger after a given number of escape sequences.
  this.dubstepEnabled_ = false;

  // Stop after this many escapes.
  this.dubstepStopAfter_ = 0;

  // Most recent dubstep size, for easy repeatibility.
  this.dubstepDefaultCount_ = 1;

  // Total number of escapes seen while in dubstep mode.  Useful for measuring
  // the number of escapes required to reach an interesting state.
  this.dubstepTotalCount_ = 0;

  // Whether or not to respect the escape codes for setting terminal width.
  // A production terminal probably shouldn't allow this, but it's necessary
  // to make it through the vttest suite.
  this.setWidthEnabled_ = true;

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
 * Invoked the JavaScript debugger after a given number of escape sequences
 * are encountered.
 *
 * Before the debugger is invoked the step count is reset to the previous
 * value.  This makes it easy to sneak up on an interesting terminal state
 * by stepping through input N escapes at a time without having to reset
 * the step count after each breakpoint.
 *
 * This method is intended to be invoked from the JS console while tracking
 * down some obscure emulator bug.  You shouldn't ever need to call it from
 * production code.
 *
 * @param {integer} count The number of escape sequences to process before
 *     stopping.  Pass 0 to disable "dbustep" mode.
 */
hterm.VT100.prototype.setDubstep = function(count) {
  if (!count) {
    this.dubstepEnabled_ = false;
    this.dubstepTotalCount_ = 0;
    return 'Dubstep disabled.';
  }

  this.dubstepEnabled_ = true;
  this.dubstepStopAfter_ = count;
  this.dubstepDefaultCount_ = count;

  // This method is typically invoked from the console, which will display
  // this return value by default.
  return 'Stopping in: ' + count + ' steps.';
};

/**
 * Checks the dubstep state, invoking the JS debugger if appropriate.
 */
hterm.VT100.prototype.checkDubstep_ = function() {
  this.dubstepTotalCount_++;

  if (--this.dubstepStopAfter_ > 0)
    return;

  // Disable cursor blink so we know the cursor is visible when the
  // debugger stops.  This will also sync the cursor position.
  this.terminal.setCursorBlink(false);

  console.log('Total steps so far: ' + this.dubstepTotalCount_);
  console.log(this.setDubstep(this.dubstepDefaultCount_));
  debugger;
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

    var nextEscape = str.substr(i).search(/[\x01-\x1F]|$/);

    if (nextEscape == -1)
      nextEscape = str.length;

    if (nextEscape != 0) {
      var plainText = str.substr(i, nextEscape);
      if (this.dubstepEnabled_)
        console.log('print: ' + JSON.stringify(plainText));
      this.terminal.print(plainText);
      i += nextEscape;
    }

    if (i == str.length)
      break;

    this.interpretCharacter(str.substr(i, 1));
    i++;
  }
};

/**
 * Interpret a single character from the terminal input.
 */
hterm.VT100.prototype.interpretCharacter = function(character) {
  if (character == '\x1b') {
    this.pendingSequence_.length = 1;
    this.pendingSequence_[0] = character;
    return;
  }

  if (this.pendingSequence_.length &&
      (character >= '\x20' || character == '\x07')) {
    this.interpretEscape(character);
    return;
  }

  this.interpretNonPrintable(character);
};

/**
 * Interpret a non-printable character from the terminal input.
 */
hterm.VT100.prototype.interpretNonPrintable = function(character) {
  if (this.dubstepEnabled_)
    console.log('nonprintable: ' + JSON.stringify(character));

  switch (character) {
    case '\n':
      this.terminal.newLine();
      break;

    case '\t':
      // TODO(rginda): I don't think this is the correct behavior.
      this.terminal.cursorRight(4);
      break;

    case '\x07':
      this.terminal.ringBell();
      break;

    case '\x08':  // Backspace, aka '\b'.
      this.terminal.cursorLeft(1);
      break;

    case '\x0a':
      this.terminal.newLine();
      break;

    case '\x0b':
    case '\x0c':
      this.terminal.formFeed();
      break;

    case '\x0d':
      this.terminal.setCursorColumn(0);
      break;

    case '\u0000':
      break;

    default:
      console.error('unhandled unprintable: ' + JSON.stringify(character));
  }
};

/**
 * Interpret a single character in an escape sequence.
 *
 * This function is called for each character that appears to be part of an
 * escape sequence.  It accumulates characters until a recognized control
 * sequence is read.
 *
 * @param {string} character Character to interpret.
 */
hterm.VT100.prototype.interpretEscape = function(character) {
  var interpret = false;

  this.pendingSequence_.push(character);
  var sequence = this.pendingSequence_;

  var processed = true;
  switch (sequence[1]) {
    case '[':
      processed = this.interpretControlSequenceInducer_(sequence.slice(2));
      break;

    case ']':
      processed = this.interpretOperatingSystemCommand_(sequence.slice(2));
      break;

    case '=':  // Application keypad
      this.applicationKeypad = true;
      break;

    case '>':  // Normal keypad
      this.applicationKeypad = false;
      break;

    case '7':  // Save terminal options.
      this.terminal.saveOptions();
      break;

    case '8':  // Restore terminal options.
      this.terminal.restoreOptions();
      break;

    case 'D':  // Index, like newline, only keep the X position
      this.terminal.lineFeed();
      break;

    case 'E':  // Next line.  Like newline, but doesn't add lines.
      this.terminal.setCursorColumn(0);
      this.terminal.cursorDown(1);
      break;

    case 'M':  // Reverse index.
      // This is like newline, but in reverse.  When we hit the top of the
      // terminal, lines are added at the top while swapping out the bottom
      // lines.
      this.terminal.reverseLineFeed();
      break;

    case 'c':  // Full reset
      this.terminal.reset();
      break;

    case '#':  // DEC commands
      if (sequence.length < 3) {
        processed = false;
        break;
      }
      switch (sequence[2]) {
        case '8':  // DEC screen alignment test
          this.terminal.fill('E');
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
          this.terminal.setSpecialCharsEnabled(true);
          break;
        default:
          this.terminal.setSpecialCharsEnabled(false);
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
      this.terminal.setTabStopAtCursor(true);
      break;

    default:
      console.log('Unsupported escape sequence: ' + sequence[1]);
      break;
  }

  if (processed) {
    if (this.dubstepEnabled_) {
      console.warn('Escape: ' + sequence.slice(1).join(' '));
      this.checkDubstep_();
    }

    this.pendingSequence_.length = 0;
  }

  return;
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
  var response = '';

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

  if (!processed)
    return false;

  // Interpret the command
  switch (seqCommand) {
    case 'A':  // Cursor up
      this.terminal.cursorUp(args[0] || 1);
      break;

    case 'B':  // Cursor down
      this.terminal.cursorDown(args[0] || 1);
      break;

    case 'C':  // Cursor right
      this.terminal.cursorRight(args[0] || 1);
      break;

    case 'D':  // Cursor left
      this.terminal.cursorLeft(args[0] || 1);
      break;

    case 'E':  // Next line
      // This is like Cursor Down, except the cursor moves to the beginning of
      // the line as well.
      this.terminal.cursorDown(args[0] || 1);
      this.terminal.setCursorColumn(0);
      break;

    case 'F':  // Previous line
      // This is like Cursor Up, except the cursor moves to the beginning of the
      // line as well.
      this.terminal.cursorUp(args[0] || 1);
      this.terminal.setCursorColumn(0);
      break;

    case 'G':  // Cursor absolute column
      var position = args[0] ? args[0] - 1 : 0;
      this.terminal.setCursorColumn(position);
      break;

    case 'H':  // Cursor absolute row;col
    case 'f':  // Horizontal & Vertical Position
      var row = args[0] ? args[0] - 1 : 0;
      var col = args[1] ? args[1] - 1 : 0;
      this.terminal.setCursorPosition(row, col);
      break;

    case 'K':  // Erase in Line
      switch (args[0]) {
        case 1:  // Erase to left
          this.terminal.eraseToLeft();
          break;
        case 2:  // Erase the line
          this.terminal.eraseLine();
          break;
        case 0:  // Erase to right
        default:
          // Erase to right
          this.terminal.eraseToRight();
          break;
      }
      break;

    case 'J':  // Erase in display
      switch (args[0]) {
        case 1:  // Erase above
          this.terminal.eraseAbove();
          break;
        case 2:  // Erase all
          this.terminal.clear();
          break;
        case 0:  // Erase below
        default:
          this.terminal.eraseBelow();
          break;
      }
      break;

    case 'X':  // Erase character
      this.terminal.eraseToRight(args[0] || 1);
      break;

    case 'L':  // Insert lines
      this.terminal.insertLines(args[0] || 1);
      break;

    case 'M':  // Delete lines
      this.terminal.deleteLines(args[0] || 1);
      break;

    case '@':  // Insert characters
      var amount = 1;
      if (args[0]) {
        amount = args[0];
      }
      this.terminal.insertSpace(amount);
      break;

    case 'P':  // Delete characters
      // This command shifts the line contents left, starting at the cursor
      // position.
      this.terminal.deleteChars(args[0] || 1);
      break;

    case 'S':  // Scroll up an amount
      this.terminal.vtScrollUp(args[0] || 1);
      break;

    case 'T':  // Scroll down an amount
      this.terminal.vtScrollDown(args[0] || 1);
      break;

    case 'c':  // Send device attributes
      if (!args[0]) {
        response += '\x1b[?1;2c';
      }
      break;

    case 'd':  // Line position absolute
      this.terminal.setAbsoluteCursorRow((args[0] - 1) || 0);
      break;

    case 'g':  // Clear tab stops
      switch (args[0] || 0) {
        case 0:
          this.terminal.setTabStopAtCursor(false);
          break;
        case 3:  // Clear all tab stops in the page
          this.terminal.clearTabStops();
          break;
        default:
          break;
      }
      break;

    case 'm':  // Color change
      if (args.length == 0) {
        this.terminal.clearColorAndAttributes();
      } else {
        if (args.length == 3 &&
            (args[0] == 38 || args[0] == 48) && args[1] == 5) {
          // This is code for the 256-color palette, skip the normal processing.
          if (args[0] == 38) {
            // Set the foreground color to the 3rd argument.
            this.terminal.setForegroundColor256(args[2]);
          } else if (args[0] == 48) {
            // Set the background color to the 3rd argument.
            this.terminal.setBackgroundColor256(args[2]);
          }
        } else {
          var numArgs = args.length;
          for (var argNum = 0; argNum < numArgs; ++argNum) {
            var arg = args[argNum];
            if (isNaN(arg)) {
              // This is the same as an attribute of zero.
              this.terminal.setAttributes(0);
            } else if (arg < 30) {
              // This is an attribute argument.
              this.terminal.setAttributes(arg);
            } else if (arg < 40) {
              // This is a foreground color argument.
              this.terminal.setForegroundColor(arg);
            } else if (arg < 50) {
              // This is a background color argument.
              this.terminal.setBackgroundColor(arg);
            }
          }
        }
      }
      break;

    case 'n':  // Device status report
      switch (args[0]) {
        case 5:
          if (!query) {
            response += '\x1b0n';
          }
          break;

        case 6:
          var curX = this.terminal.getCursorColumn() + 1;
          var curY = this.terminal.getCursorRow() + 1;
          response += '\x1b[' + curY + ';' + curX + 'R';
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
            if (!this.setWidthEnabled_)
              break;

            if (set) {
              this.terminal.setWidth(132);
            } else {
              this.terminal.setWidth(80);
            }

            this.terminal.clear();
            this.terminal.setVTScrollRegion(null, null);
            this.terminal.setAbsoluteCursorPosition(0, 0);
            break;

          case 4:  // Fast (l) or slow (h) scroll
            // This is meaningless to us.
            break;

          case 5:  // Normal (l) or reverse (h) video mode
            this.terminal.setReverseVideo(set);
            break;

          case 6:  // Normal (l) or origin (h) cursor mode
            this.terminal.setOriginMode(set);
            break;

          case 7:  // No (l) wraparound mode or wraparound (h) mode
            this.terminal.setWraparound(set);
            break;

          case 12:  // Stop (l) or start (h) blinking cursor
            this.terminal.setCursorBlink(set);
            break;

          case 25:  // Hide (l) or show (h) cursor
            this.terminal.setCursorVisible(set);
            break;

          case 45:  // Disable (l) or enable (h) reverse wraparound
            this.terminal.setReverseWraparound(set);
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
            this.terminal.setAlternateMode(set);
            break;

          default:
            console.log('Unimplemented l/h command: ' +
                        (query ? '?' : '') + args[0]);
            break;
        }

      } else {
        switch (args[0]) {
          case 4:  // Replace (l) or insert (h) mode
            this.terminal.setInsertMode(set);
            break;
          case 20:
            // If true, vertical tab and form feeds also cause a
            // carriage return.
            this.terminal.setAutoCarriageReturn(set);
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
        var scrollTop = args[0] || 1;
        var scrollBottom = args[1] || this.terminal.screenSize.height;
        this.terminal.setVTScrollRegion(scrollTop - 1, scrollBottom - 1);
      }
      break;

    default:
      console.log('Unknown control: ' + seqCommand);
      break;
  }

  if (response)
    this.terminal.io.sendString(response);

  return true;
};
