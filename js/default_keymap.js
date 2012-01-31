// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * The default key map for hterm.
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
hterm.Keyboard.KeyMap.Default = function(keyboard) {
  hterm.Keyboard.KeyMap.apply(this, [keyboard, 'default']);
  this.reset();
};

/**
 * Inherit from hterm.Keyboard.KeyMap, as defined in keyboard.js.
 */
hterm.Keyboard.KeyMap.Default.prototype = {
  __proto__: hterm.Keyboard.KeyMap.prototype
};

/**
 * Set up the default state for this keymap.
 */
hterm.Keyboard.KeyMap.Default.prototype.reset = function() {
  hterm.Keyboard.KeyMap.prototype.reset.apply(this);

  // If not application keypad a, else b.  The keys that care about
  // application keypad ignore it when the key is modified.
  function ak(a, b) {
    return function(e) {
      return (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey ||
              !this.keyboard.applicationKeypad) ? a : b;
    }
  }

  // If mod or not application cursor a, else b.  The keys that care about
  // application cursor ignore it when the key is modified.
  function ac(a, b) {
    return function(e) {
      return (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey ||
              !this.keyboard.applicationCursor) ? a : b;
    }
  }

  // If not backspace-sends-backspace keypad a, else b.
  function bs(a, b) {
    return function(e) {
      return !this.keyboard.backspaceSendsBackspace_ ? a : b
    };
  }

  // If not e.shiftKey a, else b.
  function sh(a, b) {
    return function(e) { return !e.shiftKey ? a : b };
  }

  // If no modifiers a, else b
  function mod(a, b) {
    return function (e) {
      return !(e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) ? a : b;
    }
  }

  // Compute a control character for a given character.
  function ctl(ch) { return String.fromCharCode(ch.charCodeAt(0) - 64) }

  // Call a method on the keymap instance.
  function call(m) { return function (e) { return this[m](e) } }

  var ESC = '\x1b';
  var CSI = '\x1b[';
  var SS3 = '\x1bO';

  var CANCEL = hterm.Keyboard.KeyActions.CANCEL;
  var DEFAULT = hterm.Keyboard.KeyActions.DEFAULT;
  var PASS = hterm.Keyboard.KeyActions.PASS;
  var STRIP = hterm.Keyboard.KeyActions.STRIP;

  this.addKeyDefs(
    // The browser sends the keycode 0 for some keys.  We'll just assume it's
    // going to do the right thing by default for those keys.
    [0,   '[UNKNOWN]', PASS, PASS, PASS],

    // First row.
    [27,  '[ESC]', ESC,                       DEFAULT, DEFAULT],
    [112, '[F1]',  mod(SS3 + 'P', CSI + 'P'), DEFAULT, DEFAULT],
    [113, '[F2]',  mod(SS3 + 'Q', CSI + 'Q'), DEFAULT, DEFAULT],
    [114, '[F3]',  mod(SS3 + 'R', CSI + 'R'), DEFAULT, DEFAULT],
    [115, '[F4]',  mod(SS3 + 'S', CSI + 'S'), DEFAULT, DEFAULT],
    [116, '[F5]',  CSI + '15~',               DEFAULT, DEFAULT],
    [117, '[F6]',  CSI + '17~',               DEFAULT, DEFAULT],
    [118, '[F7]',  CSI + '18~',               DEFAULT, DEFAULT],
    [119, '[F8]',  CSI + '19~',               DEFAULT, DEFAULT],
    [120, '[F9]',  CSI + '20~',               DEFAULT, DEFAULT],
    [121, '[F10]', CSI + '21~',               DEFAULT, DEFAULT],
    [122, '[F11]', CSI + '23~',               DEFAULT, DEFAULT],
    [123, '[F12]', CSI + '24~',               DEFAULT, DEFAULT],

    // Second row.
    [192, '`~',     DEFAULT,          sh(ctl('@'), ctl('^')), DEFAULT],
    [49,  '1!',     DEFAULT,          STRIP,                  PASS],
    [50,  '2@',     DEFAULT,          ctl('@'),               PASS],
    [51,  '3#',     DEFAULT,          ctl('['),               PASS],
    [52,  '4$',     DEFAULT,          ctl('\\'),              PASS],
    [53,  '5%',     DEFAULT,          ctl(']'),               PASS],
    [54,  '6^',     DEFAULT,          ctl('^'),               PASS],
    [55,  '7&',     DEFAULT,          ctl('_'),               PASS],
    [56,  '8*',     DEFAULT,          sh('\x7f', '*'),        PASS],
    [57,  '9(',     DEFAULT,          STRIP,                  PASS],
    [48,  '0)',     DEFAULT,          STRIP,                  PASS],
    [189, '-_',     DEFAULT,          sh(STRIP, ctl('_')),    DEFAULT],
    [187, '=+',     DEFAULT,          STRIP,                  DEFAULT],
    [8,   '[BKSP]', bs('\x7f', '\b'), bs('\b', '\x7f'),       DEFAULT],

    // Third row.
    [9,   '[TAB]', '\t',    STRIP,    DEFAULT],
    [81,  'qQ',    DEFAULT, ctl('Q'), DEFAULT],
    [87,  'wW',    DEFAULT, ctl('W'), DEFAULT],
    [69,  'eE',    DEFAULT, ctl('E'), DEFAULT],
    [82,  'rR',    DEFAULT, ctl('R'), DEFAULT],
    [84,  'tT',    DEFAULT, ctl('T'), DEFAULT],
    [89,  'yY',    DEFAULT, ctl('Y'), DEFAULT],
    [85,  'uU',    DEFAULT, ctl('U'), DEFAULT],
    [73,  'iI',    DEFAULT, ctl('I'), DEFAULT],
    [79,  'oO',    DEFAULT, ctl('O'), DEFAULT],
    [80,  'pP',    DEFAULT, ctl('P'), DEFAULT],
    [219, '[{',    DEFAULT, ctl('['), DEFAULT],
    [221, ']}',    DEFAULT, ctl(']'), DEFAULT],
    [220, '\\|',   DEFAULT, ctl('Q'), DEFAULT],

    // Fourth row.
    [20,  '[CAPS]',  PASS,    PASS,     PASS],
    [65,  'aA',      DEFAULT, ctl('A'), DEFAULT],
    [83,  'sS',      DEFAULT, ctl('S'), DEFAULT],
    [68,  'dD',      DEFAULT, ctl('D'), DEFAULT],
    [70,  'fF',      DEFAULT, ctl('F'), DEFAULT],
    [71,  'gG',      DEFAULT, ctl('G'), DEFAULT],
    [72,  'hH',      DEFAULT, ctl('H'), DEFAULT],
    [74,  'jJ',      DEFAULT, ctl('J'), DEFAULT],
    [75,  'kK',      DEFAULT, ctl('K'), DEFAULT],
    [76,  'lL',      DEFAULT, ctl('L'), DEFAULT],
    [186, ';:',      DEFAULT, STRIP,    DEFAULT],
    [222, '\'"',     DEFAULT, STRIP,    DEFAULT],
    [13,  '[ENTER]', '\r',    CANCEL,   CANCEL],

    // Fifth row.
    [16,  '[SHIFT]', PASS,    PASS,                   PASS],
    [90,  'zZ',      DEFAULT, ctl('Z'),               DEFAULT],
    [88,  'xX',      DEFAULT, ctl('X'),               DEFAULT],
    [67,  'cC',      DEFAULT, ctl('C'),               DEFAULT],
    [86,  'vV',      DEFAULT, ctl('V'),               DEFAULT],
    [66,  'bB',      DEFAULT, ctl('B'),               DEFAULT],
    [78,  'nN',      DEFAULT, ctl('N'),               DEFAULT],
    [77,  'mM',      DEFAULT, ctl('M'),               DEFAULT],
    [188, ',<',      DEFAULT, STRIP,                  DEFAULT],
    [190, '.>',      DEFAULT, STRIP,                  DEFAULT],
    [191, '/?',      DEFAULT, sh(ctl('_'), ctl('?')), DEFAULT],

    // Sixth and final row.
    [17,  '[CTRL]', PASS,    PASS,     PASS],
    [18,  '[ALT]',  PASS,    PASS,     PASS],
    [91,  '[LAPL]', PASS,    PASS,     PASS],
    [32,  '[SPC]',  DEFAULT, ctl('@'), DEFAULT],
    [92,  '[RAPL]', PASS,    PASS,     PASS],

    // These things.
    [42,  '[PRTSCR]', PASS, PASS, PASS],
    [145, '[SCRLK]',  PASS, PASS, PASS],
    [19,  '[BREAK]',  PASS, PASS, PASS],

    // The block of six keys above the arrows.
    [45,  '[INSERT]', CSI + '2~',             DEFAULT, DEFAULT],
    [36,  '[HOME]',   call('onKeyHome_'),     DEFAULT, DEFAULT],
    [33,  '[PGUP]',   call('onKeyPageUp_'),   DEFAULT, DEFAULT],
    [46,  '[DEL]',    CSI + '3~',             DEFAULT, DEFAULT],
    [35,  '[END]',    call('onKeyEnd_'),      DEFAULT, DEFAULT],
    [34,  '[PGDOWN]', call('onKeyPageDown_'), DEFAULT, DEFAULT],

    // Arrow keys.  When unmodified they respect the application cursor state,
    // otherwise they always send the CSI codes.
    [38, '[UP]',    ac(CSI + 'A', SS3 + 'A'), DEFAULT, DEFAULT],
    [40, '[DOWN]',  ac(CSI + 'B', SS3 + 'B'), DEFAULT, DEFAULT],
    [39, '[RIGHT]', ac(CSI + 'C', SS3 + 'C'), DEFAULT, DEFAULT],
    [37, '[LEFT]',  ac(CSI + 'D', SS3 + 'D'), DEFAULT, DEFAULT],

    [144, '[NUMLOCK]', PASS, PASS, PASS],

    // With numlock off, the keypad generates the same key codes as the arrows
    // and 'block of six' for some keys, and null key codes for the rest.

    // Keypad with numlock on generates unique key codes...
    [96,  '[KP0]', ak(DEFAULT, CSI + '2~'), DEFAULT, DEFAULT],
    [97,  '[KP1]', ak(DEFAULT, SS3 + 'F'),  DEFAULT, DEFAULT],
    [98,  '[KP2]', ak(DEFAULT, CSI + 'B'),  DEFAULT, DEFAULT],
    [99,  '[KP3]', ak(DEFAULT, CSI + '6~'), DEFAULT, DEFAULT],
    [100, '[KP4]', ak(DEFAULT, CSI + 'D'),  DEFAULT, DEFAULT],
    [101, '[KP5]', ak(DEFAULT, CSI + 'E'),  DEFAULT, DEFAULT],
    [102, '[KP6]', ak(DEFAULT, CSI + 'C'),  DEFAULT, DEFAULT],
    [103, '[KP7]', ak(DEFAULT, SS3 + 'H'),  DEFAULT, DEFAULT],
    [104, '[KP8]', ak(DEFAULT, CSI + 'A'),  DEFAULT, DEFAULT],
    [105, '[KP9]', ak(DEFAULT, CSI + '5~'), DEFAULT, DEFAULT],
    [107, '[KP+]', ak(DEFAULT, SS3 + 'k'),  DEFAULT, DEFAULT],
    [109, '[KP-]', ak(DEFAULT, SS3 + 'm'),  DEFAULT, DEFAULT],
    [106, '[KP*]', ak(DEFAULT, SS3 + 'j'),  DEFAULT, DEFAULT],
    [111, '[KP/]', ak(DEFAULT, SS3 + 'o'),  DEFAULT, DEFAULT],
    [110, '[KP.]', ak(DEFAULT, CSI + '3~'), DEFAULT, DEFAULT]
  );
};

