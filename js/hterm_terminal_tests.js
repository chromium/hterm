// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview hterm.Terminal unit tests.
 */

describe('hterm_terminal_tests.js', () => {

before(function() {
  this.visibleColumnCount = 80;
  this.visibleRowCount = 24;

  // This is a 16px x 8px gif.
  this.imageBase64 = 'R0lGODdhCAAQAIAAAP///wAAACwAAAAACAAQAAACFkSAhpfMC1uMT1' +
                     'mabHWZy6t1U/htQAEAOw==';
  this.imageArrayBuffer = lib.codec.stringToCodeUnitArray(
      atob(this.imageBase64)).buffer;
  this.imageBlob = new Blob([this.imageArrayBuffer]);
});

/**
 * Clear out the current document and create a new hterm.Terminal object for
 * testing.
 *
 * Called before each test case in this suite.
 */
beforeEach(function(done) {
  const document = window.document;

  var div = this.div = document.createElement('div');
  div.style.position = 'absolute';
  div.style.height = '100%';
  div.style.width = '100%';

  document.body.appendChild(div);

  this.terminal = new hterm.Terminal();

  this.terminal.decorate(div);
  this.terminal.setHeight(this.visibleRowCount);
  this.terminal.setWidth(this.visibleColumnCount);
  this.terminal.onTerminalReady = () => {
    this.terminal.setCursorPosition(0, 0);
    done();
  };

  MockNotification.start();
});

/**
 * Restore any mocked out objects.
 *
 * Called after each test case in this suite.
 */
afterEach(function() {
  MockNotification.stop();
  document.body.removeChild(this.div);
});

/**
 * How long to wait for image display tests to timeout.
 *
 * Passing tests won't hit this, so having it higher is OK.  When Chrome is
 * running in the background (e.g. the window/tab isn't focused), then Chrome
 * will deprioritize it causing JS/image loading/etc... to take longer.
 */
const DISPLAY_IMAGE_TIMEOUT = 5000;

/**
 * Checks that the dimensions of the scrollport match the dimensions of the
 * values that the Terminal was constructed with.
 */
it('dimensions', function() {
    var divSize = hterm.getClientSize(this.div);
    var scrollPort = this.terminal.scrollPort_;
    var innerWidth = Math.round(
        divSize.width - scrollPort.currentScrollbarWidthPx);

    assert.equal(innerWidth, Math.round(scrollPort.getScreenWidth()));
    assert.equal(Math.round(divSize.height),
                 Math.round(scrollPort.getScreenHeight()));

    assert.equal(Math.floor(innerWidth / scrollPort.characterSize.width),
                 this.visibleColumnCount);
    assert.equal(
        Math.round(divSize.height / scrollPort.characterSize.height),
        this.visibleRowCount);

    assert.equal(this.terminal.screen_.getWidth(), this.visibleColumnCount);
    assert.equal(this.terminal.screen_.getHeight(), this.visibleRowCount);
  });

/**
 * Fill the screen with 'X' characters one character at a time, in a way
 * that should stress the cursor positioning code.
 */
it('plaintext-stress-cursor-ltr', function() {
    for (var col = 0; col < this.visibleColumnCount; col++) {
      for (var row = 0; row < this.visibleRowCount; row++) {
        this.terminal.screen_.setCursorPosition(row, col);
        this.terminal.screen_.insertString('X');
      }
    }
  });

/**
 * Fill the screen with 'X' characters one character at a time, in a way
 * that should stress the cursor positioning code and the overwriteString()
 * code.
 */
it('plaintext-stress-cursor-rtl', function() {
    for (var col = this.visibleColumnCount - 1; col >= 0; col--) {
      for (var row = 0; row < this.visibleRowCount; row++) {
        this.terminal.screen_.setCursorPosition(row, col);
        this.terminal.screen_.overwriteString('X');
      }
    }
  });

/**
 * Fill the terminal with a lot of text as quickly as possible.
 *
 * This test doesn't actually assert anything, but the timing data in the test
 * log is useful.
 */
it('plaintext-stress-insert', function(done) {
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
        done();
      } else {
        setTimeout(test, 0, count + 1);
      }
    }

    test(0);
  });

