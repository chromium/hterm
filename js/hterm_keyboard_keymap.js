// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('hterm.Keyboard.KeyActions');

/**
 * The default key map for hterm.
 *
 * Contains a mapping of keyCodes to keyDefs (aka key definitions).  The key
 * definition tells the hterm.Keyboard class how to handle keycodes.
 *
 * This should work for most cases, as the printable characters get handled
 * in the keypress event.  In that case, even if the keycap is wrong in the
 * key map, the correct character should be sent.
 *
 * Different layouts, such as Dvorak should work with this keymap, as those
 * layouts typically move keycodes around on the keyboard without disturbing
 * the actual keycaps.
 *
 * There may be issues with control keys on non-US keyboards or with keyboards
 * that very significantly from the expectations here, in which case we may
 * have to invent new key maps.
 *
 * The sequences defined in this key map come from [XTERM] as referenced in
 * vt.js, starting with the section titled "Alt and Meta Keys".
 */
hterm.Keyboard.KeyMap = function(keyboard) {
  this.keyboard = keyboard;
  this.keyDefs = {};
  this.reset();
};

/**
 * Add a single key definition.
 *
 * The definition is a hash containing the following keys: 'keyCap', 'normal',
 * 'control', and 'alt'.
 *
 *  - keyCap is a string identifying the key.  For printable
 *    keys, the key cap should be exactly two characters, starting with the
 *    unshifted version.  For example, 'aA', 'bB', '1!' and '=+'.  For
 *    non-printable the key cap should be surrounded in square braces, as in
 *    '[INS]', '[LEFT]'.  By convention, non-printable keycaps are in uppercase
 *    but this is not a strict requirement.
 *
 *  - Normal is the action that should be performed when they key is pressed
 *    in the absence of any modifier.  See below for the supported actions.
 *
 *  - Control is the action that should be performed when they key is pressed
 *    along with the control modifier.  See below for the supported actions.
 *
 *  - Alt is the action that should be performed when they key is pressed
 *    along with the alt modifier.  See below for the supported actions.
 *
 *  - Meta is the action that should be performed when they key is pressed
 *    along with the meta modifier.  See below for the supported actions.
 *
 * Actions can be one of the hterm.Keyboard.KeyActions as documented below,
 * a literal string, or an array.  If the action is a literal string then
 * the string is sent directly to the host.  If the action is an array it
 * is taken to be an escape sequence that may be altered by modifier keys.
 * The second-to-last element of the array will be overwritten with the
 * state of the modifier keys, as specified in the final table of "PC-Style
 * Function Keys" from [XTERM].
 */
hterm.Keyboard.KeyMap.prototype.addKeyDef = function(keyCode, def) {
  if (keyCode in this.keyDefs)
    console.warn('Duplicate keyCode: ' + keyCode);

  this.keyDefs[keyCode] = def;
};

/**
 * Add multiple key definitions in a single call.
 *
 * This function takes the key definitions as variable argument list.  Each
 * argument is the key definition specified as an array.
 *
 * (If the function took everything as one big hash we couldn't detect
 * duplicates, and there would be a lot more typing involved.)
 *
 * Each key definition should have 6 elements: (keyCode, keyCap, normal action,
 * control action, alt action and meta action).  See KeyMap.addKeyDef for the
 * meaning of these elements.
 */
hterm.Keyboard.KeyMap.prototype.addKeyDefs = function(var_args) {
  for (var i = 0; i < arguments.length; i++) {
    this.addKeyDef(arguments[i][0],
                   { keyCap: arguments[i][1],
                     normal: arguments[i][2],
                     control: arguments[i][3],
                     alt: arguments[i][4],
                     meta: arguments[i][5]
                   });
  }
};

/**
 * Set up the default state for this keymap.
 */
