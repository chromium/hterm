# 1.85, 2019-06-17, Significant Unicode improvements.

* vt: Ignore invalid OSC-52 requests.
* tests: Add missing image Blobs & ArrayBuffers tests.
* lint: Rewrite helper in python.
* load_tests: Convert to python.
* concat: Replace arbitrary shell scripts with explicit commands.
* Convert test suite to mocha.
* tests: Bundle external data into test env.
* tests: Create fresh scrollport for each test.
* terminal: Split strings based on graphemes.
* prefs: Add cursor shape to preferences.
* scrollport: Fix line height for underline cursor.
* parser_tests: Peel negKeySeq helper out of Tests.
* tests: Fix async init with hterm.Terminal.
* tests: Move state cleanup to postambles.
* Change keymap for modifiers on Enter key.
* scrollport: Ignore scrolling for non-cancelable scrollwheel events.
* scrollport: Fix chromevox pageup/pagedown display.
* scrollport: Set offscreen selection rows as aria-hidden.
* screen: Simplify overwriteString return.
* terminal: Update replaceReferences API.
* vt: Allow ; to be omitted with OSC sequences.
* a11y: Revert "Mark offscreen rows that hold selection as hidden".
* tests: Speed up accessibility tests.
* tests: Improve execCommand tests.
* tests: Speed up pubsub tests.
* tests: Drop setDefaults usage.
* tests: Call chai asserts directly.
* tests: Switch core to chai for asserts.
* vt: Requeue data after UTF8 change.
* tests: Fix assert identity tests.
* test: Drop lib.f.alarm use.
* Drop runtime dep checks.
* io: Fix typo in type check.
* concat: Avoid non-portable %T in date format.
* io: Check for strings before ArrayBuffers.
* test: Allow tests to be selected via the URI.
* vt: Switch OSC-52 handling to TextDecoder.
* io: Accept ArrayBuffers to writeUTF8.
* Limit X10 encoding to 127 for now.
* io: Flip UTF8/UTF16 helpers.
* vt/io: Move UTF-8 handling to hterm.Terminal.IO.
* Switch to ES6 Symbol.
* Import Text{De,En}coder polyfills.
* vt: Support mime types with inline image display.
* tests: Move utf8 decoder test out of hterm.
* vt: Switch OSC-52 handling to lib.decodeUTF8.
* vt: Drop unused {de,en}codeUTF8 helpers.
* doc: Start a section about hterm.Terminal.IO encodings.

# 1.84, 2019-01-19, Firefox fixes, openWindow security fixes, and few improvements.

* Update to libdot 1.26.  openWindow & new codec helpers.
* Optimize image display with Blobs & ArrayBuffers.
* Workaround touch focus bug on CrOS.
* Initialising iframe contents asynchronously on FF.
* Add support for new Clipboard API for copying text.
* Push selection logic down into copySelectionToClipboard.
* Fix paste event on Firefox.
* terminal: Stop passing down this.document_ when copying.
* Switch to array buffers for sending tty data.
* Provide readable pref strings.
* tests: Switch to a dark theme.
* concat: Stop listing test code in deps.
* Use new lib.f.openWindow helper.

# 1.83, 2018-12-02, Minor improvements.

* Update to libdot 1.25.  Minor improvements.
* Split default/pointer cursor style.
* Avoid using KeyboardEvent.which.
* prefs: Turn default pref settings into proper objects.
* Add `paste-on-drop` preference.

# 1.82, 2018-10-24, New context menu.

* Update to libdot 1.24.  Tool improvements for supporting nightly builds.
* embed: Update examples to use lib.init.
* terminal: Move cursor color to css vars.
* Add support for a context menu.
* keyboard: Add a clearScrollback hook.
* vt: Change CSI-J-3 to clear scrollback.
* terminal: Add HTMLImageElement cast to avoid XSS compilation warnings.
* terminal: Process inverse text attr after bold-as-bright & faint.
* hterm-notify/hterm-show-file: Fix long sequences under screen.
* osc52.sh: Rewrite to match other helper scripts.
* terminal: Workaround FireFox bug with selectAllChildren.

# 1.81, 2018-08-29, A11y improvements, and keyboard/mouse tweaks.