/**
 * Test that accounting of desktop notifications works, and that they are
 * closed under the right circumstances.
 */
it('desktop-notification-bell-test', function() {
    this.terminal.desktopNotificationBell_ = true;

    // If we have focus, then no notifications should show.
    this.terminal.document_.hasFocus = function() { return true; };

    // Ring the bell, but nothing shows up.
    assert.equal(0, this.terminal.bellNotificationList_.length);
    assert.equal(0, Notification.count);
    this.terminal.ringBell();
    this.terminal.ringBell();
    this.terminal.ringBell();
    this.terminal.ringBell();
    assert.equal(0, this.terminal.bellNotificationList_.length);
    assert.equal(0, Notification.count);

    // If we don't have focus, then notifications should show.
    this.terminal.document_.hasFocus = function() { return false; };

    // Gaining focus closes all desktop notifications.
    assert.equal(0, this.terminal.bellNotificationList_.length);
    assert.equal(0, Notification.count);
    this.terminal.ringBell();
    assert.equal(1, this.terminal.bellNotificationList_.length);
    assert.equal(1, Notification.count);
    this.terminal.ringBell();
    assert.equal(2, this.terminal.bellNotificationList_.length);
    assert.equal(2, Notification.count);
    this.terminal.onFocusChange_(true);
    assert.equal(0, this.terminal.bellNotificationList_.length);
    assert.equal(0, Notification.count);

    // A user click closes all desktop notifications.
    this.terminal.ringBell();
    this.terminal.ringBell();
    assert.equal(2, this.terminal.bellNotificationList_.length);
    assert.equal(2, Notification.count);
    this.terminal.bellNotificationList_[0].onclick(null);
    assert.equal(0, this.terminal.bellNotificationList_.length);
    assert.equal(0, Notification.count);
  });

/**
 * Verify showing an overlay will also announce the message.
 */
it('show-overlay-announce', function() {
  const liveElement = this.terminal.accessibilityReader_.assertiveLiveElement_;

  this.terminal.showOverlay('test');
  assert.equal('test', liveElement.innerText);

  this.terminal.showOverlay('hello');
  assert.equal('hello', liveElement.innerText);
});

/**
 * Selection should be sync'd to the cursor when the selection is collapsed.
 */
it('sync-collapsed-selection', function(done) {
  this.terminal.print('foo');
  this.terminal.newLine();
  this.terminal.print('bar');

  // Wait for selection to sync to the caret.
  setTimeout(() => {
    const selection = this.terminal.document_.getSelection();
    assert.equal('bar', selection.anchorNode.textContent);
    assert.equal(3, selection.anchorOffset);
    done();
  });
});

/**
 * Selection should not be sync'd to the cursor when the selection is not
 * collapsed. This avoids clearing selection that has been set by the user.
 */
it('sync-uncollapsed-selection', function(done) {
  this.terminal.print('foo');
  this.terminal.newLine();
  // Select the text 'foo'
  const firstRow = this.terminal.getRowNode(0).firstChild;
  this.terminal.document_.getSelection().setBaseAndExtent(
      firstRow, 0, firstRow, 3);
  this.terminal.print('bar');

  // Wait for selection to sync to the caret.
  setTimeout(() => {
    const selection = this.terminal.document_.getSelection();
    assert.equal('foo', selection.anchorNode.textContent);
    assert.equal(0, selection.anchorOffset);
    assert.equal('foo', selection.focusNode.textContent);
    assert.equal(3, selection.focusOffset);
    done();
  });
});

/**
 * With accessibility enabled, selection should be sync'd to the cursor even
 * when the selection is not collapsed, as long as there is a user gesture.
 */
