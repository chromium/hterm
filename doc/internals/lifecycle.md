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
be captured by hterm.  It will handle things like pressing "X" and "Ctrl+X" and
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


[hterm.js]: ../../js/hterm.js
