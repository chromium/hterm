// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * PreferenceManager subclass managing global NaSSH preferences.
 *
 * This is currently just an ordered list of known connection profiles.
 *
 * @param {string} profileId
 * @extends {lib.PreferenceManager}
 * @constructor
 */
hterm.PreferenceManager = function(profileId) {
  lib.PreferenceManager.call(this, hterm.defaultStorage,
                             hterm.PreferenceManager.prefix_ + profileId);
  Object.entries(hterm.PreferenceManager.defaultPreferences).forEach(
      ([key, entry]) => {
        this.definePreference(key, entry['default']);
      });
};

/**
 * The storage key prefix to namespace the preferences.
 */
hterm.PreferenceManager.prefix_ = '/hterm/profiles/';

/**
 * List all the defined profiles.
 *
 * @param {function(!Array<string>)} callback Called with the list of profiles.
 */
hterm.PreferenceManager.listProfiles = function(callback) {
  hterm.defaultStorage.getItems(null, (items) => {
    const profiles = {};
    for (const key of Object.keys(items)) {
      if (key.startsWith(hterm.PreferenceManager.prefix_)) {
        // Turn "/hterm/profiles/foo/bar/cow" to "foo/bar/cow".
        const subKey = key.slice(hterm.PreferenceManager.prefix_.length);
        // Turn "foo/bar/cow" into "foo".
        profiles[subKey.split('/', 1)[0]] = true;
      }
    }
    callback(Object.keys(profiles));
  });
};

/** @enum {string} */
hterm.PreferenceManager.Categories = {
  Keyboard: 'Keyboard',
  Appearance: 'Appearance',
  CopyPaste: 'CopyPaste',
  Sounds: 'Sounds',
  Scrolling: 'Scrolling',
  Encoding: 'Encoding',
  Extensions: 'Extensions',
  Miscellaneous: 'Miscellaneous',
};

/**
 * List of categories, ordered by display order (top to bottom)
 */
hterm.PreferenceManager.categoryDefinitions = [
  { id: hterm.PreferenceManager.Categories.Appearance,
    text: 'Appearance (fonts, colors, images)'},
  { id: hterm.PreferenceManager.Categories.CopyPaste,
    text: 'Copy & Paste'},
  { id: hterm.PreferenceManager.Categories.Encoding,
    text: 'Encoding'},
  { id: hterm.PreferenceManager.Categories.Keyboard,
    text: 'Keyboard'},
  { id: hterm.PreferenceManager.Categories.Scrolling,
    text: 'Scrolling'},
  { id: hterm.PreferenceManager.Categories.Sounds,
    text: 'Sounds'},
  { id: hterm.PreferenceManager.Categories.Extensions,
    text: 'Extensions'},
  { id: hterm.PreferenceManager.Categories.Miscellaneous,
    text: 'Miscellaneous'},
];

/**
 * Internal helper to create a default preference object.
 *
 * @param {string} name The user readable name/title.
 * @param {!hterm.PreferenceManager.Categories} category The pref category.
 * @param {boolean|number|string|?Object} defaultValue The default pref value.
 * @param {string|!Array<string|null>} type The type for this pref (or an array
 *     for enums).
 * @param {string} help The user readable help text.
 * @return {!Object} The default pref object.
 */
hterm.PreferenceManager.definePref_ = function(
    name, category, defaultValue, type, help) {
  return {
    'name': name,
    'category': category,
    'default': defaultValue,
    'type': type,
    'help': help,
  };
};