* Update to libdot 1.23.  Build improvements, i18n helpers, and npm support.
* mouse: Support horizontal mouse scroll wheel events.
* keyboard: Add more keyboard binding callbacks.
* mouse: Disable default handling for mouse buttons 3 & 4.
* keyboard: Ignore Tab keys in onKeyPress_.
* etc: osc52.el: Fix terminal detection.
* build: mkdist: Delete dead code.
* a11y: Ensure the Page Up button isn't shown when the ScrollPort is focussed.
* build: Convert concat to a python script.
* a11y: Only announce a space character if it is the character actually printed to the screen.
* a11y: Mark offscreen rows that hold selection as hidden.
* a11y: Update the selection when accessibility is enabled even if it's collapsed.
* test: Remove invalid page-down-all-rows-visible test.
* a11y: Add announcements of the Space character.
* a11y: Handle announcements of selection changes.
* a11y: Simplify handling of duplicate live output.
* a11y: Change <x-screen> to have a role="log".
* a11y: Announce messages shown by showOverlay.
* a11y: Fix announcement of current scrolled percentage.
* a11y: Don't announce page up/down at the top/bottom of the screen.
* a11y: Fix an assertion failure in hterm.AccessibilityReader.
* test: Add simple test page.
* test: Add/update various test data files.
* a11y: Make it possible to enable/disable accessibility at runtime.
* a11y: Announce the current screen content on Page up/down.
* a11y: Add skip-links to allow screen readers to scroll the terminal.

# 1.80, 2018-06-22, Minor tweaks.

* prefs: Add COLORTERM to default env.
* vt: Automatically hide the mouse cursor while typing.
* vt: Improve & document mouse cursor customization.

# 1.79, 2018-06-20, A11y (screen reader) improvements & keyboard/mouse fixes.

* Update to libdot 1.22.  Unicode 11.0.0 updates and new helpers.
* osc52.vim: Split base64 output when using get_OSC52_DCS for screen.
* keyboard: Add media key handling only for Chrome OS systems.
* keyboard: Cleanly handle Firefox keyboard deviations.
* keyboard: Update Chromebook media bindings.
* build: Fix base64 usage on macOS.
* vt: Strip most control chars out for bracketed paste.
* keyboard: Improve addKeyDef documentation.
* mouse: Don't use user-configured word break matches when ctrl-clicking on urls.
* mouse: Double click should expand selection whether "copy-on-select" is on or off.
* a11y: Hide invisible elements from the screen reader.
* a11y: Add the aria-readonly attribute to the x-screen element.
* vt: Fix initial cursor display to match internal state.
* vtscope: Fix python-3 print func handling.
* prefs: Add Noto Sans Mono to the default font list.
* Clean up code a bit to pass linting.
* a11y: Add basic support for announcing command output to AT in hterm.
* a11y: Improve accessibility command output.
* tests: Add callbacks with image loading.
* terminal: Preserve selection when scrolling collapsed selections.
* Crush all images.
* tests: Fix floating point rounding error in Terminal.dimensions.
* vt: Unbreak legacy mouse wheel encoding.
* vt: Implement OSC 104 (color reset) support.
* vt: DECALN: Fix cursor position.
* prefs: Improve descriptions and translation tips.

# 1.78, 2018-01-29, Extended underlying support.

* Add support for changing underline style/color.
* README: document our mirrors/release sites.
* Fix typo in autocapitalize attribute.
* Send a signal when the frame is made visible.
* Document expected coding style.
* Fix fallback git value.

# 1.77, 2018-01-05, Various bug fixes.

* Fix typo in mouse wheel reporting (for newer tmux).
* Add sanity check on user font size.
* Overhaul SGR 38/48 handling for ISO 8613-6.
* Fix osc52 vim script in tmux.
* Allow F11 when running in a tab for fullscreen.
* Implement OSC 110/111/112.
* Set charset=utf-8 in html files.
* Check document character set at startup.
* Fix typo in blink preference handling (broke in hterm-1.69).

# 1.76, 2017-12-13, Standards/compatibility fixes & OSC-8 links & OSC-1337 image features.

* change default terminal encoding to utf8
* invert drag & drop format preferences
* handle ISO-8613-6 SGR subparameters
* default all character maps to US/ASCII when resetting
* fix reset after custom text attributes
* separate terminal full & soft reset code paths
* move vt reset calls into the terminal layer
* reset SGR attributes during soft resets
* move cursor save/restore state from per-terminal to per-screen
* rename CHA comments to match DEC docs
* support DECSET 1007 for controlling alternate scroll mode
* hoist openUrl to main namespace
* support OSC 8 for hyperlinking text
* add localization logic
* drop max-string-sequence support
* add a test to keep nassh translations in sync
* allow keybindings for unknown keys
* add a default PASS mapping for the Clear key
* use new lib.f.getOs helper
* include all profiles all the time when backing up
* implement OSC 1337 file display/transfer

