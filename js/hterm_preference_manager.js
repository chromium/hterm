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
  this.definePreferences
  ([
    /**
     * If set, undoes the Chrome OS Alt-Backspace->DEL remap, so that
     * alt-backspace indeed is alt-backspace.
     */
    ['alt-backspace-is-meta-backspace', false],

    /**
     * Set whether the alt key acts as a meta key or as a distinct alt key.
     */
    ['alt-is-meta', false],

    /**
     * Controls how the alt key is handled.
     *
     *  escape....... Send an ESC prefix.
     *  8-bit........ Add 128 to the unshifted character as in xterm.
     *  browser-key.. Wait for the keypress event and see what the browser says.
     *                (This won't work well on platforms where the browser
     *                 performs a default action for some alt sequences.)
     */
    ['alt-sends-what', 'escape'],

    /**
     * Terminal bell sound.  Empty string for no audible bell.
     */
    ['audible-bell-sound', 'lib-resource:hterm/audio/bell'],

    /**
     * The background color for text with no other color attributes.
     */
    ['background-color', 'rgb(16, 16, 16)'],

    /**
     * The background image.
     */
    ['background-image', ''],

    /**
     * The background image size,
     *
     * Defaults to none.
     */
    ['background-size', ''],

    /**
     * The background image position,
     *
     * Defaults to none.
     */
    ['background-position', ''],

    /**
     * If true, the backspace should send BS ('\x08', aka ^H).  Otherwise
     * the backspace key should send '\x7f'.
     */
    ['backspace-sends-backspace', false],

    /**
     * Whether or not to close the window when the command exits.
     */
    ['close-on-exit', true],

    /**
     * Whether or not to blink the cursor by default.
     */
    ['cursor-blink', false],

    /**
     * The color of the visible cursor.
     */
    ['cursor-color', 'rgba(255,0,0,0.5)'],

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
    ['color-palette-overrides', null],

    /**
     * Automatically copy mouse selection to the clipboard.
     */
    ['copy-on-select', true],

    /**
     * True to enable 8-bit control characters, false to ignore them.
     *
     * We'll respect the two-byte versions of these control characters
     * regardless of this setting.
     */
    ['enable-8-bit-control', false],

    /**
     * True if we should use bold weight font for text with the bold/bright
     * attribute.  False to use bright colors only.  Null to autodetect.
     */
    ['enable-bold', null],

    /**
     * Allow the host to write directly to the system clipboard.
     */
    ['enable-clipboard-notice', true],

    /**
     * Allow the host to write directly to the system clipboard.
     */
    ['enable-clipboard-write', true],

    /**
     * Default font family for the terminal text.
     */
    ['font-family', ('"DejaVu Sans Mono", "Everson Mono", ' +
                     'FreeMono, "Menlo", "Terminal", ' +
                     'monospace')],

    /**
     * The default font size in pixels.
     */
    ['font-size', 15],

    /**
     * Anti-aliasing.
     */
    ['font-smoothing', 'antialiased'],

    /**
     * The foreground color for text with no other color attributes.
     */
    ['foreground-color', 'rgb(240, 240, 240)'],

    /**
     * If true, home/end will control the terminal scrollbar and shift home/end
     * will send the VT keycodes.  If false then home/end sends VT codes and
     * shift home/end scrolls.
     */
    ['home-keys-scroll', false],

    /**
     * Max length of a DCS, OSC, PM, or APS sequence before we give up and
     * ignore the code.
     */
    ['max-string-sequence', 100000],

    /**
     * Set whether the meta key sends a leading escape or not.
     */
    ['meta-sends-escape', true],

    /**
     * Set whether we should treat DEC mode 1002 (mouse cell motion tracking)
     * as if it were 1000 (mouse click tracking).
     *
     * This makes it possible to use vi's ":set mouse=a" mode without losing
     * access to the system text selection mechanism.
     */
    ['mouse-cell-motion-trick', false],

    /**
     * Mouse paste button, or null to autodetect.
     *
     * For autodetect, we'll try to enable middle button paste for non-X11
     * platforms.
     *
     * On X11 we move it to button 3, but that'll probably be a context menu
     * in the future.
     */
    ['mouse-paste-button', null],

    /**
     * Set whether we should pass Alt-1..9 to the browser.
     *
     * This is handy when running hterm in a browser tab, so that you don't lose
     * Chrome's "switch to tab" keyboard accelerators.  When not running in a
     * tab it's better to send these keys to the host so they can be used in
     * vim or emacs.
     *
     * If true, Alt-1..9 will be handled by the browser.  If false, Alt-1..9
     * will be sent to the host.  If null, autodetect based on browser platform
     * and window type.
     */
    ['pass-alt-number', null],

    /**
     * Set whether we should pass Ctrl-1..9 to the browser.
     *
     * This is handy when running hterm in a browser tab, so that you don't lose
     * Chrome's "switch to tab" keyboard accelerators.  When not running in a
     * tab it's better to send these keys to the host so they can be used in
     * vim or emacs.
     *
     * If true, Ctrl-1..9 will be handled by the browser.  If false, Ctrl-1..9
     * will be sent to the host.  If null, autodetect based on browser platform
     * and window type.
     */
    ['pass-ctrl-number', null],

    /**
     * Set whether we should pass Meta-1..9 to the browser.
     *
     * This is handy when running hterm in a browser tab, so that you don't lose
     * Chrome's "switch to tab" keyboard accelerators.  When not running in a
     * tab it's better to send these keys to the host so they can be used in
     * vim or emacs.
     *
     * If true, Meta-1..9 will be handled by the browser.  If false, Meta-1..9
     * will be sent to the host.  If null, autodetect based on browser platform
     * and window type.
     */
    ['pass-meta-number', null],

    /**
     * If true, scroll to the bottom on any keystroke.
     */
    ['scroll-on-keystroke', true],

    /**
     * If true, scroll to the bottom on terminal output.
     */
    ['scroll-on-output', false],

    /**
     * The vertical scrollbar mode.
     */
    ['scrollbar-visible', true],

    /**
     * Shift + Insert pastes if true, sent to host if false.
     */
    ['shift-insert-paste', true],

    /**
     * The default environment variables.
     */
    ['environment', {TERM: 'xterm-256color'}],

    /**
     * If true, page up/down will control the terminal scrollbar and shift
     * page up/down will send the VT keycodes.  If false then page up/down
     * sends VT codes and shift page up/down scrolls.
     */
    ['page-keys-scroll', false],
   ]);
};

hterm.PreferenceManager.prototype = {
  __proto__: lib.PreferenceManager.prototype
};