hterm.PreferenceManager.defaultPreferences = {
  'alt-gr-mode': hterm.PreferenceManager.definePref_(
      'AltGr key mode',
      hterm.PreferenceManager.Categories.Keyboard,
      null, [null, 'none', 'ctrl-alt', 'left-alt', 'right-alt'],
      `Select an AltGr detection heuristic.\n` +
      `\n` +
      `'null': Autodetect based on navigator.language:\n` +
      `      'en-us' => 'none', else => 'right-alt'\n` +
      `'none': Disable any AltGr related munging.\n` +
      `'ctrl-alt': Assume Ctrl+Alt means AltGr.\n` +
      `'left-alt': Assume left Alt means AltGr.\n` +
      `'right-alt': Assume right Alt means AltGr.`
  ),

  'alt-backspace-is-meta-backspace': hterm.PreferenceManager.definePref_(
      'Alt+Backspace is Meta+Backspace',
      hterm.PreferenceManager.Categories.Keyboard,
      false, 'bool',
      `If set, undoes the Chrome OS Alt+Backspace->DEL remap, so that ` +
      `Alt+Backspace indeed is Alt+Backspace.`
  ),

  'alt-is-meta': hterm.PreferenceManager.definePref_(
      'Treat Alt key as Meta key',
      hterm.PreferenceManager.Categories.Keyboard,
      false, 'bool',
      `Whether the Alt key acts as a Meta key or as a distinct Alt key.`
  ),

  'alt-sends-what': hterm.PreferenceManager.definePref_(
      'Alt key modifier handling',
      hterm.PreferenceManager.Categories.Keyboard,
      'escape', ['escape', '8-bit', 'browser-key'],
      `Controls how the Alt key is handled.\n` +
      `\n` +
      `  escape: Send an ESC prefix.\n` +
      `  8-bit: Add 128 to the typed character as in xterm.\n` +
      `  browser-key: Wait for the keypress event and see what the browser\n` +
      `    says. (This won't work well on platforms where the browser\n` +
      `    performs a default action for some Alt sequences.)`
  ),

  'audible-bell-sound': hterm.PreferenceManager.definePref_(
      'Alert bell sound (URI)',
      hterm.PreferenceManager.Categories.Sounds,
      'lib-resource:hterm/audio/bell', 'url',
      `URL of the terminal bell sound. Empty string for no audible bell.`
  ),

  'desktop-notification-bell': hterm.PreferenceManager.definePref_(
      'Create desktop notifications for alert bells',
      hterm.PreferenceManager.Categories.Sounds,
      false, 'bool',
      `If true, terminal bells in the background will create a Web ` +
      `Notification. https://www.w3.org/TR/notifications/\n` +
      `\n` +
      `Displaying notifications requires permission from the user. When this ` +
      `option is set to true, hterm will attempt to ask the user for ` +
      `permission if necessary. Browsers may not show this permission ` +
      `request if it was not triggered by a user action.\n` +
      `\n` +
      `Chrome extensions with the "notifications" permission have permission ` +
      `to display notifications.`
  ),

  'background-color': hterm.PreferenceManager.definePref_(
      'Background color',
      hterm.PreferenceManager.Categories.Appearance,
      'rgb(16, 16, 16)', 'color',
      `The background color for text with no other color attributes.`
  ),

  'background-image': hterm.PreferenceManager.definePref_(
      'Background image',
      hterm.PreferenceManager.Categories.Appearance,
      '', 'string',
      `CSS value of the background image. Empty string for no image.\n` +
      `\n` +
      `For example:\n` +
      `  url(https://goo.gl/anedTK)\n` +
      `  linear-gradient(top bottom, blue, red)`
  ),

  'background-size': hterm.PreferenceManager.definePref_(
      'Background image size',
      hterm.PreferenceManager.Categories.Appearance,
      '', 'string',
      `CSS value of the background image size.`
  ),

  'background-position': hterm.PreferenceManager.definePref_(
      'Background image position',
      hterm.PreferenceManager.Categories.Appearance,
      '', 'string',
      `CSS value of the background image position.\n` +
      `\n` +
      `For example:\n` +
      `  10% 10%\n` +
      `  center`
  ),

  'backspace-sends-backspace': hterm.PreferenceManager.definePref_(
      'Backspace key behavior',
      hterm.PreferenceManager.Categories.Keyboard,
      false, 'bool',
      `If true, the backspace should send BS ('\\x08', aka ^H). Otherwise ` +
      `the backspace key should send '\\x7f'.`
  ),

  'character-map-overrides': hterm.PreferenceManager.definePref_(
      'Character map overrides',
      hterm.PreferenceManager.Categories.Appearance,
      null, 'value',
      `This is specified as an object. It is a sparse array, where each ` +
      `property is the character set code and the value is an object that is ` +
      `a sparse array itself. In that sparse array, each property is the ` +
      `received character and the value is the displayed character.\n` +
      `\n` +
      `For example:\n` +
      `  {"0":{"+":"\\u2192",",":"\\u2190","-":"\\u2191",".":"\\u2193", ` +
      `"0":"\\u2588"}}`
  ),

  'close-on-exit': hterm.PreferenceManager.definePref_(
      'Close window on exit',
      hterm.PreferenceManager.Categories.Miscellaneous,
      true, 'bool',
      `Whether to close the window when the command finishes executing.`
  ),

  'cursor-blink': hterm.PreferenceManager.definePref_(
      'Cursor blink',
      hterm.PreferenceManager.Categories.Appearance,
      false, 'bool',
      `Whether the text cursor blinks by default. This can be toggled at ` +
      `runtime via terminal escape sequences.`
  ),

  'cursor-blink-cycle': hterm.PreferenceManager.definePref_(
      'Cursor blink rate',
      hterm.PreferenceManager.Categories.Appearance,
      [1000, 500], 'value',
      `The text cursor blink rate in milliseconds.\n` +
      `\n` +
      `A two element array, the first of which is how long the text cursor ` +
      `should be on, second is how long it should be off.`
  ),

  'cursor-shape': hterm.PreferenceManager.definePref_(
      'Text cursor shape',
      hterm.PreferenceManager.Categories.Appearance,
      'BLOCK', ['BLOCK', 'BEAM', 'UNDERLINE'],
      `The shape of the visible text cursor. This can be toggled at ` +
      `runtime via terminal escape sequences.`
  ),

  'cursor-color': hterm.PreferenceManager.definePref_(
      'Text cursor color',
      hterm.PreferenceManager.Categories.Appearance,
      'rgba(255, 0, 0, 0.5)', 'color',
      `The color of the visible text cursor.`
  ),

  'color-palette-overrides': hterm.PreferenceManager.definePref_(
      'Initial color palette',
      hterm.PreferenceManager.Categories.Appearance,
      null, 'value',
      `Override colors in the default palette.\n` +
      `\n` +
      `This can be specified as an array or an object. If specified as an ` +
      `object it is assumed to be a sparse array, where each property ` +
      `is a numeric index into the color palette.\n` +
      `\n` +
      `Values can be specified as almost any CSS color value. This ` +
      `includes #RGB, #RRGGBB, rgb(...), rgba(...), and any color names ` +
      `that are also part of the standard X11 rgb.txt file.\n` +
      `\n` +
      `You can use 'null' to specify that the default value should be not ` +
      `be changed. This is useful for skipping a small number of indices ` +
      `when the value is specified as an array.\n` +
      `\n` +
      `For example, these both set color index 1 to blue:\n` +
      `  {1: "#0000ff"}\n` +
      `  [null, "#0000ff"]`
  ),

  'copy-on-select': hterm.PreferenceManager.definePref_(
      'Automatically copy selected content',
      hterm.PreferenceManager.Categories.CopyPaste,
      true, 'bool',
      `Automatically copy mouse selection to the clipboard.`
  ),

  'use-default-window-copy': hterm.PreferenceManager.definePref_(
      'Let the browser handle text copying',
      hterm.PreferenceManager.Categories.CopyPaste,
      false, 'bool',
      `Whether to use the default browser/OS's copy behavior.\n` +
      `\n` +
      `Allow the browser/OS to handle the copy event directly which might ` +
      `improve compatibility with some systems (where copying doesn't work ` +
      `at all), but makes the text selection less robust.\n` +
      `\n` +
      `For example, long lines that were automatically line wrapped will ` +
      `be copied with the newlines still in them.`
  ),

  'clear-selection-after-copy': hterm.PreferenceManager.definePref_(
      'Automatically clear text selection',
      hterm.PreferenceManager.Categories.CopyPaste,
      true, 'bool',
      `Whether to clear the selection after copying.`
  ),

  'ctrl-plus-minus-zero-zoom': hterm.PreferenceManager.definePref_(
      'Ctrl++/-/0 zoom behavior',
      hterm.PreferenceManager.Categories.Keyboard,
      true, 'bool',
      `If true, Ctrl+Plus/Minus/Zero controls zoom.\n` +
      `If false, Ctrl+Shift+Plus/Minus/Zero controls zoom, Ctrl+Minus sends ` +
      `^_, Ctrl+Plus/Zero do nothing.`
  ),

  'ctrl-c-copy': hterm.PreferenceManager.definePref_(
      'Ctrl+C copy behavior',
      hterm.PreferenceManager.Categories.Keyboard,
      false, 'bool',
      `Ctrl+C copies if true, send ^C to host if false.\n` +
      `Ctrl+Shift+C sends ^C to host if true, copies if false.`
  ),

  'ctrl-v-paste': hterm.PreferenceManager.definePref_(
      'Ctrl+V paste behavior',
      hterm.PreferenceManager.Categories.Keyboard,
      false, 'bool',
      `Ctrl+V pastes if true, send ^V to host if false.\n` +
      `Ctrl+Shift+V sends ^V to host if true, pastes if false.`
  ),

  'east-asian-ambiguous-as-two-column': hterm.PreferenceManager.definePref_(
      'East Asian Ambiguous use two columns',
      hterm.PreferenceManager.Categories.Keyboard,
      false, 'bool',
      `Whether East Asian Ambiguous characters have two column width.`
  ),

  'enable-8-bit-control': hterm.PreferenceManager.definePref_(
      'Support non-UTF-8 C1 control characters',
      hterm.PreferenceManager.Categories.Keyboard,
      false, 'bool',
      `True to enable 8-bit control characters, false to ignore them.\n` +
      `\n` +
      `We'll respect the two-byte versions of these control characters ` +
      `regardless of this setting.`
  ),

  'enable-bold': hterm.PreferenceManager.definePref_(
      'Bold text behavior',
      hterm.PreferenceManager.Categories.Appearance,
      null, 'tristate',
      `If true, use bold weight font for text with the bold/bright ` +
      `attribute. False to use the normal weight font. Null to autodetect.`
  ),

  'enable-bold-as-bright': hterm.PreferenceManager.definePref_(
      'Use bright colors with bold text',
      hterm.PreferenceManager.Categories.Appearance,
      true, 'bool',
      `If true, use bright colors (8-15 on a 16 color palette) for any text ` +
      `with the bold attribute. False otherwise.`
  ),

  'enable-blink': hterm.PreferenceManager.definePref_(
      'Enable blinking text',
      hterm.PreferenceManager.Categories.Appearance,
      true, 'bool',
      `If true, respect the blink attribute. False to ignore it.`
  ),

  'enable-clipboard-notice': hterm.PreferenceManager.definePref_(
      'Show notification when copying content',
      hterm.PreferenceManager.Categories.CopyPaste,
      true, 'bool',
      `Whether to show a message in the terminal when the host writes to the ` +
      `clipboard.`
  ),

  'enable-clipboard-write': hterm.PreferenceManager.definePref_(
      'Allow remote clipboard writes',
      hterm.PreferenceManager.Categories.CopyPaste,
      true, 'bool',
      `Allow the remote host to write directly to the local system ` +
      `clipboard.\n` +
      `Read access is never granted regardless of this setting.\n` +
      `\n` +
      `This is used to control access to features like OSC-52.`
  ),

  'enable-dec12': hterm.PreferenceManager.definePref_(
      'Allow changing of text cursor blinking',
      hterm.PreferenceManager.Categories.Miscellaneous,
      false, 'bool',
      `Respect the host's attempt to change the text cursor blink status ` +
      `using DEC Private Mode 12.`
  ),

  'enable-csi-j-3': hterm.PreferenceManager.definePref_(
      'Allow clearing of scrollback buffer (CSI-J-3)',
      hterm.PreferenceManager.Categories.Miscellaneous,
      true, 'bool',
      `Whether CSI-J (Erase Display) mode 3 may clear the terminal ` +
      `scrollback buffer.\n` +
      `\n` +
      `Enabling this by default is safe.`
  ),

  'environment': hterm.PreferenceManager.definePref_(
      'Environment variables',
      hterm.PreferenceManager.Categories.Miscellaneous,
      {
        // Signal ncurses based apps to use UTF-8 output instead of legacy
        // drawing modes (which only work in ISO-2022 mode).  Since hterm is
        // always UTF-8, this shouldn't cause problems.
        'NCURSES_NO_UTF8_ACS': '1',
        'TERM': 'xterm-256color',
        // Set this env var that a bunch of mainstream terminal emulators set
        // to indicate we support true colors.
        // https://gist.github.com/XVilka/8346728
        'COLORTERM': 'truecolor',
      },
      'value',
      `The initial set of environment variables, as an object.`
  ),

  'font-family': hterm.PreferenceManager.definePref_(
      'Text font family',
      hterm.PreferenceManager.Categories.Appearance,
      '"DejaVu Sans Mono", "Noto Sans Mono", "Everson Mono", FreeMono, ' +
      'Menlo, Terminal, monospace',
      'string',
      `Default font family for the terminal text.`
  ),

  'font-size': hterm.PreferenceManager.definePref_(
      'Text font size',
      hterm.PreferenceManager.Categories.Appearance,
      15, 'int',
      `The default font size in pixels.`
  ),

  'font-smoothing': hterm.PreferenceManager.definePref_(
      'Text font smoothing',
      hterm.PreferenceManager.Categories.Appearance,
      'antialiased', 'string',
      `CSS font-smoothing property.`
  ),

  'foreground-color': hterm.PreferenceManager.definePref_(
      'Text color',
      hterm.PreferenceManager.Categories.Appearance,
      'rgb(240, 240, 240)', 'color',
      `The foreground color for text with no other color attributes.`
  ),

  'enable-resize-status': hterm.PreferenceManager.definePref_(
      'Show terminal dimensions when resized',
      hterm.PreferenceManager.Categories.Appearance,
      false, 'bool',
      `Whether to show terminal dimensions when the terminal changes size.`
  ),

  'hide-mouse-while-typing': hterm.PreferenceManager.definePref_(
      'Hide mouse cursor while typing',
      hterm.PreferenceManager.Categories.Keyboard,
      null, 'tristate',
      `Whether to automatically hide the mouse cursor when typing. ` +
      `By default, autodetect whether the platform/OS handles this.\n` +
      `\n` +
      `Note: Some operating systems may override this setting and thus you ` +
      `might not be able to always disable it.`
  ),

  'home-keys-scroll': hterm.PreferenceManager.definePref_(
      'Home/End key scroll behavior',
      hterm.PreferenceManager.Categories.Keyboard,
      false, 'bool',
      `If true, Home/End controls the terminal scrollbar and Shift+Home/` +
      `Shift+End are sent to the remote host. If false, then Home/End are ` +
      `sent to the remote host and Shift+Home/Shift+End scrolls.`
  ),

  'keybindings': hterm.PreferenceManager.definePref_(
      'Keyboard bindings/shortcuts',
      hterm.PreferenceManager.Categories.Keyboard,
      null, 'value',
      `A map of key sequence to key actions. Key sequences include zero or ` +
      `more modifier keys followed by a key code. Key codes can be decimal ` +
      `or hexadecimal numbers, or a key identifier. Key actions can be ` +
      `specified as a string to send to the host, or an action identifier. ` +
      `For a full explanation of the format, see https://goo.gl/LWRndr.\n` +
      `\n` +
      `Sample keybindings:\n` +
      `{\n` +
      `  "Ctrl+Alt+K": "clearTerminal",\n` +
      `  "Ctrl+Shift+L": "PASS",\n` +
      `  "Ctrl+H": "'Hello World'"\n` +
      `}`
  ),

  'keybindings-os-defaults': hterm.PreferenceManager.definePref_(
      'Use default OS Keyboard bindings/shortcuts',
      hterm.PreferenceManager.Categories.Keyboard,
      false, 'bool',
      `Whether common OS keyboard bindings should be respected instead of ` +
      `always capturing for hterm's own use.`
  ),

  'media-keys-are-fkeys': hterm.PreferenceManager.definePref_(
      'Media keys are Fkeys',
      hterm.PreferenceManager.Categories.Keyboard,
      false, 'bool',
      `If true, convert media keys to their Fkey equivalent. If false, let ` +
      `the browser handle the keys.`
  ),

  'meta-sends-escape': hterm.PreferenceManager.definePref_(
      'Meta key modifier handling',
      hterm.PreferenceManager.Categories.Keyboard,
      true, 'bool',
      `Send an ESC prefix when pressing a key while holding the Meta key.\n` +
      `\n` +
      `For example, when enabled, pressing Meta+K will send ^[k as if you ` +
      `typed Escape then k. When disabled, only k will be sent.`
  ),

  'mouse-right-click-paste': hterm.PreferenceManager.definePref_(
      'Mouse right clicks paste content',
      hterm.PreferenceManager.Categories.CopyPaste,
      true, 'bool',
      `Paste on right mouse button clicks.\n` +
      `\n` +
      `This option is independent of the "mouse-paste-button" setting.\n` +
      `\n` +
      `Note: This will handle left & right handed mice correctly.`
  ),

  'mouse-paste-button': hterm.PreferenceManager.definePref_(
      'Mouse button paste',
      hterm.PreferenceManager.Categories.CopyPaste,
      null, [null, 0, 1, 2, 3, 4, 5, 6],
      `Mouse paste button, or null to autodetect.\n` +
      `\n` +
      `For autodetect, we'll use the middle mouse button for non-X11 ` +
      `platforms (including Chrome OS). On X11, we'll use the right mouse ` +
      `button (since the native window manager should paste via the middle ` +
      `mouse button).\n` +
      `\n` +
      `0 == left (primary) button.\n` +
      `1 == middle (auxiliary) button.\n` +
      `2 == right (secondary) button.\n` +
      `\n` +
      `This option is independent of the setting for right-click paste.\n` +
      `\n` +
      `Note: This will handle left & right handed mice correctly.`
  ),

  'word-break-match-left': hterm.PreferenceManager.definePref_(
      'Automatic selection halting (to the left)',
      hterm.PreferenceManager.Categories.CopyPaste,
      // TODO(vapier): Switch \u back to ‘“‹« once builders are fixed.
      '[^\\s[\\](){}<>"\'^!@#$%&*,;:`\u{2018}\u{201c}\u{2039}\u{ab}]', 'string',
      `Regular expression to halt matching to the left (start) of a ` +
      `selection.\n` +
      `\n` +
      `Normally this is a character class to reject specific characters.\n` +
      `We allow "~" and "." by default as paths frequently start with those.`
  ),

  'word-break-match-right': hterm.PreferenceManager.definePref_(
      'Automatic selection halting (to the right)',
      hterm.PreferenceManager.Categories.CopyPaste,
      // TODO(vapier): Switch \u back to ’”›» once builders are fixed.
      '[^\\s[\\](){}<>"\'^!@#$%&*,;:~.`\u{2019}\u{201d}\u{203a}\u{bb}]',
      'string',
      `Regular expression to halt matching to the right (end) of a ` +
      `selection.\n` +
      `\n` +
      `Normally this is a character class to reject specific characters.`
  ),

  'word-break-match-middle': hterm.PreferenceManager.definePref_(
      'Word break characters',
      hterm.PreferenceManager.Categories.CopyPaste,
      '[^\\s[\\](){}<>"\'^]*', 'string',
      `Regular expression to match all the characters in the middle.\n` +
      `\n` +
      `Normally this is a character class to reject specific characters.\n` +
      `\n` +
      `Used to expand the selection surrounding the starting point.`
  ),

  'page-keys-scroll': hterm.PreferenceManager.definePref_(
      'Page Up/Down key scroll behavior',
      hterm.PreferenceManager.Categories.Keyboard,
      false, 'bool',
      `If true, Page Up/Page Down controls the terminal scrollbar and ` +
      `Shift+Page Up/Shift+Page Down are sent to the remote host. If false, ` +
      `then Page Up/Page Down are sent to the remote host and Shift+Page Up/` +
      `Shift+Page Down scrolls.`
  ),

  'pass-alt-number': hterm.PreferenceManager.definePref_(
      'Alt+1..9 switch tab behavior',
      hterm.PreferenceManager.Categories.Keyboard,
      null, 'tristate',
      `Whether Alt+1..9 is passed to the browser.\n` +
      `\n` +
      `This is handy when running hterm in a browser tab, so that you don't ` +
      `lose Chrome's "switch to tab" keyboard accelerators. When not running ` +
      `in a tab it's better to send these keys to the host so they can be ` +
      `used in vim or emacs.\n` +
      `\n` +
      `If true, Alt+1..9 will be handled by the browser. If false, Alt+1..9 ` +
      `will be sent to the host. If null, autodetect based on browser ` +
      `platform and window type.`
  ),

  'pass-ctrl-number': hterm.PreferenceManager.definePref_(
      'Ctrl+1..9 switch tab behavior',
      hterm.PreferenceManager.Categories.Keyboard,
      null, 'tristate',
      `Whether Ctrl+1..9 is passed to the browser.\n` +
      `\n` +
      `This is handy when running hterm in a browser tab, so that you don't ` +
      `lose Chrome's "switch to tab" keyboard accelerators. When not running ` +
      `in a tab it's better to send these keys to the host so they can be ` +
      `used in vim or emacs.\n` +
      `\n` +
      `If true, Ctrl+1..9 will be handled by the browser. If false, ` +
      `Ctrl+1..9 will be sent to the host. If null, autodetect based on ` +
      `browser platform and window type.`
  ),

  'pass-ctrl-n': hterm.PreferenceManager.definePref_(
      'Ctrl+N new window behavior',
      hterm.PreferenceManager.Categories.Keyboard,
      false, 'bool',
      `Whether Ctrl+N is passed to the browser.\n` +
      `\n` +
      `If true, Ctrl+N will be handled by the browser as the "new window" ` +
      `keyboard accelerator. If false, Ctrl+N will be sent to the host.`
  ),

  'pass-ctrl-t': hterm.PreferenceManager.definePref_(
      'Ctrl+T new tab behavior',
      hterm.PreferenceManager.Categories.Keyboard,
      false, 'bool',
      `Whether Ctrl+T is passed to the browser.\n` +
      `\n` +
      `If true, Ctrl+T will be handled by the browser as the "new tab" ` +
      `keyboard accelerator. If false, Ctrl+T will be sent to the host.`
  ),

  'pass-ctrl-tab': hterm.PreferenceManager.definePref_(
      'Ctrl+Tab switch tab behavior',
      hterm.PreferenceManager.Categories.Keyboard,
      false, 'bool',
      `Whether Ctrl+Tab and Ctrl+Shift+Tab are passed to the browser.\n` +
      `\n` +
      `If true, Ctrl+Tab and Ctrl+Shift+Tab will be handled by the browser ` +
      `as the "next/previous tab" keyboard accelerator. If false, the Tab ` +
      `key is sent to the host without Ctrl or Shift.`
  ),

  'pass-ctrl-w': hterm.PreferenceManager.definePref_(
      'Ctrl+W close tab behavior',
      hterm.PreferenceManager.Categories.Keyboard,
      false, 'bool',
      `Whether Ctrl+W is passed to the browser.\n` +
      `\n` +
      `If true, Ctrl+W will be handled by the browser as the "close tab" ` +
      `keyboard accelerator. If false, Ctrl+W will be sent to the host.`
  ),

  'pass-meta-number': hterm.PreferenceManager.definePref_(
      'Meta+1..9 switch tab behavior',
      hterm.PreferenceManager.Categories.Keyboard,
      null, 'tristate',
      `Whether Meta+1..9 is passed to the browser.\n` +
      `\n` +
      `This is handy when running hterm in a browser tab, so that you don't ` +
      `lose Chrome's "switch to tab" keyboard accelerators. When not running ` +
      `in a tab it's better to send these keys to the host so they can be ` +
      `used in vim or emacs.\n` +
      `\n` +
      `If true, Meta+1..9 will be handled by the browser. If false, ` +
      `Meta+1..9 will be sent to the host. If null, autodetect based on ` +
      `browser platform and window type.`
  ),

  'pass-meta-v': hterm.PreferenceManager.definePref_(
      'Meta+V paste behavior',
      hterm.PreferenceManager.Categories.Keyboard,
      true, 'bool',
      `Whether Meta+V gets passed to host.`
  ),

  'paste-on-drop': hterm.PreferenceManager.definePref_(
      'Allow drag & drop to paste',
      hterm.PreferenceManager.Categories.CopyPaste,
      true, 'bool',
      `If true, Drag and dropped text will paste into terminal.\n` +
      `If false, dropped text will be ignored.`
  ),

  'receive-encoding': hterm.PreferenceManager.definePref_(
      'Receive encoding',
      hterm.PreferenceManager.Categories.Encoding,
      'utf-8', ['utf-8', 'raw'],
      `Set the expected encoding for data received from the host.\n` +
      `If the encodings do not match, visual bugs are likely to be ` +
      `observed.\n` +
      `\n` +
      `Valid values are 'utf-8' and 'raw'.`
  ),

  'scroll-on-keystroke': hterm.PreferenceManager.definePref_(
      'Scroll to bottom after keystroke',
      hterm.PreferenceManager.Categories.Scrolling,
      true, 'bool',
      `Whether to scroll to the bottom on any keystroke.`
  ),

  'scroll-on-output': hterm.PreferenceManager.definePref_(
      'Scroll to bottom after new output',
      hterm.PreferenceManager.Categories.Scrolling,
      false, 'bool',
      `Whether to scroll to the bottom on terminal output.`
  ),

  'scrollbar-visible': hterm.PreferenceManager.definePref_(
      'Scrollbar visibility',
      hterm.PreferenceManager.Categories.Scrolling,
      true, 'bool',
      `The vertical scrollbar mode.`
  ),

  'scroll-wheel-may-send-arrow-keys': hterm.PreferenceManager.definePref_(
      'Emulate arrow keys with scroll wheel',
      hterm.PreferenceManager.Categories.Scrolling,
      false, 'bool',
      `When using the alternative screen buffer, and DECCKM (Application ` +
      `Cursor Keys) is active, mouse wheel scroll events will emulate arrow ` +
      `keys.\n` +
      `\n` +
      `It can be temporarily disabled by holding the Shift key.\n` +
      `\n` +
      `This frequently comes up when using pagers (less) or reading man ` +
      `pages or text editors (vi/nano) or using screen/tmux.`
  ),

  'scroll-wheel-move-multiplier': hterm.PreferenceManager.definePref_(
      'Mouse scroll wheel multiplier',
      hterm.PreferenceManager.Categories.Scrolling,
      1, 'int',
      `The multiplier for scroll wheel events when measured in pixels.\n` +
      `\n` +
      `Alters how fast the page scrolls.`
  ),

  'terminal-encoding': hterm.PreferenceManager.definePref_(
      'Terminal encoding',
      hterm.PreferenceManager.Categories.Encoding,
      'utf-8', ['iso-2022', 'utf-8', 'utf-8-locked'],
      `The default terminal encoding (DOCS).\n` +
      `\n` +
      `ISO-2022 enables character map translations (like graphics maps).\n` +
      `UTF-8 disables support for those.\n` +
      `\n` +
      `The locked variant means the encoding cannot be changed at runtime ` +
      `via terminal escape sequences.\n` +
      `\n` +
      `You should stick with UTF-8 unless you notice broken rendering with ` +
      `legacy applications.`
  ),

  'shift-insert-paste': hterm.PreferenceManager.definePref_(
      'Shift+Insert paste',
      hterm.PreferenceManager.Categories.Keyboard,
      true, 'bool',
      `Whether Shift+Insert is used for pasting or is sent to the remote host.`
  ),

  'user-css': hterm.PreferenceManager.definePref_(
      'Custom CSS (URI)',
      hterm.PreferenceManager.Categories.Appearance,
      '', 'url',
      `URL of user stylesheet to include in the terminal document.`
  ),

  'user-css-text': hterm.PreferenceManager.definePref_(
      'Custom CSS (inline text)',
      hterm.PreferenceManager.Categories.Appearance,
      '', 'multiline-string',
      `Custom CSS text for styling the terminal.`
  ),

  'allow-images-inline': hterm.PreferenceManager.definePref_(
      'Allow inline image display',
      hterm.PreferenceManager.Categories.Extensions,
      null, 'tristate',
      `Whether to allow the remote host to display images in the terminal.\n` +
      `\n` +
      `By default, we prompt until a choice is made.`
  ),
};

hterm.PreferenceManager.prototype =
    Object.create(lib.PreferenceManager.prototype);
/** @override */
hterm.PreferenceManager.constructor = hterm.PreferenceManager;