hterm.Keyboard.KeyMap.prototype.reset = function() {
  this.keyDefs = {};

  var self = this;

  // This function is used by the "macro" functions below.  It makes it
  // possible to use the call() macro as an argument to any other macro.
  function resolve(action, e, k) {
    if (typeof action == 'function')
      return action.apply(self, [e, k]);

    return action;
  }

  // If not application keypad a, else b.  The keys that care about
  // application keypad ignore it when the key is modified.
  function ak(a, b) {
    return function(e, k) {
      var action = (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey ||
                    !self.keyboard.applicationKeypad) ? a : b;
      return resolve(action, e, k);
    };
  }

  // If mod or not application cursor a, else b.  The keys that care about
  // application cursor ignore it when the key is modified.
  function ac(a, b) {
    return function(e, k) {
      var action = (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey ||
                    !self.keyboard.applicationCursor) ? a : b;
      return resolve(action, e, k);
    };
  }

  // If not backspace-sends-backspace keypad a, else b.
  function bs(a, b) {
    return function(e, k) {
      var action = !self.keyboard.backspaceSendsBackspace ? a : b;
      return resolve(action, e, k);
    };
  }

  // If not e.shiftKey a, else b.
  function sh(a, b) {
    return function(e, k) {
      var action = !e.shiftKey ? a : b;
      e.maskShiftKey = true;
      return resolve(action, e, k);
    };
  }

  // If not e.altKey a, else b.
  function alt(a, b) {
    return function(e, k) {
      var action = !e.altKey ? a : b;
      return resolve(action, e, k);
    };
  }

  // If no modifiers a, else b.
  function mod(a, b) {
    return function(e, k) {
      var action = !(e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) ? a : b;
      return resolve(action, e, k);
    };
  }

  // Compute a control character for a given character.
  function ctl(ch) { return String.fromCharCode(ch.charCodeAt(0) - 64) }

  // Call a method on the keymap instance.
  function c(m) { return function (e, k) { return this[m](e, k) } }

  // Ignore if not trapping media keys.
  function med(fn) {
    return function(e, k) {
      if (!self.keyboard.mediaKeysAreFKeys) {
        // Block Back, Forward, and Reload keys to avoid navigating away from
        // the current page.
        return (e.keyCode == 166 || e.keyCode == 167 || e.keyCode == 168) ?
            hterm.Keyboard.KeyActions.CANCEL :
            hterm.Keyboard.KeyActions.PASS;
      }
      return resolve(fn, e, k);
    };
  }

  var ESC = '\x1b';
  var CSI = '\x1b[';
  var SS3 = '\x1bO';

  var CANCEL = hterm.Keyboard.KeyActions.CANCEL;
  var DEFAULT = hterm.Keyboard.KeyActions.DEFAULT;
  var PASS = hterm.Keyboard.KeyActions.PASS;
  var STRIP = hterm.Keyboard.KeyActions.STRIP;

  this.addKeyDefs(
    // These fields are: [keycode, keycap, normal, control, alt, meta]

    // The browser sends the keycode 0 for some keys.  We'll just assume it's
    // going to do the right thing by default for those keys.
    [0,   '[UNKNOWN]', PASS, PASS, PASS, PASS],

    // First row.
    [27,  '[ESC]', ESC,                       DEFAULT, DEFAULT,     DEFAULT],
    [112, '[F1]',  mod(SS3 + 'P', CSI + 'P'), DEFAULT, CSI + "23~", DEFAULT],
    [113, '[F2]',  mod(SS3 + 'Q', CSI + 'Q'), DEFAULT, CSI + "24~", DEFAULT],
    [114, '[F3]',  mod(SS3 + 'R', CSI + 'R'), DEFAULT, CSI + "25~", DEFAULT],
    [115, '[F4]',  mod(SS3 + 'S', CSI + 'S'), DEFAULT, CSI + "26~", DEFAULT],
    [116, '[F5]',  CSI + '15~',               DEFAULT, CSI + "28~", DEFAULT],
    [117, '[F6]',  CSI + '17~',               DEFAULT, CSI + "29~", DEFAULT],
    [118, '[F7]',  CSI + '18~',               DEFAULT, CSI + "31~", DEFAULT],
    [119, '[F8]',  CSI + '19~',               DEFAULT, CSI + "32~", DEFAULT],
    [120, '[F9]',  CSI + '20~',               DEFAULT, CSI + "33~", DEFAULT],
    [121, '[F10]', CSI + '21~',               DEFAULT, CSI + "34~", DEFAULT],
    [122, '[F11]', CSI + '23~',               DEFAULT, CSI + "42~", DEFAULT],
    [123, '[F12]', CSI + '24~',               DEFAULT, CSI + "43~", DEFAULT],

    // Second row.
    [192, '`~', DEFAULT, sh(ctl('@'), ctl('^')),     DEFAULT,           PASS],
    [49,  '1!', DEFAULT, c('onCtrlNum_'),    c('onAltNum_'), c('onMetaNum_')],
    [50,  '2@', DEFAULT, c('onCtrlNum_'),    c('onAltNum_'), c('onMetaNum_')],
    [51,  '3#', DEFAULT, c('onCtrlNum_'),    c('onAltNum_'), c('onMetaNum_')],
    [52,  '4$', DEFAULT, c('onCtrlNum_'),    c('onAltNum_'), c('onMetaNum_')],
    [53,  '5%', DEFAULT, c('onCtrlNum_'),    c('onAltNum_'), c('onMetaNum_')],
    [54,  '6^', DEFAULT, c('onCtrlNum_'),    c('onAltNum_'), c('onMetaNum_')],
    [55,  '7&', DEFAULT, c('onCtrlNum_'),    c('onAltNum_'), c('onMetaNum_')],
    [56,  '8*', DEFAULT, c('onCtrlNum_'),    c('onAltNum_'), c('onMetaNum_')],
    [57,  '9(', DEFAULT, c('onCtrlNum_'),    c('onAltNum_'), c('onMetaNum_')],
    [48,  '0)', DEFAULT, c('onPlusMinusZero_'),c('onAltNum_'),c('onPlusMinusZero_')],
    [189, '-_', DEFAULT, c('onPlusMinusZero_'), DEFAULT, c('onPlusMinusZero_')],
    [187, '=+', DEFAULT, c('onPlusMinusZero_'), DEFAULT, c('onPlusMinusZero_')],
    // Firefox -_ and =+
    [173, '-_', DEFAULT, c('onPlusMinusZero_'), DEFAULT, c('onPlusMinusZero_')],
    [61, '=+', DEFAULT, c('onPlusMinusZero_'), DEFAULT, c('onPlusMinusZero_')],
    // Firefox Italian +*
    [171, '+*', DEFAULT, c('onPlusMinusZero_'), DEFAULT, c('onPlusMinusZero_')],

    [8,   '[BKSP]', bs('\x7f', '\b'), bs('\b', '\x7f'), DEFAULT,     DEFAULT],

    // Third row.
    [9,   '[TAB]', sh('\t', CSI + 'Z'), STRIP,     PASS,    DEFAULT],
    [81,  'qQ',    DEFAULT,             ctl('Q'),  DEFAULT, DEFAULT],
    [87,  'wW',    DEFAULT,             ctl('W'),  DEFAULT, DEFAULT],
    [69,  'eE',    DEFAULT,             ctl('E'),  DEFAULT, DEFAULT],
    [82,  'rR',    DEFAULT,             ctl('R'),  DEFAULT, DEFAULT],
    [84,  'tT',    DEFAULT,             ctl('T'),  DEFAULT, DEFAULT],
    [89,  'yY',    DEFAULT,             ctl('Y'),  DEFAULT, DEFAULT],
    [85,  'uU',    DEFAULT,             ctl('U'),  DEFAULT, DEFAULT],
    [73,  'iI',    DEFAULT,             ctl('I'),  DEFAULT, DEFAULT],
    [79,  'oO',    DEFAULT,             ctl('O'),  DEFAULT, DEFAULT],
    [80,  'pP',    DEFAULT,             ctl('P'),  DEFAULT, DEFAULT],
    [219, '[{',    DEFAULT,             ctl('['),  DEFAULT, DEFAULT],
    [221, ']}',    DEFAULT,             ctl(']'),  DEFAULT, DEFAULT],
    [220, '\\|',   DEFAULT,             ctl('\\'), DEFAULT, DEFAULT],

    // Fourth row. (We let Ctrl-Shift-J pass for Chrome DevTools.)
    [20,  '[CAPS]',  PASS,    PASS,                           PASS,    DEFAULT],
    [65,  'aA',      DEFAULT, ctl('A'),                       DEFAULT, DEFAULT],
    [83,  'sS',      DEFAULT, ctl('S'),                       DEFAULT, DEFAULT],
    [68,  'dD',      DEFAULT, ctl('D'),                       DEFAULT, DEFAULT],
    [70,  'fF',      DEFAULT, ctl('F'),                       DEFAULT, DEFAULT],
    [71,  'gG',      DEFAULT, ctl('G'),                       DEFAULT, DEFAULT],
    [72,  'hH',      DEFAULT, ctl('H'),                       DEFAULT, DEFAULT],
    [74,  'jJ',      DEFAULT, sh(ctl('J'), PASS),             DEFAULT, DEFAULT],
    [75,  'kK',      DEFAULT, sh(ctl('K'), c('onClear_')),    DEFAULT, DEFAULT],
    [76,  'lL',      DEFAULT, sh(ctl('L'), PASS),             DEFAULT, DEFAULT],
    [186, ';:',      DEFAULT, STRIP,                          DEFAULT, DEFAULT],
    [222, '\'"',     DEFAULT, STRIP,                          DEFAULT, DEFAULT],
    [13,  '[ENTER]', '\r',    CANCEL,                         CANCEL,  DEFAULT],

    // Fifth row.  This includes the copy/paste shortcuts.  On some
    // platforms it's Ctrl-C/V, on others it's Meta-C/V.  We assume either
    // Ctrl-C/Meta-C should pass to the browser when there is a selection,
    // and Ctrl-Shift-V/Meta-*-V should always pass to the browser (since
    // these seem to be recognized as paste too).
    [16,  '[SHIFT]', PASS, PASS,                   PASS,    DEFAULT],
    [90,  'zZ',   DEFAULT, ctl('Z'),               DEFAULT, DEFAULT],
    [88,  'xX',   DEFAULT, ctl('X'),               DEFAULT, DEFAULT],
    [67,  'cC',   DEFAULT, c('onCtrlC_'),          DEFAULT, c('onMetaC_')],
    [86,  'vV',   DEFAULT, c('onCtrlV_'),          DEFAULT, c('onMetaV_')],
    [66,  'bB',   DEFAULT, sh(ctl('B'), PASS),     DEFAULT, sh(DEFAULT, PASS)],
    [78,  'nN',   DEFAULT, c('onCtrlN_'),          DEFAULT, c('onMetaN_')],
    [77,  'mM',   DEFAULT, ctl('M'),               DEFAULT, DEFAULT],
    [188, ',<',   DEFAULT, alt(STRIP, PASS),       DEFAULT, DEFAULT],
    [190, '.>',   DEFAULT, alt(STRIP, PASS),       DEFAULT, DEFAULT],
    [191, '/?',   DEFAULT, sh(ctl('_'), ctl('?')), DEFAULT, DEFAULT],

    // Sixth and final row.
    [17,  '[CTRL]',  PASS,    PASS,     PASS,    PASS],
    [18,  '[ALT]',   PASS,    PASS,     PASS,    PASS],
    [91,  '[LAPL]',  PASS,    PASS,     PASS,    PASS],
    [32,  ' ',       DEFAULT, ctl('@'), DEFAULT, DEFAULT],
    [92,  '[RAPL]',  PASS,    PASS,     PASS,    PASS],
    [93,  '[RMENU]', PASS,    PASS,     PASS,    PASS],

    // These things.
    [42,  '[PRTSCR]', PASS, PASS, PASS, PASS],
    [145, '[SCRLK]',  PASS, PASS, PASS, PASS],
    [19,  '[BREAK]',  PASS, PASS, PASS, PASS],

    // The block of six keys above the arrows.
    [45,  '[INSERT]', c('onKeyInsert_'),   DEFAULT, DEFAULT, DEFAULT],
    [36,  '[HOME]',   c('onKeyHome_'),     DEFAULT, DEFAULT, DEFAULT],
    [33,  '[PGUP]',   c('onKeyPageUp_'),   DEFAULT, DEFAULT, DEFAULT],
    [46,  '[DEL]',    c('onKeyDel_'),      DEFAULT, DEFAULT, DEFAULT],
    [35,  '[END]',    c('onKeyEnd_'),      DEFAULT, DEFAULT, DEFAULT],
    [34,  '[PGDOWN]', c('onKeyPageDown_'), DEFAULT, DEFAULT, DEFAULT],

    // Arrow keys.  When unmodified they respect the application cursor state,
    // otherwise they always send the CSI codes.
    [38, '[UP]',    c('onKeyArrowUp_'), DEFAULT, DEFAULT, DEFAULT],
    [40, '[DOWN]',  c('onKeyArrowDown_'), DEFAULT, DEFAULT, DEFAULT],
    [39, '[RIGHT]', ac(CSI + 'C', SS3 + 'C'), DEFAULT, DEFAULT, DEFAULT],
    [37, '[LEFT]',  ac(CSI + 'D', SS3 + 'D'), DEFAULT, DEFAULT, DEFAULT],

    [144, '[NUMLOCK]', PASS, PASS, PASS, PASS],

    // With numlock off, the keypad generates the same key codes as the arrows
    // and 'block of six' for some keys, and null key codes for the rest.

    // Keypad with numlock on generates unique key codes...
    [96,  '[KP0]', DEFAULT, DEFAULT, DEFAULT, DEFAULT],
    [97,  '[KP1]', DEFAULT, DEFAULT, DEFAULT, DEFAULT],
    [98,  '[KP2]', DEFAULT, DEFAULT, DEFAULT, DEFAULT],
    [99,  '[KP3]', DEFAULT, DEFAULT, DEFAULT, DEFAULT],
    [100, '[KP4]', DEFAULT, DEFAULT, DEFAULT, DEFAULT],
    [101, '[KP5]', DEFAULT, DEFAULT, DEFAULT, DEFAULT],
    [102, '[KP6]', DEFAULT, DEFAULT, DEFAULT, DEFAULT],
    [103, '[KP7]', DEFAULT, DEFAULT, DEFAULT, DEFAULT],
    [104, '[KP8]', DEFAULT, DEFAULT, DEFAULT, DEFAULT],
    [105, '[KP9]', DEFAULT, DEFAULT, DEFAULT, DEFAULT],
    [107, '[KP+]', DEFAULT, c('onPlusMinusZero_'), DEFAULT, c('onPlusMinusZero_')],
    [109, '[KP-]', DEFAULT, c('onPlusMinusZero_'), DEFAULT, c('onPlusMinusZero_')],
    [106, '[KP*]', DEFAULT, DEFAULT, DEFAULT, DEFAULT],
    [111, '[KP/]', DEFAULT, DEFAULT, DEFAULT, DEFAULT],
    [110, '[KP.]', DEFAULT, DEFAULT, DEFAULT, DEFAULT],

    // Chrome OS keyboard top row.
    [166, '[BACK]',   med(mod(SS3+'P', CSI+'P')), DEFAULT, CSI+"23~", DEFAULT],
    [167, '[FWD]',    med(mod(SS3+'Q', CSI+'Q')), DEFAULT, CSI+"24~", DEFAULT],
    [168, '[RELOAD]', med(mod(SS3+'R', CSI+'R')), DEFAULT, CSI+"25~", DEFAULT],
    [183, '[FSCR]',   med(mod(SS3+'S', CSI+'S')), DEFAULT, CSI+"26~", DEFAULT],
    [182, '[WINS]',   med(CSI + '15~'),           DEFAULT, CSI+"28~", DEFAULT],
    [216, '[BRIT-]',  med(CSI + '17~'),           DEFAULT, CSI+"29~", DEFAULT],
    [217, '[BRIT+]',  med(CSI + '18~'),           DEFAULT, CSI+"31~", DEFAULT]

    // 173 [MUTE], 174 [VOL-] and 175 [VOL+] are trapped by the Chrome OS
    // window manager, so we'll never see them. Note that 173 is also
    // Firefox's -_ keycode.
  );
};