it('sync-uncollapsed-selection-a11y', function(done) {
  this.terminal.setAccessibilityEnabled(true);
  this.terminal.accessibilityReader_.hasUserGesture = true;

  this.terminal.print('foo');
  this.terminal.newLine();
  // Select the text 'foo'
  const firstRow = this.terminal.getRowNode(0).firstChild;
  this.terminal.document_.getSelection().setBaseAndExtent(
      firstRow, 0, firstRow, 3);
  this.terminal.print('bar');

  // Wait for selection to sync to the caret.
  setTimeout(() => {
    const selection = this.terminal.document_.getSelection();
    assert.equal('bar', selection.anchorNode.textContent);
    assert.equal(3, selection.anchorOffset);
    done();
  });
});

/**
 * Ensure that focussing the scrollPort will cause the selection to sync to the
 * caret.
 */
it('scrollport-focus-cursor', function(done) {
  this.terminal.print('foo');
  this.terminal.newLine();
  this.terminal.print('bar');

  // Wait for selection to sync to the caret.
  setTimeout(() => {
    // Manually change the selection and trigger focus.
    this.terminal.document_.getSelection().collapse(
        this.terminal.getRowNode(0), 0);
    this.terminal.scrollPort_.focus();
    setTimeout(() => {
      const selection = this.terminal.document_.getSelection();
      assert.equal('bar', selection.anchorNode.textContent);
      assert.equal(3, selection.anchorOffset);
      done();
    });
  });
});

/**
 * Test that focus sequences are passed as expected when focus reporting is
 * turned on, and nothing is passed when reporting is off.
 */
it('focus-reporting', function() {
  var resultString = '';
  this.terminal.io.sendString = (str) => resultString = str;

  this.terminal.interpret('\x1b[?1004h');

  this.terminal.onFocusChange_(false);
  assert.equal(resultString, '\x1b[O');
  this.terminal.onFocusChange_(true);
  assert.equal(resultString, '\x1b[I');

  resultString = '';
  this.terminal.interpret('\x1b[?1004l');

  this.terminal.onFocusChange_(false);
  assert.equal(resultString, '');
  this.terminal.onFocusChange_(true);
  assert.equal(resultString, '');
});

/**
 * Verify saved cursors have per-screen state.
 */
it('per-screen-cursor-state', function() {
  const terminal = this.terminal;
  const vt = terminal.vt;

  // Start with the primary screen.
  terminal.setAlternateMode(false);
  // This should be the default cursor state.
  terminal.restoreCursorAndState();
  assert.equal(0, terminal.getCursorRow());
  assert.equal(0, terminal.getCursorColumn());
  assert.equal('G0', vt.GL);
  assert.equal('G0', vt.GR);
  // Change the primary cursor a bit and save it.
  vt.GL = 'G1';
  vt.GR = 'G2';
  terminal.setAbsoluteCursorPosition(3, 4);
  assert.equal(3, terminal.getCursorRow());
  assert.equal(4, terminal.getCursorColumn());
  terminal.saveCursorAndState();

  // Switch to the alternative screen.
  terminal.setAlternateMode(true);
  // Cursor state should not be changed.
  assert.equal(3, terminal.getCursorRow());
  assert.equal(4, terminal.getCursorColumn());
  assert.equal('G1', vt.GL);
  assert.equal('G2', vt.GR);
  // This should be the default cursor state.
  terminal.restoreCursorAndState();
  assert.equal(0, terminal.getCursorRow());
  assert.equal(0, terminal.getCursorColumn());
  assert.equal('G0', vt.GL);
  assert.equal('G0', vt.GR);
  // Change the alternate cursor a bit and save it.
  vt.GL = 'G2';
  vt.GR = 'G3';
  terminal.setAbsoluteCursorPosition(7, 8);
  assert.equal(7, terminal.getCursorRow());
  assert.equal(8, terminal.getCursorColumn());
  terminal.saveCursorAndState();

  // Switch back to the primary scren.
  terminal.setAlternateMode(false);
  // Cursor state should not be changed.
  assert.equal(7, terminal.getCursorRow());
  assert.equal(8, terminal.getCursorColumn());
  assert.equal('G2', vt.GL);
  assert.equal('G3', vt.GR);
  // This should be the primary cursor state we set up earlier.
  terminal.restoreCursorAndState();
  assert.equal(3, terminal.getCursorRow());
  assert.equal(4, terminal.getCursorColumn());
  assert.equal('G1', vt.GL);
  assert.equal('G2', vt.GR);

  // Finally back to the alternate scren.
  terminal.setAlternateMode(true);
  // Cursor state should not be changed.
  assert.equal(3, terminal.getCursorRow());
  assert.equal(4, terminal.getCursorColumn());
  assert.equal('G1', vt.GL);
  assert.equal('G2', vt.GR);
  // This should be the alternate cursor state we set up earlier.
  terminal.restoreCursorAndState();
  assert.equal(7, terminal.getCursorRow());
  assert.equal(8, terminal.getCursorColumn());
  assert.equal('G2', vt.GL);
  assert.equal('G3', vt.GR);
});

