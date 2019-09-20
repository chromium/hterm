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
 * @param {!Element} div The div element where the live region should be
 *     added.
 * @constructor
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

  // This is set to true if the cursor is about to update position on the
  // screen. i.e. beforeCursorChange has been called but not afterCursorChange.
  this.cursorIsChanging_ = false;

  // This tracks changes that would be added to queue_ while the cursor is
  // changing. This is done so that we can decide to discard these changes if
  // we announce something as a result of the cursor change.
  this.cursorChangeQueue_ = [];

  // The string of text on the row that the cursor was last on. Only valid while
  // cursorIsChanging_ is true.
  this.lastCursorRowString_ = null;

  // The row that the cursor was last on. Only valid while cursorIsChanging_ is
  // true.
  this.lastCursorRow_ = null;

  // The column that the cursor was last on. Only valid while cursorIsChanging_
  // is true.
  this.lastCursorColumn_ = null;

  // True if a keypress has been performed since the last cursor change.
  this.hasUserGesture = false;
};

/**
 * Delay in ms to use for merging strings to output.
 *
 * We merge strings together to avoid hanging the terminal and to ensure that
 * aria updates make it to the screen reader. We want this to be short so
 * there's not a big delay between typing/executing commands and hearing output.
 *
 * @constant
 * @type {number}
 */
hterm.AccessibilityReader.DELAY = 50;

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
 * Decorate the document where the terminal <x-screen> resides. This is needed
 * for listening to keystrokes on the screen.
 *
 * @param {!Document} doc The document where the <x-screen> resides.
 */
hterm.AccessibilityReader.prototype.decorate = function(doc) {
  const handlers = ['keydown', 'keypress', 'keyup', 'textInput'];
  handlers.forEach((handler) => {
    doc.addEventListener(handler, () => { this.hasUserGesture = true; });
  });
};

/**
 * This should be called before the cursor on the screen is about to get
 * updated. This allows cursor changes to be tracked and related notifications
 * to be announced.
 *
 * @param {string} cursorRowString The text in the row that the cursor is
 *     currently on.
 * @param {number} cursorRow The index of the row that the cursor is currently
 *     on, including rows in the scrollback buffer.
 * @param {number} cursorColumn The index of the column that the cursor is
 *     currently on.
 */
hterm.AccessibilityReader.prototype.beforeCursorChange =
    function(cursorRowString, cursorRow, cursorColumn) {
  // If accessibility is enabled we don't announce selection changes as these
  // can have a performance impact.
  if (!this.accessibilityEnabled) {
    return;
  }

  // If there is no user gesture that can be tied to the cursor change, we
  // don't want to announce anything.
  if (!this.hasUserGesture || this.cursorIsChanging_) {
    return;
  }

  this.cursorIsChanging_ = true;
  this.lastCursorRowString_ = cursorRowString;
  this.lastCursorRow_ = cursorRow;
  this.lastCursorColumn_ = cursorColumn;
};

/**
 * This should be called after the cursor on the screen has been updated. Note
 * that several updates to the cursor may have happened between
 * beforeCursorChange and afterCursorChange.
 *
 * This allows cursor changes to be tracked and related notifications to be
 * announced.
 *
 * @param {string} cursorRowString The text in the row that the cursor is
 *     currently on.
 * @param {number} cursorRow The index of the row that the cursor is currently
 *     on, including rows in the scrollback buffer.
 * @param {number} cursorColumn The index of the column that the cursor is
 *     currently on.
 */
hterm.AccessibilityReader.prototype.afterCursorChange =
    function(cursorRowString, cursorRow, cursorColumn) {
  // This can happen if clear() is called midway through a cursor change.
  if (!this.cursorIsChanging_) {
    return;
  }
  this.cursorIsChanging_ = false;

  if (!this.announceAction_(cursorRowString, cursorRow, cursorColumn)) {
    // If we don't announce a special action, we re-queue all the output that
    // was queued during the selection change.
    for (let i = 0; i < this.cursorChangeQueue_.length; ++i) {
      this.announce(this.cursorChangeQueue_[i]);
    }
  }

  this.cursorChangeQueue_ = [];
  this.lastCursorRowString_ = null;
  this.lastCursorRow_ = null;
  this.lastCursorColumn_ = null;
  this.hasUserGesture = false;
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

  // If the cursor is in the middle of changing, we queue up the output
  // separately as we may not want it to be announced if it's part of a cursor
  // change announcement.
  if (this.cursorIsChanging_) {
    this.cursorChangeQueue_.push(str);
    return;
  }

  // Don't append newlines to the queue if the queue is empty. It won't have any
  // impact.
  if (str == '\n' && this.queue_.length > 0) {
    this.queue_.push('');
    // We don't need to trigger an announcement on newlines because they won't
    // change the existing content that's output.
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
    this.nextReadTimer_ = setTimeout(this.addToLiveRegion_.bind(this),
                                     hterm.AccessibilityReader.DELAY);
  } else {
    throw new Error(
        'Expected only one item in queue_ or nextReadTimer_ to be running.');
  }
};

/**
 * Voice an announcement that will interrupt other announcements.
 *
 * @param {string} str The string to announce using a live region.
 */
hterm.AccessibilityReader.prototype.assertiveAnnounce = function(str) {
  if (this.hasUserGesture && str == ' ') {
    str = hterm.msg('SPACE_CHARACTER', [], 'Space');
  }

  // If the same string is announced twice, an attribute change won't be
  // registered and the screen reader won't know that the string has changed.
  // So we slightly change the string to ensure that the attribute change gets
  // registered.
  str = str.trim();
  if (str == this.assertiveLiveElement_.getAttribute('aria-label')) {
    str = '\n' + str;
  }

  this.clear();
  this.assertiveLiveElement_.setAttribute('aria-label', str);
};

