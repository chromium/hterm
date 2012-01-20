// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

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

  // The current parser function.  Escapes that mark the start of a longer
  // sequence will alter the parser function to handle the remainder of the
  // escape sequence.  Once the sequence has been fully parsed this parser
  // function should be set back to this.parseUnknown_.
  this.parser_ = this.parseUnknown_;

  // The arguments collected for the current escape sequence.
  this.args_ = [];

  // Any "leading modifiers" for the escape sequence, such as '?', ' ', or the
  // other modifiers handled in this.parseCSI_.
  this.leadingModifier_ = '';

  // Any "trailing modifiers".  Same character set as a leading modifier,
  // except these are found after the numeric arguments.
  this.trailingModifier_ = '';

  // Whether or not to respect the escape codes for setting terminal width.
  this.allowColumnWidthChanges_ = true;

  // Construct a regular expression to match the known one-byte control chars.
  // This is used in parseUnknown_ to quickly scan a string for the next
  // control character.
  var cc1 = Object.keys(hterm.VT.CC1).map(
      function(e) {
        return '\\x' + hterm.zpad(e.charCodeAt().toString(16), 2)
      }).join('');
  this.cc1Pattern_ = new RegExp('[' + cc1 + ']');

  // Regular expression used in UTF-8 decoding.
  this.utf8Pattern_ = new RegExp(
      [// 110x-xxxx 10xx-xxxx
       '([\\xc0-\\xdf][\\x80-\\xbf])',
       // 1110-xxxx 10xx-xxxx 10xx-xxxx
       '([\\xe0-\\xef][\\x80-\\xbf]{2})',
       // 1111-0xxx 10xx-xxxx 10xx-xxxx 10xx-xxxx
       '([\\xf0-\\xf7][\\x80-\\xbf]{3})',
       // 1111-10xx 10xx-xxxx 10xx-xxxx 10xx-xxxx 10xx-xxxx
       '([\\xf8-\\xfb][\\x80-\\xbf]{4})',
       // 1111-110x 10xx-xxxx 10xx-xxxx 10xx-xxxx 10xx-xxxx 10xx-xxxx
       '([\\xfc-\\xfd][\\x80-\\xbf]{5})'
       ].join('|'),
      'g');

  /**
   * The keyboard handler associated with this virtual terminal.
   */
  this.keyboard = new hterm.VT.Keyboard(this);

  /**
   * If true, emit warnings when we encounter a control character or escape
   * sequence that we don't recognize or explicitly ignore.
   */
  this.warnUnimplemented = true;

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
 * Interpret a string of characters, displaying the results on the associated
 * terminal object.
 */
hterm.VT.prototype.interpret = function(str) {
  var i = 0;
  var step = 0;

  str = this.decodeCharset(str);

  while (i < str.length) {
    if (this.stepSize) {
      if (step++ == this.stepSize) {
        step = 0;
        debugger;
      }
    }

    var nextIndex = this.parser_(str, i);
    if (i == nextIndex)
      throw 'Parser did not advance index!';

    i = nextIndex;
  }
};

/**
 * Decode an encoded string into a unicode string.
 *
 * Hard-coded to UTF-8.
 *
 * TODO(rginda): We probably need to support other encodings, and we should
 * consider moving the decode into the NaCl plugin (though that will hurt
 * non-nacl-ssh uses of hterm, so maybe not).
 */