/**
 * Either allow the paste or send a key sequence.
 */
hterm.Keyboard.KeyMap.prototype.onKeyInsert_ = function(e) {
  if (this.keyboard.shiftInsertPaste && e.shiftKey)
    return hterm.Keyboard.KeyActions.PASS;

  return '\x1b[2~';
};

/**
 * Either scroll the scrollback buffer or send a key sequence.
 */
hterm.Keyboard.KeyMap.prototype.onKeyHome_ = function(e) {
  if (!this.keyboard.homeKeysScroll ^ e.shiftKey) {
    if ((e.altey || e.ctrlKey || e.shiftKey) ||
        !this.keyboard.applicationCursor) {
      return '\x1b[H';
    }

    return '\x1bOH';
  }

  this.keyboard.terminal.scrollHome();
  return hterm.Keyboard.KeyActions.CANCEL;
};

/**
 * Either scroll the scrollback buffer or send a key sequence.
 */
hterm.Keyboard.KeyMap.prototype.onKeyEnd_ = function(e) {
  if (!this.keyboard.homeKeysScroll ^ e.shiftKey) {
    if ((e.altKey || e.ctrlKey || e.shiftKey) ||
        !this.keyboard.applicationCursor) {
      return '\x1b[F';
    }

    return '\x1bOF';
  }

  this.keyboard.terminal.scrollEnd();
  return hterm.Keyboard.KeyActions.CANCEL;
};

