// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('hterm.Keyboard.KeyMap');

/**
 * Keyboard handler.
 *
 * Consumes onKey* events and invokes onVTKeystroke on the associated
 * hterm.Terminal object.
 *
 * See also: [XTERM] as referenced in vt.js.
 *
 * @param {hterm.Terminal} The Terminal object associated with this keyboard.
 */
hterm.Keyboard = function(terminal) {
  // The parent vt interpreter.
  this.terminal = terminal;

  // The element we're currently capturing keyboard events for.
  this.keyboardElement_ = null;

  // The event handlers we are interested in, and their bound callbacks, saved
  // so they can be uninstalled with removeEventListener, when required.
  this.handlers_ = [
      ['blur', this.onBlur_.bind(this)],
      ['keydown', this.onKeyDown_.bind(this)],
      ['keypress', this.onKeyPress_.bind(this)],
      ['keyup', this.onKeyUp_.bind(this)],
      ['textInput', this.onTextInput_.bind(this)]
  ];

  /**
   * The current key map.
   */
  this.keyMap = new hterm.Keyboard.KeyMap(this);

  /**
   * If true, Shift-Insert will fall through to the browser as a paste.
   * If false, the keystroke will be sent to the host.
   */
  this.shiftInsertPaste = true;

  /**
   * If true, home/end will control the terminal scrollbar and shift home/end
   * will send the VT keycodes.  If false then home/end sends VT codes and
   * shift home/end scrolls.
   */
  this.homeKeysScroll = false;

  /**
   * Same as above, except for page up/page down.
   */
  this.pageKeysScroll = false;

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
   * If true, the backspace should send BS ('\x08', aka ^H).  Otherwise
   * the backspace key should send '\x7f'.
   */
  this.backspaceSendsBackspace = false;

  /**
   * Set whether the meta key sends a leading escape or not.
   */
  this.metaSendsEscape = true;

  /**
   * Controls how the alt key is handled.
   *
   *  escape....... Send an ESC prefix.
   *  8-bit........ Add 128 to the unshifted character as in xterm.
   *  browser-key.. Wait for the keypress event and see what the browser says.
   *                (This won't work well on platforms where the browser
   *                 performs a default action for some alt sequences.)
   *
   * This setting only matters when alt is distinct from meta (altIsMeta is
   * false.)
   */
  this.altSendsWhat = 'escape';

  /**
   * Set whether the alt key acts as a meta key, instead of producing 8-bit
   * characters.
   *
   * True to enable, false to disable, null to autodetect based on platform.
   */
  this.altIsMeta = false;

  /**
   * If true, tries to detect DEL key events that are from alt-backspace on
   * Chrome OS vs from a true DEL key press.
   *
   * Background: At the time of writing, on Chrome OS, alt-backspace is mapped
   * to DEL. Some users may be happy with this, but others may be frustrated
   * that it's impossible to do meta-backspace. If the user enables this pref,
   * we use a trick to tell a true DEL keypress from alt-backspace: on
   * alt-backspace, we will see the alt key go down, then get a DEL keystroke
   * that indicates that alt is not pressed. See http://crbug.com/174410 .
   */
  this.altBackspaceIsMetaBackspace = false;

  /**
   * Used to keep track of the current alt-key state, which is necessary for
   * the altBackspaceIsMetaBackspace preference above.
   */
  this.altIsPressed = false;
};

/**
 * Special handling for keyCodes in a keyboard layout.
 */
hterm.Keyboard.KeyActions = {
  /**
   * Call preventDefault and stopPropagation for this key event and nothing
   * else.
   */
  CANCEL: new String('CANCEL'),

  /**
   * This performs the default terminal action for the key.  If used in the
   * 'normal' action and the the keystroke represents a printable key, the
   * character will be sent to the host.  If used in one of the modifier
   * actions, the terminal will perform the normal action after (possibly)
   * altering it.
   *
   *  - If the normal sequence starts with CSI, the sequence will be adjusted
   *    to include the modifier parameter as described in [XTERM] in the final
   *    table of the "PC-Style Function Keys" section.
   *
   *  - If the control key is down and the key represents a printable character,
   *    and the uppercase version of the unshifted keycap is between
   *    64 (ASCII '@') and 95 (ASCII '_'), then the uppercase version of the
   *    unshifted keycap minus 64 is sent.  This makes '^@' send '\x00' and
   *    '^_' send '\x1f'.  (Note that one higher that 0x1f is 0x20, which is
   *    the first printable ASCII value.)
   *
   *  - If the alt key is down and the key represents a printable character then
   *    the value of the character is shifted up by 128.
   *
   *  - If meta is down and configured to send an escape, '\x1b' will be sent
   *    before the normal action is performed.
   */
  DEFAULT: new String('DEFAULT'),

  /**
   * Causes the terminal to opt out of handling the key event, instead letting
   * the browser deal with it.
   */
  PASS: new String('PASS'),

  /**
   * Insert the first or second character of the keyCap, based on e.shiftKey.
   * The key will be handled in onKeyDown, and e.preventDefault() will be
   * called.
   *
   * It is useful for a modified key action, where it essentially strips the
   * modifier while preventing the browser from reacting to the key.
   */
  STRIP: new String('STRIP')
};

