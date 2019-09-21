// Copyright 2017 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview hterm.Terminal.IO unit tests.
 */

describe('hterm_terminal_io_tests.js', () => {

/**
 * Simple mock Terminal object for an IO object's needs.
 *
 * These tests focus on the IO object itself rather than integration with the
 *
 * @constructor
 * @extends {hterm.Terminal}
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

/** @override */
MockTerminalForIO.prototype.showOverlay = function(message, timeout) {
  this.showCount++;
  // For timeouts, we'll track the final state (i.e. after the timeout).
  this.overlayVisible = (timeout === null);
  this.overlayMessage = message;
};

/** @override */
MockTerminalForIO.prototype.hideOverlay = function() {
  this.overlayVisible = false;
};

/** @override */
MockTerminalForIO.prototype.setProfile = function(profileName) {
  this.profileName = profileName;
};

/** @override */
MockTerminalForIO.prototype.interpret = function(str) {
  this.buffer += str;
};

/**
 * Create a new IO object for every test.
 *
 * Called before each test case in this suite.
 */
beforeEach(function() {
  this.mockTerm = new MockTerminalForIO();
  this.io = this.mockTerm.io.push();
});

/**
 * Check print functionality.
 */
it('print', function() {
  this.io.print('');
  assert.equal('', this.mockTerm.buffer);

  this.io.print('a');
  assert.equal('a', this.mockTerm.buffer);

  this.io.print('');
  assert.equal('a', this.mockTerm.buffer);

  this.io.print('bc');
  assert.equal('abc', this.mockTerm.buffer);
});

/**
 * Check println functionality.
 */
it('println', function() {
  this.io.println('a');
  assert.equal('a\r\n', this.mockTerm.buffer);

  this.io.print('bc');
  assert.equal('a\r\nbc', this.mockTerm.buffer);

  this.io.println('');
  assert.equal('a\r\nbc\r\n', this.mockTerm.buffer);
});

/**
 * Verify pushing/popping works.
 */
it('push-pop', function() {
  const io1 = this.io.push();
  io1.print('Hello');
  assert.equal('Hello', this.mockTerm.buffer);

  const io2 = io1.push();
  io2.print('World');
  assert.equal('HelloWorld', this.mockTerm.buffer);
  io2.pop();

  io1.print('ItsMe');
  assert.equal('HelloWorldItsMe', this.mockTerm.buffer);
  io1.pop();

  this.io.print('Bye');
  assert.equal('HelloWorldItsMeBye', this.mockTerm.buffer);
});

/**
 * Verify profile selection.
 */
it('profile-selection', function() {
  assert.equal('', this.mockTerm.profileName);

  this.io.setTerminalProfile('foo');
  assert.equal('foo', this.mockTerm.profileName);
});

/**
 * Check overlay display.
 */
it('overlay', function() {
  // Start with default timeout.
  this.io.showOverlay('msg');
  assert.equal(1, this.mockTerm.showCount);
  assert.isFalse(this.mockTerm.overlayVisible);
  assert.equal('msg', this.mockTerm.overlayMessage);

  // A short message to "hide" it.
  this.io.showOverlay('', 1);
  assert.equal(2, this.mockTerm.showCount);
  assert.isFalse(this.mockTerm.overlayVisible);
  assert.equal('', this.mockTerm.overlayMessage);

  // Keep the overlay up forever.
  this.io.showOverlay('hi', null);
  assert.equal(3, this.mockTerm.showCount);
  assert.isTrue(this.mockTerm.overlayVisible);
  assert.equal('hi', this.mockTerm.overlayMessage);

  // Hide it immediately.
  this.io.hideOverlay();
  assert.equal(3, this.mockTerm.showCount);
  assert.isFalse(this.mockTerm.overlayVisible);
  assert.equal('hi', this.mockTerm.overlayMessage);
});

/**
 * Check background IO objects.
 */
it('buffer-background', function() {
  // Create a new foreground IO and show some stuff.
  const io = this.io.push();
  io.print('Fore');
  assert.equal('Fore', this.mockTerm.buffer);

  // Try to display something with the background IO.
  this.io.print('Back');
  assert.equal('Fore', this.mockTerm.buffer);

  // Unload the foreground IO at which point the background should flush.
  io.pop();
  assert.equal('ForeBack', this.mockTerm.buffer);

  // And we should resume OK.
  this.io.print('Done');
  assert.equal('ForeBackDone', this.mockTerm.buffer);
});

});
