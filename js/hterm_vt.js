// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('lib.colors', 'lib.f', 'lib.UTF8Decoder',
          'hterm.VT.CharacterMap');

/**
 * Constructor for the VT escape sequence interpreter.
 *
 * The interpreter operates on a terminal object capable of performing cursor
 * move operations, painting characters, etc.
 *
 * This interpreter is intended to be compatible with xterm, though it
 * ignores some of the more esoteric escape sequences.
 *
 * Some sequences are marked "Will not implement", meaning that they aren't
 * considered relevant to hterm and will probably never be implemented.
 *
 * Others are marked "Not currently implemented", meaning that they are lower
 * priority items that may be useful to implement at some point.
 *
 * See also:
 *   [VT100] VT100 User Guide
 *           http://vt100.net/docs/vt100-ug/chapter3.html
 *   [VT510] VT510 Video Terminal Programmer Information
 *           http://vt100.net/docs/vt510-rm/contents
 *   [XTERM] Xterm Control Sequences
 *           http://invisible-island.net/xterm/ctlseqs/ctlseqs.html
 *   [CTRL]  Wikipedia: C0 and C1 Control Codes
 *           http://en.wikipedia.org/wiki/C0_and_C1_control_codes
 *   [CSI]   Wikipedia: ANSI Escape Code
 *           http://en.wikipedia.org/wiki/Control_Sequence_Introducer
 *   man 5 terminfo, man infocmp, infocmp -L xterm-new
 *
 * @param {hterm.Terminal} terminal Terminal to use with the interpreter.
 */
hterm.VT = function(terminal) {
  /**
   * The display terminal object associated with this virtual terminal.
   */
  this.terminal = terminal;

  terminal.onMouse = this.onTerminalMouse_.bind(this);
  this.mouseReport_ = this.MOUSE_REPORT_DISABLED;

  // Parse state left over from the last parse.  You should use the parseState
  // instance passed into your parse routine, rather than reading
  // this.parseState_ directly.
  this.parseState_ = new hterm.VT.ParseState(this.parseUnknown_);

  // Any "leading modifiers" for the escape sequence, such as '?', ' ', or the
  // other modifiers handled in this.parseCSI_.
  this.leadingModifier_ = '';

  // Any "trailing modifiers".  Same character set as a leading modifier,
  // except these are found after the numeric arguments.
  this.trailingModifier_ = '';

  // Whether or not to respect the escape codes for setting terminal width.
  this.allowColumnWidthChanges_ = false;

  // True if we should fake-out mouse "cell motion" reporting (DECSET 1002)
  this.mouseCellMotionTrick_ = false;

  // The amount of time we're willing to wait for the end of an OSC sequence.
  this.oscTimeLimit_ = 20000;

  // Construct a regular expression to match the known one-byte control chars.
  // This is used in parseUnknown_ to quickly scan a string for the next
  // control character.
  var cc1 = Object.keys(hterm.VT.CC1).map(
      function(e) {
        return '\\x' + lib.f.zpad(e.charCodeAt().toString(16), 2)
      }).join('');
  this.cc1Pattern_ = new RegExp('[' + cc1 + ']');

  // Decoder to maintain UTF-8 decode state.
  this.utf8Decoder_ = new lib.UTF8Decoder();

  /**
   * Whether to accept the 8-bit control characters.
   *
   * An 8-bit control character is one with the eighth bit set.  These
   * didn't work on 7-bit terminals so they all have two byte equivalents.
   * Most hosts still only use the two-byte versions.
   *
   * We ignore 8-bit control codes by default.  This is in order to avoid
   * issues with "accidental" usage of codes that need to be terminated.
   * The "accident" usually involves cat'ing binary data.
   */
  this.enable8BitControl = false;

  /**
   * Whether to allow the OSC 52 sequence to write to the system clipboard.
   */
  this.enableClipboardWrite = true;

  /**
   * Max length of an unterminated DCS, OSC, PM or APC sequence before we give
   * up and ignore the code.
   *
   * These all end with a String Terminator (ST, '\x9c', ESC '\\') or
   * (BEL, '\x07') character, hence the "string sequence" moniker.
   */
  this.maxStringSequence = 1024;

  /**
   * If true, emit warnings when we encounter a control character or escape
   * sequence that we don't recognize or explicitly ignore.
   */
  this.warnUnimplemented = true;

  /**
   * The default G0...G3 character maps.
   */
  this.G0 = hterm.VT.CharacterMap.maps['B'];
  this.G1 = hterm.VT.CharacterMap.maps['0'];
  this.G2 = hterm.VT.CharacterMap.maps['B'];
  this.G3 = hterm.VT.CharacterMap.maps['B'];

  /**
   * The 7-bit visible character set.
   *
   * This is a mapping from inbound data to display glyph.  The GL set
   * contains the 94 bytes from 0x21 to 0x7e.
   *
   * The default GL set is 'B', US ASCII.
   */
  this.GL = 'G0';

  /**
   * The 8-bit visible character set.
   *
   * This is a mapping from inbound data to display glyph.  The GR set
   * contains the 94 bytes from 0xa1 to 0xfe.
   */
  this.GR = 'G0';

  // Saved state used in DECSC.
  //
  // This is a place to store a copy VT state, it is *not* the active state.
  this.savedState_ = new hterm.VT.CursorState(this);
};

/**
 * No mouse events.
 */
hterm.VT.prototype.MOUSE_REPORT_DISABLED = 0;

/**
 * DECSET mode 1000.
 *
 * Report mouse down/up events only.
 */
hterm.VT.prototype.MOUSE_REPORT_CLICK = 1;

/**
 * Report only mouse down events.
 *
 * This is an hterm specific mode that tricks vi's ':set mouse=a' mode into
 * working more like emacs xterm-mouse-mode.  Clicks will reposition the
 * cursor, and the scroll wheel will scroll the buffer.  Selection, however,
 * will be browser-native, rather than the custom vi selection you usually get
 * with ':set mouse=a'.
 *
 * When the 'mouse-cell-motion-trick' pref is enabled, we'll use this mode
 * in place of MOUSE_REPORT_DRAG.
 *
 * It is distinct from the normal MOUSE_REPORT_CLICK so that we can switch it
 * off if the user changes their 'mouse-cell-motion-trick' pref while this
 * is enabled.  (If it weren't distinct, we wouldn't be sure how we got into
 * MOUSE_REPORT_CLICK mode.)
 */
hterm.VT.prototype.MOUSE_REPORT_CLICK_1002 = 2;

/**
 * DECSET mode 1002.
 *
 * Report mouse down/up and movement while a button is down.
 */
hterm.VT.prototype.MOUSE_REPORT_DRAG = 3;

/**
 * ParseState constructor.
 *
 * This object tracks the current state of the parse.  It has fields for the
 * current buffer, position in the buffer, and the parse function.
 *
 * @param {function} defaultFunc The default parser function.
 * @param {string} opt_buf Optional string to use as the current buffer.
 */
hterm.VT.ParseState = function(defaultFunction, opt_buf) {
  this.defaultFunction = defaultFunction;
  this.buf = opt_buf || null;
  this.pos = 0;
  this.func = defaultFunction;
  this.args = [];
};

/**
 * Reset the parser function, buffer, and position.
 */
hterm.VT.ParseState.prototype.reset = function(opt_buf) {
  this.resetParseFunction();
  this.resetBuf(opt_buf || '');
  this.resetArguments();
};

/**
 * Reset the parser function only.
 */
hterm.VT.ParseState.prototype.resetParseFunction = function() {
  this.func = this.defaultFunction;
};

/**
 * Reset the buffer and position only.
 *
 * @param {string} buf Optional new value for buf, defaults to null.
 */
hterm.VT.ParseState.prototype.resetBuf = function(opt_buf) {
  this.buf = (typeof opt_buf == 'string') ? opt_buf : null;
  this.pos = 0;
};

/**
 * Reset the arguments list only.
 *
 * @param {string} opt_arg_zero Optional initial value for args[0].
 */
hterm.VT.ParseState.prototype.resetArguments = function(opt_arg_zero) {
  this.args.length = 0;
  if (typeof opt_arg_zero != 'undefined')
    this.args[0] = opt_arg_zero;
};

/**
 * Get an argument as an integer.
 *
 * @param {number} argnum The argument number to retreive.
 */
hterm.VT.ParseState.prototype.iarg = function(argnum, defaultValue) {
  var str = this.args[argnum];
  if (str) {
    var ret = parseInt(str, 10);
    // An argument of zero is treated as the default value.
    if (ret == 0)
      ret = defaultValue;
    return ret;
  }
  return defaultValue;
};

/**
 * Advance the parse postion.
 *
 * @param {integer} count The number of bytes to advance.
 */
hterm.VT.ParseState.prototype.advance = function(count) {
  this.pos += count;
};

