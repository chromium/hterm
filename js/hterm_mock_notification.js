// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * Mock Notification class. See https://www.w3.org/TR/notifications/.
 */
var MockNotification = function() {
  function mock(title, opts) {
    if (opts === undefined)
      opts = {};
    this.title = title;
    this.body = opts.body || '';
    mock.count++;
    mock.call = Object.assign({'title': title}, opts);
    mock.calls.push(mock.call);
  }
  mock.prototype.close = function() {
    mock.count--;
  };

  // We are missing requestPermission(), because hterm doesn't call it if
  // permission == 'granted'.
  mock.permission = 'granted';
  mock.count = 0;
  mock.calls = [];

  return mock;
};

/**
 * Handle for original Notification object.
 */
MockNotification.origNotification = Notification;

/**
 * Start the mock.
 *
 * All calls to Notification() will run through a new mock.
 */
MockNotification.start = function() {
  Notification = new MockNotification();
};

/**
 * Stop the mock.
 *
 * Restore the original Notification().
 */
MockNotification.stop = function() {
  Notification = MockNotification.origNotification;
};
