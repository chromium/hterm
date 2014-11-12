// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Mock Notification class. See http://www.w3.org/TR/notifications/.
 */
export var MockNotification = function (name, opts) {
  MockNotification.count++;
};

export default MockNotification;

MockNotification.prototype.close = function() {
  MockNotification.count--;
};

// We are missing requestPermission(), because hterm doesn't call it if
// permission == 'granted'.

MockNotification.permission = 'granted';

MockNotification.count = 0;
