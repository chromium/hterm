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

  var self = this;

  // This function us used by the "macro" functions below.  It makes it
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
                    !this.keyboard.applicationKeypad) ? a : b;
      return resolve(action, e, k);
    }
  }

  // If mod or not application cursor a, else b.  The keys that care about
  // application cursor ignore it when the key is modified.
  function ac(a, b) {
    return function(e, k) {
      var action = (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey ||
                    !this.keyboard.applicationCursor) ? a : b;
      return resolve(action, e, k);
    }
  }

  // If not backspace-sends-backspace keypad a, else b.
  function bs(a, b) {
    return function(e, k) {
      var action = !this.keyboard.backspaceSendsBackspace_ ? a : b
      return resolve(action, e, k);
    }
  }

  // If not e.shiftKey a, else b.
  function sh(a, b) {
    return function(e, k) {
      var action = !e.shiftKey ? a : b
      return resolve(action, e, k);
    }
  }

  // If no modifiers a, else b.
  function mod(a, b) {
    return function (e, k) {
      var action = !(e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) ? a : b;
      return resolve(action, e, k);
    }
  }

  // Compute a control character for a given character.
  function ctl(ch) { return String.fromCharCode(ch.charCodeAt(0) - 64) }

  // Call a method on the keymap instance.
  function call(m) { return function (e, k) { return this[m](e, k) } }

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
    [0,   '[UNKNOWN]', PASS, PASS, PASS, PASS],

    // First row.
    [27,  '[ESC]', ESC,                       DEFAULT, DEFAULT, DEFAULT],
    [112, '[F1]',  mod(SS3 + 'P', CSI + 'P'), DEFAULT, DEFAULT, DEFAULT],
    [113, '[F2]',  mod(SS3 + 'Q', CSI + 'Q'), DEFAULT, DEFAULT, DEFAULT],
    [114, '[F3]',  mod(SS3 + 'R', CSI + 'R'), DEFAULT, DEFAULT, DEFAULT],
    [115, '[F4]',  mod(SS3 + 'S', CSI + 'S'), DEFAULT, DEFAULT, DEFAULT],
    [116, '[F5]',  CSI + '15~',               DEFAULT, DEFAULT, DEFAULT],
    [117, '[F6]',  CSI + '17~',               DEFAULT, DEFAULT, DEFAULT],
    [118, '[F7]',  CSI + '18~',               DEFAULT, DEFAULT, DEFAULT],
    [119, '[F8]',  CSI + '19~',               DEFAULT, DEFAULT, DEFAULT],
    [120, '[F9]',  CSI + '20~',               DEFAULT, DEFAULT, DEFAULT],
    [121, '[F10]', CSI + '21~',               DEFAULT, DEFAULT, DEFAULT],
    [122, '[F11]', CSI + '23~',               DEFAULT, DEFAULT, DEFAULT],
    [123, '[F12]', CSI + '24~',               DEFAULT, DEFAULT, DEFAULT],

    // Second row.
    [192, '`~',     DEFAULT, sh(ctl('@'), ctl('^')),        DEFAULT, DEFAULT],
    [49,  '1!',     DEFAULT, sh(PASS, STRIP),               PASS,    PASS],
    [50,  '2@',     DEFAULT, sh(PASS, ctl('@')),            PASS,    PASS],
    [51,  '3#',     DEFAULT, sh(PASS, ctl('[')),            PASS,    PASS],
    [52,  '4$',     DEFAULT, sh(PASS, ctl('\\')),           PASS,    PASS],
    [53,  '5%',     DEFAULT, sh(PASS, ctl(']')),            PASS,    PASS],
    [54,  '6^',     DEFAULT, sh(PASS, ctl('^')),            PASS,    PASS],
    [55,  '7&',     DEFAULT, sh(PASS, ctl('_')),            PASS,    PASS],
    [56,  '8*',     DEFAULT, sh(PASS, '*'),                 PASS,    PASS],
    [57,  '9(',     DEFAULT, sh(PASS, STRIP),               PASS,    PASS],
    [48,  '0)',     DEFAULT, call('onZoom_'),               PASS,    DEFAULT],
    [189, '-_',     DEFAULT, sh(call('onZoom_'), ctl('_')), DEFAULT, DEFAULT],
    [187, '=+',     DEFAULT, call('onZoom_'),               DEFAULT, DEFAULT],
    [8,   '[BKSP]', bs('\x7f', '\b'), bs('\b', '\x7f'),     DEFAULT, DEFAULT],

    // Third row.
    [9,   '[TAB]', '\t',    STRIP,    DEFAULT, DEFAULT],
    [81,  'qQ',    DEFAULT, ctl('Q'), DEFAULT, DEFAULT],
    [87,  'wW',    DEFAULT, ctl('W'), DEFAULT, DEFAULT],
    [69,  'eE',    DEFAULT, ctl('E'), DEFAULT, DEFAULT],
    [82,  'rR',    DEFAULT, ctl('R'), DEFAULT, DEFAULT],
    [84,  'tT',    DEFAULT, ctl('T'), DEFAULT, DEFAULT],
    [89,  'yY',    DEFAULT, ctl('Y'), DEFAULT, DEFAULT],
    [85,  'uU',    DEFAULT, ctl('U'), DEFAULT, DEFAULT],
    [73,  'iI',    DEFAULT, ctl('I'), DEFAULT, DEFAULT],
    [79,  'oO',    DEFAULT, ctl('O'), DEFAULT, DEFAULT],
    [80,  'pP',    DEFAULT, ctl('P'), DEFAULT, DEFAULT],
    [219, '[{',    DEFAULT, ctl('['), DEFAULT, DEFAULT],
    [221, ']}',    DEFAULT, ctl(']'), DEFAULT, DEFAULT],
    [220, '\\|',   DEFAULT, ctl('Q'), DEFAULT, DEFAULT],

    // Fourth row. (We let Ctrl-Shift-J pass for Chrome DevTools.)
    [20,  '[CAPS]',  PASS,    PASS,               PASS,    DEFAULT],
    [65,  'aA',      DEFAULT, ctl('A'),           DEFAULT, DEFAULT],
    [83,  'sS',      DEFAULT, ctl('S'),           DEFAULT, DEFAULT],
    [68,  'dD',      DEFAULT, ctl('D'),           DEFAULT, DEFAULT],
    [70,  'fF',      DEFAULT, ctl('F'),           DEFAULT, DEFAULT],
    [71,  'gG',      DEFAULT, ctl('G'),           DEFAULT, DEFAULT],
    [72,  'hH',      DEFAULT, ctl('H'),           DEFAULT, DEFAULT],
    [74,  'jJ',      DEFAULT, sh(ctl('J'), PASS), DEFAULT, DEFAULT],
    [75,  'kK',      DEFAULT, ctl('K'),           DEFAULT, DEFAULT],
    [76,  'lL',      DEFAULT, ctl('L'),           DEFAULT, DEFAULT],
    [186, ';:',      DEFAULT, STRIP,              DEFAULT, DEFAULT],
    [222, '\'"',     DEFAULT, STRIP,              DEFAULT, DEFAULT],
    [13,  '[ENTER]', '\r',    CANCEL,             CANCEL,  DEFAULT],

    // Fifth row.  This includes the copy/paste shortcuts.  On some
    // platforms it's Ctrl-C/V, on others it's Meta-C/V.  We assume either
    // Ctrl-C/Meta-C should pass to the browser when there is a selection,
    // and Ctrl-Shift-V/Meta-*-V should always pass to the browser (since
    // these seem to be recognized as paste too).
    [16,  '[SHIFT]', PASS, PASS,                   PASS,    DEFAULT],
    [90,  'zZ',   DEFAULT, ctl('Z'),               DEFAULT, DEFAULT],
    [88,  'xX',   DEFAULT, ctl('X'),               DEFAULT, DEFAULT],
    [67,  'cC',   DEFAULT, call('onCtrlC_'),       DEFAULT, call('onMetaC_')],
    [86,  'vV',   DEFAULT, sh(ctl('V'), PASS),     DEFAULT, PASS],
    [66,  'bB',   DEFAULT, sh(ctl('B'), PASS),     DEFAULT, sh(DEFAULT, PASS)],
    [78,  'nN',   DEFAULT, ctl('N'),               DEFAULT, DEFAULT],
    [77,  'mM',   DEFAULT, ctl('M'),               DEFAULT, DEFAULT],
    [188, ',<',   DEFAULT, STRIP,                  DEFAULT, DEFAULT],
    [190, '.>',   DEFAULT, STRIP,                  DEFAULT, DEFAULT],
    [191, '/?',   DEFAULT, sh(ctl('_'), ctl('?')), DEFAULT, DEFAULT],

    // Sixth and final row.
    [17,  '[CTRL]', PASS,    PASS,     PASS,    PASS],
    [18,  '[ALT]',  PASS,    PASS,     PASS,    PASS],
    [91,  '[LAPL]', PASS,    PASS,     PASS,    PASS],
    [32,  '[SPC]',  DEFAULT, ctl('@'), DEFAULT, DEFAULT],
    [92,  '[RAPL]', PASS,    PASS,     PASS,    PASS],

    // These things.
    [42,  '[PRTSCR]', PASS, PASS, PASS, PASS],
    [145, '[SCRLK]',  PASS, PASS, PASS, PASS],
    [19,  '[BREAK]',  PASS, PASS, PASS, PASS],

    // The block of six keys above the arrows.
    [45,  '[INSERT]', CSI + '2~',             DEFAULT, DEFAULT, DEFAULT],
    [36,  '[HOME]',   call('onKeyHome_'),     DEFAULT, DEFAULT, DEFAULT],
    [33,  '[PGUP]',   call('onKeyPageUp_'),   DEFAULT, DEFAULT, DEFAULT],
    [46,  '[DEL]',    CSI + '3~',             DEFAULT, DEFAULT, DEFAULT],
    [35,  '[END]',    call('onKeyEnd_'),      DEFAULT, DEFAULT, DEFAULT],
    [34,  '[PGDOWN]', call('onKeyPageDown_'), DEFAULT, DEFAULT, DEFAULT],

    // Arrow keys.  When unmodified they respect the application cursor state,
    // otherwise they always send the CSI codes.
    [38, '[UP]',    ac(CSI + 'A', SS3 + 'A'), DEFAULT, DEFAULT, DEFAULT],
    [40, '[DOWN]',  ac(CSI + 'B', SS3 + 'B'), DEFAULT, DEFAULT, DEFAULT],
    [39, '[RIGHT]', ac(CSI + 'C', SS3 + 'C'), DEFAULT, DEFAULT, DEFAULT],
    [37, '[LEFT]',  ac(CSI + 'D', SS3 + 'D'), DEFAULT, DEFAULT, DEFAULT],

    [144, '[NUMLOCK]', PASS, PASS, PASS, PASS],

    // With numlock off, the keypad generates the same key codes as the arrows
    // and 'block of six' for some keys, and null key codes for the rest.

    // Keypad with numlock on generates unique key codes...
    [96,  '[KP0]', ak(DEFAULT, CSI + '2~'), DEFAULT, DEFAULT, DEFAULT],
    [97,  '[KP1]', ak(DEFAULT, SS3 + 'F'),  DEFAULT, DEFAULT, DEFAULT],
    [98,  '[KP2]', ak(DEFAULT, CSI + 'B'),  DEFAULT, DEFAULT, DEFAULT],
    [99,  '[KP3]', ak(DEFAULT, CSI + '6~'), DEFAULT, DEFAULT, DEFAULT],
    [100, '[KP4]', ak(DEFAULT, CSI + 'D'),  DEFAULT, DEFAULT, DEFAULT],
    [101, '[KP5]', ak(DEFAULT, CSI + 'E'),  DEFAULT, DEFAULT, DEFAULT],
    [102, '[KP6]', ak(DEFAULT, CSI + 'C'),  DEFAULT, DEFAULT, DEFAULT],
    [103, '[KP7]', ak(DEFAULT, SS3 + 'H'),  DEFAULT, DEFAULT, DEFAULT],
    [104, '[KP8]', ak(DEFAULT, CSI + 'A'),  DEFAULT, DEFAULT, DEFAULT],
    [105, '[KP9]', ak(DEFAULT, CSI + '5~'), DEFAULT, DEFAULT, DEFAULT],
    [107, '[KP+]', ak(DEFAULT, SS3 + 'k'),  DEFAULT, DEFAULT, DEFAULT],
    [109, '[KP-]', ak(DEFAULT, SS3 + 'm'),  DEFAULT, DEFAULT, DEFAULT],
    [106, '[KP*]', ak(DEFAULT, SS3 + 'j'),  DEFAULT, DEFAULT, DEFAULT],
    [111, '[KP/]', ak(DEFAULT, SS3 + 'o'),  DEFAULT, DEFAULT, DEFAULT],
    [110, '[KP.]', ak(DEFAULT, CSI + '3~'), DEFAULT, DEFAULT, DEFAULT]
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

