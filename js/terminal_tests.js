// Copyright (c) 2011 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview hterm.Terminal unit tests.
 */

hterm.Terminal.Tests = new TestManager.Suite('hterm.Terminal.Tests');

hterm.Terminal.Tests.prototype.setup = function(cx) {
  this.setDefaults(cx,
      { visibleColumnCount: 80,
        visibleRowCount: 25,
        fontSize: 15,
        lineHeight: 17,
        charWidth: 9,
        scrollbarWidth: 16,
      });
};

/**
 * Clear out the current document and create a new hterm.Terminal object for
 * testing.
 *
 * Called before each test case in this suite.
 */
hterm.Terminal.Tests.prototype.preamble = function(result, cx) {
  var document = cx.window.document;

  document.body.innerHTML = '';

  var div = document.createElement('div');
  div.style.position = 'absolute';
  div.style.height = this.lineHeight * this.visibleRowCount + 'px';
  div.style.width = this.charWidth * this.visibleColumnCount +
      this.scrollbarWidth + 'px';
  document.body.appendChild(div);

  cx.window.terminal = this.terminal = new hterm.Terminal(
      this.fontSize, this.lineHeight);

  this.terminal.decorate(div);
};

/**
 * Overridden addTest method.
 *
 * Every test in this suite needs to wait for the terminal initialization to
 * complete asynchronously.  Rather than stick a bunch of biolerplate into each
 * test case, we use this overridden addTest method to add a proxy around the
 * actual test.
 */
hterm.Terminal.Tests.addTest = function(name, callback) {
  function testProxy(result, cx) {
    var self = this;
    setTimeout(function() {
        self.terminal.setCursorPosition(0, 0);
        callback.apply(self, [result, cx]);
      }, 0);

    result.requestTime(200);
  }

  TestManager.Suite.addTest.apply(this, [name, testProxy]);
};

hterm.Terminal.Tests.addTest('dimensions', function(result, cx) {
    result.assertEQ(this.terminal.characterSize_.width, this.charWidth);
    result.assertEQ(this.terminal.characterSize_.height, this.lineHeight);

    result.assertEQ(this.terminal.screen_.getWidth(), this.visibleColumnCount);
    result.assertEQ(this.terminal.screen_.getHeight(), this.visibleRowCount);

    result.pass();
  });

/**
 * Fill the screen with 'X' characters one character at a time, in a way
 * that should stress the cursor positioning code.
 */
hterm.Terminal.Tests.addTest('plaintext-stress-cursor-ltr',
                             function(result, cx) {
    for (var col = 0; col < this.visibleColumnCount; col++) {
      for (var row = 0; row < this.visibleRowCount; row++) {
        this.terminal.screen_.setCursorPosition(row, col);
        this.terminal.screen_.insertString('X');
      }
    }

    result.pass();
  });

/**
 * Fill the screen with 'X' characters one character at a time, in a way
 * that should stress the cursor positioning code and the overwriteString()
 * code.
 */
hterm.Terminal.Tests.addTest('plaintext-stress-cursor-rtl',
                             function(result, cx) {
    for (var col = this.visibleColumnCount - 1; col >= 0; col--) {
      for (var row = 0; row < this.visibleRowCount; row++) {
        this.terminal.screen_.setCursorPosition(row, col);
        this.terminal.screen_.overwriteString('X');
      }
    }

    result.pass();
  });

/**
 * Fill the terminal with a lot of text as quickly as possible.
 *
 * This test doesn't actually assert anything, but the timing data in the test
 * log is useful.
 */
hterm.Terminal.Tests.addTest('plaintext-stress-insert',
                             function(result, cx) {
    var chunkSize = 1000;
    var testCount = 10;
    var self = this;

    function test(count) {
      for (var i = count * chunkSize; i < (count + 1) * chunkSize; i++) {
        if (i != 0)
          self.terminal.newLine();
        self.terminal.screen_.insertString(
            'line ' + i + ': All work and no play makes jack a dull boy.');
      }

      if (count + 1 >= testCount) {
        result.pass();
      } else {
        result.requestTime(200);
        setTimeout(test, 0, count + 1);
      }
    }

    test(0);
  });
