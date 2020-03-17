// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * Constructor for the Terminal class.
 *
 * A Terminal pulls together the hterm.ScrollPort, hterm.Screen and hterm.VT100
 * classes to provide the complete terminal functionality.
 *
 * There are a number of lower-level Terminal methods that can be called
 * directly to manipulate the cursor, text, scroll region, and other terminal
 * attributes.  However, the primary method is interpret(), which parses VT
 * escape sequences and invokes the appropriate Terminal methods.
 *
 * This class was heavily influenced by Cory Maccarrone's Framebuffer class.
 *
 * TODO(rginda): Eventually we're going to need to support characters which are
 * displayed twice as wide as standard latin characters.  This is to support
 * CJK (and possibly other character sets).
 *
 * @param {?string=} profileId Optional preference profile name.  If not
 *     provided or null, defaults to 'default'.
 * @constructor
 * @implements {hterm.RowProvider}
 */
hterm.Terminal = function(profileId) {
  this.profileId_ = null;

  /** @type {?hterm.PreferenceManager} */
  this.prefs_ = null;

  // Two screen instances.
  this.primaryScreen_ = new hterm.Screen();
  this.alternateScreen_ = new hterm.Screen();

  // The "current" screen.
  this.screen_ = this.primaryScreen_;

  // The local notion of the screen size.  ScreenBuffers also have a size which
  // indicates their present size.  During size changes, the two may disagree.
  // Also, the inactive screen's size is not altered until it is made the active
  // screen.
  this.screenSize = new hterm.Size(0, 0);

  // The scroll port we'll be using to display the visible rows.
  this.scrollPort_ = new hterm.ScrollPort(this);
  this.scrollPort_.subscribe('resize', this.onResize_.bind(this));
  this.scrollPort_.subscribe('scroll', this.onScroll_.bind(this));
  this.scrollPort_.subscribe('paste', this.onPaste_.bind(this));
  this.scrollPort_.subscribe('focus', this.onScrollportFocus_.bind(this));
  this.scrollPort_.onCopy = this.onCopy_.bind(this);

  // The div that contains this terminal.
  this.div_ = null;

  // The document that contains the scrollPort.  Defaulted to the global
  // document here so that the terminal is functional even if it hasn't been
  // inserted into a document yet, but re-set in decorate().
  this.document_ = window.document;

  // The rows that have scrolled off screen and are no longer addressable.
  this.scrollbackRows_ = [];

  // Saved tab stops.
  this.tabStops_ = [];

  // Keep track of whether default tab stops have been erased; after a TBC
  // clears all tab stops, defaults aren't restored on resize until a reset.
  this.defaultTabStops = true;

  // The VT's notion of the top and bottom rows.  Used during some VT
  // cursor positioning and scrolling commands.
  this.vtScrollTop_ = null;
  this.vtScrollBottom_ = null;

  // The DIV element for the visible cursor.
  this.cursorNode_ = null;

  // The current cursor shape of the terminal.
  this.cursorShape_ = hterm.Terminal.cursorShape.BLOCK;

  // Cursor blink on/off cycle in ms, overwritten by prefs once they're loaded.
  this.cursorBlinkCycle_ = [100, 100];

  // Whether to temporarily disable blinking.
  this.cursorBlinkPause_ = false;

  // Pre-bound onCursorBlink_ handler, so we don't have to do this for each
  // cursor on/off servicing.
  this.myOnCursorBlink_ = this.onCursorBlink_.bind(this);

  // These prefs are cached so we don't have to read from local storage with
  // each output and keystroke.  They are initialized by the preference manager.
  /** @type {string} */
  this.backgroundColor_ = '';
  /** @type {string} */
  this.foregroundColor_ = '';
  this.scrollOnOutput_ = null;
  this.scrollOnKeystroke_ = null;
  this.scrollWheelArrowKeys_ = null;

  // True if we should override mouse event reporting to allow local selection.
  this.defeatMouseReports_ = false;

  // Whether to auto hide the mouse cursor when typing.
  this.setAutomaticMouseHiding();
  // Timer to keep mouse visible while it's being used.
  this.mouseHideDelay_ = null;

  // Terminal bell sound.
  this.bellAudio_ = this.document_.createElement('audio');
  this.bellAudio_.id = 'hterm:bell-audio';
  this.bellAudio_.setAttribute('preload', 'auto');

  // The AccessibilityReader object for announcing command output.
  this.accessibilityReader_ = null;

  // The context menu object.
  this.contextMenu = new hterm.ContextMenu();

  // All terminal bell notifications that have been generated (not necessarily
  // shown).
  this.bellNotificationList_ = [];
  this.bellSquelchTimeout_ = null;

  // Whether we have permission to display notifications.
  this.desktopNotificationBell_ = false;

  // Cursor position and attributes saved with DECSC.
  this.savedOptions_ = {};

  // The current mode bits for the terminal.
  this.options_ = new hterm.Options();

  // Timeouts we might need to clear.
  this.timeouts_ = {};

  // The VT escape sequence interpreter.
  this.vt = new hterm.VT(this);

  this.saveCursorAndState(true);

  // The keyboard handler.
  this.keyboard = new hterm.Keyboard(this);

  // General IO interface that can be given to third parties without exposing
  // the entire terminal object.
  this.io = new hterm.Terminal.IO(this);

  // True if mouse-click-drag should scroll the terminal.
  this.enableMouseDragScroll = true;

  this.copyOnSelect = null;
  this.mouseRightClickPaste = null;
  this.mousePasteButton = null;

  // Whether to use the default window copy behavior.
  this.useDefaultWindowCopy = false;

  this.clearSelectionAfterCopy = true;

  this.realizeSize_(80, 24);
  this.setDefaultTabStops();

  // Whether we allow images to be shown.
  this.allowImagesInline = null;

  this.reportFocus = false;

  this.setProfile(profileId || 'default',
                  function() { this.onTerminalReady(); }.bind(this));
};

/**
 * Possible cursor shapes.
 */
hterm.Terminal.cursorShape = {
  BLOCK: 'BLOCK',
  BEAM: 'BEAM',
  UNDERLINE: 'UNDERLINE'
};

/**
 * Clients should override this to be notified when the terminal is ready
 * for use.
 *
 * The terminal initialization is asynchronous, and shouldn't be used before
 * this method is called.
 */
hterm.Terminal.prototype.onTerminalReady = function() { };

/**
 * Default tab with of 8 to match xterm.
 */
hterm.Terminal.prototype.tabWidth = 8;

/**
 * Select a preference profile.
 *
 * This will load the terminal preferences for the given profile name and
 * associate subsequent preference changes with the new preference profile.
 *
 * @param {string} profileId The name of the preference profile.  Forward slash
 *     characters will be removed from the name.
 * @param {function()=} opt_callback Optional callback to invoke when the
 *     profile transition is complete.
 */