hterm.VT.prototype.decodeCharset = function(str) {
  function fromBigCharCode(codePoint) {
    // String.fromCharCode can't handle codepoints > 2 bytes without
    // this magic.  See <http://goo.gl/jpcx0>.
    if (codePoint > 0xffff) {
      codePoint -= 0x1000;
      return String.fromCharCode(0xd800 + (codePoint >> 10),
                                 0xdc00 + (codePoint & 0x3ff));
    }

    return String.fromCharCode(codePoint);
  }

  return str.replace(this.utf8Pattern_, function(bytes) {
      var ary = bytes.split('').map(function (e) { return e.charCodeAt() });
      var ch = ary[0];
      if (ch <= 0xdf) {
        // 110x-xxxx 10xx-xxxx
        // 11 bits of 2 bytes encoded in 2 bytes.
        return String.fromCharCode(((ch & 0x1f) << 6) |
                                   (ary[1] & 0x3f));
      }

      if (ch <= 0xef) {
        // 1110-xxxx 10xx-xxxx 10xx-xxxx
        // 16 bits of 2 bytes encoded in 3 bytes.
        var rv = String.fromCharCode(((ch & 0x0f) << 12) |
                                     (ary[1] & 0x3f) << 6 |
                                     (ary[2] & 0x3f));
        return rv;
      }

      if (ch <= 0xf7) {
        // 1111-0xxx 10xx-xxxx 10xx-xxxx 10xx-xxxx
        // 21 bits of 3 bytes encoded in 4 bytes.
        return fromBigCharCode(((ch & 0x1f) << 18) |
                               (ary[1] & 0x3f) << 12 |
                               (ary[2] & 0x3f) << 6 |
                               (ary[3] & 0x3f));
      }

      if (ch <= 0xfb) {
        // 1111-10xx 10xx-xxxx 10xx-xxxx 10xx-xxxx 10xx-xxxx
        // 26 bits of 4 bytes encoded in 5 bytes.
        return fromBigCharCode(((ch & 0x1f) << 24) |
                               (ary[1] & 0x3f) << 18 |
                               (ary[2] & 0x3f) << 12 |
                               (ary[3] & 0x3f) << 6 |
                               (ary[4] & 0x3f));
      }

      // 1111-110x 10xx-xxxx 10xx-xxxx 10xx-xxxx 10xx-xxxx 10xx-xxxx
      // 31 bits of 4 bytes encoded in 6 bytes.
      return fromBigCharCode(((ch & 0x1f) << 30) |
                             (ary[1] & 0x3f) << 24 |
                             (ary[2] & 0x3f) << 18 |
                             (ary[3] & 0x3f) << 12 |
                             (ary[4] & 0x3f) << 6 |
                             (ary[5] & 0x3f));
    });
};

/**
 * The default parse function.  (The default value of this.parser_.)
 *
 * This will scan the string for the first 1-byte control character (C0/C1
 * characters from [CTRL]).  Any plain text coming before the code will be
 * printed to the terminal, then the control character will be dispatched.
 *
 * The control character may modify this.parser_ in order to put a different
 * parser in place for the characters that  follow.
 *
 * When a custom parser function has completed parsing a sequence, it should
 * reset this.parser_ back to this function.
 */
hterm.VT.prototype.parseUnknown_ = function(str, i) {
  // Search for the next contiguous block of plain text.
  var substr = str.substr(i);
  var nextControl = substr.search(this.cc1Pattern_);

  if (nextControl == 0) {
    // We've stumbled right into a control character.
    this.dispatch('CC1', str.substr(i, 1));
    return i + 1;
  }

  if (nextControl == -1) {
    // There are no control characters in this string.
    this.terminal.print(substr);
    return str.length;
  }

  this.terminal.print(str.substr(i, nextControl));
  this.dispatch('CC1', str.substr(i + nextControl, 1));
  return i + nextControl + 1;
};

/**
 * Parse a Control Sequence Introducer code and dispatch it.
 *
 * See [CSI] for some useful information about these codes.
 */
hterm.VT.prototype.parseCSI_ = function(str, i) {
  var ch = str.substr(i, 1);

  if (ch >= '@' && ch <= '~') {
    // This is the final character.
    this.dispatch('CSI', this.leadingModifier_ + this.trailingModifier_ + ch,
                  this.args_);

    this.parser_ = this.parseUnknown_;

  } else if (ch == ';') {
    // Parameter delimeter.
    if (this.trailingModifier_) {
      // Parameter delimiter after the trailing modifier.  That's a paddlin'.
      this.parser_ = this.parseUnknown_;

    } else {
      if (!this.args_.length) {
        // They omitted the first param, we need to supply it.
        this.args_.push('');
      }

      this.args_.push('');
    }

  } else if (ch >= '0' && ch <= '9') {
    // Next byte in the current parameter.

    if (this.trailingModifier_) {
      // Numeric parameter after the trailing modifier.  That's a paddlin'.
      this.parser_ = this.parseUnknown_;
    } else {
      if (!this.args_.length) {
        this.args_[0] = ch;
      } else {
        this.args_[this.args_.length - 1] += ch;
      }
    }

  } else if (ch >= ' ' && ch <= '?' && ch != ':') {
    // Modifier character.
    if (!this.args_.length) {
      this.leadingModifier_ += ch;
    } else {
      this.trailingModifier_ += ch;
    }

  } else if (this.cc1Pattern_.test(ch)) {
    // Control character.
    this.dispatch('CC1', ch);

  } else {
    // Unexpected character in sequence, bail out.
    this.parser_ = this.parseUnknown_;
  }

  return i + 1;
};