/**
 * Either scroll the scrollback buffer or send a key sequence.
 */
hterm.Keyboard.KeyMap.prototype.onKeyPageUp_ = function(e) {
  if (!this.keyboard.pageKeysScroll ^ e.shiftKey)
    return '\x1b[5~';

  this.keyboard.terminal.scrollPageUp();
  return hterm.Keyboard.KeyActions.CANCEL;
};

/**
 * Either send a true DEL, or sub in meta-backspace.
 *
 * On Chrome OS, if we know the alt key is down, but we get a DEL event that
 * claims that the alt key is not pressed, we know the DEL was a synthetic
 * one from a user that hit alt-backspace. Based on a user pref, we can sub
 * in meta-backspace in this case.
 */
hterm.Keyboard.KeyMap.prototype.onKeyDel_ = function(e) {
  if (this.keyboard.altBackspaceIsMetaBackspace &&
      this.keyboard.altKeyPressed && !e.altKey)
    return '\x1b\x7f';
  return '\x1b[3~';
};

/**
 * Either scroll the scrollback buffer or send a key sequence.
 */
hterm.Keyboard.KeyMap.prototype.onKeyPageDown_ = function(e) {
  if (!this.keyboard.pageKeysScroll ^ e.shiftKey)
    return '\x1b[6~';

  this.keyboard.terminal.scrollPageDown();
  return hterm.Keyboard.KeyActions.CANCEL;
};

