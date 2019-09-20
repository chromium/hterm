// Copyright 2018 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview hterm.AccessibilityReader unit tests.
 */

describe('hterm_accessibility_reader_tests.js', () => {

/**
 * Set up state for all the tests in this suite.
 */
before(() => {
  // Stub out the delay loops.  We don't have to worry about waiting for input
  // from the user to accumulate as we don't do that.
  /** @suppress {duplicate} */
  hterm.AccessibilityReader.DELAY = 0;
});

/*
 * Create a new hterm.AccessibilityReader object for testing.
 *
 * Called before each test case in this suite.
 */
beforeEach(function() {
  const document = window.document;

  const div = this.div = document.createElement('div');
  div.style.position = 'absolute';
  div.style.height = '100%';
  div.style.width = '100%';

  this.accessibilityReader = new hterm.AccessibilityReader(div);
  this.accessibilityReader.setAccessibilityEnabled(true);
  this.liveElement = div.firstChild.firstChild;
  this.assertiveLiveElement = this.liveElement.nextSibling;

  document.body.appendChild(div);
});

/**
 * Clean up the hterm.AccessibilityReader object.
 */
afterEach(function() {
  window.document.body.removeChild(this.div);
});

/**
 * Test that printing text to the terminal will cause nodes to be added to the
 * live region for accessibility purposes. This shouldn't happen until after a
 * small delay has passed.
 */
it('a11y-live-region-single-delay', function(done) {
  this.accessibilityReader.announce('Some test output');
  this.accessibilityReader.announce('Some other test output');
  this.accessibilityReader.newLine();
  this.accessibilityReader.announce('More output');

  assert.equal('', this.liveElement.getAttribute('aria-label'));

  const observer = new MutationObserver(() => {
    assert.equal('Some test output Some other test output\nMore output',
                 this.liveElement.getAttribute('aria-label'));
    observer.disconnect();
    done();
  });

  observer.observe(this.liveElement, {attributes: true});
});


/**
 * Test that after text has been added to the live region, there is again a
 * delay before adding more text.
 */
it('a11y-live-region-double-delay', function(done) {
  this.accessibilityReader.announce('Some test output');
  this.accessibilityReader.announce('Some other test output');
  this.accessibilityReader.newLine();
  this.accessibilityReader.announce('More output');

  assert.equal('', this.liveElement.getAttribute('aria-label'));

  const checkFirstAnnounce = () => {
    assert.equal('Some test output Some other test output\nMore output',
                 this.liveElement.getAttribute('aria-label'));

    this.accessibilityReader.announce('more text');
    this.accessibilityReader.newLine();
    this.accessibilityReader.announce('...and more');
    return true;
  };

  const checkSecondAnnounce = () => {
    assert.equal('more text\n...and more',
                 this.liveElement.getAttribute('aria-label'));
    return true;
  };

  const checksToComplete = [checkFirstAnnounce, checkSecondAnnounce];

  const observer = new MutationObserver(() => {
    if (checksToComplete[0]()) {
      checksToComplete.shift();
    }

    if (checksToComplete.length == 0) {
      observer.disconnect();
      done();
    }
  });

  observer.observe(this.liveElement, {attributes: true});
});

/**
 * Test that adding the same text twice to the live region gets slightly
 * modified to trigger an attribute change.
 */
it('a11y-live-region-duplicate-text', function(done) {
  this.accessibilityReader.announce('Some test output');

  assert.equal('', this.liveElement.getAttribute('aria-label'));

  const checkFirstAnnounce = () => {
    assert.equal('Some test output',
                 this.liveElement.getAttribute('aria-label'));

    this.accessibilityReader.announce('Some test output');
    return true;
  };

  const checkSecondAnnounce = () => {
    assert.equal('\nSome test output',
                 this.liveElement.getAttribute('aria-label'));
    return true;
  };

  const checksToComplete = [checkFirstAnnounce, checkSecondAnnounce];

  const observer = new MutationObserver(() => {
    if (checksToComplete[0]()) {
      checksToComplete.shift();
    }

    if (checksToComplete.length == 0) {
      observer.disconnect();
      done();
    }
  });

  observer.observe(this.liveElement, {attributes: true});
});

/**
 * Test that adding text to the assertive live region works correctly.
 */
it('a11y-assertive-live-region', function() {
  this.accessibilityReader.assertiveAnnounce('Some test output');
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'),
               'Some test output');
  this.accessibilityReader.clear();
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), '');
});

