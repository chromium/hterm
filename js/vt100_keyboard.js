// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * VT Keyboard handler.
 *
 * Consumes onKey* events and invokes onVTKeystroke on the associated
 * hterm.Terminal object.
 *
 * This class mostly a copy of the keyboard handling code from Cory Maccarrone's
 * Terminal class.
 *
 * @param {hterm.VT100} The VT100 object associated with this keyboard object.
 */
hterm.VT100.Keyboard = function(vt) {
  // The parent vt interpreter.
  this.vt_ = vt;

  // The element we're currently capturing keyboard events for.
  this.keyboardElement_ = null;

  // The event handlers we are interested in, and their bound callbacks.
  this.handlers_ = [
      ['keypress', this.onKeyPress_.bind(this)],
      ['keyup', this.onKeyUp_.bind(this)],
      ['keydown', this.onKeyDown_.bind(this)]
  ];

  // If true, home/end will control the terminal scrollbar and shift home/end
  // will send the VT keycodes.  If false then home/end sends VT codes and
  // shift home/end scrolls.
  this.homeKeysScroll_ = false;

  // Same as above, except for page up/page down.
  this.pageKeysScroll_ = false;
};

/**
 * Mnemonic values for keycodes, copied from Closure.
 */
hterm.VT100.Keyboard.keyCodes = {
  MAC_ENTER: 3,
  BACKSPACE: 8,
  TAB: 9,
  NUM_CENTER: 12,
  ENTER: 13,
  SHIFT: 16,
  CTRL: 17,
  ALT: 18,
  PAUSE: 19,
  CAPS_LOCK: 20,
  ESC: 27,
  SPACE: 32,
  PAGE_UP: 33,     // also NUM_NORTH_EAST
  PAGE_DOWN: 34,   // also NUM_SOUTH_EAST
  END: 35,         // also NUM_SOUTH_WEST
  HOME: 36,        // also NUM_NORTH_WEST
  LEFT: 37,        // also NUM_WEST
  UP: 38,          // also NUM_NORTH
  RIGHT: 39,       // also NUM_EAST
  DOWN: 40,        // also NUM_SOUTH
  PRINT_SCREEN: 44,
  INSERT: 45,      // also NUM_INSERT
  DELETE: 46,      // also NUM_DELETE
  ZERO: 48,
  ONE: 49,
  TWO: 50,
  THREE: 51,
  FOUR: 52,
  FIVE: 53,
  SIX: 54,
  SEVEN: 55,
  EIGHT: 56,
  NINE: 57,
  QUESTION_MARK: 63, // needs localization
  A: 65,
  B: 66,
  C: 67,
  D: 68,
  E: 69,
  F: 70,
  G: 71,
  H: 72,
  I: 73,
  J: 74,
  K: 75,
  L: 76,
  M: 77,
  N: 78,
  O: 79,
  P: 80,
  Q: 81,
  R: 82,
  S: 83,
  T: 84,
  U: 85,
  V: 86,
  W: 87,
  X: 88,
  Y: 89,
  Z: 90,
  META: 91,
  CONTEXT_MENU: 93,
  NUM_ZERO: 96,
  NUM_ONE: 97,
  NUM_TWO: 98,
  NUM_THREE: 99,
  NUM_FOUR: 100,
  NUM_FIVE: 101,
  NUM_SIX: 102,
  NUM_SEVEN: 103,
  NUM_EIGHT: 104,
  NUM_NINE: 105,
  NUM_MULTIPLY: 106,
  NUM_PLUS: 107,
  NUM_MINUS: 109,
  NUM_PERIOD: 110,
  NUM_DIVISION: 111,
  F1: 112,
  F2: 113,
  F3: 114,
  F4: 115,
  F5: 116,
  F6: 117,
  F7: 118,
  F8: 119,
  F9: 120,
  F10: 121,
  F11: 122,
  F12: 123,
  NUMLOCK: 144,
  SEMICOLON: 186,            // needs localization
  DASH: 189,                 // needs localization
  EQUALS: 187,               // needs localization
  COMMA: 188,                // needs localization
  PERIOD: 190,               // needs localization
  SLASH: 191,                // needs localization
  APOSTROPHE: 192,           // needs localization
  SINGLE_QUOTE: 222,         // needs localization
  OPEN_SQUARE_BRACKET: 219,  // needs localization
  BACKSLASH: 220,            // needs localization
  CLOSE_SQUARE_BRACKET: 221, // needs localization
  WIN_KEY: 224,
  MAC_FF_META: 224, // Firefox (Gecko) fires this for the meta key instead of 91
  WIN_IME: 229
};

/**
 * Capture onKeyUp, onKeyDown and onKeyPress events sent to the associated
 * element.
 *
 * This enables the keyboard.  Captured events are consumed by this class
 * and will not perform their default action or bubble to other elements.
 *
 * To disable the keyboard capture, pass a null element.
 *
 * @param {HTMLElement} element The element whose events should be captured, or
 *     null to disable the keyboard.
 */
hterm.VT100.Keyboard.prototype.installKeyboard = function(element) {
  if (element == this.keyboardElement_)
    return;

  if (this.keyboardElement_)
    this.installKeyboard(null);

  for (var i = 0; i < this.handlers_.length; i++) {
    var handler = this.handlers_[i];
    if (element) {
      element.addEventListener(handler[0], handler[1]);
    } else {
      this.keyboardElement_.removeEventListener(handler[0], handler[1]);
    }
  }

  this.keyboardElement_ = element;
};

