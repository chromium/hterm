// Copyright 2020 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview Keyboard test suite.
 *
 * Test that KeyDefActions are resolved correctly.
 */

describe('hterm_keyboard_tests.js', () => {

/**
 * Mock terminal, set up keyMap.
 */
beforeEach(function() {
  this.terminal = /** @type {!hterm.Terminal} */ ({
    contextMenu: {hide: () => {}},
    key: null,
    onVTKeystroke: (key) => { this.terminal.key = key; },
    wipeContentsCalled: false,
    wipeContents: () => { this.terminal.wipeContentsCalled = true; },
  });
  this.keyboard = new hterm.Keyboard(this.terminal);
});

/** Verify user bindings override. */
it('user-bindings-override-defaults', function() {
  const ctrlShiftK = new KeyboardEvent(
      'keydown', {keyCode: 'K'.charCodeAt(0), ctrlKey: true, shiftKey: true});

  // Without user bindings, terminal.wipeContents() is called.
  this.keyboard.onKeyDown_(ctrlShiftK);
  assert.isTrue(this.terminal.wipeContentsCalled);
  assert.isNull(this.terminal.key);

  // With a user binding, terminal.wipeContents() is not called.
  this.terminal.wipeContentsCalled = false;
  this.keyboard.bindings.addBindings({'Ctrl+Shift+K': '"x"'});
  this.keyboard.onKeyDown_(ctrlShiftK);
  assert.isFalse(this.terminal.wipeContentsCalled);
  assert.equal('x', this.terminal.key);
});

});
