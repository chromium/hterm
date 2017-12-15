// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('lib.f');

/**
 * @fileoverview VT test suite.
 *
 * This is more of an integration test suite for the VT and Terminal classes,
 * as each test typically sends strings into the VT parser and then reads
 * the terminal to verify that everyone did the right thing.
 */

hterm.VT.Tests = new lib.TestManager.Suite('hterm.VT.Tests');

hterm.VT.Tests.prototype.setup = function(cx) {
  this.setDefaults(cx,
      { visibleColumnCount: 15,
        visibleRowCount: 6,
      });
};

/**
 * Clear out the current document and create a new hterm.Terminal object for
 * testing.
 *
 * Called before each test case in this suite.
 */
hterm.VT.Tests.prototype.preamble = function(result, cx) {
  var document = cx.window.document;

  document.body.innerHTML = '';

  var div = document.createElement('div');
  div.style.position = 'absolute';
  div.style.height = '100%';
  div.style.width = '100%';
  document.body.appendChild(div);

  this.div = div;

  cx.window.terminal = this.terminal = new hterm.Terminal();

  this.terminal.decorate(div);
  this.terminal.setWidth(this.visibleColumnCount);
  this.terminal.setHeight(this.visibleRowCount);

  MockNotification.start();
};

/**
 * Ensure that blink is off after the test so we don't have runaway timeouts.
 *
 * Called after each test case in this suite.
 */
hterm.VT.Tests.prototype.postamble = function(result, cx) {
  this.terminal.setCursorBlink(false);

  MockNotification.stop();
};

/**
 * Overridden addTest method.
 *
 * Every test in this suite needs to wait for the terminal initialization to
 * complete asynchronously.  Rather than stick a bunch of boilerplate into each
 * test case, we use this overridden addTest method to add a proxy around the
 * actual test.
 */
hterm.VT.Tests.addTest = function(name, callback) {
  function testProxy(result, cx) {
    var self = this;
    setTimeout(function() {
        self.terminal.setCursorPosition(0, 0);
        self.terminal.setCursorVisible(true);
        callback.apply(self, [result, cx]);
      }, 0);

    result.requestTime(200);
  }

  lib.TestManager.Suite.addTest.apply(this, [name, testProxy]);
};

/**
 * Basic sanity test to make sure that when we insert plain text it appears
 * on the screen and scrolls into the scrollback buffer correctly.
 */
hterm.VT.Tests.addTest('sanity', function(result, cx) {
    this.terminal.interpret('0\r\n1\r\n2\r\n3\r\n4\r\n5\r\n6\r\n' +
                            '7\r\n8\r\n9\r\n10\r\n11\r\n12');

    var text = this.terminal.getRowsText(0, 13);
    result.assertEQ(text, '0\n1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12');

    result.assertEQ(this.terminal.scrollbackRows_.length, 7);

    result.pass();
  });

/**
 * Test that we parse UTF-8 properly. Parser state should persist
 * across writes and invalid sequences should result in replacement
 * characters.
 */
hterm.VT.Tests.addTest('utf8', function(result, cx) {
    // 11100010 10000000 10011001 split over two writes.
    this.terminal.interpret('\xe2\x80');
    this.terminal.interpret('\x99\r\n');

    // Interpret some invalid UTF-8. xterm and gnome-terminal are
    // inconsistent about the number of replacement characters. We
    // match xterm.
    this.terminal.interpret('a\xf1\x80\x80\xe1\x80\xc2b\x80c\x80\xbfd\r\n')

    // Surrogate pairs turn into replacements.
    this.terminal.interpret('\xed\xa0\x80' +  // D800
                            '\xed\xad\xbf' +  // D87F
                            '\xed\xae\x80' +  // DC00
                            '\xed\xbf\xbf');  // DFFF

    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text,
                    '\u2019\n' +
                    'a\ufffd\ufffd\ufffdb\ufffdc\ufffd\ufffdd\n' +
                    '\ufffd\ufffd\ufffd\ufffd');


    // Check the upper and lower bounds of each sequence type. The
    // last few will turn into single replacement characters. Some may
    // require surrogate pairs in UTF-16. Run these through the
    // decoder directly because the terminal ignores 00 and 7F.
    result.assertEQ(
      new lib.UTF8Decoder().decode('\x00' +
                                   '\xc2\x80' +
                                   '\xe0\xa0\x80' +
                                   '\xf0\x90\x80\x80' +
                                   '\xf8\x88\x80\x80\x80' +
                                   '\xfc\x84\x80\x80\x80\x80'),
      '\u0000\u0080\u0800\ud800\udc00\ufffd\ufffd');
    result.assertEQ(
      new lib.UTF8Decoder().decode('\x7f' +
                                   '\xdf\xbf' +
                                   '\xef\xbf\xbf' +
                                   '\xf7\xbf\xbf\xbf' +
                                   '\xfb\xbf\xbf\xbf\xbf' +
                                   '\xfd\xbf\xbf\xbf\xbf\xbf'),
      '\u007f\u07ff\uffff\ufffd\ufffd\ufffd');

    result.pass();
  });

/**
 * Verify we don't drop combining characters.
 *
 * Note: The exact output here is somewhat debatable.  Combining characters
 * should follow "real" characters, not escape sequences that we filter out.
 * So you could argue that this should be âbc or abĉ.  We happen to (almost)
 * produce âbc currently, but if logic changes in hterm that makes it more
 * difficult to pull off, that's OK.  This test is partially a sanity check
 * to make sure we don't significantly regress (like we have in the past) by
 * producing something like "âc".
 */
hterm.VT.Tests.addTest('utf8-combining', function(result, cx) {
    this.terminal.interpret('abc\b\b\xcc\x82\n');
    var text = this.terminal.getRowsText(0, 1);
    result.assertEQ(text, 'a\u{302}bc');
    result.pass();
  });

/**
 * Basic cursor positioning tests.
 *
 * TODO(rginda): Test the VT52 variants too.
 */
hterm.VT.Tests.addTest('cursor-relative', function(result, cx) {
    this.terminal.interpret('line 1\r\nline 2\r\nline 3');
    this.terminal.interpret('\x1b[A\x1b[Dtwo' +
                            '\x1b[3D' +
                            '\x1b[Aone' +
                            '\x1b[4D' +
                            '\x1b[2B' +
                            '\x1b[Cthree');
    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text, 'line one\nline two\nline three');
    result.pass();
  });

/**
 * Test absolute cursor positioning.
 */
hterm.VT.Tests.addTest('cursor-absolute', function(result, cx) {
    this.terminal.interpret('line 1\r\nline 2\r\nline 3');

    this.terminal.interpret('\x1b[1Gline three' +
                            '\x1b[2;6Htwo' +
                            '\x1b[1;5f one');

    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text, 'line one\nline two\nline three');

    result.pass();
  });

/**
 * Test line positioning.
 */
hterm.VT.Tests.addTest('line-position', function(result, cx) {
    this.terminal.interpret('line 1\r\nline 2\r\nline 3');

    this.terminal.interpret('\x1b[Fline two' +
                            '\x1b[Fline one' +
                            '\x1b[E\x1b[Eline three');

    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text, 'line one\nline two\nline three');
    result.pass();
  });

/**
 * Test that a partial sequence is buffered until the entire sequence is
 * received.
 */
hterm.VT.Tests.addTest('partial-sequence', function(result, cx) {
    this.terminal.interpret('line 1\r\nline 2\r\nline three');

    this.terminal.interpret('\x1b');
    this.terminal.interpret('[');
    this.terminal.interpret('5');
    this.terminal.interpret('D');
    this.terminal.interpret('\x1b[');
    this.terminal.interpret('Atwo\x1b[3');
    this.terminal.interpret('D\x1b[Aone');

    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text, 'line one\nline two\nline three');
    result.pass();
  });

/**
 * Test that two ESC characters in a row are handled properly.
 */
hterm.VT.Tests.addTest('double-sequence', function(result, cx) {
    this.terminal.interpret('line one\r\nline two\r\nline 3');

    this.terminal.interpret('\x1b[\x1b[Dthree');

    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text, 'line one\nline two\nline three');
    result.pass();
  });

/**
 * Test that 8-bit control characters are properly ignored.
 */
hterm.VT.Tests.addTest('8-bit-control', function(result, cx) {
    var title = null;
    this.terminal.setWindowTitle = function(t) {
      // Set a default title so we can catch the potential for this function
      // to be called on accident with no parameter.
      title = t || 'XXX';
    };

    result.assertEQ(this.terminal.vt.enable8BitControl, false);

    // Send a "set window title" command using a disabled 8-bit
    // control. It's a C1 control, so we interpret it after UTF-8
    // decoding.
    this.terminal.interpret('\xc2\x9d0;test title\x07!!');

    result.assertEQ(title, null);
    result.assertEQ(this.terminal.getRowsText(0, 1), '0;test title!!');

    // Try again with the two-byte version of the code.
    title = null;
    this.terminal.reset();
    this.terminal.interpret('\x1b]0;test title\x07!!');
    result.assertEQ(title, 'test title');
    result.assertEQ(this.terminal.getRowsText(0, 1), '!!');

    // Now enable 8-bit control and see how it goes.
    title = null;
    this.terminal.reset();
    this.terminal.vt.enable8BitControl = true;
    this.terminal.interpret('\xc2\x9d0;test title\x07!!');
    result.assertEQ(title, 'test title');
    result.assertEQ(this.terminal.getRowsText(0, 1), '!!');

    result.pass();
  });

/**
 * If we see embedded escape sequences, we should reject them.
 */
hterm.VT.Tests.addTest('embedded-escape-sequence', function(result, cx) {
    var title = null;
    this.terminal.setWindowTitle = function(t) {
      // Set a default title so we can catch the potential for this function
      // to be called on accident with no parameter.
      title = t || 'XXX';
    };

    // We know we're going to cause chokes, so silence the warnings.
    this.terminal.vt.warnUnimplemented = false;

    ['\a', '\x1b\\'].forEach((seq) => {
      // We get all the data at once with a terminated sequence.
      terminal.reset();
      this.terminal.interpret('\x1b]0;asdf\x1b x ' + seq);
      result.assertEQ(title, null);

      // We get the data in pieces w/a terminated sequence.
      terminal.reset();
      this.terminal.interpret('\x1b]0;asdf');
      this.terminal.interpret('\x1b');
      this.terminal.interpret(' x ' + seq);
      result.assertEQ(title, null);
    });

    // We get the data in pieces but no terminating sequence.
    terminal.reset();
    this.terminal.interpret('\x1b]0;asdf');
    this.terminal.interpret('\x1b');
    this.terminal.interpret(' ');
    result.assertEQ(title, null);

    result.pass();
  });

/**
 * Verify that split ST sequences are buffered/handled correctly.
 */
hterm.VT.Tests.addTest('split-ST-sequence', function(result, cx) {
    var title = null;
    this.terminal.setWindowTitle = function(t) {
      // Set a default title so we can catch the potential for this function
      // to be called on accident with no parameter.
      title = t || 'XXX';
    };

    // We get the first half of the ST with the base.
    this.terminal.interpret('\x1b]0;asdf\x1b');
    this.terminal.interpret('\\');
    result.assertEQ(title, 'asdf');

    // We get the first half of the ST one byte at a time.
    title = null;
    terminal.reset();
    this.terminal.interpret('\x1b]0;asdf');
    this.terminal.interpret('\x1b');
    this.terminal.interpret('\\');
    result.assertEQ(title, 'asdf');

    result.pass();
  });

