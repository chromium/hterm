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
  result.assertEQ(0, Notification.count);
  n = hterm.notify();
  result.assertEQ(1, Notification.count);

  // Check the parameters.
  result.assertEQ(typeof n.title, 'string');
  result.assert(n.title != '');
  result.assertEQ(n.body, '');

  result.pass();
});

/**
 * Test that various notifications arguments work.
 */
hterm.notify.Tests.addTest('notification-fields', function(result, cx) {
  var n;

  // Create the notification.
  result.assertEQ(0, Notification.count);
  n = hterm.notify({'title': 'title', 'body': 'body'});
  result.assertEQ(1, Notification.count);

  // Check the parameters.
  result.assert(n.title.includes('title'));
  result.assertEQ(n.body, 'body');

  result.pass();
});
