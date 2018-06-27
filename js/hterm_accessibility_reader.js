// Copyright 2018 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * AccessibilityReader responsible for rendering command output for AT.
 *
 * Renders command output for Assistive Technology using a live region. We don't
 * use the visible rows of the terminal for rendering command output to the
 * screen reader because the rendered content may be different from what we want
 * read out by a screen reader. For example, we may not actually render every
 * row of a large piece of output to the screen as it wouldn't be performant.
 * But we want the screen reader to read it all out in order.
 *
 * @param {HTMLDivElement} div The div element where the live region should be
 *     added.
 */
hterm.AccessibilityReader = function(div) {
  this.document_ = div.ownerDocument;

  // The live region element to add text to.
  const liveRegion = this.document_.createElement('div');
  liveRegion.id = 'hterm:accessibility-live-region';
  liveRegion.style.cssText = `position: absolute;
                              width: 0; height: 0;
                              overflow: hidden;
                              left: 0; top: 0;`;
  div.appendChild(liveRegion);

  // Whether command output should be rendered for Assistive Technology.
  // This isn't always enabled because it has an impact on performance.
  this.accessibilityEnabled = false;

  // This live element is used for command output.
  this.liveElement_ = this.document_.createElement('p');
  this.liveElement_.setAttribute('aria-live', 'polite');
  this.liveElement_.setAttribute('aria-label', '');
  liveRegion.appendChild(this.liveElement_);

  // This live element is used for speaking out the current screen when
  // navigating through the scrollback buffer. It will interrupt existing
  // announcements.
  this.assertiveLiveElement_ = this.document_.createElement('p');
  this.assertiveLiveElement_.setAttribute('aria-live', 'assertive');
  this.assertiveLiveElement_.setAttribute('aria-label', '');
  liveRegion.appendChild(this.assertiveLiveElement_);

  // A queue of updates to announce.
  this.queue_ = [];

  // A timer which tracks when next to add items to the live region. null when
  // not running. This is used to combine updates that occur in a small window,
  // as well as to avoid too much output being added to the live region in one
  // go which can cause the renderer to hang.
  this.nextReadTimer_ = null;
};

/**
 * Delay in ms to use for merging strings to output.
 *
 * We merge strings together to avoid hanging the terminal and to ensure that
 * aria updates make it to the screen reader. We want this to be short so
 * there's not a big delay between typing/executing commands and hearing output.
 *
 * @constant
 * @type {integer}
 */
hterm.AccessibilityReader.DELAY = 90;

/**
 * Enable accessibility-friendly features that have a performance impact.
 *
 * @param {boolean} enabled Whether to enable accessibility-friendly features.
 */
hterm.AccessibilityReader.prototype.setAccessibilityEnabled =
    function(enabled) {
  if (!enabled) {
    this.clear();
  }

  this.accessibilityEnabled = enabled;
};

/**
 * Announce the command output.
 *
 * @param {string} str The string to announce using a live region.
 */
hterm.AccessibilityReader.prototype.announce = function(str) {
  if (!this.accessibilityEnabled) {
    return;
  }

  if (this.queue_.length == 0) {
    this.queue_.push(str);
  } else {
    // We put a space between strings that appear on the same line.
    // TODO(raymes): We should check the location on the row and not add a space
    // if the strings are joined together.
    let padding = '';
    if (this.queue_[this.queue_.length - 1].length != 0) {
      padding = ' ';
    }
    this.queue_[this.queue_.length - 1] += padding + str;
  }

  // If we've already scheduled text being added to the live region, wait for it
  // to happen.
  if (this.nextReadTimer_) {
    return;
  }

  // If there's only one item in the queue, we may get other text being added
  // very soon after. In that case, wait a small delay so we can merge the
  // related strings.
  if (this.queue_.length == 1) {
    this.nextReadTimer_ = setTimeout(this.onNextReadTimer_.bind(this),
                                     hterm.AccessibilityReader.DELAY / 2);
  } else {
    throw new Error(
        'Expected only one item in queue_ or nextReadTimer_ to be running.');
  }
};

/**
 * Announce the current screen of content. This will interrupt existing
 * announcements.
 *
 * @param {string} str The string to announce using a live region.
 */
hterm.AccessibilityReader.prototype.announceCurrentScreen = function(str) {
  if (!this.accessibilityEnabled) {
    return;
  }

  this.clear();
  this.assertiveLiveElement_.setAttribute('aria-label', str);
};

/**
 * Add a newline to the text that will be announced to the live region.
 */
hterm.AccessibilityReader.prototype.newLine = function() {
  if (!this.accessibilityEnabled) {
    return;
  }

  // Don't append to the queue if the queue is empty. It won't have any impact.
  if (this.queue_.length > 0) {
    this.queue_.push('');
  }
};

/**
 * Clear the live region and any in-flight announcements.
 */
hterm.AccessibilityReader.prototype.clear = function() {
  this.liveElement_.setAttribute('aria-label', '');
  this.assertiveLiveElement_.setAttribute('aria-label', '');
  clearTimeout(this.nextReadTimer_);
  this.nextReadTimer_ = null;
  this.queue_ = [];
};

/**
 * Add text from queue_ to the live region.
 *
 */
hterm.AccessibilityReader.prototype.addToLiveRegion_ = function() {
  if (this.nextReadTimer_) {
    throw new Error('Expected nextReadTimer_ not to be running.');
  }

  // As soon as the aria-label is changed, the screen reader will be informed so
  // we can re-use the same element.
  // TODO(raymes): One downside of this approach is that strings that span two
  // calls to addToLiveRegion_ will have a newline placed between them. We could
  // try to use heuristics to avoid this but it would be more complicated and it
  // should only happen for large amounts of output.
  this.liveElement_.setAttribute('aria-label', this.queue_.join('\n'));
  this.queue_ = [];
};

/**
 * Fired when nextReadTimer_ finishes.
 *
 * This clears the aria-label attribute and sets up a call to onClearFinished_.
 */
hterm.AccessibilityReader.prototype.onNextReadTimer_ = function() {
  this.liveElement_.setAttribute('aria-label', '');
  // We need to wait for the screen reader to register that the attribute is
  // cleared. This is only necessary if the string to be announced is identical
  // to the previous string to be announced.
  // TODO(raymes): Optimize for the above case if necessary.
  this.nextReadTimer_ = setTimeout(this.onClearFinished_.bind(this),
                                   hterm.AccessibilityReader.DELAY / 2);
};

/**
 * Fired when sufficient time has passed to clear the aria-label attribute.
 */
hterm.AccessibilityReader.prototype.onClearFinished_ = function() {
  this.nextReadTimer_ = null;
  this.addToLiveRegion_();
};