hterm.VT.Tests.addTest('dec-screen-test', function(result, cx) {
    this.terminal.interpret('\x1b#8');

    var text = this.terminal.getRowsText(0, 6);
    result.assertEQ(text,
                    'EEEEEEEEEEEEEEE\n' +
                    'EEEEEEEEEEEEEEE\n' +
                    'EEEEEEEEEEEEEEE\n' +
                    'EEEEEEEEEEEEEEE\n' +
                    'EEEEEEEEEEEEEEE\n' +
                    'EEEEEEEEEEEEEEE');
    result.pass();

  });

hterm.VT.Tests.addTest('newlines-1', function(result, cx) {
    // Should be off by default.
    result.assertEQ(this.terminal.options_.autoCarriageReturn, false);

    // 0d: newline, 0b: vertical tab, 0c: form feed.
    this.terminal.interpret('newline\x0dvtab\x0bff\x0cbye');
    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text,
                    'vtabine\n' +
                    '    ff\n' +
                    '      bye'
                    );

    result.pass();
  });

hterm.VT.Tests.addTest('newlines-2', function(result, cx) {
    this.terminal.interpret('\x1b[20h');
    result.assertEQ(this.terminal.options_.autoCarriageReturn, true);

    this.terminal.interpret('newline\x0dvtab\x0bff\x0cbye');
    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text,
                    'vtabine\n' +
                    'ff\n' +
                    'bye'
                    );

    result.pass();
  });

/**
 * Test the default tab stops.
 */
hterm.VT.Tests.addTest('tabs', function(result, cx) {
    this.terminal.interpret('123456789012345\r\n');
    this.terminal.interpret('1\t2\ta\r\n');
    this.terminal.interpret('1\t2\tb\r\n');
    this.terminal.interpret('1\t2\tc\r\n');
    this.terminal.interpret('1\t2\td\r\n');
    this.terminal.interpret('1\t2\te');
    var text = this.terminal.getRowsText(0, 6);
    result.assertEQ(text,
                    '123456789012345\n' +
                    '1       2     a\n' +
                    '1       2     b\n' +
                    '1       2     c\n' +
                    '1       2     d\n' +
                    '1       2     e'
                    );

    result.pass();
  });

/**
 * Test terminal reset.
 */
hterm.VT.Tests.addTest('reset', function(result, cx) {
    this.terminal.interpret(
        // Switch to alternate screen and set some attributes.
        '\x1b[?47h\x1b[1;33;44m' +
        // Switch back to primary screen.
        '\x1b[?47l' +
        // Set some text attributes.
        '\x1b[1;33;44m' +
        // Clear all tab stops.
        '\x1b[3g' +
        // Set a scroll region.
        '\x1b[2;4r' +
        // Set cursor position.
        '\x1b[5;6H');

    var ta;

    result.assertEQ(this.terminal.tabStops_.length, 0);

    ta = this.terminal.primaryScreen_.textAttributes;
    result.assert(ta.foreground != ta.DEFAULT_COLOR);
    result.assert(ta.background != ta.DEFAULT_COLOR);

    ta = this.terminal.alternateScreen_.textAttributes;
    result.assert(ta.foreground != ta.DEFAULT_COLOR);
    result.assert(ta.background != ta.DEFAULT_COLOR);

    result.assertEQ(ta.bold, true);

    result.assertEQ(this.terminal.vtScrollTop_, 1);
    result.assertEQ(this.terminal.vtScrollBottom_, 3);
    result.assertEQ(this.terminal.screen_.cursorPosition.row, 4);
    result.assertEQ(this.terminal.screen_.cursorPosition.column, 5);

    // Reset.
    this.terminal.interpret('\x1bc');

    result.assertEQ(this.terminal.tabStops_.length, 1);

    ta = this.terminal.primaryScreen_.textAttributes;
    result.assertEQ(ta.foreground, ta.DEFAULT_COLOR);
    result.assertEQ(ta.background, ta.DEFAULT_COLOR);

    ta = this.terminal.alternateScreen_.textAttributes;
    result.assertEQ(ta.foreground, ta.DEFAULT_COLOR);
    result.assertEQ(ta.background, ta.DEFAULT_COLOR);

    result.assertEQ(ta.bold, false);

    result.assertEQ(this.terminal.vtScrollTop_, null);
    result.assertEQ(this.terminal.vtScrollBottom_, null);
    result.assertEQ(this.terminal.screen_.cursorPosition.row, 0);
    result.assertEQ(this.terminal.screen_.cursorPosition.column, 0);

    result.pass();
  });

/**
 * Test the erase left command.
 */
hterm.VT.Tests.addTest('erase-left', function(result, cx) {
    this.terminal.interpret('line one\r\noooooooo\r\nline three');
    this.terminal.interpret('\x1b[5D\x1b[A' +
                            '\x1b[1Ktw');

    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text,
                    'line one\n' +
                    '     two\n' +
                    'line three');
    result.pass();
  });

/**
 * Test the erase left command with widechar string.
 */
hterm.VT.Tests.addTest('erase-left-widechar', function(result, cx) {
    this.terminal.interpret(
        '\xe7\xac\xac\xe4\xb8\x80\xe8\xa1\x8c\r\n' +
        '\xe7\xac\xac\xe4\xba\x8c\xe8\xa1\x8c\r\n' +
        '\xe7\xac\xac\xe4\xb8\x89\xe8\xa1\x8c');
    this.terminal.interpret('\x1b[5D' +
                            '\x1b[A' +
                            '\x1b[1KOO');

    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ('\u7b2c\u4e00\u884c\n' +
                    ' OO \u884c\n' +
                    '\u7b2c\u4e09\u884c',
                    text);
    result.pass();
  });

/**
 * Test the erase right command.
 */
hterm.VT.Tests.addTest('erase-right', function(result, cx) {
    this.terminal.interpret('line one\r\nline XXXX\r\nline three');
    this.terminal.interpret('\x1b[5D\x1b[A' +
                            '\x1b[0Ktwo');

    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text,
                    'line one\n' +
                    'line two\n' +
                    'line three');
    result.pass();
  });

/**
 * Test the erase right command with widechar string.
 */
hterm.VT.Tests.addTest('erase-right-widechar', function(result, cx) {
    this.terminal.interpret(
        '\xe7\xac\xac\xe4\xb8\x80\xe8\xa1\x8c\r\n' +
        '\xe7\xac\xac\xe4\xba\x8c\xe8\xa1\x8c\r\n' +
        '\xe7\xac\xac\xe4\xb8\x89\xe8\xa1\x8c');
    this.terminal.interpret('\x1b[5D\x1b[A' +
                            '\x1b[0KOO');

    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ('\u7b2c\u4e00\u884c\n' +
                    ' OO\n' +
                    '\u7b2c\u4e09\u884c',
                    text);
    result.pass();
  });

/**
 * Test the erase line command.
 */
hterm.VT.Tests.addTest('erase-line', function(result, cx) {
    this.terminal.interpret('line one\r\nline twoo\r\nline three');
    this.terminal.interpret('\x1b[5D\x1b[A' +
                            '\x1b[2Ktwo');

    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text,
                    'line one\n' +
                    '     two\n' +
                    'line three');
    result.pass();
  });

/**
 * Test the erase above command.
 */
hterm.VT.Tests.addTest('erase-above', function(result, cx) {
    this.terminal.interpret('line one\r\noooooooo\r\nline three');
    this.terminal.interpret('\x1b[5D\x1b[A' +
                            '\x1b[1Jtw');

    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text,
                    '\n' +
                    '     two\n' +
                    'line three');
    result.pass();
  });

/**
 * Test the erase all command.
 */
hterm.VT.Tests.addTest('erase-all', function(result, cx) {
    this.terminal.interpret('line one\r\nline XXXX\r\nline three');
    this.terminal.interpret('\x1b[5D\x1b[A' +
                            '\x1b[2Jtwo');

    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text,
                    '\n' +
                    '     two\n' +
                    '');
    result.pass();
  });

/**
 * Test the erase below command.
 */
hterm.VT.Tests.addTest('erase-below', function(result, cx) {
    this.terminal.interpret('line one\r\nline XXXX\r\nline three');
    this.terminal.interpret('\x1b[5D\x1b[A' +
                            '\x1b[0Jtwo');

    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text,
                    'line one\n' +
                    'line two\n' +
                    '');
    result.pass();
  });

/**
 * Test the erase character command.
 */
hterm.VT.Tests.addTest('erase-char', function(result, cx) {
    this.terminal.interpret('line one\r\nline XXXX\r\nline three');
    this.terminal.interpret('\x1b[5D\x1b[A' +
                            '\x1b[4Xtwo');

    var text = this.terminal.getRowsText(0, 3);
    // See TODO in hterm.Terminal.prototype.eraseToRight for the extra space.
    result.assertEQ(text,
                    'line one\n' +
                    'line two\n' +
                    'line three');

    this.terminal.interpret('\x1b[3D' +
                            '\x1b[X');
    text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text,
                    'line one\n' +
                    'line  wo\n' +
                    'line three');
    result.pass();
  });

/**
 * Test the insert line command.
 */
hterm.VT.Tests.addTest('insert-line', function(result, cx) {
    this.terminal.interpret('line two\r\nline three');
    this.terminal.interpret('\x1b[5D\x1b[2A\x1b[L' +
                            'line one');

    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text,
                    'line one\n' +
                    'line two\n' +
                    'line three');
    result.pass();
  });

/**
 * Test the insert line command with an argument.
 */
hterm.VT.Tests.addTest('insert-lines', function(result, cx) {
    this.terminal.interpret('line three\r\n\r\n');
    this.terminal.interpret('\x1b[5D\x1b[2A\x1b[2L' +
                            'line one\r\nline two');

    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text,
                    'line one\n' +
                    'line two\n' +
                    'line three');
    result.pass();
  });

/**
 * Test that the insert line command handles overflow properly.
 */
hterm.VT.Tests.addTest('insert-toomany-lines', function(result, cx) {
    this.terminal.interpret('XXXXX');
    this.terminal.interpret('\x1b[6L' +
                            'line one\r\nline two\r\nline three');

    var text = this.terminal.getRowsText(0, 5);
    result.assertEQ(text,
                    'line one\n' +
                    'line two\n' +
                    'line three\n' +
                    '\n' +
                    '');
    result.pass();
  });

/**
 * Test the delete line command.
 */
hterm.VT.Tests.addTest('delete-line', function(result, cx) {
    this.terminal.interpret('line one\r\nline two\r\n' +
                            'XXXXXXXX\r\n' +
                            'line XXXXX');
    this.terminal.interpret('\x1b[5D\x1b[A\x1b[Mthree');

    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text,
                    'line one\n' +
                    'line two\n' +
                    'line three');
    result.pass();
  });

/**
 * Test the delete line command with an argument.
 */
hterm.VT.Tests.addTest('delete-lines', function(result, cx) {
    this.terminal.interpret('line one\r\nline two\r\n' +
                            'XXXXXXXX\r\nXXXXXXXX\r\n' +
                            'line XXXXX');
    this.terminal.interpret('\x1b[5D\x1b[2A\x1b[2Mthree');

    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text,
                    'line one\n' +
                    'line two\n' +
                    'line three');
    result.pass();
  });

/**
 * Test the insert space command.
 */
hterm.VT.Tests.addTest('insert-space', function(result, cx) {
    this.terminal.interpret('line one\r\nlinetwo\r\nline three');
    this.terminal.interpret('\x1b[6D\x1b[A\x1b[@');

    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text,
                    'line one\n' +
                    'line two\n' +
                    'line three');
    result.pass();
  });

/**
 * Test the insert space command with an argument.
 */
hterm.VT.Tests.addTest('insert-spaces', function(result, cx) {
    this.terminal.interpret('line one\r\nlinetwo\r\nline three');
    this.terminal.interpret('\x1b[6D\x1b[A\x1b[3@');

    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text,
                    'line one\n' +
                    'line   two\n' +
                    'line three');
    result.pass();
  });