/**
 * Either scroll the scrollback buffer or send a key sequence.
 */
hterm.Keyboard.KeyMap.prototype.onKeyArrowUp_ = function(e) {
  if (!this.keyboard.applicationCursor && e.shiftKey) {
    this.keyboard.terminal.scrollLineUp();
    return hterm.Keyboard.KeyActions.CANCEL;
  }

  return (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey ||
          !this.keyboard.applicationCursor) ? '\x1b[A' : '\x1bOA';
};

/**
 * Either scroll the scrollback buffer or send a key sequence.
 */
hterm.Keyboard.KeyMap.prototype.onKeyArrowDown_ = function(e) {
  if (!this.keyboard.applicationCursor && e.shiftKey) {
    this.keyboard.terminal.scrollLineDown();
    return hterm.Keyboard.KeyActions.CANCEL;
  }

  return (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey ||
          !this.keyboard.applicationCursor) ? '\x1b[B' : '\x1bOB';
};

/**
 * Clear the primary/alternate screens and the scrollback buffer.
 */
hterm.Keyboard.KeyMap.prototype.onClear_ = function(e, keyDef) {
  this.keyboard.terminal.wipeContents();
  return hterm.Keyboard.KeyActions.CANCEL;
};

/**
 * Either pass Ctrl-1..9 to the browser or send them to the host.
 *
 * Note that Ctrl-1 and Ctrl-9 don't actually have special sequences mapped
 * to them in xterm or gnome-terminal.  The range is really Ctrl-2..8, but
 * we handle 1..9 since Chrome treats the whole range special.
 */