/**
 * Return the remaining portion of the buffer without affecting the parse
 * position.
 *
 * @return {string} The remaining portion of the buffer.
 */
hterm.VT.ParseState.prototype.peekRemainingBuf = function() {
  return this.buf.substr(this.pos);
};

/**
 * Return the next single character in the buffer without affecting the parse
 * position.
 *
 * @return {string} The next character in the buffer.
 */
hterm.VT.ParseState.prototype.peekChar = function() {
  return this.buf.substr(this.pos, 1);
};

/**
 * Return the next single character in the buffer and advance the parse
 * position one byte.
 *
 * @return {string} The next character in the buffer.
 */
hterm.VT.ParseState.prototype.consumeChar = function() {
  return this.buf.substr(this.pos++, 1);
};

/**
 * Return true if the buffer is empty, or the position is past the end.
 */
hterm.VT.ParseState.prototype.isComplete = function() {
  return this.buf == null || this.buf.length <= this.pos;
};

hterm.VT.CursorState = function(vt) {
  this.vt_ = vt;
  this.save();
};

hterm.VT.CursorState.prototype.save = function() {
  this.cursor = this.vt_.terminal.saveCursor();

  this.textAttributes = this.vt_.terminal.getTextAttributes().clone();

  this.GL = this.vt_.GL;
  this.GR = this.vt_.GR;

  this.G0 = this.vt_.G0;
  this.G1 = this.vt_.G1;
  this.G2 = this.vt_.G2;
  this.G3 = this.vt_.G3;
};

hterm.VT.CursorState.prototype.restore = function() {
  this.vt_.terminal.restoreCursor(this.cursor);

  this.vt_.terminal.setTextAttributes(this.textAttributes.clone());

  this.vt_.GL = this.GL;
  this.vt_.GR = this.GR;

  this.vt_.G0 = this.G0;
  this.vt_.G1 = this.G1;
  this.vt_.G2 = this.G2;
  this.vt_.G3 = this.G3;
};

hterm.VT.prototype.reset = function() {
  this.G0 = hterm.VT.CharacterMap.maps['B'];
  this.G1 = hterm.VT.CharacterMap.maps['0'];
  this.G2 = hterm.VT.CharacterMap.maps['B'];
  this.G3 = hterm.VT.CharacterMap.maps['B'];

  this.GL = 'G0';
  this.GR = 'G0';

  this.savedState_ = new hterm.VT.CursorState(this);

  this.mouseReport_ = this.MOUSE_REPORT_DISABLED;
  this.terminal.setSelectionEnabled(true);
};

hterm.VT.prototype.setMouseCellMotionTrick = function(state) {
  this.mouseCellMotionTrick_ = state;

  if ((state && this.mouseReport_ == this.MOUSE_REPORT_DRAG) ||
      (!state && this.mouseReport_ == this.MOUSE_REPORT_CLICK_1002)) {
    this.setDECMode('1002', true);
  }
};

/**
 * Handle terminal mouse events.
 *
 * See the "Mouse Tracking" section of [xterm].
 */
hterm.VT.prototype.onTerminalMouse_ = function(e) {
  if (this.mouseReport_ == this.MOUSE_REPORT_DISABLED)
    return;

  // Temporary storage for our response.
  var response;

  // Modifier key state.
  var mod = 0;
  if (e.shiftKey)
    mod |= 4;
  if (e.metaKey || (this.terminal.keyboard.altIsMeta && e.altKey))
    mod |= 8;
  if (e.ctrlKey)
    mod |= 16;

  // TODO(rginda): We should also support mode 1005 and/or 1006 to extend the
  // coordinate space.  Though, after poking around just a little, I wasn't
  // able to get vi or emacs to use either of these modes.
  var x = String.fromCharCode(lib.f.clamp(e.terminalColumn + 32, 32, 255));
  var y = String.fromCharCode(lib.f.clamp(e.terminalRow + 32, 32, 255));

  switch (e.type) {
    case 'click':
    case 'dblclick':
      if (this.mouseReport_ == this.MOUSE_REPORT_CLICK ||
          this.mouseReport_ == this.MOUSE_REPORT_CLICK_1002) {
        // Buttons are encoded as button number plus 32.
        var b = Math.min(e.which - 1, 2) + 32;

        // And mix in the modifier keys.
        b |= mod;

        response = '\x1b[M' + String.fromCharCode(b) + x + y;
        response += '\x1b[M\x23' + x + y;
      }
      break;

    case 'mousewheel':
      // Mouse wheel is treated as button 1 or 2 plus an additional 64.
      b = ((e.wheelDeltaY > 0) ? 0 : 1) + 96;
      b |= mod;
      response = '\x1b[M' + String.fromCharCode(b) + x + y;

      // Keep the terminal from scrolling.
      e.preventDefault();
      break;

    case 'mousedown':
      if (this.mouseReport_ == this.MOUSE_REPORT_DRAG && e.which) {
        // Buttons are encoded as button number plus 32.
        var b = Math.min(e.which - 1, 2) + 32;

        // And mix in the modifier keys.
        b |= mod;

        response = '\x1b[M' + String.fromCharCode(b) + x + y;
      }
      break;

    case 'mouseup':
      if (this.mouseReport_ == this.MOUSE_REPORT_DRAG && e.which) {
        // Mouse up has no indication of which button was released.
        response = '\x1b[M\x23' + x + y;
      }
      break;

    case 'mousemove':
      if (this.mouseReport_ == this.MOUSE_REPORT_DRAG && e.which) {
        // Standard button bits.
        b = 32 + Math.min(e.which - 1, 2);

        // Add 32 to indicate mouse motion.
        b += 32;

        // And mix in the modifier keys.
        b |= mod;

        response = '\x1b[M' + String.fromCharCode(b) + x + y;
      }

      break;

    default:
      console.error('Unknown mouse event: ' + e.type, e);
      break;
  }

  if (response)
    this.terminal.io.sendString(response);
};

/**
 * Interpret a string of characters, displaying the results on the associated
 * terminal object.
 */
hterm.VT.prototype.interpret = function(buf) {
  this.parseState_.resetBuf(this.decodeUTF8(buf));

  while (!this.parseState_.isComplete()) {
    var func = this.parseState_.func;
    var pos = this.parseState_.pos;
    var buf = this.parseState_.buf;

    this.parseState_.func.call(this, this.parseState_);

    if (this.parseState_.func == func && this.parseState_.pos == pos &&
        this.parseState_.buf == buf) {
      throw 'Parser did not alter the state!';
    }
  }
};

/**
 * Encode a UTF-16 string as UTF-8.
 *
 * See also: http://en.wikipedia.org/wiki/UTF-16
 */
hterm.VT.prototype.encodeUTF8 = function(str) {
  return lib.encodeUTF8(str);
};

/**
 * Decode a UTF-8 string into UTF-16.
 */
hterm.VT.prototype.decodeUTF8 = function(str) {
  return this.utf8Decoder_.decode(str);
};

/**
 * The default parse function.
 *
 * This will scan the string for the first 1-byte control character (C0/C1
 * characters from [CTRL]).  Any plain text coming before the code will be
 * printed to the terminal, then the control character will be dispatched.
 */
hterm.VT.prototype.parseUnknown_ = function(parseState) {
  var self = this;

  function print(str) {
    if (self[self.GL].GL)
      str = self[self.GL].GL(str);

    if (self[self.GR].GR)
      str = self[self.GR].GR(str);

    self.terminal.print(str);
  };

  // Search for the next contiguous block of plain text.
  var buf = parseState.peekRemainingBuf();
  var nextControl = buf.search(this.cc1Pattern_);

  if (nextControl == 0) {
    // We've stumbled right into a control character.
    this.dispatch('CC1', buf.substr(0, 1), parseState);
    parseState.advance(1);
    return;
  }

  if (nextControl == -1) {
    // There are no control characters in this string.
    print(buf);
    parseState.reset();
    return;
  }

  print(buf.substr(0, nextControl));
  this.dispatch('CC1', buf.substr(nextControl, 1), parseState);
  parseState.advance(nextControl + 1);
};

/**
 * Parse a Control Sequence Introducer code and dispatch it.
 *
 * See [CSI] for some useful information about these codes.
 */