/**
 * Test the delete characters command.
 */
hterm.VT.Tests.addTest('delete-chars', function(result, cx) {
    this.terminal.interpret('line one\r\nline XXXX\r\nline three');
    this.terminal.interpret('\x1b[5D\x1b[A\x1b[4Ptwo');

    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text,
                    'line one\n' +
                    'line two\n' +
                    'line three');
    result.pass();
  });

/**
 * Test that the delete characters command handles overflow properly.
 */
hterm.VT.Tests.addTest('delete-toomany', function(result, cx) {
    this.terminal.interpret('line one\r\nline XXXX\r\nline three');
    this.terminal.interpret('\x1b[5D\x1b[A\x1b[20Ptwo');

    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text,
                    'line one\n' +
                    'line two\n' +
                    'line three');
    result.pass();
  });

/**
 * Test the scroll up command.
 */
hterm.VT.Tests.addTest('scroll-up', function(result, cx) {
    this.terminal.interpret('\r\n\r\nline one\r\nline two\r\nline XXXXX');
    this.terminal.interpret('\x1b[5D\x1b[2A\x1b[2Sthree');

    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text,
                    'line one\n' +
                    'line two\n' +
                    'line three');
    result.pass();
  });

/**
 * Test the scroll down command.
 */
hterm.VT.Tests.addTest('scroll-down', function(result, cx) {
    this.terminal.interpret('line one\r\nline two\r\nline XXXXX\r\n');
    this.terminal.interpret('     \x1b[Tthree');

    var text = this.terminal.getRowsText(0, 5);
    result.assertEQ(text,
                    '\n' +
                    'line one\n' +
                    'line two\n' +
                    'line three\n' +
                    '     ');
    result.pass();
  });

/**
 * Test the absolute line positioning command.
 */
hterm.VT.Tests.addTest('line-position-absolute', function(result, cx) {
    this.terminal.interpret('line XXX\r\nline YYY\r\nline ZZZZZ\r\n');
    this.terminal.interpret('     \x1b[3dthree\x1b[5D');
    this.terminal.interpret('\x1b[2dtwo\x1b[3D');
    this.terminal.interpret('\x1b[1done');

    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text,
                    'line one\n' +
                    'line two\n' +
                    'line three');
    result.pass();
  });

/**
 * Test the device attributes command.
 */
hterm.VT.Tests.addTest('device-attributes', function(result, cx) {
    var resultString;
    this.terminal.io.sendString = function(str) { resultString = str };

    this.terminal.interpret('\x1b[c');

    result.assertEQ(resultString, '\x1b[?1;2c');
    result.pass();
  });

/**
 * TODO(rginda): Test the clear tabstops on this line command.
 */
hterm.VT.Tests.disableTest('clear-line-tabstops', function(result, cx) {
    '[0g';
  });

/**
 * TODO(rginda): Test the clear all tabstops command.
 */
hterm.VT.Tests.disableTest('clear-all-tabstops', function(result, cx) {
    '[3g';
  });

/**
 * TODO(rginda): Test text attributes.
 */
hterm.VT.Tests.addTest('color-change', function(result, cx) {
    this.terminal.interpret('[mplain....... [0;36mHi\r\n' +
                            '[mitalic...... [3;36mHi\r\n' +
                            '[mbright...... [0;96mHi\r\n' +
                            '[mbold........ [1;36mHi\r\n' +
                            '[mbold-bright. [1;96mHi\r\n' +
                            '[mbright-bold. [96;1mHi');

    var text = this.terminal.getRowsText(0, 6);
    result.assertEQ(text,
                    'plain....... Hi\n' +
                    'italic...... Hi\n' +
                    'bright...... Hi\n' +
                    'bold........ Hi\n' +
                    'bold-bright. Hi\n' +
                    'bright-bold. Hi');

    for (var i = 0; i < 6; i++) {
      var row = this.terminal.getRowNode(i);
      result.assertEQ(row.childNodes.length, 2, 'i: ' + i);
      result.assertEQ(row.childNodes[0].nodeType, Node.TEXT_NODE, 'i: ' + i);
      result.assertEQ(row.childNodes[0].length, 13, 'i: ' + i);
      result.assertEQ(row.childNodes[1].nodeName, 'SPAN', 'i: ' + i);
      result.assert(!!row.childNodes[1].style.color, 'i: ' + i);
      result.assert(!!row.childNodes[1].style.fontWeight == (i > 2), 'i: ' + i);
      result.assertEQ(
          row.childNodes[1].style.fontStyle, (i == 1 ? 'italic' : ''),
          'i: ' + i);
    }

    result.pass();
  });

hterm.VT.Tests.addTest('color-change-wc', function(result, cx) {
    this.terminal.io.print('[mplain....... [0;36m中\r\n' +
                           '[mitalic...... [3;36m中\r\n' +
                           '[mbright...... [0;96m中\r\n' +
                           '[mbold........ [1;36m中\r\n' +
                           '[mbold-bright. [1;96m中\r\n' +
                           '[mbright-bold. [96;1m中');

    var text = this.terminal.getRowsText(0, 6);
    result.assertEQ(text,
                    'plain....... \u4E2D\n' +
                    'italic...... \u4E2D\n' +
                    'bright...... \u4E2D\n' +
                    'bold........ \u4E2D\n' +
                    'bold-bright. \u4E2D\n' +
                    'bright-bold. \u4E2D');

    for (var i = 0; i < 6; i++) {
      var row = this.terminal.getRowNode(i);
      result.assertEQ(row.childNodes.length, 2, 'i: ' + i);
      result.assertEQ(row.childNodes[0].nodeType, Node.TEXT_NODE, 'i: ' + i);
      result.assertEQ(row.childNodes[0].length, 13, 'i: ' + i);
      result.assertEQ(row.childNodes[1].nodeName, 'SPAN', 'i: ' + i);
      result.assert(!!row.childNodes[1].style.color, 'i: ' + i);
      result.assert(!!row.childNodes[1].style.fontWeight == (i > 2), 'i: ' + i);
      result.assertEQ(
          row.childNodes[1].style.fontStyle, (i == 1 ? 'italic' : ''),
          'i: ' + i);
    }

    result.pass();
  });

hterm.VT.Tests.addTest('bold-as-bright', function(result, cx) {
    var attrs = this.terminal.primaryScreen_.textAttributes;
    var alt_attrs = this.terminal.alternateScreen_.textAttributes;
    attrs.enableBoldAsBright = true;
    alt_attrs.enableBoldAsBright = true;

    this.terminal.interpret('[mplain....... [0;36mHi\r\n' +
                            '[mbright...... [0;96mHi\r\n' +
                            '[mbold........ [1;36mHi\r\n' +
                            '[mbold-bright. [1;96mHi\r\n' +
                            '[mbright-bold. [96;1mHi');

    var text = this.terminal.getRowsText(0, 5);
    result.assertEQ(text,
                    'plain....... Hi\n' +
                    'bright...... Hi\n' +
                    'bold........ Hi\n' +
                    'bold-bright. Hi\n' +
                    'bright-bold. Hi');

    var fg = attrs.colorPalette[6];
    var fg_bright = attrs.colorPalette[14];

    var row_plain = this.terminal.getRowNode(0);
    result.assertEQ(row_plain.childNodes[1].style.color, fg,
                    'plain color');

    var row_bright = this.terminal.getRowNode(1);
    result.assertEQ(row_bright.childNodes[1].style.color, fg_bright,
                    'bright color');

    var row_bold = this.terminal.getRowNode(2);
    result.assertEQ(row_bold.childNodes[1].style.color, fg_bright,
                    'bold color');

    var row_bold_bright = this.terminal.getRowNode(3);
    result.assertEQ(row_bold_bright.childNodes[1].style.color, fg_bright,
                    'bold bright color');

    var row_bright_bold = this.terminal.getRowNode(4);
    result.assertEQ(row_bright_bold.childNodes[1].style.color, fg_bright,
                    'bright bold color');

    result.pass();
  });

hterm.VT.Tests.addTest('disable-bold-as-bright', function(result, cx) {
    var attrs = this.terminal.primaryScreen_.textAttributes;
    var alt_attrs = this.terminal.alternateScreen_.textAttributes;
    attrs.enableBoldAsBright = false;
    alt_attrs.enableBoldAsBright = false;

    this.terminal.interpret('[mplain....... [0;36mHi\r\n' +
                            '[mbright...... [0;96mHi\r\n' +
                            '[mbold........ [1;36mHi\r\n' +
                            '[mbold-bright. [1;96mHi\r\n' +
                            '[mbright-bold. [96;1mHi');

    var text = this.terminal.getRowsText(0, 5);
    result.assertEQ(text,
                    'plain....... Hi\n' +
                    'bright...... Hi\n' +
                    'bold........ Hi\n' +
                    'bold-bright. Hi\n' +
                    'bright-bold. Hi');

    var fg = attrs.colorPalette[6];
    var fg_bright = attrs.colorPalette[14];

    var row_plain = this.terminal.getRowNode(0);
    result.assertEQ(row_plain.childNodes[1].style.color, fg,
		    'plain color');

    var row_bright = this.terminal.getRowNode(1);
    result.assertEQ(row_bright.childNodes[1].style.color, fg_bright,
		    'bright color');

    var row_bold = this.terminal.getRowNode(2);
    result.assertEQ(row_bold.childNodes[1].style.color, fg,
		    'bold color');

    var row_bold_bright = this.terminal.getRowNode(3);
    result.assertEQ(row_bold_bright.childNodes[1].style.color, fg_bright,
		    'bold bright color');

    var row_bright_bold = this.terminal.getRowNode(4);
    result.assertEQ(row_bright_bold.childNodes[1].style.color, fg_bright,
		    'bright bold color');

    result.pass();
  });

/**
 * Test the status report command.
 */
hterm.VT.Tests.addTest('status-report', function(result, cx) {
    var resultString;
    terminal.io.sendString = function (str) { resultString = str };

    this.terminal.interpret('\x1b[5n');
    result.assertEQ(resultString, '\x1b0n');

    resultString = '';

    this.terminal.interpret('line one\r\nline two\r\nline three');
    // Reposition the cursor and ask for a position report.
    this.terminal.interpret('\x1b[5D\x1b[A\x1b[6n');
    result.assertEQ(resultString, '\x1b[2;6R');

    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text,
                    'line one\n' +
                    'line two\n' +
                    'line three');

    result.pass();
  });

/**
 * Test that various mode commands correctly change the state of the terminal.
 *
 * Most of these should have more in-depth testing below.
 */