/**
 * Either send a ^C or allow the browser to interpret the keystroke as a copy
 * command.
 *
 * If there is no selection, or if the user presses Ctrl-Shift-C, then we'll
 * transmit a ^C ('\x03').  If there is a selection, we defer to the
 * browser.  In this case we clear out the selection so the user knows we
 * heard them, and also to give them a chance to send a ^C by just hitting
 * the key again.
 */
hterm.Keyboard.KeyMap.Default.prototype.onCtrlC_ = function(e, keyDef) {
  var document = this.keyboard.terminal.getDocument();
  if (e.shiftKey || document.getSelection().isCollapsed) {
    // If the shift key is being held, or there is no document selection, send
    // a ^C.
    return '\x03';
  }

  // Otherwise let the browser handle it as a copy command.
  setTimeout(function() { document.getSelection().collapseToEnd() }, 50);
  return hterm.Keyboard.KeyActions.PASS;
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
hterm.Keyboard.KeyMap.Default.prototype.onMetaC_ = function(e, keyDef) {
  var document = this.keyboard.terminal.getDocument();
  if (e.shiftKey || document.getSelection().isCollapsed) {
    // If the shift key is being held, or there is no document selection, send
    // a Meta-C.  The keyboard code will add the ESC if metaSendsEscape is true,
    // we just have to decide between 'c' and 'C'.
    return keyDef.keyCap.substr(e.shiftKey ? 1 : 0, 1);
  }

  // Otherwise let the browser handle it as a copy command.
  setTimeout(function() { document.getSelection().collapseToEnd() }, 50);
  return hterm.Keyboard.KeyActions.PASS;
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
hterm.Keyboard.KeyMap.Default.prototype.onZoom_ = function(e, keyDef) {
  var cap = keyDef.keyCap.substr(0, 1);
  if (cap == '0') {
      this.keyboard.terminal.setFontSize(
          this.keyboard.terminal.defaultFontSizePx);
  } else {
    var size = this.keyboard.terminal.getFontSize();

    if (cap == '-') {
      size -= 1;
    } else {
      size += 1;
    }

    this.keyboard.terminal.setFontSize(size);
  }

  return hterm.Keyboard.KeyActions.CANCEL;
};