hterm.VT.prototype.parseCSI_ = function(parseState) {
  var ch = parseState.peekChar();
  var args = parseState.args;

  if (ch >= '@' && ch <= '~') {
    // This is the final character.
    this.dispatch('CSI', this.leadingModifier_ + this.trailingModifier_ + ch,
                  parseState);
    parseState.resetParseFunction();

  } else if (ch == ';') {
    // Parameter delimeter.
    if (this.trailingModifier_) {
      // Parameter delimiter after the trailing modifier.  That's a paddlin'.
      parseState.resetParseFunction();

    } else {
      if (!args.length) {
        // They omitted the first param, we need to supply it.
        args.push('');
      }

      args.push('');
    }

  } else if (ch >= '0' && ch <= '9') {
    // Next byte in the current parameter.

    if (this.trailingModifier_) {
      // Numeric parameter after the trailing modifier.  That's a paddlin'.
      parseState.resetParseFunction();
    } else {
      if (!args.length) {
        args[0] = ch;
      } else {
        args[args.length - 1] += ch;
      }
    }

  } else if (ch >= ' ' && ch <= '?' && ch != ':') {
    // Modifier character.
    if (!args.length) {
      this.leadingModifier_ += ch;
    } else {
      this.trailingModifier_ += ch;
    }

  } else if (this.cc1Pattern_.test(ch)) {
    // Control character.
    this.dispatch('CC1', ch, parseState);

  } else {
    // Unexpected character in sequence, bail out.
    parseState.resetParseFunction();
  }

  parseState.advance(1);
};

/**
 * Skip over the string until the next String Terminator (ST, 'ESC \') or
 * Bell (BEL, '\x07').
 *
 * The string is accumulated in parseState.args[0].  Make sure to reset the
 * arguments (with parseState.resetArguments) before starting the parse.
 *
 * You can detect that parsing in complete by checking that the parse
 * function has changed back to the default parse function.
 *
 * If we encounter more than maxStringSequence characters, we send back
 * the unterminated sequence to be re-parsed with the default parser function.
 *
 * @return {boolean} If true, parsing is ongoing or complete.  If false, we've
 *     exceeded the max string sequence.
 */
hterm.VT.prototype.parseUntilStringTerminator_ = function(parseState) {
  var buf = parseState.peekRemainingBuf();
  var nextTerminator = buf.search(/(\x1b\\|\x07)/);
  var args = parseState.args;

  if (!args.length) {
    args[0] = '';
    args[1] = new Date();
  }

  if (nextTerminator == -1) {
    // No terminator here, have to wait for the next string.

    args[0] += buf;

    var abortReason;

    if (args[0].length > this.maxStringSequence)
      abortReason = 'too long: ' + args[0].length;

    if (args[0].indexOf('\x1b') != -1)
      abortReason = 'embedded escape: ' + args[0].indexOf('\x1b');

    if (new Date() - args[1] > this.oscTimeLimit_)
      abortReason = 'timeout expired: ' + new Date() - args[1];

    if (abortReason) {
      console.log('parseUntilStringTerminator_: aborting: ' + abortReason,
                  args[0]);
      parseState.reset(args[0]);
      return false;
    }

    parseState.advance(buf.length);
    return true;
  }

  if (args[0].length + nextTerminator > this.maxStringSequence) {
    // We found the end of the sequence, but we still think it's too long.
    parseState.reset(args[0] + buf);
    return false;
  }

  args[0] += buf.substr(0, nextTerminator);

  parseState.resetParseFunction();
  parseState.advance(nextTerminator +
                     (buf.substr(nextTerminator, 1) == '\x1b' ? 2 : 1));

  return true;
};

/**
 * Dispatch to the function that handles a given CC1, ESC, or CSI or VT52 code.
 */
hterm.VT.prototype.dispatch = function(type, code, parseState) {
  var handler = hterm.VT[type][code];
  if (!handler) {
    if (this.warnUnimplemented)
      console.warn('Unknown ' + type + ' code: ' + JSON.stringify(code));
    return;
  }

  if (handler == hterm.VT.ignore) {
    if (this.warnUnimplemented)
      console.warn('Ignored ' + type + ' code: ' + JSON.stringify(code));
    return;
  }

  if (type == 'CC1' && code > '\x7f' && !this.enable8BitControl) {
    // It's kind of a hack to put this here, but...
    //
    // If we're dispatching a 'CC1' code, and it's got the eighth bit set,
    // but we're not supposed to handle 8-bit codes?  Just ignore it.
    //
    // This prevents an errant (DCS, '\x90'), (OSC, '\x9d'), (PM, '\x9e') or
    // (APC, '\x9f') from locking up the terminal waiting for its expected
    // (ST, '\x9c') or (BEL, '\x07').
    console.warn('Ignoring 8-bit control code: 0x' +
                 code.charCodeAt(0).toString(16));
    return;
  }

  handler.apply(this, [parseState, code]);
};

/**
 * Set one of the ANSI defined terminal mode bits.
 *
 * Invoked in response to SM/RM.
 *
 * Expected values for code:
 *   2 - Keyboard Action Mode (AM).  Will not implement.
 *   4 - Insert Mode (IRM).
 *   12 - Send/receive (SRM).  Will not implement.
 *   20 - Automatic Newline (LNM).
 *
 * Unexpected and unimplemented values are silently ignored.
 */
hterm.VT.prototype.setANSIMode = function(code, state) {
  if (code == '4') {
    this.terminal.setInsertMode(state);
  } else if (code == '20') {
    this.terminal.setAutoCarriageReturn(state);
  } else if (this.warnUnimplemented) {
    console.warn('Unimplemented ANSI Mode: ' + code);
  }
};

/**
 * Set or reset one of the DEC Private modes.
 *
 * Invoked in response to DECSET/DECRST.
 *
 * Expected values for code:
 *      1 - Application Cursor Keys (DECCKM).
 *      2 - [!] Designate USASCII for character sets G0-G3 (DECANM), and set
 *          VT100 mode.
 *      3 - 132 Column Mode (DECCOLM).
 *      4 - [x] Smooth (Slow) Scroll (DECSCLM).
 *      5 - Reverse Video (DECSCNM).
 *      6 - Origin Mode (DECOM).
 *      7 - Wraparound Mode (DECAWM).
 *      8 - [x] Auto-repeat Keys (DECARM).
 *      9 - [!] Send Mouse X & Y on button press.
 *     10 - [x] Show toolbar (rxvt).
 *     12 - Start Blinking Cursor (att610).
 *     18 - [!] Print form feed (DECPFF).
 *     19 - [x] Set print extent to full screen (DECPEX).
 *     25 - Show Cursor (DECTCEM).
 *     30 - [!] Show scrollbar (rxvt).
 *     35 - [x] Enable font-shifting functions (rxvt).
 *     38 - [x] Enter Tektronix Mode (DECTEK).
 *     40 - Allow 80 - 132 Mode.
 *     41 - [!] more(1) fix (see curses resource).
 *     42 - [!] Enable Nation Replacement Character sets (DECNRCM).
 *     44 - [!] Turn On Margin Bell.
 *     45 - Reverse-wraparound Mode.
 *     46 - [x] Start Logging.
 *     47 - [!] Use Alternate Screen Buffer.
 *     66 - [!] Application keypad (DECNKM).
 *     67 - Backarrow key sends backspace (DECBKM).
 *   1000 - Send Mouse X & Y on button press and release.  (MOUSE_REPORT_CLICK)
 *   1001 - [!] Use Hilite Mouse Tracking.
 *   1002 - Use Cell Motion Mouse Tracking.  (MOUSE_REPORT_DRAG)
 *   1003 - [!] Use All Motion Mouse Tracking.
 *   1004 - [!] Send FocusIn/FocusOut events.
 *   1005 - [!] Enable Extended Mouse Mode.
 *   1010 - Scroll to bottom on tty output (rxvt).
 *   1011 - Scroll to bottom on key press (rxvt).
 *   1034 - [x] Interpret "meta" key, sets eighth bit.
 *   1035 - [x] Enable special modifiers for Alt and NumLock keys.
 *   1036 - Send ESC when Meta modifies a key.
 *   1037 - [!] Send DEL from the editing-keypad Delete key.
 *   1039 - Send ESC when Alt modifies a key.
 *   1040 - [x] Keep selection even if not highlighted.
 *   1041 - [x] Use the CLIPBOARD selection.
 *   1042 - [!] Enable Urgency window manager hint when Control-G is received.
 *   1043 - [!] Enable raising of the window when Control-G is received.
 *   1047 - [!] Use Alternate Screen Buffer.
 *   1048 - Save cursor as in DECSC.
 *   1049 - Save cursor as in DECSC and use Alternate Screen Buffer, clearing
 *          it first. (This may be disabled by the titeInhibit resource). This
 *          combines the effects of the 1047 and 1048 modes. Use this with
 *          terminfo-based applications rather than the 47 mode.
 *   1050 - [!] Set terminfo/termcap function-key mode.
 *   1051 - [x] Set Sun function-key mode.
 *   1052 - [x] Set HP function-key mode.
 *   1053 - [x] Set SCO function-key mode.
 *   1060 - [x] Set legacy keyboard emulation (X11R6).
 *   1061 - [!] Set VT220 keyboard emulation.
 *   2004 - [!] Set bracketed paste mode.
 *
 * [!] - Not currently implemented, may be in the future.
 * [x] - Will not implement.
 */
