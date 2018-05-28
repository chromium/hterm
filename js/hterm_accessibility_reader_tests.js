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
  this.liveElement = div.firstChild.firstChild;

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
  this.accessibilityReader.newLine();
  this.accessibilityReader.announce('More output');

  result.assertEQ('', this.liveElement.getAttribute('aria-label'));

  const checkClear = () => {
    result.assertEQ('',
                    this.liveElement.getAttribute('aria-label'));
    return true;
  };

  const checkFirstAnnounce = () => {
    result.assertEQ('Some test output Some other test output\nMore output',
                    this.liveElement.getAttribute('aria-label'));
    return true;
  };

  const checksToComplete = [checkClear, checkFirstAnnounce];

  const observer = new MutationObserver(() => {
    if (checksToComplete[0]()) {
      checksToComplete.shift();
    }

    if (checksToComplete.length == 0) {
      observer.disconnect();
      result.pass();
    }
  });

  observer.observe(this.liveElement, {attributes: true});
  // This should only need to be 2x the initial delay but we wait longer to
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
  this.accessibilityReader.newLine();
  this.accessibilityReader.announce('More output');

  result.assertEQ('', this.liveElement.getAttribute('aria-label'));

  const checkClear = () => {
    result.assertEQ('', this.liveElement.getAttribute('aria-label'));
    return true;
  };

  const checkFirstAnnounce = () => {
    result.assertEQ('Some test output Some other test output\nMore output',
                    this.liveElement.getAttribute('aria-label'));

    this.accessibilityReader.announce('more text');
    this.accessibilityReader.newLine();
    this.accessibilityReader.announce('...and more');
    return true;
  };

  const checkSecondAnnounce = () => {
    result.assertEQ('more text\n...and more',
                    this.liveElement.getAttribute('aria-label'));
    return true;
  };

  const checksToComplete = [checkClear,
                            checkFirstAnnounce,
                            checkClear,
                            checkSecondAnnounce];

  const observer = new MutationObserver(() => {
    if (checksToComplete[0]()) {
      checksToComplete.shift();
    }

    if (checksToComplete.length == 0) {
      observer.disconnect();
      result.pass();
    }
  });

  observer.observe(this.liveElement, {attributes: true});
  // This should only need to be 2x the initial delay but we wait longer to
  // avoid flakiness.
  result.requestTime(500);
});
