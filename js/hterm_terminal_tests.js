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

  const div = this.div = document.createElement('div');
  div.style.position = 'absolute';
  div.style.height = '100%';
  div.style.width = '100%';

  document.body.appendChild(div);

  this.terminal = new hterm.Terminal();

  this.terminal.decorate(div);
  // Set some fairly large padding and border which are hopefully more
  // likely to reveal bugs.
  // Update default value for prefs, and set initial value to be used prior
  // to prefs loading.
  this.terminal.getPrefs().definePreference('screen-padding-size', 20);
  this.terminal.setScreenPaddingSize(20);
  this.terminal.getPrefs().definePreference('screen-border-size', 13);
  this.terminal.setScreenBorderSize(13);
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
    const divSize = hterm.getClientSize(this.div);
    const scrollPort = this.terminal.scrollPort_;
    const rightPadding = Math.max(
        scrollPort.screenPaddingSize, scrollPort.currentScrollbarWidthPx);
    const innerWidth = divSize.width -
                       scrollPort.screenPaddingSize - rightPadding -
                       (2 * this.terminal.screenBorderSize_);
    const innerHeight = divSize.height -
                        (2 * scrollPort.screenPaddingSize) -
                        (2 * this.terminal.screenBorderSize_);

    assert.equal(innerWidth, Math.round(scrollPort.getScreenWidth()));
    assert.equal(Math.round(innerHeight),
                 Math.round(scrollPort.getScreenHeight()));

    assert.equal(Math.floor(innerWidth / scrollPort.characterSize.width),
                 this.visibleColumnCount);
    assert.equal(
        Math.round(innerHeight / scrollPort.characterSize.height),
        this.visibleRowCount);

    assert.equal(this.terminal.screen_.getWidth(), this.visibleColumnCount);
    assert.equal(this.terminal.screen_.getHeight(), this.visibleRowCount);
  });

/**
 * Fill the screen with 'X' characters one character at a time, in a way
 * that should stress the cursor positioning code.
 */