# 1.75, 2017-11-20, Many color/style/mouse fixes & features.

* Fix parsing multiple SGR true color sequences.
* Add support for double underlining (SGR 21).
* Document a few more CSI options.
* Fix handling of inverse text with true colors.
* Simplify invisible text processing.
* Fix DECSET/DECRST 1048 handling.
* Stop changing color palettes when restoring cursor state.
* Handle X10 & X11 mouse reporting modes.
* Support UTF-8 & SGR mouse reporting modes.
* Optimize mouse move reporting.
* Return early on mouse move events when possible.

# 1.74, 2017-10-27, Minor improvements.

* Implement FocusIn/Out events.
* Finish implementing enable-clipboard-write.
* Document more OSC sequences.

# 1.73, 2017-10-16, Various bugfixes and minor features.

* Document source code.
* Implement OSC 12 (text cursor color).
* io: buffer data when in background.
* io: add a hideOverlay helper.
* Report meta key too with CSI sequences.
* Handle drag & drop nicely.
* Stop mangling input from IMEs/etc...

# 1.72, 2017-09-12, More bugfixes.

* Drop duplicate resize call.
* Fix console warning.
* Fix container matching logic wrt ascii & blink settings.
* Switch to Node constants.
* Update the embedding document.
* Restore cursor style after ringing the bell.

# 1.71, 2017-09-01, Bugfixes galore.

* Fix replacing wide chars with narrow chars.
* Do not warn about unknown sequences by default.
* Avoid recalculating string display widths when possible.
* Move initial cursor location off screen again during startup.
* Fix processing of split ST sequences across buffers.
* Fix overlaying/inserting combining characters.

# 1.70, 2017-08-16, Improve Unicode handling.

* Add ids to more internal elements for debugging.
* Disable drag & drop of text/content.
* Fix helper scripts/docs to use POSIX portable \033 instead of \e with printf.
* Drop support for old Chrome <21 versions with storage setup.
* Rewrite Unicode processing to avoid stripping combining characters.
* Make encoding state internal and add setEncoding callback to the API.
* Stop matching 8-bit control codes in utf8 mode.

# 1.69, 2017-08-08, Improve cursor positioning.

* Add a pref for default terminal encoding.
* Add a helper/document for the new notification position.
* Switch cursor positioning to use CSS vars.

# 1.68, 2017-07-26, New feature polish, and robustify character maps.

* Restore native pasting as a fallback for the open web.
* Change default G1 character map to US/ASCII.
* Change DECCKM mouse wheel events to default to off.
* Add support for DOCS for transitioning to UTF-8 (ESC+%).

# 1.67, 2017-07-17, New feature polish.

* Open links on macOS via cmd+click.
* Fix URL opening for Chrome v2 apps.
* Support disabling DECCKM mouse wheel events.

# 1.66, 2017-06-29, New features & character map improvements.

* Fix wide char width handling and simplify in general via CSS vars.
* Use ES6 String.repeat to simplify char size measurements.
* Force height of all lines/chars to match to avoid glyphs drawing lines too
  high or low and making rendering overall inconsistent.
* Fix mouse move reporting (regression in hterm-1.65).
* Clarify modifiers in keyboard bindings.
* Invert touchscreen scrolling to match OS direction.
* Document hterm JS language (browser/runtime) requirements.
* Drop support for GR character maps (which have never actually worked).
* Add tests for hterm.VT.CharacterMap code.
* Clean up the hterm.VT.CharacterMap classes.
* Add reset & setOverrides helpers to hterm.VT.CharacterMap for customization.
* Add a new hterm.VT.CharacterMaps container class.
  API breakage warning: hterm.VT.CharacterMap.maps no longer exists.  Any users
  of it will need to instantiate hterm.VT.CharacterMaps and use that API.
* Change mouse wheel scrolling when DECCKM is active to run only on the alt
  screen (and never the primary screen).
* Add support for custom notifications (iTerm2's OSC-9 and URxvt's
  OSC-777:notify module).
* Initial support for making virtual keyboards show up (for phones/tablets).
* Fix clicking of mailto: links.
* Fix ctrl+clicking in empty space (caused internal errors).
* Change Ctrl+V and Ctrl+Shift+V to invoke pasting directly instead of relying
  on the OS/browser to do so (makes macOS consistent).
* Include a terminal icon in all notifications.

# 1.65, 2017-05-30, New features & standards polish.

