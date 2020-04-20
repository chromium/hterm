// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview Test framework setup when run inside the browser.
 */

// Setup the mocha framework.
mocha.setup('bdd');
mocha.checkLeaks();

// Add a global shortcut to the assert API.
const assert = chai.assert;

// Catch any random errors before the test runner runs.
let earlyError = null;
/**
 * Catch any errors.
 *
 * @param {*} args Whatever arguments are passed in.
 */
window.onerror = function(...args) {
  earlyError = Array.from(args);
};

/** Run the test framework once everything is finished. */
window.onload = function() {
  hterm.defaultStorage = new lib.Storage.Memory();

  lib.init(() => {
    mocha.run();

    if (earlyError !== null) {
      assert.fail(`uncaught exception detected:\n${earlyError.join('\n')}\n`);
    }
  });
};