/**
 * Test that adding the same text twice to the assertive live region gets
 * slightly modified to trigger an attribute change.
 */
it('a11y-assertive-live-region-duplicate-text', function() {
  this.accessibilityReader.assertiveAnnounce('Some test output');
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'),
               'Some test output');
  this.accessibilityReader.assertiveAnnounce('Some test output');
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'),
               '\nSome test output');
});

/**
 * Test that adding text to the assertive live region interrupts polite
 * announcements.
 */
it('a11y-assertive-live-region-interrupts-polite', function(done) {
  this.accessibilityReader.announce('Some test output');
  this.accessibilityReader.announce('Some other test output');
  this.accessibilityReader.newLine();
  this.accessibilityReader.announce('More output');

  assert.equal(this.liveElement.getAttribute('aria-label'), '');
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), '');

  // The live element should not change because we interrupt it. It should only
  // announce the 'PASS' string which comes after all the output above.
  const observer = new MutationObserver(() => {
    if (this.liveElement.getAttribute('aria-label') == 'PASS') {
      done();
    } else {
      assert.equal(this.liveElement.getAttribute('aria-label'), '');
    }
  });
  observer.observe(this.liveElement, {attributes: true});

  this.accessibilityReader.assertiveAnnounce('Some test output');
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'),
               'Some test output');

  this.accessibilityReader.announce('PASS');
});

/**
 * Test that nothing is announced when accessibility is disabled.
 */
it('a11y-disabled-enabled', function(done) {
  this.accessibilityReader.setAccessibilityEnabled(false);
  this.accessibilityReader.announce('Some test output');
  this.accessibilityReader.announce('Some other test output');
  this.accessibilityReader.newLine();
  this.accessibilityReader.announce('More output');

  assert.equal(this.liveElement.getAttribute('aria-label'), '');

  // Only 'Other output' should be announced now.
  this.accessibilityReader.setAccessibilityEnabled(true);
  this.accessibilityReader.announce('Other output');

  const observer = new MutationObserver(() => {
    if (this.liveElement.getAttribute('aria-label') == 'Other output') {
      done();
    } else {
      assert.equal(this.liveElement.getAttribute('aria-label'), '');
    }
  });
  observer.observe(this.liveElement, {attributes: true});
});

/**
 * Test that when accessibility is disabled, nothing else will be announced.
 */
it('a11y-enabled-disabled', function(done) {
  this.accessibilityReader.announce('Some test output');
  this.accessibilityReader.announce('Some other test output');
  this.accessibilityReader.newLine();
  this.accessibilityReader.announce('More output');

  assert.equal(this.liveElement.getAttribute('aria-label'), '');

  // The live element should not change because accessibility is disabled. It
  // should only announce the 'PASS' string which comes after all the output
  // above.
  const observer = new MutationObserver(() => {
    if (this.liveElement.getAttribute('aria-label') == 'PASS') {
      done();
    } else {
      assert.equal(this.liveElement.getAttribute('aria-label'), '');
    }
  });
  observer.observe(this.liveElement, {attributes: true});

  this.accessibilityReader.setAccessibilityEnabled(false);

  this.accessibilityReader.setAccessibilityEnabled(true);
  this.accessibilityReader.announce('PASS');
});

/**
 * Test that when accessibility is disabled, assertive announcements still work.
 * These are not performance sensitive so they don't need to be gated on the
 * flag.
 */
it('a11y-assertive-disabled-enabled', function() {
  this.accessibilityReader.setAccessibilityEnabled(false);

  this.accessibilityReader.assertiveAnnounce('Some test output');
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'),
               'Some test output');

  this.accessibilityReader.setAccessibilityEnabled(true);

  this.accessibilityReader.assertiveAnnounce('More test output');
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'),
               'More test output');
});

/**
 * Regression test for a bug that is caused by adding 2 newlines and then
 * calling announce. In this case an exception was thrown.
 */
it('a11y-newlines-then-announce', function() {
  this.accessibilityReader.newLine();
  this.accessibilityReader.newLine();
  this.accessibilityReader.announce('Some test output');
});

