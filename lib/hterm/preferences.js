// Copyright (c) 2014 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import ding from 'hterm/resource/ding';
import util from 'hterm/util';
import i18n from 'hterm/i18n';

export var defaults = {
  /**
   * If set, undoes the Chrome OS Alt-Backspace->DEL remap, so that
   * alt-backspace indeed is alt-backspace.
   */
  'alt-backspace-is-meta-backspace': false,

  /**
   * Set whether the alt key acts as a meta key or as a distinct alt key.
   */
  'alt-is-meta': false,

  /**
   * Controls how the alt key is handled.
   *
   *  escape....... Send an ESC prefix.
   *  8-bit........ Add 128 to the unshifted character as in xterm.
   *  browser-key.. Wait for the keypress event and see what the browser says.
   *                (This won't work well on platforms where the browser
   *                 performs a default action for some alt sequences.)
   */
  'alt-sends-what': 'escape',

  /**
   * Terminal bell sound.  Empty string for no audible bell.
   */
  'audible-bell-sound': 'x-resource:ding',

  /**
   * If true, terminal bells in the background will create a Web
   * Notification. http://www.w3.org/TR/notifications/
   *
   * Displaying notifications requires permission from the user. When this
   * option is set to true, hterm will attempt to ask the user for permission
   * if necessary. Note browsers may not show this permission request if it
   * did not originate from a user action.
   *
   * Chrome extensions with the "notfications" permission have permission to
   * display notifications.
   */
  'desktop-notification-bell': false,

  /**
   * The background color for text with no other color attributes.
   */
  'background-color': 'rgb(16, 16, 16)',

  /**
   * The background image.
   */
  'background-image': '',

  /**
   * The background image size,
   *
   * Defaults to none.
   */
  'background-size': '',

  /**
   * The background image position,
   *
   * Defaults to none.
   */
  'background-position': '',

  /**
   * If true, the backspace should send BS ('\x08', aka ^H).  Otherwise
   * the backspace key should send '\x7f'.
   */
  'backspace-sends-backspace': false,

  /**
   * Whether or not to close the window when the command exits.
   */
  'close-on-exit': true,

  /**
   * Whether or not to blink the cursor by default.
   */
  'cursor-blink': false,

  /**
   * The cursor blink rate in milliseconds.
   *
   * A two element array, the first of which is how long the cursor should be
   * on, second is how long it should be off.
   */
  'cursor-blink-cycle': [1000, 500],

  /**
   * The color of the visible cursor.
   */
  'cursor-color': 'rgba(255, 0, 0, 0.5)',

  /**
   * Override colors in the default palette.
   *
   * This can be specified as an array or an object.  If specified as an
   * object it is assumed to be a sparse array, where each property
   * is a numeric index into the color palette.
   *
   * Values can be specified as css almost any css color value.  This
   * includes #RGB, #RRGGBB, rgb(...), rgba(...), and any color names
   * that are also part of the stock X11 rgb.txt file.
   *
   * You can use 'null' to specify that the default value should be not
   * be changed.  This is useful for skipping a small number of indicies
   * when the value is specified as an array.
   */
  'color-palette-overrides': null,

  /**
   * Automatically copy mouse selection to the clipboard.
   */
  'copy-on-select': true,

  /**
   * Whether to use the default window copy behaviour.
   */
  'use-default-window-copy': false,

  /**
   * Whether to clear the selection after copying.
   */
  'clear-selection-after-copy': true,

  /**
   * If true, Ctrl-Plus/Minus/Zero controls zoom.
   * If false, Ctrl-Shift-Plus/Minus/Zero controls zoom, Ctrl-Minus sends ^_,
   * Ctrl-Plus/Zero do nothing.
   */
  'ctrl-plus-minus-zero-zoom': true,

  /**
   * Ctrl+C copies if true, send ^C to host if false.
   * Ctrl+Shift+C sends ^C to host if true, copies if false.
   */
  'ctrl-c-copy': false,

  /**
   * Ctrl+V pastes if true, send ^V to host if false.
   * Ctrl+Shift+V sends ^V to host if true, pastes if false.
   */
  'ctrl-v-paste': false,

  /**
   * Set whether East Asian Ambiguous characters have two column width.
   */
  'east-asian-ambiguous-as-two-column': false,

  /**
   * True to enable 8-bit control characters, false to ignore them.
   *
   * We'll respect the two-byte versions of these control characters
   * regardless of this setting.
   */
  'enable-8-bit-control': false,

  /**
   * True if we should use bold weight font for text with the bold/bright
   * attribute.  False to use the normal weight font.  Null to autodetect.
   */
  'enable-bold': null,

  /**
   * True if we should use bright colors (8-15 on a 16 color palette)
   * for any text with the bold attribute.  False otherwise.
   */
  'enable-bold-as-bright': true,

  /**
   * Allow the host to write directly to the system clipboard.
   */
  'enable-clipboard-notice': true,

  /**
   * Allow the host to write directly to the system clipboard.
   */
  'enable-clipboard-write': true,

  /**
   * Respect the host's attempt to change the cursor blink status using
   * DEC Private Mode 12.
   */
  'enable-dec12': false,

  /**
   * Default font family for the terminal text.
   */
  'font-family': ('"DejaVu Sans Mono", "Everson Mono", ' +
                  'FreeMono, "Menlo", "Terminal", ' +
                  'monospace'),

  /**
   * The default font size in pixels.
   */
  'font-size': 15,

  /**
   * Anti-aliasing.
   */
  'font-smoothing': 'antialiased',

  /**
   * The foreground color for text with no other color attributes.
   */
  'foreground-color': 'rgb(240, 240, 240)',

  /**
   * If true, home/end will control the terminal scrollbar and shift home/end
   * will send the VT keycodes.  If false then home/end sends VT codes and
   * shift home/end scrolls.
   */
  'home-keys-scroll': false,

  /**
   * Max length of a DCS, OSC, PM, or APS sequence before we give up and
   * ignore the code.
   */
  'max-string-sequence': 100000,

  /**
   * If true, convert media keys to their Fkey equivalent. If false, let
   * Chrome handle the keys.
   */
  'media-keys-are-fkeys': false,

  /**
   * Set whether the meta key sends a leading escape or not.
   */
  'meta-sends-escape': true,

  /**
   * Mouse paste button, or null to autodetect.
   *
   * For autodetect, we'll try to enable middle button paste for non-X11
   * platforms.
   *
   * On X11 we move it to button 3, but that'll probably be a context menu
   * in the future.
   */
  'mouse-paste-button': null,

  /**
   * If true, page up/down will control the terminal scrollbar and shift
   * page up/down will send the VT keycodes.  If false then page up/down
   * sends VT codes and shift page up/down scrolls.
   */
  'page-keys-scroll': false,

  /**
   * Set whether we should pass Alt-1..9 to the browser.
   *
   * This is handy when running hterm in a browser tab, so that you don't lose
   * Chrome's "switch to tab" keyboard accelerators.  When not running in a
   * tab it's better to send these keys to the host so they can be used in
   * vim or emacs.
   *
   * If true, Alt-1..9 will be handled by the browser.  If false, Alt-1..9
   * will be sent to the host.
   */
  'pass-alt-number': false,

  /**
   * Set whether we should pass Ctrl-1..9 to the browser.
   *
   * This is handy when running hterm in a browser tab, so that you don't lose
   * Chrome's "switch to tab" keyboard accelerators.  When not running in a
   * tab it's better to send these keys to the host so they can be used in
   * vim or emacs.
   *
   * If true, Ctrl-1..9 will be handled by the browser.  If false, Ctrl-1..9
   * will be sent to the host.
   */
  'pass-ctrl-number': false,

  /**
   * Set whether we should pass Meta-1..9 to the browser.
   *
   * This is handy when running hterm in a browser tab, so that you don't lose
   * Chrome's "switch to tab" keyboard accelerators.  When not running in a
   * tab it's better to send these keys to the host so they can be used in
   * vim or emacs.
   *
   * If true, Meta-1..9 will be handled by the browser.  If false, Meta-1..9
   * will be sent to the host.
   */
  'pass-meta-number': false,

  /**
   * Set whether meta-V gets passed to host.
   */
  'pass-meta-v': true,

  /**
   * Set the expected encoding for data received from the host.
   *
   * Valid values are 'utf-8' and 'raw'.
   */
  'receive-encoding': 'utf-8',

  /**
   * If true, scroll to the bottom on any keystroke.
   */
  'scroll-on-keystroke': true,

  /**
   * If true, scroll to the bottom on terminal output.
   */
  'scroll-on-output': false,

  /**
   * The vertical scrollbar mode.
   */
  'scrollbar-visible': true,

  /**
   * Set the encoding for data sent to host.
   *
   * Valid values are 'utf-8' and 'raw'.
   */
  'send-encoding': 'utf-8',

  /**
   * Shift + Insert pastes if true, sent to host if false.
   */
  'shift-insert-paste': true,

  /**
   * User stylesheet to include in the terminal document.
   */
  'user-css': ''
};