hterm.VT.Tests.addTest('mode-bits', function(result, cx) {
    this.terminal.interpret('\x1b[?1h');
    result.assertEQ(this.terminal.keyboard.applicationCursor, true);

    this.terminal.interpret('\x1b[?1l');
    result.assertEQ(this.terminal.keyboard.applicationCursor, false);

    var fg = this.terminal.prefs_.get('foreground-color');
    var bg = this.terminal.prefs_.get('background-color');

    this.terminal.interpret('\x1b[?5h');
    result.assertEQ(this.terminal.scrollPort_.getForegroundColor(), bg);
    result.assertEQ(this.terminal.scrollPort_.getBackgroundColor(), fg);

    this.terminal.interpret('\x1b[?5l');
    result.assertEQ(this.terminal.scrollPort_.getForegroundColor(), fg);
    result.assertEQ(this.terminal.scrollPort_.getBackgroundColor(), bg);

    this.terminal.interpret('\x1b[?5l');
    result.assertEQ(this.terminal.scrollPort_.getForegroundColor(), fg);
    result.assertEQ(this.terminal.scrollPort_.getBackgroundColor(), bg);

    this.terminal.interpret('\x1b[?6h');
    result.assertEQ(this.terminal.options_.originMode, true);

    this.terminal.interpret('\x1b[?6l');
    result.assertEQ(this.terminal.options_.originMode, false);

    this.terminal.interpret('\x1b[4h');
    result.assertEQ(this.terminal.options_.insertMode, true);

    this.terminal.interpret('\x1b[4l');
    result.assertEQ(this.terminal.options_.insertMode, false);

    this.terminal.interpret('\x1b[?7h');
    result.assertEQ(this.terminal.options_.wraparound, true);

    this.terminal.interpret('\x1b[?7l');
    result.assertEQ(this.terminal.options_.wraparound, false);

    // DEC mode 12 is disabled by default.
    this.terminal.vt.enableDec12 = true;

    this.terminal.interpret('\x1b[?12h');
    result.assertEQ(this.terminal.options_.cursorBlink, true);
    result.assert('cursorBlink' in this.terminal.timeouts_);

    this.terminal.interpret('\x1b[?12l');
    result.assertEQ(this.terminal.options_.cursorBlink, false);
    result.assert(!('cursorBlink' in this.terminal.timeouts_));

    // Make sure that enableDec12 is respected.
    this.terminal.vt.enableDec12 = false;

    this.terminal.interpret('\x1b[?12h');
    result.assertEQ(this.terminal.options_.cursorBlink, false);
    result.assert(!('cursorBlink' in this.terminal.timeouts_));

    this.terminal.interpret('\x1b[?25l');
    result.assertEQ(this.terminal.options_.cursorVisible, false);
    result.assertEQ(this.terminal.cursorNode_.style.opacity, '0');

    this.terminal.interpret('\x1b[?25h');
    result.assertEQ(this.terminal.options_.cursorVisible, true);

    // Turn off blink so we know the cursor should be on.
    this.terminal.interpret('\x1b[?12l');
    result.assertEQ(this.terminal.cursorNode_.style.opacity, '1');

    this.terminal.interpret('\x1b[?45h');
    result.assertEQ(this.terminal.options_.reverseWraparound, true);

    this.terminal.interpret('\x1b[?45l');
    result.assertEQ(this.terminal.options_.reverseWraparound, false);

    this.terminal.interpret('\x1b[?67h');
    result.assertEQ(this.terminal.keyboard.backspaceSendsBackspace, true);

    this.terminal.interpret('\x1b[?67l');
    result.assertEQ(this.terminal.keyboard.backspaceSendsBackspace, false);

    this.terminal.interpret('\x1b[?1004h]');
    result.assertEQ(this.terminal.reportFocus, true);

    this.terminal.interpret('\x1b[?1004l]');
    result.assertEQ(this.terminal.reportFocus, false);

    this.terminal.interpret('\x1b[?1036h');
    result.assertEQ(this.terminal.keyboard.metaSendsEscape, true);

    this.terminal.interpret('\x1b[?1036l');
    result.assertEQ(this.terminal.keyboard.metaSendsEscape, false);

    // Save the altSendsWhat setting and change the current setting to something
    // other than 'escape'.
    var previousAltSendsWhat = this.terminal.keyboard.altSendsWhat;
    this.terminal.keyboard.altSendsWhat = '8-bit';

    this.terminal.interpret('\x1b[?1039h');
    result.assertEQ(this.terminal.keyboard.altSendsWhat, 'escape');

    this.terminal.interpret('\x1b[?1039l');
    result.assertEQ(this.terminal.keyboard.altSendsWhat, '8-bit');

    // Restore the previous altSendsWhat setting.
    this.terminal.keyboard.altSendsWhat = previousAltSendsWhat;

    result.assertEQ(this.terminal.screen_,
                    this.terminal.primaryScreen_);

    this.terminal.interpret('\x1b[?1049h');
    result.assertEQ(this.terminal.screen_,
                    this.terminal.alternateScreen_);

    this.terminal.interpret('\x1b[?1049l');
    result.assertEQ(this.terminal.screen_,
                    this.terminal.primaryScreen_);

    result.pass();
  });

/**
 * Check parseInt behavior.
 */
hterm.VT.Tests.addTest('parsestate-parseint', function(result, cx) {
  const parserState = new hterm.VT.ParseState();

  // Check default arg handling.
  result.assertEQ(0, parserState.parseInt(''));
  result.assertEQ(0, parserState.parseInt('', 0));
  result.assertEQ(1, parserState.parseInt('', 1));

  // Check default arg handling when explicitly zero.
  result.assertEQ(0, parserState.parseInt('0'));
  result.assertEQ(0, parserState.parseInt('0', 0));
  result.assertEQ(1, parserState.parseInt('0', 1));

  // Check non-default args.
  result.assertEQ(5, parserState.parseInt('5'));
  result.assertEQ(5, parserState.parseInt('5', 0));
  result.assertEQ(5, parserState.parseInt('5', 1));

  result.pass();
});

/**
 * Check iarg handling.
 */
hterm.VT.Tests.addTest('parsestate-iarg', function(result, cx) {
  const parserState = new hterm.VT.ParseState();

  // Check unset args.
  result.assertEQ(0, parserState.iarg(10));
  result.assertEQ(1, parserState.iarg(10, 1));

  // Check set args.
  parserState.args = [0, 5];
  result.assertEQ(0, parserState.iarg(10));
  result.assertEQ(1, parserState.iarg(10, 1));
  result.assertEQ(0, parserState.iarg(0));
  result.assertEQ(1, parserState.iarg(0, 1));
  result.assertEQ(5, parserState.iarg(1));
  result.assertEQ(5, parserState.iarg(1, 1));

  result.pass();
});

/**
 * Check handling of subargs.
 */
hterm.VT.Tests.addTest('parsestate-subargs', function(result, cx) {
  const parserState = new hterm.VT.ParseState();

  // Check initial/null state.
  result.assert(!parserState.argHasSubargs(0));
  result.assert(!parserState.argHasSubargs(1000));

  // Mark one arg as having subargs.
  parserState.argSetSubargs(1);
  result.assert(!parserState.argHasSubargs(0));
  result.assert(parserState.argHasSubargs(1));

  result.pass();
});

/**
 * Check handling of extended ISO 8613-6 colors.
 */
hterm.VT.Tests.addTest('sgr-extended-colors-parser', function(result, cx) {
  const parserState = new hterm.VT.ParseState();
  const ta = this.terminal.getTextAttributes();

  [
    // Fully semi-colon separated args.
    [0, '38;2;10;20;30', 4, 'rgb(10, 20, 30)'],
    [1, '4;38;2;10;20;30', 4, 'rgb(10, 20, 30)'],
    [0, '38;5;1', 2, 1],
    [1, '4;38;5;1', 2, 1],
    // Fully colon delimited, but legacy xterm form.
    [0, '38:2:10:20:30', 0, 'rgb(10, 20, 30)'],
    [1, '4;38:2:10:20:30', 0, 'rgb(10, 20, 30)'],
    // Fully colon delimited matching ISO 8613-6.
    [0, '38:0', 0, undefined],
    [0, '38:1', 0, 'rgba(0, 0, 0, 0)'],
    [0, '38:2::10:20:30', 0, 'rgb(10, 20, 30)'],
    [0, '38:2::10:20:30:', 0, 'rgb(10, 20, 30)'],
    [0, '38:2::10:20:30::', 0, 'rgb(10, 20, 30)'],
    // TODO: Add CMY & CMYK forms when we support them.
    [0, '38:5:1', 0, 1],
    [1, '4;38:5:1', 0, 1],
    // Reject the xterm form that mixes semi-colons & colons.
    [0, '38;2:10:20:30', 0, undefined],
    [0, '38;5:1', 0, undefined],
    // Reject too short forms.
    [0, '38;2', 0, undefined],
    [0, '38;2;10', 0, undefined],
    [0, '38;2;10;20', 0, undefined],
    [0, '38:2', 0, undefined],
    [0, '38:2:10', 0, undefined],
    [0, '38:2:10:20', 0, undefined],
    [0, '38:3::10:20', 0, undefined],
    [0, '38:4::10:20:30', 0, undefined],
    [0, '38:5', 0, undefined],
    // Reject non-true color & palete color forms -- require ISO 8613-6.
    [0, '38;0', 0, undefined],
    [0, '38;1', 0, undefined],
    [0, '38;3;10;20;30', 0, undefined],
    [0, '38;4;10;20;30;40', 0, undefined],
    // Reject out of range color number.
    [0, '38:5:100000', 0, undefined],
  ].forEach(([i, input, expSkipCount, expColor]) => {
    // Set up the parser state from the inputs.
    const args = input.split(';');
    parserState.args = args;
    parserState.subargs = {};
    for (let i = 0; i < args.length; ++i)
      parserState.subargs[i] = args[i].includes(':');

    const ret = this.terminal.vt.parseSgrExtendedColors(parserState, i, ta);
    result.assertEQ(expSkipCount, ret.skipCount, input);
    result.assertEQ(expColor, ret.color, input);
  });

  result.pass();
});

/**
 * Test setting of true color mode in colon delimited formats.
 *
 * This also indirectly checks chaining SGR behavior.
 */
hterm.VT.Tests.addTest('true-color-colon', function(result, cx) {
  let text;
  let style;
  const ta = this.terminal.getTextAttributes();

  // Check fully semi-colon delimited: 38;2;R;G;Bm
  this.terminal.interpret('\x1b[38;2;110;120;130;48;2;10;20;30;4mHI1');
  result.assertEQ('solid', ta.underline);
  style = this.terminal.getRowNode(0).childNodes[0].style;
  result.assertEQ('rgb(110, 120, 130)', style.color);
  result.assertEQ('rgb(10, 20, 30)', style.backgroundColor);
  text = this.terminal.getRowText(0);
  result.assertEQ('HI1', text);

  this.terminal.reset();
  this.terminal.clearHome();

  // Check fully colon delimited (xterm-specific): 38:2:R:G:Bm
  this.terminal.interpret('\x1b[38:2:170:180:190;48:2:70:80:90;4mHI2');
  result.assertEQ('solid', ta.underline);
  style = this.terminal.getRowNode(0).childNodes[0].style;
  result.assertEQ('rgb(170, 180, 190)', style.color);
  result.assertEQ('rgb(70, 80, 90)', style.backgroundColor);
  text = this.terminal.getRowText(0);
  result.assertEQ('HI2', text);

  this.terminal.reset();
  this.terminal.clearHome();

  // Check fully colon delimited (ISO 8613-6): 38:2::R:G:Bm
  this.terminal.interpret('\x1b[38:2::171:181:191;48:2::71:81:91;4mHI3');
  result.assertEQ('solid', ta.underline);
  style = this.terminal.getRowNode(0).childNodes[0].style;
  result.assertEQ('rgb(171, 181, 191)', style.color);
  result.assertEQ('rgb(71, 81, 91)', style.backgroundColor);
  text = this.terminal.getRowText(0);
  result.assertEQ('HI3', text);

  this.terminal.reset();
  this.terminal.clearHome();

  // Check fully colon delimited w/extra args (ISO 8613-6): 38:2::R:G:B::m
  this.terminal.interpret('\x1b[38:2::172:182:192::;48:2::72:82:92::;4mHI4');
  result.assertEQ('solid', ta.underline);
  style = this.terminal.getRowNode(0).childNodes[0].style;
  result.assertEQ('rgb(172, 182, 192)', style.color);
  result.assertEQ('rgb(72, 82, 92)', style.backgroundColor);
  text = this.terminal.getRowText(0);
  result.assertEQ('HI4', text);

  this.terminal.reset();
  this.terminal.clearHome();

  // Check fully colon delimited w/too few args (ISO 8613-6): 38:2::R
  this.terminal.interpret('\x1b[38:2::33;48:2::44;4mHI5');
  result.assertEQ('solid', ta.underline);
  style = this.terminal.getRowNode(0).childNodes[0].style;
  result.assertEQ('', style.color);
  result.assertEQ('', style.backgroundColor);
  text = this.terminal.getRowText(0);
  result.assertEQ('HI5', text);

  result.pass();
});

