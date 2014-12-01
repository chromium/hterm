// Copyright (c) 2014 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import util from 'hterm/util';
import i18n from 'hterm/i18n';

export var terminalConfigObservers = {
  'alt-backspace-is-meta-backspace': function(v) {
    this.keyboard.altBackspaceIsMetaBackspace = v;
  },

  'alt-is-meta': function(v) {
    this.keyboard.altIsMeta = v;
  },

  'alt-sends-what': function(v) {
    if (!/^(escape|8-bit|browser-key)$/.test(v))
      v = 'escape';

    this.keyboard.altSendsWhat = v;
  },

  'audible-bell-sound': function(v) {
    this.syncBellAudio_();
  },

  'desktop-notification-bell': function(v) {
    if (v && window.Notification) {
      this.desktopNotificationBell_ =
          window.Notification.permission === 'granted';
      if (!this.desktopNotificationBell_) {
        // Note: We don't call Notification.requestPermission here because
        // Chrome requires the call be the result of a user action (such as an
        // onclick handler), and pref listeners are run asynchronously.
        //
        // A way of working around this would be to display a dialog in the
        // this with a "click-to-request-permission" button.
        console.warn('desktop-notification-bell is true but we do not have ' +
            'permission to display notifications.');
      }
    } else {
      this.desktopNotificationBell_ = false;
    }
  },

  'background-color': function(v) {
    this.setBackgroundColor(v);
  },

  'background-image': function(v) {
    this.scrollPort_.setBackgroundImage(v);
  },

  'background-size': function(v) {
    this.scrollPort_.setBackgroundSize(v);
  },

  'background-position': function(v) {
    this.scrollPort_.setBackgroundPosition(v);
  },

  'backspace-sends-backspace': function(v) {
    this.keyboard.backspaceSendsBackspace = v;
  },

  'cursor-blink': function(v) {
    this.setCursorBlink(!!v);
  },

  'cursor-blink-cycle': function(v) {
    if (v instanceof Array &&
        typeof v[0] == 'number' &&
        typeof v[1] == 'number') {
      this.cursorBlinkCycle_ = v;
    } else if (typeof v == 'number') {
      this.cursorBlinkCycle_ = [v, v];
    } else {
      // Fast blink indicates an error.
      this.cursorBlinkCycle_ = [100, 100];
    }
  },

  'cursor-color': function(v) {
    this.setCursorColor(v);
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

    this.primaryScreen_.textAttributes.resetColorPalette();
    this.alternateScreen_.textAttributes.resetColorPalette();
  },

  'copy-on-select': function(v) {
    this.copyOnSelect = !!v;
  },

  'use-default-window-copy': function(v) {
    this.useDefaultWindowCopy = !!v;
  },

  'clear-selection-after-copy': function(v) {
    this.clearSelectionAfterCopy = !!v;
  },

  'ctrl-plus-minus-zero-zoom': function(v) {
    this.keyboard.ctrlPlusMinusZeroZoom = v;
  },

  'ctrl-c-copy': function(v) {
    this.keyboard.ctrlCCopy = v;
  },

  'ctrl-v-paste': function(v) {
    this.keyboard.ctrlVPaste = v;
    this.scrollPort_.setCtrlVPaste(v);
  },

  'east-asian-ambiguous-as-two-column': function(v) {
    i18n.wc.regardCjkAmbiguous = v;
  },

  'enable-8-bit-control': function(v) {
    this.vt.enable8BitControl = !!v;
  },

  'enable-bold': function(v) {
    this.setBoldSafeState(v);
  },

  'enable-bold-as-bright': function(v) {
    this.primaryScreen_.textAttributes.enableBoldAsBright = !!v;
    this.alternateScreen_.textAttributes.enableBoldAsBright = !!v;
  },

  'enable-clipboard-write': function(v) {
    this.vt.enableClipboardWrite = !!v;
  },

  'enable-dec12': function(v) {
    this.vt.enableDec12 = !!v;
  },

  'font-family': function(v) {
    this.setFontFamily(v);
  },

  'font-size': function(v) {
    this.setFontSize(v);
  },

  'font-smoothing': function(v) {
    this.setFontSmoothing(v);
  },

  'foreground-color': function(v) {
    this.setForegroundColor(v);
  },

  'home-keys-scroll': function(v) {
    this.keyboard.homeKeysScroll = v;
  },

  'max-string-sequence': function(v) {
    this.vt.maxStringSequence = v;
  },

  'media-keys-are-fkeys': function(v) {
    this.keyboard.mediaKeysAreFKeys = v;
  },

  'meta-sends-escape': function(v) {
    this.keyboard.metaSendsEscape = v;
  },

  'mouse-paste-button': function(v) {
    this.setMousePasteButton(v);
  },

  'page-keys-scroll': function(v) {
    this.keyboard.pageKeysScroll = v;
  },

  'pass-alt-number': function(v) {
    this.passAltNumber = v;
  },

  'pass-ctrl-number': function(v) {
    this.passCtrlNumber = v;
  },

  'pass-meta-number': function(v) {
    this.passMetaNumber = v;
  },

  'pass-meta-v': function(v) {
    this.keyboard.passMetaV = v;
  },

  'receive-encoding': function(v) {
    if (!(/^(utf-8|raw)$/).test(v)) {
      console.warn('Invalid value for "receive-encoding": ' + v);
      v = 'utf-8';
    }

    this.vt.characterEncoding = v;
  },

  'scroll-on-keystroke': function(v) {
    this.scrollOnKeystroke_ = v;
  },

  'scroll-on-output': function(v) {
    this.scrollOnOutput_ = v;
  },

  'scrollbar-visible': function(v) {
    this.setScrollbarVisible(v);
  },

  'send-encoding': function(v) {
    if (!(/^(utf-8|raw)$/).test(v)) {
      console.warn('Invalid value for "send-encoding": ' + v);
      v = 'utf-8';
    }

    this.keyboard.characterEncoding = v;
  },

  'shift-insert-paste': function(v) {
    this.keyboard.shiftInsertPaste = v;
  },

  'user-css': function(v) {
    this.scrollPort_.setUserCss(v);
  }
};

export default terminalConfigObservers;