hterm.Terminal.prototype.setProfile = function(profileId, opt_callback) {
  this.profileId_ = profileId.replace(/\//g, '');

  var terminal = this;

  if (this.prefs_)
    this.prefs_.deactivate();

  this.prefs_ = new hterm.PreferenceManager(this.profileId_);

  /**
   * Clears and reloads key bindings.  Used by preferences
   * 'keybindings' and 'keybindings-os-defaults'.
   *
   * @param {*} bindings
   * @param {*} useOsDefaults
   */
  function loadKeyBindings(bindings, useOsDefaults) {
    terminal.keyboard.bindings.clear();

    if (!bindings) {
      return;
    }

    if (!(bindings instanceof Object)) {
      console.error('Error in keybindings preference: Expected object');
      return;
    }

    try {
      terminal.keyboard.bindings.addBindings(bindings, !!useOsDefaults);
    } catch (ex) {
      console.error('Error in keybindings preference: ' + ex);
    }
  }

  this.prefs_.addObservers(null, {
    'alt-gr-mode': function(v) {
      if (v == null) {
        if (navigator.language.toLowerCase() == 'en-us') {
          v = 'none';
        } else {
          v = 'right-alt';
        }
      } else if (typeof v == 'string') {
        v = v.toLowerCase();
      } else {
        v = 'none';
      }

      if (!/^(none|ctrl-alt|left-alt|right-alt)$/.test(v))
        v = 'none';

      terminal.keyboard.altGrMode = v;
    },

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
      var ary = v.match(/^lib-resource:(\S+)/);
      if (ary) {
        terminal.bellAudio_.setAttribute('src',
                                         lib.resource.getDataUrl(ary[1]));
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

    'character-map-overrides': function(v) {
      if (!(v == null || v instanceof Object)) {
        console.warn('Preference character-map-modifications is not an ' +
                     'object: ' + v);
        return;
      }

      terminal.vt.characterMaps.reset();
      terminal.vt.characterMaps.setOverrides(v);
    },

    'cursor-blink': function(v) {
      terminal.setCursorBlink(!!v);
    },

    'cursor-shape': function(v) {
      terminal.setCursorShape(v);
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

      lib.colors.colorPalette = lib.colors.stockColorPalette.concat();

      if (v) {
        for (var key in v) {
          var i = parseInt(key, 10);
          if (isNaN(i) || i < 0 || i > 255) {
            console.log('Invalid value in palette: ' + key + ': ' + v[key]);
            continue;
          }

          if (v[i]) {
            var rgb = lib.colors.normalizeCSS(v[i]);
            if (rgb)
              lib.colors.colorPalette[i] = rgb;
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

    'paste-on-drop': function(v) {
      terminal.scrollPort_.setPasteOnDrop(v);
    },

    'east-asian-ambiguous-as-two-column': function(v) {
      lib.wc.regardCjkAmbiguous = v;
    },

    'enable-8-bit-control': function(v) {
      terminal.vt.enable8BitControl = !!v;
    },

    'enable-bold': function(v) {
      terminal.syncBoldSafeState();
    },

    'enable-bold-as-bright': function(v) {
      terminal.primaryScreen_.textAttributes.enableBoldAsBright = !!v;
      terminal.alternateScreen_.textAttributes.enableBoldAsBright = !!v;
    },

    'enable-blink': function(v) {
      terminal.setTextBlink(!!v);
    },

    'enable-clipboard-write': function(v) {
      terminal.vt.enableClipboardWrite = !!v;
    },

    'enable-dec12': function(v) {
      terminal.vt.enableDec12 = !!v;
    },

    'enable-csi-j-3': function(v) {
      terminal.vt.enableCsiJ3 = !!v;
    },

    'font-family': function(v) {
      terminal.syncFontFamily();
    },

    'font-size': function(v) {
      v = parseInt(v, 10);
      if (v <= 0) {
        console.error(`Invalid font size: ${v}`);
        return;
      }

      terminal.setFontSize(v);
    },

    'font-smoothing': function(v) {
      terminal.syncFontFamily();
    },

    'foreground-color': function(v) {
      terminal.setForegroundColor(v);
    },

    'hide-mouse-while-typing': function(v) {
      terminal.setAutomaticMouseHiding(v);
    },

    'home-keys-scroll': function(v) {
      terminal.keyboard.homeKeysScroll = v;
    },

    'keybindings': function(v) {
      loadKeyBindings(v, terminal.prefs_.get('keybindings-os-defaults'));
    },

    'keybindings-os-defaults': function(v) {
      loadKeyBindings(terminal.prefs_.get('keybindings'), v);
    },

    'media-keys-are-fkeys': function(v) {
      terminal.keyboard.mediaKeysAreFKeys = v;
    },

    'meta-sends-escape': function(v) {
      terminal.keyboard.metaSendsEscape = v;
    },

    'mouse-right-click-paste': function(v) {
      terminal.mouseRightClickPaste = v;
    },

    'mouse-paste-button': function(v) {
      terminal.syncMousePasteButton();
    },

    'page-keys-scroll': function(v) {
      terminal.keyboard.pageKeysScroll = v;
    },

    'pass-alt-number': function(v) {
      if (v == null) {
        // Let Alt+1..9 pass to the browser (to control tab switching) on
        // non-OS X systems, or if hterm is not opened in an app window.
        v = (hterm.os != 'mac' && hterm.windowType != 'popup');
      }

      terminal.passAltNumber = v;
    },

    'pass-ctrl-number': function(v) {
      if (v == null) {
        // Let Ctrl+1..9 pass to the browser (to control tab switching) on
        // non-OS X systems, or if hterm is not opened in an app window.
        v = (hterm.os != 'mac' && hterm.windowType != 'popup');
      }

      terminal.passCtrlNumber = v;
    },

    'pass-ctrl-n': function(v) {
      terminal.passCtrlN = v;
    },

    'pass-ctrl-t': function(v) {
      terminal.passCtrlT = v;
    },

    'pass-ctrl-tab': function(v) {
      terminal.passCtrlTab = v;
    },

    'pass-ctrl-w': function(v) {
      terminal.passCtrlW = v;
    },

    'pass-meta-number': function(v) {
      if (v == null) {
        // Let Meta+1..9 pass to the browser (to control tab switching) on
        // OS X systems, or if hterm is not opened in an app window.
        v = (hterm.os == 'mac' && hterm.windowType != 'popup');
      }

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

    'scroll-wheel-may-send-arrow-keys': function(v) {
      terminal.scrollWheelArrowKeys_ = v;
    },

    'scroll-wheel-move-multiplier': function(v) {
      terminal.setScrollWheelMoveMultipler(v);
    },

    'shift-insert-paste': function(v) {
      terminal.keyboard.shiftInsertPaste = v;
    },

    'terminal-encoding': function(v) {
      terminal.vt.setEncoding(v);
    },

    'user-css': function(v) {
      terminal.scrollPort_.setUserCssUrl(v);
    },

    'user-css-text': function(v) {
      terminal.scrollPort_.setUserCssText(v);
    },

    'word-break-match-left': function(v) {
      terminal.primaryScreen_.wordBreakMatchLeft = v;
      terminal.alternateScreen_.wordBreakMatchLeft = v;
    },

    'word-break-match-right': function(v) {
      terminal.primaryScreen_.wordBreakMatchRight = v;
      terminal.alternateScreen_.wordBreakMatchRight = v;
    },

    'word-break-match-middle': function(v) {
      terminal.primaryScreen_.wordBreakMatchMiddle = v;
      terminal.alternateScreen_.wordBreakMatchMiddle = v;
    },

    'allow-images-inline': function(v) {
      terminal.allowImagesInline = v;
    },
  });

  this.prefs_.readStorage(function() {
    this.prefs_.notifyAll();

    if (opt_callback)
      opt_callback();
  }.bind(this));
};

/**
 * Returns the preferences manager used for configuring this terminal.
 *
 * @return {!hterm.PreferenceManager}
 */
hterm.Terminal.prototype.getPrefs = function() {
  return lib.notNull(this.prefs_);
};

/**
 * Enable or disable bracketed paste mode.
 *
 * @param {boolean} state The value to set.
 */
hterm.Terminal.prototype.setBracketedPaste = function(state) {
  this.options_.bracketedPaste = state;
};

/**
 * Set the color for the cursor.
 *
 * If you want this setting to persist, set it through prefs_, rather than
 * with this method.
 *
 * @param {string=} color The color to set.  If not defined, we reset to the
 *     saved user preference.
 */
hterm.Terminal.prototype.setCursorColor = function(color) {
  if (color === undefined)
    color = this.prefs_.getString('cursor-color');

  this.setCssVar('cursor-color', color);
};

/**
 * Return the current cursor color as a string.
 *
 * @return {string}
 */
hterm.Terminal.prototype.getCursorColor = function() {
  return this.getCssVar('cursor-color');
};

/**
 * Enable or disable mouse based text selection in the terminal.
 *
 * @param {boolean} state The value to set.
 */
hterm.Terminal.prototype.setSelectionEnabled = function(state) {
  this.enableMouseDragScroll = state;
};

/**
 * Set the background color.
 *
 * If you want this setting to persist, set it through prefs_, rather than
 * with this method.
 *
 * @param {string=} color The color to set.  If not defined, we reset to the
 *     saved user preference.
 */
hterm.Terminal.prototype.setBackgroundColor = function(color) {
  if (color === undefined)
    color = this.prefs_.getString('background-color');

  this.backgroundColor_ = lib.colors.normalizeCSS(color) || '';
  this.primaryScreen_.textAttributes.setDefaults(
      this.foregroundColor_, this.backgroundColor_);
  this.alternateScreen_.textAttributes.setDefaults(
      this.foregroundColor_, this.backgroundColor_);
  this.scrollPort_.setBackgroundColor(color);
};

/**
 * Return the current terminal background color.
 *
 * Intended for use by other classes, so we don't have to expose the entire
 * prefs_ object.
 *
 * @return {string}
 */
hterm.Terminal.prototype.getBackgroundColor = function() {
  return lib.notNull(this.backgroundColor_);
};

/**
 * Set the foreground color.
 *
 * If you want this setting to persist, set it through prefs_, rather than
 * with this method.
 *
 * @param {string=} color The color to set.  If not defined, we reset to the
 *     saved user preference.
 */
hterm.Terminal.prototype.setForegroundColor = function(color) {
  if (color === undefined)
    color = this.prefs_.getString('foreground-color');

  this.foregroundColor_ = lib.colors.normalizeCSS(color) || '';
  this.primaryScreen_.textAttributes.setDefaults(
      this.foregroundColor_, this.backgroundColor_);
  this.alternateScreen_.textAttributes.setDefaults(
      this.foregroundColor_, this.backgroundColor_);
  this.scrollPort_.setForegroundColor(color);
};

/**
 * Return the current terminal foreground color.
 *
 * Intended for use by other classes, so we don't have to expose the entire
 * prefs_ object.
 *
 * @return {string}
 */
hterm.Terminal.prototype.getForegroundColor = function() {
  return lib.notNull(this.foregroundColor_);
};

/**
 * Create a new instance of a terminal command and run it with a given
 * argument string.
 *
 * @param {!Function} commandClass The constructor for a terminal command.
 * @param {string} commandName The command to run for this terminal.
 * @param {!Array<string>} args The arguments to pass to the command.
 */
hterm.Terminal.prototype.runCommandClass = function(
    commandClass, commandName, args) {
  var environment = this.prefs_.get('environment');
  if (typeof environment != 'object' || environment == null)
    environment = {};

  var self = this;
  this.command = new commandClass(
      {
        commandName: commandName,
        args: args,
        io: this.io.push(),
        environment: environment,
        onExit: function(code) {
          self.io.pop();
          self.uninstallKeyboard();
          self.div_.dispatchEvent(new CustomEvent('terminal-closing'));
          if (self.prefs_.get('close-on-exit'))
              window.close();
        }
      });

  this.installKeyboard();
  this.command.run();
};

/**
 * Returns true if the current screen is the primary screen, false otherwise.
 *
 * @return {boolean}
 */
hterm.Terminal.prototype.isPrimaryScreen = function() {
  return this.screen_ == this.primaryScreen_;
};

/**
 * Install the keyboard handler for this terminal.
 *
 * This will prevent the browser from seeing any keystrokes sent to the
 * terminal.
 */
hterm.Terminal.prototype.installKeyboard = function() {
  this.keyboard.installKeyboard(this.scrollPort_.getDocument().body);
};

/**
 * Uninstall the keyboard handler for this terminal.
 */
hterm.Terminal.prototype.uninstallKeyboard = function() {
  this.keyboard.installKeyboard(null);
};

/**
 * Set a CSS variable.
 *
 * Normally this is used to set variables in the hterm namespace.
 *
 * @param {string} name The variable to set.
 * @param {string|number} value The value to assign to the variable.
 * @param {string=} opt_prefix The variable namespace/prefix to use.
 */
hterm.Terminal.prototype.setCssVar = function(name, value,
                                              opt_prefix='--hterm-') {
  this.document_.documentElement.style.setProperty(
      `${opt_prefix}${name}`, value.toString());
};

/**
 * Get a CSS variable.
 *
 * Normally this is used to get variables in the hterm namespace.
 *
 * @param {string} name The variable to read.
 * @param {string=} opt_prefix The variable namespace/prefix to use.
 * @return {string} The current setting for this variable.
 */
hterm.Terminal.prototype.getCssVar = function(name, opt_prefix='--hterm-') {
  return this.document_.documentElement.style.getPropertyValue(
      `${opt_prefix}${name}`);
};

/**
 * Update CSS character size variables to match the scrollport.
 */
hterm.Terminal.prototype.updateCssCharsize_ = function() {
  this.setCssVar('charsize-width', this.scrollPort_.characterSize.width + 'px');
  this.setCssVar('charsize-height',
                 this.scrollPort_.characterSize.height + 'px');
};

/**
 * Set the font size for this terminal.
 *
 * Call setFontSize(0) to reset to the default font size.
 *
 * This function does not modify the font-size preference.
 *
 * @param {number} px The desired font size, in pixels.
 */
hterm.Terminal.prototype.setFontSize = function(px) {
  if (px <= 0)
    px = this.prefs_.getNumber('font-size');

  this.scrollPort_.setFontSize(px);
  this.updateCssCharsize_();
};

/**
 * Get the current font size.
 *
 * @return {number}
 */
hterm.Terminal.prototype.getFontSize = function() {
  return this.scrollPort_.getFontSize();
};

/**
 * Get the current font family.
 *
 * @return {string}
 */
hterm.Terminal.prototype.getFontFamily = function() {
  return this.scrollPort_.getFontFamily();
};

/**
 * Set the CSS "font-family" for this terminal.
 */
hterm.Terminal.prototype.syncFontFamily = function() {
  this.scrollPort_.setFontFamily(this.prefs_.getString('font-family'),
                                 this.prefs_.getString('font-smoothing'));
  this.updateCssCharsize_();
  this.syncBoldSafeState();
};

/**
 * Set this.mousePasteButton based on the mouse-paste-button pref,
 * autodetecting if necessary.
 */
hterm.Terminal.prototype.syncMousePasteButton = function() {
  var button = this.prefs_.get('mouse-paste-button');
  if (typeof button == 'number') {
    this.mousePasteButton = button;
    return;
  }

  if (hterm.os != 'linux') {
    this.mousePasteButton = 1;  // Middle mouse button.
  } else {
    this.mousePasteButton = 2;  // Right mouse button.
  }
};

/**
 * Enable or disable bold based on the enable-bold pref, autodetecting if
 * necessary.
 */
hterm.Terminal.prototype.syncBoldSafeState = function() {
  var enableBold = this.prefs_.get('enable-bold');
  if (enableBold !== null) {
    this.primaryScreen_.textAttributes.enableBold = enableBold;
    this.alternateScreen_.textAttributes.enableBold = enableBold;
    return;
  }

  var normalSize = this.scrollPort_.measureCharacterSize();
  var boldSize = this.scrollPort_.measureCharacterSize('bold');

  var isBoldSafe = normalSize.equals(boldSize);
  if (!isBoldSafe) {
    console.warn('Bold characters disabled: Size of bold weight differs ' +
                 'from normal.  Font family is: ' +
                 this.scrollPort_.getFontFamily());
  }

  this.primaryScreen_.textAttributes.enableBold = isBoldSafe;
  this.alternateScreen_.textAttributes.enableBold = isBoldSafe;
};

/**
 * Control text blinking behavior.
 *
 * @param {boolean=} state Whether to enable support for blinking text.
 */
hterm.Terminal.prototype.setTextBlink = function(state) {
  if (state === undefined)
    state = this.prefs_.getBoolean('enable-blink');
  this.setCssVar('blink-node-duration', state ? '0.7s' : '0');
};

/**
 * Set the mouse cursor style based on the current terminal mode.
 */
hterm.Terminal.prototype.syncMouseStyle = function() {
  this.setCssVar('mouse-cursor-style',
                 this.vt.mouseReport == this.vt.MOUSE_REPORT_DISABLED ?
                     'var(--hterm-mouse-cursor-text)' :
                     'var(--hterm-mouse-cursor-default)');
};

/**
 * Return a copy of the current cursor position.
 *
 * @return {!hterm.RowCol} The RowCol object representing the current position.
 */
hterm.Terminal.prototype.saveCursor = function() {
  return this.screen_.cursorPosition.clone();
};

/**
 * Return the current text attributes.
 *
 * @return {!hterm.TextAttributes}
 */
hterm.Terminal.prototype.getTextAttributes = function() {
  return this.screen_.textAttributes;
};

/**
 * Set the text attributes.
 *
 * @param {!hterm.TextAttributes} textAttributes The attributes to set.
 */
hterm.Terminal.prototype.setTextAttributes = function(textAttributes) {
  this.screen_.textAttributes = textAttributes;
};

/**
 * Return the current browser zoom factor applied to the terminal.
 *
 * @return {number} The current browser zoom factor.
 */
hterm.Terminal.prototype.getZoomFactor = function() {
  return this.scrollPort_.characterSize.zoomFactor;
};

/**
 * Change the title of this terminal's window.
 *
 * @param {string} title The title to set.
 */
hterm.Terminal.prototype.setWindowTitle = function(title) {
  window.document.title = title;
};

/**
 * Restore a previously saved cursor position.
 *
 * @param {!hterm.RowCol} cursor The position to restore.
 */
hterm.Terminal.prototype.restoreCursor = function(cursor) {
  var row = lib.f.clamp(cursor.row, 0, this.screenSize.height - 1);
  var column = lib.f.clamp(cursor.column, 0, this.screenSize.width - 1);
  this.screen_.setCursorPosition(row, column);
  if (cursor.column > column ||
      cursor.column == column && cursor.overflow) {
    this.screen_.cursorPosition.overflow = true;
  }
};

/**
 * Clear the cursor's overflow flag.
 */
hterm.Terminal.prototype.clearCursorOverflow = function() {
  this.screen_.cursorPosition.overflow = false;
};

/**
 * Save the current cursor state to the corresponding screens.
 *
 * See the hterm.Screen.CursorState class for more details.
 *
 * @param {boolean=} both If true, update both screens, else only update the
 *     current screen.
 */
hterm.Terminal.prototype.saveCursorAndState = function(both) {
  if (both) {
    this.primaryScreen_.saveCursorAndState(this.vt);
    this.alternateScreen_.saveCursorAndState(this.vt);
  } else
    this.screen_.saveCursorAndState(this.vt);
};

/**
 * Restore the saved cursor state in the corresponding screens.
 *
 * See the hterm.Screen.CursorState class for more details.
 *
 * @param {boolean=} both If true, update both screens, else only update the
 *     current screen.
 */
hterm.Terminal.prototype.restoreCursorAndState = function(both) {
  if (both) {
    this.primaryScreen_.restoreCursorAndState(this.vt);
    this.alternateScreen_.restoreCursorAndState(this.vt);
  } else
    this.screen_.restoreCursorAndState(this.vt);
};

/**
 * Sets the cursor shape
 *
 * @param {string} shape The shape to set.
 */
hterm.Terminal.prototype.setCursorShape = function(shape) {
  this.cursorShape_ = shape;
  this.restyleCursor_();
};

/**
 * Get the cursor shape
 *
 * @return {string}
 */
hterm.Terminal.prototype.getCursorShape = function() {
  return this.cursorShape_;
};

/**
 * Set the width of the terminal, resizing the UI to match.
 *
 * @param {?number} columnCount
 */
hterm.Terminal.prototype.setWidth = function(columnCount) {
  if (columnCount == null) {
    this.div_.style.width = '100%';
    return;
  }

  this.div_.style.width = Math.ceil(
      this.scrollPort_.characterSize.width *
      columnCount + this.scrollPort_.currentScrollbarWidthPx) + 'px';
  this.realizeSize_(columnCount, this.screenSize.height);
  this.scheduleSyncCursorPosition_();
};

/**
 * Set the height of the terminal, resizing the UI to match.
 *
 * @param {?number} rowCount The height in rows.
 */
hterm.Terminal.prototype.setHeight = function(rowCount) {
  if (rowCount == null) {
    this.div_.style.height = '100%';
    return;
  }

  this.div_.style.height =
      this.scrollPort_.characterSize.height * rowCount + 'px';
  this.realizeSize_(this.screenSize.width, rowCount);
  this.scheduleSyncCursorPosition_();
};

/**
 * Deal with terminal size changes.
 *
 * @param {number} columnCount The number of columns.
 * @param {number} rowCount The number of rows.
 */
hterm.Terminal.prototype.realizeSize_ = function(columnCount, rowCount) {
  let notify = false;

  if (columnCount != this.screenSize.width) {
    notify = true;
    this.realizeWidth_(columnCount);
  }

  if (rowCount != this.screenSize.height) {
    notify = true;
    this.realizeHeight_(rowCount);
  }

  // Send new terminal size to plugin.
  if (notify) {
    this.io.onTerminalResize_(columnCount, rowCount);
  }
};

/**
 * Deal with terminal width changes.
 *
 * This function does what needs to be done when the terminal width changes
 * out from under us.  It happens here rather than in onResize_() because this
 * code may need to run synchronously to handle programmatic changes of
 * terminal width.
 *
 * Relying on the browser to send us an async resize event means we may not be
 * in the correct state yet when the next escape sequence hits.
 *
 * @param {number} columnCount The number of columns.
 */
hterm.Terminal.prototype.realizeWidth_ = function(columnCount) {
  if (columnCount <= 0)
    throw new Error('Attempt to realize bad width: ' + columnCount);

  var deltaColumns = columnCount - this.screen_.getWidth();
  if (deltaColumns == 0) {
    // No change, so don't bother recalculating things.
    return;
  }

  this.screenSize.width = columnCount;
  this.screen_.setColumnCount(columnCount);

  if (deltaColumns > 0) {
    if (this.defaultTabStops)
      this.setDefaultTabStops(this.screenSize.width - deltaColumns);
  } else {
    for (var i = this.tabStops_.length - 1; i >= 0; i--) {
      if (this.tabStops_[i] < columnCount)
        break;

      this.tabStops_.pop();
    }
  }

  this.screen_.setColumnCount(this.screenSize.width);
};

/**
 * Deal with terminal height changes.
 *
 * This function does what needs to be done when the terminal height changes
 * out from under us.  It happens here rather than in onResize_() because this
 * code may need to run synchronously to handle programmatic changes of
 * terminal height.
 *
 * Relying on the browser to send us an async resize event means we may not be
 * in the correct state yet when the next escape sequence hits.
 *
 * @param {number} rowCount The number of rows.
 */
hterm.Terminal.prototype.realizeHeight_ = function(rowCount) {
  if (rowCount <= 0)
    throw new Error('Attempt to realize bad height: ' + rowCount);

  var deltaRows = rowCount - this.screen_.getHeight();
  if (deltaRows == 0) {
    // No change, so don't bother recalculating things.
    return;
  }

  this.screenSize.height = rowCount;

  var cursor = this.saveCursor();

  if (deltaRows < 0) {
    // Screen got smaller.
    deltaRows *= -1;
    while (deltaRows) {
      var lastRow = this.getRowCount() - 1;
      if (lastRow - this.scrollbackRows_.length == cursor.row)
        break;

      if (this.getRowText(lastRow))
        break;

      this.screen_.popRow();
      deltaRows--;
    }

    var ary = this.screen_.shiftRows(deltaRows);
    this.scrollbackRows_.push.apply(this.scrollbackRows_, ary);

    // We just removed rows from the top of the screen, we need to update
    // the cursor to match.
    cursor.row = Math.max(cursor.row - deltaRows, 0);
  } else if (deltaRows > 0) {
    // Screen got larger.

    if (deltaRows <= this.scrollbackRows_.length) {
      var scrollbackCount = Math.min(deltaRows, this.scrollbackRows_.length);
      var rows = this.scrollbackRows_.splice(
          this.scrollbackRows_.length - scrollbackCount, scrollbackCount);
      this.screen_.unshiftRows(rows);
      deltaRows -= scrollbackCount;
      cursor.row += scrollbackCount;
    }

    if (deltaRows)
      this.appendRows_(deltaRows);
  }

  this.setVTScrollRegion(null, null);
  this.restoreCursor(cursor);
};

/**
 * Scroll the terminal to the top of the scrollback buffer.
 */
hterm.Terminal.prototype.scrollHome = function() {
  this.scrollPort_.scrollRowToTop(0);
};

/**
 * Scroll the terminal to the end.
 */
hterm.Terminal.prototype.scrollEnd = function() {
  this.scrollPort_.scrollRowToBottom(this.getRowCount());
};

/**
 * Scroll the terminal one page up (minus one line) relative to the current
 * position.
 */
hterm.Terminal.prototype.scrollPageUp = function() {
  this.scrollPort_.scrollPageUp();
};

/**
 * Scroll the terminal one page down (minus one line) relative to the current
 * position.
 */
hterm.Terminal.prototype.scrollPageDown = function() {
  this.scrollPort_.scrollPageDown();
};

/**
 * Scroll the terminal one line up relative to the current position.
 */
hterm.Terminal.prototype.scrollLineUp = function() {
  var i = this.scrollPort_.getTopRowIndex();
  this.scrollPort_.scrollRowToTop(i - 1);
};

/**
 * Scroll the terminal one line down relative to the current position.
 */
hterm.Terminal.prototype.scrollLineDown = function() {
  var i = this.scrollPort_.getTopRowIndex();
  this.scrollPort_.scrollRowToTop(i + 1);
};

/**
 * Clear primary screen, secondary screen, and the scrollback buffer.
 */
hterm.Terminal.prototype.wipeContents = function() {
  this.clearHome(this.primaryScreen_);
  this.clearHome(this.alternateScreen_);

  this.clearScrollback();
};

/**
 * Clear scrollback buffer.
 */
hterm.Terminal.prototype.clearScrollback = function() {
  // Move to the end of the buffer in case the screen was scrolled back.
  // We're going to throw it away which would leave the display invalid.
  this.scrollEnd();

  this.scrollbackRows_.length = 0;
  this.scrollPort_.resetCache();

  [this.primaryScreen_, this.alternateScreen_].forEach((screen) => {
    const bottom = screen.getHeight();
    this.renumberRows_(0, bottom, screen);
  });

  this.syncCursorPosition_();
  this.scrollPort_.invalidate();
};

/**
 * Full terminal reset.
 *
 * Perform a full reset to the default values listed in
 * https://vt100.net/docs/vt510-rm/RIS.html
 */
hterm.Terminal.prototype.reset = function() {
  this.vt.reset();

  this.clearAllTabStops();
  this.setDefaultTabStops();

  const resetScreen = (screen) => {
    // We want to make sure to reset the attributes before we clear the screen.
    // The attributes might be used to initialize default/empty rows.
    screen.textAttributes.reset();
    screen.textAttributes.resetColorPalette();
    this.clearHome(screen);
    screen.saveCursorAndState(this.vt);
  };
  resetScreen(this.primaryScreen_);
  resetScreen(this.alternateScreen_);

  // Reset terminal options to their default values.
  this.options_ = new hterm.Options();
  this.setCursorBlink(!!this.prefs_.get('cursor-blink'));

  this.setVTScrollRegion(null, null);

  this.setCursorVisible(true);
};

/**
 * Soft terminal reset.
 *
 * Perform a soft reset to the default values listed in
 * http://www.vt100.net/docs/vt510-rm/DECSTR#T5-9
 */
hterm.Terminal.prototype.softReset = function() {
  this.vt.reset();

  // Reset terminal options to their default values.
  this.options_ = new hterm.Options();

  // We show the cursor on soft reset but do not alter the blink state.
  this.options_.cursorBlink = !!this.timeouts_.cursorBlink;

  const resetScreen = (screen) => {
    // Xterm also resets the color palette on soft reset, even though it doesn't
    // seem to be documented anywhere.
    screen.textAttributes.reset();
    screen.textAttributes.resetColorPalette();
    screen.saveCursorAndState(this.vt);
  };
  resetScreen(this.primaryScreen_);
  resetScreen(this.alternateScreen_);

  // The xterm man page explicitly says this will happen on soft reset.
  this.setVTScrollRegion(null, null);

  // Xterm also shows the cursor on soft reset, but does not alter the blink
  // state.
  this.setCursorVisible(true);
};

/**
 * Move the cursor forward to the next tab stop, or to the last column
 * if no more tab stops are set.
 */
hterm.Terminal.prototype.forwardTabStop = function() {
  var column = this.screen_.cursorPosition.column;

  for (var i = 0; i < this.tabStops_.length; i++) {
    if (this.tabStops_[i] > column) {
      this.setCursorColumn(this.tabStops_[i]);
      return;
    }
  }

  // xterm does not clear the overflow flag on HT or CHT.
  var overflow = this.screen_.cursorPosition.overflow;
  this.setCursorColumn(this.screenSize.width - 1);
  this.screen_.cursorPosition.overflow = overflow;
};

/**
 * Move the cursor backward to the previous tab stop, or to the first column
 * if no previous tab stops are set.
 */
hterm.Terminal.prototype.backwardTabStop = function() {
  var column = this.screen_.cursorPosition.column;

  for (var i = this.tabStops_.length - 1; i >= 0; i--) {
    if (this.tabStops_[i] < column) {
      this.setCursorColumn(this.tabStops_[i]);
      return;
    }
  }

  this.setCursorColumn(1);
};

/**
 * Set a tab stop at the given column.
 *
 * @param {number} column Zero based column.
 */
hterm.Terminal.prototype.setTabStop = function(column) {
  for (var i = this.tabStops_.length - 1; i >= 0; i--) {
    if (this.tabStops_[i] == column)
      return;

    if (this.tabStops_[i] < column) {
      this.tabStops_.splice(i + 1, 0, column);
      return;
    }
  }

  this.tabStops_.splice(0, 0, column);
};

/**
 * Clear the tab stop at the current cursor position.
 *
 * No effect if there is no tab stop at the current cursor position.
 */
hterm.Terminal.prototype.clearTabStopAtCursor = function() {
  var column = this.screen_.cursorPosition.column;

  var i = this.tabStops_.indexOf(column);
  if (i == -1)
    return;

  this.tabStops_.splice(i, 1);
};

/**
 * Clear all tab stops.
 */
hterm.Terminal.prototype.clearAllTabStops = function() {
  this.tabStops_.length = 0;
  this.defaultTabStops = false;
};

/**
 * Set up the default tab stops, starting from a given column.
 *
 * This sets a tabstop every (column % this.tabWidth) column, starting
 * from the specified column, or 0 if no column is provided.  It also flags
 * future resizes to set them up.
 *
 * This does not clear the existing tab stops first, use clearAllTabStops
 * for that.
 *
 * @param {number=} opt_start Optional starting zero based starting column,
 *     useful for filling out missing tab stops when the terminal is resized.
 */
hterm.Terminal.prototype.setDefaultTabStops = function(opt_start) {
  var start = opt_start || 0;
  var w = this.tabWidth;
  // Round start up to a default tab stop.
  start = start - 1 - ((start - 1) % w) + w;
  for (var i = start; i < this.screenSize.width; i += w) {
    this.setTabStop(i);
  }

  this.defaultTabStops = true;
};

/**
 * Interpret a sequence of characters.
 *
 * Incomplete escape sequences are buffered until the next call.
 *
 * @param {string} str Sequence of characters to interpret or pass through.
 */
hterm.Terminal.prototype.interpret = function(str) {
  this.scheduleSyncCursorPosition_();
  this.vt.interpret(str);
};

/**
 * Take over the given DIV for use as the terminal display.
 *
 * @param {!Element} div The div to use as the terminal display.
 */
hterm.Terminal.prototype.decorate = function(div) {
  const charset = div.ownerDocument.characterSet.toLowerCase();
  if (charset != 'utf-8') {
    console.warn(`Document encoding should be set to utf-8, not "${charset}";` +
                 ` Add <meta charset='utf-8'/> to your HTML <head> to fix.`);
  }

  this.div_ = div;

  this.accessibilityReader_ = new hterm.AccessibilityReader(div);

  this.scrollPort_.decorate(div, () => this.setupScrollPort_());
};

/**
 * Initialisation of ScrollPort properties which need to be set after its DOM
 * has been initialised.
 *
 * @private
 */
hterm.Terminal.prototype.setupScrollPort_ = function() {
  this.scrollPort_.setBackgroundImage(
      this.prefs_.getString('background-image'));
  this.scrollPort_.setBackgroundSize(this.prefs_.getString('background-size'));
  this.scrollPort_.setBackgroundPosition(
      this.prefs_.getString('background-position'));
  this.scrollPort_.setUserCssUrl(this.prefs_.getString('user-css'));
  this.scrollPort_.setUserCssText(this.prefs_.getString('user-css-text'));
  this.scrollPort_.setAccessibilityReader(
      lib.notNull(this.accessibilityReader_));

  this.div_.focus = this.focus.bind(this);

  this.setFontSize(this.prefs_.getNumber('font-size'));
  this.syncFontFamily();

  this.setScrollbarVisible(this.prefs_.getBoolean('scrollbar-visible'));
  this.setScrollWheelMoveMultipler(
      this.prefs_.getNumber('scroll-wheel-move-multiplier'));

  this.document_ = this.scrollPort_.getDocument();
  this.accessibilityReader_.decorate(this.document_);

  this.document_.body.oncontextmenu = function() { return false; };
  this.contextMenu.setDocument(this.document_);

  var onMouse = this.onMouse_.bind(this);
  var screenNode = this.scrollPort_.getScreenNode();
  screenNode.addEventListener(
      'mousedown', /** @type {!EventListener} */ (onMouse));
  screenNode.addEventListener(
      'mouseup', /** @type {!EventListener} */ (onMouse));
  screenNode.addEventListener(
      'mousemove', /** @type {!EventListener} */ (onMouse));
  this.scrollPort_.onScrollWheel = onMouse;

  screenNode.addEventListener(
      'keydown',
      /** @type {!EventListener} */ (this.onKeyboardActivity_.bind(this)));

  screenNode.addEventListener(
      'focus', this.onFocusChange_.bind(this, true));
  // Listen for mousedown events on the screenNode as in FF the focus
  // events don't bubble.
  screenNode.addEventListener('mousedown', function() {
    setTimeout(this.onFocusChange_.bind(this, true));
  }.bind(this));

  screenNode.addEventListener(
      'blur', this.onFocusChange_.bind(this, false));

  var style = this.document_.createElement('style');
  style.textContent = `
.cursor-node[focus="false"] {
  box-sizing: border-box;
  background-color: transparent !important;
  border-width: 2px;
  border-style: solid;
}
menu {
  margin: 0;
  padding: 0;
  cursor: var(--hterm-mouse-cursor-pointer);
}
menuitem {
  white-space: nowrap;
  border-bottom: 1px dashed;
  display: block;
  padding: 0.3em 0.3em 0 0.3em;
}
menuitem.separator {
  border-bottom: none;
  height: 0.5em;
  padding: 0;
}
menuitem:hover {
  color: var(--hterm-cursor-color);
}
.wc-node {
  display: inline-block;
  text-align: center;
  width: calc(var(--hterm-charsize-width) * 2);
  line-height: var(--hterm-charsize-height);
}
:root {
  --hterm-charsize-width: ${this.scrollPort_.characterSize.width}px;
  --hterm-charsize-height: ${this.scrollPort_.characterSize.height}px;
  /* Default position hides the cursor for when the window is initializing. */
  --hterm-cursor-offset-col: -1;
  --hterm-cursor-offset-row: -1;
  --hterm-blink-node-duration: 0.7s;
  --hterm-mouse-cursor-default: default;
  --hterm-mouse-cursor-text: text;
  --hterm-mouse-cursor-pointer: pointer;
  --hterm-mouse-cursor-style: var(--hterm-mouse-cursor-text);
}
.uri-node:hover {
  text-decoration: underline;
  cursor: var(--hterm-mouse-cursor-pointer);
}
@keyframes blink {
  from { opacity: 1.0; }
  to { opacity: 0.0; }
}
.blink-node {
  animation-name: blink;
  animation-duration: var(--hterm-blink-node-duration);
  animation-iteration-count: infinite;
  animation-timing-function: ease-in-out;
  animation-direction: alternate;
}`;
  // Insert this stock style as the first node so that any user styles will
  // override w/out having to use !important everywhere.  The rules above mix
  // runtime variables with default ones designed to be overridden by the user,
  // but we can wait for a concrete case from the users to determine the best
  // way to split the sheet up to before & after the user-css settings.
  this.document_.head.insertBefore(style, this.document_.head.firstChild);

  this.cursorNode_ = this.document_.createElement('div');
  this.cursorNode_.id = 'hterm:terminal-cursor';
  this.cursorNode_.className = 'cursor-node';
  this.cursorNode_.style.cssText = `
position: absolute;
left: calc(var(--hterm-charsize-width) * var(--hterm-cursor-offset-col));
top: calc(var(--hterm-charsize-height) * var(--hterm-cursor-offset-row));
display: ${this.options_.cursorVisible ? '' : 'none'};
width: var(--hterm-charsize-width);
height: var(--hterm-charsize-height);
background-color: var(--hterm-cursor-color);
border-color: var(--hterm-cursor-color);
-webkit-transition: opacity, background-color 100ms linear;
-moz-transition: opacity, background-color 100ms linear;`;

  this.setCursorColor();
  this.setCursorBlink(!!this.prefs_.get('cursor-blink'));
  this.restyleCursor_();

  this.document_.body.appendChild(this.cursorNode_);

  // When 'enableMouseDragScroll' is off we reposition this element directly
  // under the mouse cursor after a click.  This makes Chrome associate
  // subsequent mousemove events with the scroll-blocker.  Since the
  // scroll-blocker is a peer (not a child) of the scrollport, the mousemove
  // events do not cause the scrollport to scroll.
  //
  // It's a hack, but it's the cleanest way I could find.
  this.scrollBlockerNode_ = this.document_.createElement('div');
  this.scrollBlockerNode_.id = 'hterm:mouse-drag-scroll-blocker';
  this.scrollBlockerNode_.setAttribute('aria-hidden', 'true');
  this.scrollBlockerNode_.style.cssText =
      ('position: absolute;' +
       'top: -99px;' +
       'display: block;' +
       'width: 10px;' +
       'height: 10px;');
  this.document_.body.appendChild(this.scrollBlockerNode_);

  this.scrollPort_.onScrollWheel = onMouse;
  ['mousedown', 'mouseup', 'mousemove', 'click', 'dblclick',
   ].forEach(function(event) {
       this.scrollBlockerNode_.addEventListener(event, onMouse);
       this.cursorNode_.addEventListener(
           event, /** @type {!EventListener} */ (onMouse));
       this.document_.addEventListener(
           event, /** @type {!EventListener} */ (onMouse));
     }.bind(this));

  this.cursorNode_.addEventListener('mousedown', function() {
      setTimeout(this.focus.bind(this));
    }.bind(this));

  this.setReverseVideo(false);

  this.scrollPort_.focus();
  this.scrollPort_.scheduleRedraw();
};

/**
 * Return the HTML document that contains the terminal DOM nodes.
 *
 * @return {!Document}
 */
hterm.Terminal.prototype.getDocument = function() {
  return this.document_;
};

/**
 * Focus the terminal.
 */
hterm.Terminal.prototype.focus = function() {
  this.scrollPort_.focus();
};

/**
 * Unfocus the terminal.
 */
hterm.Terminal.prototype.blur = function() {
  this.scrollPort_.blur();
};

/**
 * Return the HTML Element for a given row index.
 *
 * This is a method from the RowProvider interface.  The ScrollPort uses
 * it to fetch rows on demand as they are scrolled into view.
 *
 * TODO(rginda): Consider saving scrollback rows as (HTML source, text content)
 * pairs to conserve memory.
 *
 * @param {number} index The zero-based row index, measured relative to the
 *     start of the scrollback buffer.  On-screen rows will always have the
 *     largest indices.
 * @return {!Element} The 'x-row' element containing for the requested row.
 * @override
 */
hterm.Terminal.prototype.getRowNode = function(index) {
  if (index < this.scrollbackRows_.length)
    return this.scrollbackRows_[index];

  var screenIndex = index - this.scrollbackRows_.length;
  return this.screen_.rowsArray[screenIndex];
};

/**
 * Return the text content for a given range of rows.
 *
 * This is a method from the RowProvider interface.  The ScrollPort uses
 * it to fetch text content on demand when the user attempts to copy their
 * selection to the clipboard.
 *
 * @param {number} start The zero-based row index to start from, measured
 *     relative to the start of the scrollback buffer.  On-screen rows will
 *     always have the largest indices.
 * @param {number} end The zero-based row index to end on, measured
 *     relative to the start of the scrollback buffer.
 * @return {string} A single string containing the text value of the range of
 *     rows.  Lines will be newline delimited, with no trailing newline.
 */
hterm.Terminal.prototype.getRowsText = function(start, end) {
  var ary = [];
  for (var i = start; i < end; i++) {
    var node = this.getRowNode(i);
    ary.push(node.textContent);
    if (i < end - 1 && !node.getAttribute('line-overflow'))
      ary.push('\n');
  }

  return ary.join('');
};

/**
 * Return the text content for a given row.
 *
 * This is a method from the RowProvider interface.  The ScrollPort uses
 * it to fetch text content on demand when the user attempts to copy their
 * selection to the clipboard.
 *
 * @param {number} index The zero-based row index to return, measured
 *     relative to the start of the scrollback buffer.  On-screen rows will
 *     always have the largest indices.
 * @return {string} A string containing the text value of the selected row.
 */
hterm.Terminal.prototype.getRowText = function(index) {
  var node = this.getRowNode(index);
  return node.textContent;
};

/**
 * Return the total number of rows in the addressable screen and in the
 * scrollback buffer of this terminal.
 *
 * This is a method from the RowProvider interface.  The ScrollPort uses
 * it to compute the size of the scrollbar.
 *
 * @return {number} The number of rows in this terminal.
 * @override
 */
hterm.Terminal.prototype.getRowCount = function() {
  return this.scrollbackRows_.length + this.screen_.rowsArray.length;
};

/**
 * Create DOM nodes for new rows and append them to the end of the terminal.
 *
 * This is the only correct way to add a new DOM node for a row.  Notice that
 * the new row is appended to the bottom of the list of rows, and does not
 * require renumbering (of the rowIndex property) of previous rows.
 *
 * If you think you want a new blank row somewhere in the middle of the
 * terminal, look into moveRows_().
 *
 * This method does not pay attention to vtScrollTop/Bottom, since you should
 * be using moveRows() in cases where they would matter.
 *
 * The cursor will be positioned at column 0 of the first inserted line.
 *
 * @param {number} count The number of rows to created.
 */
hterm.Terminal.prototype.appendRows_ = function(count) {
  var cursorRow = this.screen_.rowsArray.length;
  var offset = this.scrollbackRows_.length + cursorRow;
  for (var i = 0; i < count; i++) {
    var row = this.document_.createElement('x-row');
    row.appendChild(this.document_.createTextNode(''));
    row.rowIndex = offset + i;
    this.screen_.pushRow(row);
  }

  var extraRows = this.screen_.rowsArray.length - this.screenSize.height;
  if (extraRows > 0) {
    var ary = this.screen_.shiftRows(extraRows);
    Array.prototype.push.apply(this.scrollbackRows_, ary);
    if (this.scrollPort_.isScrolledEnd)
      this.scheduleScrollDown_();
  }

  if (cursorRow >= this.screen_.rowsArray.length)
    cursorRow = this.screen_.rowsArray.length - 1;

  this.setAbsoluteCursorPosition(cursorRow, 0);
};

/**
 * Relocate rows from one part of the addressable screen to another.
 *
 * This is used to recycle rows during VT scrolls (those which are driven
 * by VT commands, rather than by the user manipulating the scrollbar.)
 *
 * In this case, the blank lines scrolled into the scroll region are made of
 * the nodes we scrolled off.  These have their rowIndex properties carefully
 * renumbered so as not to confuse the ScrollPort.
 *
 * @param {number} fromIndex The start index.
 * @param {number} count The number of rows to move.
 * @param {number} toIndex The destination index.
 */
hterm.Terminal.prototype.moveRows_ = function(fromIndex, count, toIndex) {
  var ary = this.screen_.removeRows(fromIndex, count);
  this.screen_.insertRows(toIndex, ary);

  var start, end;
  if (fromIndex < toIndex) {
    start = fromIndex;
    end = toIndex + count;
  } else {
    start = toIndex;
    end = fromIndex + count;
  }

  this.renumberRows_(start, end);
  this.scrollPort_.scheduleInvalidate();
};

/**
 * Renumber the rowIndex property of the given range of rows.
 *
 * The start and end indices are relative to the screen, not the scrollback.
 * Rows in the scrollback buffer cannot be renumbered.  Since they are not
 * addressable (you can't delete them, scroll them, etc), you should have
 * no need to renumber scrollback rows.
 *
 * @param {number} start The start index.
 * @param {number} end The end index.
 * @param {!hterm.Screen=} opt_screen The screen to renumber.
 */
hterm.Terminal.prototype.renumberRows_ = function(start, end, opt_screen) {
  var screen = opt_screen || this.screen_;

  var offset = this.scrollbackRows_.length;
  for (var i = start; i < end; i++) {
    screen.rowsArray[i].rowIndex = offset + i;
  }
};

/**
 * Print a string to the terminal.
 *
 * This respects the current insert and wraparound modes.  It will add new lines
 * to the end of the terminal, scrolling off the top into the scrollback buffer
 * if necessary.
 *
 * The string is *not* parsed for escape codes.  Use the interpret() method if
 * that's what you're after.
 *
 * @param {string} str The string to print.
 */
hterm.Terminal.prototype.print = function(str) {
  this.scheduleSyncCursorPosition_();

  // Basic accessibility output for the screen reader.
  this.accessibilityReader_.announce(str);

  var startOffset = 0;

  var strWidth = lib.wc.strWidth(str);
  // Fun edge case: If the string only contains zero width codepoints (like
  // combining characters), we make sure to iterate at least once below.
  if (strWidth == 0 && str)
    strWidth = 1;

  while (startOffset < strWidth) {
    if (this.options_.wraparound && this.screen_.cursorPosition.overflow) {
      this.screen_.commitLineOverflow();
      this.newLine(true);
    }

    var count = strWidth - startOffset;
    var didOverflow = false;
    var substr;

    if (this.screen_.cursorPosition.column + count >= this.screenSize.width) {
      didOverflow = true;
      count = this.screenSize.width - this.screen_.cursorPosition.column;
    }

    if (didOverflow && !this.options_.wraparound) {
      // If the string overflowed the line but wraparound is off, then the
      // last printed character should be the last of the string.
      // TODO: This will add to our problems with multibyte UTF-16 characters.
      substr = lib.wc.substr(str, startOffset, count - 1) +
          lib.wc.substr(str, strWidth - 1);
      count = strWidth;
    } else {
      substr = lib.wc.substr(str, startOffset, count);
    }

    var tokens = hterm.TextAttributes.splitWidecharString(substr);
    for (var i = 0; i < tokens.length; i++) {
      this.screen_.textAttributes.wcNode = tokens[i].wcNode;
      this.screen_.textAttributes.asciiNode = tokens[i].asciiNode;

      if (this.options_.insertMode) {
        this.screen_.insertString(tokens[i].str, tokens[i].wcStrWidth);
      } else {
        this.screen_.overwriteString(tokens[i].str, tokens[i].wcStrWidth);
      }
      this.screen_.textAttributes.wcNode = false;
      this.screen_.textAttributes.asciiNode = true;
    }

    this.screen_.maybeClipCurrentRow();
    startOffset += count;
  }

  if (this.scrollOnOutput_)
    this.scrollPort_.scrollRowToBottom(this.getRowCount());
};

/**
 * Set the VT scroll region.
 *
 * This also resets the cursor position to the absolute (0, 0) position, since
 * that's what xterm appears to do.
 *
 * Setting the scroll region to the full height of the terminal will clear
 * the scroll region.  This is *NOT* what most terminals do.  We're explicitly
 * going "off-spec" here because it makes `screen` and `tmux` overflow into the
 * local scrollback buffer, which means the scrollbars and shift-pgup/pgdn
 * continue to work as most users would expect.
 *
 * @param {?number} scrollTop The zero-based top of the scroll region.
 * @param {?number} scrollBottom The zero-based bottom of the scroll region,
 *     inclusive.
 */
hterm.Terminal.prototype.setVTScrollRegion = function(scrollTop, scrollBottom) {
  if (scrollTop == 0 && scrollBottom == this.screenSize.height - 1) {
    this.vtScrollTop_ = null;
    this.vtScrollBottom_ = null;
  } else {
    this.vtScrollTop_ = scrollTop;
    this.vtScrollBottom_ = scrollBottom;
  }
};

/**
 * Return the top row index according to the VT.
 *
 * This will return 0 unless the terminal has been told to restrict scrolling
 * to some lower row.  It is used for some VT cursor positioning and scrolling
 * commands.
 *
 * @return {number} The topmost row in the terminal's scroll region.
 */
hterm.Terminal.prototype.getVTScrollTop = function() {
  if (this.vtScrollTop_ != null)
    return this.vtScrollTop_;

  return 0;
};

/**
 * Return the bottom row index according to the VT.
 *
 * This will return the height of the terminal unless the it has been told to
 * restrict scrolling to some higher row.  It is used for some VT cursor
 * positioning and scrolling commands.
 *
 * @return {number} The bottom most row in the terminal's scroll region.
 */
hterm.Terminal.prototype.getVTScrollBottom = function() {
  if (this.vtScrollBottom_ != null)
    return this.vtScrollBottom_;

  return this.screenSize.height - 1;
};

/**
 * Process a '\n' character.
 *
 * If the cursor is on the final row of the terminal this will append a new
 * blank row to the screen and scroll the topmost row into the scrollback
 * buffer.
 *
 * Otherwise, this moves the cursor to column zero of the next row.
 *
 * @param {boolean=} dueToOverflow Whether the newline is due to wraparound of
 *     the terminal.
 */
hterm.Terminal.prototype.newLine = function(dueToOverflow = false) {
  if (!dueToOverflow)
    this.accessibilityReader_.newLine();

  var cursorAtEndOfScreen = (this.screen_.cursorPosition.row ==
                             this.screen_.rowsArray.length - 1);

  if (this.vtScrollBottom_ != null) {
    // A VT Scroll region is active, we never append new rows.
    if (this.screen_.cursorPosition.row == this.vtScrollBottom_) {
      // We're at the end of the VT Scroll Region, perform a VT scroll.
      this.vtScrollUp(1);
      this.setAbsoluteCursorPosition(this.screen_.cursorPosition.row, 0);
    } else if (cursorAtEndOfScreen) {
      // We're at the end of the screen, the only thing to do is put the
      // cursor to column 0.
      this.setAbsoluteCursorPosition(this.screen_.cursorPosition.row, 0);
    } else {
      // Anywhere else, advance the cursor row, and reset the column.
      this.setAbsoluteCursorPosition(this.screen_.cursorPosition.row + 1, 0);
    }
  } else if (cursorAtEndOfScreen) {
    // We're at the end of the screen.  Append a new row to the terminal,
    // shifting the top row into the scrollback.
    this.appendRows_(1);
  } else {
    // Anywhere else in the screen just moves the cursor.
    this.setAbsoluteCursorPosition(this.screen_.cursorPosition.row + 1, 0);
  }
};

/**
 * Like newLine(), except maintain the cursor column.
 */
hterm.Terminal.prototype.lineFeed = function() {
  var column = this.screen_.cursorPosition.column;
  this.newLine();
  this.setCursorColumn(column);
};

/**
 * If autoCarriageReturn is set then newLine(), else lineFeed().
 */
hterm.Terminal.prototype.formFeed = function() {
  if (this.options_.autoCarriageReturn) {
    this.newLine();
  } else {
    this.lineFeed();
  }
};

/**
 * Move the cursor up one row, possibly inserting a blank line.
 *
 * The cursor column is not changed.
 */
hterm.Terminal.prototype.reverseLineFeed = function() {
  var scrollTop = this.getVTScrollTop();
  var currentRow = this.screen_.cursorPosition.row;

  if (currentRow == scrollTop) {
    this.insertLines(1);
  } else {
    this.setAbsoluteCursorRow(currentRow - 1);
  }
};

/**
 * Replace all characters to the left of the current cursor with the space
 * character.
 *
 * TODO(rginda): This should probably *remove* the characters (not just replace
 * with a space) if there are no characters at or beyond the current cursor
 * position.
 */
hterm.Terminal.prototype.eraseToLeft = function() {
  var cursor = this.saveCursor();
  this.setCursorColumn(0);
  const count = cursor.column + 1;
  this.screen_.overwriteString(' '.repeat(count), count);
  this.restoreCursor(cursor);
};

/**
 * Erase a given number of characters to the right of the cursor.
 *
 * The cursor position is unchanged.
 *
 * If the current background color is not the default background color this
 * will insert spaces rather than delete.  This is unfortunate because the
 * trailing space will affect text selection, but it's difficult to come up
 * with a way to style empty space that wouldn't trip up the hterm.Screen
 * code.
 *
 * eraseToRight is ignored in the presence of a cursor overflow.  This deviates
 * from xterm, but agrees with gnome-terminal and konsole, xfce4-terminal.  See
 * crbug.com/232390 for details.
 *
 * @param {number=} opt_count The number of characters to erase.
 */
hterm.Terminal.prototype.eraseToRight = function(opt_count) {
  if (this.screen_.cursorPosition.overflow)
    return;

  var maxCount = this.screenSize.width - this.screen_.cursorPosition.column;
  var count = opt_count ? Math.min(opt_count, maxCount) : maxCount;

  if (this.screen_.textAttributes.background ===
      this.screen_.textAttributes.DEFAULT_COLOR) {
    var cursorRow = this.screen_.rowsArray[this.screen_.cursorPosition.row];
    if (hterm.TextAttributes.nodeWidth(cursorRow) <=
        this.screen_.cursorPosition.column + count) {
      this.screen_.deleteChars(count);
      this.clearCursorOverflow();
      return;
    }
  }

  var cursor = this.saveCursor();
  this.screen_.overwriteString(' '.repeat(count), count);
  this.restoreCursor(cursor);
  this.clearCursorOverflow();
};

/**
 * Erase the current line.
 *
 * The cursor position is unchanged.
 */
hterm.Terminal.prototype.eraseLine = function() {
  var cursor = this.saveCursor();
  this.screen_.clearCursorRow();
  this.restoreCursor(cursor);
  this.clearCursorOverflow();
};

/**
 * Erase all characters from the start of the screen to the current cursor
 * position, regardless of scroll region.
 *
 * The cursor position is unchanged.
 */
hterm.Terminal.prototype.eraseAbove = function() {
  var cursor = this.saveCursor();

  this.eraseToLeft();

  for (var i = 0; i < cursor.row; i++) {
    this.setAbsoluteCursorPosition(i, 0);
    this.screen_.clearCursorRow();
  }

  this.restoreCursor(cursor);
  this.clearCursorOverflow();
};

/**
 * Erase all characters from the current cursor position to the end of the
 * screen, regardless of scroll region.
 *
 * The cursor position is unchanged.
 */
hterm.Terminal.prototype.eraseBelow = function() {
  var cursor = this.saveCursor();

  this.eraseToRight();

  var bottom = this.screenSize.height - 1;
  for (var i = cursor.row + 1; i <= bottom; i++) {
    this.setAbsoluteCursorPosition(i, 0);
    this.screen_.clearCursorRow();
  }

  this.restoreCursor(cursor);
  this.clearCursorOverflow();
};

/**
 * Fill the terminal with a given character.
 *
 * This methods does not respect the VT scroll region.
 *
 * @param {string} ch The character to use for the fill.
 */
hterm.Terminal.prototype.fill = function(ch) {
  var cursor = this.saveCursor();

  this.setAbsoluteCursorPosition(0, 0);
  for (var row = 0; row < this.screenSize.height; row++) {
    for (var col = 0; col < this.screenSize.width; col++) {
      this.setAbsoluteCursorPosition(row, col);
      this.screen_.overwriteString(ch, 1);
    }
  }

  this.restoreCursor(cursor);
};

/**
 * Erase the entire display and leave the cursor at (0, 0).
 *
 * This does not respect the scroll region.
 *
 * @param {!hterm.Screen=} opt_screen Optional screen to operate on.  Defaults
 *     to the current screen.
 */
hterm.Terminal.prototype.clearHome = function(opt_screen) {
  var screen = opt_screen || this.screen_;
  var bottom = screen.getHeight();

  this.accessibilityReader_.clear();

  if (bottom == 0) {
    // Empty screen, nothing to do.
    return;
  }

  for (var i = 0; i < bottom; i++) {
    screen.setCursorPosition(i, 0);
    screen.clearCursorRow();
  }

  screen.setCursorPosition(0, 0);
};

/**
 * Erase the entire display without changing the cursor position.
 *
 * The cursor position is unchanged.  This does not respect the scroll
 * region.
 *
 * @param {!hterm.Screen=} opt_screen Optional screen to operate on.  Defaults
 *     to the current screen.
 */
hterm.Terminal.prototype.clear = function(opt_screen) {
  var screen = opt_screen || this.screen_;
  var cursor = screen.cursorPosition.clone();
  this.clearHome(screen);
  screen.setCursorPosition(cursor.row, cursor.column);
};

/**
 * VT command to insert lines at the current cursor row.
 *
 * This respects the current scroll region.  Rows pushed off the bottom are
 * lost (they won't show up in the scrollback buffer).
 *
 * @param {number} count The number of lines to insert.
 */
hterm.Terminal.prototype.insertLines = function(count) {
  var cursorRow = this.screen_.cursorPosition.row;

  var bottom = this.getVTScrollBottom();
  count = Math.min(count, bottom - cursorRow);

  // The moveCount is the number of rows we need to relocate to make room for
  // the new row(s).  The count is the distance to move them.
  var moveCount = bottom - cursorRow - count + 1;
  if (moveCount)
    this.moveRows_(cursorRow, moveCount, cursorRow + count);

  for (var i = count - 1; i >= 0; i--) {
    this.setAbsoluteCursorPosition(cursorRow + i, 0);
    this.screen_.clearCursorRow();
  }
};

/**
 * VT command to delete lines at the current cursor row.
 *
 * New rows are added to the bottom of scroll region to take their place.  New
 * rows are strictly there to take up space and have no content or style.
 *
 * @param {number} count The number of lines to delete.
 */
hterm.Terminal.prototype.deleteLines = function(count) {
  var cursor = this.saveCursor();

  var top = cursor.row;
  var bottom = this.getVTScrollBottom();

  var maxCount = bottom - top + 1;
  count = Math.min(count, maxCount);

  var moveStart = bottom - count + 1;
  if (count != maxCount)
    this.moveRows_(top, count, moveStart);

  for (var i = 0; i < count; i++) {
    this.setAbsoluteCursorPosition(moveStart + i, 0);
    this.screen_.clearCursorRow();
  }

  this.restoreCursor(cursor);
  this.clearCursorOverflow();
};

/**
 * Inserts the given number of spaces at the current cursor position.
 *
 * The cursor position is not changed.
 *
 * @param {number} count The number of spaces to insert.
 */
hterm.Terminal.prototype.insertSpace = function(count) {
  var cursor = this.saveCursor();

  const ws = ' '.repeat(count || 1);
  this.screen_.insertString(ws, ws.length);
  this.screen_.maybeClipCurrentRow();

  this.restoreCursor(cursor);
  this.clearCursorOverflow();
};

/**
 * Forward-delete the specified number of characters starting at the cursor
 * position.
 *
 * @param {number} count The number of characters to delete.
 */
hterm.Terminal.prototype.deleteChars = function(count) {
  var deleted = this.screen_.deleteChars(count);
  if (deleted && !this.screen_.textAttributes.isDefault()) {
    var cursor = this.saveCursor();
    this.setCursorColumn(this.screenSize.width - deleted);
    this.screen_.insertString(' '.repeat(deleted));
    this.restoreCursor(cursor);
  }

  this.clearCursorOverflow();
};

/**
 * Shift rows in the scroll region upwards by a given number of lines.
 *
 * New rows are inserted at the bottom of the scroll region to fill the
 * vacated rows.  The new rows not filled out with the current text attributes.
 *
 * This function does not affect the scrollback rows at all.  Rows shifted
 * off the top are lost.
 *
 * The cursor position is not altered.
 *
 * @param {number} count The number of rows to scroll.
 */
hterm.Terminal.prototype.vtScrollUp = function(count) {
  var cursor = this.saveCursor();

  this.setAbsoluteCursorRow(this.getVTScrollTop());
  this.deleteLines(count);

  this.restoreCursor(cursor);
};

/**
 * Shift rows below the cursor down by a given number of lines.
 *
 * This function respects the current scroll region.
 *
 * New rows are inserted at the top of the scroll region to fill the
 * vacated rows.  The new rows not filled out with the current text attributes.
 *
 * This function does not affect the scrollback rows at all.  Rows shifted
 * off the bottom are lost.
 *
 * @param {number} count The number of rows to scroll.
 */
hterm.Terminal.prototype.vtScrollDown = function(count) {
  var cursor = this.saveCursor();

  this.setAbsoluteCursorPosition(this.getVTScrollTop(), 0);
  this.insertLines(count);

  this.restoreCursor(cursor);
};

/**
 * Enable accessibility-friendly features that have a performance impact.
 *
 * This will generate additional DOM nodes in an aria-live region that will
 * cause Assitive Technology to announce the output of the terminal. It also
 * enables other features that aid assistive technology. All the features gated
 * behind this flag have a performance impact on the terminal which is why they
 * are made optional.
 *
 * @param {boolean} enabled Whether to enable accessibility-friendly features.
 */
hterm.Terminal.prototype.setAccessibilityEnabled = function(enabled) {
  this.accessibilityReader_.setAccessibilityEnabled(enabled);
};

/**
 * Set the cursor position.
 *
 * The cursor row is relative to the scroll region if the terminal has
 * 'origin mode' enabled, or relative to the addressable screen otherwise.
 *
 * @param {number} row The new zero-based cursor row.
 * @param {number} column The new zero-based cursor column.
 */
hterm.Terminal.prototype.setCursorPosition = function(row, column) {
  if (this.options_.originMode) {
    this.setRelativeCursorPosition(row, column);
  } else {
    this.setAbsoluteCursorPosition(row, column);
  }
};

/**
 * Move the cursor relative to its current position.
 *
 * @param {number} row
 * @param {number} column
 */
hterm.Terminal.prototype.setRelativeCursorPosition = function(row, column) {
  var scrollTop = this.getVTScrollTop();
  row = lib.f.clamp(row + scrollTop, scrollTop, this.getVTScrollBottom());
  column = lib.f.clamp(column, 0, this.screenSize.width - 1);
  this.screen_.setCursorPosition(row, column);
};

/**
 * Move the cursor to the specified position.
 *
 * @param {number} row
 * @param {number} column
 */
hterm.Terminal.prototype.setAbsoluteCursorPosition = function(row, column) {
  row = lib.f.clamp(row, 0, this.screenSize.height - 1);
  column = lib.f.clamp(column, 0, this.screenSize.width - 1);
  this.screen_.setCursorPosition(row, column);
};

/**
 * Set the cursor column.
 *
 * @param {number} column The new zero-based cursor column.
 */
hterm.Terminal.prototype.setCursorColumn = function(column) {
  this.setAbsoluteCursorPosition(this.screen_.cursorPosition.row, column);
};

/**
 * Return the cursor column.
 *
 * @return {number} The zero-based cursor column.
 */
hterm.Terminal.prototype.getCursorColumn = function() {
  return this.screen_.cursorPosition.column;
};

/**
 * Set the cursor row.
 *
 * The cursor row is relative to the scroll region if the terminal has
 * 'origin mode' enabled, or relative to the addressable screen otherwise.
 *
 * @param {number} row The new cursor row.
 */
hterm.Terminal.prototype.setAbsoluteCursorRow = function(row) {
  this.setAbsoluteCursorPosition(row, this.screen_.cursorPosition.column);
};

/**
 * Return the cursor row.
 *
 * @return {number} The zero-based cursor row.
 */
hterm.Terminal.prototype.getCursorRow = function() {
  return this.screen_.cursorPosition.row;
};

/**
 * Request that the ScrollPort redraw itself soon.
 *
 * The redraw will happen asynchronously, soon after the call stack winds down.
 * Multiple calls will be coalesced into a single redraw.
 */
hterm.Terminal.prototype.scheduleRedraw_ = function() {
  if (this.timeouts_.redraw)
    return;

  var self = this;
  this.timeouts_.redraw = setTimeout(function() {
      delete self.timeouts_.redraw;
      self.scrollPort_.redraw_();
    }, 0);
};

/**
 * Request that the ScrollPort be scrolled to the bottom.
 *
 * The scroll will happen asynchronously, soon after the call stack winds down.
 * Multiple calls will be coalesced into a single scroll.
 *
 * This affects the scrollbar position of the ScrollPort, and has nothing to
 * do with the VT scroll commands.
 */
hterm.Terminal.prototype.scheduleScrollDown_ = function() {
  if (this.timeouts_.scrollDown)
    return;

  var self = this;
  this.timeouts_.scrollDown = setTimeout(function() {
      delete self.timeouts_.scrollDown;
      self.scrollPort_.scrollRowToBottom(self.getRowCount());
    }, 10);
};

/**
 * Move the cursor up a specified number of rows.
 *
 * @param {number} count The number of rows to move the cursor.
 */
hterm.Terminal.prototype.cursorUp = function(count) {
  this.cursorDown(-(count || 1));
};

/**
 * Move the cursor down a specified number of rows.
 *
 * @param {number} count The number of rows to move the cursor.
 */
hterm.Terminal.prototype.cursorDown = function(count) {
  count = count || 1;
  var minHeight = (this.options_.originMode ? this.getVTScrollTop() : 0);
  var maxHeight = (this.options_.originMode ? this.getVTScrollBottom() :
                   this.screenSize.height - 1);

  var row = lib.f.clamp(this.screen_.cursorPosition.row + count,
                        minHeight, maxHeight);
  this.setAbsoluteCursorRow(row);
};

/**
 * Move the cursor left a specified number of columns.
 *
 * If reverse wraparound mode is enabled and the previous row wrapped into
 * the current row then we back up through the wraparound as well.
 *
 * @param {number} count The number of columns to move the cursor.
 */
hterm.Terminal.prototype.cursorLeft = function(count) {
  count = count || 1;

  if (count < 1)
    return;

  var currentColumn = this.screen_.cursorPosition.column;
  if (this.options_.reverseWraparound) {
    if (this.screen_.cursorPosition.overflow) {
      // If this cursor is in the right margin, consume one count to get it
      // back to the last column.  This only applies when we're in reverse
      // wraparound mode.
      count--;
      this.clearCursorOverflow();

      if (!count)
        return;
    }

    var newRow = this.screen_.cursorPosition.row;
    var newColumn = currentColumn - count;
    if (newColumn < 0) {
      newRow = newRow - Math.floor(count / this.screenSize.width) - 1;
      if (newRow < 0) {
        // xterm also wraps from row 0 to the last row.
        newRow = this.screenSize.height + newRow % this.screenSize.height;
      }
      newColumn = this.screenSize.width + newColumn % this.screenSize.width;
    }

    this.setCursorPosition(Math.max(newRow, 0), newColumn);

  } else {
    var newColumn = Math.max(currentColumn - count, 0);
    this.setCursorColumn(newColumn);
  }
};

/**
 * Move the cursor right a specified number of columns.
 *
 * @param {number} count The number of columns to move the cursor.
 */
hterm.Terminal.prototype.cursorRight = function(count) {
  count = count || 1;

  if (count < 1)
    return;

  var column = lib.f.clamp(this.screen_.cursorPosition.column + count,
                           0, this.screenSize.width - 1);
  this.setCursorColumn(column);
};

/**
 * Reverse the foreground and background colors of the terminal.
 *
 * This only affects text that was drawn with no attributes.
 *
 * TODO(rginda): Test xterm to see if reverse is respected for text that has
 * been drawn with attributes that happen to coincide with the default
 * 'no-attribute' colors.  My guess is probably not.
 *
 * @param {boolean} state The state to set.
 */
hterm.Terminal.prototype.setReverseVideo = function(state) {
  this.options_.reverseVideo = state;
  if (state) {
    this.scrollPort_.setForegroundColor(this.backgroundColor_);
    this.scrollPort_.setBackgroundColor(this.foregroundColor_);
  } else {
    this.scrollPort_.setForegroundColor(this.foregroundColor_);
    this.scrollPort_.setBackgroundColor(this.backgroundColor_);
  }
};

/**
 * Ring the terminal bell.
 *
 * This will not play the bell audio more than once per second.
 */
hterm.Terminal.prototype.ringBell = function() {
  this.cursorNode_.style.backgroundColor =
      this.scrollPort_.getForegroundColor();

  var self = this;
  setTimeout(function() {
      self.restyleCursor_();
    }, 200);

  // bellSquelchTimeout_ affects both audio and notification bells.
  if (this.bellSquelchTimeout_)
    return;

  if (this.bellAudio_.getAttribute('src')) {
    this.bellAudio_.play();
    this.bellSequelchTimeout_ = setTimeout(() => {
        this.bellSquelchTimeout_ = null;
      }, 500);
  } else {
    this.bellSquelchTimeout_ = null;
  }

  if (this.desktopNotificationBell_ && !this.document_.hasFocus()) {
    var n = hterm.notify();
    this.bellNotificationList_.push(n);
    // TODO: Should we try to raise the window here?
    n.onclick = function() { self.closeBellNotifications_(); };
  }
};

/**
 * Set the origin mode bit.
 *
 * If origin mode is on, certain VT cursor and scrolling commands measure their
 * row parameter relative to the VT scroll region.  Otherwise, row 0 corresponds
 * to the top of the addressable screen.
 *
 * Defaults to off.
 *
 * @param {boolean} state True to set origin mode, false to unset.
 */
hterm.Terminal.prototype.setOriginMode = function(state) {
  this.options_.originMode = state;
  this.setCursorPosition(0, 0);
};

/**
 * Set the insert mode bit.
 *
 * If insert mode is on, existing text beyond the cursor position will be
 * shifted right to make room for new text.  Otherwise, new text overwrites
 * any existing text.
 *
 * Defaults to off.
 *
 * @param {boolean} state True to set insert mode, false to unset.
 */
hterm.Terminal.prototype.setInsertMode = function(state) {
  this.options_.insertMode = state;
};

/**
 * Set the auto carriage return bit.
 *
 * If auto carriage return is on then a formfeed character is interpreted
 * as a newline, otherwise it's the same as a linefeed.  The difference boils
 * down to whether or not the cursor column is reset.
 *
 * @param {boolean} state The state to set.
 */
hterm.Terminal.prototype.setAutoCarriageReturn = function(state) {
  this.options_.autoCarriageReturn = state;
};

/**
 * Set the wraparound mode bit.
 *
 * If wraparound mode is on, certain VT commands will allow the cursor to wrap
 * to the start of the following row.  Otherwise, the cursor is clamped to the
 * end of the screen and attempts to write past it are ignored.
 *
 * Defaults to on.
 *
 * @param {boolean} state True to set wraparound mode, false to unset.
 */
hterm.Terminal.prototype.setWraparound = function(state) {
  this.options_.wraparound = state;
};

/**
 * Set the reverse-wraparound mode bit.
 *
 * If wraparound mode is off, certain VT commands will allow the cursor to wrap
 * to the end of the previous row.  Otherwise, the cursor is clamped to column
 * 0.
 *
 * Defaults to off.
 *
 * @param {boolean} state True to set reverse-wraparound mode, false to unset.
 */
hterm.Terminal.prototype.setReverseWraparound = function(state) {
  this.options_.reverseWraparound = state;
};

/**
 * Selects between the primary and alternate screens.
 *
 * If alternate mode is on, the alternate screen is active.  Otherwise the
 * primary screen is active.
 *
 * Swapping screens has no effect on the scrollback buffer.
 *
 * Each screen maintains its own cursor position.
 *
 * Defaults to off.
 *
 * @param {boolean} state True to set alternate mode, false to unset.
 */
hterm.Terminal.prototype.setAlternateMode = function(state) {
  var cursor = this.saveCursor();
  this.screen_ = state ? this.alternateScreen_ : this.primaryScreen_;

  if (this.screen_.rowsArray.length &&
      this.screen_.rowsArray[0].rowIndex != this.scrollbackRows_.length) {
    // If the screen changed sizes while we were away, our rowIndexes may
    // be incorrect.
    var offset = this.scrollbackRows_.length;
    var ary = this.screen_.rowsArray;
    for (var i = 0; i < ary.length; i++) {
      ary[i].rowIndex = offset + i;
    }
  }

  this.realizeWidth_(this.screenSize.width);
  this.realizeHeight_(this.screenSize.height);
  this.scrollPort_.syncScrollHeight();
  this.scrollPort_.invalidate();

  this.restoreCursor(cursor);
  this.scrollPort_.resize();
};

/**
 * Set the cursor-blink mode bit.
 *
 * If cursor-blink is on, the cursor will blink when it is visible.  Otherwise
 * a visible cursor does not blink.
 *
 * You should make sure to turn blinking off if you're going to dispose of a
 * terminal, otherwise you'll leak a timeout.
 *
 * Defaults to on.
 *
 * @param {boolean} state True to set cursor-blink mode, false to unset.
 */
hterm.Terminal.prototype.setCursorBlink = function(state) {
  this.options_.cursorBlink = state;

  if (!state && this.timeouts_.cursorBlink) {
    clearTimeout(this.timeouts_.cursorBlink);
    delete this.timeouts_.cursorBlink;
  }

  if (this.options_.cursorVisible)
    this.setCursorVisible(true);
};

/**
 * Set the cursor-visible mode bit.
 *
 * If cursor-visible is on, the cursor will be visible.  Otherwise it will not.
 *
 * Defaults to on.
 *
 * @param {boolean} state True to set cursor-visible mode, false to unset.
 */
hterm.Terminal.prototype.setCursorVisible = function(state) {
  this.options_.cursorVisible = state;

  if (!state) {
    if (this.timeouts_.cursorBlink) {
      clearTimeout(this.timeouts_.cursorBlink);
      delete this.timeouts_.cursorBlink;
    }
    this.cursorNode_.style.opacity = '0';
    return;
  }

  this.syncCursorPosition_();

  this.cursorNode_.style.opacity = '1';

  if (this.options_.cursorBlink) {
    if (this.timeouts_.cursorBlink)
      return;

    this.onCursorBlink_();
  } else {
    if (this.timeouts_.cursorBlink) {
      clearTimeout(this.timeouts_.cursorBlink);
      delete this.timeouts_.cursorBlink;
    }
  }
};

/**
 * Pause blinking temporarily.
 *
 * When the cursor moves around, it can be helpful to momentarily pause the
 * blinking.  This could be when the user is typing in things, or when they're
 * moving around with the arrow keys.
 */
hterm.Terminal.prototype.pauseCursorBlink_ = function() {
  if (!this.options_.cursorBlink) {
    return;
  }

  this.cursorBlinkPause_ = true;

  // If a timeout is already pending, reset the clock due to the new input.
  if (this.timeouts_.cursorBlinkPause) {
    clearTimeout(this.timeouts_.cursorBlinkPause);
  }
  // After 500ms, resume blinking.  That seems like a good balance between user
  // input timings & responsiveness to resume.
  this.timeouts_.cursorBlinkPause = setTimeout(() => {
    delete this.timeouts_.cursorBlinkPause;
    this.cursorBlinkPause_ = false;
  }, 500);
};

/**
 * Synchronizes the visible cursor and document selection with the current
 * cursor coordinates.
 *
 * @return {boolean} True if the cursor is onscreen and synced.
 */
hterm.Terminal.prototype.syncCursorPosition_ = function() {
  var topRowIndex = this.scrollPort_.getTopRowIndex();
  var bottomRowIndex = this.scrollPort_.getBottomRowIndex(topRowIndex);
  var cursorRowIndex = this.scrollbackRows_.length +
      this.screen_.cursorPosition.row;

  let forceSyncSelection = false;
  if (this.accessibilityReader_.accessibilityEnabled) {
    // Report the new position of the cursor for accessibility purposes.
    const cursorColumnIndex = this.screen_.cursorPosition.column;
    const cursorLineText =
        this.screen_.rowsArray[this.screen_.cursorPosition.row].innerText;
    // This will force the selection to be sync'd to the cursor position if the
    // user has pressed a key. Generally we would only sync the cursor position
    // when selection is collapsed so that if the user has selected something
    // we don't clear the selection by moving the selection. However when a
    // screen reader is used, it's intuitive for entering a key to move the
    // selection to the cursor.
    forceSyncSelection = this.accessibilityReader_.hasUserGesture;
    this.accessibilityReader_.afterCursorChange(
        cursorLineText, cursorRowIndex, cursorColumnIndex);
  }

  if (cursorRowIndex > bottomRowIndex) {
    // Cursor is scrolled off screen, move it outside of the visible area.
    this.setCssVar('cursor-offset-row', '-1');
    return false;
  }

  if (this.options_.cursorVisible &&
      this.cursorNode_.style.display == 'none') {
    // Re-display the terminal cursor if it was hidden by the mouse cursor.
    this.cursorNode_.style.display = '';
  }

  // Position the cursor using CSS variable math.  If we do the math in JS,
  // the float math will end up being more precise than the CSS which will
  // cause the cursor tracking to be off.
  this.setCssVar(
      'cursor-offset-row',
      `${cursorRowIndex - topRowIndex} + ` +
      `${this.scrollPort_.visibleRowTopMargin}px`);
  this.setCssVar('cursor-offset-col', this.screen_.cursorPosition.column);

  this.cursorNode_.setAttribute('title',
                                '(' + this.screen_.cursorPosition.column +
                                ', ' + this.screen_.cursorPosition.row +
                                ')');

  // Update the caret for a11y purposes.
  var selection = this.document_.getSelection();
  if (selection && (selection.isCollapsed || forceSyncSelection)) {
    this.screen_.syncSelectionCaret(selection);
  }
  return true;
};

/**
 * Adjusts the style of this.cursorNode_ according to the current cursor shape
 * and character cell dimensions.
 */
hterm.Terminal.prototype.restyleCursor_ = function() {
  var shape = this.cursorShape_;

  if (this.cursorNode_.getAttribute('focus') == 'false') {
    // Always show a block cursor when unfocused.
    shape = hterm.Terminal.cursorShape.BLOCK;
  }

  var style = this.cursorNode_.style;

  switch (shape) {
    case hterm.Terminal.cursorShape.BEAM:
      style.backgroundColor = 'transparent';
      style.borderBottomStyle = '';
      style.borderLeftStyle = 'solid';
      break;

    case hterm.Terminal.cursorShape.UNDERLINE:
      style.backgroundColor = 'transparent';
      style.borderBottomStyle = 'solid';
      style.borderLeftStyle = '';
      break;

    default:
      style.backgroundColor = 'var(--hterm-cursor-color)';
      style.borderBottomStyle = '';
      style.borderLeftStyle = '';
      break;
  }
};

/**
 * Synchronizes the visible cursor with the current cursor coordinates.
 *
 * The sync will happen asynchronously, soon after the call stack winds down.
 * Multiple calls will be coalesced into a single sync. This should be called
 * prior to the cursor actually changing position.
 */
hterm.Terminal.prototype.scheduleSyncCursorPosition_ = function() {
  if (this.timeouts_.syncCursor)
    return;

  if (this.accessibilityReader_.accessibilityEnabled) {
    // Report the previous position of the cursor for accessibility purposes.
    const cursorRowIndex = this.scrollbackRows_.length +
        this.screen_.cursorPosition.row;
    const cursorColumnIndex = this.screen_.cursorPosition.column;
    const cursorLineText =
        this.screen_.rowsArray[this.screen_.cursorPosition.row].innerText;
    this.accessibilityReader_.beforeCursorChange(
        cursorLineText, cursorRowIndex, cursorColumnIndex);
  }

  var self = this;
  this.timeouts_.syncCursor = setTimeout(function() {
      self.syncCursorPosition_();
      delete self.timeouts_.syncCursor;
    }, 0);
};

/**
 * Show or hide the zoom warning.
 *
 * The zoom warning is a message warning the user that their browser zoom must
 * be set to 100% in order for hterm to function properly.
 *
 * @param {boolean} state True to show the message, false to hide it.
 */
hterm.Terminal.prototype.showZoomWarning_ = function(state) {
  if (!this.zoomWarningNode_) {
    if (!state)
      return;

    this.zoomWarningNode_ = this.document_.createElement('div');
    this.zoomWarningNode_.id = 'hterm:zoom-warning';
    this.zoomWarningNode_.style.cssText = (
        'color: black;' +
        'background-color: #ff2222;' +
        'font-size: large;' +
        'border-radius: 8px;' +
        'opacity: 0.75;' +
        'padding: 0.2em 0.5em 0.2em 0.5em;' +
        'top: 0.5em;' +
        'right: 1.2em;' +
        'position: absolute;' +
        '-webkit-text-size-adjust: none;' +
        '-webkit-user-select: none;' +
        '-moz-text-size-adjust: none;' +
        '-moz-user-select: none;');

    this.zoomWarningNode_.addEventListener('click', function(e) {
      this.parentNode.removeChild(this);
    });
  }

  this.zoomWarningNode_.textContent = lib.i18n.replaceReferences(
      hterm.zoomWarningMessage,
      [Math.floor(this.scrollPort_.characterSize.zoomFactor * 100)]);

  this.zoomWarningNode_.style.fontFamily = this.prefs_.get('font-family');

  if (state) {
    if (!this.zoomWarningNode_.parentNode)
      this.div_.parentNode.appendChild(this.zoomWarningNode_);
  } else if (this.zoomWarningNode_.parentNode) {
    this.zoomWarningNode_.parentNode.removeChild(this.zoomWarningNode_);
  }
};

/**
 * Show the terminal overlay for a given amount of time.
 *
 * The terminal overlay appears in inverse video in a large font, centered
 * over the terminal.  You should probably keep the overlay message brief,
 * since it's in a large font and you probably aren't going to check the size
 * of the terminal first.
 *
 * @param {string} msg The text (not HTML) message to display in the overlay.
 * @param {number=} opt_timeout The amount of time to wait before fading out
 *     the overlay.  Defaults to 1.5 seconds.  Pass null to have the overlay
 *     stay up forever (or until the next overlay).
 */
hterm.Terminal.prototype.showOverlay = function(msg, opt_timeout) {
  if (!this.overlayNode_) {
    if (!this.div_)
      return;

    this.overlayNode_ = this.document_.createElement('div');
    this.overlayNode_.style.cssText = (
        'border-radius: 15px;' +
        'font-size: xx-large;' +
        'opacity: 0.75;' +
        'padding: 0.2em 0.5em 0.2em 0.5em;' +
        'position: absolute;' +
        '-webkit-user-select: none;' +
        '-webkit-transition: opacity 180ms ease-in;' +
        '-moz-user-select: none;' +
        '-moz-transition: opacity 180ms ease-in;');

    this.overlayNode_.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation();
    }, true);
  }

  this.overlayNode_.style.color = this.prefs_.get('background-color');
  this.overlayNode_.style.backgroundColor = this.prefs_.get('foreground-color');
  this.overlayNode_.style.fontFamily = this.prefs_.get('font-family');

  this.overlayNode_.textContent = msg;
  this.overlayNode_.style.opacity = '0.75';

  if (!this.overlayNode_.parentNode)
    this.div_.appendChild(this.overlayNode_);

  var divSize = hterm.getClientSize(lib.notNull(this.div_));
  var overlaySize = hterm.getClientSize(this.overlayNode_);

  this.overlayNode_.style.top =
      (divSize.height - overlaySize.height) / 2 + 'px';
  this.overlayNode_.style.left = (divSize.width - overlaySize.width -
      this.scrollPort_.currentScrollbarWidthPx) / 2 + 'px';

  if (this.overlayTimeout_)
    clearTimeout(this.overlayTimeout_);

  this.accessibilityReader_.assertiveAnnounce(msg);

  if (opt_timeout === null)
    return;

  this.overlayTimeout_ = setTimeout(() => {
    this.overlayNode_.style.opacity = '0';
    this.overlayTimeout_ = setTimeout(() => this.hideOverlay(), 200);
  }, opt_timeout || 1500);
};

/**
 * Hide the terminal overlay immediately.
 *
 * Useful when we show an overlay for an event with an unknown end time.
 */
hterm.Terminal.prototype.hideOverlay = function() {
  if (this.overlayTimeout_)
    clearTimeout(this.overlayTimeout_);
  this.overlayTimeout_ = null;

  if (this.overlayNode_.parentNode)
    this.overlayNode_.parentNode.removeChild(this.overlayNode_);
  this.overlayNode_.style.opacity = '0.75';
};

/**
 * Paste from the system clipboard to the terminal.
 *
 * @return {boolean}
 */
hterm.Terminal.prototype.paste = function() {
  return hterm.pasteFromClipboard(this.document_);
};

/**
 * Copy a string to the system clipboard.
 *
 * Note: If there is a selected range in the terminal, it'll be cleared.
 *
 * @param {string} str The string to copy.
 */
hterm.Terminal.prototype.copyStringToClipboard = function(str) {
  if (this.prefs_.get('enable-clipboard-notice'))
    setTimeout(this.showOverlay.bind(this, hterm.notifyCopyMessage, 500), 200);

  hterm.copySelectionToClipboard(this.document_, str);
};

/**
 * Display an image.
 *
 * Either URI or buffer or blob fields must be specified.
 *
 * @param {{
 *     name: (string|undefined),
 *     size: (string|number|undefined),
 *     preserveAspectRation: (boolean|undefined),
 *     inline: (boolean|undefined),
 *     width: (string|number|undefined),
 *     height: (string|number|undefined),
 *     align: (string|undefined),
 *     url: (string|undefined),
 *     buffer: (!ArrayBuffer|undefined),
 *     blob: (!Blob|undefined),
 *     type: (string|undefined),
 * }} options The image to display.
 *   name A human readable string for the image
 *   size The size (in bytes).
 *   preserveAspectRatio Whether to preserve aspect.
 *   inline Whether to display the image inline.
 *   width The width of the image.
 *   height The height of the image.
 *   align Direction to align the image.
 *   uri The source URI for the image.
 *   buffer The ArrayBuffer image data.
 *   blob The Blob image data.
 *   type The MIME type of the image data.
 * @param {function()=} onLoad Callback when loading finishes.
 * @param {function(!Event)=} onError Callback when loading fails.
 */
hterm.Terminal.prototype.displayImage = function(options, onLoad, onError) {
  // Make sure we're actually given a resource to display.
  if (options.uri === undefined && options.buffer === undefined &&
      options.blob === undefined)
    return;

  // Set up the defaults to simplify code below.
  if (!options.name)
    options.name = '';

  // See if the mime type is available.  If not, guess from the filename.
  // We don't list all possible mime types because the browser can usually
  // guess it correctly.  So list the ones that need a bit more help.
  if (!options.type) {
    const ary = options.name.split('.');
    const ext = ary[ary.length - 1].trim();
    switch (ext) {
      case 'svg':
      case 'svgz':
        options.type = 'image/svg+xml';
        break;
    }
  }

  // Has the user approved image display yet?
  if (this.allowImagesInline !== true) {
    this.newLine();
    const row = this.getRowNode(this.scrollbackRows_.length +
                                this.getCursorRow() - 1);

    if (this.allowImagesInline === false) {
      row.textContent = hterm.msg('POPUP_INLINE_IMAGE_DISABLED', [],
                                  'Inline Images Disabled');
      return;
    }

    // Show a prompt.
    let button;
    const span = this.document_.createElement('span');
    span.innerText = hterm.msg('POPUP_INLINE_IMAGE', [], 'Inline Images');
    span.style.fontWeight = 'bold';
    span.style.borderWidth = '1px';
    span.style.borderStyle = 'dashed';
    button = this.document_.createElement('span');
    button.innerText = hterm.msg('BUTTON_BLOCK', [], 'block');
    button.style.marginLeft = '1em';
    button.style.borderWidth = '1px';
    button.style.borderStyle = 'solid';
    button.addEventListener('click', () => {
      this.prefs_.set('allow-images-inline', false);
    });
    span.appendChild(button);
    button = this.document_.createElement('span');
    button.innerText = hterm.msg('BUTTON_ALLOW_SESSION', [],
                                 'allow this session');
    button.style.marginLeft = '1em';
    button.style.borderWidth = '1px';
    button.style.borderStyle = 'solid';
    button.addEventListener('click', () => {
      this.allowImagesInline = true;
    });
    span.appendChild(button);
    button = this.document_.createElement('span');
    button.innerText = hterm.msg('BUTTON_ALLOW_ALWAYS', [], 'always allow');
    button.style.marginLeft = '1em';
    button.style.borderWidth = '1px';
    button.style.borderStyle = 'solid';
    button.addEventListener('click', () => {
      this.prefs_.set('allow-images-inline', true);
    });
    span.appendChild(button);

    row.appendChild(span);
    return;
  }

  // See if we should show this object directly, or download it.
  if (options.inline) {
    const io = this.io.push();
    io.showOverlay(hterm.msg('LOADING_RESOURCE_START', [options.name],
                             'Loading $1 ...'));

    // While we're loading the image, eat all the user's input.
    io.onVTKeystroke = io.sendString = () => {};

    // Initialize this new image.
    const img = this.document_.createElement('img');
    if (options.uri !== undefined) {
      img.src = options.uri;
    } else if (options.buffer !== undefined) {
      const blob = new Blob([options.buffer], {type: options.type});
      img.src = URL.createObjectURL(blob);
    } else {
      const blob = new Blob([options.blob], {type: options.type});
      img.src = URL.createObjectURL(blob);
    }
    img.title = img.alt = options.name;

    // Attach the image to the page to let it load/render.  It won't stay here.
    // This is needed so it's visible and the DOM can calculate the height.  If
    // the image is hidden or not in the DOM, the height is always 0.
    this.document_.body.appendChild(img);

    // Wait for the image to finish loading before we try moving it to the
    // right place in the terminal.
    img.onload = () => {
      // Now that we have the image dimensions, figure out how to show it.
      img.style.objectFit = options.preserveAspectRatio ? 'scale-down' : 'fill';
      img.style.maxWidth = `${this.document_.body.clientWidth}px`;
      img.style.maxHeight = `${this.document_.body.clientHeight}px`;

      // Parse a width/height specification.
      const parseDim = (dim, maxDim, cssVar) => {
        if (!dim || dim == 'auto')
          return '';

        const ary = dim.match(/^([0-9]+)(px|%)?$/);
        if (ary) {
          if (ary[2] == '%')
            return Math.floor(maxDim * ary[1] / 100) + 'px';
          else if (ary[2] == 'px')
            return dim;
          else
            return `calc(${dim} * var(${cssVar}))`;
        }

        return '';
      };
      img.style.width =
          parseDim(options.width, this.document_.body.clientWidth,
                   '--hterm-charsize-width');
      img.style.height =
          parseDim(options.height,  this.document_.body.clientHeight,
                   '--hterm-charsize-height');

      // Figure out how many rows the image occupies, then add that many.
      // Note: This count will be inaccurate if the font size changes on us.
      const padRows = Math.ceil(img.clientHeight /
                                this.scrollPort_.characterSize.height);
      for (let i = 0; i < padRows; ++i)
        this.newLine();

      // Update the max height in case the user shrinks the character size.
      img.style.maxHeight = `calc(${padRows} * var(--hterm-charsize-height))`;

      // Move the image to the last row.  This way when we scroll up, it doesn't
      // disappear when the first row gets clipped.  It will disappear when we
      // scroll down and the last row is clipped ...
      this.document_.body.removeChild(img);
      // Create a wrapper node so we can do an absolute in a relative position.
      // This helps with rounding errors between JS & CSS counts.
      const div = this.document_.createElement('div');
      div.style.position = 'relative';
      div.style.textAlign = options.align || '';
      img.style.position = 'absolute';
      img.style.bottom = 'calc(0px - var(--hterm-charsize-height))';
      div.appendChild(img);
      const row = this.getRowNode(this.scrollbackRows_.length +
                                  this.getCursorRow() - 1);
      row.appendChild(div);

      // Now that the image has been read, we can revoke the source.
      if (options.uri === undefined) {
        URL.revokeObjectURL(img.src);
      }

      io.hideOverlay();
      io.pop();

      if (onLoad)
        onLoad();
    };

    // If we got a malformed image, give up.
    img.onerror = (e) => {
      this.document_.body.removeChild(img);
      io.showOverlay(hterm.msg('LOADING_RESOURCE_FAILED', [options.name],
                               'Loading $1 failed'));
      io.pop();

      if (onError)
        onError(e);
    };
  } else {
    // We can't use chrome.downloads.download as that requires "downloads"
    // permissions, and that works only in extensions, not apps.
    const a = this.document_.createElement('a');
    if (options.uri !== undefined) {
      a.href = options.uri;
    } else if (options.buffer !== undefined) {
      const blob = new Blob([options.buffer]);
      a.href = URL.createObjectURL(blob);
    } else {
      a.href = URL.createObjectURL(lib.notNull(options.blob));
    }
    a.download = options.name;
    this.document_.body.appendChild(a);
    a.click();
    a.remove();
    if (options.uri === undefined) {
      URL.revokeObjectURL(a.href);
    }
  }
};

/**
 * Returns the selected text, or null if no text is selected.
 *
 * @return {string|null}
 */
hterm.Terminal.prototype.getSelectionText = function() {
  var selection = this.scrollPort_.selection;
  selection.sync();

  if (selection.isCollapsed)
    return null;

  // Start offset measures from the beginning of the line.
  var startOffset = selection.startOffset;
  var node = selection.startNode;

  // If an x-row isn't selected, |node| will be null.
  if (!node)
    return null;

  if (node.nodeName != 'X-ROW') {
    // If the selection doesn't start on an x-row node, then it must be
    // somewhere inside the x-row.  Add any characters from previous siblings
    // into the start offset.

    if (node.nodeName == '#text' && node.parentNode.nodeName == 'SPAN') {
      // If node is the text node in a styled span, move up to the span node.
      node = node.parentNode;
    }

    while (node.previousSibling) {
      node = node.previousSibling;
      startOffset += hterm.TextAttributes.nodeWidth(node);
    }
  }

  // End offset measures from the end of the line.
  var endOffset = (hterm.TextAttributes.nodeWidth(selection.endNode) -
                   selection.endOffset);
  node = selection.endNode;

  if (node.nodeName != 'X-ROW') {
    // If the selection doesn't end on an x-row node, then it must be
    // somewhere inside the x-row.  Add any characters from following siblings
    // into the end offset.

    if (node.nodeName == '#text' && node.parentNode.nodeName == 'SPAN') {
      // If node is the text node in a styled span, move up to the span node.
      node = node.parentNode;
    }

    while (node.nextSibling) {
      node = node.nextSibling;
      endOffset += hterm.TextAttributes.nodeWidth(node);
    }
  }

  var rv = this.getRowsText(selection.startRow.rowIndex,
                            selection.endRow.rowIndex + 1);
  return lib.wc.substring(rv, startOffset, lib.wc.strWidth(rv) - endOffset);
};

/**
 * Copy the current selection to the system clipboard, then clear it after a
 * short delay.
 */
hterm.Terminal.prototype.copySelectionToClipboard = function() {
  var text = this.getSelectionText();
  if (text != null)
    this.copyStringToClipboard(text);
};

/**
 * Show overlay with current terminal size.
 */
hterm.Terminal.prototype.overlaySize = function() {
  if (this.prefs_.get('enable-resize-status')) {
    this.showOverlay(this.screenSize.width + 'x' + this.screenSize.height);
  }
};

/**
 * Invoked by hterm.Terminal.Keyboard when a VT keystroke is detected.
 *
 * @param {string} string The VT string representing the keystroke, in UTF-16.
 */
hterm.Terminal.prototype.onVTKeystroke = function(string) {
  if (this.scrollOnKeystroke_)
    this.scrollPort_.scrollRowToBottom(this.getRowCount());

  this.pauseCursorBlink_();

  this.io.onVTKeystroke(string);
};

/**
 * Open the selected url.
 */
hterm.Terminal.prototype.openSelectedUrl_ = function() {
  var str = this.getSelectionText();

  // If there is no selection, try and expand wherever they clicked.
  if (str == null) {
    this.screen_.expandSelectionForUrl(this.document_.getSelection());
    str = this.getSelectionText();

    // If clicking in empty space, return.
    if (str == null)
      return;
  }

  // Make sure URL is valid before opening.
  if (str.length > 2048 || str.search(/[\s\[\](){}<>"'\\^`]/) >= 0)
    return;

  // If the URI isn't anchored, it'll open relative to the extension.
  // We have no way of knowing the correct schema, so assume http.
  if (str.search('^[a-zA-Z][a-zA-Z0-9+.-]*://') < 0) {
    // We have to whitelist a few protocols that lack authorities and thus
    // never use the //.  Like mailto.
    switch (str.split(':', 1)[0]) {
      case 'mailto':
        break;
      default:
        str = 'http://' + str;
        break;
    }
  }

  hterm.openUrl(str);
};

/**
 * Manage the automatic mouse hiding behavior while typing.
 *
 * @param {?boolean=} v Whether to enable automatic hiding.
 */
hterm.Terminal.prototype.setAutomaticMouseHiding = function(v=null) {
  // Since Chrome OS & macOS do this by default everywhere, we don't need to.
  // Linux & Windows seem to leave this to specific applications to manage.
  if (v === null)
    v = (hterm.os != 'cros' && hterm.os != 'mac');

  this.mouseHideWhileTyping_ = !!v;
};

/**
 * Handler for monitoring user keyboard activity.
 *
 * This isn't for processing the keystrokes directly, but for updating any
 * state that might toggle based on the user using the keyboard at all.
 *
 * @param {!KeyboardEvent} e The keyboard event that triggered us.
 */
hterm.Terminal.prototype.onKeyboardActivity_ = function(e) {
  // When the user starts typing, hide the mouse cursor.
  if (this.mouseHideWhileTyping_ && !this.mouseHideDelay_)
    this.setCssVar('mouse-cursor-style', 'none');
};

/**
 * Add the terminalRow and terminalColumn properties to mouse events and
 * then forward on to onMouse().
 *
 * The terminalRow and terminalColumn properties contain the (row, column)
 * coordinates for the mouse event.
 *
 * @param {!MouseEvent} e The mouse event to handle.
 */
hterm.Terminal.prototype.onMouse_ = function(e) {
  if (e.processedByTerminalHandler_) {
    // We register our event handlers on the document, as well as the cursor
    // and the scroll blocker.  Mouse events that occur on the cursor or
    // scroll blocker will also appear on the document, but we don't want to
    // process them twice.
    //
    // We can't just prevent bubbling because that has other side effects, so
    // we decorate the event object with this property instead.
    return;
  }

  // Consume navigation events.  Button 3 is usually "browser back" and
  // button 4 is "browser forward" which we don't want to happen.
  if (e.button > 2) {
    e.preventDefault();
    // We don't return so click events can be passed to the remote below.
  }

  var reportMouseEvents = (!this.defeatMouseReports_ &&
      this.vt.mouseReport != this.vt.MOUSE_REPORT_DISABLED);

  e.processedByTerminalHandler_ = true;

  // Handle auto hiding of mouse cursor while typing.
  if (this.mouseHideWhileTyping_ && !this.mouseHideDelay_) {
    // Make sure the mouse cursor is visible.
    this.syncMouseStyle();
    // This debounce isn't perfect, but should work well enough for such a
    // simple implementation.  If the user moved the mouse, we enabled this
    // debounce, and then moved the mouse just before the timeout, we wouldn't
    // debounce that later movement.
    this.mouseHideDelay_ = setTimeout(() => this.mouseHideDelay_ = null, 1000);
  }

  // One based row/column stored on the mouse event.
  e.terminalRow = Math.floor(
      (e.clientY - this.scrollPort_.visibleRowTopMargin) /
      this.scrollPort_.characterSize.height) + 1;
  e.terminalColumn = Math.floor(
      e.clientX / this.scrollPort_.characterSize.width) + 1;

  if (e.type == 'mousedown' && e.terminalColumn > this.screenSize.width) {
    // Mousedown in the scrollbar area.
    return;
  }

  if (this.options_.cursorVisible && !reportMouseEvents) {
    // If the cursor is visible and we're not sending mouse events to the
    // host app, then we want to hide the terminal cursor when the mouse
    // cursor is over top.  This keeps the terminal cursor from interfering
    // with local text selection.
    if (e.terminalRow - 1 == this.screen_.cursorPosition.row &&
        e.terminalColumn - 1 == this.screen_.cursorPosition.column) {
      this.cursorNode_.style.display = 'none';
    } else if (this.cursorNode_.style.display == 'none') {
      this.cursorNode_.style.display = '';
    }
  }

  if (e.type == 'mousedown') {
    this.contextMenu.hide();

    if (e.altKey || !reportMouseEvents) {
      // If VT mouse reporting is disabled, or has been defeated with
      // alt-mousedown, then the mouse will act on the local selection.
      this.defeatMouseReports_ = true;
      this.setSelectionEnabled(true);
    } else {
      // Otherwise we defer ownership of the mouse to the VT.
      this.defeatMouseReports_ = false;
      this.document_.getSelection().collapseToEnd();
      this.setSelectionEnabled(false);
      e.preventDefault();
    }
  }

  if (!reportMouseEvents) {
    if (e.type == 'dblclick') {
      this.screen_.expandSelection(this.document_.getSelection());
      if (this.copyOnSelect)
        this.copySelectionToClipboard();
    }

    if (e.type == 'click' && !e.shiftKey && (e.ctrlKey || e.metaKey)) {
      // Debounce this event with the dblclick event.  If you try to doubleclick
      // a URL to open it, Chrome will fire click then dblclick, but we won't
      // have expanded the selection text at the first click event.
      clearTimeout(this.timeouts_.openUrl);
      this.timeouts_.openUrl = setTimeout(this.openSelectedUrl_.bind(this),
                                          500);
      return;
    }

    if (e.type == 'mousedown') {
      if (e.ctrlKey && e.button == 2 /* right button */) {
        e.preventDefault();
        this.contextMenu.show(e, this);
      } else if (e.button == this.mousePasteButton ||
          (this.mouseRightClickPaste && e.button == 2 /* right button */)) {
        if (!this.paste())
          console.warn('Could not paste manually due to web restrictions');
      }
    }

    if (e.type == 'mouseup' && e.button == 0 && this.copyOnSelect &&
        !this.document_.getSelection().isCollapsed) {
      this.copySelectionToClipboard();
    }

    if ((e.type == 'mousemove' || e.type == 'mouseup') &&
        this.scrollBlockerNode_.engaged) {
      // Disengage the scroll-blocker after one of these events.
      this.scrollBlockerNode_.engaged = false;
      this.scrollBlockerNode_.style.top = '-99px';
    }

    // Emulate arrow key presses via scroll wheel events.
    if (this.scrollWheelArrowKeys_ && !e.shiftKey &&
        this.keyboard.applicationCursor && !this.isPrimaryScreen()) {
      if (e.type == 'wheel') {
        const delta =
            this.scrollPort_.scrollWheelDelta(/** @type {!WheelEvent} */ (e));

        // Helper to turn a wheel event delta into a series of key presses.
        const deltaToArrows = (distance, charSize, arrowPos, arrowNeg) => {
          if (distance == 0) {
            return '';
          }

          // Convert the scroll distance into a number of rows/cols.
          const cells = lib.f.smartFloorDivide(Math.abs(distance), charSize);
          const data = '\x1bO' + (distance < 0 ? arrowNeg : arrowPos);
          return data.repeat(cells);
        };

        // The order between up/down and left/right doesn't really matter.
        this.io.sendString(
            // Up/down arrow keys.
            deltaToArrows(delta.y, this.scrollPort_.characterSize.height,
                          'A', 'B') +
            // Left/right arrow keys.
            deltaToArrows(delta.x, this.scrollPort_.characterSize.width,
                          'C', 'D')
        );

        e.preventDefault();
      }
    }
  } else /* if (this.reportMouseEvents) */ {
    if (!this.scrollBlockerNode_.engaged) {
      if (e.type == 'mousedown') {
        // Move the scroll-blocker into place if we want to keep the scrollport
        // from scrolling.
        this.scrollBlockerNode_.engaged = true;
        this.scrollBlockerNode_.style.top = (e.clientY - 5) + 'px';
        this.scrollBlockerNode_.style.left = (e.clientX - 5) + 'px';
      } else if (e.type == 'mousemove') {
        // Oh.  This means that drag-scroll was disabled AFTER the mouse down,
        // in which case it's too late to engage the scroll-blocker.
        this.document_.getSelection().collapseToEnd();
        e.preventDefault();
      }
    }

    this.onMouse(e);
  }

  if (e.type == 'mouseup' && this.document_.getSelection().isCollapsed) {
    // Restore this on mouseup in case it was temporarily defeated with a
    // alt-mousedown.  Only do this when the selection is empty so that
    // we don't immediately kill the users selection.
    this.defeatMouseReports_ = false;
  }
};

/**
 * Clients should override this if they care to know about mouse events.
 *
 * The event parameter will be a normal DOM mouse click event with additional
 * 'terminalRow' and 'terminalColumn' properties.
 *
 * @param {!MouseEvent} e The mouse event to handle.
 */
hterm.Terminal.prototype.onMouse = function(e) { };

/**
 * React when focus changes.
 *
 * @param {boolean} focused True if focused, false otherwise.
 */
hterm.Terminal.prototype.onFocusChange_ = function(focused) {
  this.cursorNode_.setAttribute('focus', focused);
  this.restyleCursor_();

  if (this.reportFocus)
    this.io.sendString(focused === true ? '\x1b[I' : '\x1b[O');

  if (focused === true)
    this.closeBellNotifications_();
};

/**
 * React when the ScrollPort is scrolled.
 */
hterm.Terminal.prototype.onScroll_ = function() {
  this.scheduleSyncCursorPosition_();
};

/**
 * React when text is pasted into the scrollPort.
 *
 * @param {{text: string}} e The text of the paste event to handle.
 */
hterm.Terminal.prototype.onPaste_ = function(e) {
  var data = e.text.replace(/\n/mg, '\r');
  if (this.options_.bracketedPaste) {
    // We strip out most escape sequences as they can cause issues (like
    // inserting an \x1b[201~ midstream).  We pass through whitespace
    // though: 0x08:\b 0x09:\t 0x0a:\n 0x0d:\r.
    // This matches xterm behavior.
    const filter = (data) => data.replace(/[\x00-\x07\x0b-\x0c\x0e-\x1f]/g, '');
    data = '\x1b[200~' + filter(data) + '\x1b[201~';
  }

  this.io.sendString(data);
};

/**
 * React when the user tries to copy from the scrollPort.
 *
 * @param {!Event} e The DOM copy event.
 */
hterm.Terminal.prototype.onCopy_ = function(e) {
  if (!this.useDefaultWindowCopy) {
    e.preventDefault();
    setTimeout(this.copySelectionToClipboard.bind(this), 0);
  }
};

/**
 * React when the ScrollPort is resized.
 *
 * Note: This function should not directly contain code that alters the internal
 * state of the terminal.  That kind of code belongs in realizeWidth or
 * realizeHeight, so that it can be executed synchronously in the case of a
 * programmatic width change.
 */
hterm.Terminal.prototype.onResize_ = function() {
  var columnCount = Math.floor(this.scrollPort_.getScreenWidth() /
                               this.scrollPort_.characterSize.width) || 0;
  var rowCount = lib.f.smartFloorDivide(this.scrollPort_.getScreenHeight(),
                            this.scrollPort_.characterSize.height) || 0;

  if (columnCount <= 0 || rowCount <= 0) {
    // We avoid these situations since they happen sometimes when the terminal
    // gets removed from the document or during the initial load, and we can't
    // deal with that.
    // This can also happen if called before the scrollPort calculates the
    // character size, meaning we dived by 0 above and default to 0 values.
    return;
  }

  var isNewSize = (columnCount != this.screenSize.width ||
                   rowCount != this.screenSize.height);
  const wasScrolledEnd = this.scrollPort_.isScrolledEnd;

  // We do this even if the size didn't change, just to be sure everything is
  // in sync.
  this.realizeSize_(columnCount, rowCount);
  this.showZoomWarning_(this.scrollPort_.characterSize.zoomFactor != 1);

  if (isNewSize)
    this.overlaySize();

  this.restyleCursor_();
  this.scheduleSyncCursorPosition_();

  if (wasScrolledEnd) {
    this.scrollEnd();
  }
};

/**
 * Service the cursor blink timeout.
 */
hterm.Terminal.prototype.onCursorBlink_ = function() {
  if (!this.options_.cursorBlink) {
    delete this.timeouts_.cursorBlink;
    return;
  }

  if (this.cursorNode_.getAttribute('focus') == 'false' ||
      this.cursorNode_.style.opacity == '0' ||
      this.cursorBlinkPause_) {
    this.cursorNode_.style.opacity = '1';
    this.timeouts_.cursorBlink = setTimeout(this.myOnCursorBlink_,
                                            this.cursorBlinkCycle_[0]);
  } else {
    this.cursorNode_.style.opacity = '0';
    this.timeouts_.cursorBlink = setTimeout(this.myOnCursorBlink_,
                                            this.cursorBlinkCycle_[1]);
  }
};

/**
 * Set the scrollbar-visible mode bit.
 *
 * If scrollbar-visible is on, the vertical scrollbar will be visible.
 * Otherwise it will not.
 *
 * Defaults to on.
 *
 * @param {boolean} state True to set scrollbar-visible mode, false to unset.
 */
hterm.Terminal.prototype.setScrollbarVisible = function(state) {
  this.scrollPort_.setScrollbarVisible(state);
};

/**
 * Set the scroll wheel move multiplier.  This will affect how fast the page
 * scrolls on wheel events.
 *
 * Defaults to 1.
 *
 * @param {number} multiplier The multiplier to set.
 */
hterm.Terminal.prototype.setScrollWheelMoveMultipler = function(multiplier) {
  this.scrollPort_.setScrollWheelMoveMultipler(multiplier);
};

/**
 * Close all web notifications created by terminal bells.
 */
hterm.Terminal.prototype.closeBellNotifications_ = function() {
  this.bellNotificationList_.forEach(function(n) {
      n.close();
    });
  this.bellNotificationList_.length = 0;
};

/**
 * Syncs the cursor position when the scrollport gains focus.
 */
hterm.Terminal.prototype.onScrollportFocus_ = function() {
  // If the cursor is offscreen we set selection to the last row on the screen.
  const topRowIndex = this.scrollPort_.getTopRowIndex();
  const bottomRowIndex = this.scrollPort_.getBottomRowIndex(topRowIndex);
  const selection = this.document_.getSelection();
  if (!this.syncCursorPosition_() && selection) {
    selection.collapse(this.getRowNode(bottomRowIndex));
  }
};