hterm.Keyboard.KeyMap.prototype.onCtrlNum_ = function(e, keyDef) {
  // Compute a control character for a given character.
  function ctl(ch) { return String.fromCharCode(ch.charCodeAt(0) - 64) }

  if (this.keyboard.terminal.passCtrlNumber && !e.shiftKey)
    return hterm.Keyboard.KeyActions.PASS;

  switch (keyDef.keyCap.substr(0, 1)) {
    case '1': return '1';
    case '2': return ctl('@');
    case '3': return ctl('[');
    case '4': return ctl('\\');
    case '5': return ctl(']');
    case '6': return ctl('^');
    case '7': return ctl('_');
    case '8': return '\x7f';
    case '9': return '9';
  }
};

/**
 * Either pass Alt-1..9 to the browser or send them to the host.
 */
hterm.Keyboard.KeyMap.prototype.onAltNum_ = function(e, keyDef) {
  if (this.keyboard.terminal.passAltNumber && !e.shiftKey)
    return hterm.Keyboard.KeyActions.PASS;

  return hterm.Keyboard.KeyActions.DEFAULT;
};

/**
 * Either pass Meta-1..9 to the browser or send them to the host.
 */
hterm.Keyboard.KeyMap.prototype.onMetaNum_ = function(e, keyDef) {
  if (this.keyboard.terminal.passMetaNumber && !e.shiftKey)
    return hterm.Keyboard.KeyActions.PASS;

  return hterm.Keyboard.KeyActions.DEFAULT;
};