/**
 * Test setting of 256 color mode in colon delimited formats.
 */
hterm.VT.Tests.addTest('256-color-colon', function(result, cx) {
  let text;
  let style;
  const ta = this.terminal.getTextAttributes();

  // Check fully semi-colon delimited: 38;5;Pm
  this.terminal.interpret('\x1b[38;5;10;48;5;20;4mHI1');
  result.assertEQ('solid', ta.underline);
  style = this.terminal.getRowNode(0).childNodes[0].style;
  result.assertEQ('rgb(0, 186, 19)', style.color);
  result.assertEQ('rgb(0, 0, 215)', style.backgroundColor);
  text = this.terminal.getRowText(0);
  result.assertEQ('HI1', text);

  this.terminal.reset();
  this.terminal.clearHome();

  // Check fully colon delimited: 38:5:Pm
  this.terminal.interpret('\x1b[38:5:50;48:5:60;4mHI2');
  result.assertEQ('solid', ta.underline);
  style = this.terminal.getRowNode(0).childNodes[0].style;
  result.assertEQ('rgb(0, 255, 215)', style.color);
  result.assertEQ('rgb(95, 95, 135)', style.backgroundColor);
  text = this.terminal.getRowText(0);
  result.assertEQ('HI2', text);

  result.pass();
});

/**
 * Test setting of true color mode on text
 */
hterm.VT.Tests.addTest('true-color-mode', function(result, cx) {
    function getEscape(row, fg) {
      return  '\x1b[' + (fg == true ? 38 : 48) + ';2;' + row[1] + ';' +
              row[2] + ';' + row[3] + 'm';
    }

    function getRGB(row) {
      return 'rgb(' + row[1] + ', ' + row[2] + ', ' + row[3] + ')';
    }

    this.terminal.setWidth(80);

    var colors =  [['Aero', 124, 185, 232],
                   ['Amber', 255, 191, 0],
                   ['Bitter Lime', 191, 255, 0],
                   ['Coffee', 111, 78, 55],
                   ['Electric Crimson', 255, 0, 63],
                   ['French Rose', 246, 74, 138]];

    for (var i = 0; i < 6; i++) {
      var fg = getRGB(colors[i]);
      for (var j = 0; j < 6; j++ ) {
        this.terminal.interpret('[mTrue Color Test ' +
                                getEscape(colors[i],true) +
                                getEscape(colors[j],false) + colors[i][0] +
                                ' and ' + colors[j][0] + '\r\n');

        var text = this.terminal.getRowText(6*i+j,1);
        result.assertEQ(text, 'True Color Test ' + colors[i][0] + ' and ' +
                        colors[j][0]);

        var bg = getRGB(colors[j]);
        var style = this.terminal.getRowNode(6*i+j).childNodes[1].style;
        result.assertEQ(style.color,fg);
        result.assertEQ(style.backgroundColor,bg);
      }
    }

    result.pass();
  });

/**
 * Check chained SGR sequences.
 */
hterm.VT.Tests.addTest('chained-sgr', function(result, cx) {
  let text;
  let style;
  const ta = this.terminal.getTextAttributes();

  // Check true color parsing.
  this.terminal.interpret('\x1b[' +
                          // Reset everything.
                          '0;' +
                          // Enable bold.
                          '1;' +
                          // Set foreground via true color.
                          '38;2;11;22;33;' +
                          // Enable italic.
                          '3;' +
                          // Set background via true color.
                          '48;2;33;22;11;' +
                          // Enable underline.
                          '4' +
                          'mHI1');
  result.assertEQ(true, ta.bold);
  result.assertEQ(true, ta.italic);
  result.assertEQ('solid', ta.underline);
  result.assertEQ(false, ta.faint);
  result.assertEQ(false, ta.strikethrough);
  style = this.terminal.getRowNode(0).childNodes[0].style;
  result.assertEQ('rgb(11, 22, 33)', style.color);
  result.assertEQ('rgb(33, 22, 11)', style.backgroundColor);
  text = this.terminal.getRowText(0);
  result.assertEQ('HI1', text);

  this.terminal.reset();
  this.terminal.clearHome();
  result.assertEQ(false, ta.bold);
  result.assertEQ(false, ta.italic);
  result.assertEQ(false, ta.underline);
  result.assertEQ(false, ta.faint);
  result.assertEQ(false, ta.strikethrough);

  // Check 256 color parsing.
  this.terminal.interpret('\x1b[' +
                          // Reset everything.
                          '0;' +
                          // Enable bold.
                          '1;' +
                          // Set foreground via true color.
                          '38;5;11;' +
                          // Enable italic.
                          '3;' +
                          // Set background via true color.
                          '48;5;22;' +
                          // Enable underline.
                          '4' +
                          'mHI2');
  result.assertEQ(true, ta.bold);
  result.assertEQ(true, ta.italic);
  result.assertEQ('solid', ta.underline);
  result.assertEQ(false, ta.faint);
  result.assertEQ(false, ta.strikethrough);
  style = this.terminal.getRowNode(0).childNodes[0].style;
  result.assertEQ('rgb(252, 233, 79)', style.color);
  result.assertEQ('rgb(0, 95, 0)', style.backgroundColor);
  text = this.terminal.getRowText(0);
  result.assertEQ('HI2', text);

  result.pass();
});

/**
 * Check various underline modes.
 */
hterm.VT.Tests.addTest('underline-sgr', function(result, cx) {
  const ta = this.terminal.getTextAttributes();

  // Default mode 4: plain underline.
  this.terminal.interpret('\x1b[0;4m');
  result.assertEQ('solid', ta.underline);

  // 0 subarg turns it off.
  this.terminal.interpret('\x1b[0;4:0m');
  result.assertEQ(false, ta.underline);

  // 1 subarg is a single underline.
  this.terminal.interpret('\x1b[0;4:1m');
  result.assertEQ('solid', ta.underline);

  // 2 subarg is double underline.
  this.terminal.interpret('\x1b[0;4:2m');
  result.assertEQ('double', ta.underline);

  // 3 subarg is wavy underline.
  this.terminal.interpret('\x1b[0;4:3m');
  result.assertEQ('wavy', ta.underline);

  // 4 subarg is dotted underline.
  this.terminal.interpret('\x1b[0;4:4m');
  result.assertEQ('dotted', ta.underline);

  // 5 subarg is dashed underline.
  this.terminal.interpret('\x1b[0;4:5m');
  result.assertEQ('dashed', ta.underline);

  // 6 subarg is unknown -> none.
  this.terminal.interpret('\x1b[0;4:6m');
  result.assertEQ(false, ta.underline);

  // Check coloring (lightly as SGR 38/48 tests cover it).
  this.terminal.interpret('\x1b[0;4;58:2:10:20:30m');
  result.assertEQ('solid', ta.underline);
  result.assertEQ('rgb(10, 20, 30)', ta.underlineSource);

  // Check reset behavior.
  this.terminal.interpret('\x1b[0m');
  result.assertEQ(false, ta.underline);
  result.assertEQ(ta.SRC_DEFAULT, ta.underlineSource);

  result.pass();
});

/**
 * TODO(rginda): Test origin mode.
 */
hterm.VT.Tests.disableTest('origin-mode', function(result, cx) {
  });

/**
 * Test insert/overwrite mode.
 */
hterm.VT.Tests.addTest('insert-mode', function(result, cx) {
    // Should be off by default.
    result.assertEQ(this.terminal.options_.insertMode, false);

    this.terminal.interpret('\x1b[4h');
    this.terminal.interpret(' one\x1b[4Dline\r\n');

    this.terminal.interpret('\x1b[4l');
    this.terminal.interpret('XXXXXXXX\x1b[8Dline two\r\n');

    this.terminal.interpret('\x1b[4h');
    this.terminal.interpret(' three\x1b[6Dline');

    var text = this.terminal.getRowsText(0, 3);
    result.assertEQ(text,
                    'line one\n' +
                    'line two\n' +
                    'line three');

    result.pass();
  });

/**
 * Test wraparound mode.
 */
hterm.VT.Tests.addTest('wraparound-mode-on', function(result, cx) {
    // Should be on by default.
    result.assertEQ(this.terminal.options_.wraparound, true);

    this.terminal.interpret('-----  1  ----a');
    this.terminal.interpret('-----  2  ----b');
    this.terminal.interpret('-----  3  ----c');
    this.terminal.interpret('-----  4  ----d');
    this.terminal.interpret('-----  5  ----e');
    this.terminal.interpret('-----  6  ----f');

    var text = this.terminal.getRowsText(0, 6);
    result.assertEQ(text,
                    '-----  1  ----a' +
                    '-----  2  ----b' +
                    '-----  3  ----c' +
                    '-----  4  ----d' +
                    '-----  5  ----e' +
                    '-----  6  ----f');

    result.assertEQ(this.terminal.getCursorRow(), 5);
    result.assertEQ(this.terminal.getCursorColumn(), 14);

    result.pass();
  });

hterm.VT.Tests.addTest('wraparound-mode-off', function(result, cx) {
    this.terminal.interpret('\x1b[?7l');
    result.assertEQ(this.terminal.options_.wraparound, false);

    this.terminal.interpret('-----  1  ----a');
    this.terminal.interpret('-----  2  ----b');
    this.terminal.interpret('-----  3  ----c');
    this.terminal.interpret('-----  4  ----d');
    this.terminal.interpret('-----  5  ----e');
    this.terminal.interpret('-----  6  ----f');

    var text = this.terminal.getRowsText(0, 6);
    result.assertEQ(text,
                    '-----  1  ----f\n' +
                    '\n' +
                    '\n' +
                    '\n' +
                    '\n' +
                    '');

    result.assertEQ(this.terminal.getCursorRow(), 0);
    result.assertEQ(this.terminal.getCursorColumn(), 14);

    result.pass();
  });

/**
 * Test the interactions between insert and wraparound modes.
 */
hterm.VT.Tests.addTest('insert-wrap', function(result, cx) {
    // Should be on by default.
    result.assertEQ(this.terminal.options_.wraparound, true);

    this.terminal.interpret('' + // Insert off, wrap on (default).
                            '[15GAAAA[1GXX\r\n' +
                            '[4h[?7l' +  // Insert on, wrap off.
                            '[15GAAAA[1GXX\r\n' +
                            '[4h[?7h' +  // Insert on, wrap on.
                            '[15GAAAA[1GXX\r\n' +
                            '[4l[?7l' +  // Insert off, wrap off.
                            '[15GAAAA[1GXX');

    result.assertEQ(this.terminal.getRowText(0), '              A');
    result.assertEQ(this.terminal.getRowText(1), 'XXA');
    result.assertEQ(this.terminal.getRowText(2), 'XX             ');
    result.assertEQ(this.terminal.getRowText(3), '              A');
    result.assertEQ(this.terminal.getRowText(4), 'XXAAA');
    result.assertEQ(this.terminal.getRowText(5), 'XX            A');

    result.pass();
  });

/**
 * Test a line that is long enough to need to be wrapped more than once.
 */
hterm.VT.Tests.addTest('long-wrap', function(result, cx) {
    var str = '';
    for (var i = 0; i < this.visibleColumnCount * 3; i++)
      str += 'X';

    this.terminal.interpret(str);

    result.assertEQ(this.terminal.getRowText(0), 'XXXXXXXXXXXXXXX');
    result.assertEQ(this.terminal.getRowText(1), 'XXXXXXXXXXXXXXX');
    result.assertEQ(this.terminal.getRowText(2), 'XXXXXXXXXXXXXXX');

    result.pass();
  });