/**
 * Either scroll the scrollback buffer or send a key sequence.
 */
hterm.Keyboard.KeyMap.Default.prototype.onKeyHome_ = function(e) {
  if (!this.keyboard.homeKeysScroll ^ e.shiftKey) {
    if ((e.altey || e.ctrlKey || e.shiftKey) ||
        !this.keyboard.applicationKeypad) {
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
hterm.Keyboard.KeyMap.Default.prototype.onKeyEnd_ = function(e) {
  if (!this.keyboard.homeKeysScroll ^ e.shiftKey) {
    if ((e.altKey || e.ctrlKey || e.shiftKey) ||
        !this.keyboard.applicationKeypad) {
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
hterm.Keyboard.KeyMap.Default.prototype.onKeyPageUp_ = function(e) {
  if (!this.keyboard.pageKeysScroll ^ e.shiftKey)
    return '\x1b[5~';

  this.keyboard.terminal.scrollPageUp();
  return hterm.Keyboard.KeyActions.CANCEL;
};

/**
 * Either scroll the scrollback buffer or send a key sequence.
 */
hterm.Keyboard.KeyMap.Default.prototype.onKeyPageDown_ = function(e) {
  if (!this.keyboard.pageKeysScroll ^ e.shiftKey)
    return '\x1b[6~';

  this.keyboard.terminal.scrollPageDown();
  return hterm.Keyboard.KeyActions.CANCEL;
};