/**
 * Either send a ^C or interpret the keystroke as a copy command.
 */
hterm.Keyboard.KeyMap.prototype.onCtrlC_ = function(e, keyDef) {
  var selection = this.keyboard.terminal.getDocument().getSelection();

  if (!selection.isCollapsed) {
    if (this.keyboard.ctrlCCopy && !e.shiftKey) {
      // Ctrl-C should copy if there is a selection, send ^C otherwise.
      // Perform the copy by letting the browser handle Ctrl-C.  On most
      // browsers, this is the *only* way to place text on the clipboard from
      // the 'drive-by' web.
      if (this.keyboard.terminal.clearSelectionAfterCopy) {
        setTimeout(selection.collapseToEnd.bind(selection), 50);
      }
      return hterm.Keyboard.KeyActions.PASS;
    }

    if (!this.keyboard.ctrlCCopy && e.shiftKey) {
      // Ctrl-Shift-C should copy if there is a selection, send ^C otherwise.
      // Perform the copy manually.  This only works in situations where
      // document.execCommand('copy') is allowed.
      if (this.keyboard.terminal.clearSelectionAfterCopy) {
        setTimeout(selection.collapseToEnd.bind(selection), 50);
      }
      this.keyboard.terminal.copySelectionToClipboard();
      return hterm.Keyboard.KeyActions.CANCEL;
    }
  }

  return '\x03';
};

/**
 * Either send a ^N or open a new window to the same location.
 */
hterm.Keyboard.KeyMap.prototype.onCtrlN_ = function(e, keyDef) {
  if (e.shiftKey) {
    window.open(document.location.href, '',
                'chrome=no,close=yes,resize=yes,scrollbars=yes,' +
                'minimizable=yes,width=' + window.innerWidth +
                ',height=' + window.innerHeight);
    return hterm.Keyboard.KeyActions.CANCEL;
  }

  return '\x0e';
};

/**
 * Either send a ^V or issue a paste command.
 *
 * The default behavior is to paste if the user presses Ctrl-Shift-V, and send
 * a ^V if the user presses Ctrl-V. This can be flipped with the
 * 'ctrl-v-paste' preference.
 *
 */
hterm.Keyboard.KeyMap.prototype.onCtrlV_ = function(e, keyDef) {
  if ((!e.shiftKey && this.keyboard.ctrlVPaste) ||
      (e.shiftKey && !this.keyboard.ctrlVPaste)) {
    // We try to do the pasting ourselves as not all browsers/OSs bind Ctrl-V to
    // pasting.  Notably, on macOS, Ctrl-V/Ctrl-Shift-V do nothing.
    // However, this might run into web restrictions, so if it fails, we still
    // fallback to the letting the native behavior (hopefully) save us.
    if (this.keyboard.terminal.paste())
      return hterm.Keyboard.KeyActions.CANCEL;
    else
      return hterm.Keyboard.KeyActions.PASS;
  }

  return '\x16';
};