/**
 * Test that moving the cursor left/right through output will cause the output
 * to get assertively announced.
 */
it('a11y-selection-change-left-right', function() {
  // Move the cursor right 1 character.
  // Simulatue a user gesture.
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('abc', 0, 0);
  this.accessibilityReader.afterCursorChange('abc', 0, 1);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), 'a');

  // Move the cursor left 1 character.
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('abc', 0, 2);
  this.accessibilityReader.afterCursorChange('abc', 0, 1);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), 'b');

  // Move the cursor right 1 character with wide chars in the string.
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('匂へどabc', 0, 0);
  this.accessibilityReader.afterCursorChange('匂へどabc', 0, 2);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), '匂');

  // Move the cursor left 1 character with wide chars in the string.
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('匂へどabc', 0, 9);
  this.accessibilityReader.afterCursorChange('匂へどabc', 0, 8);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), 'c');

  // Move the cursor to the end of the output.
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('abc', 0, 0);
  this.accessibilityReader.afterCursorChange('abc', 0, 3);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), 'abc');

  // Move the cursor to the start of the output.
  this.assertiveLiveElement.setAttribute('aria-label', '');
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('abc', 0, 3);
  this.accessibilityReader.afterCursorChange('abc', 0, 0);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), 'abc');

  // Don't move the cursor at all.
  this.assertiveLiveElement.setAttribute('aria-label', '');
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('abc', 0, 0);
  this.accessibilityReader.afterCursorChange('abc', 0, 0);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), '');

  // Move the cursor 1 character but without a user gesture.
  this.accessibilityReader.beforeCursorChange('abc', 0, 0);
  this.accessibilityReader.afterCursorChange('abc', 0, 1);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), '');

  // Move the cursor 1 character but have the output change at the same time.
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('abc', 0, 0);
  this.accessibilityReader.afterCursorChange('abcd', 0, 1);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), '');

  // Move the cursor 1 character but have the output change elsewhere on the
  // screen at the same time.
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('abc', 0, 0);
  this.accessibilityReader.announce('foo bar');
  this.accessibilityReader.afterCursorChange('abc', 0, 1);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), '');

  // Move the cursor 1 character but have the row change as well.
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('abc', 0, 0);
  this.accessibilityReader.afterCursorChange('abc', 1, 1);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), '');
});

/**
 * Test that other announcements are properly ignored or spoken when navigating
 * left and right through output.
 */
it('a11y-selection-change-left-right-with-announce', function(done) {
  // Move the cursor 1 character. In the process of doing this, a space
  // character is printed somewhere in the terminal. It should get consumed and
  // not announced as it may just be a side effect of the cursor change.
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('abc', 0, 0);
  this.accessibilityReader.announce(' ');
  this.accessibilityReader.afterCursorChange('abc', 0, 1);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), 'a');

  // Do this again but 'foo bar' is announced during the cursor change.
  this.assertiveLiveElement.setAttribute('aria-label', '');
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('abc', 0, 0);
  this.accessibilityReader.announce('foo bar');
  this.accessibilityReader.afterCursorChange('abc', 0, 1);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), '');

  // We check that the space gets consumed and isn't announced but 'foo bar'
  // still gets announced.
  const observer = new MutationObserver(() => {
    if (this.liveElement.getAttribute('aria-label') == 'foo bar') {
      done();
    }
  });
  observer.observe(this.liveElement, {attributes: true});
});

/**
 * Test that changes to the cursor due to backspace and deletion are properly
 * announced.
 */
