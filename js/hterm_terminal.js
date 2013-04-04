// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('lib.colors', 'lib.PreferenceManager', 'lib.resource',
          'hterm.Keyboard', 'hterm.Options', 'hterm.PreferenceManager',
          'hterm.Screen', 'hterm.ScrollPort', 'hterm.Size', 'hterm.VT');

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
 * @param {string} opt_profileId Optional preference profile name.  If not
 *     provided, defaults to 'default'.
 */
hterm.Terminal = function(opt_profileId) {
  this.profileId_ = null;

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

  // These prefs are cached so we don't have to read from local storage with
  // each output and keystroke.  They are initialized by the preference manager.
  this.scrollOnOutput_ = null;
  this.scrollOnKeystroke_ = null;
  this.foregroundColor_ = null;
  this.backgroundColor_ = null;

  // Terminal bell sound.
  this.bellAudio_ = this.document_.createElement('audio');
  this.bellAudio_.setAttribute('preload', 'auto');

  // Cursor position and attributes saved with DECSC.
  this.savedOptions_ = {};

  // The current mode bits for the terminal.
  this.options_ = new hterm.Options();

  // Timeouts we might need to clear.
  this.timeouts_ = {};

  // The VT escape sequence interpreter.
  this.vt = new hterm.VT(this);

  // The keyboard hander.
  this.keyboard = new hterm.Keyboard(this);

  // General IO interface that can be given to third parties without exposing
  // the entire terminal object.
  this.io = new hterm.Terminal.IO(this);

  // True if mouse-click-drag should scroll the terminal.
  this.enableMouseDragScroll = true;

  this.copyOnSelect = null;
  this.mousePasteButton = null;

  this.realizeSize_(80, 24);
  this.setDefaultTabStops();

  this.setProfile(opt_profileId || 'default',
                  function() { this.onTerminalReady() }.bind(this));
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
 * @param {string} newName The name of the preference profile.  Forward slash
 *     characters will be removed from the name.
 * @param {function} opt_callback Optional callback to invoke when the profile
 *     transition is complete.
 */
hterm.Terminal.prototype.setProfile = function(profileId, opt_callback) {
  this.profileId_ = profileId.replace(/\//g, '');

  var terminal = this;

  if (this.prefs_)
    this.prefs_.deactivate();

  this.prefs_ = new hterm.PreferenceManager(this.profileId_);
  this.prefs_.addObservers(null, {
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
          var i = parseInt(key);
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

      terminal.primaryScreen_.textAttributes.resetColorPalette()
      terminal.alternateScreen_.textAttributes.resetColorPalette();
    },

    'copy-on-select': function(v) {
      terminal.copyOnSelect = !!v;
    },

    'enable-8-bit-control': function(v) {
      terminal.vt.enable8BitControl = !!v;
    },

    'enable-bold': function(v) {
      terminal.syncBoldSafeState();
    },

    'enable-clipboard-write': function(v) {
      terminal.vt.enableClipboardWrite = !!v;
    },

    'font-family': function(v) {
      terminal.syncFontFamily();
    },

    'font-size': function(v) {
      terminal.setFontSize(v);
    },

    'font-smoothing': function(v) {
      terminal.syncFontFamily();
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

    'mouse-cell-motion-trick': function(v) {
      terminal.vt.setMouseCellMotionTrick(v);
    },

    'mouse-paste-button': function(v) {
      terminal.syncMousePasteButton();
    },

    'pass-alt-number': function(v) {
      if (v == null) {
        var osx = window.navigator.userAgent.match(/Mac OS X/);

        // Let Alt-1..9 pass to the browser (to control tab switching) on
        // non-OS X systems, or if hterm is not opened in an app window.
        v = (!osx && hterm.windowType != 'popup');
      }

      terminal.passAltNumber = v;
    },

    'pass-ctrl-number': function(v) {
      if (v == null) {
        var osx = window.navigator.userAgent.match(/Mac OS X/);

        // Let Ctrl-1..9 pass to the browser (to control tab switching) on
        // non-OS X systems, or if hterm is not opened in an app window.
        v = (!osx && hterm.windowType != 'popup');
      }

      terminal.passCtrlNumber = v;
    },

    'pass-meta-number': function(v) {
      if (v == null) {
        var osx = window.navigator.userAgent.match(/Mac OS X/);

        // Let Meta-1..9 pass to the browser (to control tab switching) on
        // OS X systems, or if hterm is not opened in an app window.
        v = (osx && hterm.windowType != 'popup');
      }

      terminal.passMetaNumber = v;
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

    'shift-insert-paste': function(v) {
      terminal.keyboard.shiftInsertPaste = v;
    },

    'page-keys-scroll': function(v) {
      terminal.keyboard.pageKeysScroll = v;
    }
  });

  this.prefs_.readStorage(function() {
    this.prefs_.notifyAll();

    if (opt_callback)
      opt_callback();
  }.bind(this));
};


/**
 * Set the color for the cursor.
 *
 * If you want this setting to persist, set it through prefs_, rather than
 * with this method.
 */
hterm.Terminal.prototype.setCursorColor = function(color) {
  this.cursorNode_.style.backgroundColor = color;
  this.cursorNode_.style.borderColor = color;
};

/**
 * Return the current cursor color as a string.
 */
hterm.Terminal.prototype.getCursorColor = function() {
  return this.cursorNode_.style.backgroundColor;
};

/**
 * Enable or disable mouse based text selection in the terminal.
 */
hterm.Terminal.prototype.setSelectionEnabled = function(state) {
  this.enableMouseDragScroll = state;
  this.scrollPort_.setSelectionEnabled(state);
};

/**
 * Set the background color.
 *
 * If you want this setting to persist, set it through prefs_, rather than
 * with this method.
 */
hterm.Terminal.prototype.setBackgroundColor = function(color) {
  this.backgroundColor_ = lib.colors.normalizeCSS(color);
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
 */
hterm.Terminal.prototype.getBackgroundColor = function() {
  return this.backgroundColor_;
};

/**
 * Set the foreground color.
 *
 * If you want this setting to persist, set it through prefs_, rather than
 * with this method.
 */
hterm.Terminal.prototype.setForegroundColor = function(color) {
  this.foregroundColor_ = lib.colors.normalizeCSS(color);
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
 */
hterm.Terminal.prototype.getForegroundColor = function() {
  return this.foregroundColor_;
};

/**
 * Create a new instance of a terminal command and run it with a given
 * argument string.
 *
 * @param {function} commandClass The constructor for a terminal command.
 * @param {string} argString The argument string to pass to the command.
 */
hterm.Terminal.prototype.runCommandClass = function(commandClass, argString) {
  var environment = this.prefs_.get('environment');
  if (typeof environment != 'object' || environment == null)
    environment = {};

  var self = this;
  this.command = new commandClass(
      { argString: argString || '',
        io: this.io.push(),
        environment: environment,
        onExit: function(code) {
          self.io.pop();
          self.uninstallKeyboard();
          if (self.prefs_.get('close-on-exit'))
              window.close();
        }
      });

  this.installKeyboard();
  this.command.run();
};

/**
 * Returns true if the current screen is the primary screen, false otherwise.
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
  this.keyboard.installKeyboard(this.document_.body.firstChild);
}

/**
 * Uninstall the keyboard handler for this terminal.
 */
hterm.Terminal.prototype.uninstallKeyboard = function() {
  this.keyboard.installKeyboard(null);
}

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
  if (px === 0)
    px = this.prefs_.get('font-size');

  this.scrollPort_.setFontSize(px);
};

/**
 * Get the current font size.
 */
hterm.Terminal.prototype.getFontSize = function() {
  return this.scrollPort_.getFontSize();
};

/**
 * Get the current font family.
 */
hterm.Terminal.prototype.getFontFamily = function() {
  return this.scrollPort_.getFontFamily();
};

/**
 * Set the CSS "font-family" for this terminal.
 */
hterm.Terminal.prototype.syncFontFamily = function() {
  this.scrollPort_.setFontFamily(this.prefs_.get('font-family'),
                                 this.prefs_.get('font-smoothing'));
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

  var ary = navigator.userAgent.match(/\(X11;\s+(\S+)/);
  if (!ary || ary[2] == 'CrOS') {
    this.mousePasteButton = 2;
  } else {
    this.mousePasteButton = 3;
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
 * Return a copy of the current cursor position.
 *
 * @return {hterm.RowCol} The RowCol object representing the current position.
 */
hterm.Terminal.prototype.saveCursor = function() {
  return this.screen_.cursorPosition.clone();
};

hterm.Terminal.prototype.getTextAttributes = function() {
  return this.screen_.textAttributes;
};

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
 */
hterm.Terminal.prototype.setWindowTitle = function(title) {
  window.document.title = title;
};

/**
 * Restore a previously saved cursor position.
 *
 * @param {hterm.RowCol} cursor The position to restore.
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
 * Set the width of the terminal, resizing the UI to match.
 */
hterm.Terminal.prototype.setWidth = function(columnCount) {
  if (columnCount == null) {
    this.div_.style.width = '100%';
    return;
  }

  this.div_.style.width = this.scrollPort_.characterSize.width *
      columnCount + this.scrollPort_.currentScrollbarWidthPx + 'px';
  this.realizeSize_(columnCount, this.screenSize.height);
  this.scheduleSyncCursorPosition_();
};

/**
 * Set the height of the terminal, resizing the UI to match.
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
 */
hterm.Terminal.prototype.realizeSize_ = function(columnCount, rowCount) {
  if (columnCount != this.screenSize.width)
    this.realizeWidth_(columnCount);

  if (rowCount != this.screenSize.height)
    this.realizeHeight_(rowCount);

  // Send new terminal size to plugin.
  this.io.onTerminalResize(columnCount, rowCount);
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
 */
hterm.Terminal.prototype.realizeWidth_ = function(columnCount) {
  if (columnCount <= 0)
    throw new Error('Attempt to realize bad width: ' + columnCount);

  var deltaColumns = columnCount - this.screen_.getWidth();

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
 */
hterm.Terminal.prototype.realizeHeight_ = function(rowCount) {
  if (rowCount <= 0)
    throw new Error('Attempt to realize bad height: ' + rowCount);

  var deltaRows = rowCount - this.screen_.getHeight();

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
  var i = this.scrollPort_.getTopRowIndex();
  this.scrollPort_.scrollRowToTop(i - this.screenSize.height + 1);
};

/**
 * Scroll the terminal one page down (minus one line) relative to the current
 * position.
 */
hterm.Terminal.prototype.scrollPageDown = function() {
  var i = this.scrollPort_.getTopRowIndex();
  this.scrollPort_.scrollRowToTop(i + this.screenSize.height - 1);
};

/**
 * Clear primary screen, secondary screen, and the scrollback buffer.
 */
hterm.Terminal.prototype.wipeContents = function() {
  this.scrollbackRows_.length = 0;
  this.scrollPort_.resetCache();

  [this.primaryScreen_, this.alternateScreen_].forEach(function(screen) {
    var bottom = screen.getHeight();
    if (bottom > 0) {
      this.renumberRows_(0, bottom);
      this.clearHome(screen);
    }
  }.bind(this));

  this.syncCursorPosition_();
  this.scrollPort_.invalidate();
};

/**
 * Full terminal reset.
 */
hterm.Terminal.prototype.reset = function() {
  this.clearAllTabStops();
  this.setDefaultTabStops();

  this.clearHome(this.primaryScreen_);
  this.primaryScreen_.textAttributes.reset();

  this.clearHome(this.alternateScreen_);
  this.alternateScreen_.textAttributes.reset();

  this.setCursorBlink(!!this.prefs_.get('cursor-blink'));

  this.vt.reset();

  this.softReset();
};

/**
 * Soft terminal reset.
 *
 * Perform a soft reset to the default values listed in
 * http://www.vt100.net/docs/vt510-rm/DECSTR#T5-9
 */
hterm.Terminal.prototype.softReset = function() {
  // Reset terminal options to their default values.
  this.options_ = new hterm.Options();

  // Xterm also resets the color palette on soft reset, even though it doesn't
  // seem to be documented anywhere.
  this.primaryScreen_.textAttributes.resetColorPalette();
  this.alternateScreen_.textAttributes.resetColorPalette();

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
 * @param {int} column Zero based column.
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
 * @param {int} opt_start Optional starting zero based starting column, useful
 *     for filling out missing tab stops when the terminal is resized.
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
  this.vt.interpret(str);
  this.scheduleSyncCursorPosition_();
};

/**
 * Take over the given DIV for use as the terminal display.
 *
 * @param {HTMLDivElement} div The div to use as the terminal display.
 */
hterm.Terminal.prototype.decorate = function(div) {
  this.div_ = div;

  this.scrollPort_.decorate(div);
  this.scrollPort_.setBackgroundImage(this.prefs_.get('background-image'));
  this.scrollPort_.setBackgroundSize(this.prefs_.get('background-size'));
  this.scrollPort_.setBackgroundPosition(
      this.prefs_.get('background-position'));

  this.div_.focus = this.focus.bind(this);

  this.setFontSize(this.prefs_.get('font-size'));
  this.syncFontFamily();

  this.setScrollbarVisible(this.prefs_.get('scrollbar-visible'));

  this.document_ = this.scrollPort_.getDocument();

  this.document_.body.oncontextmenu = function() { return false };

  var onMouse = this.onMouse_.bind(this);
  this.document_.body.firstChild.addEventListener('mousedown', onMouse);
  this.document_.body.firstChild.addEventListener('mouseup', onMouse);
  this.document_.body.firstChild.addEventListener('mousemove', onMouse);
  this.scrollPort_.onScrollWheel = onMouse;

  this.document_.body.firstChild.addEventListener(
      'focus', this.onFocusChange_.bind(this, true));
  this.document_.body.firstChild.addEventListener(
      'blur', this.onFocusChange_.bind(this, false));

  var style = this.document_.createElement('style');
  style.textContent =
      ('.cursor-node[focus="false"] {' +
       '  box-sizing: border-box;' +
       '  background-color: transparent !important;' +
       '  border-width: 2px;' +
       '  border-style: solid;' +
       '}');
  this.document_.head.appendChild(style);

  this.cursorNode_ = this.document_.createElement('div');
  this.cursorNode_.className = 'cursor-node';
  this.cursorNode_.style.cssText =
      ('position: absolute;' +
       'top: -99px;' +
       'display: block;' +
       'width: ' + this.scrollPort_.characterSize.width + 'px;' +
       'height: ' + this.scrollPort_.characterSize.height + 'px;' +
       '-webkit-transition: opacity, background-color 100ms linear;');
  this.setCursorColor(this.prefs_.get('cursor-color'));

  this.document_.body.appendChild(this.cursorNode_);

  // When 'enableMouseDragScroll' is off we reposition this element directly
  // under the mouse cursor after a click.  This makes Chrome associate
  // subsequent mousemove events with the scroll-blocker.  Since the
  // scroll-blocker is a peer (not a child) of the scrollport, the mousemove
  // events do not cause the scrollport to scroll.
  //
  // It's a hack, but it's the cleanest way I could find.
  this.scrollBlockerNode_ = this.document_.createElement('div');
  this.scrollBlockerNode_.style.cssText =
      ('position: absolute;' +
       'top: -99px;' +
       'display: block;' +
       'width: 10px;' +
       'height: 10px;');
  this.document_.body.appendChild(this.scrollBlockerNode_);

  var onMouse = this.onMouse_.bind(this);
  this.scrollPort_.onScrollWheel = onMouse;
  ['mousedown', 'mouseup', 'mousemove', 'click', 'dblclick',
   ].forEach(function(event) {
       this.scrollBlockerNode_.addEventListener(event, onMouse);
       this.cursorNode_.addEventListener(event, onMouse);
       this.document_.addEventListener(event, onMouse);
     }.bind(this));

  this.cursorNode_.addEventListener('mousedown', function() {
      setTimeout(this.focus.bind(this));
    }.bind(this));

  this.setCursorBlink(!!this.prefs_.get('cursor-blink'));
  this.setReverseVideo(false);

  this.scrollPort_.focus();
  this.scrollPort_.scheduleRedraw();
};

/**
 * Return the HTML document that contains the terminal DOM nodes.
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
 * Return the HTML Element for a given row index.
 *
 * This is a method from the RowProvider interface.  The ScrollPort uses
 * it to fetch rows on demand as they are scrolled into view.
 *
 * TODO(rginda): Consider saving scrollback rows as (HTML source, text content)
 * pairs to conserve memory.
 *
 * @param {integer} index The zero-based row index, measured relative to the
 *     start of the scrollback buffer.  On-screen rows will always have the
 *     largest indicies.
 * @return {HTMLElement} The 'x-row' element containing for the requested row.
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
 * @param {integer} start The zero-based row index to start from, measured
 *     relative to the start of the scrollback buffer.  On-screen rows will
 *     always have the largest indicies.
 * @param {integer} end The zero-based row index to end on, measured
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
 * @param {integer} index The zero-based row index to return, measured
 *     relative to the start of the scrollback buffer.  On-screen rows will
 *     always have the largest indicies.
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
 * @return {integer} The number of rows in this terminal.
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
 * The start and end indicies are relative to the screen, not the scrollback.
 * Rows in the scrollback buffer cannot be renumbered.  Since they are not
 * addressable (you can't delete them, scroll them, etc), you should have
 * no need to renumber scrollback rows.
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
 * @param{string} str The string to print.
 */
hterm.Terminal.prototype.print = function(str) {
  var startOffset = 0;

  while (startOffset < str.length) {
    if (this.options_.wraparound && this.screen_.cursorPosition.overflow) {
      this.screen_.commitLineOverflow();
      this.newLine();
    }

    var count = str.length - startOffset;
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
      substr = str.substr(startOffset, count - 1) +
          str.substr(str.length - 1);
      count = str.length;
    } else {
      substr = str.substr(startOffset, count);
    }

    if (this.options_.insertMode) {
      this.screen_.insertString(substr);
    } else {
      this.screen_.overwriteString(substr);
    }

    this.screen_.maybeClipCurrentRow();
    startOffset += count;
  }

  this.scheduleSyncCursorPosition_();

  if (this.scrollOnOutput_)
    this.scrollPort_.scrollRowToBottom(this.getRowCount());
};

/**
 * Set the VT scroll region.
 *
 * This also resets the cursor position to the absolute (0, 0) position, since
 * that's what xterm appears to do.
 *
 * @param {integer} scrollTop The zero-based top of the scroll region.
 * @param {integer} scrollBottom The zero-based bottom of the scroll region,
 *     inclusive.
 */
hterm.Terminal.prototype.setVTScrollRegion = function(scrollTop, scrollBottom) {
  this.vtScrollTop_ = scrollTop;
  this.vtScrollBottom_ = scrollBottom;
};

/**
 * Return the top row index according to the VT.
 *
 * This will return 0 unless the terminal has been told to restrict scrolling
 * to some lower row.  It is used for some VT cursor positioning and scrolling
 * commands.
 *
 * @return {integer} The topmost row in the terminal's scroll region.
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
 * @return {integer} The bottommost row in the terminal's scroll region.
 */
hterm.Terminal.prototype.getVTScrollBottom = function() {
  if (this.vtScrollBottom_ != null)
    return this.vtScrollBottom_;

  return this.screenSize.height - 1;
}

/**
 * Process a '\n' character.
 *
 * If the cursor is on the final row of the terminal this will append a new
 * blank row to the screen and scroll the topmost row into the scrollback
 * buffer.
 *
 * Otherwise, this moves the cursor to column zero of the next row.
 */
hterm.Terminal.prototype.newLine = function() {
  if (this.screen_.cursorPosition.row == this.screen_.rowsArray.length - 1) {
    // If we're at the end of the screen we need to append a new line and
    // scroll the top line into the scrollback buffer.
    this.appendRows_(1);
  } else if (this.screen_.cursorPosition.row == this.getVTScrollBottom()) {
    // End of the scroll region does not affect the scrollback buffer.
    this.vtScrollUp(1);
    this.setAbsoluteCursorPosition(this.screen_.cursorPosition.row, 0);
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
  this.screen_.overwriteString(lib.f.getWhitespace(cursor.column + 1));
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
 */
hterm.Terminal.prototype.eraseToRight = function(opt_count) {
  var maxCount = this.screenSize.width - this.screen_.cursorPosition.column;
  var count = opt_count ? Math.min(opt_count, maxCount) : maxCount;

  if (this.screen_.textAttributes.background ===
      this.screen_.textAttributes.DEFAULT_COLOR) {
    var cursorRow = this.screen_.rowsArray[this.screen_.cursorPosition.row];
    if (cursorRow.textContent.length <=
        this.screen_.cursorPosition.column + count) {
      this.screen_.deleteChars(count);
      this.clearCursorOverflow();
      return;
    }
  }

  var cursor = this.saveCursor();
  this.screen_.overwriteString(lib.f.getWhitespace(count));
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
      this.screen_.overwriteString(ch);
    }
  }

  this.restoreCursor(cursor);
};

/**
 * Erase the entire display and leave the cursor at (0, 0).
 *
 * This does not respect the scroll region.
 *
 * @param {hterm.Screen} opt_screen Optional screen to operate on.  Defaults
 *     to the current screen.
 */
hterm.Terminal.prototype.clearHome = function(opt_screen) {
  var screen = opt_screen || this.screen_;
  var bottom = screen.getHeight();

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
 * @param {hterm.Screen} opt_screen Optional screen to operate on.  Defaults
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
 * @param {integer} count The number of lines to insert.
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
 */
hterm.Terminal.prototype.insertSpace = function(count) {
  var cursor = this.saveCursor();

  var ws = lib.f.getWhitespace(count || 1);
  this.screen_.insertString(ws);
  this.screen_.maybeClipCurrentRow();

  this.restoreCursor(cursor);
  this.clearCursorOverflow();
};

/**
 * Forward-delete the specified number of characters starting at the cursor
 * position.
 *
 * @param {integer} count The number of characters to delete.
 */
hterm.Terminal.prototype.deleteChars = function(count) {
  var deleted = this.screen_.deleteChars(count);
  if (deleted && !this.screen_.textAttributes.isDefault()) {
    var cursor = this.saveCursor();
    this.setCursorColumn(this.screenSize.width - deleted);
    this.screen_.insertString(lib.f.getWhitespace(deleted));
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
 * @param {integer} count The number of rows to scroll.
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
 * @param {integer} count The number of rows to scroll.
 */
hterm.Terminal.prototype.vtScrollDown = function(opt_count) {
  var cursor = this.saveCursor();

  this.setAbsoluteCursorPosition(this.getVTScrollTop(), 0);
  this.insertLines(opt_count);

  this.restoreCursor(cursor);
};


/**
 * Set the cursor position.
 *
 * The cursor row is relative to the scroll region if the terminal has
 * 'origin mode' enabled, or relative to the addressable screen otherwise.
 *
 * @param {integer} row The new zero-based cursor row.
 * @param {integer} row The new zero-based cursor column.
 */
hterm.Terminal.prototype.setCursorPosition = function(row, column) {
  if (this.options_.originMode) {
    this.setRelativeCursorPosition(row, column);
  } else {
    this.setAbsoluteCursorPosition(row, column);
  }
};

hterm.Terminal.prototype.setRelativeCursorPosition = function(row, column) {
  var scrollTop = this.getVTScrollTop();
  row = lib.f.clamp(row + scrollTop, scrollTop, this.getVTScrollBottom());
  column = lib.f.clamp(column, 0, this.screenSize.width - 1);
  this.screen_.setCursorPosition(row, column);
};

hterm.Terminal.prototype.setAbsoluteCursorPosition = function(row, column) {
  row = lib.f.clamp(row, 0, this.screenSize.height - 1);
  column = lib.f.clamp(column, 0, this.screenSize.width - 1);
  this.screen_.setCursorPosition(row, column);
};

/**
 * Set the cursor column.
 *
 * @param {integer} column The new zero-based cursor column.
 */
hterm.Terminal.prototype.setCursorColumn = function(column) {
  this.setAbsoluteCursorPosition(this.screen_.cursorPosition.row, column);
};

/**
 * Return the cursor column.
 *
 * @return {integer} The zero-based cursor column.
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
 * @param {integer} row The new cursor row.
 */
hterm.Terminal.prototype.setAbsoluteCursorRow = function(row) {
  this.setAbsoluteCursorPosition(row, this.screen_.cursorPosition.column);
};

/**
 * Return the cursor row.
 *
 * @return {integer} The zero-based cursor row.
 */
hterm.Terminal.prototype.getCursorRow = function(row) {
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
 * @param {integer} count The number of rows to move the cursor.
 */
hterm.Terminal.prototype.cursorUp = function(count) {
  return this.cursorDown(-(count || 1));
};

/**
 * Move the cursor down a specified number of rows.
 *
 * @param {integer} count The number of rows to move the cursor.
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
 * @param {integer} count The number of columns to move the cursor.
 */
hterm.Terminal.prototype.cursorLeft = function(count) {
  return this.cursorRight(-(count || 1));
};

/**
 * Move the cursor right a specified number of columns.
 *
 * @param {integer} count The number of columns to move the cursor.
 */
hterm.Terminal.prototype.cursorRight = function(count) {
  count = count || 1;
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
 */
hterm.Terminal.prototype.setReverseVideo = function(state) {
  this.options_.reverseVideo = state;
  if (state) {
    this.scrollPort_.setForegroundColor(this.prefs_.get('background-color'));
    this.scrollPort_.setBackgroundColor(this.prefs_.get('foreground-color'));
  } else {
    this.scrollPort_.setForegroundColor(this.prefs_.get('foreground-color'));
    this.scrollPort_.setBackgroundColor(this.prefs_.get('background-color'));
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
      self.cursorNode_.style.backgroundColor = self.prefs_.get('cursor-color');
    }, 200);

  if (this.bellAudio_.getAttribute('src')) {
    if (this.bellSquelchTimeout_)
      return;

    this.bellAudio_.play();

    this.bellSequelchTimeout_ = setTimeout(function() {
        delete this.bellSquelchTimeout_;
      }.bind(this), 500);
  } else {
    delete this.bellSquelchTimeout_;
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
    this.cursorNode_.style.opacity = '0';
    return;
  }

  this.syncCursorPosition_();

  this.cursorNode_.style.opacity = '1';

  if (this.options_.cursorBlink) {
    if (this.timeouts_.cursorBlink)
      return;

    this.timeouts_.cursorBlink = setInterval(this.onCursorBlink_.bind(this),
                                             500);
  } else {
    if (this.timeouts_.cursorBlink) {
      clearTimeout(this.timeouts_.cursorBlink);
      delete this.timeouts_.cursorBlink;
    }
  }
};

/**
 * Synchronizes the visible cursor and document selection with the current
 * cursor coordinates.
 */
hterm.Terminal.prototype.syncCursorPosition_ = function() {
  var topRowIndex = this.scrollPort_.getTopRowIndex();
  var bottomRowIndex = this.scrollPort_.getBottomRowIndex(topRowIndex);
  var cursorRowIndex = this.scrollbackRows_.length +
      this.screen_.cursorPosition.row;

  if (cursorRowIndex > bottomRowIndex) {
    // Cursor is scrolled off screen, move it outside of the visible area.
    this.cursorNode_.style.top = -this.scrollPort_.characterSize.height + 'px';
    return;
  }

  this.cursorNode_.style.width = this.scrollPort_.characterSize.width + 'px';
  this.cursorNode_.style.height = this.scrollPort_.characterSize.height + 'px';

  this.cursorNode_.style.top = this.scrollPort_.visibleRowTopMargin +
      this.scrollPort_.characterSize.height * (cursorRowIndex - topRowIndex) +
      'px';
  this.cursorNode_.style.left = this.scrollPort_.characterSize.width *
      this.screen_.cursorPosition.column + 'px';

  this.cursorNode_.setAttribute('title',
                                '(' + this.screen_.cursorPosition.row +
                                ', ' + this.screen_.cursorPosition.column +
                                ')');

  // Update the caret for a11y purposes.
  var selection = this.document_.getSelection();
  if (selection && selection.isCollapsed)
    this.screen_.syncSelectionCaret(selection);
};

/**
 * Synchronizes the visible cursor with the current cursor coordinates.
 *
 * The sync will happen asynchronously, soon after the call stack winds down.
 * Multiple calls will be coalesced into a single sync.
 */
hterm.Terminal.prototype.scheduleSyncCursorPosition_ = function() {
  if (this.timeouts_.syncCursor)
    return;

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
        '-webkit-user-select: none;');
  }

  this.zoomWarningNode_.textContent = lib.MessageManager.replaceReferences(
      hterm.zoomWarningMessage,
      [parseInt(this.scrollPort_.characterSize.zoomFactor * 100)]);

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
 * @param {number} opt_timeout The amount of time to wait before fading out
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
        '-webkit-transition: opacity 180ms ease-in;');
  }

  this.overlayNode_.style.color = this.prefs_.get('background-color');
  this.overlayNode_.style.backgroundColor = this.prefs_.get('foreground-color');
  this.overlayNode_.style.fontFamily = this.prefs_.get('font-family');

  this.overlayNode_.textContent = msg;
  this.overlayNode_.style.opacity = '0.75';

  if (!this.overlayNode_.parentNode)
    this.div_.appendChild(this.overlayNode_);

  var divSize = hterm.getClientSize(this.div_);
  var overlaySize = hterm.getClientSize(this.overlayNode_);

  this.overlayNode_.style.top = (divSize.height - overlaySize.height) / 2;
  this.overlayNode_.style.left = (divSize.width - overlaySize.width -
      this.scrollPort_.currentScrollbarWidthPx) / 2;

  var self = this;

  if (this.overlayTimeout_)
    clearTimeout(this.overlayTimeout_);

  if (opt_timeout === null)
    return;

  this.overlayTimeout_ = setTimeout(function() {
      self.overlayNode_.style.opacity = '0';
      setTimeout(function() {
          if (self.overlayNode_.parentNode)
            self.overlayNode_.parentNode.removeChild(self.overlayNode_);
          self.overlayTimeout_ = null;
          self.overlayNode_.style.opacity = '0.75';
        }, 200);
    }, opt_timeout || 1500);
};

/**
 * Paste from the system clipboard to the terminal.
 */
hterm.Terminal.prototype.paste = function() {
  hterm.pasteFromClipboard(this.document_);
};

/**
 * Copy a string to the system clipboard.
 *
 * Note: If there is a selected range in the terminal, it'll be cleared.
 */
hterm.Terminal.prototype.copyStringToClipboard = function(str) {
  if (this.prefs_.get('enable-clipboard-notice'))
    setTimeout(this.showOverlay.bind(this, hterm.notifyCopyMessage, 500), 200);

  var copySource = this.document_.createElement('pre');
  copySource.textContent = str;
  copySource.style.cssText = (
      '-webkit-user-select: text;' +
      'position: absolute;' +
      'top: -99px');

  this.document_.body.appendChild(copySource);

  var selection = this.document_.getSelection();
  var anchorNode = selection.anchorNode;
  var anchorOffset = selection.anchorOffset;
  var focusNode = selection.focusNode;
  var focusOffset = selection.focusOffset;

  selection.selectAllChildren(copySource);

  hterm.copySelectionToClipboard(this.document_);

  selection.collapse(anchorNode, anchorOffset);
  selection.extend(focusNode, focusOffset);

  copySource.parentNode.removeChild(copySource);
};

hterm.Terminal.prototype.getSelectionText = function() {
  var selection = this.scrollPort_.selection;
  selection.sync();

  if (selection.isCollapsed)
    return null;


  // Start offset measures from the beginning of the line.
  var startOffset = selection.startOffset;
  var node = selection.startNode;

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
      startOffset += node.textContent.length;
    }
  }

  // End offset measures from the end of the line.
  var endOffset = selection.endNode.textContent.length - selection.endOffset;
  var node = selection.endNode;

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
      endOffset += node.textContent.length;
    }
  }

  var rv = this.getRowsText(selection.startRow.rowIndex,
                            selection.endRow.rowIndex + 1);
  return rv.substring(startOffset, rv.length - endOffset);
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

hterm.Terminal.prototype.overlaySize = function() {
  this.showOverlay(this.screenSize.width + 'x' + this.screenSize.height);
};

/**
 * Invoked by hterm.Terminal.Keyboard when a VT keystroke is detected.
 *
 * @param {string} string The VT string representing the keystroke.
 */
hterm.Terminal.prototype.onVTKeystroke = function(string) {
  if (this.scrollOnKeystroke_)
    this.scrollPort_.scrollRowToBottom(this.getRowCount());

  this.io.onVTKeystroke(string);
};

/**
 * Add the terminalRow and terminalColumn properties to mouse events and
 * then forward on to onMouse().
 *
 * The terminalRow and terminalColumn properties contain the (row, column)
 * coordinates for the mouse event.
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

  e.processedByTerminalHandler_ = true;

  if (e.type == 'mousedown' && e.which == this.mousePasteButton) {
    this.paste();
    return;
  }

  if (e.type == 'mouseup' && e.which == 1 && this.copyOnSelect &&
      !this.document_.getSelection().isCollapsed) {
    hterm.copySelectionToClipboard(this.document_);
    return;
  }

  e.terminalRow = parseInt((e.clientY - this.scrollPort_.visibleRowTopMargin) /
                           this.scrollPort_.characterSize.height) + 1;
  e.terminalColumn = parseInt(e.clientX /
                              this.scrollPort_.characterSize.width) + 1;

  if (e.type == 'mousedown') {
    if (e.terminalColumn > this.screenSize.width) {
      // Mousedown in the scrollbar area.
      return;
    }

    if (!this.enableMouseDragScroll) {
      // Move the scroll-blocker into place if we want to keep the scrollport
      // from scrolling.
      this.scrollBlockerNode_.engaged = true;
      this.scrollBlockerNode_.style.top = (e.clientY - 5) + 'px';
      this.scrollBlockerNode_.style.left = (e.clientX - 5) + 'px';
    }
  } else if (this.scrollBlockerNode_.engaged &&
             (e.type == 'mousemove' || e.type == 'mouseup')) {
    // Disengage the scroll-blocker after one of these events.
    this.scrollBlockerNode_.engaged = false;
    this.scrollBlockerNode_.style.top = '-99px';
  }

  this.onMouse(e);
};

/**
 * Clients should override this if they care to know about mouse events.
 *
 * The event parameter will be a normal DOM mouse click event with additional
 * 'terminalRow' and 'terminalColumn' properties.
 */
hterm.Terminal.prototype.onMouse = function(e) { };

/**
 * React when focus changes.
 */
hterm.Terminal.prototype.onFocusChange_ = function(state) {
  this.cursorNode_.setAttribute('focus', state ? 'true' : 'false');
};

/**
 * React when the ScrollPort is scrolled.
 */
hterm.Terminal.prototype.onScroll_ = function() {
  this.scheduleSyncCursorPosition_();
};

/**
 * React when text is pasted into the scrollPort.
 */
hterm.Terminal.prototype.onPaste_ = function(e) {
  var text = this.vt.encodeUTF8(e.text);
  text = text.replace(/\n/mg, '\r');
  this.io.onVTKeystroke(text);
};

/**
 * React when the user tries to copy from the scrollPort.
 */
hterm.Terminal.prototype.onCopy_ = function(e) {
  e.preventDefault();
  this.copySelectionToClipboard();
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
                               this.scrollPort_.characterSize.width);
  var rowCount = Math.floor(this.scrollPort_.getScreenHeight() /
                            this.scrollPort_.characterSize.height);

  if (columnCount <= 0 || rowCount <= 0) {
    // We avoid these situations since they happen sometimes when the terminal
    // gets removed from the document or during the initial load, and we can't
    // deal with that.
    return;
  }

  var isNewSize = (columnCount != this.screenSize.width ||
                   rowCount != this.screenSize.height);

  // We do this even if the size didn't change, just to be sure everything is
  // in sync.
  this.realizeSize_(columnCount, rowCount);
  this.showZoomWarning_(this.scrollPort_.characterSize.zoomFactor != 1);

  if (isNewSize)
    this.overlaySize();

  this.scheduleSyncCursorPosition_();
};

/**
 * Service the cursor blink timeout.
 */
hterm.Terminal.prototype.onCursorBlink_ = function() {
  if (this.cursorNode_.style.opacity == '0') {
    this.cursorNode_.style.opacity = '1';
  } else {
    this.cursorNode_.style.opacity = '0';
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