it('plaintext-stress-cursor-ltr', function() {
    for (let col = 0; col < this.visibleColumnCount; col++) {
      for (let row = 0; row < this.visibleRowCount; row++) {
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
    for (let col = this.visibleColumnCount - 1; col >= 0; col--) {
      for (let row = 0; row < this.visibleRowCount; row++) {
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
    const chunkSize = 1000;
    const testCount = 10;

    const test = (count) => {
      for (let i = count * chunkSize; i < (count + 1) * chunkSize; i++) {
        if (i != 0) {
          this.terminal.newLine();
        }
        this.terminal.screen_.insertString(
            'line ' + i + ': All work and no play makes jack a dull boy.');
      }

      if (count + 1 >= testCount) {
        done();
      } else {
        setTimeout(test, 0, count + 1);
      }
    };

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
  let resultString = '';
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
    const screenSize = this.terminal.scrollPort_.getScreenSize();
    assert.equal(img.clientHeight, screenSize.height);
    assert.equal(img.clientWidth, screenSize.width);

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
 * Check mouse row and column.
 */
it('mouse-row-column', function() {
  const terminal = this.terminal;
  let e;

  // Turn on mouse click reporting.
  terminal.vt.setDECMode('1000', true);

  let eventReported = false;
  terminal.onMouse = (e) => {
    eventReported = true;
  };
  const send = (type, x, y) => {
    eventReported = false;
    const e = MockTerminalMouseEvent(type, {clientX: x, clientY: y});
    terminal.onMouse_(e);
    return e;
  };

  const padding = terminal.scrollPort_.screenPaddingSize;
  const charWidth = terminal.scrollPort_.characterSize.width;
  const charHeight = terminal.scrollPort_.characterSize.height;
  const screenWidth = terminal.screenSize.width;
  const screenHeight = terminal.screenSize.height;

  // Cell 10, 10.
  const x10 = padding + 9.5 * charWidth;
  const y10 = padding + 9.5 * charHeight;
  e = send('mousedown', x10, y10);
  assert.isTrue(eventReported);
  assert.equal(e.terminalRow, 10);
  assert.equal(e.terminalColumn, 10);

  // Top padding, clamp to row 1.
  e = send('mousedown', x10, 0);
  assert.isTrue(eventReported);
  assert.equal(e.terminalRow, 1);
  assert.equal(e.terminalColumn, 10);

  // Right padding, clamp to width.
  e = send('mousedown', padding + (screenWidth * charWidth) + 1, y10);
  assert.isTrue(eventReported);
  assert.equal(e.terminalRow, 10);
  assert.equal(e.terminalColumn, screenWidth);

  // Scrollbar area, ignore mousedown.
  e = send('mousedown', (2 * padding) + (screenWidth * charWidth) + 1, y10);
  assert.isFalse(eventReported);
  e = send('mousemove', (2 * padding) + (screenWidth * charWidth) + 1, y10);
  assert.isTrue(eventReported);
  assert.equal(e.terminalRow, 10);
  assert.equal(e.terminalColumn, screenWidth);

  // Bottom padding, clamp to height.
  e = send('mousedown', x10, padding + (screenHeight * charHeight) + 1);
  assert.isTrue(eventReported);
  assert.equal(e.terminalRow, screenHeight);
  assert.equal(e.terminalColumn, 10);

  // Left padding, clamp to column 1.
  e = send('mousedown', 0, y10);
  assert.isTrue(eventReported);
  assert.equal(e.terminalRow, 10);
  assert.equal(e.terminalColumn, 1);
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

/**
 * Check set and reset of color palette.
 */
it('set-and-reset-colors', async function() {
  const terminal = this.terminal;

  const assertColor = (i, value) => {
    // Validate cached terminal.getColor and css var.
    assert.equal(value, terminal.getColorPalette(i));
    const style = getComputedStyle(this.terminal.document_.documentElement);
    const p = style.getPropertyValue(`--hterm-color-${i}`);
    assert.equal(value, `rgb(${p.trim().replace(/,/g, ', ')})`);
  };

  // The color entries we'll test.
  const indices = [0, 7, 15, 31, 63, 127, 255];
  // The unique color we'll test against.
  const custom = 'rgb(1, 2, 3)';

  // Change the colors.
  indices.forEach((index) => {
    assert.isTrue(lib.colors.stockPalette != custom);
    assertColor(index, lib.colors.stockPalette[index]);
    terminal.setColorPalette(index, custom);
    assertColor(index, custom);
  });

  // Reset a single color.
  terminal.resetColor(0);
  assertColor(0, lib.colors.stockPalette[0]);

  // Reset the palette and check the colors.
  terminal.resetColorPalette();
  indices.forEach((index) => {
    assertColor(index, lib.colors.stockPalette[index]);
  });
});

/**
 * Use reduced scoll region.
 */
it('scroll-region', function() {
  const terminal = this.terminal;

  // This test prints 4 screens worth of text with different VT scroll region
  // settings for each. The row contents are set so that each new screen will
  // only partially overwrite the previous screen.
  // ScreenA: '           |a??'
  // ScreenB: '       |b??'
  // ScreenC: '   |c??'
  // ScreenD: 'd??'
  // By the end the rows look something like: 'd00|c02|b03|a04' and we can
  // validate the scrollback and screen at each stage.

  // Print |visibleRowCount+ 1| rows.
  const screenA = [];
  for (let i = 0; i <= this.visibleRowCount; ++i) {
    const p = i.toString().padStart(2, '0');
    terminal.interpret(`           |a${p}`);
    if (i < this.visibleRowCount) {
      terminal.interpret('\n\r');
    }
    screenA.push(`           |a${p}`);
  }
  // The first row goes from screenA to scrollback.
  const scrollback = screenA.splice(0, 1);

  const validate = (scrollback, screen) => {
    assert.deepStrictEqual(
        terminal.scrollbackRows_.map((r) => r.textContent), scrollback);
    assert.deepStrictEqual(
        terminal.screen_.rowsArray.map((r) => r.textContent), screen);
  };
  validate(scrollback, screenA);

  // Set top scroll on 2nd line (no bottom scroll), and print
  // |visibleRowCount + 1| rows which will partially overwrite the existing
  // screenA.
  const screenB = [];
  terminal.setVTScrollRegion(1, null);
  terminal.setCursorPosition(0, 0);
  for (let i = 0; i <= this.visibleRowCount; ++i) {
    const p = i.toString().padStart(2, '0');
    terminal.interpret(`       |b${p}`);
    if (i < this.visibleRowCount) {
      terminal.interpret('\n\r');
    }
    let fromScreenA = '';
    if (i < this.visibleRowCount) {
      fromScreenA = screenA[i].substr(11);
    }
    screenB.push(`       |b${p}${fromScreenA}`);
  }
  // The second row is deleted without going to scrollback.
  screenB.splice(1, 1);
  validate(scrollback, screenB);

  // Set bottom scroll at 2nd last line (no top scroll), and print
  // |visibleRowCount + 1| rows which will partially overwrite screenB.
  const screenC = [];
  terminal.setVTScrollRegion(null, this.visibleRowCount - 2);
  terminal.setCursorPosition(0, 0);
  for (let i = 0; i <= this.visibleRowCount; ++i) {
    const p = i.toString().padStart(2, '0');
    terminal.interpret(`   |c${p}`);
    if (i < this.visibleRowCount) {
      terminal.interpret('\n\r');
    }
    let fromScreenB = '';
    if (i < this.visibleRowCount - 1) {
      fromScreenB = screenB[i].substr(7);
    }
    screenC.push(`   |c${p}${fromScreenB}`);
  }
  // The first 2 rows go from screenC to scrollback.
  scrollback.push.apply(scrollback, screenC.splice(0, 2));
  // The last row of screenB is never touched.
  screenC.push(screenB[this.visibleRowCount - 1]);
  validate(scrollback, screenC);

  // Set top scroll on 2nd line and bottom scroll on 2nd last line, and print
  // |visibleRowCount + 1| rows which will partially overwrite screenC.
  const screenD = [];
  terminal.setVTScrollRegion(1, this.visibleRowCount - 2);
  terminal.setCursorPosition(0, 0);
  for (let i = 0; i <= this.visibleRowCount; ++i) {
    const p = i.toString().padStart(2, '0');
    terminal.interpret(`d${p}`);
    if (i < this.visibleRowCount) {
      terminal.interpret('\n\r');
    }
    let fromScreenC = '';
    if (i < this.visibleRowCount - 1) {
      fromScreenC = screenC[i].substr(3);
    }
    screenD.push(`d${p}${fromScreenC}`);
  }
  // The 2nd and 3rd rows are deleted without going to scrollback.
  screenD.splice(1, 2);

  // The last row of screenC is never touched.
  screenD.push(screenC[this.visibleRowCount - 1]);
  validate(scrollback, screenD);
});

});