/**
 * Handle onKeyPress events.
 */
hterm.VT100.Keyboard.prototype.onKeyPress_ = function(e) {
  this.vt_.terminal.onVTKeystroke(String.fromCharCode(e.keyCode));
  e.stopPropagation();
  e.preventDefault();
};

/**
 * Handle onKeyUp events.
 */
hterm.VT100.Keyboard.prototype.onKeyUp_ = function(e) {
};

/**
 * Handle onKeyDown events.
 */
hterm.VT100.Keyboard.prototype.onKeyDown_ = function(e) {
  var esc = '\x1b';
  var sendString = '';

  var keyCodes = hterm.VT100.Keyboard.keyCodes;

  switch (e.keyCode) {
    case keyCodes.CTRL:
      break;

    case keyCodes.SHIFT:
    case keyCodes.ALT:
      // Pass SHIFT and ALT through, they don't mean anything alone.
      break;

    case keyCodes.UP:
    case keyCodes.DOWN:
    case keyCodes.LEFT:
    case keyCodes.RIGHT:
      if (this.vt_.applicationCursor) {
        sendString = esc + 'O';
      } else {
        sendString = esc + '[';
      }
      switch (e.keyCode) {
        case keyCodes.UP:
          sendString += 'A';
          break;
        case keyCodes.DOWN:
          sendString += 'B';
          break;
        case keyCodes.RIGHT:
          sendString += 'C';
          break;
        case keyCodes.LEFT:
          sendString += 'D';
          break;
      }
      break;

    case keyCodes.TAB:
    case keyCodes.ESC:
      // These keys are sent as given.
      sendString = String.fromCharCode(e.keyCode);
      break;

    case keyCodes.F1:
    case keyCodes.F2:
    case keyCodes.F3:
    case keyCodes.F4:
      sendString = esc + 'O' + String.fromCharCode(e.keyCode - 32);
      break;

    case keyCodes.F5:
      sendString = esc + '[15~';
      break;

    case keyCodes.F6:
      sendString = esc + '[17~';
      break;

    case keyCodes.F7:
      sendString = esc + '[18~';
      break;

    case keyCodes.F8:
      sendString = esc + '[19~';
      break;

    case keyCodes.F9:
      sendString = esc + '[20~';
      break;

    case keyCodes.F10:
      sendString = esc + '[21~';
      break;

    case keyCodes.F11:
      sendString = esc + '[23~';
      break;

    case keyCodes.F12:
      sendString = esc + '[24~';
      break;

    case keyCodes.ENTER:
      sendString = String.fromCharCode(10);
      break;

    case keyCodes.PAGE_DOWN:
      if (this.pageKeysScroll_ ? !e.shiftKey : e.shiftKey) {
        this.vt_.terminal.scrollPageDown();
        e.stopPropagation();
        e.preventDefault();
        return;
      }

      sendString = esc + '[6~';
      break;

    case keyCodes.PAGE_UP:
      if (this.pageKeysScroll_ ? !e.shiftKey : e.shiftKey) {
        e.stopPropagation();
        e.preventDefault();
        this.vt_.terminal.scrollPageUp();
        return;
      }

      sendString = esc + '[5~';
      break;

    case keyCodes.HOME:
      if (this.homeKeysScroll_ ? !e.shiftKey : e.shiftKey) {
        this.vt_.terminal.scrollHome();
        e.stopPropagation();
        e.preventDefault();
        return;
      }

      if (this.vt_.applicationCursor) {
        sendString = esc + '[H';
      } else {
        sendString = esc + 'OH';
      }
      break;

    case keyCodes.END:
      if (this.homeKeysScroll_ ? !e.shiftKey : e.shiftKey) {
        this.vt_.terminal.scrollEnd();
        e.stopPropagation();
        e.preventDefault();
        return;
      }

      if (this.vt_.applicationCursor) {
        sendString = esc + '[F';
      } else {
        sendString = esc + 'OF';
      }
      break;

    case keyCodes.BACKSPACE:
      if (this.vt_.backspaceSendsBackspace) {
        sendString = String.fromCharCode(8);
      } else {
        sendString = String.fromCharCode(127);
      }
      break;

    default:
      // Handle if the ALT/META key is pressed.  We send either an ESC prior to
      // the character, or shift it up 128 (depending on l/h code 1036 and
      // 1039).
      var addEscape = false;
      var shift = false;
      if (e.altKey) {
        if (this.vt_.altSendsEscape) {
          addEscape = true;
        } else {
          shift = true;
        }
      }

      if (e.metaKey) {
        if (this.vt_.metaSendsEscape) {
          addEscape = true;
        } else {
          shift = true;
        }
      }

      if (addEscape) {
        sendString = esc;
      }

      // If this key was hit with CTRL down, it'll only be sent here.
      if (e.ctrlKey) {
        var sendCode = e.keyCode;

        if (sendCode >= 65 && sendCode <= 95) {
          sendCode -= 64;
        } else if (sendCode >= 97 && sendCode <= 122) {
          sendCode -= 96;
        }

        if (shift)
          sendCode += 128;

        sendString += String.fromCharCode(sendCode);
      }
      break;
  }

  if (sendString.length > 0) {
    this.vt_.terminal.onVTKeystroke(sendString);
    e.stopPropagation();
    e.preventDefault();
  }
};