hterm.VT.prototype.setDECMode = function(code, state) {
  switch (code) {
    case '1':  // DECCKM
      this.terminal.keyboard.applicationCursor = state;
      break;

    case '3':  // DECCOLM
      if (this.allowColumnWidthChanges_) {
        this.terminal.setWidth(state ? 132 : 80);

        this.terminal.clearHome();
        this.terminal.setVTScrollRegion(null, null);
      }
      break;

    case '5':  // DECSCNM
      this.terminal.setReverseVideo(state);
      break;

    case '6':  // DECOM
      this.terminal.setOriginMode(state);
      break;

    case '7':  // DECAWM
      this.terminal.setWraparound(state);
      break;

    case '12':  // att610
      this.terminal.setCursorBlink(state);
      break;

    case '25':  // DECTCEM
      this.terminal.setCursorVisible(state);
      break;

    case '40':  // no-spec
      this.terminal.allowColumnWidthChanges_ = state;
      break;

    case '45':  // no-spec
      this.terminal.setReverseWraparound(state);
      break;

    case '67':  // DECBKM
      this.terminal.keyboard.backspaceSendsBackspace = state;
      break;

    case '1000':  // Report on mouse clicks only.
      this.mouseReport_ = (
          state ? this.MOUSE_REPORT_CLICK : this.MOUSE_REPORT_DISABLED);
      this.terminal.setSelectionEnabled(true);
      break;

    case '1002':  // Report on mouse clicks and drags
      if (!state) {
        this.mouseReport_ = this.MOUSE_REPORT_DISABLED;
        this.terminal.setSelectionEnabled(true);

      } else if (this.mouseCellMotionTrick_) {
        this.mouseReport_ = this.MOUSE_REPORT_CLICK_1002;
        this.terminal.setSelectionEnabled(true);

      } else {
        this.mouseReport_ = this.MOUSE_REPORT_DRAG;
        this.terminal.setSelectionEnabled(false);
      }
      break;

    case '1010':  // rxvt
      this.terminal.scrollOnOutput = state;
      break;

    case '1011':  // rxvt
      this.terminal.scrollOnKeystroke = state;
      break;

    case '1036':  // no-spec
      this.terminal.keyboard.metaSendsEscape = state;
      break;

    case '1039':  // no-spec
      this.terminal.keyboard.altSendsEscape = state;
      break;

    case '47':
    case '1047':  // no-spec
      this.terminal.setAlternateMode(state);
      break;

    case '1048':  // Save cursor as in DECSC.
      this.savedState_.save();

    case '1049':  // 1047 + 1048 + clear.
      if (state) {
        this.savedState_.save();
        this.terminal.setAlternateMode(state);
        this.terminal.clear();
      } else {
        this.terminal.setAlternateMode(state);
        this.savedState_.restore();
      }

      break;

    default:
      if (this.warnUnimplemented)
        console.warn('Unimplemented DEC Private Mode: ' + code);
      break;
  }
};

/**
 * Function shared by control characters and escape sequences that are
 * ignored.
 */
hterm.VT.ignore = function() {};

/**
 * Collection of control characters expressed in a single byte.
 *
 * This includes the characters from the C0 and C1 sets (see [CTRL]) that we
 * care about.  Two byte versions of the C1 codes are defined in the
 * hterm.VT.ESC collection.
 *
 * The 'CC1' mnemonic here refers to the fact that these are one-byte Control
 * Codes.  It's only used in this source file and not defined in any of the
 * referenced documents.
 */
hterm.VT.CC1 = {};

/**
 * Collection of two-byte and three-byte sequences starting with ESC.
 */
hterm.VT.ESC = {};

/**
 * Collection of CSI (Control Sequence Introducer) sequences.
 *
 * These sequences begin with 'ESC [', and may take zero or more arguments.
 */
hterm.VT.CSI = {};

/**
 * Collection of OSC (Operating System Control) sequences.
 *
 * These sequences begin with 'ESC ]', followed by a function number and a
 * string terminated by either ST or BEL.
 */
hterm.VT.OSC = {};

/**
 * Collection of VT52 sequences.
 *
 * When in VT52 mode, other sequences are disabled.
 */
hterm.VT.VT52 = {};

/**
 * Null (NUL).
 *
 * Silently ignored.
 */
hterm.VT.CC1['\x00'] = function () {};

/**
 * Enquiry (ENQ).
 *
 * Transmit answerback message.
 *
 * The default answerback message in xterm is an empty string, so we just
 * ignore this.
 */
hterm.VT.CC1['\x05'] = hterm.VT.ignore;

/**
 * Ring Bell (BEL).
 */
hterm.VT.CC1['\x07'] = function() {
  this.terminal.ringBell();
};

/**
 * Backspace (BS).
 *
 * Move the cursor to the left one character position, unless it is at the
 * left margin, in which case no action occurs.
 */
hterm.VT.CC1['\x08'] = function() {
  this.terminal.cursorLeft(1);
};

/**
 * Horizontal Tab (HT).
 *
 * Move the cursor to the next tab stop, or to the right margin if no further
 * tab stops are present on the line.
 */
hterm.VT.CC1['\x09'] = function() {
  this.terminal.forwardTabStop();
};

/**
 * Line Feed (LF).
 *
 * This code causes a line feed or a new line operation.  See Automatic
 * Newline (LNM).
 */
hterm.VT.CC1['\x0a'] = function() {
  this.terminal.formFeed();
};

/**
 * Vertical Tab (VT).
 *
 * Interpreted as LF.
 */
hterm.VT.CC1['\x0b'] = hterm.VT.CC1['\x0a'];

/**
 * Form Feed (FF).
 *
 * Interpreted as LF.
 */
hterm.VT.CC1['\x0c'] = function() {
  this.terminal.formFeed();
};

/**
 * Carriage Return (CR).
 *
 * Move cursor to the left margin on the current line.
 */
hterm.VT.CC1['\x0d'] = function() {
  this.terminal.setCursorColumn(0);
};

/**
 * Shift Out (SO), aka Lock Shift 0 (LS1).
 *
 * Invoke G1 character set in GL.
 */
hterm.VT.CC1['\x0e'] = function() {
  this.GL = 'G1';
};

/**
 * Shift In (SI), aka Lock Shift 0 (LS0).
 *
 * Invoke G0 character set in GL.
 */
hterm.VT.CC1['\x0f'] = function() {
  this.GL = 'G0';
};

/**
 * Transmit On (XON).
 *
 * Not currently implemented.
 *
 * TODO(rginda): Implement?
 */
hterm.VT.CC1['\x11'] = hterm.VT.ignore;

/**
 * Transmit Off (XOFF).
 *
 * Not currently implemented.
 *
 * TODO(rginda): Implement?
 */
hterm.VT.CC1['\x13'] = hterm.VT.ignore;

/**
 * Cancel (CAN).
 *
 * If sent during a control sequence, the sequence is immediately terminated
 * and not executed.
 *
 * It also causes the error character to be displayed.
 */
hterm.VT.CC1['\x18'] = function(parseState) {
  parseState.resetParseFunction();
  this.terminal.print('?');
};

/**
 * Substitute (SUB).
 *
 * Interpreted as CAN.
 */
hterm.VT.CC1['\x1a'] = hterm.VT.CC1['\x18'];

/**
 * Escape (ESC).
 */
hterm.VT.CC1['\x1b'] = function(parseState) {
  function parseESC(parseState) {
    var ch = parseState.consumeChar();

    if (ch == '\x1b')
      return;

    this.dispatch('ESC', ch, parseState);

    if (parseState.func == parseESC)
      parseState.resetParseFunction();
  };

  parseState.func = parseESC;
};

/**
 * Delete (DEL).
 */
hterm.VT.CC1['\x7f'] = hterm.VT.ignore;

// 8 bit control characters and their two byte equivalents, below...

/**
 * Index (IND).
 *
 * Like newline, only keep the X position
 */
hterm.VT.CC1['\x84'] =
hterm.VT.ESC['D'] = function() {
  this.terminal.lineFeed();
};

/**
 * Next Line (NEL).
 *
 * Like newline, but doesn't add lines.
 */
hterm.VT.CC1['\x85'] =
hterm.VT.ESC['E'] = function() {
  this.terminal.setCursorColumn(0);
  this.terminal.cursorDown(1);
};

/**
 * Horizontal Tabulation Set (HTS).
 */
hterm.VT.CC1['\x88'] =
hterm.VT.ESC['H'] = function() {
  this.terminal.setTabStop(this.terminal.getCursorColumn());
};

/**
 * Reverse Index (RI).
 *
 * Move up one line.
 */
hterm.VT.CC1['\x8d'] =
hterm.VT.ESC['M'] = function() {
  this.terminal.reverseLineFeed();
};