* Use new lib.f.createEnum helper.
* Move from non-standard -webkit-flex CSS to standard flex names.
* Delay display of iframe dialog until it's finished loading.
  API breakage warning: Your app needs to transmit a terminal-info-ok message
  back after it has received & finished processing the terminal-info message.
* Fix CrOS OS detection with middle mouse pasting.
* Make word break selections into a user preference.
* Move from non-standard __proto__ to standard Object.create/prototype.
* Add a sep option for pasting on mouse right click events.
* Move from non-standard MouseEvent.which to standard MouseEvent.button.
  API breakage warning: The mouse-paste-button option needs to be updated if
  it has been changed from the "auto" setting.
* Document keyboard bindings API & user settings.
* Make keyboard binding parsing more robust to bad inputs.
* Make keyboard bindings more flexible (mixed case and more button aliases).
* Change the mouse cursor based on mouse reporting mode (cursor<->text bar).
* Support mouse wheel scrolling when DECCKM is active by emitting up/down arrow
  key presses automatically.

# 1.64, 2017-05-18, Arrow key scroll.

* Start documenting all supported control sequences.
* Shift+up/down arrow keys now scroll the terminal by one line.
* Disable the "window header" bar since it's been empty for a while.

# 1.63, 2017-05-03, New features & standards polish.

* Update the test UI by showing progress in the title bar.
* Fix hterm.terminal.getCursorRow API.
* Add a user-css-text preference for injecting custom CSS directly.
* Update ocs52.sh helper to POSIX shell.
* Convert to standard 'wheel' event and drop support for non-standard
  'mousewheel' and 'DOMMouseScroll' events.  This also brings support for
  line & page scrolling in addition to existing pixel based.
* Add support for scrolling via touch.  Only scrolling is supported currently.
* Improve standards conformance by ignoring leading zeros in CSI commands.
* Add support for xterm beam cursor control (CSI+ q 5 & 6).
* Add support for xterm fg/bg color control (OSC+10 & OSC+11).
* Add support for rxvt scrollbar toggle (DECSET/DECRST 30).
* Simplify handling of FF/HPA/NUL (should only be an internal cleanup).
* Fix typos in DECIC & DECDC CSI sequences.
* Add support for HPR (Character Position Relative).

# 1.62, 2017-04-17, Test improvements, and a few fixes/features.

* Fix hterm_all.js to include all of hterm source files.
* Add support for blinking text via CSS animations.
* Improve test UI to include results in the HTML output.
* Fix handling of the alt key across alt+tab window switches (for
  alt-backspace-is-meta-backspace preference).

# 1.61, 2017-01-31, A little polish.

* On ctrl-click, if a URL is selected, launch a new tab with the URL.
* Update test lists to match all the existing ones.
* Polish documentation/comments.
* Fix missing last line with some fonts/zoom levels.
* Allow keyboard shortcuts to be more easily bound by users.

# 1.60, 2016-09-15, Full bake.

* Fix horizontal cursor tracking broken by the misrendering fix.

# 1.59, 2016-09-14, A little polish.

* Fix hexToRGB parsing of more formats.
* Fix misrendering of last line with some resolutions.
* Update window.postMessage API to work with Chrome M54+.

# 1.58, 2016-07-12, copySelectionToClipboard fixes.

* In hterm_terminal.js, use Terminal.prototype.copySelectionToClipboard, rather
  than the raw hterm.copySelectionToClipboard.

# 1.57, 2016-04-06, A little polish.

* Fix race on IE with scrollport initialization.
* Fix ctrl-shift-esc handling on OS X.
* Always use the text cursor in the terminal.
* Fix 8-bit help text in options page.
* Allow zoom warning to be dismissed.

# 1.56, 2015-06-16, pref shuffle, keybindings, utf-8, and Mouse reporting.

* Fix mouse reporting.  Previously users had to click, then move the mouse
  before mouse reporting would start.
* Deal with surrogate pairs more properly.
* Add customizable keybindings.
* hterm_preference_manager.js: Group prefs into categories, declare input types
  rather than guess based on default value, improve layout.

# 1.55, 2015-05-19, More fixes.

* Shifts out the G1 character set with the \x18 cancel control code.
* Enables terminal font resizing for the numeric +/- keys.

# 1.54, 2015-03-19, Grab bag o' fixes.

