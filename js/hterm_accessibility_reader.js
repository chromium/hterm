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
  this.liveRegion_ = this.document_.createElement('div');
  this.liveRegion_.id = 'hterm:accessibility-live-region';
  this.liveRegion_.setAttribute('aria-live', 'polite');
  this.liveRegion_.style.cssText = `position: absolute;
                                    width: 0; height: 0;
                                    overflow: hidden;
                                    left: 0; top: 0;`;
  div.appendChild(this.liveRegion_);

  // A queue of updates to announce.
  this.queue_ = [];

  // A timer which tracks when next to add items to the live region. null when
  // not running. This is used to combine updates that occur in a small window,
  // as well as to avoid too much output being added to the live region in one
  // go which can cause the renderer to hang.
  this.nextReadTimer_ = null;
};

/**
 * Initial delay in ms to use for merging strings to output.
 *
 * Only used if no output has been spoken recently. We want this to be
 * relatively short so there's not a big delay between typing/executing commands
 * and hearing output.
 *
 * @constant
 * @type {integer}
 */
hterm.AccessibilityReader.INITIAL_DELAY = 50;

/**
 * Delay for bufferring subsequent strings of output in ms.

 * This can be longer because text is already being spoken. Having too small a
 * delay interferes with performance for large amounts of output. A larger delay
 * may cause interruptions to speech.
 *
 * @constant
 * @type {integer}
 */
hterm.AccessibilityReader.SUBSEQUENT_DELAY = 100;

/**
 * The maximum number of strings to add to the live region in a single pass.
 *
 * If this is too large performance will suffer. If it is too small, it will
 * take too long to add text to the live region and may cause interruptions
 * to speech.
 *
 * @constant
 * @type {integer}
 */
hterm.AccessibilityReader.MAX_ITEMS_TO_ADD = 100;

/**
 * Announce the command output.
 *
 * @param {string} str The string to announce using a live region.
 */
hterm.AccessibilityReader.prototype.announce = function(str) {
  // TODO(raymes): If the string being added is on the same line as previous
  // strings in the queue, merge them so that the reading of the text doesn't
  // stutter.
  this.queue_.push(str);

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
        hterm.AccessibilityReader.INITIAL_DELAY);
  } else {
    throw new Error(
        'Expected only one item in queue_ or nextReadTimer_ to be running.');
  }
};

/**
 * Clear the live region.
 */
hterm.AccessibilityReader.prototype.clear = function() {
  while (this.liveRegion_.firstChild) {
    this.liveRegion_.firstChild.remove();
  }
};

/**
 * Add text from queue_ to the live region.
 *
 * This limits the amount of text that will be added in one go and schedules
 * another call to addLiveRegion_ afterwards to continue adding text until
 * queue_ is empty.
 */
hterm.AccessibilityReader.prototype.addToLiveRegion_ = function() {
  if (this.nextReadTimer_) {
    throw new Error('Expected nextReadTimer_ not to be running.');
  }

  // Clear the live region so it doesn't grow indefinitely. As soon as elements
  // are added to the DOM, the screen reader will be informed so we don't need
  // to keep elements around after that.
  this.clear();

  for (let i = 0; i < hterm.AccessibilityReader.MAX_ITEMS_TO_ADD; ++i) {
    const str = this.queue_.shift();
    const liveElement = this.document_.createElement('p');
    liveElement.innerText = str;
    this.liveRegion_.appendChild(liveElement);
    if (this.queue_.length == 0) {
      break;
    }
  }

  if (this.queue_.length > 0) {
    this.nextReadTimer_ = setTimeout(
        this.onNextReadTimer_.bind(this),
        hterm.AccessibilityReader.SUBSEQUENT_DELAY);
  }
};

/**
 * Fired when nextReadTimer_ finishes.
 *
 * This clears the timer and calls addToLiveRegion_.
 */
hterm.AccessibilityReader.prototype.onNextReadTimer_ = function() {
  this.nextReadTimer_ = null;
  this.addToLiveRegion_();
};
