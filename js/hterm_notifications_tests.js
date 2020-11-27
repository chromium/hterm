// Copyright 2020 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview hterm notifications unit tests.
 */

describe('hterm_notifications_tests.js', () => {

beforeEach(function() {
  this.div = document.createElement('div');
});

/**
 * Check showing & hiding functionality.
 */
it('show-autohide', function(done) {
  const notifications = new hterm.NotificationCenter(this.div);
  // Speed up the fadeout time for test purposes.
  notifications.fadeout_ = 0;
  // Make sure the area starts off clean.
  assert.equal(this.div.textContent, '');
  // Create a notification and make sure it's displayed.
  notifications.show('hiya', {timeout: 0});
  assert.equal(this.div.textContent, 'hiya');
  // Wait for it to autohide.  Poll it to adapt quickly.
  let count = 100;
  const poll = () => {
    if (this.div.textContent === '') {
      done();
    } else if (--count > 0) {
      setTimeout(poll, 10);
    }
  };
  poll();
});

/**
 * Check showing w/no timeout functionality.
 */
it('show-forever', function(done) {
  const notifications = new hterm.NotificationCenter(this.div);
  // Speed up the fadeout time for test purposes.
  notifications.fadeout_ = 0;
  // Create a notification and make sure it's displayed.
  notifications.show('hiya', {timeout: null});
  assert.equal(this.div.textContent, 'hiya');
  // Wait to see if it autohides.
  setTimeout(() => {
    assert.equal(this.div.textContent, 'hiya');
    notifications.hide();
    // It should hide immediately.
    assert.equal(this.div.textContent, '');
    done();
  }, 10);
});

});