/**
 * Either the default action or open a new window to the same location.
 */
hterm.Keyboard.KeyMap.prototype.onMetaN_ = function(e, keyDef) {
  if (e.shiftKey) {
    window.open(document.location.href, '',
                'chrome=no,close=yes,resize=yes,scrollbars=yes,' +
                'minimizable=yes,width=' + window.outerWidth +
                ',height=' + window.outerHeight);
    return hterm.Keyboard.KeyActions.CANCEL;
  }

  return hterm.Keyboard.KeyActions.DEFAULT;
};

/**
 * Either send a Meta-C or allow the browser to interpret the keystroke as a
 * copy command.
 *
 * If there is no selection, or if the user presses Meta-Shift-C, then we'll
 * transmit an '\x1b' (if metaSendsEscape is on) followed by 'c' or 'C'.
 *
 * If there is a selection, we defer to the browser.  In this case we clear out
 * the selection so the user knows we heard them, and also to give them a
 * chance to send a Meta-C by just hitting the key again.
 */
hterm.Keyboard.KeyMap.prototype.onMetaC_ = function(e, keyDef) {
  var document = this.keyboard.terminal.getDocument();
  if (e.shiftKey || document.getSelection().isCollapsed) {
    // If the shift key is being held, or there is no document selection, send
    // a Meta-C.  The keyboard code will add the ESC if metaSendsEscape is true,
    // we just have to decide between 'c' and 'C'.
    return keyDef.keyCap.substr(e.shiftKey ? 1 : 0, 1);
  }

  // Otherwise let the browser handle it as a copy command.
  if (this.keyboard.terminal.clearSelectionAfterCopy) {
    setTimeout(function() { document.getSelection().collapseToEnd() }, 50);
  }
  return hterm.Keyboard.KeyActions.PASS;
};

/**
 * Either PASS or DEFAULT Meta-V, depending on preference.
 *
 * Always PASS Meta-Shift-V to allow browser to interpret the keystroke as
 * a paste command.
 */
hterm.Keyboard.KeyMap.prototype.onMetaV_ = function(e, keyDef) {
  if (e.shiftKey)
    return hterm.Keyboard.KeyActions.PASS;

  return this.keyboard.passMetaV ?
      hterm.Keyboard.KeyActions.PASS :
      hterm.Keyboard.KeyActions.DEFAULT;
};

/**
 * Handle font zooming.
 *
 * The browser's built-in zoom has a bit of an issue at certain zoom levels.
 * At some magnifications, the measured height of a row of text differs from
 * the height that was explicitly set.
 *
 * We override the browser zoom keys to change the ScrollPort's font size to
 * avoid the issue.
 */
hterm.Keyboard.KeyMap.prototype.onPlusMinusZero_ = function(e, keyDef) {
  if (!(this.keyboard.ctrlPlusMinusZeroZoom ^ e.shiftKey)) {
    // If ctrl-PMZ controls zoom and the shift key is pressed, or
    // ctrl-shift-PMZ controls zoom and this shift key is not pressed,
    // then we want to send the control code instead of affecting zoom.
    if (keyDef.keyCap == '-_')
      return '\x1f';  // ^_

    // Only ^_ is valid, the other sequences have no meaning.
    return hterm.Keyboard.KeyActions.CANCEL;
  }

  if (this.keyboard.terminal.getZoomFactor() != 1) {
    // If we're not at 1:1 zoom factor, let the Ctrl +/-/0 keys control the
    // browser zoom, so it's easier to for the user to get back to 100%.
    return hterm.Keyboard.KeyActions.PASS;
  }

  var cap = keyDef.keyCap.substr(0, 1);
  if (cap == '0') {
      this.keyboard.terminal.setFontSize(0);
  } else {
    var size = this.keyboard.terminal.getFontSize();

    if (cap == '-' || keyDef.keyCap == '[KP-]') {
      size -= 1;
    } else {
      size += 1;
    }

    this.keyboard.terminal.setFontSize(size);
  }

  return hterm.Keyboard.KeyActions.CANCEL;
};
