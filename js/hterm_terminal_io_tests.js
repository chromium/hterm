// Copyright 2017 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview hterm.Terminal.IO unit tests.
 */

hterm.Terminal.IO.Tests = new lib.TestManager.Suite('hterm.Terminal.IO.Tests');

/**
 * Simple mock Terminal object for an IO object's needs.
 *
 * These tests focus on the IO object itself rather than integration with the
 */
const MockTerminalForIO = function() {
  this.overlayVisible = false;
  this.showCount = 0;
  this.overlayMessage = '';
  this.profileName = '';
  this.buffer = '';
  // This comes last.
  this.io = new hterm.Terminal.IO(this);
};
MockTerminalForIO.prototype.showOverlay = function(message, timeout) {
  this.showCount++;
  // For timeouts, we'll track the final state (i.e. after the timeout).
  this.overlayVisible = (timeout === null);
  this.overlayMessage = message;
};
MockTerminalForIO.prototype.hideOverlay = function() {
  this.overlayVisible = false;
};
MockTerminalForIO.prototype.setProfile = function(profileName) {
  this.profileName = profileName;
};
MockTerminalForIO.prototype.interpret = function(str) {
  this.buffer += str;
};

/**
 * Create a new IO object for every test.
 *
 * Called before each test case in this suite.
 */
hterm.Terminal.IO.Tests.prototype.preamble = function(result, cx) {
  this.mockTerm = new MockTerminalForIO();
  this.io = this.mockTerm.io.push();
};

/**
 * Check print functionality.
 */
hterm.Terminal.IO.Tests.addTest('print', function(result, cx) {
  this.io.print('');
  result.assertEQ('', this.mockTerm.buffer);

  this.io.print('a');
  result.assertEQ('a', this.mockTerm.buffer);

  this.io.print('');
  result.assertEQ('a', this.mockTerm.buffer);

  this.io.print('bc');
  result.assertEQ('abc', this.mockTerm.buffer);

  result.pass();
});

/**
 * Check println functionality.
 */
hterm.Terminal.IO.Tests.addTest('println', function(result, cx) {
  this.io.println('a');
  result.assertEQ('a\r\n', this.mockTerm.buffer);

  this.io.print('bc');
  result.assertEQ('a\r\nbc', this.mockTerm.buffer);

  this.io.println('');
  result.assertEQ('a\r\nbc\r\n', this.mockTerm.buffer);

  result.pass();
});

/**
 * Verify pushing/popping works.
 */
hterm.Terminal.IO.Tests.addTest('push-pop', function(result, cx) {
  const io1 = this.io.push();
  io1.print('Hello');
  result.assertEQ('Hello', this.mockTerm.buffer);

  const io2 = io1.push();
  io2.print('World');
  result.assertEQ('HelloWorld', this.mockTerm.buffer);
  io2.pop();

  io1.print('ItsMe');
  result.assertEQ('HelloWorldItsMe', this.mockTerm.buffer);
  io1.pop();

  this.io.print('Bye');
  result.assertEQ('HelloWorldItsMeBye', this.mockTerm.buffer);

  result.pass();
});

/**
 * Verify profile selection.
 */
hterm.Terminal.IO.Tests.addTest('profile-selection', function(result, cx) {
  result.assertEQ('', this.mockTerm.profileName);

  this.io.setTerminalProfile('foo');
  result.assertEQ('foo', this.mockTerm.profileName);

  result.pass();
});

/**
 * Check overlay display.
 */
hterm.Terminal.IO.Tests.addTest('overlay', function(result, cx) {
  // Start with default timeout.
  this.io.showOverlay('msg');
  result.assertEQ(1, this.mockTerm.showCount);
  result.assertEQ(false, this.mockTerm.overlayVisible);
  result.assertEQ('msg', this.mockTerm.overlayMessage);

  // A short message to "hide" it.
  this.io.showOverlay('', 1);
  result.assertEQ(2, this.mockTerm.showCount);
  result.assertEQ(false, this.mockTerm.overlayVisible);
  result.assertEQ('', this.mockTerm.overlayMessage);

  // Keep the overlay up forever.
  this.io.showOverlay('hi', null);
  result.assertEQ(3, this.mockTerm.showCount);
  result.assertEQ(true, this.mockTerm.overlayVisible);
  result.assertEQ('hi', this.mockTerm.overlayMessage);

  // Hide it immediately.
  this.io.hideOverlay();
  result.assertEQ(3, this.mockTerm.showCount);
  result.assertEQ(false, this.mockTerm.overlayVisible);
  result.assertEQ('hi', this.mockTerm.overlayMessage);

  result.pass();
});

/**
 * Check background IO objects.
 */
hterm.Terminal.IO.Tests.addTest('buffer-background', function(result, cx) {
  // Create a new foreground IO and show some stuff.
  const io = this.io.push();
  io.print('Fore');
  result.assertEQ('Fore', this.mockTerm.buffer);

  // Try to display something with the background IO.
  this.io.print('Back')
  result.assertEQ('Fore', this.mockTerm.buffer);

  // Unload the foreground IO at which point the background should flush.
  io.pop();
  result.assertEQ('ForeBack', this.mockTerm.buffer);

  // And we should resume OK.
  this.io.print('Done');
  result.assertEQ('ForeBackDone', this.mockTerm.buffer);

  result.pass();
});
