// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('lib.f', 'lib.Storage');

/**
 * PreferenceManager subclass managing global NaSSH preferences.
 *
 * This is currently just an ordered list of known connection profiles.
 */
hterm.PreferenceManager = function(profileId) {
  lib.PreferenceManager.call(this, hterm.defaultStorage,
                             '/hterm/profiles/' + profileId);
  var defs = hterm.PreferenceManager.defaultPreferences;
  Object.keys(defs).forEach(function(key) {
    this.definePreference(key, defs[key][1]);
  }.bind(this));
};

hterm.PreferenceManager.categories = {};
hterm.PreferenceManager.categories.Keyboard = 'Keyboard';
hterm.PreferenceManager.categories.Appearance = 'Appearance';
hterm.PreferenceManager.categories.CopyPaste = 'CopyPaste';
hterm.PreferenceManager.categories.Sounds = 'Sounds';
hterm.PreferenceManager.categories.Scrolling = 'Scrolling';
hterm.PreferenceManager.categories.Encoding = 'Encoding';
hterm.PreferenceManager.categories.Miscellaneous = 'Miscellaneous';

/**
 * List of categories, ordered by display order (top to bottom)
 */
hterm.PreferenceManager.categoryDefinitions = [
  { id: hterm.PreferenceManager.categories.Appearance,
    text: 'Appearance (fonts, colors, images)'},
  { id: hterm.PreferenceManager.categories.CopyPaste,
    text: 'Copy & Paste'},
  { id: hterm.PreferenceManager.categories.Encoding,
    text: 'Encoding'},
  { id: hterm.PreferenceManager.categories.Keyboard,
    text: 'Keyboard'},
  { id: hterm.PreferenceManager.categories.Scrolling,
    text: 'Scrolling'},
  { id: hterm.PreferenceManager.categories.Sounds,
    text: 'Sounds'},
  { id: hterm.PreferenceManager.categories.Miscellaneous,
    text: 'Misc.'}
];


