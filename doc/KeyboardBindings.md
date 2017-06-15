[TOC]

# hterm Keyboard Bindings

Like every terminal out there, hterm supports a number of standard (and perhaps
not so standard) keyboard shortcuts.  All of them can be overridden via user
settings.  This doc should cover the logic behind each of the shortcuts and the
syntax for rebinding keys.

There are two ways to bind keys:
for users of programs that integrate hterm (e.g. [Secure Shell] users), they'll
set the `keybindings` preference.
For developers integrating hterm into their own program, they'll use the
`hterm.Keyboard.Bindings` JS API.
We'll focus on the `keybindings` preference as the syntax is the same between
them with one exception: developers can bind arbitrary JS code as callbacks.

Keep in mind that some browsers and operating systems do not allow certain key
sequences to be rebound depending on the environment.  For example, Chrome will
not let you rebind Control-N when running in a tab, but will if you're running
fullscreen or in a dedicated window.  Similarly, Windows never lets you rebind
Control-Alt-Delete.

## Key Sequence Parsing

The first part of a keyboard binding is declaring the key sequence to bind.
The syntax is quite simple: a key sequence is zero or more key modifiers
followed by a key code.  Key codes can be a number or an identifier.  Modifiers
and key codes should be joined by dashes.  An asterisk can be used to indicate
that the unspecified modifiers are optional.

Capitalization of keys is not important.  e.g. `Ctrl`, `CTRL`, `ctrl`, and
`cTRl` are all equivalent.  This applies to modifiers and key codes.

### Modifiers

Here are the possible modifiers.  We do not currently differentiate between
left & right keys, so `shift` matches both left shift and right shift.
Order does not matter, so `Ctrl-Shift-A` is equiavlent to `Shift-Ctrl-A`.

* `Shift`: The shift key.
* `Ctrl`: the control key.
* `Alt`: The alt key (the ⌥ Option key on Apple keyboards).
* `Meta`: The meta key (the ⌘ Command key on Apple keyboards and the
  ⊞ Windows key on Windows keyboards).
* `*`: The asterisk can be used to match unspecified modifiers.

If the key is not listed here, then it cannot be used as a modifier.
e.g. You cannot bind `Escape-K` or `Capslock-D` to something else.

### Key Codes

The key codes should be the name of the key, or the ASCII value for that key
(either decimal or hexadecimal).  So `A` will match the "A" key, as will `65`
and `0x41`.

For the full list of possible key names, see `hterm.Parser.identifiers.keyCodes`
in [hterm_parser_identifiers.js].

### Examples

Some examples will probably help.

* `A`: Matches only an unmodified "A" character.
* `65`: Same as above.
* `0x41`: Same as above.
* `Ctrl-A`: Matches only Ctrl-A.
* `Ctrl-65`: Same as above.
* `Ctrl-0x41`: Same as above.
* `Ctrl-Shift-A`: Matches only Ctrl-Shift-A.
* `Ctrl-*-A`: Matches Ctrl-A, as well as any other key sequence that includes
  at least the Ctrl and A keys.

## Key Action Parsing

The second part of a keyboard binding is telling the system what to actually do.
It can either be a string (of arbitrary length), or a predefined action.  For
developers programming the hterm JS API, it can also be a function.

### Strings

If you want to specify a string, then pass in a quoted string.  The embedded
quotes are important!  e.g. use `"'foo'"` if you want to emit the string `foo`.

Common escape sequences are supported inside of double quotes.  Capitalization
here is significant, so you must write `\t` and not `\T`.

* `\'`: A single quote.
* `\"`: A double quote.
* `\a`: A bell/alert (0x07 in ASCII).
* `\b`: The backspace key (0x08 in ASCII).
* `\e`: The escape key (0x1b in ASCII).
* `\f`: A form feed (0x0c in ASCII).
* `\n`: A new line (0x0a in ASCII).
* `\r`: A carriage return (0x0d in ASCII).
* `\t`: A tab (0x09 in ASCII).
* `\v`: A vertical tab (0x0b in ASCII).
* `\x##`: A 8-bit hexadecimal sequence.  e.g. `\x1b` is the same as `\e`.
* `\u####`: A 16-bit Unicode codepoint.  e.g. `\u001b` is the same as `\e`.

### Actions

Some basic actions are available too.  Capitalization here is significant,
so you must write `CANCEL` and not `cancel` or `Cancel`.

Note: The list of actions here is a bit thin.  If you want to do something
else, please file a [feature request] with us.

* `CANCEL`: Prevent the browser, operating system, and hterm from doing
  anything.  Note: Browser & OS restrictions might not let you rebind.