/**
 * Check image display handling when disabled.
 */
it('display-img-disabled', function() {
  this.terminal.allowImagesInline = false;

  this.terminal.displayImage({uri: ''});
  const text = this.terminal.getRowsText(0, 1);
  assert.equal('Inline Images Disabled', text);
});

/**
 * Check image display handling when not yet decided.
 */
it('display-img-prompt', function() {
  this.terminal.allowImagesInline = null;

  // Search for the block & allow buttons.
  this.terminal.displayImage({uri: ''});
  const text = this.terminal.getRowsText(0, 1);
  assert.include(text.toLowerCase(), 'block');
  assert.include(text.toLowerCase(), 'allow');
});

/**
 * Check simple image display handling.
 */
it('display-img-normal', function(done) {
  this.terminal.allowImagesInline = true;

  // Callback when loading finishes.
  const onLoad = () => {
    assert.equal(1, this.terminal.getCursorRow());
    const row = this.terminal.getRowNode(0);
    const container = row.childNodes[1];
    const img = container.childNodes[0];

    assert.equal('center', container.style.textAlign);
    assert.equal(2, img.clientHeight);

    done();
  };

  // Display an image that only takes up one row.
  this.terminal.displayImage({
    height: '2px',
    inline: true,
    align: 'center',
    uri: `data:application/octet-stream;base64,${this.imageBase64}`,
  }, onLoad, assert.fail);
}).timeout(DISPLAY_IMAGE_TIMEOUT);

/**
 * Check simple image display handling via ArrayBuffer.
 */
it('display-img-array-buffer', function(done) {
  this.terminal.allowImagesInline = true;

  // Callback when loading finishes.
  const onLoad = () => {
    assert.equal(1, this.terminal.getCursorRow());
    const row = this.terminal.getRowNode(0);
    const container = row.childNodes[1];
    const img = container.childNodes[0];

    assert.equal('center', container.style.textAlign);
    assert.equal(2, img.clientHeight);

    done();
  };

  // Display an image that only takes up one row.
  this.terminal.displayImage({
    height: '2px',
    inline: true,
    align: 'center',
    buffer: this.imageArrayBuffer,
  }, onLoad, assert.fail);
}).timeout(DISPLAY_IMAGE_TIMEOUT);

/**
 * Check simple image display handling via Blob.
 */
