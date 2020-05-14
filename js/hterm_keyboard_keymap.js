// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @typedef {{
 *     keyCap: string,
 *     normal: !hterm.Keyboard.KeyDefAction,
 *     control: !hterm.Keyboard.KeyDefAction,
 *     alt: !hterm.Keyboard.KeyDefAction,
 *     meta: !hterm.Keyboard.KeyDefAction,
 * }}
 */
hterm.Keyboard.KeyDef;

/**
 * @typedef {function(!KeyboardEvent, !hterm.Keyboard.KeyDef):
 *               !hterm.Keyboard.KeyAction}
 */
hterm.Keyboard.KeyDefFunction;

/**
 * @typedef {function(!KeyboardEvent, !hterm.Keyboard.KeyDef):
 *               !hterm.Keyboard.KeyDefFunction|!hterm.Keyboard.KeyAction}
 */
hterm.Keyboard.KeyDefFunctionProvider;

/**
 * @typedef {(
 *      !hterm.Keyboard.KeyAction|
 *      !hterm.Keyboard.KeyDefFunction|
 *      !hterm.Keyboard.KeyDefFunctionProvider
 *  )}
 */
hterm.Keyboard.KeyDefAction;

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
 *
 * @param {!hterm.Keyboard} keyboard
 * @constructor
 */
hterm.Keyboard.KeyMap = function(keyboard) {
  this.keyboard = keyboard;
  /** @type {!Object<number, !hterm.Keyboard.KeyDef>} */
  this.keyDefs = {};
  this.reset();
};

/**
 * Add a single key definition.
 *
 * The definition is an object containing the following fields: 'keyCap',
 * 'normal', 'control', 'alt', and 'meta'.
 *
 *  - keyCap is a string identifying the key on the keyboard.  For printable
 *    keys, the key cap should be exactly two characters, starting with the
 *    unshifted version.  For example, 'aA', 'bB', '1!' and '=+'.  For
 *    non-printable the key cap should be surrounded in square braces, as in
 *    '[INS]', '[LEFT]'.  By convention, non-printable keycaps are in uppercase
 *    but this is not a strict requirement.
 *
 *  - Normal is the action that should be performed when the key is pressed
 *    in the absence of any modifier.  See below for the supported actions.
 *
 *  - Control is the action that should be performed when the key is pressed
 *    along with the control modifier.  See below for the supported actions.
 *
 *  - Alt is the action that should be performed when the key is pressed
 *    along with the alt modifier.  See below for the supported actions.
 *
 *  - Meta is the action that should be performed when the key is pressed
 *    along with the meta modifier.  See below for the supported actions.
 *
 * Actions can be one of the hterm.Keyboard.KeyActions as documented below,
 * a literal string, or an array.  If the action is a literal string then
 * the string is sent directly to the host.  If the action is an array it
 * is taken to be an escape sequence that may be altered by modifier keys.
 * The second-to-last element of the array will be overwritten with the
 * state of the modifier keys, as specified in the final table of "PC-Style
 * Function Keys" from [XTERM].
 *
 * @param {number} keyCode The KeyboardEvent.keyCode to match against.
 * @param {!hterm.Keyboard.KeyDef} def The actions this key triggers.
 */
hterm.Keyboard.KeyMap.prototype.addKeyDef = function(keyCode, def) {
  if (keyCode in this.keyDefs) {
    console.warn('Duplicate keyCode: ' + keyCode);
  }

  this.keyDefs[keyCode] = def;
};

/**
 * Set up the default state for this keymap.
 */