/**
 * Skip over the string until the next String Terminator (ST, 'ESC \') or
 * Bell (BEL, '\x07').
 */
hterm.VT.prototype.parseUntilStringTerminator_ = function(str, i) {
  var nextTerminator = str.substr(i).search(/(\x1b\\|\x07)/);
  if (nextTerminator == -1) {
    // No terminator here, have to wait for the next string.
    return str.length;
  }

  this.parser_ = this.parseUnknown_;
  return i + nextTerminator + (str.substr(i + nextTerminator, 1) == '\x1b' ?
                               2 : 1);
};

/**
 * Dispatch to the function that handles a given CC1, ESC, or CSI or VT52 code.
 */
hterm.VT.prototype.dispatch = function(type, code, args) {
  var handler = hterm.VT[type][code];
  if (!handler) {
    if (this.warnUnimplemented)
      console.error('Unknown ' + type + ' code: ' + JSON.stringify(code));
    return;
  } else if (handler == hterm.VT.ignore) {
    if (this.warnUnimplemented)
      console.error('Ignored ' + type + ' code: ' + JSON.stringify(code));
    return;
  }

  handler.apply(this, [args, code]);
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
 *   1000 - [!] Send Mouse X & Y on button press and release.
 *   1001 - [!] Use Hilite Mouse Tracking.
 *   1002 - [!] Use Cell Motion Mouse Tracking.
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
      this.applicationCursor = state;
      break;

    case '3':  // DECCOLM
      if (this.allowColumnWidthChanges_) {
        this.terminal.setWidth(state ? 132 : 80);

        this.terminal.clear();
        this.terminal.setVTScrollRegion(null, null);
        this.terminal.setAbsoluteCursorPosition(0, 0);
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
      this.backspaceSendsBackspace = state;
      break;

    case '1010':  // rxvt
      this.terminal.scrollOnOutput = state;
      break;

    case '1011':  // rxvt
      this.terminal.scrollOnKeystroke = state;
      break;

    case '1036':  // no-spec
      this.metaSendsEscape = state;
      break;

    case '1039':  // no-spec
      this.altSendsEscape = state;
      break;

    case '1047':  // no-spec
      this.terminal.setAlternateMode(state);
      break;

    case '1048':  // Save cursor as in DECSC.
      this.terminal.saveOptions();

    case '1049':  // 1047 + 1048 + clear.
      this.terminal.saveOptions();
      this.terminal.setAlternateMode(state);
      if (state)
        this.terminal.clear();
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
 * Collection of VT52 sequences.
 *
 * When in VT52 mode, other sequences are disabled.
 */
hterm.VT.VT52 = {};

/**
 * Null (NUL).
 *
 * Ignored.
 */
hterm.VT.CC1['\x00'] = hterm.VT.ignore;

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
 * This code causes a line feed or a new line operation.  See new line mode.
 */
hterm.VT.CC1['\x0A'] = function() {
  this.terminal.newLine();
};

/**
 * Vertical Tab (VT).
 *
 * Interpreted as LF.
 */
hterm.VT.CC1['\x0B'] = function() {
  this.terminal.formFeed();
};

/**
 * Form Feed (FF).
 *
 * Interpreted as LF.
 */
hterm.VT.CC1['\x0C'] = function() {
  this.terminal.formFeed();
};

/**
 * Carriage Return (CR).
 *
 * Move cursor to the left margin on the current line.
 */
hterm.VT.CC1['\x0D'] = function() {
  this.terminal.setCursorColumn(0);
};

/**
 * Shift Out (SO).
 *
 * Invoke G1 character set, as designated by SCS control sequence.
 */
hterm.VT.CC1['\x0E'] = function() {
  this.terminal.setCharacterSet(1);
};

/**
 * Shift In (SI) - Select G0 character set, as selected by ESC ( sequence.
 */
hterm.VT.CC1['\x0F'] = function() {
  this.terminal.setCharacterSet(0);
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
hterm.VT.CC1['\x18'] = function() {
  this.parser_ = this.parseUnknown_;
  this.terminal.print('?');
};

/**
 * Substitute (SUB).
 *
 * Interpreted as CAN.
 */
hterm.VT.CC1['\x1A'] = hterm.VT.CC1['\x18'];

/**
 * Escape (ESC).
 */
hterm.VT.CC1['\x1B'] = function() {
  function parseESC(str, i) {
    var ch = str.substr(i, 1);

    if (ch == '\x1b')
      return i + 1;

    this.dispatch('ESC', ch);

    if (this.parser_ == parseESC)
      this.parser_ = this.parseUnknown_;

    return i + 1;
  };

  this.parser_ = parseESC;
};

/**
 * Delete (DEL).
 */
hterm.VT.CC1['\x7F'] = hterm.VT.ignore;

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
hterm.VT.ESC['P'] = function() {
  this.parser_ = this.parseUntilStringTerminator_;
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
hterm.VT.ESC['['] = function() {
  this.args_.length = 0;
  this.leadingModifier_ = '';
  this.trailingModifier_ = '';
  this.parser_ = this.parseCSI_;
};

/**
 * String Terminator (ST).
 *
 * Used to terminate OSC/DCS/APC commands which may take string arguments.
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
 *
 * Will not implement.
 */
hterm.VT.CC1['\x9d'] =
hterm.VT.ESC[']'] = function() {
  this.parser_ = this.parseUntilStringTerminator_;
};

/**
 * Privacy Message (PM).
 *
 * Will not implement.
 */
hterm.VT.CC1['\x9e'] =
hterm.VT.ESC['^'] = function() {
  this.parser_ = this.parseUntilStringTerminator_;
};

/**
 * Application Program Control (APC).
 *
 * Will not implement.
 */
hterm.VT.CC1['\x9f'] =
hterm.VT.ESC['_'] = function() {
  this.parser_ = this.parseUntilStringTerminator_;
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
 *
 * All other 'ESC \x20' sequences are echoed to the terminal.
 */
hterm.VT.ESC['\x20'] = function(args) {
  this.parser_ = function(str, i) {
    var ch = str.substr(i, 1);

    switch (ch) {
        break;

      default:
        this.terminal.print('\x1b ' + ch);
    };

    this.parser_ = this.parseUnkown_;
    return i + 1;
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
hterm.VT.ESC['#'] = function() {
  this.parser_ = function(str, i) {
    var ch = str.substr(i, 1);
    if (ch == '8') {
      this.terminal.fill('E');
    } else if ("3456".indexOf(ch) == -1) {
      this.terminal.print('\x1b#' + ch);
    }

    this.parser_ = this.parseUnknown_;
    return i + 1;
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
hterm.VT.ESC['%'] = function() {
  this.parser_ = function(str, i) {
    var ch = str.substr(i, 1);
    if (ch != '@' && ch != 'G')
      this.terminal.print('\x1b%' + ch);

    this.parser_ = this.parseUnknown_;
    return i + 1;
  };
};

/**
 * Designate G1, G2 and G3 character sets.  Not currently implemented.
 *
 *   ESC ( Ps - Set G0 character set (VT100).
 *   ESC ) Ps - Set G1 character set (VT220).
 *   ESC * Ps - Set G2 character set (VT220).
 *   ESC + Ps - Set G3 character set (VT220).
 *   ESC - Ps - Set G1 character set (VT300).
 *   ESC . Ps - Set G2 character set (VT300).
 *   ESC / Ps - Set G3 character set (VT300).
 *              These work for 96 character sets only.
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
hterm.VT.ESC['/'] = function(args, code) {
  this.parser_ = function(str, i) {
    var ch = str.substr(i, 1);
    if ('0AB4C5RQKYEZH7='.indexOf(ch) == -1)
      this.terminal.print('\x1b' + code + ch);

    this.parser_ = this.parseUnknown_;
    return i + 1;
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
  this.terminal.saveOptions();
};

/**
 * Restore Cursor (DECSC).
 */
hterm.VT.ESC['8'] = function() {
  this.terminal.restoreOptions();
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
  this.applicationKeypad = true;
};

/**
 * Normal keypad (DECPNM).
 */
hterm.VT.ESC['>'] = function() {
  this.applicationKeypad = false;
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
 * Invoke character set.
 *
 *   'ESC n' - Invoke the G2 Character Set as GL (LS2).
 *   'ESC o' - Invoke the G3 Character Set as GL (LS3).
 *   'ESC |' - Invoke the G3 Character Set as GR (LS3R).
 *   'ESC }' - Invoke the G2 Character Set as GR (LS2R).
 *   'ESC ~' - Invoke the G1 Character Set as GR (LS1R).
 *
 * LS3R, LS2R, LS1R will not implement.
 * TODO(rginda): LS2, LS3
 */
hterm.VT.ESC['n'] =
hterm.VT.ESC['o'] =
hterm.VT.ESC['|'] =
hterm.VT.ESC['}'] =
hterm.VT.ESC['~'] = hterm.VT.ignore;

/**
 * Insert (blank) characters (ICH).
 */
hterm.VT.CSI['@'] = function(args) {
  this.terminal.insertSpace(args[0] ? parseInt(args[0], 10) : 1);
};

/**
 * Cursor Up (CUU).
 */
hterm.VT.CSI['A'] = function(args) {
  this.terminal.cursorUp(args[0] ? parseInt(args[0], 10) : 1);
};

/**
 * Cursor Down (CUD).
 */
hterm.VT.CSI['B'] = function(args) {
  this.terminal.cursorDown(args[0] ? parseInt(args[0], 10) : 1);
};

/**
 * Cursor Forward (CUF).
 */
hterm.VT.CSI['C'] = function(args) {
  this.terminal.cursorRight(args[0] ? parseInt(args[0], 10) : 1);
};

/**
 * Cursor Backward (CUB).
 */
hterm.VT.CSI['D'] = function(args) {
  this.terminal.cursorLeft(args[0] ? parseInt(args[0], 10) : 1);
};

/**
 * Cursor Next Line (CNL).
 *
 * This is like Cursor Down, except the cursor moves to the beginning of the
 * line as well.
 */
hterm.VT.CSI['E'] = function(args) {
  this.terminal.cursorDown(args[0] ? parseInt(args[0], 10) : 1);
  this.terminal.setCursorColumn(0);
};

/**
 * Cursor Preceding Line (CPL).
 *
 * This is like Cursor Up, except the cursor moves to the beginning of the
 * line as well.
 */
hterm.VT.CSI['F'] = function(args) {
  this.terminal.cursorUp(args[0] ? parseInt(args[0], 10) : 1);
  this.terminal.setCursorColumn(0);
};

/**
 * Cursor Character Absolute (CHA).
 */
hterm.VT.CSI['G'] = function(args) {
  this.terminal.setCursorColumn(args[0] ? parseInt(args[0], 10) - 1 : 0);
};

/**
 * Cursor Position (CUP).
 */
hterm.VT.CSI['H'] = function(args) {
  this.terminal.setCursorPosition(args[0] ? parseInt(args[0], 10) - 1 : 0,
                                  args[1] ? parseInt(args[1], 10) - 1 : 0);
};

/**
 * Cursor Forward Tabulation (CHT).
 */
hterm.VT.CSI['I'] = function(args) {
  var count = args[0] ? parseInt(args[0], 10) : 1;
  count = hterm.clamp(count, 1, this.terminal.screenSize.width);
  for (var i = 0; i < count; i++) {
    this.terminal.forwardTabStop();
  }
};

/**
 * Erase in Display (ED, DECSED).
 */
hterm.VT.CSI['J'] =
hterm.VT.CSI['?J'] = function(args, code) {
  var arg = args[0];

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
hterm.VT.CSI['?K'] = function(args, code) {
  var arg = args[0];

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
hterm.VT.CSI['L'] = function(args) {
  this.terminal.insertLines(args[0] ? parseInt(args[0], 10) : 1);
};

/**
 * Delete Lines (DL).
 */
hterm.VT.CSI['M'] = function(args) {
  this.terminal.deleteLines(args[0] ? parseInt(args[0], 10) : 1);
};

/**
 * Delete Characters (DCH).
 *
 * This command shifts the line contents left, starting at the cursor position.
 */
hterm.VT.CSI['P'] = function(args) {
  this.terminal.deleteChars(args[0] ? parseInt(args[0], 10) : 1);
};

/**
 * Scroll Up (SU).
 */
hterm.VT.CSI['S'] = function(args) {
  this.terminal.vtScrollUp(args[0] ? parseInt(args[0], 10) : 1);
};

/**
 * Scroll Down (SD).
 * Also 'Initiate highlight mouse tracking'.  Will not implement this part.
 */
hterm.VT.CSI['T'] = function(args) {
  if (args.length <= 1)
    this.terminal.vtScrollDown(args[0] ? parseInt(args[0], 10) : 1);
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
hterm.VT.CSI['X'] = function(args) {
  this.terminal.eraseToRight(args[0] || 1);
};

/**
 * Cursor Backward Tabulation (CBT).
 */
hterm.VT.CSI['Z'] = function(args) {
  var count = args[0] ? parseInt(args[0], 10) : 1;
  count = hterm.clamp(count, 1, this.terminal.screenSize.width);
  for (var i = 0; i < count; i++) {
    this.terminal.backwardTabStop();
  }
};

/**
 * Character Position Absolute (HPA).
 */
hterm.VT.CSI['`'] = function(args) {
  this.terminal.setCursorColumn(args[0] ? args[0] - 1 : 0);
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
hterm.VT.CSI['c'] = function(args) {
  if (!args[0] || args[0] == '0') {
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
hterm.VT.CSI['>c'] = function(args) {
  this.terminal.io.sendString('\x1b[>0;256;0c');
};

/**
 * Line Position Absolute (VPA).
 */
hterm.VT.CSI['d'] = function(args) {
  this.terminal.setAbsoluteCursorRow(args[0] ? parseInt(args[0], 10) - 1 : 0);
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
hterm.VT.CSI['g'] = function(args) {
  if (!args[0] || args[0] == '0') {
    // Clear tab stop at cursor.
    this.terminal.clearTabStopAtCursor(false);
  } else if (args[0] == '3') {
    // Clear all tab stops.
    this.terminal.clearAllTabStops();
  }
};

/**
 * Set Mode (SM).
 */
hterm.VT.CSI['h'] = function(args) {
  for (var i = 0; i < args.length; i++) {
    this.setANSIMode(args[i], true);
  }
};

/**
 * DEC Private Mode Set (DECSET).
 */
hterm.VT.CSI['?h'] = function(args) {
  for (var i = 0; i < args.length; i++) {
    this.setDECMode(args[i], true);
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
hterm.VT.CSI['l'] = function(args) {
  for (var i = 0; i < args.length; i++) {
    this.setANSIMode(args[i], false);
  }
};

/**
 * DEC Private Mode Reset (DECRST).
 */
hterm.VT.CSI['?l'] = function(args) {
  for (var i = 0; i < args.length; i++) {
    this.setDECMode(args[i], false);
  }
};

/**
 * Character Attributes (SGR).
 *
 * Not currently implemented.
 */
hterm.VT.CSI['m'] = function () {};

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
hterm.VT.CSI['n'] = function(args) {
  if (args[0] == '5') {
    this.terminal.io.sendString('\x1b0n');
  } else if (args[0] == '6') {
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
hterm.VT.CSI['?n'] = function(args) {
  if (args[0] == '6') {
    var row = this.terminal.getCursorRow() + 1;
    var col = this.terminal.getCursorColumn() + 1;
    this.terminal.io.sendString('\x1b[' + row + ';' + col + 'R');
  } else if (args[0] == '15') {
    this.terminal.io.sendString('\x1b[?11n');
  } else if (args[0] == '25') {
    this.terminal.io.sendString('\x1b[?21n');
  } else if (args[0] == '26') {
    this.terminal.io.sendString('\x1b[?12;1;0;0n');
  } else if (args[0] == '53') {
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
hterm.VT.CSI['r'] = function(args) {
  var scrollTop = args[0] ? parseInt(args[0], 10) -1 : null;
  var scrollBottom = args[1] ? parseInt(args[1], 10) - 1 : null;
  this.terminal.setVTScrollRegion(scrollTop, scrollBottom);
  this.terminal.setRelativeCursorPosition(0, 0);
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
  this.terminal.saveOptions();
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
