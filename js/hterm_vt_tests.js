// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview VT test suite.
 *
 * This is more of an integration test suite for the VT and Terminal classes,
 * as each test typically sends strings into the VT parser and then reads
 * the terminal to verify that everyone did the right thing.
 */

hterm.VT.Tests = new lib.TestManager.Suite('hterm.VT.Tests');

hterm.VT.Tests.prototype.setup = function(cx) {
  this.visibleColumnCount = 15;
  this.visibleRowCount = 6;
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
 * Create a MouseEvent/WheelEvent that the VT layer expects.
 *
 * The Terminal layer adds some extra fields to it.  We can't create an object
 * in the same way as the runtime doesn't allow it (for no real good reason).
 * i.e. these methods fail:
 * (1) MouseEvent.apply(this, [...]) -> DOM object constructor cannot be called
 * (2) https://developers.google.com/web/updates/2015/04/DOM-attributes-now-on-the-prototype-chain
 *     m = new MouseEvent(...); Object.assign(this, m); -> attrs omitted
 *
 * @param {string} type The name of the new DOM event type (e.g. 'mouseup').
 * @param {object=} options Fields to set in the new event.
 * @return {MouseEvent|WheelEvent} The new fully initialized event.
 */
const MockTerminalMouseEvent = function(type, options = {}) {
  let ret;
  if (type == 'wheel')
    ret = new WheelEvent(type, options);
  else
    ret = new MouseEvent(type, options);
  ret.terminalRow = options.terminalRow || 0;
  ret.terminalColumn = options.terminalColumn || 0;
  return ret;
};

/**
 * Basic sanity test to make sure that when we insert plain text it appears
 * on the screen and scrolls into the scrollback buffer correctly.
 */
hterm.VT.Tests.addTest('sanity', function(result, cx) {
    this.terminal.interpret('0\r\n1\r\n2\r\n3\r\n4\r\n5\r\n6\r\n' +
                            '7\r\n8\r\n9\r\n10\r\n11\r\n12');

    var text = this.terminal.getRowsText(0, 13);
    assert.equal(text, '0\n1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12');

    assert.equal(this.terminal.scrollbackRows_.length, 7);

    result.pass();
  });

/**
 * Test that we parse UTF-8 properly. Parser state should persist
 * across writes and invalid sequences should result in replacement
 * characters.
 */
hterm.VT.Tests.addTest('utf8', function(result, cx) {
    // 11100010 10000000 10011001 split over two writes.
    this.terminal.io.writeUTF8('\xe2\x80');
    this.terminal.io.writeUTF8('\x99\r\n');

    // Interpret some invalid UTF-8. xterm and gnome-terminal are
    // inconsistent about the number of replacement characters. We
    // match xterm.
    this.terminal.io.writelnUTF8('a\xf1\x80\x80\xe1\x80\xc2b\x80c\x80\xbfd');

    // Surrogate pairs turn into replacements.
    this.terminal.io.writeUTF8('\xed\xa0\x80' +  // D800
                               '\xed\xad\xbf' +  // D87F
                               '\xed\xae\x80' +  // DC00
                               '\xed\xbf\xbf');  // DFFF

    // Write some text to finish flushing the decoding stream.
    this.terminal.io.writeUTF8('\r\ndone');

    var text = this.terminal.getRowsText(0, 4);
    assert.equal(text,
                 '\u2019\n' +
                 'a\ufffd\ufffd\ufffdb\ufffdc\ufffd\ufffdd\n' +
                 '\ufffd'.repeat(12) +
                 '\ndone');

    result.pass();
  });

/**
 * Verify we can write ArrayBuffers of UTF-8 data.
 */
hterm.VT.Tests.addTest('utf8-arraybuffer', function(result, cx) {
  // Test splitting a single code point over multiple writes.
  let data = new Uint8Array([0xe2, 0x80, 0x99, 0xd, 0xa]);
  for (let i = 0; i < data.length; ++i) {
    this.terminal.io.writeUTF8(data.subarray(i, i + 1));
  }

  // Interpret some invalid UTF-8. xterm and gnome-terminal are
  // inconsistent about the number of replacement characters. We
  // match xterm.
  data = new Uint8Array([0x61, 0xf1, 0x80, 0x80, 0xe1, 0x80, 0xc2, 0x62, 0x80,
                         0x63, 0x80, 0xbf, 0x64]);
  this.terminal.io.writelnUTF8(data);

  // Surrogate pairs turn into replacements.
  data = new Uint8Array([0xed, 0xa0, 0x80,    // D800
                         0xed, 0xad, 0xbf,    // D87F
                         0xed, 0xae, 0x80,    // DC00
                         0xed, 0xbf, 0xbf]);  // DFFF
  this.terminal.io.writelnUTF8(data);

  const text = this.terminal.getRowsText(0, 3);
  assert.equal('\u2019\n' +
               'a\ufffd\ufffd\ufffdb\ufffdc\ufffd\ufffdd\n' +
               '\ufffd'.repeat(12),
               text);

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
    this.terminal.interpret('abc\b\b\u{302}\n');
    var text = this.terminal.getRowsText(0, 1);
    assert.equal(text, 'a\u{302}bc');
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
    assert.equal(text, 'line one\nline two\nline three');
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
    assert.equal(text, 'line one\nline two\nline three');

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
    assert.equal(text, 'line one\nline two\nline three');
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
    assert.equal(text, 'line one\nline two\nline three');
    result.pass();
  });

/**
 * Test that two ESC characters in a row are handled properly.
 */
hterm.VT.Tests.addTest('double-sequence', function(result, cx) {
    this.terminal.interpret('line one\r\nline two\r\nline 3');

    this.terminal.interpret('\x1b[\x1b[Dthree');

    var text = this.terminal.getRowsText(0, 3);
    assert.equal(text, 'line one\nline two\nline three');
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

    assert.isFalse(this.terminal.vt.enable8BitControl);

    // Send a "set window title" command using a disabled 8-bit
    // control. It's a C1 control, so we interpret it after UTF-8
    // decoding.
    this.terminal.interpret('\u{9d}0;test title\x07!!');

    assert.isNull(title);
    assert.equal(this.terminal.getRowsText(0, 1), '0;test title!!');

    // Try again with the two-byte version of the code.
    title = null;
    this.terminal.reset();
    this.terminal.interpret('\x1b]0;test title\x07!!');
    assert.equal(title, 'test title');
    assert.equal(this.terminal.getRowsText(0, 1), '!!');

    // Now enable 8-bit control and see how it goes.
    title = null;
    this.terminal.reset();
    this.terminal.vt.enable8BitControl = true;
    this.terminal.interpret('\u{9d}0;test title\x07!!');
    assert.equal(title, 'test title');
    assert.equal(this.terminal.getRowsText(0, 1), '!!');

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
      assert.isNull(title);

      // We get the data in pieces w/a terminated sequence.
      terminal.reset();
      this.terminal.interpret('\x1b]0;asdf');
      this.terminal.interpret('\x1b');
      this.terminal.interpret(' x ' + seq);
      assert.isNull(title);
    });

    // We get the data in pieces but no terminating sequence.
    terminal.reset();
    this.terminal.interpret('\x1b]0;asdf');
    this.terminal.interpret('\x1b');
    this.terminal.interpret(' ');
    assert.isNull(title);

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
    assert.equal(title, 'asdf');

    // We get the first half of the ST one byte at a time.
    title = null;
    terminal.reset();
    this.terminal.interpret('\x1b]0;asdf');
    this.terminal.interpret('\x1b');
    this.terminal.interpret('\\');
    assert.equal(title, 'asdf');

    result.pass();
  });