* `DEFAULT`: Have hterm handle the standard key code for this key sequence.
* `PASS`: Pass the key sequence along to the browser or OS, and have hterm
  ignore it.
* `scrollPageUp`: Scroll up one page in the terminal buffer.
* `scrollPageDown`: Scroll down one page in the terminal buffer.
* `scrollToTop`: Scroll to the top of the terminal buffer.
* `scrollToBottom`: Scroll to the bottom of the terminal buffer.

## `keybindings` User Preference

Since all preferences are stored as strings, the `keybindings` object is
stored as a JSON string.  At runtime, it is converted back to a JSON object.
Care must be taken when trying to define your key bindings.

Things to remember:

* JSON will process strings using its escape syntax, and then hterm will
  process the result using its own escape syntax.  If you want to pass an
  escape sequence to hterm, you'll need to doubly escape things!
* In most cases, using JSON to escape things is sufficient as hterm can handle
  the resulting string just fine.
* The escape sequences supported by both are very similar, but not identical.
  hterm supports `\a` and `\e`, while JSON supports `\u{xxxx}`.
* JSON does not support comments.  e.g. lines starting with `#` are errors.
* JSON does not allow trailing commas.  e.g. `[1,2]` is valid while `[1,2,]` is
  invalid.

Specifically on the topic of quoting:

* JSON always uses double quotes for its own fields.  e.g. `"foo"`.
* hterm expects strings, so you'll have to nest your quotes.  Using double
  quotes for JSON and single quotes for hterm works best (even if it is
  slightly difficult to read).  e.g. `"'foo'"` will bind `foo`.
* If you want hterm to send a string with embedded quotes, then it's easiest to
  pass double quotes to hterm.  e.g. `"\"foo'bar\""` to bind `foo'bar`, and
  `"\"foo\\\"b'r\""` to bind `foo"b'r`.

### Examples

In the keybindings below (many of which are not terribly useful):

* Control-A will paste the string `hi`.
* Control-N will send the sequence to the browser or OS to handle.
  What happens exactly after that is up to the browser or OS.
* Control-X will do nothing at all.  It's like the key press never happened.
* Shift-Page Up will cause the terminal to scroll up one page.
* X will tell hterm to process the X key like normal.
* Control-Alt-M will send a backspace character.
* Control-*-M will match all Control-M combinations (regardless of Alt, Meta,
  or Shift keys), except for keys with more specific bindings (e.g. it will
  not match Control-Alt-M here).

```
{
  "Ctrl-A": "'hi'",
  "Ctrl-N": "PASS",
  "Ctrl-X": "CANCEL",
  "Shift-PGUP": "scrollPageUp",
  "X": "DEFAULT",
  "Ctrl-Alt-M": "'\u0008'",
  "Ctrl-*-M": "DEFAULT"
}
```

## Default Keymap

The default set of key bindings can be seen in [hterm_keyboard_keymap.js].
Look at the `hterm.Keyboard.KeyMap.prototype.reset` function.

## Source Code

If you're a developer and want to look into the source code, then the main
files to check out:

* [hterm_parser.js]: The `hterm.Parser` code responsible for parsing key
  bindings (sequences and actions).
* [hterm_parser_identifiers.js]: The `hterm.Parser.identifiers` constants
  used by the parser and key bindings logic.
* [hterm_keyboard.js]: The `hterm.Keyboard` code which handles all the runtime
  logic for processing keyboard events.
* [hterm_keyboard_bindings.js]: The `hterm.Keyboard.Bindings` code which
  provides adding and removing key bindings at runtime.
* [hterm_keyboard_keymap.js]: The `hterm.Keyboard.KeyMap` code which registers
  the default keyboard bindings.
* [hterm_keyboard_keypattern.js]: The `hterm.Keyboard.KeyPattern` code for
  defining a runtime key binding object.


[Secure Shell]: https://chrome.google.com/webstore/detail/pnhechapfaindjhompbnflcldabbghjo
[feature request]: https://goo.gl/vb94JY

[hterm_parser.js]: ../js/hterm_parser.js
[hterm_parser_identifiers.js]: ../js/hterm_parser_identifiers.js
[hterm_keyboard.js]: ../js/hterm_keyboard.js
[hterm_keyboard_bindings.js]: ../js/hterm_keyboard_bindings.js
[hterm_keyboard_keymap.js]: ../js/hterm_keyboard_keymap.js
[hterm_keyboard_keypattern.js]: ../js/hterm_keyboard_keypattern.js