it('display-img-blob', function(done) {
  this.terminal.allowImagesInline = true;

  // Callback when loading finishes.
  const onLoad = () => {
    assert.equal(1, this.terminal.getCursorRow());
    const row = this.terminal.getRowNode(0);
    const container = row.childNodes[1];
    const img = container.childNodes[0];

    assert.equal('center', container.style.textAlign);
    assert.equal(2, img.clientHeight);

    done();
  };

  // Display an image that only takes up one row.
  this.terminal.displayImage({
    height: '2px',
    inline: true,
    align: 'center',
    buffer: this.imageBlob,
  }, onLoad, assert.fail);
}).timeout(DISPLAY_IMAGE_TIMEOUT);

/**
 * Check handling of image dimensions.
 */
it('display-img-dimensions', function(done) {
  this.terminal.allowImagesInline = true;

  // Callback when loading finishes.
  const onLoad = () => {
    assert.equal(4, this.terminal.getCursorRow());
    const row = this.terminal.getRowNode(3);
    const container = row.childNodes[1];
    const img = container.childNodes[0];

    // The image should be 4 rows tall.
    assert.equal(img.clientHeight,
                 this.terminal.scrollPort_.characterSize.height * 4);

    // Do a range check for the percentage width.
    const bodyWidth = this.terminal.document_.body.clientWidth;
    assert.isAbove(img.clientWidth, bodyWidth * 0.70);
    assert.isBelow(img.clientWidth, bodyWidth * 0.80);

    done();
  };

  // Display an image that only takes up one row.
  this.terminal.displayImage({
    height: '4',
    width: '75%',
    inline: true,
    uri: `data:application/octet-stream;base64,${this.imageBase64}`,
  }, onLoad, assert.fail);
}).timeout(DISPLAY_IMAGE_TIMEOUT);

/**
 * Check handling of max image dimensions.
 */
it('display-img-max-dimensions', function(done) {
  this.terminal.allowImagesInline = true;

  // Callback when loading finishes.
  const onLoad = () => {
    const rowNum = this.terminal.screen_.getHeight() - 1;
    assert.equal(rowNum, this.terminal.getCursorRow());
    const row = this.terminal.getRowNode(rowNum);
    const container = row.childNodes[1];
    const img = container.childNodes[0];

    // The image should take up the whole screen, but not more.
    const body = this.terminal.document_.body;
    assert.equal(img.clientHeight, body.clientHeight);
    assert.equal(img.clientWidth, body.clientWidth);

    done();
  };

  // Display an image that only takes up one row.
  this.terminal.displayImage({
    height: '4000px',
    width: '1000',
    inline: true,
    uri: `data:application/octet-stream;base64,${this.imageBase64}`,
  }, onLoad, assert.fail);
}).timeout(DISPLAY_IMAGE_TIMEOUT);

/**
 * Check loading of invalid images doesn't wedge the terminal.
 */
it('display-img-invalid', function(done) {
  this.terminal.allowImagesInline = true;

  // Callback when loading finishes (i.e. failure triggers).
  const onError = () => {
    // The cursor should not have advanced.
    assert.equal(0, this.terminal.getCursorRow());
    done();
  };

  // The data is invalid image content.
  this.terminal.displayImage({
    inline: true,
    uri: 'data:application/octet-stream;base64,asdf',
  }, () => assert.fail('image loading should have failed'), () => {
     // We can't seem to run directly from the onError as JS doesn't like to
     // throw exceptions in there that our framework catches.
     // TODO(vapier): Should figure this out.
     setTimeout(onError, 0);
  });
}).timeout(DISPLAY_IMAGE_TIMEOUT);

/**
 * Verify turning text blink on/off works.
 *
 * This test isn't great.  Since we use CSS animations for everything, we
 * assume that part is working, so we just check the stored timing values.
 */
it('text-blink', function() {
  // Default blink state is enabled.
  this.terminal.setTextBlink();
  assert.notEqual('0', this.terminal.getCssVar('blink-node-duration'));

  // Explicitly turn it off.
  this.terminal.setTextBlink(false);
  assert.equal('0', this.terminal.getCssVar('blink-node-duration'));

  // Explicitly turn it back on.
  this.terminal.setTextBlink(true);
  assert.notEqual('0', this.terminal.getCssVar('blink-node-duration'));
});