* Avoid changing e.shiftKey property.
* Add faint SGR mode.
* Fix cursor blink on soft reset.
* Fix lib.colors.mix.
* Fix rgbToHex for red values lower than 16.
* Add strikethrough mode.
* Fix DECSET 1039 to actually affect what Alt sends.
* Add key code for right Command key.
* Add character map overrides preference.
* Fix transition from blinking cursor to invisible cursor.
* Fix concealed/invisible text for default background.

# 1.53, 2015-02-26, Add 'alt-gr-mode' preference.

* Add a preference to select the preferred AltGr heuristic.  This replaces the
  change from 1.52, which prevented the use of Ctrl-Alt-... on all platforms.
  The new preference takes one of the following values:

    null: Autodetect based on navigator.locale:
          'en-us' => 'none', else => 'right-alt'
    'none': Disable any AltGr related munging.
    'ctrl-alt': Assume Ctrl+Alt means AltGr.
    'left-alt': Assume left Alt means AltGr.
    'right-alt': Assume right Alt means AltGr.

  The default value is null.  Autodection won't work in many cases, and the
  left-alt/right-alt tracking will have issues if the window loses focus
  while the alt key is down, but this may be the best we can do on the web.

# 1.52, 2015-02-18, Treat Ctrl-Alt as AltGr

* Assume that Ctrl-Alt-[Printable] means AltGr-[Printable].  After this change,
  we ignore the ctrl/alt modifiers when they appear in keydown, leaving it
  up to the browser to send the correct key code in the keypress event.  This
  fixes a longstanding issue with international keyboards where users could
  not type characters/symbols that required use of AltGr.

  We will still have trouble on the mac, which does not set Ctrl+Alt when
  AltGr is used.

  BUG=chromium:211925
* Fix for issue where cursor would dissappear at non-100% zoom levels.
* Prevent navigation via media keys.
* Capture fullscreen ESC.
* Fix mouse wheel scrolling in FF.

# 1.51, 2014-11-11, 24-bit ANSI color support.

* Change log update to reflect previous commits.

# 1.50, 2014-10-07, Allow missing clipboard id in OSC 52

* Tmux sends OSC 52 as "ESC ] 52 ; ; ... BEL", but we failed to recognize the
  sequence because we expect a "clipboard identifier" character between the
  two semicolons.  We toss out the clipboard identifier anyway, so making it
  optional makes tmux clipboard integration work.

# 1.49, 2014-10-06, Fix HOME/END under application cursor mode.

* Send OSC H/OSC F for HOME/END when in application cursor mode, rather than
  application keypad mode.

# 1.48, 2014-08-13, grab bag of fixes.

* Place ruler text inside a span to fix issues on Firefox.
* Improve zoom keyboard handling on Mac and Firefox.
* Fix "CSI u" sequence.
* Remove the height + 1 underscore hack.
* Add parser routine and set css class for vt_tiledata support.  Users will
  still need to add a custom stylesheet to see vt tiles.
* Allow double-click selections to start with "." or "~".
* Disable terminal cursor hiding when vt mouse tracking is enabled.
* If the terminal cursor is hidden because it's under the mouse cursor, restore
  the visibility when the terminal cursor moves.

# 1.47, 2014-07-28, Fix clear-selection-after-copy, fractional sizes

* Always restore the selection after a copy operation, if we can.
  The clearSelectionAfterCopy option shouldn't come in to play here.
  We should only be clearing the selection after a delay, which means
  we'll always need to restore after a copy.
* Chrome 38 returns fractional dimensions for nodes that were
  set to a fractional size, where previous versions did not.
  However, a node contained by such a node whose width is set to
  '100%' returns only the integer portion of the width.  This patch
  makes us round up rather than set a fractional terminal width, and
  adjusts the test to exepect this behavior.

# 1.46, 2014-07-24, Fix right-click paste issues.

* Version 1.44 introduced an issue with right-click paste where focusing the
  paste target would force the page to scroll 1000px past the end of the
  terminal.  Now we place the paste target within the visible bounds of the
  terminal, but nehind it in z-index.

# 1.45, 2014-07-22, Fix overlay position on Firefox.

* Add the trailing 'px' in the css top/left property.  Chrome is ok without it,
  but it's required on Firefox.

# 1.44, 2014-07-22, Add 'cursor-blink-cycle', bracketed paste, other fixes.

* Fix Firefox detection in hterm.ScrollPort..decorate.
* Implement bracketed paste, BUG=chromium:393622
* Fix flash on paste, BUG=chromium:390357, BUG=chromium:394568
* Fix hollow-cursor-after-paste issue, BUG=chromium:390357
* Fix reverse-wrap.
* Add a 'cursor-blink-cycle' preference which can be a number or a two-number
  array.  If two numbers are provided, the first is how long a blinking cursor
  should be on, the second is how long it should be off.  If a single number is
  given it's used for both on and off.  Anything else results in a fast
  blinking cursor.  BUG=chromium:366206