it('a11y-selection-change-backspace-delete', function() {
  // Backspace a character at the start of the string.
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('abc', 0, 1);
  this.accessibilityReader.afterCursorChange('bc', 0, 0);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), 'a');

  // Backspace a character at the end of the string.
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('abc', 0, 3);
  this.accessibilityReader.afterCursorChange('ab', 0, 2);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), 'c');

  // Backspace a wide character.
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('匂へど', 0, 6);
  this.accessibilityReader.afterCursorChange('匂へ', 0, 4);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), 'ど');

  // Do this again but add an empty space in place of the deleted character. The
  // terminal may do this as spaces are no different from empty space in the
  // terminal.
  this.assertiveLiveElement.setAttribute('aria-label', '');
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('abc', 0, 3);
  this.accessibilityReader.afterCursorChange('ab ', 0, 2);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), 'c');

  // Do the same thing but add other text as well. The backspace shouldn't be
  // announced.
  this.assertiveLiveElement.setAttribute('aria-label', '');
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('abc', 0, 3);
  this.accessibilityReader.afterCursorChange('ab e ', 0, 2);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), '');

  // Backspace a character in the middle of the string.
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('abc', 0, 2);
  this.accessibilityReader.afterCursorChange('ac', 0, 1);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), 'b');

  // Delete a character at the start of the string.
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('abc', 0, 0);
  this.accessibilityReader.afterCursorChange('bc', 0, 0);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), 'a');

  // Delete a character at the end of the string.
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('abc', 0, 2);
  this.accessibilityReader.afterCursorChange('ab', 0, 2);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), 'c');

  // Delete the entire end of the line of text.
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('abc: xyzabc', 0, 11);
  this.accessibilityReader.afterCursorChange('abc: ', 0, 5);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), 'xyzabc');

  // Do this again but add an empty space in place of the deleted character. The
  // terminal may do this as spaces are no different from empty space in the
  // terminal.
  this.assertiveLiveElement.setAttribute('aria-label', '');
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('abc', 0, 2);
  this.accessibilityReader.afterCursorChange('ab ', 0, 2);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), 'c');

  // Do the same thing but add other text as well. The delete shouldn't be
  // announced.
  this.assertiveLiveElement.setAttribute('aria-label', '');
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('abc', 0, 2);
  this.accessibilityReader.afterCursorChange('ab e ', 0, 2);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), '');

  // Delete a character in the middle of the string.
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('abc', 0, 1);
  this.accessibilityReader.afterCursorChange('ac', 0, 1);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), 'b');

  // Backspace a character without a user gesture.
  this.assertiveLiveElement.setAttribute('aria-label', '');
  this.accessibilityReader.beforeCursorChange('abc', 0, 1);
  this.accessibilityReader.afterCursorChange('bc', 0, 0);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), '');
});

/**
 * Test that other output isn't announced during a backspace/deletion selection
 * change.
 */
it('a11y-selection-change-backspace-with-announce', function(done) {
  // Backspace a character. If other text is announced to the terminal in the
  // process, we ignore it. This is because lots of updates can happen during a
  // backspace (e.g. all the characers after the deleted character need to be
  // moved and reprinted).
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('abc', 0, 1);
  this.accessibilityReader.announce('bc');
  this.accessibilityReader.afterCursorChange('bc', 0, 0);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), 'a');

  // Announce something afterward to ensure the mutation observer fires and
  // avoid timing out the test..
  this.accessibilityReader.announce('foo');

  const observer = new MutationObserver(() => {
    if (this.liveElement.getAttribute('aria-label') == 'foo') {
      done();
    }
  });
  observer.observe(this.liveElement, {attributes: true});
});

/**
 * Test that entering a space character triggers 'Space' to be spoken.
 */
it('a11y-selection-space', function() {
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('abc', 0, 3);
  this.accessibilityReader.announce(' ');
  this.accessibilityReader.afterCursorChange('abc ', 0, 4);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), 'Space');

  // No space announced if the cursor doesn't move.
  this.assertiveLiveElement.setAttribute('aria-label', '');
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('abc', 0, 3);
  this.accessibilityReader.announce(' ');
  this.accessibilityReader.afterCursorChange('abc ', 0, 3);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), '');

  // No space announced if a space is not printed to the screen.
  this.assertiveLiveElement.setAttribute('aria-label', '');
  this.accessibilityReader.hasUserGesture = true;
  this.accessibilityReader.beforeCursorChange('abc ', 0, 4);
  this.accessibilityReader.announce('d');
  this.accessibilityReader.afterCursorChange('dabc ', 0, 5);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), '');

  // No space announced if there's not a user gesture.
  this.assertiveLiveElement.setAttribute('aria-label', '');
  this.accessibilityReader.beforeCursorChange('abc', 0, 3);
  this.accessibilityReader.announce(' ');
  this.accessibilityReader.afterCursorChange('abc ', 0, 4);
  assert.equal(this.assertiveLiveElement.getAttribute('aria-label'), '');
});

});
