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
};

/**
 * Ensure that blink is off after the test so we don't have runaway timeouts.
 *
 * Called after each test case in this suite.
 */
hterm.VT.Tests.prototype.postamble = function(result, cx) {
  this.terminal.setCursorBlink(false);
};

/**
 * Overridden addTest method.
 *
 * Every test in this suite needs to wait for the terminal initialization to
 * complete asynchronously.  Rather than stick a bunch of biolerplate into each
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
 * Test that long unterminated sequences are properly ignored.
 */
hterm.VT.Tests.addTest('unterminated-sequence', function(result, cx) {
    var title = null;
    this.terminal.setWindowTitle = function(t) {
      // Set a default title so we can catch the potential for this function
      // to be called on accident with no parameter.
      title = t || 'XXX';
    };

    // Lower this threshold to make the test simpler.
    this.terminal.vt.maxStringSequence = 10;

    // The "0;" is part of the sequence, so we only have 8 bytes left.
    this.terminal.interpret('\x1b]0;12345678\x07!!');
    result.assertEQ(title, '12345678');
    result.assertEQ(this.terminal.getRowsText(0, 1), '!!');

    title = null;
    terminal.reset();
    this.terminal.interpret('\x1b]0;12345');
    this.terminal.interpret('678\x07!!');
    result.assertEQ(title, '12345678');
    result.assertEQ(this.terminal.getRowsText(0, 1), '!!');

    title = null;
    terminal.reset();
    this.terminal.interpret('\x1b]0;123456789\x07!!');
    result.assertEQ(title, null);
    result.assertEQ(this.terminal.getRowsText(0, 1), '0;123456789!!');

    title = null;
    terminal.reset();
    this.terminal.interpret('\x1b]0;12345');
    this.terminal.interpret('6789\x07!!');
    result.assertEQ(title, null);
    result.assertEQ(this.terminal.getRowsText(0, 1), '0;123456789!!');

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

    for (var i = 0; i < 5; i++) {
      var row = this.terminal.getRowNode(i);
      result.assertEQ(row.childNodes.length, 2, 'i: ' + i);
      result.assertEQ(row.childNodes[0].nodeType, 3, 'i: ' + i);
      result.assertEQ(row.childNodes[0].length, 13, 'i: ' + i);
      result.assertEQ(row.childNodes[1].nodeName, 'SPAN', 'i: ' + i);
      result.assert(!!row.childNodes[1].style.color, 'i: ' + i);
      result.assert(!!row.childNodes[1].style.fontWeight == (i > 1), 'i: ' + i);
    }

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

    this.terminal.interpret('\x1b[?1036h');
    result.assertEQ(this.terminal.keyboard.metaSendsEscape, true);

    this.terminal.interpret('\x1b[?1036l');
    result.assertEQ(this.terminal.keyboard.metaSendsEscape, false);

    this.terminal.interpret('\x1b[?1039h');
    result.assertEQ(this.terminal.keyboard.altSendsEscape, true);

    this.terminal.interpret('\x1b[?1039l');
    result.assertEQ(this.terminal.keyboard.altSendsEscape, false);

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
 * Test interactions between the cursor overflow bit and various
 * escape sequences.
 */
hterm.VT.Tests.addTest('cursor-overflow', function(result, cx) {
    // Should be on by default.
    result.assertEQ(this.terminal.options_.wraparound, true);

    // Fill a row with the last hyphen wrong, then run a command that
    // modifies the screen, then add a hyphen. The wrap bit should be
    // cleared, so the extra hyphen can fix the row.

    this.terminal.interpret('-----  1  ----X');
    this.terminal.interpret('\x1b[K-');  // EL

    this.terminal.interpret('-----  2  ----X');
    this.terminal.interpret('\x1b[J-');  // ED

    this.terminal.interpret('-----  3  ----X');
    this.terminal.interpret('\x1b[@-');  // ICH

    this.terminal.interpret('-----  4  ----X');
    this.terminal.interpret('\x1b[P-');  // DCH

    this.terminal.interpret('-----  5  ----X');
    this.terminal.interpret('\x1b[X-');  // ECH

    // DL will delete the entire line but clear the wrap bit, so we
    // expect a hyphen at the end and nothing else.
    this.terminal.interpret('XXXXXXXXXXXXXXX');
    this.terminal.interpret('\x1b[M-');  // DL

    var text = this.terminal.getRowsText(0, 6);
    result.assertEQ(text,
                    '-----  1  -----' +
                    '-----  2  -----' +
                    '-----  3  -----' +
                    '-----  4  -----' +
                    '-----  5  -----' +
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

    // Aand back to alternate screen.
    this.terminal.interpret('\x1b[?1049h');
    text = this.terminal.getRowsText(0, 10);
    result.assertEQ(text, '1\n2\n3\n4\n\n\n\n\n\n');

    this.terminal.interpret('XX');
    text = this.terminal.getRowsText(0, 10);
    result.assertEQ(text, '1\n2\n3\n4\n\n\n    XX\n\n\n');

    result.pass();
  });

/**
 * Test that we can use OSC 52 to copy to the system clipboard.
 */
hterm.VT.Tests.addTest('OSC-52', function(result, cx) {
    // Mock this out since we can't document.execCommand from the
    // test harness.
    hterm.copySelectionToClipboard = function(document) {
      var s = document.getSelection();
      result.assertEQ(s.anchorNode.textContent, 'copypasta!');
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
    hterm.copySelectionToClipboard = function(document) {
      var s = document.getSelection();
      result.assertEQ(s.anchorNode.textContent, expect);
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

    this.terminal.vt.maxStringSequence = expect.length * 3;

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
