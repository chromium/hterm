// Copyright (c) 2014 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

export var configDefs = {
  'alt-backspace-is-meta-backspace':
  [false, 'bool',
   'If set, undoes the Chrome OS Alt-Backspace->DEL remap, so that ' +
   'alt-backspace indeed is alt-backspace.'],

  'alt-is-meta':
  [false, 'bool',
   'Set whether the alt key acts as a meta key or as a distinct alt key.'],

  'alt-sends-what':
  ['escape', ['escape', '8-bit', 'browser-key'],
   'Controls how the alt key is handled.\n' +
   '\n' +
   '  escape....... Send an ESC prefix.\n' +
   '  8-bit........ Add 128 to the unshifted character as in xterm.\n' +
   '  browser-key.. Wait for the keypress event and see what the browser \n' +
   '                says.  (This won\'t work well on platforms where the \n' +
   '                browser performs a default action for some alt sequences.)'
  ],

  'audible-bell-sound':
  ['x-resource:ding', 'url',
   'Terminal bell sound.  Empty string for no audible bell.'],

  'desktop-notification-bell':
  [false, 'bool',
   'If true, terminal bells in the background will create a Web ' +
   'Notification. http://www.w3.org/TR/notifications/\n' +
   '\n'+
   'Displaying notifications requires permission from the user. When this ' +
   'option is set to true, hterm will attempt to ask the user for permission ' +
   'if necessary. Note browsers may not show this permission request if it ' +
   'did not originate from a user action.\n' +
   '\n' +
   'Chrome extensions with the "notfications" permission have permission to ' +
   'display notifications.'],

  'background-color':
  ['rgb(16, 16, 16)', 'color',
   'The background color for text with no other color attributes.'],

  'background-image':
  ['', 'url',
   'The background image.'],

  'background-size':
  ['', 'string',
   'The background image size.'],

  'background-position':
  ['', 'string',
   'The background image position'],

  'backspace-sends-backspace':
  [false, 'bool',
   'If true, the backspace should send BS (\'\x08\', aka ^H).  Otherwise ' +
   'the backspace key should send \'\x7f\'.'],

  'cursor-blink':
  [false, 'bool',
   'Whether or not to blink the cursor by default.'],

  'cursor-blink-cycle':
  [[1000, 500], 'value',
   'The cursor blink rate in milliseconds.\n' +
   '\n' +
   'A two element array, the first of which is how long the cursor should be ' +
   'on, second is how long it should be off.'],

  'cursor-color':
  ['rgba(255, 0, 0, 0.5)', 'color',
   'The color of the visible cursor.'],

  'color-palette-overrides':
  [null, 'value',
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
   'be changed.  This is useful for skipping a small number of indicies ' +
   'when the value is specified as an array.'],

  'copy-on-select':
  [true, 'bool',
   'Automatically copy mouse selection to the clipboard.'],

  'use-default-window-copy':
  [false, 'bool',
   'Whether to use the default window copy behaviour'],

  'clear-selection-after-copy':
  [true, 'bool',
   'Whether to clear the selection after copying.'],

  'ctrl-plus-minus-zero-zoom':
  [true, 'bool',
   'If true, Ctrl-Plus/Minus/Zero controls zoom. ' +
   'If false, Ctrl-Shift-Plus/Minus/Zero controls zoom, Ctrl-Minus sends ^_, ' +
   'Ctrl-Plus/Zero do nothing.'],

  'ctrl-c-copy':
  [false,
   'Ctrl+C copies if true, send ^C to host if false.  Ctrl+Shift+C sends ^C ' +
   'to host if true, copies if false.'],

  'ctrl-v-paste':
  [false, 'bool',
   'Ctrl+V pastes if true, send ^V to host if false.  Ctrl+Shift+V sends ^V ' +
   'to host if true, pastes if false.'],

  'east-asian-ambiguous-as-two-column':
  [false, 'bool',
   'Set whether East Asian Ambiguous characters have two column width.'],

  'enable-8-bit-control':
  [false, 'bool',
   'True to enable 8-bit control characters, false to ignore them.'],

  'enable-bold':
  [null, 'tristate',
   'True if we should use bold weight font for text with the bold/bright ' +
   'attribute.  False to use the normal weight font.  Null to autodetect.'],

  'enable-bold-as-bright':
  [true, 'bool',
   'True if we should use bright colors (8-15 on a 16 color palette) ' +
   'for any text with the bold attribute.  False otherwise.'],

  'enable-clipboard-notice':
  [true, 'bool',
   'Show a message in the terminal when the host writes to the clipboard.'],

  'enable-clipboard-write':
  [true, 'bool',
   'Allow the host to write directly to the system clipboard.'],

  'enable-dec12':
  [false, 'bool',
   'Respect the host\'s attempt to change the cursor blink status using ' +
   'DEC Private Mode 12.'],

  'font-family':
  ['"DejaVu Sans Mono", "Everson Mono", FreeMono, "Menlo", "Terminal", ' +
   'monospace', 'string',
   'Default font family for the terminal text.'],

  'font-size':
  [15, 'int',
   'The default font size in pixels.'],

  'font-smoothing':
  ['antialiased', 'string',
   'CSS font-smoothing property.'],

  'foreground-color':
  ['rgb(240, 240, 240)', 'color',
   'The foreground color for text with no other color attributes.'],

  'home-keys-scroll':
  [false, 'bool',
   'If true, home/end will control the terminal scrollbar and shift home/end ' +
   'will send the VT keycodes.  If false then home/end sends VT codes and ' +
   'shift home/end scrolls.'],

  'max-string-sequence':
  [100000, 'int',
   'Max length of a DCS, OSC, PM, or APS sequence before we give up and ' +
   'ignore the code.'],

  'media-keys-are-fkeys':
  [false, 'bool',
   'If true, convert media keys to their Fkey equivalent. If false, let ' +
   'the browser handle the keys.'],

  'meta-sends-escape':
  [true, 'bool',
   'Set whether the meta key sends a leading escape or not.'],

  'mouse-paste-button':
  [null, 'int',
   'Mouse paste button, or null to autodetect.\n' +
   '\n' +
   'For autodetect, we\'ll try to enable middle button paste for non-X11 ' +
   'platforms.  On X11 we move it to button 3.'],

  'page-keys-scroll':
  [false, 'bool',
   'If true, page up/down will control the terminal scrollbar and shift ' +
   'page up/down will send the VT keycodes.  If false then page up/down ' +
   'sends VT codes and shift page up/down scrolls.'],

  'pass-alt-number':
  [false, 'bool',
   'If true, Alt-1..9 will be handled by the browser.  If false, Alt-1..9 ' +
   'will be sent to the host.'],

  'pass-ctrl-number':
  [false, 'bool',
   'If true, Ctrl-1..9 will be handled by the browser.  If false, Ctrl-1..9 ' +
   'will be sent to the host.'],

  'pass-meta-number':
  [false, 'bool',
   'If true, Meta-1..9 will be handled by the browser.  If false, Meta-1..9 ' +
   'will be sent to the host.'],

  'pass-meta-v':
  [true, 'bool',
   'Set whether meta-V gets passed to host.'],

  'receive-encoding':
  ['utf-8', ['utf-8', 'raw'],
   'Set the expected encoding for data received from the host.'],

  'scroll-on-keystroke':
  [true, 'bool',
   'If true, scroll to the bottom on any keystroke.'],

  'scroll-on-output':
  [false, 'bool',
   'If true, scroll to the bottom on terminal output.'],

  'scrollbar-visible':
  [true, 'bool',
   'The vertical scrollbar mode.'],

  'send-encoding':
  ['utf-8', ['utf-8', 'raw'],
   'Set the encoding for data sent to host.'],

  'shift-insert-paste':
  [true, 'bool',
   'Shift + Insert pastes if true, sent to host if false.'],

  'user-css':
  ['', 'url',
   'User stylesheet to include in the terminal document.']
};

export default configDefs;