/**
 * Test reverse wraparound.
 */
hterm.VT.Tests.addTest('reverse-wrap', function(result, cx) {
    // A line ending with a hard CRLF.
    var str = 'AAAA\r\n';

    // Enough X's to wrap once and leave the cursor in the overflow state at
    // the end of the third row.
    for (var i = 0; i < this.visibleColumnCount * 2; i++)
      str += 'X';

    // CR to put us at col 0, backspace to put us at the last column of the
    // previous row, if reverse wraparound is enabled.
    str += '\r\bBB';

    // Without reverse wraparound, we should get stuck at column 0 of the third
    // row.
    this.terminal.interpret(str);

    result.assertEQ(this.terminal.getRowText(0), 'AAAA');
    result.assertEQ(this.terminal.getRowText(1), 'XXXXXXXXXXXXXXX');
    result.assertEQ(this.terminal.getRowText(2), 'BBXXXXXXXXXXXXX');

    // With reverse wraparound, we'll back up to the previous row.
    this.terminal.clearHome();
    this.terminal.interpret('\x1b[?45h' + str);

    result.assertEQ(this.terminal.getRowText(0), 'AAAA');
    result.assertEQ(this.terminal.getRowText(1), 'XXXXXXXXXXXXXXB');
    result.assertEQ(this.terminal.getRowText(2), 'BXXXXXXXXXXXXXX');

    // Reverse wrapping should always go the the final column of the previous
    // row, even if that row was not full of text.
    this.terminal.interpret('\r\b\r\bCC');

    result.assertEQ(this.terminal.getRowText(0), 'AAAA          C');
    result.assertEQ(this.terminal.getRowText(1), 'CXXXXXXXXXXXXXB');
    result.assertEQ(this.terminal.getRowText(2), 'BXXXXXXXXXXXXXX');

    // Reverse wrapping past the first row should put us at the last row.
    this.terminal.interpret('\r\b\r\bX');
    result.assertEQ(this.terminal.getRowText(0), 'AAAA          C');
    result.assertEQ(this.terminal.getRowText(1), 'CXXXXXXXXXXXXXB');
    result.assertEQ(this.terminal.getRowText(2), 'BXXXXXXXXXXXXXX');
    result.assertEQ(this.terminal.getRowText(3), '');
    result.assertEQ(this.terminal.getRowText(4), '');
    result.assertEQ(this.terminal.getRowText(5), '              X');

    result.pass();
  });

/**
 * Test interactions between the cursor overflow bit and various
 * escape sequences.
 */
hterm.VT.Tests.addTest('cursor-overflow', function(result, cx) {
    // Should be on by default.
    result.assertEQ(this.terminal.options_.wraparound, true);

    // Fill a row with the last hyphen wrong, then run a command that
    // modifies the screen, then add a hyphen. The wrap bit should be
    // cleared, so the extra hyphen can fix the row.

    // We expect the EL in the presence of cursor overflow to be ignored.
    // See hterm.Terminal.prototype.eraseToRight.
    this.terminal.interpret('-----  1  ----X');
    this.terminal.interpret('\x1b[K-');  // EL

    this.terminal.interpret('----  2  ----X');
    this.terminal.interpret('\x1b[J-');  // ED

    this.terminal.interpret('-----  3  ----X');
    this.terminal.interpret('\x1b[@-');  // ICH

    this.terminal.interpret('-----  4  ----X');
    this.terminal.interpret('\x1b[P-');  // DCH

    // ECH is also ignored in the presence of cursor overflow.
    this.terminal.interpret('-----  5  ----X');
    this.terminal.interpret('\x1b[X-');  // ECH

    // DL will delete the entire line but clear the wrap bit, so we
    // expect a hyphen at the end and nothing else.
    this.terminal.interpret('XXXXXXXXXXXXXX');
    this.terminal.interpret('\x1b[M-');  // DL

    var text = this.terminal.getRowsText(0, 6);
    result.assertEQ(text,
                    '-----  1  ----X' +
                    '-----  2  -----' +
                    '-----  3  -----' +
                    '-----  4  -----' +
                    '-----  5  ----X' +
                    '              -');

    result.assertEQ(this.terminal.getCursorRow(), 5);
    result.assertEQ(this.terminal.getCursorColumn(), 14);

    result.pass();
  });

hterm.VT.Tests.addTest('alternate-screen', function(result, cx) {
    this.terminal.interpret('1\r\n2\r\n3\r\n4\r\n5\r\n6\r\n7\r\n8\r\n9\r\n10');
    this.terminal.interpret('\x1b[3;3f');  // Leave the cursor at (3,3)
    var text = this.terminal.getRowsText(0, 10);
    result.assertEQ(text, '1\n2\n3\n4\n5\n6\n7\n8\n9\n10');

    // Switch to alternate screen.
    this.terminal.interpret('\x1b[?1049h');
    text = this.terminal.getRowsText(0, 10);
    result.assertEQ(text, '1\n2\n3\n4\n\n\n\n\n\n');

    this.terminal.interpret('\r\nhi');
    text = this.terminal.getRowsText(0, 10);
    result.assertEQ(text, '1\n2\n3\n4\n\n\n\nhi\n\n');

    // Switch back to primary screen.
    this.terminal.interpret('\x1b[?1049l');
    text = this.terminal.getRowsText(0, 10);
    result.assertEQ(text, '1\n2\n3\n4\n5\n6\n7\n8\n9\n10');

    this.terminal.interpret('XX');
    text = this.terminal.getRowsText(0, 10);
    result.assertEQ(text, '1\n2\n3\n4\n5\n6\n7 XX\n8\n9\n10');

    // And back to alternate screen.
    this.terminal.interpret('\x1b[?1049h');
    text = this.terminal.getRowsText(0, 10);
    result.assertEQ(text, '1\n2\n3\n4\n\n\n\n\n\n');

    this.terminal.interpret('XX');
    text = this.terminal.getRowsText(0, 10);
    result.assertEQ(text, '1\n2\n3\n4\n\n\n    XX\n\n\n');

    result.pass();
  });

/**
 * Test basic hyperlinks.
 */
hterm.VT.Tests.addTest('OSC-8', function(result, cx) {
  const tattrs = this.terminal.getTextAttributes();

  // Start with links off.
  result.assertEQ(null, tattrs.uriId);
  result.assertEQ(null, tattrs.uri);

  // Start to linkify some text.
  this.terminal.interpret('\x1b]8;id=foo;http://foo\x07');
  result.assertEQ('foo', tattrs.uriId);
  result.assertEQ('http://foo', tattrs.uri);

  // Add the actual text.
  this.terminal.interpret('click me');

  // Stop the link.
  this.terminal.interpret('\x1b]8;\x07');
  result.assertEQ(null, tattrs.uriId);
  result.assertEQ(null, tattrs.uri);

  // Check the link.
  // XXX: Can't check the URI target due to binding via event listener.
  const row = this.terminal.getRowNode(0);
  const span = row.childNodes[0];
  result.assertEQ('foo', span.uriId);
  result.assertEQ('click me', span.textContent);
  result.assertEQ('uri-node', span.className);

  result.pass();
});

/**
 * Test hyperlinks with blank ids.
 */
hterm.VT.Tests.addTest('OSC-8-blank-id', function(result, cx) {
  const tattrs = this.terminal.getTextAttributes();

  // Create a link with a blank id.
  this.terminal.interpret('\x1b]8;;http://foo\x07click\x1b]8;\x07');
  result.assertEQ(null, tattrs.uriId);
  result.assertEQ(null, tattrs.uri);

  // Check the link.
  // XXX: Can't check the URI target due to binding via event listener.
  const row = this.terminal.getRowNode(0);
  const span = row.childNodes[0];
  result.assertEQ('', span.uriId);
  result.assertEQ('click', span.textContent);
  result.assertEQ('uri-node', span.className);

  result.pass();
});

/**
 * Test changing hyperlinks midstream.
 */
hterm.VT.Tests.addTest('OSC-8-switch-uri', function(result, cx) {
  const tattrs = this.terminal.getTextAttributes();

  // Create a link then change it.
  this.terminal.interpret(
      '\x1b]8;id=foo;http://foo\x07click\x1b]8;;http://bar\x07bat\x1b]8;\x07');
  result.assertEQ(null, tattrs.uriId);
  result.assertEQ(null, tattrs.uri);

  // Check the links.
  // XXX: Can't check the URI target due to binding via event listener.
  const row = this.terminal.getRowNode(0);
  let span = row.childNodes[0];
  result.assertEQ('foo', span.uriId);
  result.assertEQ('click', span.textContent);
  result.assertEQ('uri-node', span.className);

  span = row.childNodes[1];
  result.assertEQ('', span.uriId);
  result.assertEQ('bat', span.textContent);
  result.assertEQ('uri-node', span.className);

  result.pass();
});

/**
 * Test iTerm2 growl notifications.
 */
hterm.VT.Tests.addTest('OSC-9', function(result, cx) {
    result.assertEQ(0, Notification.count);

    // We don't test the title as it's generated, and the iTerm2 API doesn't
    // support changing it.

    // An empty notification.
    this.terminal.interpret('\x1b]9;\x07');
    result.assertEQ(1, Notification.count);
    result.assertEQ('', Notification.call.body);

    // A random notification.
    this.terminal.interpret('\x1b]9;this is a title\x07');
    result.assertEQ(2, Notification.count);
    result.assertEQ('this is a title', Notification.call.body);

    result.pass();
  });

/**
 * Verify setting text foreground color.
 */
hterm.VT.Tests.addTest('OSC-10', function(result, cx) {
    // Make sure other colors aren't changed by accident.
    const backColor = this.terminal.getBackgroundColor();
    const cursorColor = this.terminal.getCursorColor();

    this.terminal.interpret('\x1b]10;red\x07');
    result.assertEQ('rgb(255, 0, 0)', this.terminal.getForegroundColor());

    this.terminal.interpret('\x1b]10;white\x07');
    result.assertEQ('rgb(255, 255, 255)', this.terminal.getForegroundColor());

    // Make sure other colors aren't changed by accident.
    result.assertEQ(backColor, this.terminal.getBackgroundColor());
    result.assertEQ(cursorColor, this.terminal.getCursorColor());

    result.pass();
  });

/**
 * Verify setting text background color.
 */
hterm.VT.Tests.addTest('OSC-11', function(result, cx) {
    // Make sure other colors aren't changed by accident.
    const foreColor = this.terminal.getForegroundColor();
    const cursorColor = this.terminal.getCursorColor();

    this.terminal.interpret('\x1b]11;red\x07');
    result.assertEQ('rgb(255, 0, 0)', this.terminal.getBackgroundColor());

    this.terminal.interpret('\x1b]11;white\x07');
    result.assertEQ('rgb(255, 255, 255)', this.terminal.getBackgroundColor());

    // Make sure other colors aren't changed by accident.
    result.assertEQ(foreColor, this.terminal.getForegroundColor());
    result.assertEQ(cursorColor, this.terminal.getCursorColor());

    result.pass();
  });

/**
 * Verify setting text cursor color (not the mouse cursor).
 */
hterm.VT.Tests.addTest('OSC-12', function(result, cx) {
    // Make sure other colors aren't changed by accident.
    const foreColor = this.terminal.getForegroundColor();
    const backColor = this.terminal.getBackgroundColor();

    this.terminal.interpret('\x1b]12;red\x07');
    result.assertEQ('rgb(255, 0, 0)', this.terminal.getCursorColor());

    this.terminal.interpret('\x1b]12;white\x07');
    result.assertEQ('rgb(255, 255, 255)', this.terminal.getCursorColor());

    // Make sure other colors aren't changed by accident.
    result.assertEQ(foreColor, this.terminal.getForegroundColor());
    result.assertEQ(backColor, this.terminal.getBackgroundColor());

    result.pass();
  });

