// Copyright 2018 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview hterm.AccessibilityReader unit tests.
 */
hterm.AccessibilityReader.Tests = new lib.TestManager.Suite(
    'hterm.AccessibilityReader.Tests');

/**
 * Clear out the current document and create a new hterm.AccessibilityReader
 * object for testing.
 *
 * Called before each test case in this suite.
 */
hterm.AccessibilityReader.Tests.prototype.preamble = function(result, cx) {
  const document = cx.window.document;

  document.body.innerHTML = '';

  const div = this.div = document.createElement('div');
  div.style.position = 'absolute';
  div.style.height = '100%';
  div.style.width = '100%';

  this.accessibilityReader = new hterm.AccessibilityReader(div);
  this.liveRegion = div.firstChild;

  document.body.appendChild(div);
};

/**
 * Test that printing text to the terminal will cause nodes to be added to the
 * live region for accessibility purposes. This shouldn't happen until after a
 * small delay has passed.
 */
hterm.AccessibilityReader.Tests.addTest(
    'a11y-live-region-single-delay', function(result, cx) {
  this.accessibilityReader.announce('Some test output');
  this.accessibilityReader.announce('Some other test output');

  result.assertEQ(0, this.liveRegion.children.length);

  const observer = new MutationObserver(() => {
    if (this.liveRegion.children.length < 2) {
      return;
    }

    result.assertEQ('Some test output',
                    this.liveRegion.children[0].innerHTML);
    result.assertEQ('Some other test output',
                    this.liveRegion.children[1].innerHTML);

    observer.disconnect();
    result.pass();
  });

  observer.observe(this.liveRegion, {childList: true});
  // This should only need to be 1x the initial delay but we wait longer to
  // avoid flakiness.
  result.requestTime(500);
});

/**
 * Test that after text has been added to the live region, there is again a
 * delay before adding more text.
 */
hterm.AccessibilityReader.Tests.addTest(
    'a11y-live-region-double-delay', function(result, cx) {
  this.accessibilityReader.announce('Some test output');
  this.accessibilityReader.announce('Some other test output');

  result.assertEQ(0, this.liveRegion.children.length);

  const checkFirstAnnounce = () => {
    if (this.liveRegion.children.length < 2) {
      return false;
    }

    result.assertEQ('Some test output',
                    this.liveRegion.children[0].innerHTML);
    result.assertEQ('Some other test output',
                    this.liveRegion.children[1].innerHTML);

    this.accessibilityReader.announce('more text');
    this.accessibilityReader.announce('...and more');
    return true;
  };

  const checkSecondAnnounce = () => {
    if (this.liveRegion.children.length < 2) {
      return false;
    }

    result.assertEQ('more text', this.liveRegion.children[0].innerHTML);
    result.assertEQ('...and more', this.liveRegion.children[1].innerHTML);
    return true;
  };

  const checksToComplete = [checkFirstAnnounce, checkSecondAnnounce];

  const observer = new MutationObserver(() => {
    if (checksToComplete[0]()) {
      checksToComplete.shift();
    }

    if (checksToComplete.length == 0) {
      observer.disconnect();
      result.pass();
    }
  });

  observer.observe(this.liveRegion, {childList: true});
  // This should only need to be 2x the initial delay but we wait longer to
  // avoid flakiness.
  result.requestTime(500);
});

/**
 * Test that when adding a large amount of text, it will get buffered into the
 * live region.
 */
hterm.AccessibilityReader.Tests.addTest(
    'a11y-live-region-large-text', function(result, cx) {
  for (let i = 0; i < hterm.AccessibilityReader.MAX_ITEMS_TO_ADD; ++i) {
    this.accessibilityReader.announce('First pass');
  }
  this.accessibilityReader.announce('Second pass');

  result.assertEQ(0, this.liveRegion.children.length);

  const checkFirstAnnounce = () => {
    if (this.liveRegion.children.length <
        hterm.AccessibilityReader.MAX_ITEMS_TO_ADD) {
      return false;
    }

    for (let i = 0; i < hterm.AccessibilityReader.MAX_ITEMS_TO_ADD; ++i) {
      result.assertEQ('First pass', this.liveRegion.children[i].innerHTML);
    }

    return true;
  };

  const checkSecondAnnounce = () => {
    if (this.liveRegion.children.length < 1) {
      return false;
    }

    result.assertEQ('Second pass', this.liveRegion.children[0].innerHTML);
    return true;
  };

  const checksToComplete = [checkFirstAnnounce, checkSecondAnnounce];

  const observer = new MutationObserver(() => {
    if (checksToComplete[0]()) {
      checksToComplete.shift();
    }

    if (checksToComplete.length == 0) {
      observer.disconnect();
      result.pass();
    }
  });

  observer.observe(this.liveRegion, {childList: true});
  // This should only need to be the initial delay plus the subsequent delay
  // but we use a longer delay to avoid flakiness.
  result.requestTime(500);
});
