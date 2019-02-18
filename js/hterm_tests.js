// Copyright 2017 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview hterm unit tests.  Specifically for core/high-level functions.
 */

hterm.Tests = new lib.TestManager.Suite('hterm.Tests');

hterm.notify.Tests = new lib.TestManager.Suite('hterm.notify.Tests');

/**
 * Mock out notifications.
 *
 * Called before each test case in this suite.
 */
hterm.notify.Tests.prototype.preamble = function(result, cx) {
  MockNotification.start();
};

/**
 * Restore any mocked out objects.
 *
 * Called after each test case in this suite.
 */
hterm.notify.Tests.prototype.postamble = function(result, cx) {
  MockNotification.stop();
};

/**
 * Test that basic notifications work.
 */
hterm.notify.Tests.addTest('default-notification', function(result, cx) {
  var n;

  // Create a default notification.
  assert.equal(0, Notification.count);
  n = hterm.notify();
  assert.equal(1, Notification.count);

  // Check the parameters.
  assert.equal(typeof n.title, 'string');
  assert.notEqual(n.title, '');
  assert.equal(n.body, '');

  result.pass();
});

/**
 * Test that various notifications arguments work.
 */
hterm.notify.Tests.addTest('notification-fields', function(result, cx) {
  var n;

  // Create the notification.
  assert.equal(0, Notification.count);
  n = hterm.notify({'title': 'title', 'body': 'body'});
  assert.equal(1, Notification.count);

  // Check the parameters.
  assert.include(n.title, 'title');
  assert.equal(n.body, 'body');

  result.pass();
});

/**
 * Test copying content via execCommand.
 */
hterm.notify.Tests.addTest('copy-execCommand', function(result, cx) {
  const doc = cx.window.document;

  // Mock this out since we can't document.execCommand from the test harness.
  const oldExec = doc.execCommand;
  doc.execCommand = (cmd) => {
    doc.execCommand = oldExec;

    assert.equal('copy', cmd);

    const s = doc.getSelection();
    assert.equal('copypasta!', s.toString());
    result.pass();
  };

  hterm.copySelectionToClipboard(doc, 'copypasta!');
  result.requestTime(500);
});