/**
 * Verify chaining color change requests.
 */
hterm.VT.Tests.addTest('OSC-10-11-12', function(result, cx) {
    // Set 10-11-12 at once.
    this.terminal.interpret('\x1b]10;red;green;blue\x07');
    result.assertEQ('rgb(255, 0, 0)', this.terminal.getForegroundColor());
    result.assertEQ('rgb(0, 255, 0)', this.terminal.getBackgroundColor());
    result.assertEQ('rgb(0, 0, 255)', this.terminal.getCursorColor());

    // Set 11-12 at once (and 10 stays the same).
    this.terminal.interpret('\x1b]11;white;black\x07');
    result.assertEQ('rgb(255, 0, 0)', this.terminal.getForegroundColor());
    result.assertEQ('rgb(255, 255, 255)', this.terminal.getBackgroundColor());
    result.assertEQ('rgb(0, 0, 0)', this.terminal.getCursorColor());

    result.pass();
  });

/**
 * Test that we can use OSC 52 to copy to the system clipboard.
 */
hterm.VT.Tests.addTest('OSC-52', function(result, cx) {
    // Mock this out since we can't document.execCommand from the
    // test harness.
    var old_cCSTC = hterm.copySelectionToClipboard;
    hterm.copySelectionToClipboard = function(document) {
      var s = document.getSelection();
      result.assertEQ(s.anchorNode.textContent, 'copypasta!');
      hterm.copySelectionToClipboard = old_cCSTC;
      result.pass();
    };

    this.terminal.interpret('\x1b]52;c;Y29weXBhc3RhIQ==\x07');
    result.requestTime(200);
  });

/**
 * Test that OSC 52 works when large strings are split across multiple interpret
 * calls.
 */
hterm.VT.Tests.addTest('OSC-52-big', function(result, cx) {
    // Mock this out since we can't document.execCommand from the
    // test harness.
    var old_cCSTC = hterm.copySelectionToClipboard;
    hterm.copySelectionToClipboard = function(document) {
      var s = document.getSelection();
      result.assertEQ(s.anchorNode.textContent, expect);
      hterm.copySelectionToClipboard = old_cCSTC;
      result.pass();
    };

    var expect = '';
    for (var i = 0; i < 996; i++) {
      expect += 'x';
    }

    var encode = '';
    for (var i = 0; i < expect.length / 6; i++) {
      encode += 'eHh4';
    }

    this.terminal.interpret('\x1b]52;c;');
    this.terminal.interpret(encode);
    this.terminal.interpret(encode);
    this.terminal.interpret('\x07');
    result.requestTime(200);
  });

hterm.VT.Tests.addTest('OSC-4', function(result, cx) {
    var resultString;

    this.terminal.io.sendString = function(str) { resultString = str };
    // Change the terminal palette, then read it back.
    this.terminal.interpret('\x1b]4;1;rgb:0100/0100/0100;' +
                            '2;rgb:beef/beef/beef\x07');
    this.terminal.interpret('\x1b]4;1;?;2;?\x07');
    // The values go through some normalization, so what we read isn't
    // *exactly* what went in.
    result.assertEQ(resultString, '\x1b]4;1;rgb:0101/0101/0101;' +
                    '2;rgb:bebe/bebe/bebe\x07');

    // Round trip the normalized values, to check that the normalization is
    // idempotent.
    this.terminal.interpret('\x1b]4;1;rgb:0101/0101/0101;2;' +
                            'rgb:bebe/bebe/bebe\x07');
    result.assertEQ(resultString, '\x1b]4;1;rgb:0101/0101/0101;' +
                    '2;rgb:bebe/bebe/bebe\x07');
    result.pass();
  });

/**
 * Test the cursor shape changes using OSC 50.
 */
hterm.VT.Tests.addTest('OSC-50, cursor shapes', function(result, cx) {
    result.assertEQ(this.terminal.getCursorShape(),
                    hterm.Terminal.cursorShape.BLOCK);

    this.terminal.interpret('\x1b]50;CursorShape=1\x07');
    this.terminal.syncCursorPosition_();
    result.assertEQ(this.terminal.getCursorShape(),
                    hterm.Terminal.cursorShape.BEAM);

    this.terminal.interpret('\x1b]50;CursorShape=0\x07');
    this.terminal.syncCursorPosition_();
    result.assertEQ(this.terminal.getCursorShape(),
                    hterm.Terminal.cursorShape.BLOCK);

    this.terminal.interpret('\x1b]50;CursorShape=2\x07');
    this.terminal.syncCursorPosition_();
    result.assertEQ(this.terminal.getCursorShape(),
                    hterm.Terminal.cursorShape.UNDERLINE);

    // Invalid shape, should be set cursor to block
    this.terminal.interpret('\x1b]50;CursorShape=a\x07');
    this.terminal.syncCursorPosition_();
    result.assertEQ(this.terminal.getCursorShape(),
                    hterm.Terminal.cursorShape.BLOCK);

    result.pass();
  });

/**
 * Verify resetting text foreground color.
 */
hterm.VT.Tests.addTest('OSC-110', function(result, cx) {
  // Make sure other colors aren't changed by accident.
  const backColor = this.terminal.getBackgroundColor();
  const cursorColor = this.terminal.getCursorColor();

  this.terminal.interpret('\x1b]10;red\x07');
  result.assertEQ('rgb(255, 0, 0)', this.terminal.getForegroundColor());

  this.terminal.interpret('\x1b]110;\x07');
  result.assertEQ('rgb(240, 240, 240)', this.terminal.getForegroundColor());

  // Make sure other colors aren't changed by accident.
  result.assertEQ(backColor, this.terminal.getBackgroundColor());
  result.assertEQ(cursorColor, this.terminal.getCursorColor());

  result.pass();
});

/**
 * Verify resetting text background color.
 */
hterm.VT.Tests.addTest('OSC-111', function(result, cx) {
  // Make sure other colors aren't changed by accident.
  const foreColor = this.terminal.getForegroundColor();
  const cursorColor = this.terminal.getCursorColor();

  this.terminal.interpret('\x1b]11;red\x07');
  result.assertEQ('rgb(255, 0, 0)', this.terminal.getBackgroundColor());

  this.terminal.interpret('\x1b]111;\x07');
  result.assertEQ('rgb(16, 16, 16)', this.terminal.getBackgroundColor());

  // Make sure other colors aren't changed by accident.
  result.assertEQ(foreColor, this.terminal.getForegroundColor());
  result.assertEQ(cursorColor, this.terminal.getCursorColor());

  result.pass();
});

/**
 * Verify resetting text cursor color (not the mouse cursor).
 */
hterm.VT.Tests.addTest('OSC-112', function(result, cx) {
  // Make sure other colors aren't changed by accident.
  const foreColor = this.terminal.getForegroundColor();
  const backColor = this.terminal.getBackgroundColor();

  this.terminal.interpret('\x1b]12;red\x07');
  result.assertEQ('rgb(255, 0, 0)', this.terminal.getCursorColor());

  this.terminal.interpret('\x1b]112;\x07');
  result.assertEQ('rgba(255, 0, 0, 0.5)', this.terminal.getCursorColor());

  // Make sure other colors aren't changed by accident.
  result.assertEQ(foreColor, this.terminal.getForegroundColor());
  result.assertEQ(backColor, this.terminal.getBackgroundColor());

  result.pass();
});

/**
 * Test URxvt notify module.
 */
hterm.VT.Tests.addTest('OSC-777-notify', function(result, cx) {
    result.assertEQ(0, Notification.count);

    // An empty notification.  We don't test the title as it's generated.
    this.terminal.interpret('\x1b]777;notify\x07');
    result.assertEQ(1, Notification.count);
    result.assert(Notification.call.title != '');
    result.assertEQ(undefined, Notification.call.body);

    // Same as above, but covers slightly different parsing.
    this.terminal.interpret('\x1b]777;notify;\x07');
    result.assertEQ(2, Notification.count);
    result.assert(Notification.call.title != '');
    result.assertEQ(undefined, Notification.call.body);

    // A notification with a title.
    this.terminal.interpret('\x1b]777;notify;my title\x07');
    result.assertEQ(3, Notification.count);
    result.assert(Notification.call.title.includes('my title'));
    result.assertEQ(undefined, Notification.call.body);

    // A notification with a title & body.
    this.terminal.interpret('\x1b]777;notify;my title;my body\x07');
    result.assertEQ(4, Notification.count);
    result.assert(Notification.call.title.includes('my title'));
    result.assert(Notification.call.body.includes('my body'));

    // A notification with a title & body, covering more parsing.
    this.terminal.interpret('\x1b]777;notify;my title;my body;and a semi\x07');
    result.assertEQ(5, Notification.count);
    result.assert(Notification.call.title.includes('my title'));
    result.assert(Notification.call.body.includes('my body;and a semi'));

    result.pass();
  });

/**
 * Test iTerm2 1337 non-file transfers.
 */
hterm.VT.Tests.addTest('OSC-1337-ignore', function(result, cx) {
  this.terminal.displayImage =
      () => result.fail('Unknown should not trigger file display');

  this.terminal.interpret('\x1b]1337;CursorShape=1\x07');

  result.pass();
});

/**
 * Test iTerm2 1337 file transfer defaults.
 */
hterm.VT.Tests.addTest('OSC-1337-file-defaults', function(result, cx) {
  this.terminal.displayImage = (options) => {
    result.assertEQ('', options.name);
    result.assertEQ(0, options.size);
    result.assertEQ(true, options.preserveAspectRatio);
    result.assertEQ(false, options.inline);
    result.assertEQ('auto', options.width);
    result.assertEQ('auto', options.height);
    result.assertEQ('left', options.align);
    result.assertEQ('data:application/octet-stream;base64,Cg==',
                    options.uri);
    result.pass();
  };

  this.terminal.interpret('\x1b]1337;File=:Cg==\x07');
});

/**
 * Test iTerm2 1337 invalid values.
 */
hterm.VT.Tests.addTest('OSC-1337-file-invalid', function(result, cx) {
  this.terminal.displayImage = (options) => {
    result.assertEQ('', options.name);
    result.assertEQ(1, options.size);
    result.assertEQ(undefined, options.unk);
    result.pass();
  };

  this.terminal.interpret(
      '\x1b]1337;File=' +
      // Ignore unknown keys.
      'unk=key;' +
      // The name is supposed to be base64 encoded.
      'name=[oo]ps;' +
      // Include a valid field to make sure we parsed it all
      'size=1;;;:Cg==\x07');
});

/**
 * Test iTerm2 1337 valid options.
 */
hterm.VT.Tests.addTest('OSC-1337-file-valid', function(result, cx) {
  // Check "false" values.
  this.terminal.displayImage = (options) => {
    result.assertEQ(false, options.preserveAspectRatio);
    result.assertEQ(false, options.inline);
  };
  this.terminal.interpret(
      '\x1b]1337;File=preserveAspectRatio=0;inline=0:Cg==\x07');

  // Check "true" values.
  this.terminal.displayImage = (options) => {
    result.assertEQ(true, options.preserveAspectRatio);
    result.assertEQ(true, options.inline);
  };
  this.terminal.interpret(
      '\x1b]1337;File=preserveAspectRatio=1;inline=1:Cg==\x07');

  // Check the rest.
  this.terminal.displayImage = (options) => {
    result.assertEQ('yes', options.name);
    result.assertEQ(1234, options.size);
    result.assertEQ('12px', options.width);
    result.assertEQ('50%', options.height);
    result.assertEQ('center', options.align);

    result.pass();
  };
  this.terminal.interpret(
      '\x1b]1337;File=' +
      'name=eWVz;' +
      'size=1234;' +
      'width=12px;' +
      'height=50%;' +
      'align=center;' +
      ':Cg==\x07');
});