* Hide terminal cursor when mouse cursor is over it, BUG=chromium:365910

# 1.43, 2014-07-15, Implement reverse wraparound.

* Implement reverse wraparound, add a test.

# 1.42, 2014-06-25, Stop requesting notification permission.

* This code depended on a user action, but the preference observers aren't
  run in the context of an action.  For now, it's up to the embedder to request
  the permission in hterm's behalf.
* Use window.document.title (not this.document_.title) as the default
  notification text.

# 1.41, 2014-06-24, Lots of new preferences.

* Add 'clear-selection-after-copy' preference, defaults to true.  Set to false
  to turn off hterm's policy of clearing your current selection after copying.
* Add 'use-default-window-copy' preference, needed in some environments (open
  web, certain browsers) to make copy actually work.
* Add 'desktop-notification-bell' preference, to show a desktop notification
  when the terminal bell is rung.
* Add 'east-asian-ambiguous-as-two-column' preference, defaults to false.
  Set to true to treat characters of ambiguous width as two columns wide.
* Implement italic character attributes.  "CSI [ 3 m" to enable, "CSI [ 23 m"
  to disable.

# 1.40, 2014-05-15, fix selection collapse.

* s/selection.collapse()/selection.collapseToEnd().  The former now throws an
  exception in Chrome if called with no arguments, which breaks our attempts
  to block local selection when vt mouse is enabled.

# 1.39, 2014-05-14, Add 'pass-meta-v' preference.

* Add 'pass-meta-v' preference so Mac users can decide between Meta-V and
  Meta-Shift-V for paste.

# 1.38, 2014-05-13, Add 'ctrl-c-copy' preference.

* Add a 'ctrl-c-copy' preference.  When this is set to false, the default
  setting, Ctrl-C will always send ^C while Ctrl-Shift-C will copy if there is
  an active selection and send ^C if not.

  When 'ctrl-c-copy' set to true the meaning of the shift key is reversed.

  On the open web, the only reliable cross-browser configuration is with
  ctrl-c-copy set to true, as this allows the browser's built-in Ctrl-C handler
  to do its job.  Embedders can call term.getPrefs().changeDefault(
  'ctrl-c-copy', true) to adjust the default preference value in these
  situations.

# 1.37, 2014-04-29, Fix double-paste, add IE compatibility.

* Fix double-paste issue introduced in 1.36.
* First round of IE compatibility fixes.

# 1.36, 2014-04-28, Plumb ssh-agent, firefox, and wss-relay telemetry

* Add first round of Firefox compatibility fixes.
* Add telemetry data for wss-based relay connections.
* Update --config=google.
* Add ssh-agent plumbing.
* Remote lib_fs.js dependency.

# 1.35, 2014-03-25, Add enable-bold-as-bright preference.

* Adds a preference to control whether or not the bold attribute from ESC
  "[ ... m" sequences also triggers bright colors.  Preference is on by default
  to match the behavior of xterm (and previous versions of hterm).  Switch it
  off to enable bold font face in non-bright colors.  This is especially useful
  if you've overidden your 16 color palette to something other than the
  typical 8-dark/8-bright scheme.

# 1.34, 2014-03-14, Add ctrl-plus-minus-zero-zoom preference.

* In the default state (true) hterm works the same as before.  If set to
  false, ctrl-shift-plus/minus/zero controls zoom, and ctrl-minus sends ^_.

# 1.32, 2014-03-04, Disable local selection in all mouse reporting modes.

* Previously we allowed "local" selection (that which happens by default in
  Chrome) to stay enabled for mouse mode 1001 (report mouseup/down only).  This
  caused a few issues.  I didn't realize at the time that emacs used this
  mouseup/down positions to set an active region, which conflicts with the
  local selection.  You tend wind up with a confusing partial overlap of the two
  selections.  Additionally, with copy-on-select enabled, the mouseup event
  was consumed by the terminal and never sent to the host.

  This change disables local selection when we're in mode 1001.  Local selection
  was disabled in mode 1002, report mousedown/up/movement, which is preferred
  by vi.

  Our "mouse-cell-motion-trick" was all about allowing local selection in mode
  1002, so that's been removed too.  I doubt this preference was widely used.

  The change adds the ability to use alt-click to override the current mouse
  state, so that you can make a local selection even while in mode 1001/1002.
  Alt was chosen as its the only modifier key which can't be sent with a
  mouse event, though if you're depending on alt === meta, you'll lose
  the ability to send meta-mouse sequences.  If your local window manager
  already maps alt-click to something, then you can add any other modifier in
  addition to alt (say, alt-ctrl-mousedown) to defeat your existing binding.