hterm.Keyboard.KeyMap.prototype.reset = function() {
  this.keyDefs = {};

  const CANCEL = hterm.Keyboard.KeyActions.CANCEL;
  const DEFAULT = hterm.Keyboard.KeyActions.DEFAULT;
  const PASS = hterm.Keyboard.KeyActions.PASS;
  const STRIP = hterm.Keyboard.KeyActions.STRIP;

  /**
   * This function is used by the "macro" functions below.  It makes it
   * possible to use the call() macro as an argument to any other macro.
   *
   * @param {!hterm.Keyboard.KeyDefAction} action
   * @param {!KeyboardEvent} e
   * @param {!hterm.Keyboard.KeyDef} k
   * @return {!hterm.Keyboard.KeyAction}
   */
  const resolve = (action, e, k) => {
    if (typeof action == 'function') {
      const keyDefFn = /** @type {!hterm.Keyboard.KeyDefFunction} */ (action);
      return keyDefFn.call(this, e, k);
    }
    return action;
  };

  /**
   * If not application keypad a, else b.  The keys that care about
   * application keypad ignore it when the key is modified.
   *
   * @param {!hterm.Keyboard.KeyDefAction} a
   * @param {!hterm.Keyboard.KeyDefAction} b
   * @return {!hterm.Keyboard.KeyDefFunction}
   */
  /* TODO(crbug.com/1065216): Delete this if no longer needed.
  const ak = (a, b) => {
    return (e, k) => {
      const action = (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey ||
                      !this.keyboard.applicationKeypad) ? a : b;
      return resolve(action, e, k);
    };
  };
  */

  /**
   * If mod or not application cursor a, else b.  The keys that care about
   * application cursor ignore it when the key is modified.
   *
   * @param {!hterm.Keyboard.KeyDefAction} a
   * @param {!hterm.Keyboard.KeyDefAction} b
   * @return {!hterm.Keyboard.KeyDefFunction}
   */
  const ac = (a, b) => {
    return (e, k) => {
      const action = (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey ||
                      !this.keyboard.applicationCursor) ? a : b;
      return resolve(action, e, k);
    };
  };

  /**
   * If not backspace-sends-backspace keypad a, else b.
   *
   * @param {!hterm.Keyboard.KeyDefAction} a
   * @param {!hterm.Keyboard.KeyDefAction} b
   * @return {!hterm.Keyboard.KeyDefFunction}
   */
  const bs = (a, b) => {
    return (e, k) => {
      const action = !this.keyboard.backspaceSendsBackspace ? a : b;
      return resolve(action, e, k);
    };
  };

  /**
   * If not e.shiftKey a, else b.
   *
   * @param {!hterm.Keyboard.KeyDefAction} a
   * @param {!hterm.Keyboard.KeyDefAction} b
   * @return {!hterm.Keyboard.KeyDefFunction}
   */
  const sh = (a, b) => {
    return (e, k) => {
      const action = !e.shiftKey ? a : b;
      e.maskShiftKey = true;
      return resolve(action, e, k);
    };
  };

  /**
   * If not e.altKey a, else b.
   *
   * @param {!hterm.Keyboard.KeyDefAction} a
   * @param {!hterm.Keyboard.KeyDefAction} b
   * @return {!hterm.Keyboard.KeyDefFunction}
   */
  const alt = (a, b) => {
    return (e, k) => {
      const action = !e.altKey ? a : b;
      return resolve(action, e, k);
    };
  };

  /**
   * If no modifiers a, else b.
   *
   * @param {!hterm.Keyboard.KeyDefAction} a
   * @param {!hterm.Keyboard.KeyDefAction} b
   * @return {!hterm.Keyboard.KeyDefFunction}
   */
  const mod = (a, b) => {
    return (e, k) => {
      const action = !(e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) ?
        a : b;
      return resolve(action, e, k);
    };
  };

  /**
   * Compute a control character for a given character.
   *
   * @param {string} ch
   * @return {string}
   */
  const ctl = (ch) => String.fromCharCode(ch.charCodeAt(0) - 64);

  /**
   * Call a method on the keymap instance.
   *
   * @param {string} m name of method to call.
   * @return {(
   *     !hterm.Keyboard.KeyDefFunction|
   *     !hterm.Keyboard.KeyDefFunctionProvider
   * )}
   */
  const c = (m) => {
    return (e, k) => this[m](e, k);
  };

  // Ignore if not trapping media keys.
  const med = (fn) => {
    return (e, k) => {
      if (!this.keyboard.mediaKeysAreFKeys) {
        // Block Back, Forward, and Reload keys to avoid navigating away from
        // the current page.
        return (e.keyCode == 166 || e.keyCode == 167 || e.keyCode == 168) ?
            CANCEL : PASS;
      }
      return resolve(fn, e, k);
    };
  };

  /**
   * @param {number} keyCode
   * @param {string} keyCap
   * @param {!hterm.Keyboard.KeyDefAction} normal
   * @param {!hterm.Keyboard.KeyDefAction} control
   * @param {!hterm.Keyboard.KeyDefAction} alt
   * @param {!hterm.Keyboard.KeyDefAction} meta
   */
  const add = (keyCode, keyCap, normal, control, alt, meta) => {
    this.addKeyDef(keyCode, {
      keyCap: keyCap,
      normal: normal,
      control: control,
      alt: alt,
      meta: meta,
    });
  };

  // Browser-specific differences.
  // let keycapMute;
  // let keycapVolDn;
  // let keycapVolDn
  let keycapSC;
  let keycapEP;
  let keycapMU;
  if (window.navigator && navigator.userAgent &&
      navigator.userAgent.includes('Firefox')) {
    // Firefox defines some keys uniquely.  No other browser defines these in
    // this way.  Some even conflict.  The keyCode field isn't well documented
    // as it isn't standardized.  At some point we should switch to "key".
    // https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/keyCode
    // http://unixpapa.com/js/key.html
    // keycapMute = 181;   // Mute
    // keycapVolDn = 182;  // Volume Down
    // keycapVolUp = 183;  // Volume Up
    keycapSC = 59;      // ;:
    keycapEP = 61;      // =+
    keycapMU = 173;     // -_

    // Firefox Italian +*.
    add(171, '+*', DEFAULT, c('onZoom_'), DEFAULT, c('onZoom_'));
  } else {
    // All other browsers use these mappings.
    // keycapMute = 173;   // Mute
    // keycapVolDn = 174;  // Volume Down
    // keycapVolUp = 175;  // Volume Up
    keycapSC = 186;     // ;:
    keycapEP = 187;     // =+
    keycapMU = 189;     // -_
  }

  const ESC = '\x1b';
  const CSI = '\x1b[';
  const SS3 = '\x1bO';

  // These fields are: [keycode, keycap, normal, control, alt, meta]
  /* eslint-disable no-multi-spaces */

  // The browser sends the keycode 0 for some keys.  We'll just assume it's
  // going to do the right thing by default for those keys.
  add(0,   '[UNKNOWN]', PASS, PASS, PASS, PASS);

  // First row.
  // These bindings match xterm for lack of a better standard.  The emitted
  // values might look like they're skipping values, but it's what xterm does.
  // https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h2-PC-Style-Function-Keys
  add(27,  '[ESC]', ESC,                       DEFAULT, DEFAULT,     DEFAULT);
  add(112, '[F1]',  mod(SS3 + 'P', CSI + 'P'), DEFAULT, CSI + '23~', DEFAULT);
  add(113, '[F2]',  mod(SS3 + 'Q', CSI + 'Q'), DEFAULT, CSI + '24~', DEFAULT);
  add(114, '[F3]',  mod(SS3 + 'R', CSI + 'R'), DEFAULT, CSI + '25~', DEFAULT);
  add(115, '[F4]',  mod(SS3 + 'S', CSI + 'S'), DEFAULT, CSI + '26~', DEFAULT);
  add(116, '[F5]',  CSI + '15~',               DEFAULT, CSI + '28~', DEFAULT);
  add(117, '[F6]',  CSI + '17~',               DEFAULT, CSI + '29~', DEFAULT);
  add(118, '[F7]',  CSI + '18~',               DEFAULT, CSI + '31~', DEFAULT);
  add(119, '[F8]',  CSI + '19~',               DEFAULT, CSI + '32~', DEFAULT);
  add(120, '[F9]',  CSI + '20~',               DEFAULT, CSI + '33~', DEFAULT);
  add(121, '[F10]', CSI + '21~',               DEFAULT, CSI + '34~', DEFAULT);
  add(122, '[F11]', c('onF11_'),               DEFAULT, CSI + '42~', DEFAULT);
  add(123, '[F12]', CSI + '24~',               DEFAULT, CSI + '43~', DEFAULT);

  // Second row.
  add(192, '`~', DEFAULT, sh(ctl('@'), ctl('^')),     DEFAULT,           PASS);
  add(49,  '1!', DEFAULT, c('onCtrlNum_'),    c('onAltNum_'), c('onMetaNum_'));
  add(50,  '2@', DEFAULT, c('onCtrlNum_'),    c('onAltNum_'), c('onMetaNum_'));
  add(51,  '3#', DEFAULT, c('onCtrlNum_'),    c('onAltNum_'), c('onMetaNum_'));
  add(52,  '4$', DEFAULT, c('onCtrlNum_'),    c('onAltNum_'), c('onMetaNum_'));
  add(53,  '5%', DEFAULT, c('onCtrlNum_'),    c('onAltNum_'), c('onMetaNum_'));
  add(54,  '6^', DEFAULT, c('onCtrlNum_'),    c('onAltNum_'), c('onMetaNum_'));
  add(55,  '7&', DEFAULT, c('onCtrlNum_'),    c('onAltNum_'), c('onMetaNum_'));
  add(56,  '8*', DEFAULT, c('onCtrlNum_'),    c('onAltNum_'), c('onMetaNum_'));
  add(57,  '9(', DEFAULT, c('onCtrlNum_'),    c('onAltNum_'), c('onMetaNum_'));
  add(48,  '0)', DEFAULT, c('onZoom_'),       c('onAltNum_'), c('onZoom_'));
  add(keycapMU, '-_', DEFAULT, c('onZoom_'),  DEFAULT,        c('onZoom_'));
  add(keycapEP, '=+', DEFAULT, c('onZoom_'),  DEFAULT,        c('onZoom_'));

  add(8,   '[BKSP]', bs('\x7f', '\b'), bs('\b', '\x7f'), DEFAULT,     DEFAULT);

  // Third row.
  add(9,   '[TAB]', sh('\t', CSI + 'Z'), c('onCtrlTab_'), PASS, DEFAULT);
  add(81,  'qQ',    DEFAULT,             ctl('Q'),  DEFAULT, DEFAULT);
  add(87,  'wW',    DEFAULT,         c('onCtrlW_'), DEFAULT, DEFAULT);
  add(69,  'eE',    DEFAULT,             ctl('E'),  DEFAULT, DEFAULT);
  add(82,  'rR',    DEFAULT,             ctl('R'),  DEFAULT, DEFAULT);
  add(84,  'tT',    DEFAULT,         c('onCtrlT_'), DEFAULT, DEFAULT);
  add(89,  'yY',    DEFAULT,             ctl('Y'),  DEFAULT, DEFAULT);
  add(85,  'uU',    DEFAULT,             ctl('U'),  DEFAULT, DEFAULT);
  add(73,  'iI',    DEFAULT,             ctl('I'),  DEFAULT, DEFAULT);
  add(79,  'oO',    DEFAULT,             ctl('O'),  DEFAULT, DEFAULT);
  add(80,  'pP',    DEFAULT,             ctl('P'),  DEFAULT, DEFAULT);
  add(219, '[{',    DEFAULT,             ctl('['),  DEFAULT, DEFAULT);
  add(221, ']}',    DEFAULT,             ctl(']'),  DEFAULT, DEFAULT);
  add(220, '\\|',   DEFAULT,             ctl('\\'), DEFAULT, DEFAULT);

  // Fourth row. We let Ctrl+Shift+J pass for Chrome DevTools.
  // To be compliant with xterm's behavior for modifiers on Enter
  // would mean maximizing the window with Alt+Enter... so we don't
  // want to do that. Our behavior on Enter is what most other
  // modern emulators do.
  add(20,  '[CAPS]',  PASS,    PASS,                        PASS,    DEFAULT);
  add(65,  'aA',      DEFAULT, ctl('A'),                    DEFAULT, DEFAULT);
  add(83,  'sS',      DEFAULT, ctl('S'),                    DEFAULT, DEFAULT);
  add(68,  'dD',      DEFAULT, ctl('D'),                    DEFAULT, DEFAULT);
  add(70,  'fF',      DEFAULT, ctl('F'),                    DEFAULT, DEFAULT);
  add(71,  'gG',      DEFAULT, ctl('G'),                    DEFAULT, DEFAULT);
  add(72,  'hH',      DEFAULT, ctl('H'),                    DEFAULT, DEFAULT);
  add(74,  'jJ',      DEFAULT, sh(ctl('J'), PASS),          DEFAULT, DEFAULT);
  add(75,  'kK',      DEFAULT, sh(ctl('K'), c('onClear_')), DEFAULT, DEFAULT);
  add(76,  'lL',      DEFAULT, sh(ctl('L'), PASS),          DEFAULT, DEFAULT);
  add(keycapSC, ';:', DEFAULT, STRIP,                       DEFAULT, DEFAULT);
  add(222, '\'"',     DEFAULT, STRIP,                       DEFAULT, DEFAULT);
  add(13,  '[ENTER]', '\r',    DEFAULT,                     DEFAULT, DEFAULT);

  // Fifth row.  This includes the copy/paste shortcuts.  On some
  // platforms it's Ctrl+C/V, on others it's Meta+C/V.  We assume either
  // Ctrl+C/Meta+C should pass to the browser when there is a selection,
  // and Ctrl+Shift+V/Meta+*+V should always pass to the browser (since
  // these seem to be recognized as paste too).
  add(16,  '[SHIFT]', PASS, PASS,                  PASS,    DEFAULT);
  add(90,  'zZ',   DEFAULT, ctl('Z'),              DEFAULT, DEFAULT);
  add(88,  'xX',   DEFAULT, ctl('X'),              DEFAULT, DEFAULT);
  add(67,  'cC',   DEFAULT, c('onCtrlC_'),         DEFAULT, c('onMetaC_'));
  add(86,  'vV',   DEFAULT, c('onCtrlV_'),         DEFAULT, c('onMetaV_'));
  add(66,  'bB',   DEFAULT, sh(ctl('B'), PASS),    DEFAULT, sh(DEFAULT, PASS));
  add(78,  'nN',   DEFAULT, c('onCtrlN_'),         DEFAULT, c('onMetaN_'));
  add(77,  'mM',   DEFAULT, ctl('M'),              DEFAULT, DEFAULT);
  add(188, ',<',   DEFAULT, alt(STRIP, PASS),      DEFAULT, DEFAULT);
  add(190, '.>',   DEFAULT, alt(STRIP, PASS),      DEFAULT, DEFAULT);
  add(191, '/?',   DEFAULT, sh(ctl('_'), ctl('?')), DEFAULT, DEFAULT);

  // Sixth and final row.
  add(17,  '[CTRL]',  PASS,    PASS,     PASS,    PASS);
  add(18,  '[ALT]',   PASS,    PASS,     PASS,    PASS);
  add(91,  '[LAPL]',  PASS,    PASS,     PASS,    PASS);
  add(32,  ' ',       DEFAULT, ctl('@'), DEFAULT, DEFAULT);
  add(92,  '[RAPL]',  PASS,    PASS,     PASS,    PASS);
  add(93,  '[RMENU]', PASS,    PASS,     PASS,    PASS);

  // These things.
  add(42,  '[PRTSCR]', PASS, PASS, PASS, PASS);
  add(145, '[SCRLK]',  PASS, PASS, PASS, PASS);
  add(19,  '[BREAK]',  PASS, PASS, PASS, PASS);

  // The block of six keys above the arrows.
  add(45,  '[INSERT]', c('onKeyInsert_'),   DEFAULT, DEFAULT, DEFAULT);
  add(36,  '[HOME]',   c('onKeyHome_'),     DEFAULT, DEFAULT, DEFAULT);
  add(33,  '[PGUP]',   c('onKeyPageUp_'),   DEFAULT, DEFAULT, DEFAULT);
  add(46,  '[DEL]',    c('onKeyDel_'),      DEFAULT, DEFAULT, DEFAULT);
  add(35,  '[END]',    c('onKeyEnd_'),      DEFAULT, DEFAULT, DEFAULT);
  add(34,  '[PGDOWN]', c('onKeyPageDown_'), DEFAULT, DEFAULT, DEFAULT);

  // Arrow keys.  When unmodified they respect the application cursor state,
  // otherwise they always send the CSI codes.
  add(38, '[UP]',    c('onKeyArrowUp_'), DEFAULT, DEFAULT, DEFAULT);
  add(40, '[DOWN]',  c('onKeyArrowDown_'), DEFAULT, DEFAULT, DEFAULT);
  add(39, '[RIGHT]', ac(CSI + 'C', SS3 + 'C'), DEFAULT, DEFAULT, DEFAULT);
  add(37, '[LEFT]',  ac(CSI + 'D', SS3 + 'D'), DEFAULT, DEFAULT, DEFAULT);

  add(144, '[NUMLOCK]', PASS, PASS, PASS, PASS);

  // On Apple keyboards, the NumLock key is a Clear key.  It also tends to be
  // what KP5 sends when numlock is off.  Not clear if we could do anything
  // useful with it, so just pass it along.
  add(12, '[CLEAR]', PASS, PASS, PASS, PASS);

  // With numlock off, the keypad generates the same key codes as the arrows
  // and 'block of six' for some keys, and null key codes for the rest.

  // Keypad with numlock on generates unique key codes...
  add(96,  '[KP0]', DEFAULT, DEFAULT,      DEFAULT, DEFAULT);
  add(97,  '[KP1]', DEFAULT, DEFAULT,      DEFAULT, DEFAULT);
  add(98,  '[KP2]', DEFAULT, DEFAULT,      DEFAULT, DEFAULT);
  add(99,  '[KP3]', DEFAULT, DEFAULT,      DEFAULT, DEFAULT);
  add(100, '[KP4]', DEFAULT, DEFAULT,      DEFAULT, DEFAULT);
  add(101, '[KP5]', DEFAULT, DEFAULT,      DEFAULT, DEFAULT);
  add(102, '[KP6]', DEFAULT, DEFAULT,      DEFAULT, DEFAULT);
  add(103, '[KP7]', DEFAULT, DEFAULT,      DEFAULT, DEFAULT);
  add(104, '[KP8]', DEFAULT, DEFAULT,      DEFAULT, DEFAULT);
  add(105, '[KP9]', DEFAULT, DEFAULT,      DEFAULT, DEFAULT);
  add(107, '[KP+]', DEFAULT, c('onZoom_'), DEFAULT, c('onZoom_'));
  add(109, '[KP-]', DEFAULT, c('onZoom_'), DEFAULT, c('onZoom_'));
  add(106, '[KP*]', DEFAULT, DEFAULT,      DEFAULT, DEFAULT);
  add(111, '[KP/]', DEFAULT, DEFAULT,      DEFAULT, DEFAULT);
  add(110, '[KP.]', DEFAULT, DEFAULT,      DEFAULT, DEFAULT);

  // OS-specific differences.
  if (hterm.os == 'cros') {
    // Chrome OS keyboard top row.  The media-keys-are-fkeys preference allows
    // users to make these always behave as function keys (see those bindings
    // above for more details).
    /* eslint-disable max-len */
    add(166, '[BACK]',   med(mod(SS3 + 'P', CSI + 'P')), DEFAULT, CSI + '23~', DEFAULT);  // F1
    add(167, '[FWD]',    med(mod(SS3 + 'Q', CSI + 'Q')), DEFAULT, CSI + '24~', DEFAULT);  // F2
    add(168, '[RELOAD]', med(mod(SS3 + 'R', CSI + 'R')), DEFAULT, CSI + '25~', DEFAULT);  // F3
    add(183, '[FSCR]',   med(mod(SS3 + 'S', CSI + 'S')), DEFAULT, CSI + '26~', DEFAULT);  // F4
    add(182, '[WINS]',   med(CSI + '15~'),               DEFAULT, CSI + '28~', DEFAULT);  // F5
    add(216, '[BRIT-]',  med(CSI + '17~'),               DEFAULT, CSI + '29~', DEFAULT);  // F6
    add(217, '[BRIT+]',  med(CSI + '18~'),               DEFAULT, CSI + '31~', DEFAULT);  // F7
    add(173, '[MUTE]',   med(CSI + '19~'),               DEFAULT, CSI + '32~', DEFAULT);  // F8
    add(174, '[VOL-]',   med(CSI + '20~'),               DEFAULT, CSI + '33~', DEFAULT);  // F9
    add(175, '[VOL+]',   med(CSI + '21~'),               DEFAULT, CSI + '34~', DEFAULT);  // F10
    /* eslint-enable max-len */

    // We could make this into F11, but it'd be a bit weird.  Chrome allows us
    // to see this and react, but it doesn't actually allow us to block or
    // cancel it, so it makes the screen flash/lock still.
    add(152, '[POWER]', DEFAULT, DEFAULT, DEFAULT, DEFAULT);

    // The Pixelbook has a slightly different layout.  This means half the keys
    // above are off by one.  https://crbug.com/807513
    add(179, '[PLAY]', med(CSI + '18~'), DEFAULT, CSI + '31~', DEFAULT); // F7
    // The settings / hamburgers / three hot dogs / menu / whatever-it's-called.
    add(154, '[DOGS]', med(CSI + '23~'), DEFAULT, CSI + '42~', DEFAULT); // F11

    // We don't use this for anything, but keep it from popping up by default.
    add(153, '[ASSIST]', DEFAULT, DEFAULT, DEFAULT, DEFAULT);
  }
  /* eslint-enable no-multi-spaces */
};