/**
 * Single Shift 2 (SS2).
 *
 * Select of G2 Character Set for the next character only.
 *
 * Not currently implemented.
 */
hterm.VT.CC1['\x8e'] =
hterm.VT.ESC['N'] = hterm.VT.ignore;

/**
 * Single Shift 3 (SS3).
 *
 * Select of G3 Character Set for the next character only.
 *
 * Not currently implemented.
 */
hterm.VT.CC1['\x8f'] =
hterm.VT.ESC['O'] = hterm.VT.ignore;

/**
 * Device Control String (DCS).
 *
 * Indicate a DCS sequence.  See Device-Control functions in [XTERM].
 * Not currently implemented.
 *
 * TODO(rginda): Consider implementing DECRQSS, the rest don't seem applicable.
 */
hterm.VT.CC1['\x90'] =
hterm.VT.ESC['P'] = function(parseState) {
  parseState.resetArguments();
  parseState.func = this.parseUntilStringTerminator_;
};

/**
 * Start of Protected Area (SPA).
 *
 * Will not implement.
 */
hterm.VT.CC1['\x96'] =
hterm.VT.ESC['V'] = hterm.VT.ignore;

/**
 * End of Protected Area (EPA).
 *
 * Will not implement.
 */
hterm.VT.CC1['\x97'] =
hterm.VT.ESC['W'] = hterm.VT.ignore;

/**
 * Start of String (SOS).
 *
 * Will not implement.
 */
hterm.VT.CC1['\x98'] =
hterm.VT.ESC['X'] = hterm.VT.ignore;

/**
 * Single Character Introducer (SCI, also DECID).
 *
 * Return Terminal ID.  Obsolete form of 'ESC [ c' (DA).
 */
hterm.VT.CC1['\x9a'] =
hterm.VT.ESC['Z'] = function() {
  this.terminal.io.sendString('\x1b[?1;2c');
};

/**
 * Control Sequence Introducer (CSI).
 *
 * The lead into most escape sequences.  See [CSI].
 */
hterm.VT.CC1['\x9b'] =
hterm.VT.ESC['['] = function(parseState) {
  parseState.resetArguments();
  this.leadingModifier_ = '';
  this.trailingModifier_ = '';
  parseState.func = this.parseCSI_;
};

/**
 * String Terminator (ST).
 *
 * Used to terminate DCS/OSC/PM/APC commands which may take string arguments.
 *
 * We don't directly handle it here, as it's only used to terminate other
 * sequences.  See the 'parseUntilStringTerminator_' method.
 */
hterm.VT.CC1['\x9c'] =
hterm.VT.ESC['\\'] = hterm.VT.ignore;

/**
 * Operating System Command (OSC).
 *
 * Commands relating to the operating system.
 */
hterm.VT.CC1['\x9d'] =
hterm.VT.ESC[']'] = function(parseState) {
  parseState.resetArguments();

  function parseOSC(parseState) {
    if (!this.parseUntilStringTerminator_(parseState)) {
      // The string sequence was too long.
      return;
    }

    if (parseState.func == parseOSC) {
      // We're not done parsing the string yet.
      return;
    }

    // We're done.
    var ary = parseState.args[0].match(/^(\d+);(.*)$/);
    if (ary) {
      parseState.args[0] = ary[2];
      this.dispatch('OSC', ary[1], parseState);
    } else {
      console.warn('Invalid OSC: ' + JSON.stringify(parseState.args[0]));
    }
  };

  parseState.func = parseOSC;
};

/**
 * Privacy Message (PM).
 *
 * Will not implement.
 */
hterm.VT.CC1['\x9e'] =
hterm.VT.ESC['^'] = function(parseState) {
  parseState.resetArguments();
  parseState.func = this.parseUntilStringTerminator_;
};

/**
 * Application Program Control (APC).
 *
 * Will not implement.
 */
hterm.VT.CC1['\x9f'] =
hterm.VT.ESC['_'] = function(parseState) {
  parseState.resetArguments();
  parseState.func = this.parseUntilStringTerminator_;
};

/**
 * ESC \x20 - Unclear to me where these originated, possibly in xterm.
 *
 * Not currently implemented:
 *   ESC \x20 F - Select 7 bit escape codes in responses (S7C1T).
 *   ESC \x20 G - Select 8 bit escape codes in responses (S8C1T).
 *                NB: We currently assume S7C1T always.
 *
 * Will not implement:
 *   ESC \x20 L - Set ANSI conformance level 1.
 *   ESC \x20 M - Set ANSI conformance level 2.
 *   ESC \x20 N - Set ANSI conformance level 3.
 */
hterm.VT.ESC['\x20'] = function(parseState) {
  parseState.func = function(parseState) {
    var ch = parseState.consumeChar();
    if (this.warnUnimplemented)
      console.warn('Unimplemented sequence: ESC 0x20 ' + ch);
    parseState.resetParseFunction();
  };
};

/**
 * DEC 'ESC #' sequences.
 *
 * Handled:
 *   ESC # 8 - DEC Screen Alignment Test (DECALN).
 *             Fills the terminal with 'E's.  Used liberally by vttest.
 *
 * Ignored:
 *   ESC # 3 - DEC double-height line, top half (DECDHL).
 *   ESC # 4 - DEC double-height line, bottom half (DECDHL).
 *   ESC # 5 - DEC single-width line (DECSWL).
 *   ESC # 6 - DEC double-width line (DECDWL).
 *
 * All other ESC # sequences are echoed to the terminal.
 */
hterm.VT.ESC['#'] = function(parseState) {
  parseState.func = function(parseState) {
    var ch = parseState.consumeChar();
    if (ch == '8') {
      this.terminal.fill('E');
    } else if ("3456".indexOf(ch) == -1) {
      this.terminal.print('\x1b#' + ch);
    }

    parseState.resetParseFunction();
  };
};

/**
 * 'ESC %' sequences, character set control.  Not currently implemented.
 *
 * To be implemented (currently ignored):
 *   ESC % @ - Set ISO 8859-1 character set.
 *   ESC % G - Set UTF-8 character set.
 *
 * All other ESC # sequences are echoed to the terminal.
 *
 * TODO(rginda): Implement.
 */
hterm.VT.ESC['%'] = function(parseState) {
  parseState.func = function(parseState) {
    var ch = parseState.consumeChar();
    if (ch != '@' && ch != 'G' && this.warnUnimplemented)
      console.warn('Unknown ESC % argument: ' + JSON.stringify(ch));
    parseState.resetParseFunction();
  };
};

/**
 * Character Set Selection (SCS).
 *
 *   ESC ( Ps - Set G0 character set (VT100).
 *   ESC ) Ps - Set G1 character set (VT220).
 *   ESC * Ps - Set G2 character set (VT220).
 *   ESC + Ps - Set G3 character set (VT220).
 *   ESC - Ps - Set G1 character set (VT300).
 *   ESC . Ps - Set G2 character set (VT300).
 *   ESC / Ps - Set G3 character set (VT300).
 *
 * Values for Ps are:
 *   0 - DEC Special Character and Line Drawing Set.
 *   A - United Kingdom (UK).
 *   B - United States (USASCII).
 *   4 - Dutch.
 *   C or 5 - Finnish.
 *   R - French.
 *   Q - French Canadian.
 *   K - German.
 *   Y - Italian.
 *   E or 6 - Norwegian/Danish.
 *   Z - Spanish.
 *   H or 7 - Swedish.
 *   = - Swiss.
 *
 * All other sequences are echoed to the terminal.
 *
 * TODO(rginda): Implement.
 */
hterm.VT.ESC['('] =
hterm.VT.ESC[')'] =
hterm.VT.ESC['*'] =
hterm.VT.ESC['+'] =
hterm.VT.ESC['-'] =
hterm.VT.ESC['.'] =
hterm.VT.ESC['/'] = function(parseState, code) {
  parseState.func = function(parseState) {
    var ch = parseState.consumeChar();
    if (ch == '\x1b') {
      parseState.resetParseFunction();
      parseState.func();
      return;
    }

    if (ch in hterm.VT.CharacterMap.maps) {
      if (code == '(') {
        this.G0 = hterm.VT.CharacterMap.maps[ch];
      } else if (code == ')' || code == '-') {
        this.G1 = hterm.VT.CharacterMap.maps[ch];
      } else if (code == '*' || code == '.') {
        this.G2 = hterm.VT.CharacterMap.maps[ch];
      } else if (code == '+' || code == '/') {
        this.G3 = hterm.VT.CharacterMap.maps[ch];
      }
    } else if (this.warnUnimplemented) {
      console.log('Invalid character set for "' + code + '": ' + ch);
    }

    parseState.resetParseFunction();
  };
};

/**
 * Back Index (DECBI).
 *
 * VT420 and up.  Not currently implemented.
 */
hterm.VT.ESC['6'] = hterm.VT.ignore;