# 1.31, 2014-03-04, Add svg based zoom detection.

* Re-implement zoom detection in terms of the currentScale property of svg
  elements.  This requires the svg element to be in the topmost document,
  or at least not in the "about:blank" document that the scrollport creates
  so it may not be perfect, but it's better than nothing.

# 1.30, 2014-03-04, Even better recursive "copy" fix.

* BUG=chromium:340699: Auto copy doesn't work.
  Now I see why the "select bags" aren't enough.  Even for the simplest case
  where we're copying an on-screen selection we need to use
  Terminal.prototype.copySelectionToClipboard to handle copy of wrapped lines.
  This fix reverts the changes from 1.28 and 1.29 in favor of just scheduling
  the copy on a timeout, which defeats the recursive copy blocker.
* Revert "Scrolling Speedups" change (which never got a distinct hterm version
  number).  This caused issues with selections scrolled out of the visible area.

# 1.29, 2014-02-14, Better recursive "copy" fix.

* BUG=chromium:340699: Auto copy doesn't work.
  AFAICT, the e.clipboardData.setData call wasn't actually doing anything.  The
  scrollport's "select bags" were doing the right thing though, so we have that
  going for us.  It's likely that the recursive "copy" was required in older
  versions of Chrome, but it doesn't seem to be necessary anymore.
* Fix the "Selection Copied" message from OSC 52 based copies.

# 1.28, 2014-02-13, Fix recursive "copy".

* BUG=chromium:340699: Auto copy doesn't work.
  Use e.clipboardData.setData, rather than causing a recursive
  document.execCommand("copy").

# 1.27, 2014-01-28, Add fullwidth support.

* Teaches hterm about the difference between halfwidth and fullwidth characters.

# 1.26, 2014-01-16, Add 'user-css' preference.

* Add a 'user-css' preference, which will load a user-defined css file (by url)
  into the terminal document.  This could be used to load a web font, or to
  style the terminal in perverse ways.

# 1.25, 2014-01-08, Fix DECSET 1002-while-mousedown.

* Fix an issue where DECSET 1002 failed if received while a mouse button was
  down.
* Add option to swap Ctrl-V/Ctrl-Shift-V.

# 1.24, 2013-12-10, Fix cursor height regression.

* Fix cursor sizing regression.  syncCursorPosition_ is now only about the
  position of the cursor, restyleCursor_ now sets cursor width, in addition to
  height and cursor shape related stuff.  Call restyleCursor_ from onResize_.

# 1.23, 2013-11-25, Prevent overlay focus, fix timeout tracking.

* Prevent the terminal overlay (hterm.Terminal.prototype.showOverlay) from
  taking focus if it happens to get clicked.
* Fix the overlay timeout tracking to fix cases where showOverlay is called
  again before the previous overlay has timed out.

# 1.22, 2013-11-25, Fix full-screen scroll region fix.

* hterm 1.19 attempted to ignore full-screen scroll regions, but the patch
  got the variable names wrong.  This fixes them.

# 1.21, 2013-10-31, Clear line-overflow whenever we insert characters.

* BUG=266128, Clear line-overflow state when inserting text.  This keeps
  us from accidentally re-using the overflow state of text that was already
  visible on the line.

# 1.20, 2013-10-31, Ignore ECH/EL in the presence of a cursor overflow.

* BUG=232390, Ignore erase-characters and erase-in-line escapes when the cursor
  has overflowed the terminal width.  This deviates from xterm, but matches
  gnome-terminal and other modern emulators.

# 1.19, 2013-10-30, Ignore full-screen vt scroll regions.

* BUG=266197, If the host attempts to set the VT scroll region to be the entire
  terminal height, we remove the scroll region entirely.  This lets full-screen
  apps overflow into the local scrollback buffer, which makes screen and tmux
  much more pleasant to use.

# 1.18, 2013-10-29, Implement Cursor shape change sequences.

