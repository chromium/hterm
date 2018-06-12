// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview hterm.Terminal unit tests.
 */

hterm.Terminal.Tests = new lib.TestManager.Suite('hterm.Terminal.Tests');

hterm.Terminal.Tests.prototype.setup = function(cx) {
  this.setDefaults(cx,
      { visibleColumnCount: 80,
        visibleRowCount: 24,
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

  var div = this.div = document.createElement('div');
  div.style.position = 'absolute';
  div.style.height = '100%';
  div.style.width = '100%';

  document.body.appendChild(div);

  cx.window.terminal = this.terminal = new hterm.Terminal();

  this.terminal.decorate(div);
  this.terminal.setHeight(this.visibleRowCount);
  this.terminal.setWidth(this.visibleColumnCount);

  MockNotification.start();
};

/**
 * Restore any mocked out objects.
 *
 * Called after each test case in this suite.
 */
hterm.Terminal.Tests.prototype.postamble = function(result, cx) {
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
hterm.Terminal.Tests.addTest = function(name, callback) {
  function testProxy(result, cx) {
    var self = this;
    setTimeout(function() {
        self.terminal.setCursorPosition(0, 0);
        callback.apply(self, [result, cx]);
      }, 0);

    result.requestTime(200);
  }

  lib.TestManager.Suite.addTest.apply(this, [name, testProxy]);
};

/**
 * How long to wait for image display tests to timeout.
 *
 * Passing tests won't hit this, so having it higher is OK.  When Chrome is
 * running in the background (e.g. the window/tab isn't focused), then Chrome
 * will deprioritize it causing JS/image loading/etc... to take longer.
 */
hterm.Terminal.Tests.DISPLAY_IMAGE_TIMEOUT = 5000;

/**
 * Checks that the dimensions of the scrollport match the dimensions of the
 * values that the Terminal was constructed with.
 */
hterm.Terminal.Tests.addTest('dimensions', function(result, cx) {
    var divSize = hterm.getClientSize(this.div);
    var scrollPort = this.terminal.scrollPort_;
    var innerWidth = Math.round(
        divSize.width - scrollPort.currentScrollbarWidthPx);

    result.assertEQ(innerWidth, Math.round(scrollPort.getScreenWidth()));
    result.assertEQ(Math.round(divSize.height),
                    Math.round(scrollPort.getScreenHeight()));

    result.assertEQ(Math.floor(innerWidth / scrollPort.characterSize.width),
                    this.visibleColumnCount);
    result.assertEQ(
        Math.round(divSize.height / scrollPort.characterSize.height),
        this.visibleRowCount);

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

/**
 * Test that accounting of desktop notifications works, and that they are
 * closed under the right circumstances.
 */
hterm.Terminal.Tests.addTest('desktop-notification-bell-test',
                             function(result, cx) {
    this.terminal.desktopNotificationBell_ = true;

    // If we have focus, then no notifications should show.
    this.terminal.document_.hasFocus = function() { return true; };

    // Ring the bell, but nothing shows up.
    result.assertEQ(0, this.terminal.bellNotificationList_.length);
    result.assertEQ(0, Notification.count);
    this.terminal.ringBell();
    this.terminal.ringBell();
    this.terminal.ringBell();
    this.terminal.ringBell();
    result.assertEQ(0, this.terminal.bellNotificationList_.length);
    result.assertEQ(0, Notification.count);

    // If we don't have focus, then notifications should show.
    this.terminal.document_.hasFocus = function() { return false; };

    // Gaining focus closes all desktop notifications.
    result.assertEQ(0, this.terminal.bellNotificationList_.length);
    result.assertEQ(0, Notification.count);
    this.terminal.ringBell();
    result.assertEQ(1, this.terminal.bellNotificationList_.length);
    result.assertEQ(1, Notification.count);
    this.terminal.ringBell();
    result.assertEQ(2, this.terminal.bellNotificationList_.length);
    result.assertEQ(2, Notification.count);
    this.terminal.onFocusChange_(true);
    result.assertEQ(0, this.terminal.bellNotificationList_.length);
    result.assertEQ(0, Notification.count);

    // A user click closes all desktop notifications.
    this.terminal.ringBell();
    this.terminal.ringBell();
    result.assertEQ(2, this.terminal.bellNotificationList_.length);
    result.assertEQ(2, Notification.count);
    this.terminal.bellNotificationList_[0].onclick(null);
    result.assertEQ(0, this.terminal.bellNotificationList_.length);
    result.assertEQ(0, Notification.count);

    result.pass();
  });

/**
 * Test that focus sequences are passed as expected when focus reporting is
 * turned on, and nothing is passed when reporting is off.
 */
hterm.Terminal.Tests.addTest('focus-reporting', function(result, cx) {
  var resultString = '';
  this.terminal.io.sendString = (str) => resultString = str;

  this.terminal.interpret('\x1b[?1004h');

  this.terminal.onFocusChange_(false);
  result.assertEQ(resultString, '\x1b[O');
  this.terminal.onFocusChange_(true);
  result.assertEQ(resultString, '\x1b[I');

  resultString = '';
  this.terminal.interpret('\x1b[?1004l');

  this.terminal.onFocusChange_(false);
  result.assertEQ(resultString, '');
  this.terminal.onFocusChange_(true);
  result.assertEQ(resultString, '');

  result.pass();
});

/**
 * Verify saved cursors have per-screen state.
 */
hterm.Terminal.Tests.addTest('per-screen-cursor-state', function(result, cx) {
  const terminal = this.terminal;
  const vt = terminal.vt;

  // Start with the primary screen.
  terminal.setAlternateMode(false);
  // This should be the default cursor state.
  terminal.restoreCursorAndState();
  result.assertEQ(0, terminal.getCursorRow());
  result.assertEQ(0, terminal.getCursorColumn());
  result.assertEQ('G0', vt.GL);
  result.assertEQ('G0', vt.GR);
  // Change the primary cursor a bit and save it.
  vt.GL = 'G1';
  vt.GR = 'G2';
  terminal.setAbsoluteCursorPosition(3, 4);
  result.assertEQ(3, terminal.getCursorRow());
  result.assertEQ(4, terminal.getCursorColumn());
  terminal.saveCursorAndState();

  // Switch to the alternative screen.
  terminal.setAlternateMode(true);
  // Cursor state should not be changed.
  result.assertEQ(3, terminal.getCursorRow());
  result.assertEQ(4, terminal.getCursorColumn());
  result.assertEQ('G1', vt.GL);
  result.assertEQ('G2', vt.GR);
  // This should be the default cursor state.
  terminal.restoreCursorAndState();
  result.assertEQ(0, terminal.getCursorRow());
  result.assertEQ(0, terminal.getCursorColumn());
  result.assertEQ('G0', vt.GL);
  result.assertEQ('G0', vt.GR);
  // Change the alternate cursor a bit and save it.
  vt.GL = 'G2';
  vt.GR = 'G3';
  terminal.setAbsoluteCursorPosition(7, 8);
  result.assertEQ(7, terminal.getCursorRow());
  result.assertEQ(8, terminal.getCursorColumn());
  terminal.saveCursorAndState();

  // Switch back to the primary scren.
  terminal.setAlternateMode(false);
  // Cursor state should not be changed.
  result.assertEQ(7, terminal.getCursorRow());
  result.assertEQ(8, terminal.getCursorColumn());
  result.assertEQ('G2', vt.GL);
  result.assertEQ('G3', vt.GR);
  // This should be the primary cursor state we set up earlier.
  terminal.restoreCursorAndState();
  result.assertEQ(3, terminal.getCursorRow());
  result.assertEQ(4, terminal.getCursorColumn());
  result.assertEQ('G1', vt.GL);
  result.assertEQ('G2', vt.GR);

  // Finally back to the alternate scren.
  terminal.setAlternateMode(true);
  // Cursor state should not be changed.
  result.assertEQ(3, terminal.getCursorRow());
  result.assertEQ(4, terminal.getCursorColumn());
  result.assertEQ('G1', vt.GL);
  result.assertEQ('G2', vt.GR);
  // This should be the alternate cursor state we set up earlier.
  terminal.restoreCursorAndState();
  result.assertEQ(7, terminal.getCursorRow());
  result.assertEQ(8, terminal.getCursorColumn());
  result.assertEQ('G2', vt.GL);
  result.assertEQ('G3', vt.GR);

  result.pass();
});

/**
 * Check image display handling when disabled.
 */
hterm.Terminal.Tests.addTest('display-img-disabled', function(result, cx) {
  this.terminal.allowImagesInline = false;

  this.terminal.displayImage({uri: ''});
  const text = this.terminal.getRowsText(0, 1);
  result.assertEQ('Inline Images Disabled', text);

  result.pass();
});

/**
 * Check image display handling when not yet decided.
 */
hterm.Terminal.Tests.addTest('display-img-prompt', function(result, cx) {
  this.terminal.allowImagesInline = null;

  // Search for the block & allow buttons.
  this.terminal.displayImage({uri: ''});
  const text = this.terminal.getRowsText(0, 1);
  result.assert(text.includes('block'));
  result.assert(text.includes('allow'));

  result.pass();
});

/**
 * Check simple image display handling.
 */
hterm.Terminal.Tests.addTest('display-img-normal', function(result, cx) {
  this.terminal.allowImagesInline = true;

  // This is a 16px x 8px gif.
  const data = 'R0lGODdhCAAQAIAAAP///wAAACwAAAAACAAQAAACFkSAhpfMC1uMT1mabHWZy6t1U/htQAEAOw==';

  // Callback when loading finishes.
  const onLoad = () => {
    result.assertEQ(1, this.terminal.getCursorRow());
    const row = this.terminal.getRowNode(0);
    const container = row.childNodes[1];
    const img = container.childNodes[0];

    result.assertEQ('center', container.style.textAlign);
    result.assertEQ(2, img.clientHeight);

    result.pass();
  };

  // Display an image that only takes up one row.
  this.terminal.displayImage({
    height: '2px',
    inline: true,
    align: 'center',
    uri: `data:application/octet-stream;base64,${data}`,
  }, onLoad, (e) => result.fail(e));

  result.requestTime(hterm.Terminal.Tests.DISPLAY_IMAGE_TIMEOUT);
});

/**
 * Check handling of image dimensions.
 */
hterm.Terminal.Tests.addTest('display-img-dimensions', function(result, cx) {
  this.terminal.allowImagesInline = true;

  // This is a 16px x 8px gif.
  const data = 'R0lGODdhCAAQAIAAAP///wAAACwAAAAACAAQAAACFkSAhpfMC1uMT1mabHWZy6t1U/htQAEAOw==';

  // Callback when loading finishes.
  const onLoad = () => {
    result.assertEQ(4, this.terminal.getCursorRow());
    const row = this.terminal.getRowNode(3);
    const container = row.childNodes[1];
    const img = container.childNodes[0];

    // The image should be 4 rows tall.
    result.assert(img.clientHeight ==
                  this.terminal.scrollPort_.characterSize.height * 4);

    // Do a range check for the percentage width.
    const bodyWidth = this.terminal.document_.body.clientWidth;
    result.assert(img.clientWidth > bodyWidth * 0.70);
    result.assert(img.clientWidth < bodyWidth * 0.80);

    result.pass();
  };

  // Display an image that only takes up one row.
  this.terminal.displayImage({
    height: '4',
    width: '75%',
    inline: true,
    uri: `data:application/octet-stream;base64,${data}`,
  }, onLoad, (e) => result.fail(e));

  result.requestTime(hterm.Terminal.Tests.DISPLAY_IMAGE_TIMEOUT);
});

/**
 * Check handling of max image dimensions.
 */
hterm.Terminal.Tests.addTest('display-img-max-dimensions', function(result, cx) {
  this.terminal.allowImagesInline = true;

  // This is a 16px x 8px gif.
  const data = 'R0lGODdhCAAQAIAAAP///wAAACwAAAAACAAQAAACFkSAhpfMC1uMT1mabHWZy6t1U/htQAEAOw==';

  // Callback when loading finishes.
  const onLoad = () => {
    const rowNum = this.terminal.screen_.getHeight() - 1;
    result.assertEQ(rowNum, this.terminal.getCursorRow());
    const row = this.terminal.getRowNode(rowNum);
    const container = row.childNodes[1];
    const img = container.childNodes[0];

    // The image should take up the whole screen, but not more.
    const body = this.terminal.document_.body;
    result.assertEQ(img.clientHeight, body.clientHeight);
    result.assertEQ(img.clientWidth, body.clientWidth);

    result.pass();
  };

  // Display an image that only takes up one row.
  this.terminal.displayImage({
    height: '4000px',
    width: '1000',
    inline: true,
    uri: `data:application/octet-stream;base64,${data}`,
  }, onLoad, (e) => result.fail(e));

  result.requestTime(hterm.Terminal.Tests.DISPLAY_IMAGE_TIMEOUT);
});

/**
 * Check loading of invalid images doesn't wedge the terminal.
 */
hterm.Terminal.Tests.addTest('display-img-invalid', function(result, cx) {
  this.terminal.allowImagesInline = true;

  // Callback when loading finishes (i.e. failure triggers).
  const onError = () => {
    // The cursor should not have advanced.
    result.assertEQ(0, this.terminal.getCursorRow());
    result.pass();
  };

  // The data is invalid image content.
  this.terminal.displayImage({
    inline: true,
    uri: 'data:application/octet-stream;base64,asdf',
  }, () => result.fail('image loading should have failed'), () => {
     // We can't seem to run directly from the onError as JS doesn't like to
     // throw exceptions in there that our framework catches.
     // TODO(vapier): Should figure this out.
     setTimeout(onError, 0);
  });

  result.requestTime(hterm.Terminal.Tests.DISPLAY_IMAGE_TIMEOUT);
});

/**
 * Verify turning text blink on/off works.
 *
 * This test isn't great.  Since we use CSS animations for everything, we
 * assume that part is working, so we just check the stored timing values.
 */
hterm.Terminal.Tests.addTest('text-blink', function(result, cx) {
  // Default blink state is enabled.
  this.terminal.setTextBlink();
  result.assert('0' != this.terminal.getCssVar('blink-node-duration'));

  // Explicitly turn it off.
  this.terminal.setTextBlink(false);
  result.assertEQ('0', this.terminal.getCssVar('blink-node-duration'));

  // Explicitly turn it back on.
  this.terminal.setTextBlink(true);
  result.assert('0' != this.terminal.getCssVar('blink-node-duration'));

  result.pass();
});
