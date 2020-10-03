# hterm

hterm is a JS library that provides a terminal emulator.  It is reasonably fast,
reasonably correct, and reasonably portable across browsers.

Do not confuse this with an ssh client (like [Secure Shell](../nassh/)) or a
shell environment by itself.  It only provides the platform for rendering
terminal output and accepting keyboard input.

# Contact

The [chromium-hterm mailing list] can be used to contact other users and
developers for questions.

Our existing set of bugs/feature requests can be found at
<https://goo.gl/VkasRC>.

To file an actual report, you can use <https://goo.gl/vb94JY>.  This will route
to the right people.

# Requirements

We require ECMAScript 2018.  If you're using an older runtime, then sorry,
you're not supported.  Fortunately, all modern browsers today should support it.

We might use some newer features as we deem useful, but only ones that can be
polyfilled (and we'll include those polyfills by way of [libdot]).  We'll avoid
language features (e.g. syntax) that can't be polyfilled.

Of course, we might slip up and use something that violates these stated goals.
Feel free to let us know via the Contact section above! :)

# Mirrors & Packaging

* https://chromium.googlesource.com/apps/libapps/+/HEAD/hterm: Main project site.
* https://github.com/chromium/hterm: Mirror of just the hterm/ subdir.
  Updated from time to time by developers.
* https://github.com/libapps/hterm: Another mirror (in the libapps namespace).
* https://www.npmjs.com/package/hterm: Packaging for npm installs.
* `//depot/google3/third_party/javascript/hterm/`: Internal Google packaging.

# Documentation

* [Authors](./doc/AUTHORS.md) -- List of people who have contributed
* [ChangeLog](./doc/ChangeLog.md) -- List of interesting changes in each release
* [FAQ](../nassh/doc/FAQ.md) -- Frequently Asked Questions
* [Keyboard Bindings](./doc/KeyboardBindings.md) -- All keyboard related details
* [Control Sequences](./doc/ControlSequences.md) -- Supported control sequences
* [Embedding](./doc/embed.md) -- Using hterm in your project
* [Hacking](./doc/hack.md) -- Using the hterm source
* [Internals](./doc/internals/) -- Developing the hterm project

[chromium-hterm mailing list]: https://groups.google.com/a/chromium.org/forum/?fromgroups#!forum/chromium-hterm
[libdot]: ../libdot