/**
 * Capture keyboard events sent to the associated element.
 *
 * This enables the keyboard.  Captured events are consumed by this class
 * and will not perform their default action or bubble to other elements.
 *
 * Passing a null element will uninstall the keyboard handlers.
 *
 * @param {HTMLElement} element The element whose events should be captured, or
 *     null to disable the keyboard.
 */
hterm.Keyboard.prototype.installKeyboard = function(element) {
  if (element == this.keyboardElement_)
    return;

  if (element && this.keyboardElement_)
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
 * Disable keyboard event capture.
 *
 * This will allow the browser to process key events normally.
 */
hterm.Keyboard.prototype.uninstallKeyboard = function() {
  this.installKeyboard(null);
};

/**
 * Handle onTextInput events.
 *
 * We're not actually supposed to get these, but we do on the Mac in the case
 * where a third party app sends synthetic keystrokes to Chrome.
 */
hterm.Keyboard.prototype.onTextInput_ = function(e) {
  if (!e.data)
    return;

  e.data.split('').forEach(this.terminal.onVTKeystroke.bind(this.terminal));
};

/**
 * Handle onKeyPress events.
 */
hterm.Keyboard.prototype.onKeyPress_ = function(e) {
  var code;

  if (e.altKey && this.altSendsWhat == 'browser-key' && e.charCode == 0) {
    // If we got here because we were expecting the browser to handle an
    // alt sequence but it didn't do it, then we might be on an OS without
    // an enabled IME system.  In that case we fall back to xterm-like
    // behavior.
    //
    // This happens here only as a fallback.  Typically these platforms should
    // set altSendsWhat to either 'escape' or '8-bit'.
    var ch = String.fromCharCode(e.keyCode);
    if (!e.shiftKey)
      ch = ch.toLowerCase();
    code = ch.charCodeAt(0) + 128;

  } else if (e.charCode >= 32) {
    ch = e.charCode;
  }

  if (ch) {
    var str = this.terminal.vt.encodeUTF8(String.fromCharCode(ch));
    this.terminal.onVTKeystroke(str);
  }

  e.preventDefault();
  e.stopPropagation();
};

hterm.Keyboard.prototype.onBlur_ = function(e) {
  this.altIsPressed = false;
};

hterm.Keyboard.prototype.onKeyUp_ = function(e) {
  if (e.keyCode == 18)
    this.altIsPressed = false;
};

/**
 * Handle onKeyDown events.
 */
hterm.Keyboard.prototype.onKeyDown_ = function(e) {
  if (e.keyCode == 18)
    this.altIsPressed = true;

  var keyDef = this.keyMap.keyDefs[e.keyCode];
  if (!keyDef) {
    console.warn('No definition for keyCode: ' + e.keyCode);
    return;
  }

  // The type of action we're going to use.
  var resolvedActionType = null;

  var self = this;
  function getAction(name) {
    // Get the key action for the given action name.  If the action is a
    // function, dispatch it.  If the action defers to the normal action,
    // resolve that instead.

    resolvedActionType = name;

    var action = keyDef[name];
    if (typeof action == 'function')
      action = action.apply(self.keyMap, [e, keyDef]);

    if (action === DEFAULT && name != 'normal')
      action = getAction('normal');

    return action;
  }

  // Note that we use the triple-equals ('===') operator to test equality for
  // these constants, in order to distingush usage of the constant from usage
  // of a literal string that happens to contain the same bytes.
  var CANCEL = hterm.Keyboard.KeyActions.CANCEL;
  var DEFAULT = hterm.Keyboard.KeyActions.DEFAULT;
  var PASS = hterm.Keyboard.KeyActions.PASS;
  var STRIP = hterm.Keyboard.KeyActions.STRIP;

  var shift = e.shiftKey;
  var control = e.ctrlKey;
  var alt = this.altIsMeta ? false : e.altKey;
  var meta = this.altIsMeta ? (e.altKey || e.metaKey) : e.metaKey;

  var action;

  if (control) {
    action = getAction('control');
  } else if (alt) {
    action = getAction('alt');
  } else if (meta) {
    action = getAction('meta');
  } else {
    action = getAction('normal');
  }

  if (alt && this.altSendsWhat == 'browser-key' && action == DEFAULT) {
    // When altSendsWhat is 'browser-key', we wait for the keypress event.
    // In keypress, the browser should have set the event.charCode to the
    // appropriate character.
    // TODO(rginda): Character compositions will need some black magic.
    action = PASS;
  }

  if (action === PASS || (action === DEFAULT && !(control || alt || meta))) {
    // If this key is supposed to be handled by the browser, or it is an
    // unmodified key with the default action, then exit this event handler.
    // If it's an unmodified key, it'll be handled in onKeyPress where we
    // can tell for sure which ASCII code to insert.
    //
    // This block needs to come before the STRIP test, otherwise we'll strip
    // the modifier and think it's ok to let the browser handle the keypress.
    // The browser won't know we're trying to ignore the modifiers and might
    // perform some default action.
    return;
  }

  if (action === STRIP) {
    alt = control = false;
    action = keyDef.normal;
    if (typeof action == 'function')
      action = action.apply(this.keyMap, [e, keyDef]);

    if (action == DEFAULT && keyDef.keyCap.length == 2)
      action = keyDef.keyCap.substr((e.shiftKey ? 1 : 0), 1);
  }

  e.preventDefault();
  e.stopPropagation();

  if (action === CANCEL)
    return;

  if (action !== DEFAULT && typeof action != 'string') {
    console.warn('Invalid action: ' + JSON.stringify(action));
    return;
  }

  // Strip the modifier that is associated with the action, since we assume that
  // modifier has already been accounted for in the action.
  if (resolvedActionType == 'control') {
    control = false;
  } else if (resolvedActionType == 'alt') {
    alt = false;
  } else if (resolvedActionType == 'meta') {
    meta = false;
  }

  if (action.substr(0, 2) == '\x1b[' && (alt || control || shift)) {
    // The action is an escape sequence that and it was triggered in the
    // presence of a keyboard modifier, we may need to alter the action to
    // include the modifier before sending it.

    var mod;

    if (shift && !(alt || control)) {
      mod = ';2';
    } else if (alt && !(shift || control)) {
      mod = ';3';
    } else if (shift && alt && !control) {
      mod = ';4';
    } else if (control && !(shift || alt)) {
      mod = ';5';
    } else if (shift && control && !alt) {
      mod = ';6';
    } else if (alt && control && !shift) {
      mod = ';7';
    } else if (shift && alt && control) {
      mod = ';8';
    }

    if (action.length == 3) {
      // Some of the CSI sequences have zero parameters unless modified.
      action = '\x1b[1' + mod + action.substr(2, 1);
    } else {
      // Others always have at least one parameter.
      action = action.substr(0, action.length - 1) + mod +
          action.substr(action.length - 1);
    }

  } else {
    // Just send it as-is.

    if (action === DEFAULT) {
      if (control) {
        var unshifted = keyDef.keyCap.substr(0, 1);
        var code = unshifted.charCodeAt(0);
        if (code >= 64 && code <= 95) {
        action = String.fromCharCode(code - 64);
        }
      } else if (alt && this.altSendsWhat == '8-bit') {
        var ch = keyDef.keyCap.substr((e.shiftKey ? 1 : 0), 1);
        var code = ch.charCodeAt(0) + 128;
        action = this.terminal.vt.encodeUTF8(String.fromCharCode(code));
      } else {
        action = keyDef.keyCap.substr((e.shiftKey ? 1 : 0), 1);
      }
    }

    // We respect alt/metaSendsEscape even if the keymap action was a literal
    // string.  Otherwise, every overridden alt/meta action would have to
    // check alt/metaSendsEscape.
    if ((alt && this.altSendsWhat == 'escape') ||
        (meta && this.metaSendsEscape)) {
      action = '\x1b' + action;
    }
  }

  this.terminal.onVTKeystroke(action);
};