/**
 * Add a newline to the text that will be announced to the live region.
 */
hterm.AccessibilityReader.prototype.newLine = function() {
  this.announce('\n');
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

  this.cursorIsChanging_ = false;
  this.cursorChangeQueue_ = [];
  this.lastCursorRowString_ = null;
  this.lastCursorRow_ = null;
  this.lastCursorColumn_ = null;
  this.hasUserGesture = false;
};

/**
 * This will announce an action that is related to a cursor change, for example
 * when the user deletes a character we want the character deleted to be
 * announced. Similarly, when the user moves the cursor along the line, we want
 * the characters selected to be announced.
 *
 * Note that this function is a heuristic. Because of the nature of terminal
 * emulators, we can't distinguish input and output, which means we don't really
 * know what output is the result of a keypress and what isn't. Also in some
 * terminal applications certain announcements may make sense whereas others may
 * not. This function should try to account for the most common cases.
 *
 * @param {string} cursorRowString The text in the row that the cursor is
 *     currently on.
 * @param {number} cursorRow The index of the row that the cursor is currently
 *     on, including rows in the scrollback buffer.
 * @param {number} cursorColumn The index of the column that the cursor is
 *     currently on.
 * @return {boolean} Whether anything was announced.
 */
hterm.AccessibilityReader.prototype.announceAction_ =
    function(cursorRowString, cursorRow, cursorColumn) {
  // If the cursor changes rows, we don't announce anything at present.
  if (this.lastCursorRow_ != cursorRow) {
    return false;
  }

  lib.assert(this.lastCursorRowString_ !== null);

  // The case when the row of text hasn't changed at all.
  if (this.lastCursorRowString_ == cursorRowString) {
    // Moving the cursor along the line. We check that no significant changes
    // have been queued. If they have, it may not just be a cursor movement and
    // it may be better to read those out.
    if (this.lastCursorColumn_ != cursorColumn &&
        this.cursorChangeQueue_.join('').trim() == '') {
      // Announce the text between the old cursor position and the new one.
      const start = Math.min(this.lastCursorColumn_, cursorColumn);
      const len = Math.abs(cursorColumn - this.lastCursorColumn_);
      this.assertiveAnnounce(
          lib.wc.substr(this.lastCursorRowString_, start, len));
      return true;
    }
    return false;
  }

  // The case when the row of text has changed.
  if (this.lastCursorRowString_ != cursorRowString) {
    // Spacebar. We manually announce this character since the screen reader may
    // not announce the whitespace in a live region.
    if (this.lastCursorColumn_ + 1 == cursorColumn) {
      if (lib.wc.substr(cursorRowString, cursorColumn - 1, 1) == ' ' &&
          this.cursorChangeQueue_.length > 0 &&
          this.cursorChangeQueue_[0] == ' ') {
        this.assertiveAnnounce(' ');
        return true;
      }
    }

    // Backspace and deletion.
    // The position of the characters deleted is right after the current
    // position of the cursor in the case of backspace and delete.
    const cursorDeleted = cursorColumn;
    // Check that the current row string is shorter than the previous. Also
    // check that the start of the strings (up to the cursor) match.
    if (lib.wc.strWidth(cursorRowString) <=
        lib.wc.strWidth(this.lastCursorRowString_) &&
        lib.wc.substr(this.lastCursorRowString_, 0, cursorDeleted) ==
        lib.wc.substr(cursorRowString, 0, cursorDeleted)) {
      // Find the length of the current row string ignoring space characters.
      // These may be inserted at the end of the string when deleting characters
      // so they should be ignored.
      let lengthOfCurrentRow = lib.wc.strWidth(cursorRowString);
      for (; lengthOfCurrentRow > 0; --lengthOfCurrentRow) {
        if (lengthOfCurrentRow == cursorDeleted ||
            lib.wc.substr(cursorRowString, lengthOfCurrentRow - 1, 1) != ' ') {
          break;
        }
      }

      const numCharsDeleted =
          lib.wc.strWidth(this.lastCursorRowString_) - lengthOfCurrentRow;

      // Check that the end of the strings match.
      const lengthOfEndOfString = lengthOfCurrentRow - cursorDeleted;
      const endOfLastRowString = lib.wc.substr(
          this.lastCursorRowString_, cursorDeleted + numCharsDeleted,
          lengthOfEndOfString);
      const endOfCurrentRowString =
          lib.wc.substr(cursorRowString, cursorDeleted, lengthOfEndOfString);
      if (endOfLastRowString == endOfCurrentRowString) {
        const deleted = lib.wc.substr(
            this.lastCursorRowString_, cursorDeleted, numCharsDeleted);
        if (deleted != '') {
          this.assertiveAnnounce(deleted);
          return true;
        }
      }
    }
    return false;
  }

  return false;
};

/**
 * Add text from queue_ to the live region.
 *
 */
hterm.AccessibilityReader.prototype.addToLiveRegion_ = function() {
  this.nextReadTimer_ = null;

  let str = this.queue_.join('\n').trim();

  // If the same string is announced twice, an attribute change won't be
  // registered and the screen reader won't know that the string has changed.
  // So we slightly change the string to ensure that the attribute change gets
  // registered.
  if (str == this.liveElement_.getAttribute('aria-label')) {
    str = '\n' + str;
  }

  this.liveElement_.setAttribute('aria-label', str);
  this.queue_ = [];
};