/**
 * Save Cursor (DECSC).
 */
hterm.VT.ESC['7'] = function() {
  this.savedState_.save();
};

/**
 * Restore Cursor (DECSC).
 */
hterm.VT.ESC['8'] = function() {
  this.savedState_.restore();
};

/**
 * Forward Index (DECFI).
 *
 * VT210 and up.  Not currently implemented.
 */
hterm.VT.ESC['9'] = hterm.VT.ignore;

/**
 * Application keypad (DECPAM).
 */
hterm.VT.ESC['='] = function() {
  this.terminal.keyboard.applicationKeypad = true;
};

/**
 * Normal keypad (DECPNM).
 */
hterm.VT.ESC['>'] = function() {
  this.terminal.keyboard.applicationKeypad = false;
};

/**
 * Cursor to lower left corner of screen.
 *
 * Will not implement.
 *
 * This is only recognized by xterm when the hpLowerleftBugCompat resource is
 * set.
 */
hterm.VT.ESC['F'] = hterm.VT.ignore;

/**
 * Full Reset (RIS).
 */
hterm.VT.ESC['c'] = function() {
  this.reset();
  this.terminal.reset();
};

/**
 * Memory lock/unlock.
 *
 * Will not implement.
 */
hterm.VT.ESC['l'] =
hterm.VT.ESC['m'] = hterm.VT.ignore;

/**
 * Lock Shift 2 (LS2)
 *
 * Invoke the G2 Character Set as GL.
 */
hterm.VT.ESC['n'] = function() {
  this.GL = 'G2';
};

/**
 * Lock Shift 3 (LS3)
 *
 * Invoke the G3 Character Set as GL.
 */
hterm.VT.ESC['o'] = function() {
  this.GL = 'G3';
};

/**
 * Lock Shift 2, Right (LS3R)
 *
 * Invoke the G3 Character Set as GR.
 */
hterm.VT.ESC['|'] = function() {
  this.GR = 'G3';
};

/**
 * Lock Shift 2, Right (LS2R)
 *
 * Invoke the G2 Character Set as GR.
 */
hterm.VT.ESC['}'] = function() {
  this.GR = 'G2';
};

/**
 * Lock Shift 1, Right (LS1R)
 *
 * Invoke the G1 Character Set as GR.
 */
hterm.VT.ESC['~'] = function() {
  this.GR = 'G1';
};

/**
 * Change icon name and window title.
 *
 * We only change the window title.
 */
hterm.VT.OSC['0'] = function(parseState) {
  this.terminal.setWindowTitle(parseState.args[0]);
};

/**
 * Change window title.
 */
hterm.VT.OSC['2'] = hterm.VT.OSC['0'];

/**
 * Set/read color palette.
 */
hterm.VT.OSC['4'] = function(parseState) {
  // Args come in as a single 'index1;rgb1 ... ;indexN;rgbN' string.
  // We split on the semicolon and iterate through the pairs.
  var args = parseState.args[0].split(';');

  var pairCount = parseInt(args.length / 2);
  var colorPalette = this.terminal.getTextAttributes().colorPalette;
  var responseArray = [];

  for (var pairNumber = 0; pairNumber < pairCount; ++pairNumber) {
    var colorIndex = parseInt(args[pairNumber * 2]);
    var colorValue = args[pairNumber * 2 + 1];

    if (colorIndex >= colorPalette.length)
      continue;

    if (colorValue == '?') {
      // '?' means we should report back the current color value.
      colorValue = lib.colors.rgbToX11(colorPalette[colorIndex]);
      if (colorValue)
        responseArray.push(colorIndex + ';' + colorValue);

      continue;
    }

    colorValue = lib.colors.x11ToCSS(colorValue);
    if (colorValue)
      colorPalette[colorIndex] = colorValue;
  }

  if (responseArray.length)
    this.terminal.io.sendString('\x1b]4;' + responseArray.join(';') + '\x07');
};

/**
 * Set/read system clipboard.
 *
 * Read is not implemented due to security considerations.  A remote app
 * that is able to both write and read to the clipboard could essentially
 * take over your session.
 */
hterm.VT.OSC['52'] = function(parseState) {
  // Args come in as a single 'clipboard;b64-data' string.  The clipboard
  // parameter is used to select which of the X clipboards to address.  Since
  // we're not integrating with X, we treat them all the same.
  var args = parseState.args[0].match(/^[cps01234567]+;(.*)/);
  if (!args)
    return;

  var data = atob(args[1]);
  if (data)
    this.terminal.copyStringToClipboard(this.decodeUTF8(data));
};

/**
 * Insert (blank) characters (ICH).
 */
hterm.VT.CSI['@'] = function(parseState) {
  this.terminal.insertSpace(parseState.iarg(0, 1));
};

/**
 * Cursor Up (CUU).
 */
hterm.VT.CSI['A'] = function(parseState) {
  this.terminal.cursorUp(parseState.iarg(0, 1));
};

/**
 * Cursor Down (CUD).
 */
hterm.VT.CSI['B'] = function(parseState) {
  this.terminal.cursorDown(parseState.iarg(0, 1));
};

/**
 * Cursor Forward (CUF).
 */
hterm.VT.CSI['C'] = function(parseState) {
  this.terminal.cursorRight(parseState.iarg(0, 1));
};

/**
 * Cursor Backward (CUB).
 */
hterm.VT.CSI['D'] = function(parseState) {
  this.terminal.cursorLeft(parseState.iarg(0, 1));
};

/**
 * Cursor Next Line (CNL).
 *
 * This is like Cursor Down, except the cursor moves to the beginning of the
 * line as well.
 */
hterm.VT.CSI['E'] = function(parseState) {
  this.terminal.cursorDown(parseState.iarg(0, 1));
  this.terminal.setCursorColumn(0);
};

/**
 * Cursor Preceding Line (CPL).
 *
 * This is like Cursor Up, except the cursor moves to the beginning of the
 * line as well.
 */
hterm.VT.CSI['F'] = function(parseState) {
  this.terminal.cursorUp(parseState.iarg(0, 1));
  this.terminal.setCursorColumn(0);
};

/**
 * Cursor Character Absolute (CHA).
 */
hterm.VT.CSI['G'] = function(parseState) {
  this.terminal.setCursorColumn(parseState.iarg(0, 1) - 1);
};

/**
 * Cursor Position (CUP).
 */
hterm.VT.CSI['H'] = function(parseState) {
  this.terminal.setCursorPosition(parseState.iarg(0, 1) - 1,
                                  parseState.iarg(1, 1) - 1);
};

/**
 * Cursor Forward Tabulation (CHT).
 */
hterm.VT.CSI['I'] = function(parseState) {
  var count = parseState.iarg(0, 1);
  count = lib.f.clamp(count, 1, this.terminal.screenSize.width);
  for (var i = 0; i < count; i++) {
    this.terminal.forwardTabStop();
  }
};

/**
 * Erase in Display (ED, DECSED).
 */
hterm.VT.CSI['J'] =
hterm.VT.CSI['?J'] = function(parseState, code) {
  var arg = parseState.args[0];

  if (!arg || arg == '0') {
      this.terminal.eraseBelow();
  } else if (arg == '1') {
    this.terminal.eraseAbove();
  } else if (arg == '2') {
    this.terminal.clear();
  } else if (arg == '3') {
    // The xterm docs say this means "Erase saved lines", but we'll just clear
    // the display since killing the scrollback seems rude.
    this.terminal.clear();
  } else {
    this.terminal.print('\x1b[' + code + args[0])
  }
};

/**
 * Erase in line (EL, DECSEL).
 */
hterm.VT.CSI['K'] =
hterm.VT.CSI['?K'] = function(parseState, code) {
  var arg = parseState.args[0];

  if (!arg || arg == '0') {
    this.terminal.eraseToRight();
  } else if (arg == '1'){
    this.terminal.eraseToLeft();
  } else if (arg == '2') {
    this.terminal.eraseLine();
  } else {
    this.terminal.print('\x1b[' + arg + code)
  }
};

/**
 * Insert Lines (IL).
 */
hterm.VT.CSI['L'] = function(parseState) {
  this.terminal.insertLines(parseState.iarg(0, 1));
};

/**
 * Delete Lines (DL).
 */
hterm.VT.CSI['M'] = function(parseState) {
  this.terminal.deleteLines(parseState.iarg(0, 1));
};

/**
 * Delete Characters (DCH).
 *
 * This command shifts the line contents left, starting at the cursor position.
 */
hterm.VT.CSI['P'] = function(parseState) {
  this.terminal.deleteChars(parseState.iarg(0, 1));
};

/**
 * Scroll Up (SU).
 */
hterm.VT.CSI['S'] = function(parseState) {
  this.terminal.vtScrollUp(parseState.iarg(0, 1));
};