export var createChangeObserversFor = function(terminal) {
  return {
    'alt-backspace-is-meta-backspace': function(v) {
      terminal.keyboard.altBackspaceIsMetaBackspace = v;
    },

    'alt-is-meta': function(v) {
      terminal.keyboard.altIsMeta = v;
    },

    'alt-sends-what': function(v) {
      if (!/^(escape|8-bit|browser-key)$/.test(v))
        v = 'escape';

      terminal.keyboard.altSendsWhat = v;
    },

    'audible-bell-sound': function(v) {
      var ary = v.match(/^x-resource:ding$/);
      if (ary) {
        terminal.bellAudio_.setAttribute('src', ding.getDataUrl(ary[1]));
      } else {
        terminal.bellAudio_.setAttribute('src', v);
      }
    },

    'desktop-notification-bell': function(v) {
      if (v && Notification) {
        terminal.desktopNotificationBell_ =
            Notification.permission === 'granted';
        if (!terminal.desktopNotificationBell_) {
          // Note: We don't call Notification.requestPermission here because
          // Chrome requires the call be the result of a user action (such as an
          // onclick handler), and pref listeners are run asynchronously.
          //
          // A way of working around this would be to display a dialog in the
          // terminal with a "click-to-request-permission" button.
          console.warn('desktop-notification-bell is true but we do not have ' +
                       'permission to display notifications.');
        }
      } else {
        terminal.desktopNotificationBell_ = false;
      }
    },

    'background-color': function(v) {
      terminal.setBackgroundColor(v);
    },

    'background-image': function(v) {
      terminal.scrollPort_.setBackgroundImage(v);
    },

    'background-size': function(v) {
      terminal.scrollPort_.setBackgroundSize(v);
    },

    'background-position': function(v) {
      terminal.scrollPort_.setBackgroundPosition(v);
    },

    'backspace-sends-backspace': function(v) {
      terminal.keyboard.backspaceSendsBackspace = v;
    },

    'cursor-blink': function(v) {
      terminal.setCursorBlink(!!v);
    },

    'cursor-blink-cycle': function(v) {
        if (v instanceof Array &&
            typeof v[0] == 'number' &&
            typeof v[1] == 'number') {
          terminal.cursorBlinkCycle_ = v;
        } else if (typeof v == 'number') {
          terminal.cursorBlinkCycle_ = [v, v];
        } else {
          // Fast blink indicates an error.
          terminal.cursorBlinkCycle_ = [100, 100];
        }
    },

    'cursor-color': function(v) {
      terminal.setCursorColor(v);
    },

    'color-palette-overrides': function(v) {
      if (!(v == null || v instanceof Object || v instanceof Array)) {
        console.warn('Preference color-palette-overrides is not an array or ' +
                     'object: ' + v);
        return;
      }

      util.colors.colorPalette = util.colors.stockColorPalette.concat();

      if (v) {
        for (var key in v) {
          var i = parseInt(key);
          if (isNaN(i) || i < 0 || i > 255) {
            console.log('Invalid value in palette: ' + key + ': ' + v[key]);
            continue;
          }

          if (v[i]) {
            var rgb = util.colors.normalizeCSS(v[i]);
            if (rgb)
              util.colors.colorPalette[i] = rgb;
          }
        }
      }

      terminal.primaryScreen_.textAttributes.resetColorPalette();
      terminal.alternateScreen_.textAttributes.resetColorPalette();
    },

    'copy-on-select': function(v) {
      terminal.copyOnSelect = !!v;
    },

    'use-default-window-copy': function(v) {
      terminal.useDefaultWindowCopy = !!v;
    },

    'clear-selection-after-copy': function(v) {
      terminal.clearSelectionAfterCopy = !!v;
    },

    'ctrl-plus-minus-zero-zoom': function(v) {
      terminal.keyboard.ctrlPlusMinusZeroZoom = v;
    },

    'ctrl-c-copy': function(v) {
      terminal.keyboard.ctrlCCopy = v;
    },

    'ctrl-v-paste': function(v) {
      terminal.keyboard.ctrlVPaste = v;
      terminal.scrollPort_.setCtrlVPaste(v);
    },

    'east-asian-ambiguous-as-two-column': function(v) {
      i18n.wc.regardCjkAmbiguous = v;
    },

    'enable-8-bit-control': function(v) {
      terminal.vt.enable8BitControl = !!v;
    },

    'enable-bold': function(v) {
      terminal.setBoldSafeState(v);
    },

    'enable-bold-as-bright': function(v) {
      terminal.primaryScreen_.textAttributes.enableBoldAsBright = !!v;
      terminal.alternateScreen_.textAttributes.enableBoldAsBright = !!v;
    },

    'enable-clipboard-write': function(v) {
      terminal.vt.enableClipboardWrite = !!v;
    },

    'enable-dec12': function(v) {
      terminal.vt.enableDec12 = !!v;
    },

    'font-family': function(v) {
      terminal.setFontFamily(v);
    },

    'font-size': function(v) {
      terminal.setFontSize(v);
    },

    'font-smoothing': function(v) {
      terminal.setFontSmoothing(v);
    },

    'foreground-color': function(v) {
      terminal.setForegroundColor(v);
    },

    'home-keys-scroll': function(v) {
      terminal.keyboard.homeKeysScroll = v;
    },

    'max-string-sequence': function(v) {
      terminal.vt.maxStringSequence = v;
    },

    'media-keys-are-fkeys': function(v) {
      terminal.keyboard.mediaKeysAreFKeys = v;
    },

    'meta-sends-escape': function(v) {
      terminal.keyboard.metaSendsEscape = v;
    },

    'mouse-paste-button': function(v) {
      terminal.setMousePasteButton(v);
    },

    'page-keys-scroll': function(v) {
      terminal.keyboard.pageKeysScroll = v;
    },

    'pass-alt-number': function(v) {
      terminal.passAltNumber = v;
    },

    'pass-ctrl-number': function(v) {
      terminal.passCtrlNumber = v;
    },

    'pass-meta-number': function(v) {
      terminal.passMetaNumber = v;
    },

    'pass-meta-v': function(v) {
      terminal.keyboard.passMetaV = v;
    },

    'receive-encoding': function(v) {
       if (!(/^(utf-8|raw)$/).test(v)) {
         console.warn('Invalid value for "receive-encoding": ' + v);
         v = 'utf-8';
       }

       terminal.vt.characterEncoding = v;
    },

    'scroll-on-keystroke': function(v) {
      terminal.scrollOnKeystroke_ = v;
    },

    'scroll-on-output': function(v) {
      terminal.scrollOnOutput_ = v;
    },

    'scrollbar-visible': function(v) {
      terminal.setScrollbarVisible(v);
    },

    'send-encoding': function(v) {
       if (!(/^(utf-8|raw)$/).test(v)) {
         console.warn('Invalid value for "send-encoding": ' + v);
         v = 'utf-8';
       }

       terminal.keyboard.characterEncoding = v;
    },

    'shift-insert-paste': function(v) {
      terminal.keyboard.shiftInsertPaste = v;
    },

    'user-css': function(v) {
      terminal.scrollPort_.setUserCss(v);
    }
  };
};