/**
 * Check mouse wheel emulation of arrow keys.
 */
it('mouse-wheel-arrow-keys', function() {
  const terminal = this.terminal;
  let e;

  let resultString;
  terminal.io.sendString = (str) => resultString = str;

  // Configure arrow key emulation and switch to alternative screen.
  terminal.scrollWheelArrowKeys_ = true;
  terminal.keyboard.applicationCursor = true;
  terminal.setAlternateMode(true);

  // Send a wheel event w/no delta and check the report.
  e = MockTerminalMouseEvent('wheel');
  terminal.onMouse_(e);
  assert.equal('', resultString);

  // Send a wheel up event and check the report.
  e = MockTerminalMouseEvent('wheel', {deltaY: -1, deltaMode: 1});
  terminal.onMouse_(e);
  assert.equal('\x1bOA', resultString);

  // Send a wheel down event and check the report.
  e = MockTerminalMouseEvent('wheel', {deltaY: 1, deltaMode: 1});
  terminal.onMouse_(e);
  assert.equal('\x1bOB', resultString);

  // Send a wheel left event and check the report.
  e = MockTerminalMouseEvent('wheel', {deltaX: -1, deltaMode: 1});
  terminal.onMouse_(e);
  assert.equal('\x1bOD', resultString);

  // Send a wheel right event and check the report.
  e = MockTerminalMouseEvent('wheel', {deltaX: 1, deltaMode: 1});
  terminal.onMouse_(e);
  assert.equal('\x1bOC', resultString);

  // Send multiple combo reports.  The order doesn't matter, but reflects
  // how the code internally works atm.
  e = MockTerminalMouseEvent('wheel', {deltaY: 2, deltaX: 2, deltaMode: 1});
  terminal.onMouse_(e);
  assert.equal('\x1bOB\x1bOB\x1bOC\x1bOC', resultString);
});

/**
 * Check mouse wheel emulation of arrow keys are disabled on primary screen.
 */
it('mouse-wheel-arrow-keys-primary', function() {
  const terminal = this.terminal;
  let e;

  let resultString;
  terminal.io.sendString = (str) => resultString = str;

  // Configure arrow key emulation and switch to primary screen.
  terminal.scrollWheelArrowKeys_ = true;
  terminal.keyboard.applicationCursor = true;
  terminal.setAlternateMode(false);

  // Send a wheel event w/no delta and check the report.
  e = MockTerminalMouseEvent('wheel');
  terminal.onMouse_(e);
  assert.isUndefined(resultString);

  // Send a wheel up event and check the report.
  e = MockTerminalMouseEvent('wheel', {deltaY: -1, deltaMode: 1});
  terminal.onMouse_(e);
  assert.isUndefined(resultString);

  // Send a wheel down event and check the report.
  e = MockTerminalMouseEvent('wheel', {deltaY: 1, deltaMode: 1});
  terminal.onMouse_(e);
  assert.isUndefined(resultString);
});

/**
 * Check paste() is working correctly. Note that we do not test the legacy
 * pasting using document.execCommand() because it is hard to simulate the
 * behavior.
 */
it('paste', async function() {
  if (!navigator.clipboard) {
    // Skip this test.
    return;
  }

  const terminal = this.terminal;
  const oldReadText = navigator.clipboard.readText;
  navigator.clipboard.readText = async () => 'hello world';
  const oldOnPasteData = terminal.onPasteData_;
  const onPasteDataPromise = new Promise((resolve) => {
    terminal.onPasteData_ = (data) => {
      terminal.onPasteData_ = oldOnPasteData;
      resolve(data);
    };
  });

  try {
    assert.isNull(this.terminal.paste());
    assert.equal((await onPasteDataPromise), 'hello world');
  } finally {
    navigator.clipboard.readText = oldReadText;
  }
});

});