hterm.PreferenceManager.defaultPreferences = {
  'alt-gr-mode':
  [hterm.PreferenceManager.categories.Keyboard, null,
   [null, 'none', 'ctrl-alt', 'left-alt', 'right-alt'],
   'Select an AltGr detection hack^Wheuristic.\n' +
   '\n' +
   '\'null\': Autodetect based on navigator.language:\n' +
   '      \'en-us\' => \'none\', else => \'right-alt\'\n' +
   '\'none\': Disable any AltGr related munging.\n' +
   '\'ctrl-alt\': Assume Ctrl+Alt means AltGr.\n' +
   '\'left-alt\': Assume left Alt means AltGr.\n' +
   '\'right-alt\': Assume right Alt means AltGr.\n'],

  'alt-backspace-is-meta-backspace':
  [hterm.PreferenceManager.categories.Keyboard, false, 'bool',
   'If set, undoes the Chrome OS Alt-Backspace->DEL remap, so that ' +
   'alt-backspace indeed is alt-backspace.'],

  'alt-is-meta':
  [hterm.PreferenceManager.categories.Keyboard, false, 'bool',
   'Set whether the alt key acts as a meta key or as a distinct alt key.'],

  'alt-sends-what':
  [hterm.PreferenceManager.categories.Keyboard, 'escape',
   ['escape', '8-bit', 'browser-key'],
   'Controls how the alt key is handled.\n' +
   '\n' +
   '  escape....... Send an ESC prefix.\n' +
   '  8-bit........ Add 128 to the unshifted character as in xterm.\n' +
   '  browser-key.. Wait for the keypress event and see what the browser \n' +
   '                says.  (This won\'t work well on platforms where the \n' +
   '                browser performs a default action for some alt sequences.)'
  ],

  'audible-bell-sound':
  [hterm.PreferenceManager.categories.Sounds, 'lib-resource:hterm/audio/bell',
   'url',
   'URL of the terminal bell sound.  Empty string for no audible bell.'],

  'desktop-notification-bell':
  [hterm.PreferenceManager.categories.Sounds, false, 'bool',
   'If true, terminal bells in the background will create a Web ' +
   'Notification. https://www.w3.org/TR/notifications/\n' +
   '\n'+
   'Displaying notifications requires permission from the user. When this ' +
   'option is set to true, hterm will attempt to ask the user for permission ' +
   'if necessary. Note browsers may not show this permission request if it ' +
   'did not originate from a user action.\n' +
   '\n' +
   'Chrome extensions with the "notifications" permission have permission to ' +
   'display notifications.'],

  'background-color':
  [hterm.PreferenceManager.categories.Appearance, 'rgb(16, 16, 16)', 'color',
   'The background color for text with no other color attributes.'],

  'background-image':
  [hterm.PreferenceManager.categories.Appearance, '', 'string',
   'CSS value of the background image.  Empty string for no image.\n' +
   '\n' +
   'For example:\n' +
   '  url(https://goo.gl/anedTK)\n' +
   '  linear-gradient(top bottom, blue, red)'],

  'background-size':
  [hterm.PreferenceManager.categories.Appearance, '', 'string',
   'CSS value of the background image size.  Defaults to none.'],

  'background-position':
  [hterm.PreferenceManager.categories.Appearance, '', 'string',
   'CSS value of the background image position.\n' +
   '\n' +
   'For example:\n' +
   '  10% 10%\n' +
   '  center'],

  'backspace-sends-backspace':
  [hterm.PreferenceManager.categories.Keyboard, false, 'bool',
   'If true, the backspace should send BS (\'\\x08\', aka ^H).  Otherwise ' +
   'the backspace key should send \'\\x7f\'.'],

  'character-map-overrides':
  [hterm.PreferenceManager.categories.Appearance, null, 'value',
    'This is specified as an object. It is a sparse array, where each '  +
    'property is the character set code and the value is an object that is ' +
    'a sparse array itself. In that sparse array, each property is the ' +
    'received character and the value is the displayed character.\n' +
    '\n' +
    'For example:\n' +
    '  {"0":{"+":"\\u2192",",":"\\u2190","-":"\\u2191",".":"\\u2193", ' +
    '"0":"\\u2588"}}'
  ],

  'close-on-exit':
  [hterm.PreferenceManager.categories.Miscellaneous, true, 'bool',
   'Whether or not to close the window when the command exits.'],

  'cursor-blink':
  [hterm.PreferenceManager.categories.Appearance, false, 'bool',
   'Whether or not to blink the cursor by default.'],

  'cursor-blink-cycle':
  [hterm.PreferenceManager.categories.Appearance, [1000, 500], 'value',
   'The cursor blink rate in milliseconds.\n' +
   '\n' +
   'A two element array, the first of which is how long the cursor should be ' +
   'on, second is how long it should be off.'],

  'cursor-color':
  [hterm.PreferenceManager.categories.Appearance, 'rgba(255, 0, 0, 0.5)',
   'color',
   'The color of the visible cursor.'],

  'color-palette-overrides':
  [hterm.PreferenceManager.categories.Appearance, null, 'value',
   'Override colors in the default palette.\n' +
   '\n' +
   'This can be specified as an array or an object.  If specified as an ' +
   'object it is assumed to be a sparse array, where each property ' +
   'is a numeric index into the color palette.\n' +
   '\n' +
   'Values can be specified as almost any css color value.  This ' +
   'includes #RGB, #RRGGBB, rgb(...), rgba(...), and any color names ' +
   'that are also part of the stock X11 rgb.txt file.\n' +
   '\n' +
   'You can use \'null\' to specify that the default value should be not ' +
   'be changed.  This is useful for skipping a small number of indices ' +
   'when the value is specified as an array.'],

  'copy-on-select':
  [hterm.PreferenceManager.categories.CopyPaste, true, 'bool',
   'Automatically copy mouse selection to the clipboard.'],

  'use-default-window-copy':
  [hterm.PreferenceManager.categories.CopyPaste, false, 'bool',
   'Whether to use the default window copy behavior'],

  'clear-selection-after-copy':
  [hterm.PreferenceManager.categories.CopyPaste, true, 'bool',
   'Whether to clear the selection after copying.'],

  'ctrl-plus-minus-zero-zoom':
  [hterm.PreferenceManager.categories.Keyboard, true, 'bool',
   'If true, Ctrl-Plus/Minus/Zero controls zoom.\n' +
   'If false, Ctrl-Shift-Plus/Minus/Zero controls zoom, Ctrl-Minus sends ^_, ' +
   'Ctrl-Plus/Zero do nothing.'],

  'ctrl-c-copy':
  [hterm.PreferenceManager.categories.Keyboard, false, 'bool',
   'Ctrl+C copies if true, send ^C to host if false.\n' +
   'Ctrl+Shift+C sends ^C to host if true, copies if false.'],

  'ctrl-v-paste':
  [hterm.PreferenceManager.categories.Keyboard, false, 'bool',
   'Ctrl+V pastes if true, send ^V to host if false.\n' +
   'Ctrl+Shift+V sends ^V to host if true, pastes if false.'],

  'east-asian-ambiguous-as-two-column':
  [hterm.PreferenceManager.categories.Keyboard, false, 'bool',
   'Set whether East Asian Ambiguous characters have two column width.'],

  'enable-8-bit-control':
  [hterm.PreferenceManager.categories.Keyboard, false, 'bool',
   'True to enable 8-bit control characters, false to ignore them.\n' +
   '\n' +
   'We\'ll respect the two-byte versions of these control characters ' +
   'regardless of this setting.'],

  'enable-bold':
  [hterm.PreferenceManager.categories.Appearance, null, 'tristate',
   'True if we should use bold weight font for text with the bold/bright ' +
   'attribute.  False to use the normal weight font.  Null to autodetect.'],

  'enable-bold-as-bright':
  [hterm.PreferenceManager.categories.Appearance, true, 'bool',
   'True if we should use bright colors (8-15 on a 16 color palette) ' +
   'for any text with the bold attribute.  False otherwise.'],

  'enable-blink':
  [hterm.PreferenceManager.categories.Appearance, true, 'bool',
   'True if we should respect the blink attribute.  False to ignore it.  '],

  'enable-clipboard-notice':
  [hterm.PreferenceManager.categories.CopyPaste, true, 'bool',
   'Show a message in the terminal when the host writes to the clipboard.'],

  'enable-clipboard-write':
  [hterm.PreferenceManager.categories.CopyPaste, true, 'bool',
   'Allow the host to write directly to the system clipboard.'],

  'enable-dec12':
  [hterm.PreferenceManager.categories.Miscellaneous, false, 'bool',
   'Respect the host\'s attempt to change the cursor blink status using ' +
   'DEC Private Mode 12.'],

  'environment':
  [hterm.PreferenceManager.categories.Miscellaneous, {'TERM': 'xterm-256color'},
   'value',
   'The default environment variables, as an object.'],

  'font-family':
  [hterm.PreferenceManager.categories.Appearance,
   '"DejaVu Sans Mono", "Everson Mono", FreeMono, "Menlo", "Terminal", ' +
   'monospace', 'string',
   'Default font family for the terminal text.'],

  'font-size':
  [hterm.PreferenceManager.categories.Appearance, 15, 'int',
   'The default font size in pixels.'],

  'font-smoothing':
  [hterm.PreferenceManager.categories.Appearance, 'antialiased', 'string',
   'CSS font-smoothing property.'],

  'foreground-color':
  [hterm.PreferenceManager.categories.Appearance, 'rgb(240, 240, 240)', 'color',
   'The foreground color for text with no other color attributes.'],

  'home-keys-scroll':
  [hterm.PreferenceManager.categories.Keyboard, false, 'bool',
   'If true, home/end will control the terminal scrollbar and shift home/end ' +
   'will send the VT keycodes.  If false then home/end sends VT codes and ' +
   'shift home/end scrolls.'],

  'keybindings':
  [hterm.PreferenceManager.categories.Keyboard, null, 'value',
   'A map of key sequence to key actions.  Key sequences include zero or ' +
   'more modifier keys followed by a key code.  Key codes can be decimal or ' +
   'hexadecimal numbers, or a key identifier.  Key actions can be specified ' +
   'a string to send to the host, or an action identifier.  For a full ' +
   'explanation of the format, see https://goo.gl/LWRndr.\n' +
   '\n' +
   'Sample keybindings:\n' +
   '{\n' +
   '  "Ctrl-Alt-K": "clearScrollback",\n' +
   '  "Ctrl-Shift-L": "PASS",\n' +
   '  "Ctrl-H": "\'HELLO\\n\'"\n' +
   '}'],

  'max-string-sequence':
  [hterm.PreferenceManager.categories.Encoding, 100000, 'int',
   'Max length of a DCS, OSC, PM, or APS sequence before we give up and ' +
   'ignore the code.'],

  'media-keys-are-fkeys':
  [hterm.PreferenceManager.categories.Keyboard, false, 'bool',
   'If true, convert media keys to their Fkey equivalent. If false, let ' +
   'the browser handle the keys.'],

  'meta-sends-escape':
  [hterm.PreferenceManager.categories.Keyboard, true, 'bool',
   'Set whether the meta key sends a leading escape or not.'],

  'mouse-right-click-paste':
  [hterm.PreferenceManager.categories.CopyPaste, true, 'bool',
   'Paste on right mouse button clicks.\n' +
   '\n' +
   'This option is activate independent of the "mouse-paste-button" ' +
   'setting.\n' +
   '\n' +
   'Note: This will handle left & right handed mice correctly.'],

  'mouse-paste-button':
  [hterm.PreferenceManager.categories.CopyPaste, null,
   [null, 0, 1, 2, 3, 4, 5, 6],
   'Mouse paste button, or null to autodetect.\n' +
   '\n' +
   'For autodetect, we\'ll use the middle mouse button for non-X11 ' +
   'platforms (including Chrome OS).  On X11, we\'ll use the right mouse ' +
   'button (since the native window manager should paste via the middle ' +
   'mouse button).\n' +
   '\n' +
   '0 == left (primary) button.\n' +
   '1 == middle (auxiliary) button.\n' +
   '2 == right (secondary) button.\n' +
   '\n' +
   'This option is activate independent of the "mouse-right-click-paste" ' +
   'setting.\n' +
   '\n' +
   'Note: This will handle left & right handed mice correctly.'],

  'word-break-match-left':
  [hterm.PreferenceManager.categories.CopyPaste,
   '[^\\s\\[\\](){}<>"\'\\^!@#$%&*,;:`]', 'string',
   'Regular expression to halt matching to the left (start) of a selection.\n' +
   '\n' +
   'Normally this is a character class to reject specific characters.\n' +
   'We allow "~" and "." by default as paths frequently start with those.'],

  'word-break-match-right':
  [hterm.PreferenceManager.categories.CopyPaste,
   '[^\\s\\[\\](){}<>"\'\\^!@#$%&*,;:~.`]', 'string',
   'Regular expression to halt matching to the right (end) of a selection.\n' +
   '\n' +
   'Normally this is a character class to reject specific characters.'],

  'word-break-match-middle':
  [hterm.PreferenceManager.categories.CopyPaste,
   '[^\\s\\[\\](){}<>"\'\\^]*', 'string',
   'Regular expression to match all the characters in the middle.\n' +
   '\n' +
   'Normally this is a character class to reject specific characters.\n' +
   '\n' +
   'Used to expand the selection surrounding the starting point.'],

  'page-keys-scroll':
  [hterm.PreferenceManager.categories.Keyboard, false, 'bool',
   'If true, page up/down will control the terminal scrollbar and shift ' +
   'page up/down will send the VT keycodes.  If false then page up/down ' +
   'sends VT codes and shift page up/down scrolls.'],

  'pass-alt-number':
  [hterm.PreferenceManager.categories.Keyboard, null, 'tristate',
   'Set whether we should pass Alt-1..9 to the browser.\n' +
   '\n' +
   'This is handy when running hterm in a browser tab, so that you don\'t ' +
   'lose Chrome\'s "switch to tab" keyboard accelerators.  When not running ' +
   'in a tab it\'s better to send these keys to the host so they can be ' +
   'used in vim or emacs.\n' +
   '\n' +
   'If true, Alt-1..9 will be handled by the browser.  If false, Alt-1..9 ' +
   'will be sent to the host.  If null, autodetect based on browser platform ' +
   'and window type.'],

  'pass-ctrl-number':
  [hterm.PreferenceManager.categories.Keyboard, null, 'tristate',
   'Set whether we should pass Ctrl-1..9 to the browser.\n' +
   '\n' +
   'This is handy when running hterm in a browser tab, so that you don\'t ' +
   'lose Chrome\'s "switch to tab" keyboard accelerators.  When not running ' +
   'in a tab it\'s better to send these keys to the host so they can be ' +
   'used in vim or emacs.\n' +
   '\n' +
   'If true, Ctrl-1..9 will be handled by the browser.  If false, Ctrl-1..9 ' +
   'will be sent to the host.  If null, autodetect based on browser platform ' +
   'and window type.'],

   'pass-meta-number':
  [hterm.PreferenceManager.categories.Keyboard, null, 'tristate',
   'Set whether we should pass Meta-1..9 to the browser.\n' +
   '\n' +
   'This is handy when running hterm in a browser tab, so that you don\'t ' +
   'lose Chrome\'s "switch to tab" keyboard accelerators.  When not running ' +
   'in a tab it\'s better to send these keys to the host so they can be ' +
   'used in vim or emacs.\n' +
   '\n' +
   'If true, Meta-1..9 will be handled by the browser.  If false, Meta-1..9 ' +
   'will be sent to the host.  If null, autodetect based on browser platform ' +
   'and window type.'],

  'pass-meta-v':
  [hterm.PreferenceManager.categories.Keyboard, true, 'bool',
   'Set whether meta-V gets passed to host.'],

  'receive-encoding':
  [hterm.PreferenceManager.categories.Encoding, 'utf-8', ['utf-8', 'raw'],
   'Set the expected encoding for data received from the host.\n' +
   '\n' +
   'Valid values are \'utf-8\' and \'raw\'.'],

  'scroll-on-keystroke':
  [hterm.PreferenceManager.categories.Scrolling, true, 'bool',
   'If true, scroll to the bottom on any keystroke.'],

  'scroll-on-output':
  [hterm.PreferenceManager.categories.Scrolling, false, 'bool',
   'If true, scroll to the bottom on terminal output.'],

  'scrollbar-visible':
  [hterm.PreferenceManager.categories.Scrolling, true, 'bool',
   'The vertical scrollbar mode.'],

  'scroll-wheel-may-send-arrow-keys':
  [hterm.PreferenceManager.categories.Scrolling, false, 'bool',
   'When using the alternative screen buffer, and DECCKM (Application Cursor ' +
   'Keys) is active, mouse wheel scroll events will emulate arrow keys.\n' +
   '\n' +
   'It can be temporarily disabled by holding the shift key.\n' +
   '\n' +
   'This frequently comes up when using pagers (less) or reading man pages ' +
   'or text editors (vi/nano) or using screen/tmux.'],

  'scroll-wheel-move-multiplier':
  [hterm.PreferenceManager.categories.Scrolling, 1, 'int',
   'The multiplier for the pixel delta in wheel events caused by the ' +
   'scroll wheel. Alters how fast the page scrolls.'],

  'send-encoding':
  [hterm.PreferenceManager.categories.Encoding, 'utf-8', ['utf-8', 'raw'],
   'Set the encoding for data sent to host.'],

  'terminal-encoding':
  [hterm.PreferenceManager.categories.Encoding, 'iso-2022',
   ['iso-2022', 'utf-8', 'utf-8-locked'],
   'The default terminal encoding (DOCS).\n' +
   '\n' +
   'ISO-2022 enables character map translations (like graphics maps).\n' +
   'UTF-8 disables support for those.\n' +
   '\n' +
   'The locked variant means the encoding cannot be changed at runtime ' +
   'via terminal escape sequences.\n' +
   '\n' +
   'You should stick with UTF-8 unless you notice broken rendering with ' +
   'legacy applications.'],

  'shift-insert-paste':
  [hterm.PreferenceManager.categories.Keyboard, true, 'bool',
   'Shift + Insert pastes if true, sent to host if false.'],

  'user-css':
  [hterm.PreferenceManager.categories.Appearance, '', 'url',
   'URL of user stylesheet to include in the terminal document.'],

  'user-css-text':
  [hterm.PreferenceManager.categories.Appearance, '', 'multiline-string',
   'Custom CSS text for styling the terminal.'],
};

hterm.PreferenceManager.prototype =
    Object.create(lib.PreferenceManager.prototype);
hterm.PreferenceManager.constructor = hterm.PreferenceManager;