/**
 * Scroll Down (SD).
 * Also 'Initiate highlight mouse tracking'.  Will not implement this part.
 */
hterm.VT.CSI['T'] = function(parseState) {
  if (parseState.args.length <= 1)
    this.terminal.vtScrollDown(parseState.iarg(0, 1));
};

/**
 * Reset one or more features of the title modes to the default value.
 *
 *   ESC [ > Ps T
 *
 * Normally, "reset" disables the feature. It is possible to disable the
 * ability to reset features by compiling a different default for the title
 * modes into xterm.
 *
 * Ps values:
 *   0 - Do not set window/icon labels using hexadecimal.
 *   1 - Do not query window/icon labels using hexadecimal.
 *   2 - Do not set window/icon labels using UTF-8.
 *   3 - Do not query window/icon labels using UTF-8.
 *
 * Will not implement.
 */
hterm.VT.CSI['>T'] = hterm.VT.ignore;

/**
 * Erase Characters (ECH).
 */
hterm.VT.CSI['X'] = function(parseState) {
  this.terminal.eraseToRight(parseState.iarg(0, 1));
};

/**
 * Cursor Backward Tabulation (CBT).
 */
hterm.VT.CSI['Z'] = function(parseState) {
  var count = parseState.iarg(0, 1);
  count = lib.f.clamp(count, 1, this.terminal.screenSize.width);
  for (var i = 0; i < count; i++) {
    this.terminal.backwardTabStop();
  }
};

/**
 * Character Position Absolute (HPA).
 */
hterm.VT.CSI['`'] = function(parseState) {
  this.terminal.setCursorColumn(parseState.iarg(0, 1) - 1);
};

/**
 * Repeat the preceding graphic character.
 *
 * Not currently implemented.
 */
hterm.VT.CSI['b'] = hterm.VT.ignore;

/**
 * Send Device Attributes (Primary DA).
 *
 * TODO(rginda): This is hardcoded to send back 'VT100 with Advanced Video
 * Option', but it may be more correct to send a VT220 response once
 * we fill out the 'Not currently implemented' parts.
 */
hterm.VT.CSI['c'] = function(parseState) {
  if (!parseState.args[0] || parseState.args[0] == '0') {
    this.terminal.io.sendString('\x1b[?1;2c');
  }
};

/**
 * Send Device Attributes (Secondary DA).
 *
 * TODO(rginda): This is hardcoded to send back 'VT100' but it may be more
 * correct to send a VT220 response once we fill out more 'Not currently
 * implemented' parts.
 */
hterm.VT.CSI['>c'] = function(parseState) {
  this.terminal.io.sendString('\x1b[>0;256;0c');
};

/**
 * Line Position Absolute (VPA).
 */
hterm.VT.CSI['d'] = function(parseState) {
  this.terminal.setAbsoluteCursorRow(parseState.iarg(0, 1) - 1);
};

/**
 * Horizontal and Vertical Position (HVP).
 *
 * Same as Cursor Position (CUP).
 */
hterm.VT.CSI['f'] = hterm.VT.CSI['H'];

/**
 * Tab Clear (TBC).
 */
hterm.VT.CSI['g'] = function(parseState) {
  if (!parseState.args[0] || parseState.args[0] == '0') {
    // Clear tab stop at cursor.
    this.terminal.clearTabStopAtCursor(false);
  } else if (parseState.args[0] == '3') {
    // Clear all tab stops.
    this.terminal.clearAllTabStops();
  }
};

/**
 * Set Mode (SM).
 */
hterm.VT.CSI['h'] = function(parseState) {
  for (var i = 0; i < parseState.args.length; i++) {
    this.setANSIMode(parseState.args[i], true);
  }
};

/**
 * DEC Private Mode Set (DECSET).
 */
hterm.VT.CSI['?h'] = function(parseState) {
  for (var i = 0; i < parseState.args.length; i++) {
    this.setDECMode(parseState.args[i], true);
  }
};

/**
 * Media Copy (MC).
 * Media Copy (MC, DEC Specific).
 *
 * These commands control the printer.  Will not implement.
 */
hterm.VT.CSI['i'] =
hterm.VT.CSI['?i'] = hterm.VT.ignore;

/**
 * Reset Mode (RM).
 */
hterm.VT.CSI['l'] = function(parseState) {
  for (var i = 0; i < parseState.args.length; i++) {
    this.setANSIMode(parseState.args[i], false);
  }
};

/**
 * DEC Private Mode Reset (DECRST).
 */
hterm.VT.CSI['?l'] = function(parseState) {
  for (var i = 0; i < parseState.args.length; i++) {
    this.setDECMode(parseState.args[i], false);
  }
};

/**
 * Character Attributes (SGR).
 *
 * Iterate through the list of arguments, applying the following attribute
 * changes based on the argument value...
 *
 *    0 Normal (default).
 *    1 Bold.
 *    4 Underlined.
 *    5 Blink (appears as Bold).
 *    7 Inverse.
 *    8 Invisible, i.e., hidden (VT300).
 *   22 Normal (neither bold nor faint).
 *   24 Not underlined.
 *   25 Steady (not blinking).
 *   27 Positive (not inverse).
 *   28 Visible, i.e., not hidden (VT300).
 *   30 Set foreground color to Black.
 *   31 Set foreground color to Red.
 *   32 Set foreground color to Green.
 *   33 Set foreground color to Yellow.
 *   34 Set foreground color to Blue.
 *   35 Set foreground color to Magenta.
 *   36 Set foreground color to Cyan.
 *   37 Set foreground color to White.
 *   39 Set foreground color to default (original).
 *   40 Set background color to Black.
 *   41 Set background color to Red.
 *   42 Set background color to Green.
 *   43 Set background color to Yellow.
 *   44 Set background color to Blue.
 *   45 Set background color to Magenta.
 *   46 Set background color to Cyan.
 *   47 Set background color to White.
 *   49 Set background color to default (original)
 *
 * For 16-color support, the following apply.
 *
 *   90 Set foreground color to Bright Black.
 *   91 Set foreground color to Bright Red.
 *   92 Set foreground color to Bright Green.
 *   93 Set foreground color to Bright Yellow.
 *   94 Set foreground color to Bright Blue.
 *   95 Set foreground color to Bright Magenta.
 *   96 Set foreground color to Bright Cyan.
 *   97 Set foreground color to Bright White.
 *  100 Set background color to Bright Black.
 *  101 Set background color to Bright Red.
 *  102 Set background color to Bright Green.
 *  103 Set background color to Bright Yellow.
 *  104 Set background color to Bright Blue.
 *  105 Set background color to Bright Magenta.
 *  106 Set background color to Bright Cyan.
 *  107 Set background color to Bright White.
 *
 * For 88- or 256-color support, the following apply.
 *  38 ; 5 ; P Set foreground color to P.
 *  48 ; 5 ; P Set background color to P.
 *
 * Note that most terminals consider "bold" to be "bold and bright".  In
 * some documents the bold state is even referred to as bright.  We interpret
 * bold as bold-bright here too, but only when the "bold" setting comes before
 * the color selection.
 */
hterm.VT.CSI['m'] = function(parseState) {
  function get256(i) {
    if (parseState.args.length < i + 2 || parseState.args[i + 1] != '5')
      return null;

    return parseState.iarg(i + 2, 0);
  }

  var attrs = this.terminal.getTextAttributes();

  if (!parseState.args.length) {
    attrs.reset();
    return;
  }

  for (var i = 0; i < parseState.args.length; i++) {
    var arg = parseState.iarg(i, 0);

    if (arg < 30) {
      if (arg == 0) {
        attrs.reset();
      } else if (arg == 1) {
        attrs.bold = true;
      } else if (arg == 4) {
        attrs.underline = true;
      } else if (arg == 5) {
        attrs.blink = true;
      } else if (arg == 7) {  // Inverse.
        attrs.inverse = true;
      } else if (arg == 8) {  // Invisible.
        attrs.invisible = true;
      } else if (arg == 22) {
        attrs.bold = false;
      } else if (arg == 24) {
        attrs.underline = false;
      } else if (arg == 25) {
        attrs.blink = false;
      } else if (arg == 27) {
        attrs.inverse = false;
      } else if (arg == 28) {
        attrs.invisible = false;
      }

    } else if (arg < 50) {
      // Select fore/background color from bottom half of 16 color palette
      // or from the 256 color palette.
      if (arg < 38) {
        attrs.foregroundIndex = arg - 30;

      } else if (arg == 38) {
        var c = get256(i);
        if (c == null)
          break;

        i += 2;

        if (c >= attrs.colorPalette.length)
          continue;

        attrs.foregroundIndex = c;

      } else if (arg == 39) {
        attrs.foregroundIndex = null;

      } else if (arg < 48) {
        attrs.backgroundIndex = arg - 40;

      } else if (arg == 48) {
        var c = get256(i);
        if (c == null)
          break;

        i += 2;

        if (c >= attrs.colorPalette.length)
          continue;

        attrs.backgroundIndex = c;
      } else {
        attrs.backgroundIndex = null;
      }

    } else if (arg >= 90 && arg <= 97) {
      attrs.foregroundIndex = arg - 90 + 8;

    } else if (arg >= 100 && arg <= 107) {
      attrs.backgroundIndex = arg - 100 + 8;
    }
  }

  attrs.setDefaults(this.terminal.getForegroundColor(),
                    this.terminal.getBackgroundColor());
};