/**
 * Either allow the paste or send a key sequence.
 *
 * @param {!KeyboardEvent} e The event to process.
 * @return {symbol|string} Key action or sequence.
 */
hterm.Keyboard.KeyMap.prototype.onKeyInsert_ = function(e) {
  if (this.keyboard.shiftInsertPaste && e.shiftKey) {
    return hterm.Keyboard.KeyActions.PASS;
  }

  return '\x1b[2~';
};

/**
 * Either scroll the scrollback buffer or send a key sequence.
 *
 * @param {!KeyboardEvent} e The event to process.
 * @return {symbol|string} Key action or sequence.
 */
hterm.Keyboard.KeyMap.prototype.onKeyHome_ = function(e) {
  if (this.keyboard.homeKeysScroll === e.shiftKey) {
    if ((e.altKey || e.ctrlKey || e.shiftKey) ||
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
 *
 * @param {!KeyboardEvent} e The event to process.
 * @return {symbol|string} Key action or sequence.
 */
hterm.Keyboard.KeyMap.prototype.onKeyEnd_ = function(e) {
  if (this.keyboard.homeKeysScroll === e.shiftKey) {
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
 *
 * @param {!KeyboardEvent} e The event to process.
 * @return {symbol|string} Key action or sequence.
 */
hterm.Keyboard.KeyMap.prototype.onKeyPageUp_ = function(e) {
  if (this.keyboard.pageKeysScroll === e.shiftKey) {
    return '\x1b[5~';
  }

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
 *
 * @param {!KeyboardEvent} e The event to process.
 * @return {symbol|string} Key action or sequence.
 */
hterm.Keyboard.KeyMap.prototype.onKeyDel_ = function(e) {
  if (this.keyboard.altBackspaceIsMetaBackspace &&
      this.keyboard.altKeyPressed && !e.altKey) {
    return '\x1b\x7f';
  }
  return '\x1b[3~';
};

/**
 * Either scroll the scrollback buffer or send a key sequence.
 *
 * @param {!KeyboardEvent} e The event to process.
 * @return {symbol|string} Key action or sequence.
 */
hterm.Keyboard.KeyMap.prototype.onKeyPageDown_ = function(e) {
  if (this.keyboard.pageKeysScroll === e.shiftKey) {
    return '\x1b[6~';
  }

  this.keyboard.terminal.scrollPageDown();
  return hterm.Keyboard.KeyActions.CANCEL;
};

/**
 * Either scroll the scrollback buffer or send a key sequence.
 *
 * @param {!KeyboardEvent} e The event to process.
 * @return {symbol|string} Key action or sequence.
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
 *
 * @param {!KeyboardEvent} e The event to process.
 * @return {symbol|string} Key action or sequence.
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
 *
 * @param {!KeyboardEvent} e The event to process.
 * @return {symbol|string} Key action or sequence.
 */
hterm.Keyboard.KeyMap.prototype.onClear_ = function(e) {
  this.keyboard.terminal.wipeContents();
  return hterm.Keyboard.KeyActions.CANCEL;
};

/**
 * Handle F11 behavior (fullscreen) when not in a window.
 *
 * It would be nice to use the Fullscreen API, but the UX is slightly different
 * a bad way: the Escape key is automatically registered for exiting.  If we let
 * the browser handle F11 directly though, we still get to capture Escape.
 *
 * @param {!KeyboardEvent} e The event to process.
 * @return {symbol|string} Key action or sequence.
 */
hterm.Keyboard.KeyMap.prototype.onF11_ = function(e) {
  if (hterm.windowType != 'popup') {
    return hterm.Keyboard.KeyActions.PASS;
  } else {
    return '\x1b[23~';
  }
};

/**
 * Either pass Ctrl+1..9 to the browser or send them to the host.
 *
 * Note that Ctrl+1 and Ctrl+9 don't actually have special sequences mapped
 * to them in xterm or gnome-terminal.  The range is really Ctrl+2..8, but
 * we handle 1..9 since Chrome treats the whole range special.
 *
 * @param {!KeyboardEvent} e The event to process.
 * @param {!hterm.Keyboard.KeyDef} keyDef Key definition.
 * @return {symbol|string} Key action or sequence.
 */
hterm.Keyboard.KeyMap.prototype.onCtrlNum_ = function(e, keyDef) {
  // Compute a control character for a given character.
  function ctl(ch) { return String.fromCharCode(ch.charCodeAt(0) - 64); }

  if (this.keyboard.terminal.passCtrlNumber && !e.shiftKey) {
    return hterm.Keyboard.KeyActions.PASS;
  }

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
  return hterm.Keyboard.KeyActions.PASS;
};

/**
 * Either pass Alt+1..9 to the browser or send them to the host.
 *
 * @param {!KeyboardEvent} e The event to process.
 * @return {symbol|string} Key action or sequence.
 */
hterm.Keyboard.KeyMap.prototype.onAltNum_ = function(e) {
  if (this.keyboard.terminal.passAltNumber && !e.shiftKey) {
    return hterm.Keyboard.KeyActions.PASS;
  }

  return hterm.Keyboard.KeyActions.DEFAULT;
};

/**
 * Either pass Meta+1..9 to the browser or send them to the host.
 *
 * @param {!KeyboardEvent} e The event to process.
 * @return {symbol|string} Key action or sequence.
 */
hterm.Keyboard.KeyMap.prototype.onMetaNum_ = function(e) {
  if (this.keyboard.terminal.passMetaNumber && !e.shiftKey) {
    return hterm.Keyboard.KeyActions.PASS;
  }

  return hterm.Keyboard.KeyActions.DEFAULT;
};

/**
 * Either pass ctrl+[shift]+tab to the browser or strip.
 *
 * @param {!KeyboardEvent} e The event to process.
 * @return {symbol|string} Key action or sequence.
 */
hterm.Keyboard.KeyMap.prototype.onCtrlTab_ = function(e) {
  if (this.keyboard.terminal.passCtrlTab) {
    return hterm.Keyboard.KeyActions.PASS;
  }
  return hterm.Keyboard.KeyActions.STRIP;
};

/**
 * Either pass Ctrl & Shift W (close tab/window) to the browser or send it to
 * the host.
 *
 * @param {!KeyboardEvent} e The event to process.
 * @return {symbol|string} Key action or sequence.
 */
hterm.Keyboard.KeyMap.prototype.onCtrlW_ = function(e) {
  if (this.keyboard.terminal.passCtrlW) {
    return hterm.Keyboard.KeyActions.PASS;
  }
  return '\x17';
};

/**
 * Either pass Ctrl & Shift T (new/reopen tab) to the browser or send it to the
 * host.
 *
 * @param {!KeyboardEvent} e The event to process.
 * @return {symbol|string} Key action or sequence.
 */
hterm.Keyboard.KeyMap.prototype.onCtrlT_ = function(e) {
  if (this.keyboard.terminal.passCtrlT) {
    return hterm.Keyboard.KeyActions.PASS;
  }
  return '\x14';
};

/**
 * Either send a ^C or interpret the keystroke as a copy command.
 *
 * @param {!KeyboardEvent} e The event to process.
 * @return {symbol|string} Key action or sequence.
 */
hterm.Keyboard.KeyMap.prototype.onCtrlC_ = function(e) {
  const selection = this.keyboard.terminal.getDocument().getSelection();

  if (!selection.isCollapsed) {
    if (this.keyboard.ctrlCCopy && !e.shiftKey) {
      // Ctrl+C should copy if there is a selection, send ^C otherwise.
      // Perform the copy by letting the browser handle Ctrl+C.  On most
      // browsers, this is the *only* way to place text on the clipboard from
      // the 'drive-by' web.
      if (this.keyboard.terminal.clearSelectionAfterCopy) {
        setTimeout(selection.collapseToEnd.bind(selection), 50);
      }
      return hterm.Keyboard.KeyActions.PASS;
    }

    if (!this.keyboard.ctrlCCopy && e.shiftKey) {
      // Ctrl+Shift+C should copy if there is a selection, send ^C otherwise.
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
 *
 * @param {!KeyboardEvent} e The event to process.
 * @return {!hterm.Keyboard.KeyDefFunction|symbol|string} Key action or
 *     sequence.
 */
hterm.Keyboard.KeyMap.prototype.onCtrlN_ = function(e) {
  if (this.keyboard.terminal.passCtrlN) {
    return hterm.Keyboard.KeyActions.PASS;
  }

  if (e.shiftKey) {
    return function(e, k) {
      lib.f.openWindow(document.location.href, '',
                       'chrome=no,close=yes,resize=yes,scrollbars=yes,' +
                       'minimizable=yes,width=' + window.innerWidth +
                       ',height=' + window.innerHeight);
      return hterm.Keyboard.KeyActions.CANCEL;
    };
  }

  return '\x0e';
};

/**
 * Either send a ^V or issue a paste command.
 *
 * The default behavior is to paste if the user presses Ctrl+Shift+V, and send
 * a ^V if the user presses Ctrl+V. This can be flipped with the
 * 'ctrl-v-paste' preference.
 *
 * @param {!KeyboardEvent} e The event to process.
 * @return {symbol|string} Key action or sequence.
 */
hterm.Keyboard.KeyMap.prototype.onCtrlV_ = function(e) {
  if ((!e.shiftKey && this.keyboard.ctrlVPaste) ||
      (e.shiftKey && !this.keyboard.ctrlVPaste)) {
    // We try to do the pasting ourselves as not all browsers/OSs bind Ctrl+V to
    // pasting.  Notably, on macOS, Ctrl+V/Ctrl+Shift+V do nothing.
    // However, this might run into web restrictions, so if it fails, we still
    // fallback to the letting the native behavior (hopefully) save us.
    if (this.keyboard.terminal.paste() !== false) {
      return hterm.Keyboard.KeyActions.CANCEL;
    } else {
      return hterm.Keyboard.KeyActions.PASS;
    }
  }

  return '\x16';
};

/**
 * Either the default action or open a new window to the same location.
 *
 * @param {!KeyboardEvent} e The event to process.
 * @return {!hterm.Keyboard.KeyDefFunction|symbol} Key action or sequence.
 */
hterm.Keyboard.KeyMap.prototype.onMetaN_ = function(e) {
  if (e.shiftKey) {
    return function(e, k) {
      lib.f.openWindow(document.location.href, '',
                       'chrome=no,close=yes,resize=yes,scrollbars=yes,' +
                       'minimizable=yes,width=' + window.outerWidth +
                       ',height=' + window.outerHeight);
      return hterm.Keyboard.KeyActions.CANCEL;
    };
  }

  return hterm.Keyboard.KeyActions.DEFAULT;
};

/**
 * Either send a Meta+C or allow the browser to interpret the keystroke as a
 * copy command.
 *
 * If there is no selection, or if the user presses Meta+Shift+C, then we'll
 * transmit an '\x1b' (if metaSendsEscape is on) followed by 'c' or 'C'.
 *
 * If there is a selection, we defer to the browser.  In this case we clear out
 * the selection so the user knows we heard them, and also to give them a
 * chance to send a Meta+C by just hitting the key again.
 *
 * @param {!KeyboardEvent} e The event to process.
 * @param {!hterm.Keyboard.KeyDef} keyDef Key definition.
 * @return {symbol|string} Key action or sequence.
 */
hterm.Keyboard.KeyMap.prototype.onMetaC_ = function(e, keyDef) {
  const document = this.keyboard.terminal.getDocument();
  if (e.shiftKey || document.getSelection().isCollapsed) {
    // If the shift key is being held, or there is no document selection, send
    // a Meta+C.  The keyboard code will add the ESC if metaSendsEscape is true,
    // we just have to decide between 'c' and 'C'.
    return keyDef.keyCap.substr(e.shiftKey ? 1 : 0, 1);
  }

  // Otherwise let the browser handle it as a copy command.
  if (this.keyboard.terminal.clearSelectionAfterCopy) {
    setTimeout(function() { document.getSelection().collapseToEnd(); }, 50);
  }
  return hterm.Keyboard.KeyActions.PASS;
};

/**
 * Either PASS or DEFAULT Meta+V, depending on preference.
 *
 * Always PASS Meta+Shift+V to allow browser to interpret the keystroke as
 * a paste command.
 *
 * @param {!KeyboardEvent} e The event to process.
 * @return {symbol|string} Key action or sequence.
 */
hterm.Keyboard.KeyMap.prototype.onMetaV_ = function(e) {
  if (e.shiftKey) {
    return hterm.Keyboard.KeyActions.PASS;
  }

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
 *
 * @param {!KeyboardEvent} e The event to process.
 * @param {!hterm.Keyboard.KeyDef} keyDef Key definition.
 * @return {symbol|string} Key action or sequence.
 */
hterm.Keyboard.KeyMap.prototype.onZoom_ = function(e, keyDef) {
  if (this.keyboard.ctrlPlusMinusZeroZoom === e.shiftKey) {
    // If ctrl-PMZ controls zoom and the shift key is pressed, or
    // ctrl-shift-PMZ controls zoom and this shift key is not pressed,
    // then we want to send the control code instead of affecting zoom.
    if (keyDef.keyCap == '-_') {
      // ^_
      return '\x1f';
    }

    // Only ^_ is valid, the other sequences have no meaning.
    return hterm.Keyboard.KeyActions.CANCEL;
  }

  if (this.keyboard.terminal.getZoomFactor() != 1) {
    // If we're not at 1:1 zoom factor, let the Ctrl +/-/0 keys control the
    // browser zoom, so it's easier to for the user to get back to 100%.
    return hterm.Keyboard.KeyActions.PASS;
  }

  const cap = keyDef.keyCap.substr(0, 1);
  if (cap == '0') {
      this.keyboard.terminal.setFontSize(0);
  } else {
    let size = this.keyboard.terminal.getFontSize();

    if (cap == '-' || keyDef.keyCap == '[KP-]') {
      size -= 1;
    } else {
      size += 1;
    }

    this.keyboard.terminal.setFontSize(size);
  }

  return hterm.Keyboard.KeyActions.CANCEL;
};
