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


[audio/]: ../../audio/
[bin/]: ../../bin/
[doc/]: ../../doc/
[etc/]: ../../etc/
[examples/]: ../../examples/
[html/]: ../../html/
[images/]: ../../images/
[js/]: ../../js/
[test_data/]: ../../test_data/

[hterm_test.html]: ../../html/hterm_test.html
[hterm.js]: ../../js/hterm.js
[hterm_accessibility_reader.js]: ../../js/hterm_accessibility_reader.js
[hterm_accessibility_reader_tests.js]: ../../js/hterm_accessibility_reader_tests.js
[hterm_contextmenu.js]: ../../js/hterm_contextmenu.js
[hterm_contextmenu_tests.js]: ../../js/hterm_contextmenu_tests.js
[hterm_frame.js]: ../../js/hterm_frame.js
[hterm_keyboard.js]: ../../js/hterm_keyboard.js
[hterm_keyboard_bindings.js]: ../../js/hterm_keyboard_bindings.js
[hterm_keyboard_keymap.js]: ../../js/hterm_keyboard_keymap.js
[hterm_keyboard_keypattern.js]: ../../js/hterm_keyboard_keypattern.js
[hterm_mock_notification.js]: ../../js/hterm_mock_notification.js
[hterm_mock_row_provider.js]: ../../js/hterm_mock_row_provider.js
[hterm_options.js]: ../../js/hterm_options.js
[hterm_parser.js]: ../../js/hterm_parser.js
[hterm_parser_identifiers.js]: ../../js/hterm_parser_identifiers.js
[hterm_parser_tests.js]: ../../js/hterm_parser_tests.js
[hterm_preference_manager.js]: ../../js/hterm_preference_manager.js
[hterm_pubsub.js]: ../../js/hterm_pubsub.js
[hterm_pubsub_tests.js]: ../../js/hterm_pubsub_tests.js
[hterm_screen.js]: ../../js/hterm_screen.js
[hterm_screen_tests.js]: ../../js/hterm_screen_tests.js
[hterm_scrollport.js]: ../../js/hterm_scrollport.js
[hterm_scrollport_tests.js]: ../../js/hterm_scrollport_tests.js
[hterm_terminal.js]: ../../js/hterm_terminal.js
[hterm_terminal_tests.js]: ../../js/hterm_terminal_tests.js
[hterm_terminal_io.js]: ../../js/hterm_terminal_io.js
[hterm_terminal_io_tests.js]: ../../js/hterm_terminal_io_tests.js
[hterm_test.js]: ../../js/hterm_test.js
[hterm_tests.js]: ../../js/hterm_tests.js
[hterm_text_attributes.js]: ../../js/hterm_text_attributes.js
[hterm_text_attributes_tests.js]: ../../js/hterm_text_attributes_tests.js
[hterm_vt_canned_tests.js]: ../../js/hterm_vt_canned_tests.js
[hterm_vt_character_map.js]: ../../js/hterm_vt_character_map.js
[hterm_vt_character_map_tests.js]: ../../js/hterm_vt_character_map_tests.js
[hterm_vt.js]: ../../js/hterm_vt.js
[hterm_vt_tests.js]: ../../js/hterm_vt_tests.js

[SCS]: ../ControlSequences.md#SCS