/**
 * Set xterm-specific keyboard modes.
 *
 * Will not implement.
 */
hterm.VT.CSI['>m'] = hterm.VT.ignore;

/**
 * Device Status Report (DSR, DEC Specific).
 *
 * 5 - Status Report. Result (OK) is CSI 0 n
 * 6 - Report Cursor Position (CPR) [row;column]. Result is CSI r ; c R
 */
hterm.VT.CSI['n'] = function(parseState) {
  if (parseState.args[0] == '5') {
    this.terminal.io.sendString('\x1b0n');
  } else if (parseState.args[0] == '6') {
    var row = this.terminal.getCursorRow() + 1;
    var col = this.terminal.getCursorColumn() + 1;
    this.terminal.io.sendString('\x1b[' + row + ';' + col + 'R');
  }
};

/**
 * Disable modifiers which may be enabled via CSI['>m'].
 *
 * Will not implement.
 */
hterm.VT.CSI['>n'] = hterm.VT.ignore;

/**
 * Device Status Report (DSR, DEC Specific).
 *
 * 6  - Report Cursor Position (CPR) [row;column] as CSI ? r ; c R
 * 15 - Report Printer status as CSI ? 1 0 n (ready) or
 *      CSI ? 1 1 n (not ready).
 * 25 - Report UDK status as CSI ? 2 0 n (unlocked) or CSI ? 2 1 n (locked).
 * 26 - Report Keyboard status as CSI ? 2 7 ; 1 ; 0 ; 0 n (North American).
 *      The last two parameters apply to VT400 & up, and denote keyboard ready
 *      and LK01 respectively.
 * 53 - Report Locator status as CSI ? 5 3 n Locator available, if compiled-in,
 *      or CSI ? 5 0 n No Locator, if not.
 */
hterm.VT.CSI['?n'] = function(parseState) {
  if (parseState.args[0] == '6') {
    var row = this.terminal.getCursorRow() + 1;
    var col = this.terminal.getCursorColumn() + 1;
    this.terminal.io.sendString('\x1b[' + row + ';' + col + 'R');
  } else if (parseState.args[0] == '15') {
    this.terminal.io.sendString('\x1b[?11n');
  } else if (parseState.args[0] == '25') {
    this.terminal.io.sendString('\x1b[?21n');
  } else if (parseState.args[0] == '26') {
    this.terminal.io.sendString('\x1b[?12;1;0;0n');
  } else if (parseState.args[0] == '53') {
    this.terminal.io.sendString('\x1b[?50n');
  }
};

/**
 * This is used by xterm to decide whether to hide the pointer cursor as the
 * user types.
 *
 * Valid values for the parameter:
 *   0 - Never hide the pointer.
 *   1 - Hide if the mouse tracking mode is not enabled.
 *   2 - Always hide the pointer.
 *
 * If no parameter is given, xterm uses the default, which is 1.
 *
 * Not currently implemented.
 */
hterm.VT.CSI['>p'] = hterm.VT.ignore;

/**
 * Soft terminal reset (DECSTR).
 */
hterm.VT.CSI['!p'] = function() {
  this.reset();
  this.terminal.softReset();
};

/**
 * Request ANSI Mode (DECRQM).
 *
 * Not currently implemented.
 */
hterm.VT.CSI['$p'] = hterm.VT.ignore;
hterm.VT.CSI['?$p'] = hterm.VT.ignore;

/**
 * Set conformance level (DECSCL).
 *
 * Not currently implemented.
 */
hterm.VT.CSI['"p'] = hterm.VT.ignore;

/**
 * Load LEDs (DECLL).
 *
 * Not currently implemented.  Could be implemented as virtual LEDs overlaying
 * the terminal if anyone cares.
 */
hterm.VT.CSI['q'] = hterm.VT.ignore;

/**
 * Set cursor style (DECSCUSR, VT520).
 *
 *   0 - Blinking block.
 *   1 - Blinking block (default).
 *   2 - Steady block.
 *   3 - Blinking underline.
 *   4 - Steady underline.
 * Not currently implemented.
 */
hterm.VT.CSI[' q'] = hterm.VT.ignore;

/**
 * Select character protection attribute (DECSCA).
 *
 * Will not implement.
 */
hterm.VT.CSI['"q'] = hterm.VT.ignore;

/**
 * Set Scrolling Region (DECSTBM).
 */
hterm.VT.CSI['r'] = function(parseState) {
  var args = parseState.args;
  var scrollTop = args[0] ? parseInt(args[0], 10) -1 : null;
  var scrollBottom = args[1] ? parseInt(args[1], 10) - 1 : null;
  this.terminal.setVTScrollRegion(scrollTop, scrollBottom);
  this.terminal.setCursorPosition(0, 0);
};

/**
 * Restore DEC Private Mode Values.
 *
 * Will not implement.
 */
hterm.VT.CSI['?r'] = hterm.VT.ignore;

/**
 * Change Attributes in Rectangular Area (DECCARA)
 *
 * Will not implement.
 */
hterm.VT.CSI['$r'] = hterm.VT.ignore;

/**
 * Save cursor (ANSI.SYS)
 */
hterm.VT.CSI['s'] = function() {
  this.savedState_.save();
};

/**
 * Save DEC Private Mode Values.
 *
 * Will not implement.
 */
hterm.VT.CSI['?s'] = hterm.VT.ignore;

/**
 * Window manipulation (from dtterm, as well as extensions).
 *
 * Will not implement.
 */
hterm.VT.CSI['t'] = hterm.VT.ignore;

/**
 * Reverse Attributes in Rectangular Area (DECRARA).
 *
 * Will not implement.
 */
hterm.VT.CSI['$t'] = hterm.VT.ignore;

/**
 * Set one or more features of the title modes.
 *
 * Will not implement.
 */
hterm.VT.CSI['>t'] = hterm.VT.ignore;

/**
 * Set warning-bell volume (DECSWBV, VT520).
 *
 * Will not implement.
 */
hterm.VT.CSI[' t'] = hterm.VT.ignore;

/**
 * Restore cursor (ANSI.SYS).
 */
hterm.VT.CSI['u'] = function() {
  this.terminal.restoreOptions();
};

/**
 * Set margin-bell volume (DECSMBV, VT520).
 *
 * Will not implement.
 */
hterm.VT.CSI[' u'] = hterm.VT.ignore;

/**
 * Copy Rectangular Area (DECCRA, VT400 and up).
 *
 * Will not implement.
 */
hterm.VT.CSI['$v'] = hterm.VT.ignore;

/**
 * Enable Filter Rectangle (DECEFR).
 *
 * Will not implement.
 */
hterm.VT.CSI['\'w'] = hterm.VT.ignore;

/**
 * Request Terminal Parameters (DECREQTPARM).
 *
 * Not currently implemented.
 */
hterm.VT.CSI['x'] = hterm.VT.ignore;

/**
 * Select Attribute Change Extent (DECSACE).
 *
 * Will not implement.
 */
hterm.VT.CSI['*x'] = hterm.VT.ignore;

/**
 * Fill Rectangular Area (DECFRA), VT420 and up.
 *
 * Will not implement.
 */
hterm.VT.CSI['$x'] = hterm.VT.ignore;

/**
 * Enable Locator Reporting (DECELR).
 *
 * Not currently implemented.
 */
hterm.VT.CSI['\'z'] = hterm.VT.ignore;

/**
 * Erase Rectangular Area (DECERA), VT400 and up.
 *
 * Will not implement.
 */
hterm.VT.CSI['$z'] = hterm.VT.ignore;

/**
 * Select Locator Events (DECSLE).
 *
 * Not currently implemented.
 */
hterm.VT.CSI['\'{'] = hterm.VT.ignore;

/**
 * Request Locator Position (DECRQLP).
 *
 * Not currently implemented.
 */
hterm.VT.CSI['\'|'] = hterm.VT.ignore;

/**
 * Insert Columns (DECIC), VT420 and up.
 *
 * Will not implement.
 */
hterm.VT.CSI[' }'] = hterm.VT.ignore;

/**
 * Delete P s Columns (DECDC), VT420 and up.
 *
 * Will not implement.
 */
hterm.VT.CSI[' ~'] = hterm.VT.ignore;