* Implement cursor shape changes via DECSCUSR.
* Implement cursor shape changes via OSC 50 CursorShape (as described in
  http://vim.wikia.com/wiki/Change_cursor_shape_in_different_modes.)
* Don't blink the cursor when the terminal is unfocused.

# 1.17, 2013-07-26, Double-click to select url-ish.

* On double-click, expand the text selection to make it easy to select URLs
  or other interesting substrings.

# 1.16, 2013-07-25, More fix newline regression.

* 1.15 got the treatment of the areas above/below the scroll region wrong.

# 1.15, 2013-07-25, Fix newline regression.

* getVTScrollBottom returns the row count if there is no vt scroll region in
  effect, need to read the vtScrollBottom_ property directly instead.

# 1.14, 2013-07-19, Fix newline in VT Scroll Region, packaged app fix.

* BUG=chromium:223140, Terminal viewer doesn't handle horizontally split curses
  application correctly.
* Fix the hterm.windowType detection to not barf when hterm is used in a
  Chrome packaged app.

# 1.13, 2013-07-17, Disable zoom warning on newer Chrome builds.

* New builds of Chrome removed document.width/height, so we're not able to use
  them to detect the zoom factor.  Disabled zoom detection when these properties
  are missing until we have a better solution.
* Fix libdot/changelog/(version|date) resources.
* Fix jscompiler errors.
* Stop printing "CSI K", "CSI ? J", and "ESC #" sequences with bad params.
* Shell script changes to pacify BSD.

# 1.12, 2013-06-24, Fix zoom warning.

* Fix the browser-zoom detection so we show the zoom warning again.

# 1.11, 2013-06-20, Add 'send-encoding'/'receive-encoding' preferences.

* Splits 'character-encoding' into two preferences so send and receive
  encodings can be set independently.
* Refactor Terminal.keyboard.onKeyDown_ to allow Ctrl+Alt+(printable) key
  combinations.
* Fix regression in Terminal..onPaste_.

# 1.10, 2013-06-20, Add 'character-encoding' preference.

* Adds a 'character-encoding' preference which can be set to 'utf-8' (default)
  or 'raw'.  When set to 'utf-8' hterm's behavior is unchanged from previous
  versions.  When set to 'raw', hterm will not attempt to decode input or
  encode output.

# 1.9, 2013-06-19, Fix issues with shift-key and CSI sequences.

* Clear e.shiftKey in hterm_keyboard_keymap.js' sh() function so that
  hterm_keyboard.js doesn't apply its own shift key munging.

# 1.8, 2013-05-31, overscroll fix

* BUG=chromium:245700: Call preventDefault on mousewheel events that we've
  handled.

# 1.7, 2013-05-31, Fix onTerminalResize, dec12 pref

* Pass width and height in io.onTerminalResize again, which regressed in the
  previous commit.
* BUG=245120: Add 'enable-dec12' preference, off by default, which allows the
  host to control the cursor blink state via DEC private mode 12.

# 1.6, 2013-05-24, Track terminal size on the io object.

* This installs a default onTerminalResize handler on the hterm.Terminal.IO
  object that records the most recent terminal size as io.columnCount and
  io.rowCount.  This gives consumers synchronous access to these values without
  having to wire up the event handler themselves.

# 1.5, 2013-04-18, Pass shift-ctrl-L

* BUG=chromium:233008, PASS shift-ctrl-L (CrOS screen lock combo)

# 1.4, 2013-04-05, wipeContents fix

* BUG=chromium:226819, Handle clearing screen when not scrolled to bottom

# 1.3, 2013-04-04, Keyboard fixes

* BUG=chromium:174410, Fix to allow Alt-Backspace to send Meta-Backspace
* BUG=chromium:226752, Don't trap media keys (e.g. Mute) by default.

# 1.2, 2013-03-19, Fix bell regression.

* Fix bug that made terminal bell only ring once.

# 1.1, 2013-03-13, Grab bag of fixes.

* Fix base64 encoding of the bell audio.
* Break out of a parseUntilStringTerminator_ if an embedded ESC is
  found (other than the one that may appear as part of a 7-bit ST),
  or if the sequence has been going on for too long (measured by the
  wall clock).
* BUG=chromium:191050, Map Chrome OS top-row keys to function keys.
* BUG=chromum-os:30792, beeps accumulate - leads to non stop beeping
* BUG=chromum-os:35288, scroll-on-output doesn't appear to work
* BUG=chromum-os:39645, Application keypad doesn't work properly

# 1.0, 2013-03-06, Initial split from Secure Shell codebase.

* Move nassh related files out into ../nassh/.
* Add hterm_resources.concat.
* Add bin/export.sh and related concat/ lists.