hterm.VT.Tests.addTest('dec-screen-test', function(result, cx) {
    this.terminal.interpret('\x1b#8');

    var text = this.terminal.getRowsText(0, 6);
    assert.equal(text,
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
    assert.isFalse(this.terminal.options_.autoCarriageReturn);

    // 0d: newline, 0b: vertical tab, 0c: form feed.
    this.terminal.interpret('newline\x0dvtab\x0bff\x0cbye');
    var text = this.terminal.getRowsText(0, 3);
    assert.equal(text,
                 'vtabine\n' +
                 '    ff\n' +
                 '      bye');

    result.pass();
  });

hterm.VT.Tests.addTest('newlines-2', function(result, cx) {
    this.terminal.interpret('\x1b[20h');
    assert.isTrue(this.terminal.options_.autoCarriageReturn);

    this.terminal.interpret('newline\x0dvtab\x0bff\x0cbye');
    var text = this.terminal.getRowsText(0, 3);
    assert.equal(text,
                 'vtabine\n' +
                 'ff\n' +
                 'bye');

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
    assert.equal(text,
                 '123456789012345\n' +
                 '1       2     a\n' +
                 '1       2     b\n' +
                 '1       2     c\n' +
                 '1       2     d\n' +
                 '1       2     e');

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

    assert.equal(this.terminal.tabStops_.length, 0);

    ta = this.terminal.primaryScreen_.textAttributes;
    assert.notStrictEqual(ta.foreground, ta.DEFAULT_COLOR);
    assert.notStrictEqual(ta.background, ta.DEFAULT_COLOR);

    ta = this.terminal.alternateScreen_.textAttributes;
    assert.notStrictEqual(ta.foreground, ta.DEFAULT_COLOR);
    assert.notStrictEqual(ta.background, ta.DEFAULT_COLOR);

    assert.isTrue(ta.bold);

    assert.equal(this.terminal.vtScrollTop_, 1);
    assert.equal(this.terminal.vtScrollBottom_, 3);
    assert.equal(this.terminal.screen_.cursorPosition.row, 4);
    assert.equal(this.terminal.screen_.cursorPosition.column, 5);

    // Reset.
    this.terminal.interpret('\x1bc');

    assert.equal(this.terminal.tabStops_.length, 1);

    ta = this.terminal.primaryScreen_.textAttributes;
    assert.strictEqual(ta.foreground, ta.DEFAULT_COLOR);
    assert.strictEqual(ta.background, ta.DEFAULT_COLOR);

    ta = this.terminal.alternateScreen_.textAttributes;
    assert.strictEqual(ta.foreground, ta.DEFAULT_COLOR);
    assert.strictEqual(ta.background, ta.DEFAULT_COLOR);

    assert.isFalse(ta.bold);

    assert.isNull(this.terminal.vtScrollTop_);
    assert.isNull(this.terminal.vtScrollBottom_);
    assert.equal(this.terminal.screen_.cursorPosition.row, 0);
    assert.equal(this.terminal.screen_.cursorPosition.column, 0);

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
    assert.equal(text,
                 'line one\n' +
                 '     two\n' +
                 'line three');
    result.pass();
  });

/**
 * Test the erase left command with widechar string.
 */
hterm.VT.Tests.addTest('erase-left-widechar', function(result, cx) {
    this.terminal.interpret('第一行\r\n第二行\r\n第三行');
    this.terminal.interpret('\x1b[5D' +
                            '\x1b[A' +
                            '\x1b[1KOO');

    var text = this.terminal.getRowsText(0, 3);
    assert.equal('\u7b2c\u4e00\u884c\n' +
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
    assert.equal(text,
                 'line one\n' +
                 'line two\n' +
                 'line three');
    result.pass();
  });

/**
 * Test the erase right command with widechar string.
 */
hterm.VT.Tests.addTest('erase-right-widechar', function(result, cx) {
    this.terminal.interpret('第一行\r\n第二行\r\n第三行');
    this.terminal.interpret('\x1b[5D\x1b[A' +
                            '\x1b[0KOO');

    var text = this.terminal.getRowsText(0, 3);
    assert.equal('\u7b2c\u4e00\u884c\n' +
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
    assert.equal(text,
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
    assert.equal(text,
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
    assert.equal(text,
                 '\n' +
                 '     two\n');
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
    assert.equal(text,
                 'line one\n' +
                 'line two\n');
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
    assert.equal(text,
                 'line one\n' +
                 'line two\n' +
                 'line three');

    this.terminal.interpret('\x1b[3D' +
                            '\x1b[X');
    text = this.terminal.getRowsText(0, 3);
    assert.equal(text,
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
    assert.equal(text,
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
    assert.equal(text,
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
    assert.equal(text,
                 'line one\n' +
                 'line two\n' +
                 'line three\n' +
                 '\n');
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
    assert.equal(text,
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
    assert.equal(text,
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
    assert.equal(text,
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
    assert.equal(text,
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
    assert.equal(text,
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
    assert.equal(text,
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
    assert.equal(text,
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
    assert.equal(text,
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
    assert.equal(text,
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
    this.terminal.io.sendString = (str) => resultString = str;

    this.terminal.interpret('\x1b[c');

    assert.equal(resultString, '\x1b[?1;2c');
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
    assert.equal(text,
                 'plain....... Hi\n' +
                 'italic...... Hi\n' +
                 'bright...... Hi\n' +
                 'bold........ Hi\n' +
                 'bold-bright. Hi\n' +
                 'bright-bold. Hi');

    for (var i = 0; i < 6; i++) {
      var row = this.terminal.getRowNode(i);
      assert.equal(row.childNodes.length, 2, 'i: ' + i);
      assert.equal(row.childNodes[0].nodeType, Node.TEXT_NODE, 'i: ' + i);
      assert.equal(row.childNodes[0].length, 13, 'i: ' + i);
      assert.equal(row.childNodes[1].nodeName, 'SPAN', 'i: ' + i);
      assert.isTrue(!!row.childNodes[1].style.color, 'i: ' + i);
      assert.isTrue(!!row.childNodes[1].style.fontWeight == (i > 2), 'i: ' + i);
      assert.equal(
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
    assert.equal(text,
                 'plain....... \u4E2D\n' +
                 'italic...... \u4E2D\n' +
                 'bright...... \u4E2D\n' +
                 'bold........ \u4E2D\n' +
                 'bold-bright. \u4E2D\n' +
                 'bright-bold. \u4E2D');

    for (var i = 0; i < 6; i++) {
      var row = this.terminal.getRowNode(i);
      assert.equal(row.childNodes.length, 2, 'i: ' + i);
      assert.equal(row.childNodes[0].nodeType, Node.TEXT_NODE, 'i: ' + i);
      assert.equal(row.childNodes[0].length, 13, 'i: ' + i);
      assert.equal(row.childNodes[1].nodeName, 'SPAN', 'i: ' + i);
      assert.isTrue(!!row.childNodes[1].style.color, 'i: ' + i);
      assert.isTrue(!!row.childNodes[1].style.fontWeight == (i > 2), 'i: ' + i);
      assert.equal(
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
    assert.equal(text,
                 'plain....... Hi\n' +
                 'bright...... Hi\n' +
                 'bold........ Hi\n' +
                 'bold-bright. Hi\n' +
                 'bright-bold. Hi');

    var fg = attrs.colorPalette[6];
    var fg_bright = attrs.colorPalette[14];

    var row_plain = this.terminal.getRowNode(0);
    assert.equal(row_plain.childNodes[1].style.color, fg,
                 'plain color');

    var row_bright = this.terminal.getRowNode(1);
    assert.equal(row_bright.childNodes[1].style.color, fg_bright,
                 'bright color');

    var row_bold = this.terminal.getRowNode(2);
    assert.equal(row_bold.childNodes[1].style.color, fg_bright,
                 'bold color');

    var row_bold_bright = this.terminal.getRowNode(3);
    assert.equal(row_bold_bright.childNodes[1].style.color, fg_bright,
                 'bold bright color');

    var row_bright_bold = this.terminal.getRowNode(4);
    assert.equal(row_bright_bold.childNodes[1].style.color, fg_bright,
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
    assert.equal(text,
                 'plain....... Hi\n' +
                 'bright...... Hi\n' +
                 'bold........ Hi\n' +
                 'bold-bright. Hi\n' +
                 'bright-bold. Hi');

    var fg = attrs.colorPalette[6];
    var fg_bright = attrs.colorPalette[14];

    var row_plain = this.terminal.getRowNode(0);
    assert.equal(row_plain.childNodes[1].style.color, fg,
                 'plain color');

    var row_bright = this.terminal.getRowNode(1);
    assert.equal(row_bright.childNodes[1].style.color, fg_bright,
                 'bright color');

    var row_bold = this.terminal.getRowNode(2);
    assert.equal(row_bold.childNodes[1].style.color, fg,
                 'bold color');

    var row_bold_bright = this.terminal.getRowNode(3);
    assert.equal(row_bold_bright.childNodes[1].style.color, fg_bright,
                 'bold bright color');

    var row_bright_bold = this.terminal.getRowNode(4);
    assert.equal(row_bright_bold.childNodes[1].style.color, fg_bright,
                 'bright bold color');

    result.pass();
  });

/**
 * Test the status report command.
 */
hterm.VT.Tests.addTest('status-report', function(result, cx) {
    var resultString;
    terminal.io.sendString = (str) => resultString = str;

    this.terminal.interpret('\x1b[5n');
    assert.equal(resultString, '\x1b0n');

    resultString = '';

    this.terminal.interpret('line one\r\nline two\r\nline three');
    // Reposition the cursor and ask for a position report.
    this.terminal.interpret('\x1b[5D\x1b[A\x1b[6n');
    assert.equal(resultString, '\x1b[2;6R');

    var text = this.terminal.getRowsText(0, 3);
    assert.equal(text,
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
    assert.isTrue(this.terminal.keyboard.applicationCursor);

    this.terminal.interpret('\x1b[?1l');
    assert.isFalse(this.terminal.keyboard.applicationCursor);

    var fg = this.terminal.prefs_.get('foreground-color');
    var bg = this.terminal.prefs_.get('background-color');

    this.terminal.interpret('\x1b[?5h');
    assert.equal(this.terminal.scrollPort_.getForegroundColor(), bg);
    assert.equal(this.terminal.scrollPort_.getBackgroundColor(), fg);

    this.terminal.interpret('\x1b[?5l');
    assert.equal(this.terminal.scrollPort_.getForegroundColor(), fg);
    assert.equal(this.terminal.scrollPort_.getBackgroundColor(), bg);

    this.terminal.interpret('\x1b[?5l');
    assert.equal(this.terminal.scrollPort_.getForegroundColor(), fg);
    assert.equal(this.terminal.scrollPort_.getBackgroundColor(), bg);

    this.terminal.interpret('\x1b[?6h');
    assert.isTrue(this.terminal.options_.originMode);

    this.terminal.interpret('\x1b[?6l');
    assert.isFalse(this.terminal.options_.originMode);

    this.terminal.interpret('\x1b[4h');
    assert.isTrue(this.terminal.options_.insertMode);

    this.terminal.interpret('\x1b[4l');
    assert.isFalse(this.terminal.options_.insertMode);

    this.terminal.interpret('\x1b[?7h');
    assert.isTrue(this.terminal.options_.wraparound);

    this.terminal.interpret('\x1b[?7l');
    assert.isFalse(this.terminal.options_.wraparound);

    // DEC mode 12 is disabled by default.
    this.terminal.vt.enableDec12 = true;

    this.terminal.interpret('\x1b[?12h');
    assert.isTrue(this.terminal.options_.cursorBlink);
    assert.property(this.terminal.timeouts_, 'cursorBlink');

    this.terminal.interpret('\x1b[?12l');
    assert.isFalse(this.terminal.options_.cursorBlink);
    assert.notProperty(this.terminal.timeouts_, 'cursorBlink');

    // Make sure that enableDec12 is respected.
    this.terminal.vt.enableDec12 = false;

    this.terminal.interpret('\x1b[?12h');
    assert.isFalse(this.terminal.options_.cursorBlink);
    assert.notProperty(this.terminal.timeouts_, 'cursorBlink');

    this.terminal.interpret('\x1b[?25l');
    assert.isFalse(this.terminal.options_.cursorVisible);
    assert.equal(this.terminal.cursorNode_.style.opacity, '0');

    this.terminal.interpret('\x1b[?25h');
    assert.isTrue(this.terminal.options_.cursorVisible);

    // Turn off blink so we know the cursor should be on.
    this.terminal.interpret('\x1b[?12l');
    assert.equal(this.terminal.cursorNode_.style.opacity, '1');

    this.terminal.interpret('\x1b[?45h');
    assert.isTrue(this.terminal.options_.reverseWraparound);

    this.terminal.interpret('\x1b[?45l');
    assert.isFalse(this.terminal.options_.reverseWraparound);

    this.terminal.interpret('\x1b[?67h');
    assert.isTrue(this.terminal.keyboard.backspaceSendsBackspace);

    this.terminal.interpret('\x1b[?67l');
    assert.isFalse(this.terminal.keyboard.backspaceSendsBackspace);

    this.terminal.interpret('\x1b[?1004h]');
    assert.isTrue(this.terminal.reportFocus);

    this.terminal.interpret('\x1b[?1004l]');
    assert.isFalse(this.terminal.reportFocus);

    this.terminal.interpret('\x1b[?1036h');
    assert.isTrue(this.terminal.keyboard.metaSendsEscape);

    this.terminal.interpret('\x1b[?1036l');
    assert.isFalse(this.terminal.keyboard.metaSendsEscape);

    // Save the altSendsWhat setting and change the current setting to something
    // other than 'escape'.
    var previousAltSendsWhat = this.terminal.keyboard.altSendsWhat;
    this.terminal.keyboard.altSendsWhat = '8-bit';

    this.terminal.interpret('\x1b[?1039h');
    assert.equal(this.terminal.keyboard.altSendsWhat, 'escape');

    this.terminal.interpret('\x1b[?1039l');
    assert.equal(this.terminal.keyboard.altSendsWhat, '8-bit');

    // Restore the previous altSendsWhat setting.
    this.terminal.keyboard.altSendsWhat = previousAltSendsWhat;

    assert(this.terminal.screen_ === this.terminal.primaryScreen_);

    this.terminal.interpret('\x1b[?1049h');
    assert(this.terminal.screen_ === this.terminal.alternateScreen_);

    this.terminal.interpret('\x1b[?1049l');
    assert(this.terminal.screen_ === this.terminal.primaryScreen_);

    result.pass();
  });

/**
 * Check parseInt behavior.
 */
hterm.VT.Tests.addTest('parsestate-parseint', function(result, cx) {
  const parserState = new hterm.VT.ParseState();

  // Check default arg handling.
  assert.equal(0, parserState.parseInt(''));
  assert.equal(0, parserState.parseInt('', 0));
  assert.equal(1, parserState.parseInt('', 1));

  // Check default arg handling when explicitly zero.
  assert.equal(0, parserState.parseInt('0'));
  assert.equal(0, parserState.parseInt('0', 0));
  assert.equal(1, parserState.parseInt('0', 1));

  // Check non-default args.
  assert.equal(5, parserState.parseInt('5'));
  assert.equal(5, parserState.parseInt('5', 0));
  assert.equal(5, parserState.parseInt('5', 1));

  result.pass();
});

/**
 * Check iarg handling.
 */
hterm.VT.Tests.addTest('parsestate-iarg', function(result, cx) {
  const parserState = new hterm.VT.ParseState();

  // Check unset args.
  assert.equal(0, parserState.iarg(10));
  assert.equal(1, parserState.iarg(10, 1));

  // Check set args.
  parserState.args = [0, 5];
  assert.equal(0, parserState.iarg(10));
  assert.equal(1, parserState.iarg(10, 1));
  assert.equal(0, parserState.iarg(0));
  assert.equal(1, parserState.iarg(0, 1));
  assert.equal(5, parserState.iarg(1));
  assert.equal(5, parserState.iarg(1, 1));

  result.pass();
});

/**
 * Check handling of subargs.
 */
hterm.VT.Tests.addTest('parsestate-subargs', function(result, cx) {
  const parserState = new hterm.VT.ParseState();

  // Check initial/null state.
  assert.isTrue(!parserState.argHasSubargs(0));
  assert.isTrue(!parserState.argHasSubargs(1000));

  // Mark one arg as having subargs.
  parserState.argSetSubargs(1);
  assert.isTrue(!parserState.argHasSubargs(0));
  assert.isTrue(parserState.argHasSubargs(1));

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
    assert.equal(expSkipCount, ret.skipCount, input);
    assert.equal(expColor, ret.color, input);
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
  assert.equal('solid', ta.underline);
  style = this.terminal.getRowNode(0).childNodes[0].style;
  assert.equal('rgb(110, 120, 130)', style.color);
  assert.equal('rgb(10, 20, 30)', style.backgroundColor);
  text = this.terminal.getRowText(0);
  assert.equal('HI1', text);

  this.terminal.reset();
  this.terminal.clearHome();

  // Check fully colon delimited (xterm-specific): 38:2:R:G:Bm
  this.terminal.interpret('\x1b[38:2:170:180:190;48:2:70:80:90;4mHI2');
  assert.equal('solid', ta.underline);
  style = this.terminal.getRowNode(0).childNodes[0].style;
  assert.equal('rgb(170, 180, 190)', style.color);
  assert.equal('rgb(70, 80, 90)', style.backgroundColor);
  text = this.terminal.getRowText(0);
  assert.equal('HI2', text);

  this.terminal.reset();
  this.terminal.clearHome();

  // Check fully colon delimited (ISO 8613-6): 38:2::R:G:Bm
  this.terminal.interpret('\x1b[38:2::171:181:191;48:2::71:81:91;4mHI3');
  assert.equal('solid', ta.underline);
  style = this.terminal.getRowNode(0).childNodes[0].style;
  assert.equal('rgb(171, 181, 191)', style.color);
  assert.equal('rgb(71, 81, 91)', style.backgroundColor);
  text = this.terminal.getRowText(0);
  assert.equal('HI3', text);

  this.terminal.reset();
  this.terminal.clearHome();

  // Check fully colon delimited w/extra args (ISO 8613-6): 38:2::R:G:B::m
  this.terminal.interpret('\x1b[38:2::172:182:192::;48:2::72:82:92::;4mHI4');
  assert.equal('solid', ta.underline);
  style = this.terminal.getRowNode(0).childNodes[0].style;
  assert.equal('rgb(172, 182, 192)', style.color);
  assert.equal('rgb(72, 82, 92)', style.backgroundColor);
  text = this.terminal.getRowText(0);
  assert.equal('HI4', text);

  this.terminal.reset();
  this.terminal.clearHome();

  // Check fully colon delimited w/too few args (ISO 8613-6): 38:2::R
  this.terminal.interpret('\x1b[38:2::33;48:2::44;4mHI5');
  assert.equal('solid', ta.underline);
  style = this.terminal.getRowNode(0).childNodes[0].style;
  assert.equal('', style.color);
  assert.equal('', style.backgroundColor);
  text = this.terminal.getRowText(0);
  assert.equal('HI5', text);

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
  assert.equal('solid', ta.underline);
  style = this.terminal.getRowNode(0).childNodes[0].style;
  assert.equal('rgb(0, 186, 19)', style.color);
  assert.equal('rgb(0, 0, 215)', style.backgroundColor);
  text = this.terminal.getRowText(0);
  assert.equal('HI1', text);

  this.terminal.reset();
  this.terminal.clearHome();

  // Check fully colon delimited: 38:5:Pm
  this.terminal.interpret('\x1b[38:5:50;48:5:60;4mHI2');
  assert.equal('solid', ta.underline);
  style = this.terminal.getRowNode(0).childNodes[0].style;
  assert.equal('rgb(0, 255, 215)', style.color);
  assert.equal('rgb(95, 95, 135)', style.backgroundColor);
  text = this.terminal.getRowText(0);
  assert.equal('HI2', text);

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
        assert.equal(text, 'True Color Test ' + colors[i][0] + ' and ' +
                     colors[j][0]);

        var bg = getRGB(colors[j]);
        var style = this.terminal.getRowNode(6*i+j).childNodes[1].style;
        assert.equal(style.color, fg);
        assert.equal(style.backgroundColor, bg);
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
  assert.isTrue(ta.bold);
  assert.isTrue(ta.italic);
  assert.equal('solid', ta.underline);
  assert.isFalse(ta.faint);
  assert.isFalse(ta.strikethrough);
  style = this.terminal.getRowNode(0).childNodes[0].style;
  assert.equal('rgb(11, 22, 33)', style.color);
  assert.equal('rgb(33, 22, 11)', style.backgroundColor);
  text = this.terminal.getRowText(0);
  assert.equal('HI1', text);

  this.terminal.reset();
  this.terminal.clearHome();
  assert.isFalse(ta.bold);
  assert.isFalse(ta.italic);
  assert.isFalse(ta.underline);
  assert.isFalse(ta.faint);
  assert.isFalse(ta.strikethrough);

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
  assert.isTrue(ta.bold);
  assert.isTrue(ta.italic);
  assert.equal('solid', ta.underline);
  assert.isFalse(ta.faint);
  assert.isFalse(ta.strikethrough);
  style = this.terminal.getRowNode(0).childNodes[0].style;
  assert.equal('rgb(252, 233, 79)', style.color);
  assert.equal('rgb(0, 95, 0)', style.backgroundColor);
  text = this.terminal.getRowText(0);
  assert.equal('HI2', text);

  result.pass();
});

/**
 * Check various underline modes.
 */
hterm.VT.Tests.addTest('underline-sgr', function(result, cx) {
  const ta = this.terminal.getTextAttributes();

  // Default mode 4: plain underline.
  this.terminal.interpret('\x1b[0;4m');
  assert.equal('solid', ta.underline);

  // 0 subarg turns it off.
  this.terminal.interpret('\x1b[0;4:0m');
  assert.isFalse(ta.underline);

  // 1 subarg is a single underline.
  this.terminal.interpret('\x1b[0;4:1m');
  assert.equal('solid', ta.underline);

  // 2 subarg is double underline.
  this.terminal.interpret('\x1b[0;4:2m');
  assert.equal('double', ta.underline);

  // 3 subarg is wavy underline.
  this.terminal.interpret('\x1b[0;4:3m');
  assert.equal('wavy', ta.underline);

  // 4 subarg is dotted underline.
  this.terminal.interpret('\x1b[0;4:4m');
  assert.equal('dotted', ta.underline);

  // 5 subarg is dashed underline.
  this.terminal.interpret('\x1b[0;4:5m');
  assert.equal('dashed', ta.underline);

  // 6 subarg is unknown -> none.
  this.terminal.interpret('\x1b[0;4:6m');
  assert.isFalse(ta.underline);

  // Check coloring (lightly as SGR 38/48 tests cover it).
  this.terminal.interpret('\x1b[0;4;58:2:10:20:30m');
  assert.equal('solid', ta.underline);
  assert.equal('rgb(10, 20, 30)', ta.underlineSource);

  // Check reset behavior.
  this.terminal.interpret('\x1b[0m');
  assert.isFalse(ta.underline);
  assert.equal(ta.SRC_DEFAULT, ta.underlineSource);

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
    assert.isFalse(this.terminal.options_.insertMode);

    this.terminal.interpret('\x1b[4h');
    this.terminal.interpret(' one\x1b[4Dline\r\n');

    this.terminal.interpret('\x1b[4l');
    this.terminal.interpret('XXXXXXXX\x1b[8Dline two\r\n');

    this.terminal.interpret('\x1b[4h');
    this.terminal.interpret(' three\x1b[6Dline');

    var text = this.terminal.getRowsText(0, 3);
    assert.equal(text,
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
    assert.isTrue(this.terminal.options_.wraparound);

    this.terminal.interpret('-----  1  ----a');
    this.terminal.interpret('-----  2  ----b');
    this.terminal.interpret('-----  3  ----c');
    this.terminal.interpret('-----  4  ----d');
    this.terminal.interpret('-----  5  ----e');
    this.terminal.interpret('-----  6  ----f');

    var text = this.terminal.getRowsText(0, 6);
    assert.equal(text,
                 '-----  1  ----a' +
                 '-----  2  ----b' +
                 '-----  3  ----c' +
                 '-----  4  ----d' +
                 '-----  5  ----e' +
                 '-----  6  ----f');

    assert.equal(this.terminal.getCursorRow(), 5);
    assert.equal(this.terminal.getCursorColumn(), 14);

    result.pass();
  });

hterm.VT.Tests.addTest('wraparound-mode-off', function(result, cx) {
    this.terminal.interpret('\x1b[?7l');
    assert.isFalse(this.terminal.options_.wraparound);

    this.terminal.interpret('-----  1  ----a');
    this.terminal.interpret('-----  2  ----b');
    this.terminal.interpret('-----  3  ----c');
    this.terminal.interpret('-----  4  ----d');
    this.terminal.interpret('-----  5  ----e');
    this.terminal.interpret('-----  6  ----f');

    var text = this.terminal.getRowsText(0, 6);
    assert.equal(text,
                 '-----  1  ----f\n' +
                 '\n' +
                 '\n' +
                 '\n' +
                 '\n');

    assert.equal(this.terminal.getCursorRow(), 0);
    assert.equal(this.terminal.getCursorColumn(), 14);

    result.pass();
  });

/**
 * Test the interactions between insert and wraparound modes.
 */
hterm.VT.Tests.addTest('insert-wrap', function(result, cx) {
    // Should be on by default.
    assert.isTrue(this.terminal.options_.wraparound);

    this.terminal.interpret('' + // Insert off, wrap on (default).
                            '[15GAAAA[1GXX\r\n' +
                            '[4h[?7l' +  // Insert on, wrap off.
                            '[15GAAAA[1GXX\r\n' +
                            '[4h[?7h' +  // Insert on, wrap on.
                            '[15GAAAA[1GXX\r\n' +
                            '[4l[?7l' +  // Insert off, wrap off.
                            '[15GAAAA[1GXX');

    assert.equal(this.terminal.getRowText(0), '              A');
    assert.equal(this.terminal.getRowText(1), 'XXA');
    assert.equal(this.terminal.getRowText(2), 'XX             ');
    assert.equal(this.terminal.getRowText(3), '              A');
    assert.equal(this.terminal.getRowText(4), 'XXAAA');
    assert.equal(this.terminal.getRowText(5), 'XX            A');

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

    assert.equal(this.terminal.getRowText(0), 'XXXXXXXXXXXXXXX');
    assert.equal(this.terminal.getRowText(1), 'XXXXXXXXXXXXXXX');
    assert.equal(this.terminal.getRowText(2), 'XXXXXXXXXXXXXXX');

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

    assert.equal(this.terminal.getRowText(0), 'AAAA');
    assert.equal(this.terminal.getRowText(1), 'XXXXXXXXXXXXXXX');
    assert.equal(this.terminal.getRowText(2), 'BBXXXXXXXXXXXXX');

    // With reverse wraparound, we'll back up to the previous row.
    this.terminal.clearHome();
    this.terminal.interpret('\x1b[?45h' + str);

    assert.equal(this.terminal.getRowText(0), 'AAAA');
    assert.equal(this.terminal.getRowText(1), 'XXXXXXXXXXXXXXB');
    assert.equal(this.terminal.getRowText(2), 'BXXXXXXXXXXXXXX');

    // Reverse wrapping should always go the the final column of the previous
    // row, even if that row was not full of text.
    this.terminal.interpret('\r\b\r\bCC');

    assert.equal(this.terminal.getRowText(0), 'AAAA          C');
    assert.equal(this.terminal.getRowText(1), 'CXXXXXXXXXXXXXB');
    assert.equal(this.terminal.getRowText(2), 'BXXXXXXXXXXXXXX');

    // Reverse wrapping past the first row should put us at the last row.
    this.terminal.interpret('\r\b\r\bX');
    assert.equal(this.terminal.getRowText(0), 'AAAA          C');
    assert.equal(this.terminal.getRowText(1), 'CXXXXXXXXXXXXXB');
    assert.equal(this.terminal.getRowText(2), 'BXXXXXXXXXXXXXX');
    assert.equal(this.terminal.getRowText(3), '');
    assert.equal(this.terminal.getRowText(4), '');
    assert.equal(this.terminal.getRowText(5), '              X');

    result.pass();
  });

/**
 * Test interactions between the cursor overflow bit and various
 * escape sequences.
 */
hterm.VT.Tests.addTest('cursor-overflow', function(result, cx) {
    // Should be on by default.
    assert.isTrue(this.terminal.options_.wraparound);

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
    assert.equal(text,
                 '-----  1  ----X' +
                 '-----  2  -----' +
                 '-----  3  -----' +
                 '-----  4  -----' +
                 '-----  5  ----X' +
                 '              -');

    assert.equal(this.terminal.getCursorRow(), 5);
    assert.equal(this.terminal.getCursorColumn(), 14);

    result.pass();
  });

hterm.VT.Tests.addTest('alternate-screen', function(result, cx) {
    this.terminal.interpret('1\r\n2\r\n3\r\n4\r\n5\r\n6\r\n7\r\n8\r\n9\r\n10');
    this.terminal.interpret('\x1b[3;3f');  // Leave the cursor at (3,3)
    var text = this.terminal.getRowsText(0, 10);
    assert.equal(text, '1\n2\n3\n4\n5\n6\n7\n8\n9\n10');

    // Switch to alternate screen.
    this.terminal.interpret('\x1b[?1049h');
    text = this.terminal.getRowsText(0, 10);
    assert.equal(text, '1\n2\n3\n4\n\n\n\n\n\n');

    this.terminal.interpret('\r\nhi');
    text = this.terminal.getRowsText(0, 10);
    assert.equal(text, '1\n2\n3\n4\n\n\n\nhi\n\n');

    // Switch back to primary screen.
    this.terminal.interpret('\x1b[?1049l');
    text = this.terminal.getRowsText(0, 10);
    assert.equal(text, '1\n2\n3\n4\n5\n6\n7\n8\n9\n10');

    this.terminal.interpret('XX');
    text = this.terminal.getRowsText(0, 10);
    assert.equal(text, '1\n2\n3\n4\n5\n6\n7 XX\n8\n9\n10');

    // And back to alternate screen.
    this.terminal.interpret('\x1b[?1049h');
    text = this.terminal.getRowsText(0, 10);
    assert.equal(text, '1\n2\n3\n4\n\n\n\n\n\n');

    this.terminal.interpret('XX');
    text = this.terminal.getRowsText(0, 10);
    assert.equal(text, '1\n2\n3\n4\n\n\n    XX\n\n\n');

    result.pass();
  });

/**
 * Test basic hyperlinks.
 */
hterm.VT.Tests.addTest('OSC-8', function(result, cx) {
  const tattrs = this.terminal.getTextAttributes();

  // Start with links off.
  assert.isNull(tattrs.uriId);
  assert.isNull(tattrs.uri);

  // Start to linkify some text.
  this.terminal.interpret('\x1b]8;id=foo;http://foo\x07');
  assert.equal('foo', tattrs.uriId);
  assert.equal('http://foo', tattrs.uri);

  // Add the actual text.
  this.terminal.interpret('click me');

  // Stop the link.
  this.terminal.interpret('\x1b]8;\x07');
  assert.isNull(tattrs.uriId);
  assert.isNull(tattrs.uri);

  // Check the link.
  // XXX: Can't check the URI target due to binding via event listener.
  const row = this.terminal.getRowNode(0);
  const span = row.childNodes[0];
  assert.equal('foo', span.uriId);
  assert.equal('click me', span.textContent);
  assert.equal('uri-node', span.className);

  result.pass();
});

/**
 * Test hyperlinks with blank ids.
 */
hterm.VT.Tests.addTest('OSC-8-blank-id', function(result, cx) {
  const tattrs = this.terminal.getTextAttributes();

  // Create a link with a blank id.
  this.terminal.interpret('\x1b]8;;http://foo\x07click\x1b]8;\x07');
  assert.isNull(tattrs.uriId);
  assert.isNull(tattrs.uri);

  // Check the link.
  // XXX: Can't check the URI target due to binding via event listener.
  const row = this.terminal.getRowNode(0);
  const span = row.childNodes[0];
  assert.equal('', span.uriId);
  assert.equal('click', span.textContent);
  assert.equal('uri-node', span.className);

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
  assert.isNull(tattrs.uriId);
  assert.isNull(tattrs.uri);

  // Check the links.
  // XXX: Can't check the URI target due to binding via event listener.
  const row = this.terminal.getRowNode(0);
  let span = row.childNodes[0];
  assert.equal('foo', span.uriId);
  assert.equal('click', span.textContent);
  assert.equal('uri-node', span.className);

  span = row.childNodes[1];
  assert.equal('', span.uriId);
  assert.equal('bat', span.textContent);
  assert.equal('uri-node', span.className);

  result.pass();
});

/**
 * Test iTerm2 growl notifications.
 */
hterm.VT.Tests.addTest('OSC-9', function(result, cx) {
    assert.equal(0, Notification.count);

    // We don't test the title as it's generated, and the iTerm2 API doesn't
    // support changing it.

    // An empty notification.
    this.terminal.interpret('\x1b]9;\x07');
    assert.equal(1, Notification.count);
    assert.equal('', Notification.call.body);

    // A random notification.
    this.terminal.interpret('\x1b]9;this is a title\x07');
    assert.equal(2, Notification.count);
    assert.equal('this is a title', Notification.call.body);

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
    assert.equal('rgb(255, 0, 0)', this.terminal.getForegroundColor());

    this.terminal.interpret('\x1b]10;white\x07');
    assert.equal('rgb(255, 255, 255)', this.terminal.getForegroundColor());

    // Make sure other colors aren't changed by accident.
    assert.equal(backColor, this.terminal.getBackgroundColor());
    assert.equal(cursorColor, this.terminal.getCursorColor());

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
    assert.equal('rgb(255, 0, 0)', this.terminal.getBackgroundColor());

    this.terminal.interpret('\x1b]11;white\x07');
    assert.equal('rgb(255, 255, 255)', this.terminal.getBackgroundColor());

    // Make sure other colors aren't changed by accident.
    assert.equal(foreColor, this.terminal.getForegroundColor());
    assert.equal(cursorColor, this.terminal.getCursorColor());

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
    assert.equal('rgb(255, 0, 0)', this.terminal.getCursorColor());

    this.terminal.interpret('\x1b]12;white\x07');
    assert.equal('rgb(255, 255, 255)', this.terminal.getCursorColor());

    // Make sure other colors aren't changed by accident.
    assert.equal(foreColor, this.terminal.getForegroundColor());
    assert.equal(backColor, this.terminal.getBackgroundColor());

    result.pass();
  });

/**
 * Verify chaining color change requests.
 */
hterm.VT.Tests.addTest('OSC-10-11-12', function(result, cx) {
    // Set 10-11-12 at once.
    this.terminal.interpret('\x1b]10;red;green;blue\x07');
    assert.equal('rgb(255, 0, 0)', this.terminal.getForegroundColor());
    assert.equal('rgb(0, 255, 0)', this.terminal.getBackgroundColor());
    assert.equal('rgb(0, 0, 255)', this.terminal.getCursorColor());

    // Set 11-12 at once (and 10 stays the same).
    this.terminal.interpret('\x1b]11;white;black\x07');
    assert.equal('rgb(255, 0, 0)', this.terminal.getForegroundColor());
    assert.equal('rgb(255, 255, 255)', this.terminal.getBackgroundColor());
    assert.equal('rgb(0, 0, 0)', this.terminal.getCursorColor());

    result.pass();
  });

/**
 * Test that we can use OSC 52 to copy to the system clipboard.
 */
hterm.VT.Tests.addTest('OSC-52', function(result, cx) {
    // Mock this out since we can't document.execCommand from the
    // test harness.
    var old_cCSTC = hterm.copySelectionToClipboard;
    hterm.copySelectionToClipboard = function(document, str) {
      hterm.copySelectionToClipboard = old_cCSTC;
      assert.equal(str, 'copypasta!');
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
    hterm.copySelectionToClipboard = function(document, str) {
      hterm.copySelectionToClipboard = old_cCSTC;
      assert.equal(str, expect);
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

    this.terminal.io.sendString = (str) => resultString = str;
    // Change the terminal palette, then read it back.
    this.terminal.interpret('\x1b]4;1;rgb:0100/0100/0100;' +
                            '2;rgb:beef/beef/beef\x07');
    this.terminal.interpret('\x1b]4;1;?;2;?\x07');
    // The values go through some normalization, so what we read isn't
    // *exactly* what went in.
    assert.equal(resultString, '\x1b]4;1;rgb:0101/0101/0101;' +
                               '2;rgb:bebe/bebe/bebe\x07');

    // Round trip the normalized values, to check that the normalization is
    // idempotent.
    this.terminal.interpret('\x1b]4;1;rgb:0101/0101/0101;2;' +
                            'rgb:bebe/bebe/bebe\x07');
    assert.equal(resultString, '\x1b]4;1;rgb:0101/0101/0101;' +
                               '2;rgb:bebe/bebe/bebe\x07');
    result.pass();
  });

/**
 * Test the cursor shape changes using OSC 50.
 */
hterm.VT.Tests.addTest('OSC-50, cursor shapes', function(result, cx) {
    assert.strictEqual(this.terminal.getCursorShape(),
                       hterm.Terminal.cursorShape.BLOCK);

    this.terminal.interpret('\x1b]50;CursorShape=1\x07');
    this.terminal.syncCursorPosition_();
    assert.strictEqual(this.terminal.getCursorShape(),
                       hterm.Terminal.cursorShape.BEAM);

    this.terminal.interpret('\x1b]50;CursorShape=0\x07');
    this.terminal.syncCursorPosition_();
    assert.strictEqual(this.terminal.getCursorShape(),
                       hterm.Terminal.cursorShape.BLOCK);

    this.terminal.interpret('\x1b]50;CursorShape=2\x07');
    this.terminal.syncCursorPosition_();
    assert.strictEqual(this.terminal.getCursorShape(),
                       hterm.Terminal.cursorShape.UNDERLINE);

    // Invalid shape, should be set cursor to block
    this.terminal.interpret('\x1b]50;CursorShape=a\x07');
    this.terminal.syncCursorPosition_();
    assert.strictEqual(this.terminal.getCursorShape(),
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
  assert.equal('rgb(255, 0, 0)', this.terminal.getForegroundColor());

  this.terminal.interpret('\x1b]110;\x07');
  assert.equal('rgb(240, 240, 240)', this.terminal.getForegroundColor());

  // Make sure other colors aren't changed by accident.
  assert.equal(backColor, this.terminal.getBackgroundColor());
  assert.equal(cursorColor, this.terminal.getCursorColor());

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
  assert.equal('rgb(255, 0, 0)', this.terminal.getBackgroundColor());

  this.terminal.interpret('\x1b]111;\x07');
  assert.equal('rgb(16, 16, 16)', this.terminal.getBackgroundColor());

  // Make sure other colors aren't changed by accident.
  assert.equal(foreColor, this.terminal.getForegroundColor());
  assert.equal(cursorColor, this.terminal.getCursorColor());

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
  assert.equal('rgb(255, 0, 0)', this.terminal.getCursorColor());

  this.terminal.interpret('\x1b]112;\x07');
  assert.equal('rgba(255, 0, 0, 0.5)', this.terminal.getCursorColor());

  // Make sure other colors aren't changed by accident.
  assert.equal(foreColor, this.terminal.getForegroundColor());
  assert.equal(backColor, this.terminal.getBackgroundColor());

  result.pass();
});

/**
 * Test URxvt notify module.
 */
hterm.VT.Tests.addTest('OSC-777-notify', function(result, cx) {
    assert.equal(0, Notification.count);

    // An empty notification.  We don't test the title as it's generated.
    this.terminal.interpret('\x1b]777;notify\x07');
    assert.equal(1, Notification.count);
    assert.notEqual(Notification.call.title, '');
    assert.isUndefined(Notification.call.body);

    // Same as above, but covers slightly different parsing.
    this.terminal.interpret('\x1b]777;notify;\x07');
    assert.equal(2, Notification.count);
    assert.notEqual(Notification.call.title, '');
    assert.isUndefined(Notification.call.body);

    // A notification with a title.
    this.terminal.interpret('\x1b]777;notify;my title\x07');
    assert.equal(3, Notification.count);
    assert.include(Notification.call.title, 'my title');
    assert.isUndefined(Notification.call.body);

    // A notification with a title & body.
    this.terminal.interpret('\x1b]777;notify;my title;my body\x07');
    assert.equal(4, Notification.count);
    assert.include(Notification.call.title, 'my title');
    assert.include(Notification.call.body, 'my body');

    // A notification with a title & body, covering more parsing.
    this.terminal.interpret('\x1b]777;notify;my title;my body;and a semi\x07');
    assert.equal(5, Notification.count);
    assert.include(Notification.call.title, 'my title');
    assert.include(Notification.call.body, 'my body;and a semi');

    result.pass();
  });

/**
 * Test iTerm2 1337 non-file transfers.
 */
hterm.VT.Tests.addTest('OSC-1337-ignore', function(result, cx) {
  this.terminal.displayImage =
      () => assert.fail('Unknown should not trigger file display');

  this.terminal.interpret('\x1b]1337;CursorShape=1\x07');

  result.pass();
});

/**
 * Test iTerm2 1337 file transfer defaults.
 */
hterm.VT.Tests.addTest('OSC-1337-file-defaults', function(result, cx) {
  this.terminal.displayImage = (options) => {
    assert.equal('', options.name);
    assert.equal(0, options.size);
    assert.isTrue(options.preserveAspectRatio);
    assert.isFalse(options.inline);
    assert.equal('auto', options.width);
    assert.equal('auto', options.height);
    assert.equal('left', options.align);
    assert.isUndefined(options.uri);
    assert.deepStrictEqual(new Uint8Array([10]).buffer, options.buffer);
    result.pass();
  };

  this.terminal.interpret('\x1b]1337;File=:Cg==\x07');
});

/**
 * Test iTerm2 1337 invalid values.
 */
hterm.VT.Tests.addTest('OSC-1337-file-invalid', function(result, cx) {
  this.terminal.displayImage = (options) => {
    assert.equal('', options.name);
    assert.equal(1, options.size);
    assert.isUndefined(options.unk);
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
    assert.isFalse(options.preserveAspectRatio);
    assert.isFalse(options.inline);
  };
  this.terminal.interpret(
      '\x1b]1337;File=preserveAspectRatio=0;inline=0:Cg==\x07');

  // Check "true" values.
  this.terminal.displayImage = (options) => {
    assert.isTrue(options.preserveAspectRatio);
    assert.isTrue(options.inline);
  };
  this.terminal.interpret(
      '\x1b]1337;File=preserveAspectRatio=1;inline=1:Cg==\x07');

  // Check the rest.
  this.terminal.displayImage = (options) => {
    assert.equal('yes', options.name);
    assert.equal(1234, options.size);
    assert.equal('12px', options.width);
    assert.equal('50%', options.height);
    assert.equal('center', options.align);

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
  assert.equal('OK', text);

  // For inline files, things should be delayed.
  // The io/timeout logic is supposed to mock the normal behavior.
  this.terminal.displayImage = function() {
    const io = this.io.push();
    setTimeout(() => {
      io.pop();
      text = this.getRowsText(0, 1);
      assert.equal('OK', text);
      result.pass();
    }, 0);
  };
  this.terminal.clearHome();
  this.terminal.interpret('\x1b]1337;File=inline=1:Cg==\x07OK');
  text = this.terminal.getRowsText(0, 1);
  assert.equal('', text);

  result.requestTime(200);
});

/**
 * Test the cursor shape changes using DECSCUSR.
 */
hterm.VT.Tests.addTest('DECSCUSR, cursor shapes', function(result, cx) {
    assert.strictEqual(this.terminal.getCursorShape(),
                       hterm.Terminal.cursorShape.BLOCK);
    assert.isFalse(this.terminal.options_.cursorBlink);

    this.terminal.interpret('\x1b[ 3q');
    this.terminal.syncCursorPosition_();
    assert.strictEqual(this.terminal.getCursorShape(),
                       hterm.Terminal.cursorShape.UNDERLINE);
    assert.isTrue(this.terminal.options_.cursorBlink);

    this.terminal.interpret('\x1b[ 0q');
    this.terminal.syncCursorPosition_();
    assert.strictEqual(this.terminal.getCursorShape(),
                       hterm.Terminal.cursorShape.BLOCK);
    assert.isTrue(this.terminal.options_.cursorBlink);

    this.terminal.interpret('\x1b[ 1q');
    this.terminal.syncCursorPosition_();
    assert.strictEqual(this.terminal.getCursorShape(),
                       hterm.Terminal.cursorShape.BLOCK);
    assert.isTrue(this.terminal.options_.cursorBlink);

    this.terminal.interpret('\x1b[ 4q');
    this.terminal.syncCursorPosition_();
    assert.strictEqual(this.terminal.getCursorShape(),
                       hterm.Terminal.cursorShape.UNDERLINE);
    assert.isFalse(this.terminal.options_.cursorBlink);

    this.terminal.interpret('\x1b[ 2q');
    this.terminal.syncCursorPosition_();
    assert.strictEqual(this.terminal.getCursorShape(),
                       hterm.Terminal.cursorShape.BLOCK);
    assert.isFalse(this.terminal.options_.cursorBlink);

    result.pass();
  });

hterm.VT.Tests.addTest('bracketed-paste', function(result, cx) {
    var resultString;
    terminal.io.sendString = (str) => resultString = str;

    assert.isFalse(this.terminal.options_.bracketedPaste);

    this.terminal.interpret('\x1b[?2004h');
    assert.isTrue(this.terminal.options_.bracketedPaste);

    this.terminal.onPaste_({text: 'hello world'});
    assert.equal(resultString, '\x1b[200~hello world\x1b[201~');

    this.terminal.interpret('\x1b[?2004l');
    assert.isFalse(this.terminal.options_.bracketedPaste);

    this.terminal.onPaste_({text: 'hello world'});
    assert.equal(resultString, 'hello world');

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
    assert.equal(this.terminal.getRowText(0), line);

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
      assert.equal(this.terminal.getRowText(0), gl(line));
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
    assert.isFalse(this.terminal.vt.codingSystemUtf8_);
    assert.isFalse(this.terminal.vt.codingSystemLocked_);
    this.terminal.clearHome();
    this.terminal.interpret(line);
    assert.equal(this.terminal.getRowText(0), line);

    // Switch to the graphics map and make sure it translates.
    this.terminal.clearHome();
    this.terminal.interpret('\x1b(0' + line);
    assert.equal(this.terminal.getRowText(0), graphicsLine);

    // Switch to UTF-8 encoding.  The graphics map should not translate.
    this.terminal.clearHome();
    this.terminal.interpret('\x1b%G' + line);
    assert.isTrue(this.terminal.vt.codingSystemUtf8_);
    assert.isFalse(this.terminal.vt.codingSystemLocked_);
    assert.equal(this.terminal.getRowText(0), line);

    // Switch to ECMA-35 encoding.  The graphics map should translate.
    this.terminal.clearHome();
    this.terminal.interpret('\x1b%@' + line);
    assert.isFalse(this.terminal.vt.codingSystemUtf8_);
    assert.isFalse(this.terminal.vt.codingSystemLocked_);
    assert.equal(this.terminal.getRowText(0), graphicsLine);

    // Switch to UTF-8 encoding (and lock).
    this.terminal.clearHome();
    this.terminal.interpret('\x1b%/G' + line);
    assert.isTrue(this.terminal.vt.codingSystemUtf8_);
    assert.isTrue(this.terminal.vt.codingSystemLocked_);
    assert.equal(this.terminal.getRowText(0), line);

    // Switching back to ECMA-35 should not work now.
    this.terminal.clearHome();
    this.terminal.interpret('\x1b%@' + line);
    assert.isTrue(this.terminal.vt.codingSystemUtf8_);
    assert.isTrue(this.terminal.vt.codingSystemLocked_);
    assert.equal(this.terminal.getRowText(0), line);

    // Try other UTF-8 modes (although they're the same as /G).
    this.terminal.clearHome();
    this.terminal.interpret('\x1b%/H' + line);
    assert.isTrue(this.terminal.vt.codingSystemUtf8_);
    assert.isTrue(this.terminal.vt.codingSystemLocked_);
    assert.equal(this.terminal.getRowText(0), line);

    this.terminal.clearHome();
    this.terminal.interpret('\x1b%/I' + line);
    assert.isTrue(this.terminal.vt.codingSystemUtf8_);
    assert.isTrue(this.terminal.vt.codingSystemLocked_);
    assert.equal(this.terminal.getRowText(0), line);

    result.pass();
  });

/**
 * Verify DOCS (encoding) invalid escapes don't mess things up.
 */
hterm.VT.Tests.addTest('docs-invalid', function(result, cx) {
    // Check the default encoding (ECMA-35).
    assert.isFalse(this.terminal.vt.codingSystemUtf8_);
    assert.isFalse(this.terminal.vt.codingSystemLocked_);

    // Try switching to a random set of invalid escapes.
    var ch;
    ['a', '9', 'X', '(', '}'].forEach((ch) => {
      // First in ECMA-35 encoding.
      this.terminal.interpret('\x1b%@');
      this.terminal.interpret('\x1b%' + ch);
      assert.isFalse(this.terminal.vt.codingSystemUtf8_);
      assert.isFalse(this.terminal.vt.codingSystemLocked_);
      assert.equal(this.terminal.getRowText(0), '');

      this.terminal.interpret('\x1b%/' + ch);
      assert.isFalse(this.terminal.vt.codingSystemUtf8_);
      assert.isFalse(this.terminal.vt.codingSystemLocked_);
      assert.equal(this.terminal.getRowText(0), '');

      // Then in UTF-8 encoding.
      this.terminal.interpret('\x1b%G');
      this.terminal.interpret('\x1b%' + ch);
      assert.isTrue(this.terminal.vt.codingSystemUtf8_);
      assert.isFalse(this.terminal.vt.codingSystemLocked_);
      assert.equal(this.terminal.getRowText(0), '');

      this.terminal.interpret('\x1b%/' + ch);
      assert.isTrue(this.terminal.vt.codingSystemUtf8_);
      assert.isFalse(this.terminal.vt.codingSystemLocked_);
      assert.equal(this.terminal.getRowText(0), '');
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
  assert.isTrue(tattrs.bold);
  assert.equal('solid', tattrs.underline);

  // Change color palette a bit.
  assert.equal('rgb(0, 0, 0)', tattrs.colorPalette[0]);
  assert.equal('rgb(204, 0, 0)', tattrs.colorPalette[1]);
  this.terminal.interpret('\x1b]4;1;#112233;\x07');
  assert.equal('rgb(0, 0, 0)', tattrs.colorPalette[0]);
  assert.equal('rgba(17, 34, 51, 1)', tattrs.colorPalette[1]);

  // Restore the saved cursor state.
  this.terminal.interpret('\x1b[?1048l');

  // Check attributes were restored correctly.
  tattrs = this.terminal.getTextAttributes();
  assert.isFalse(tattrs.bold);
  assert.isFalse(tattrs.underline);

  // Make sure color palette did not change.
  assert.equal('rgb(0, 0, 0)', tattrs.colorPalette[0]);
  assert.equal('rgba(17, 34, 51, 1)', tattrs.colorPalette[1]);

  result.pass();
});

/**
 * Check different mouse mode selection.
 */
hterm.VT.Tests.addTest('mouse-switching', function(result, cx) {
  const terminal = this.terminal;

  const assertMouse = (report, coordinates) => {
    assert.strictEqual(report, terminal.vt.mouseReport);
    assert.strictEqual(coordinates, terminal.vt.mouseCoordinates);
  };

  // Mouse reporting is turned off by default (and in legacy X10).
  assertMouse(terminal.vt.MOUSE_REPORT_DISABLED,
              terminal.vt.MOUSE_COORDINATES_X10);

  // Turn on presses.
  terminal.interpret('\x1b[?9h');
  assertMouse(terminal.vt.MOUSE_REPORT_PRESS,
              terminal.vt.MOUSE_COORDINATES_X10);
  // Reset back.
  terminal.interpret('\x1b[?9l');
  assertMouse(terminal.vt.MOUSE_REPORT_DISABLED,
              terminal.vt.MOUSE_COORDINATES_X10);

  // Turn on drags.
  terminal.interpret('\x1b[?1002h');
  assertMouse(terminal.vt.MOUSE_REPORT_DRAG,
              terminal.vt.MOUSE_COORDINATES_X10);
  // Reset back.
  terminal.interpret('\x1b[?1002l');
  assertMouse(terminal.vt.MOUSE_REPORT_DISABLED,
              terminal.vt.MOUSE_COORDINATES_X10);

  // Resetting a different mode should also work.
  terminal.interpret('\x1b[?9h');
  assertMouse(terminal.vt.MOUSE_REPORT_PRESS,
              terminal.vt.MOUSE_COORDINATES_X10);
  terminal.interpret('\x1b[?1002l');
  assertMouse(terminal.vt.MOUSE_REPORT_DISABLED,
              terminal.vt.MOUSE_COORDINATES_X10);

  // Enable extended encoding.
  terminal.interpret('\x1b[?1005h');
  assertMouse(terminal.vt.MOUSE_REPORT_DISABLED,
              terminal.vt.MOUSE_COORDINATES_UTF8);
  terminal.interpret('\x1b[?9h');
  assertMouse(terminal.vt.MOUSE_REPORT_PRESS,
              terminal.vt.MOUSE_COORDINATES_UTF8);

  // Enable SGR encoding.
  terminal.interpret('\x1b[?1006h');
  assertMouse(terminal.vt.MOUSE_REPORT_PRESS,
              terminal.vt.MOUSE_COORDINATES_SGR);

  result.pass();
});

/**
 * Check mouse behavior when reporting is disabled.
 */
hterm.VT.Tests.addTest('mouse-disabled', function(result, cx) {
  const terminal = this.terminal;
  let e;

  let resultString;
  terminal.io.sendString = (str) => resultString = str;

  // Nothing should be generated when reporting is disabled (the default).
  e = MockTerminalMouseEvent('mousedown');
  terminal.vt.onTerminalMouse_(e);
  e = MockTerminalMouseEvent('mouseup');
  terminal.vt.onTerminalMouse_(e);

  assert.isUndefined(resultString);
  result.pass();
});

/**
 * Check mouse behavior when press reports are enabled.
 */
hterm.VT.Tests.addTest('mouse-report-press', function(result, cx) {
  const terminal = this.terminal;
  let e;

  let resultString;
  terminal.io.sendString = (str) => resultString = str;

  // Turn on presses.
  terminal.interpret('\x1b[?9h');

  // Send a mousedown event and check the report.
  e = MockTerminalMouseEvent('mousedown');
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[M   ', resultString);
  resultString = undefined;

  // Mouse move events should be ignored.
  e = MockTerminalMouseEvent('mousemove', {terminalRow: 1, buttons: 1});
  terminal.vt.onTerminalMouse_(e);
  assert.isUndefined(resultString);

  // Mouse up events should be ignored.
  e = MockTerminalMouseEvent('mouseup');
  terminal.vt.onTerminalMouse_(e);
  assert.isUndefined(resultString);

  result.pass();
});

/**
 * Check mouse press behavior with keyboard modifiers.
 *
 * Namely, keyboard modifiers shouldn't be reported.
 */
hterm.VT.Tests.addTest('mouse-report-press-keyboard', function(result, cx) {
  const terminal = this.terminal;
  let e;

  let resultString;
  terminal.io.sendString = (str) => resultString = str;

  // Turn on clicks.
  terminal.interpret('\x1b[?9h');

  // Switch to SGR coordinates to make tests below easier.
  terminal.interpret('\x1b[?1006h');

  // Check left mouse w/no keyboard.
  e = MockTerminalMouseEvent('mousedown');
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<0;0;0M', resultString);
  resultString = undefined;

  // Check various key combos are not reported.
  e = MockTerminalMouseEvent('mousedown', {shiftKey: true});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<0;0;0M', resultString);
  resultString = undefined;

  e = MockTerminalMouseEvent('mousedown', {altKey: true});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<0;0;0M', resultString);
  resultString = undefined;

  e = MockTerminalMouseEvent('mousedown', {metaKey: true});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<0;0;0M', resultString);
  resultString = undefined;

  e = MockTerminalMouseEvent('mousedown', {ctrlKey: true});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<0;0;0M', resultString);
  resultString = undefined;

  e = MockTerminalMouseEvent('mousedown', {shiftKey: true, metaKey: true});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<0;0;0M', resultString);
  resultString = undefined;

  result.pass();
});

/**
 * Check mouse press behavior in X10 coordinates.
 */
hterm.VT.Tests.addTest('mouse-press-x10-coord', function(result, cx) {
  const terminal = this.terminal;
  let e;

  let resultString;
  terminal.io.sendString = (str) => resultString = str;

  // Turn on presses.  Default is X10 coordinates.
  terminal.interpret('\x1b[?9h');

  // Check 0,0 cell.
  e = MockTerminalMouseEvent('mousedown');
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[M   ', resultString);

  // Check the 7-bit limit.
  e = MockTerminalMouseEvent('mousedown', {terminalRow: 95, terminalColumn: 94});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[M \x7e\x7f', resultString);

/*
  These are disabled because we currently clamp X10 reporting to 7-bit.

  // Check 150,100 cell.
  e = MockTerminalMouseEvent('mousedown', {terminalRow: 150, terminalColumn: 100});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[M \x84\xb6', resultString);

  // Check 222,222 cell (just below max range).
  e = MockTerminalMouseEvent('mousedown', {terminalRow: 222, terminalColumn: 222});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[M \xfe\xfe', resultString);

  // Check 223,223 cell (max range).
  e = MockTerminalMouseEvent('mousedown', {terminalRow: 223, terminalColumn: 223});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[M \xff\xff', resultString);

  // Check 300,300 cell (out of range).
  e = MockTerminalMouseEvent('mousedown', {terminalRow: 300, terminalColumn: 300});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[M \xff\xff', resultString);
*/

  result.pass();
});

/**
 * Check mouse press behavior in UTF8 coordinates.
 */
hterm.VT.Tests.addTest('mouse-press-utf8-coord', function(result, cx) {
  const terminal = this.terminal;
  let e;

  let resultString;
  terminal.io.sendString = (str) => resultString = str;

  // Turn on presses.
  terminal.interpret('\x1b[?9h');

  // Switch to UTF8 coordinates.
  terminal.interpret('\x1b[?1005h');

  // Check 0,0 cell.
  e = MockTerminalMouseEvent('mousedown');
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[M   ', resultString);

  // Check 150,100 cell.
  e = MockTerminalMouseEvent('mousedown', {terminalRow: 150, terminalColumn: 100});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[M \x84\xb6', resultString);

  // Check 2000,2000 cell.
  e = MockTerminalMouseEvent(
      'mousedown', {terminalRow: 2000, terminalColumn: 2000});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[M \u07f0\u07f0', resultString);

  // Check 2014,2014 cell (just below max range).
  e = MockTerminalMouseEvent(
      'mousedown', {terminalRow: 2014, terminalColumn: 2014});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[M \u07fe\u07fe', resultString);

  // Check 2015,2015 cell (max range).
  e = MockTerminalMouseEvent(
      'mousedown', {terminalRow: 2015, terminalColumn: 2015});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[M \u07ff\u07ff', resultString);

  // Check 3000,3000 cell (out of range).
  e = MockTerminalMouseEvent(
      'mousedown', {terminalRow: 3000, terminalColumn: 3000});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[M \u07ff\u07ff', resultString);

  result.pass();
});

/**
 * Check mouse press behavior in SGR coordinates.
 */
hterm.VT.Tests.addTest('mouse-press-sgr-coord', function(result, cx) {
  const terminal = this.terminal;
  let e;

  let resultString;
  terminal.io.sendString = (str) => resultString = str;

  // Turn on presses.
  terminal.interpret('\x1b[?9h');

  // Switch to SGR coordinates.
  terminal.interpret('\x1b[?1006h');

  // Check 0,0 cell.
  e = MockTerminalMouseEvent('mousedown');
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<0;0;0M', resultString);

  // Check 150,100 cell.
  e = MockTerminalMouseEvent('mousedown', {terminalRow: 150, terminalColumn: 100});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<0;100;150M', resultString);

  // Check 2000,3000 cell.
  e = MockTerminalMouseEvent(
      'mousedown', {terminalRow: 2000, terminalColumn: 3000});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<0;3000;2000M', resultString);

  // Check 99999,55555 cell.
  e = MockTerminalMouseEvent(
      'mousedown', {terminalRow: 99999, terminalColumn: 55555});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<0;55555;99999M', resultString);

  result.pass();
});

/**
 * Check mouse behavior when press clicks are enabled.
 */
hterm.VT.Tests.addTest('mouse-report-click', function(result, cx) {
  const terminal = this.terminal;
  let e;

  let resultString;
  terminal.io.sendString = (str) => resultString = str;

  // Turn on clicks.
  terminal.interpret('\x1b[?1000h');

  // Send a mousedown event and check the report.
  e = MockTerminalMouseEvent('mousedown');
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[M   ', resultString);
  resultString = undefined;

  // Mouse move events should be ignored.
  e = MockTerminalMouseEvent('mousemove', {terminalRow: 1, buttons: 1});
  terminal.vt.onTerminalMouse_(e);
  assert.isUndefined(resultString);

  // Mouse up events should be reported.
  e = MockTerminalMouseEvent('mouseup');
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[M#  ', resultString);

  result.pass();
});

/**
 * Check mouse click behavior with buttons.
 *
 * Note: Most of the mouseup events in here lie and say that a button was
 * released ('mouseup') while saying it's still pressed ('buttons').  The
 * VT code doesn't check for this, so (ab)use this to simplify the test.
 */
hterm.VT.Tests.addTest('mouse-report-click-buttons', function(result, cx) {
  const terminal = this.terminal;
  let e;

  let resultString;
  terminal.io.sendString = (str) => resultString = str;

  // Turn on clicks.
  terminal.interpret('\x1b[?1000h');

  // Switch to SGR coordinates to make tests below easier.
  terminal.interpret('\x1b[?1006h');

  // Check left mouse w/no keyboard.
  e = MockTerminalMouseEvent('mousedown', {button: 0, buttons: 1});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<0;0;0M', resultString);

  e = MockTerminalMouseEvent('mouseup', {button: 0, buttons: 1});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<0;0;0m', resultString);

  // Check right mouse w/no keyboard.
  e = MockTerminalMouseEvent('mousedown', {button: 2, buttons: 2});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<2;0;0M', resultString);

  e = MockTerminalMouseEvent('mouseup', {button: 2, buttons: 2});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<2;0;0m', resultString);

  // Check middle mouse w/no keyboard.
  e = MockTerminalMouseEvent('mousedown', {button: 1, buttons: 4});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<1;0;0M', resultString);

  e = MockTerminalMouseEvent('mouseup', {button: 1, buttons: 4});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<1;0;0m', resultString);

  // Check pressing multiple buttons and then releasing them.
  e = MockTerminalMouseEvent('mousedown', {button: 0, buttons: 1});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<0;0;0M', resultString);
  e = MockTerminalMouseEvent('mousedown', {button: 2, buttons: 3});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<2;0;0M', resultString);
  e = MockTerminalMouseEvent('mousedown', {button: 1, buttons: 7});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<1;0;0M', resultString);

  e = MockTerminalMouseEvent('mouseup', {button: 0, buttons: 7});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<0;0;0m', resultString);
  e = MockTerminalMouseEvent('mouseup', {button: 0, buttons: 6});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<0;0;0m', resultString);
  e = MockTerminalMouseEvent('mouseup', {button: 2, buttons: 4});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<2;0;0m', resultString);
  e = MockTerminalMouseEvent('mouseup', {button: 1, buttons: 0});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<1;0;0m', resultString);

  result.pass();
});

/**
 * Check mouse click behavior with keyboard modifiers.
 */
hterm.VT.Tests.addTest('mouse-report-click-keyboard', function(result, cx) {
  const terminal = this.terminal;
  let e;

  let resultString;
  terminal.io.sendString = (str) => resultString = str;

  // Turn on clicks.
  terminal.interpret('\x1b[?1000h');

  // Switch to SGR coordinates to make tests below easier.
  terminal.interpret('\x1b[?1006h');

  // Check left mouse w/no keyboard.
  e = MockTerminalMouseEvent('mousedown');
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<0;0;0M', resultString);

  // Check mouse down w/various key combos.
  e = MockTerminalMouseEvent('mousedown', {shiftKey: true});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<4;0;0M', resultString);

  e = MockTerminalMouseEvent('mousedown', {altKey: true});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<0;0;0M', resultString);

  e = MockTerminalMouseEvent('mousedown', {metaKey: true});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<8;0;0M', resultString);

  e = MockTerminalMouseEvent('mousedown', {ctrlKey: true});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<16;0;0M', resultString);

  e = MockTerminalMouseEvent('mousedown', {shiftKey: true, metaKey: true});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<12;0;0M', resultString);

  // Check buttons & keys together.
  e = MockTerminalMouseEvent('mousedown', {button: 2, shiftKey: true});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<6;0;0M', resultString);

  // Check mouse up doesn't report any key combos, only mouse buttons.
  e = MockTerminalMouseEvent('mouseup', {shiftKey: true});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<0;0;0m', resultString);

  e = MockTerminalMouseEvent('mouseup', {altKey: true});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<0;0;0m', resultString);

  e = MockTerminalMouseEvent('mouseup', {metaKey: true});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<0;0;0m', resultString);

  e = MockTerminalMouseEvent('mouseup', {ctrlKey: true});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<0;0;0m', resultString);

  e = MockTerminalMouseEvent('mouseup', {shiftKey: true, metaKey: true});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<0;0;0m', resultString);

  // Check buttons & keys together.
  e = MockTerminalMouseEvent('mouseup', {button: 2, shiftKey: true});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<2;0;0m', resultString);

  result.pass();
});

/**
 * Check mouse behavior when drags are enabled.
 */
hterm.VT.Tests.addTest('mouse-report-drag', function(result, cx) {
  const terminal = this.terminal;
  let e;

  let resultString;
  terminal.io.sendString = (str) => resultString = str;

  // Turn on clicks.
  terminal.interpret('\x1b[?1002h');

  // Send a mousedown event and check the report.
  e = MockTerminalMouseEvent('mousedown');
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[M   ', resultString);

  // Mouse move events should be reported.
  e = MockTerminalMouseEvent('mousemove', {terminalRow: 1, buttons: 1});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[M@ !', resultString);

  // Duplicate move events should not be reported.
  resultString = undefined;
  terminal.vt.onTerminalMouse_(e);
  assert.isUndefined(resultString);

  // Mouse up events should be reported.
  e = MockTerminalMouseEvent('mouseup');
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[M#  ', resultString);

  result.pass();
});

/**
 * Check mouse drag behavior with buttons.
 */
hterm.VT.Tests.addTest('mouse-report-drag-buttons', function(result, cx) {
  const terminal = this.terminal;
  let e;

  let resultString;
  terminal.io.sendString = (str) => resultString = str;

  // Turn on clicks.
  terminal.interpret('\x1b[?1002h');

  // Switch to SGR coordinates to make tests below easier.
  terminal.interpret('\x1b[?1006h');

  // Check mouse button priority.
  e = MockTerminalMouseEvent('mousemove', {buttons: 8});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<35;0;0M', resultString);

  e = MockTerminalMouseEvent('mousemove', {buttons: 2});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<34;0;0M', resultString);

  e = MockTerminalMouseEvent('mousemove', {buttons: 6});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<33;0;0M', resultString);

  e = MockTerminalMouseEvent('mousemove', {buttons: 7});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<32;0;0M', resultString);

  result.pass();
});

/**
 * Check mouse drag behavior with keyboard modifiers.
 */
hterm.VT.Tests.addTest('mouse-report-drag-keyboard', function(result, cx) {
  const terminal = this.terminal;
  let e;

  let resultString;
  terminal.io.sendString = (str) => resultString = str;

  // Turn on clicks.
  terminal.interpret('\x1b[?1002h');

  // Switch to SGR coordinates to make tests below easier.
  terminal.interpret('\x1b[?1006h');

  // Check various key combos.
  e = MockTerminalMouseEvent('mousemove', {buttons: 1, shiftKey: true});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<36;0;0M', resultString);

  e = MockTerminalMouseEvent('mousemove', {buttons: 1, altKey: true});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<32;0;0M', resultString);

  e = MockTerminalMouseEvent('mousemove', {buttons: 1, metaKey: true});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<40;0;0M', resultString);

  e = MockTerminalMouseEvent('mousemove', {buttons: 1, ctrlKey: true});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<48;0;0M', resultString);

  e = MockTerminalMouseEvent(
      'mousemove', {buttons: 1, shiftKey: true, ctrlKey: true});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<52;0;0M', resultString);

  e = MockTerminalMouseEvent(
      'mousemove', {buttons: 1, shiftKey: true, ctrlKey: true, metaKey: true});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<60;0;0M', resultString);

  result.pass();
});

/**
 * Check mouse wheel behavior when reports are enabled.
 */
hterm.VT.Tests.addTest('mouse-report-wheel', function(result, cx) {
  const terminal = this.terminal;
  let e;

  let resultString;
  terminal.io.sendString = (str) => resultString = str;

  // Turn on presses.
  terminal.interpret('\x1b[?9h');

  // Send a wheel down event and check the report.
  e = MockTerminalMouseEvent('wheel', {deltaY: 1});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[Ma  ', resultString);

  // Send a wheel up event and check the report.
  e = MockTerminalMouseEvent('wheel', {deltaY: -1});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[M`  ', resultString);

  result.pass();
});

/**
 * Check mouse wheel behavior in X10 coordinates.
 */
hterm.VT.Tests.addTest('mouse-wheel-x10-coord', function(result, cx) {
  const terminal = this.terminal;
  let e;

  let resultString;
  terminal.io.sendString = (str) => resultString = str;

  // Turn on presses.  Default is X10 coordinates.
  terminal.interpret('\x1b[?9h');

  // Check 0,0 cell.
  e = MockTerminalMouseEvent('wheel');
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[Ma  ', resultString);

  // Check the 7-bit limit.
  e = MockTerminalMouseEvent('wheel', {terminalRow: 95, terminalColumn: 94});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[Ma\x7e\x7f', resultString);

/*
  These are disabled because we currently clamp X10 reporting to 7-bit.

  // Check 150,100 cell.
  e = MockTerminalMouseEvent('wheel', {terminalRow: 150, terminalColumn: 100});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[Ma\x84\xb6', resultString);

  // Check 222,222 cell (just below max range).
  e = MockTerminalMouseEvent('wheel', {terminalRow: 222, terminalColumn: 222});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[Ma\xfe\xfe', resultString);

  // Check 223,223 cell (max range).
  e = MockTerminalMouseEvent('wheel', {terminalRow: 223, terminalColumn: 223});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[Ma\xff\xff', resultString);

  // Check 300,300 cell (out of range).
  e = MockTerminalMouseEvent('wheel', {terminalRow: 300, terminalColumn: 300});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[Ma\xff\xff', resultString);
*/

  result.pass();
});

/**
 * Check mouse wheel behavior in UTF8 coordinates.
 */
hterm.VT.Tests.addTest('mouse-wheel-utf8-coord', function(result, cx) {
  const terminal = this.terminal;
  let e;

  let resultString;
  terminal.io.sendString = (str) => resultString = str;

  // Turn on presses.
  terminal.interpret('\x1b[?9h');

  // Switch to UTF8 coordinates.
  terminal.interpret('\x1b[?1005h');

  // Check 0,0 cell.
  e = MockTerminalMouseEvent('wheel');
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[Ma  ', resultString);

  // Check 150,100 cell.
  e = MockTerminalMouseEvent('wheel', {terminalRow: 150, terminalColumn: 100});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[Ma\x84\xb6', resultString);

  // Check 2000,2000 cell.
  e = MockTerminalMouseEvent(
      'wheel', {terminalRow: 2000, terminalColumn: 2000});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[Ma\u07f0\u07f0', resultString);

  // Check 2014,2014 cell (just below max range).
  e = MockTerminalMouseEvent(
      'wheel', {terminalRow: 2014, terminalColumn: 2014});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[Ma\u07fe\u07fe', resultString);

  // Check 2015,2015 cell (max range).
  e = MockTerminalMouseEvent(
      'wheel', {terminalRow: 2015, terminalColumn: 2015});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[Ma\u07ff\u07ff', resultString);

  // Check 3000,3000 cell (out of range).
  e = MockTerminalMouseEvent(
      'wheel', {terminalRow: 3000, terminalColumn: 3000});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[Ma\u07ff\u07ff', resultString);

  result.pass();
});

/**
 * Check mouse wheel behavior in SGR coordinates.
 */
hterm.VT.Tests.addTest('mouse-wheel-sgr-coord', function(result, cx) {
  const terminal = this.terminal;
  let e;

  let resultString;
  terminal.io.sendString = (str) => resultString = str;

  // Turn on presses.
  terminal.interpret('\x1b[?9h');

  // Switch to SGR coordinates.
  terminal.interpret('\x1b[?1006h');

  // Check 0,0 cell.
  e = MockTerminalMouseEvent('wheel');
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<65;0;0M', resultString);

  // Check 150,100 cell.
  e = MockTerminalMouseEvent('wheel', {terminalRow: 150, terminalColumn: 100});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<65;100;150M', resultString);

  // Check 2000,3000 cell.
  e = MockTerminalMouseEvent(
      'wheel', {terminalRow: 2000, terminalColumn: 3000});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<65;3000;2000M', resultString);

  // Check 99999,55555 cell.
  e = MockTerminalMouseEvent(
      'wheel', {terminalRow: 99999, terminalColumn: 55555});
  terminal.vt.onTerminalMouse_(e);
  assert.equal('\x1b[<65;55555;99999M', resultString);

  result.pass();
});

/**
 * Verify CSI-J-0 (erase below) works.
 */
hterm.VT.Tests.addTest('csi-j-0', function(result, cx) {
  const terminal = this.terminal;

  // Fill the screen with something useful.
  for (let i = 0; i < this.visibleRowCount * 2; ++i) {
    terminal.interpret(`ab${i}\n\r`);
  }
  const rowCount = terminal.getRowCount();
  terminal.scrollEnd();
  terminal.scrollPort_.redraw_();

  // Move to the middle of the screen.
  terminal.setCursorPosition(3, 1);
  assert.equal('ab9', terminal.getRowText(9));
  assert.equal('ab10', terminal.getRowText(10));

  // Clear after & including the cursor (implicit arg=0).
  terminal.interpret('\x1b[J');
  assert.equal(3, terminal.getCursorRow());
  assert.equal(1, terminal.getCursorColumn());
  assert.equal('ab9', terminal.getRowText(9));
  assert.equal('a', terminal.getRowText(10));
  assert.equal('', terminal.getRowText(11));

  // Move up and clear after & including the cursor (explicit arg=0).
  terminal.setCursorPosition(2, 1);
  terminal.interpret('\x1b[0J');
  assert.equal(2, terminal.getCursorRow());
  assert.equal(1, terminal.getCursorColumn());
  assert.equal('ab8', terminal.getRowText(8));
  assert.equal('a', terminal.getRowText(9));
  assert.equal('', terminal.getRowText(10));

  // The scrollback should stay intact.
  assert.equal('ab0', terminal.getRowText(0));
  assert.equal(rowCount, terminal.getRowCount());

  result.pass();
});

/**
 * Verify CSI-J-1 (erase above) works.
 */
hterm.VT.Tests.addTest('csi-j-1', function(result, cx) {
  const terminal = this.terminal;

  // Fill the screen with something useful.
  for (let i = 0; i < this.visibleRowCount * 2; ++i) {
    terminal.interpret(`ab${i}\n\r`);
  }
  const rowCount = terminal.getRowCount();
  terminal.scrollEnd();
  terminal.scrollPort_.redraw_();

  // Move to the middle of the screen.
  terminal.setCursorPosition(3, 1);
  assert.equal('ab9', terminal.getRowText(9));
  assert.equal('ab10', terminal.getRowText(10));

  // Clear before & including the cursor (arg=1).
  terminal.interpret('\x1b[1J');
  assert.equal(3, terminal.getCursorRow());
  assert.equal(1, terminal.getCursorColumn());
  assert.equal('', terminal.getRowText(9));
  assert.equal('  10', terminal.getRowText(10));
  assert.equal('ab11', terminal.getRowText(11));

  // The scrollback should stay intact.
  assert.equal('ab0', terminal.getRowText(0));
  assert.equal(rowCount, terminal.getRowCount());

  result.pass();
});

/**
 * Verify CSI-J-2 (erase screen) works.
 */
hterm.VT.Tests.addTest('csi-j-2', function(result, cx) {
  const terminal = this.terminal;

  // Fill the screen with something useful.
  for (let i = 0; i < this.visibleRowCount * 2; ++i) {
    terminal.interpret(`ab${i}\n\r`);
  }
  const rowCount = terminal.getRowCount();
  terminal.scrollEnd();
  terminal.scrollPort_.redraw_();

  // Move to the middle of the screen.
  terminal.setCursorPosition(3, 1);
  assert.equal('ab9', terminal.getRowText(9));
  assert.equal('ab10', terminal.getRowText(10));

  // Clear the screen (arg=2).
  terminal.interpret('\x1b[2J');
  assert.equal(3, terminal.getCursorRow());
  assert.equal(1, terminal.getCursorColumn());
  assert.equal('', terminal.getRowText(9));
  assert.equal('', terminal.getRowText(10));
  assert.equal('', terminal.getRowText(11));

  // The scrollback should stay intact.
  assert.equal('ab0', terminal.getRowText(0));
  assert.equal(rowCount, terminal.getRowCount());

  result.pass();
});

/**
 * Verify CSI-J-3 (erase scrollback) works.
 */
hterm.VT.Tests.addTest('csi-j-3', function(result, cx) {
  const terminal = this.terminal;

  // Fill the screen with something useful.
  for (let i = 0; i < this.visibleRowCount * 2; ++i) {
    terminal.interpret(`ab${i}\n\r`);
  }
  const rowCount = terminal.getRowCount();
  terminal.scrollEnd();
  terminal.scrollPort_.redraw_();

  // Move to the middle of the screen.
  terminal.setCursorPosition(3, 1);
  assert.equal('ab9', terminal.getRowText(9));
  assert.equal('ab10', terminal.getRowText(10));

  // Disable this feature.  It should make it a nop.
  terminal.vt.enableCsiJ3 = false;
  terminal.interpret('\x1b[3J');
  assert.equal(3, terminal.getCursorRow());
  assert.equal(1, terminal.getCursorColumn());
  assert.equal('ab0', terminal.getRowText(0));
  assert.equal(rowCount, terminal.getRowCount());

  // Re-enable the feature.
  terminal.vt.enableCsiJ3 = true;

  // Clear the scrollback (arg=3).
  // The current screen should stay intact.
  terminal.interpret('\x1b[3J');
  assert.equal(3, terminal.getCursorRow());
  assert.equal(1, terminal.getCursorColumn());
  assert.equal('ab7', terminal.getRowText(0));
  assert.equal('ab8', terminal.getRowText(1));
  assert.equal('ab11', terminal.getRowText(this.visibleRowCount - 2));

  // The scrollback should be gone.
  assert.equal(this.visibleRowCount, terminal.getRowCount());
  assert.deepStrictEqual([], terminal.scrollbackRows_);

  result.pass();
});
