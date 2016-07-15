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

# Introduction

hterm is a JavaScript based terminal emulator that can be embedded in Chrome
web applications.  It almost works in Firefox, but depends on a small number
of changes that haven't been merged yet.

See [/HACK.md](/HACK.md) for general information about working with the source
control setup.

# Building the distributables

The `./bin/mkdist.sh` script can be used to generate the `./dist` directory,
which contains the hterm library source concatenated into
`./dist/js/hterm_all.js`.  This is the file you should copy into your own
projects.

# Tests

The `./bin/load_tests.sh` script can be used to launch a new instance of Chrome
in an isolated profile, with the necessary command line arguments, and load the
hterm test cases.  Test results will appear in the JavaScript console.

You can re-run the tests by reloading the web page as long as you haven't made
changes to `hterm/concat/hterm_resources.concat`.  If you *do* change resources,
run `./bin/mkdist.sh` to re-create them.

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
