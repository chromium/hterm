```
                            .--~~~~~~~~~~~~~------.
                           /--===============------\
                           | |```````````````|     |
                           | |               |     |
                           | |      >_<      |     |
                           | |               |     |
                           | |_______________|     |
                           |                   ::::|
                           '======================='
                           //-'-'-'-'-'-'-'-'-'-'-\\
                          //_'_'_'_'_'_'_'_'_'_'_'_\\
                          [-------------------------]
                          \_________________________/


                            hterm Developer Guide
```

[TOC]

# Introduction

hterm is a JavaScript based terminal emulator that can be embedded in Chrome
web applications.  It almost works in Firefox, but depends on a small number
of changes that haven't been merged yet.

See [/HACK.md](/HACK.md) for general information about working with the source
control setup.

# Building the distributables

The `./bin/mkdist` script can be used to generate the `./dist` directory,
which contains the hterm library source concatenated into
`./dist/js/hterm_all.js`.  This is the file you should copy into your own
projects.

# Coding Style

See the [libapps hacking document](../../HACK.md) for details.

# Tests

The `./bin/load_tests` script can be used to launch a new instance of Chrome
in an isolated profile, with the necessary command line arguments, and load the
hterm test cases.  Test results will appear in the JavaScript console.

You can re-run the tests by reloading the web page as long as you haven't made
changes to `hterm/concat/hterm_resources.concat`.  If you *do* change resources,
run `./bin/mkdist` to re-create them.

# Debugging escape sequences

The `./bin/vtscope.py` script can be used to step through a pre-recorded VT
session on multiple terminals.  This is extremely useful for finding and
debugging how hterm responds to terminal escape sequences.

The idea is that you record (using the `script` utility on your Unix-like
system) a terminal session that doesn't seem to be working right.  You can then
play that recording back through vtscope.py.  Vtscope.py has the ability to
play back simultaneously into two or more terminals.

When the two terminals start to diverge (say, the cursor moved to 0,0 in xterm,
but somewhere else in hterm) you know where the trouble is.  You can also say
what *should* have happened based on what xterm did.

You can try it out with some of the pre-recorded test data.

First start vtscope.py...

    $ cd libapps/hterm/bin
    $ ./vtscope.py

Tell vtscope to wait for two clients...

    vtscope> accept 2

Then open Secure Shell, and log in to the machine with the hterm source.  Start
the netcat utility with `nc 127.0.0.1 8383`.  (If you don't have netcat, get
it.)

Next, launch some other terminal (say, xterm) on the same machine.  Start netcat
again with the same command line.

Now you can load a recorded terminal session in vtscope...

    vtscope> open ../test_data/vttest-01.log

And start stepping through the escape sequences...

    vtscope> step
    vtscope> step
    vtscope> step

You should see the two connected terminals changing in lock-step as they
receive the escape sequences.

If you're going to hand-edit your test data in emacs, don't forget to add...

     # -*- coding: no-conversion -*-

...as the first line of the file (using vi, of course).  Otherwise emacs will
likely munge your escape sequences the first time you save.

Check out the comments in `./bin/vtscope.py` for some more tricks.

# Source Layout

The vast majority of the code here lives under [js/].

* [audio/]: Audio files (e.g. the bell alert).
* [bin/]: Tools for building/testing hterm.
* concat/: Compiled output of other projects we use.
* dist/: Builds of the hterm for integration with other projects.
* [doc/]: Documentation files.
* [etc/]: Scripts/snippets for hterm users to leverage terminal features.
* [examples/]: Example projects using hterm.
* [html/]:
  * [hterm_test.html]: Run all available unittests.
* [images/]: Image files (e.g. notification icons).
* [js/]: The majority of relevant code for hterm.
  * See the section below.
* [test_data/]: Various test data and helper scripts.

## JavaScript Source Layout

* Core logic
  * [hterm.js]: Global inititalization, utility functions & classes.
  * [hterm_screen.js]: The currently visible screen.
  * [hterm_scrollport.js]: A viewport into the buffer that builds the screen.
  * [hterm_terminal.js]: The central `Terminal` object.
  * [hterm_terminal_io.js]: The IO object for writing data into the Terminal
    from the user and the connected process.
  * [hterm_vt.js]: Core processing of escape/control sequences.

* Keyboard related code
  * [hterm_keyboard.js]: Central object for capturing and processing user input.
  * [hterm_keyboard_bindings.js]: Helper for binding keypresses (via
    keypatterns) to actions.
  * [hterm_keyboard_keymap.js]: Default keyboard map (e.g. what happens when you
    press X, Ctrl-X, Alt-X, etc...).
  * [hterm_keyboard_keypattern.js]: Helper for matching keyboard bindings.
  * [hterm_parser.js]: Simple parser for handling keyboard bindings.
  * [hterm_parser_identifiers.js]: Constants for the parser code (such as
    keyboard key names and actions).

* Supplementary modules
  * [hterm_accessibility_reader.js]: Code related to rendering terminal output
    for a screen reader.
  * [hterm_contextmenu.js]: The context menu shown when right clicking.
  * [hterm_options.js]: Internal runtime settings for the `Terminal` object.
  * [hterm_preference_manager.js]: Manager for user preferences.
  * [hterm_pubsub.js]: Helper for managing custom events.
  * [hterm_text_attributes.js]: Helpers for sections of text with different
    attributes (e.g. colors, bold, italics, etc...).
  * [hterm_vt_character_map.js]: Code related to character map translations
    ([SCS]).  Probably safe to ignore as it's unused by default.

* Testing related code
  * [hterm_test.js]: Main unittest runner logic.  Locates & runs all tests.
  * `hterm_mock_*.js`: Various object mocks to simplify unittests.
  * `*_tests.js`: Each module has a corresponding set of unittests.  The
    filename follows the convention of adding `_tests`.  e.g. `hterm_tests.js`
    contains the tests for `hterm.js`.

# JS Life cycle

The [hterm.js] code will initialize defaults for the various objects.  You can
override them yourself (such as setting up `hterm.defaultStorage`) before you
instantiate anything.

An `hterm.Terminal` instance is created and initialization code attached to
`onTerminalReady`.  That callback creates a new `hterm.Terminal.IO` object by
calling `this.io.push`, and then binding its callbacks.  Finally the terminal
is attached to the DOM via a call to `decorate`.  The terminal is now ready to
accept data.

In order for the terminal itself to handle keyboard shortcuts and such, a call
to `installKeyboard` is made.  This binds all the relevant input callbacks to
be captured by hterm.  It will handle things like pressing "X" and "Ctrl-X" and
sending the resulting data to the IO object.

At this point, all data runs through the IO object created earlier.  When the
user inputs text (typing on the keyboard, pasting, etc...), the IO callbacks
are called such as `sendString` and `onVTKeystroke`.  The data is then sent to
the remote process (via network socket/whatever).  When new data is available
from the remote process, it is passed to the IO object via the `print` or
`println` functions.  The logic to communicate with the remote process is left
entirely in the hands of the developer and is outside the scope of hterm.

Drilling down a bit, user input is processed first by `hterm.Keyboard`.  It
looks up the keypress in `hterm.Keyboard.KeyMap` (for the default action), and
the keybindings in `hterm.Keyboard.Bindings` (for user/custom actions).  The
resolved action is then performed.  If it expands into text (as most do), it
is sent to the IO object callbacks (`sendString` and `onVTKeystroke`).  Or it
might trigger an action in which case it is called.

When data is printed to the IO object, it is sent to the terminal's VT layer to
be interpreted (control sequences and such).

As new lines are generated in the VT layer, they're sent to `hterm.Terminal`
which adds to the active `hterm.Screen`, and any excess lines are moved to the
terminal's scrollback.  When the user scrolls the output, `hterm.ScrollPort`
loads rows on the fly from `hterm.Terminal` (as a "RowProvider").

[audio/]: ../audio/
[bin/]: ../bin/
[doc/]: ../doc/
[etc/]: ../etc/
[examples/]: ../examples/
[html/]: ../html/
[images/]: ../images/
[js/]: ../js/
[test_data/]: ../test_data/

[hterm_test.html]: ../html/hterm_test.html

[hterm.js]: ../js/hterm.js
[hterm_accessibility_reader.js]: ../js/hterm_accessibility_reader.js
[hterm_accessibility_reader_tests.js]: ../js/hterm_accessibility_reader_tests.js
[hterm_contextmenu.js]: ../js/hterm_contextmenu.js
[hterm_contextmenu_tests.js]: ../js/hterm_contextmenu_tests.js
[hterm_frame.js]: ../js/hterm_frame.js
[hterm_keyboard.js]: ../js/hterm_keyboard.js
[hterm_keyboard_bindings.js]: ../js/hterm_keyboard_bindings.js
[hterm_keyboard_keymap.js]: ../js/hterm_keyboard_keymap.js
[hterm_keyboard_keypattern.js]: ../js/hterm_keyboard_keypattern.js
[hterm_mock_notification.js]: ../js/hterm_mock_notification.js
[hterm_mock_row_provider.js]: ../js/hterm_mock_row_provider.js
[hterm_options.js]: ../js/hterm_options.js
[hterm_parser.js]: ../js/hterm_parser.js
[hterm_parser_identifiers.js]: ../js/hterm_parser_identifiers.js
[hterm_parser_tests.js]: ../js/hterm_parser_tests.js
[hterm_preference_manager.js]: ../js/hterm_preference_manager.js
[hterm_pubsub.js]: ../js/hterm_pubsub.js
[hterm_pubsub_tests.js]: ../js/hterm_pubsub_tests.js
[hterm_screen.js]: ../js/hterm_screen.js
[hterm_screen_tests.js]: ../js/hterm_screen_tests.js
[hterm_scrollport.js]: ../js/hterm_scrollport.js
[hterm_scrollport_tests.js]: ../js/hterm_scrollport_tests.js
[hterm_terminal.js]: ../js/hterm_terminal.js
[hterm_terminal_tests.js]: ../js/hterm_terminal_tests.js
[hterm_terminal_io.js]: ../js/hterm_terminal_io.js
[hterm_terminal_io_tests.js]: ../js/hterm_terminal_io_tests.js
[hterm_test.js]: ../js/hterm_test.js
[hterm_tests.js]: ../js/hterm_tests.js
[hterm_text_attributes.js]: ../js/hterm_text_attributes.js
[hterm_text_attributes_tests.js]: ../js/hterm_text_attributes_tests.js
[hterm_vt_canned_tests.js]: ../js/hterm_vt_canned_tests.js
[hterm_vt_character_map.js]: ../js/hterm_vt_character_map.js
[hterm_vt_character_map_tests.js]: ../js/hterm_vt_character_map_tests.js
[hterm_vt.js]: ../js/hterm_vt.js
[hterm_vt_tests.js]: ../js/hterm_vt_tests.js

[SCS]: ./ControlSequences.md#SCS
