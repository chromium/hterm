// Copyright 2020 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview A UI for managing user notifications.  It's a distinct UI space
 *     from the terminal itself to help users clearly distinguish between remote
 *     output.  This makes it hard for the remote to spoof the user.
 */

/**
 * Class that controls everything about the notification center.
 */
hterm.NotificationCenter = class {
  /**
   * @param {!Element} parent The node that we will display inside.
   * @param {?hterm.AccessibilityReader=} reader Helper for reading content.
   */
  constructor(parent, reader = undefined) {
    this.parent_ = parent;
    this.reader_ = reader;
    this.container_ = this.newContainer_();
    /** @type {?number} Id for automatic hiding timeout. */
    this.timeout_ = null;
    /** @type {number} Fadeout delay (for tests to control). */
    this.fadeout_ = 200;
  }

  /** @return {!Element} */
  newContainer_() {
    const ele = this.parent_.ownerDocument.createElement('div');
    ele.style.cssText =
        'color: rgb(var(--hterm-background-color));' +
        'background-color: rgb(var(--hterm-foreground-color));' +
        'border-radius: 12px;' +
        'font: 500 var(--hterm-font-size) "Noto Sans", sans-serif;' +
        'opacity: 0.75;' +
        'padding: 0.923em 1.846em;' +
        'position: absolute;' +
        'user-select: none;' +
        'transition: opacity 180ms ease-in;';

    // Prevent the dialog from gaining focus.
    ele.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation();
    }, true);

    return ele;
  }

  /**
   * Show a notification for the specified duration.
   *
   * The notification appears in inverse video, centered over the terminal.
   *
   * @param {string|!Node} msg The message to display.
   * @param {{
   *     timeout: (?number|undefined),
   * }=} options
   *     timeout: How long (millisec) to wait before hiding the notification.
   *         Pass null to never autohide.
   */
  show(msg, {timeout = 1500} = {}) {
    const node = typeof msg === 'string' ? new Text(msg) : msg;

    // Remove all children first.
    this.container_.textContent = '';
    this.container_.appendChild(node);
    this.container_.style.opacity = '0.75';

    // Display on the page if it isn't already.
    if (!this.container_.parentNode) {
      this.parent_.appendChild(this.container_);
    }

    // Keep the notification centered.
    const size = this.container_.getBoundingClientRect();
    this.container_.style.top = `calc(50% - ${size.height / 2}px)`;
    this.container_.style.left = `calc(50% - ${size.width / 2}px)`;

    if (this.reader_) {
      this.reader_.assertiveAnnounce(this.container_.textContent);
    }

    // Handle automatic hiding of the UI.
    if (this.timeout_) {
      clearTimeout(this.timeout_);
      this.timeout_ = null;
    }
    if (timeout === null) {
      return;
    }
    this.timeout_ = setTimeout(() => {
      this.container_.style.opacity = '0';
      this.timeout_ = setTimeout(() => this.hide(), this.fadeout_);
    }, timeout);
  }

  /**
   * Hide the active notification immediately.
   *
   * Useful when we show a message for an event with an unknown end time.
   */
  hide() {
    if (this.timeout_) {
      clearTimeout(this.timeout_);
      this.timeout_ = null;
    }

    this.container_.remove();
    // Remove all children in case there was sensitive content shown that we
    // don't want to leave laying around.
    this.container_.textContent = '';
  }
};