/**
 * Test handling of extra data after an iTerm2 1337 file sequence.
 */
hterm.VT.Tests.addTest('OSC-1337-file-queue', function(result, cx) {
  let text;

  // For non-inline files, things will be processed right away.
  this.terminal.displayImage = () => {};
  this.terminal.interpret('\x1b]1337;File=:Cg==\x07OK');
  text = this.terminal.getRowsText(0, 1);
  result.assertEQ('OK', text);

  // For inline files, things should be delayed.
  // The io/timeout logic is supposed to mock the normal behavior.
  this.terminal.displayImage = function() {
    const io = this.io.push();
    setTimeout(() => {
      io.pop();
      text = this.getRowsText(0, 1);
      result.assertEQ('OK', text);
      result.pass();
    }, 0);
  };
  this.terminal.clearHome();
  this.terminal.interpret('\x1b]1337;File=inline=1:Cg==\x07OK');
  text = this.terminal.getRowsText(0, 1);
  result.assertEQ('', text);

  result.requestTime(200);
});

/**
 * Test the cursor shape changes using DECSCUSR.
 */
hterm.VT.Tests.addTest('DECSCUSR, cursor shapes', function(result, cx) {
    result.assertEQ(this.terminal.getCursorShape(),
                    hterm.Terminal.cursorShape.BLOCK);
    result.assertEQ(this.terminal.options_.cursorBlink, false);

    this.terminal.interpret('\x1b[ 3q');
    this.terminal.syncCursorPosition_();
    result.assertEQ(this.terminal.getCursorShape(),
                    hterm.Terminal.cursorShape.UNDERLINE);
    result.assertEQ(this.terminal.options_.cursorBlink, true);

    this.terminal.interpret('\x1b[ 0q');
    this.terminal.syncCursorPosition_();
    result.assertEQ(this.terminal.getCursorShape(),
                    hterm.Terminal.cursorShape.BLOCK);
    result.assertEQ(this.terminal.options_.cursorBlink, true);

    this.terminal.interpret('\x1b[ 1q');
    this.terminal.syncCursorPosition_();
    result.assertEQ(this.terminal.getCursorShape(),
                    hterm.Terminal.cursorShape.BLOCK);
    result.assertEQ(this.terminal.options_.cursorBlink, true);

    this.terminal.interpret('\x1b[ 4q');
    this.terminal.syncCursorPosition_();
    result.assertEQ(this.terminal.getCursorShape(),
                    hterm.Terminal.cursorShape.UNDERLINE);
    result.assertEQ(this.terminal.options_.cursorBlink, false);

    this.terminal.interpret('\x1b[ 2q');
    this.terminal.syncCursorPosition_();
    result.assertEQ(this.terminal.getCursorShape(),
                    hterm.Terminal.cursorShape.BLOCK);
    result.assertEQ(this.terminal.options_.cursorBlink, false);

    result.pass();
  });

hterm.VT.Tests.addTest('bracketed-paste', function(result, cx) {
    var resultString;
    terminal.io.sendString = function (str) { resultString = str };

    result.assertEQ(this.terminal.options_.bracketedPaste, false);

    this.terminal.interpret('\x1b[?2004h');
    result.assertEQ(this.terminal.options_.bracketedPaste, true);

    this.terminal.onPaste_({text: 'hello world'});
    result.assertEQ(resultString, '\x1b[200~hello world\x1b[201~');

    this.terminal.interpret('\x1b[?2004l');
    result.assertEQ(this.terminal.options_.bracketedPaste, false);

    this.terminal.onPaste_({text: 'hello world'});
    result.assertEQ(resultString, 'hello world');

    result.pass();
  });

hterm.VT.Tests.addTest('fullscreen', function(result, cx) {
    this.div.style.height = '100%';
    this.div.style.width = '100%';

    var self = this;

    setTimeout(function() {
        for (var i = 0; i < 1000; i++) {
          var indent = i % 40;
          if (indent > 20)
            indent = 40 - indent;

          self.terminal.interpret('Line ' + lib.f.zpad(i, 3) + ': ' +
                                  lib.f.getWhitespace(indent) + '*\n');
        }

        result.pass();
      }, 100);

    result.requestTime(200);
  });

/**
 * Verify switching character maps works.
 */
hterm.VT.Tests.addTest('character-maps', function(result, cx) {
    // Create a line with all the printable characters.
    var i, line = '';
    for (i = 0x20; i < 0x7f; ++i)
      line += String.fromCharCode(i);

    this.terminal.setWidth(line.length);

    // Start with sanity check -- no translations are active.
    this.terminal.clearHome();
    this.terminal.interpret(line);
    result.assertEQ(this.terminal.getRowText(0), line);

    // Loop through all the maps.
    var map, gl;
    for (map in hterm.VT.CharacterMaps.DefaultMaps) {
      // If this map doesn't do any translations, skip it.
      gl = hterm.VT.CharacterMaps.DefaultMaps[map].GL;
      if (!gl)
        continue;

      // Point G0 to the specified map (and assume GL points to G0).
      this.terminal.clearHome();
      this.terminal.interpret('\x1b(' + map + line);
      result.assertEQ(this.terminal.getRowText(0), gl(line));
    }

    result.pass();
  });

/**
 * Verify DOCS (encoding) switching behavior.
 */
hterm.VT.Tests.addTest('docs', function(result, cx) {
    // Create a line with all the printable characters.
    var i, graphicsLine, line = '';
    for (i = 0x20; i < 0x7f; ++i)
      line += String.fromCharCode(i);
    graphicsLine = hterm.VT.CharacterMaps.DefaultMaps['0'].GL(line);

    this.terminal.setWidth(line.length);

    // Check the default encoding (ECMA-35).
    result.assertEQ(this.terminal.vt.codingSystemUtf8_, false);
    result.assertEQ(this.terminal.vt.codingSystemLocked_, false);
    this.terminal.clearHome();
    this.terminal.interpret(line);
    result.assertEQ(this.terminal.getRowText(0), line);

    // Switch to the graphics map and make sure it translates.
    this.terminal.clearHome();
    this.terminal.interpret('\x1b(0' + line);
    result.assertEQ(this.terminal.getRowText(0), graphicsLine);

    // Switch to UTF-8 encoding.  The graphics map should not translate.
    this.terminal.clearHome();
    this.terminal.interpret('\x1b%G' + line)
    result.assertEQ(this.terminal.vt.codingSystemUtf8_, true);
    result.assertEQ(this.terminal.vt.codingSystemLocked_, false);
    result.assertEQ(this.terminal.getRowText(0), line);

    // Switch to ECMA-35 encoding.  The graphics map should translate.
    this.terminal.clearHome();
    this.terminal.interpret('\x1b%@' + line)
    result.assertEQ(this.terminal.vt.codingSystemUtf8_, false);
    result.assertEQ(this.terminal.vt.codingSystemLocked_, false);
    result.assertEQ(this.terminal.getRowText(0), graphicsLine);

    // Switch to UTF-8 encoding (and lock).
    this.terminal.clearHome();
    this.terminal.interpret('\x1b%/G' + line)
    result.assertEQ(this.terminal.vt.codingSystemUtf8_, true);
    result.assertEQ(this.terminal.vt.codingSystemLocked_, true);
    result.assertEQ(this.terminal.getRowText(0), line);

    // Switching back to ECMA-35 should not work now.
    this.terminal.clearHome();
    this.terminal.interpret('\x1b%@' + line)
    result.assertEQ(this.terminal.vt.codingSystemUtf8_, true);
    result.assertEQ(this.terminal.vt.codingSystemLocked_, true);
    result.assertEQ(this.terminal.getRowText(0), line);

    // Try other UTF-8 modes (although they're the same as /G).
    this.terminal.clearHome();
    this.terminal.interpret('\x1b%/H' + line)
    result.assertEQ(this.terminal.vt.codingSystemUtf8_, true);
    result.assertEQ(this.terminal.vt.codingSystemLocked_, true);
    result.assertEQ(this.terminal.getRowText(0), line);

    this.terminal.clearHome();
    this.terminal.interpret('\x1b%/I' + line)
    result.assertEQ(this.terminal.vt.codingSystemUtf8_, true);
    result.assertEQ(this.terminal.vt.codingSystemLocked_, true);
    result.assertEQ(this.terminal.getRowText(0), line);

    result.pass();
  });

/**
 * Verify DOCS (encoding) invalid escapes don't mess things up.
 */
hterm.VT.Tests.addTest('docs-invalid', function(result, cx) {
    // Check the default encoding (ECMA-35).
    result.assertEQ(this.terminal.vt.codingSystemUtf8_, false);
    result.assertEQ(this.terminal.vt.codingSystemLocked_, false);

    // Try switching to a random set of invalid escapes.
    var ch;
    ['a', '9', 'X', '(', '}'].forEach((ch) => {
      // First in ECMA-35 encoding.
      this.terminal.interpret('\x1b%@');
      this.terminal.interpret('\x1b%' + ch);
      result.assertEQ(this.terminal.vt.codingSystemUtf8_, false);
      result.assertEQ(this.terminal.vt.codingSystemLocked_, false);
      result.assertEQ(this.terminal.getRowText(0), '');

      this.terminal.interpret('\x1b%/' + ch);
      result.assertEQ(this.terminal.vt.codingSystemUtf8_, false);
      result.assertEQ(this.terminal.vt.codingSystemLocked_, false);
      result.assertEQ(this.terminal.getRowText(0), '');

      // Then in UTF-8 encoding.
      this.terminal.interpret('\x1b%G');
      this.terminal.interpret('\x1b%' + ch);
      result.assertEQ(this.terminal.vt.codingSystemUtf8_, true);
      result.assertEQ(this.terminal.vt.codingSystemLocked_, false);
      result.assertEQ(this.terminal.getRowText(0), '');

      this.terminal.interpret('\x1b%/' + ch);
      result.assertEQ(this.terminal.vt.codingSystemUtf8_, true);
      result.assertEQ(this.terminal.vt.codingSystemLocked_, false);
      result.assertEQ(this.terminal.getRowText(0), '');
    });

    result.pass();
  });

/**
 * Check cursor save/restore behavior.
 */
hterm.VT.Tests.addTest('cursor-save-restore', function(result, cx) {
  let tattrs;

  // Save the current cursor state.
  this.terminal.interpret('\x1b[?1048h');

  // Change cursor attributes.
  this.terminal.interpret('\x1b[1;4m');
  tattrs = this.terminal.getTextAttributes();
  result.assertEQ(true, tattrs.bold);
  result.assertEQ('solid', tattrs.underline);

  // Change color palette a bit.
  result.assertEQ('rgb(0, 0, 0)', tattrs.colorPalette[0]);
  result.assertEQ('rgb(204, 0, 0)', tattrs.colorPalette[1]);
  this.terminal.interpret('\x1b]4;1;#112233;\x07');
  result.assertEQ('rgb(0, 0, 0)', tattrs.colorPalette[0]);
  result.assertEQ('rgba(17, 34, 51, 1)', tattrs.colorPalette[1]);

  // Restore the saved cursor state.
  this.terminal.interpret('\x1b[?1048l');

  // Check attributes were restored correctly.
  tattrs = this.terminal.getTextAttributes();
  result.assertEQ(false, tattrs.bold);
  result.assertEQ(false, tattrs.underline);

  // Make sure color palette did not change.
  result.assertEQ('rgb(0, 0, 0)', tattrs.colorPalette[0]);
  result.assertEQ('rgba(17, 34, 51, 1)', tattrs.colorPalette[1]);

  result.pass();
});
