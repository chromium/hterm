// Copyright 2020 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview Find bar handling.
 */

/**
 * Manage the find bar.
 *
 * @param {!hterm.Terminal} terminal
 * @constructor
 */
hterm.FindBar = function(terminal) {
  /**
   * @private {!hterm.Terminal}
   * @const
   */
  this.terminal_ = terminal;

  /** @private {?Element} */
  this.findBar_ = null;

  /** @private {?Element} */
  this.input_ = null;

  /** @private {?Element} */
  this.upArrow_ = null;

  /** @private {?Element} */
  this.downArrow_ = null;

  /** @private {?Element} */
  this.closeButton_ = null;

  /** @type {boolean} */
  this.underTest = false;
};

/**
 * Add find bar to the terminal.
 *
 * @param {!Document} document
 */
hterm.FindBar.prototype.decorate = function(document) {
  this.findBar_ = document.createElement('div');
  this.findBar_.id = 'hterm:find-bar';
  this.findBar_.setAttribute('aria-hidden', 'true');
  this.findBar_.innerHTML = lib.resource.getData('hterm/html/find_bar');

  this.input_ = this.findBar_.querySelector('input');
  this.upArrow_ = this.findBar_.querySelector('#hterm\\:find-bar-up');
  this.downArrow_ = this.findBar_.querySelector('#hterm\\:find-bar-down');
  this.closeButton_ = this.findBar_.querySelector('#hterm\\:find-bar-close');

  // Add aria-label and svg icons.
  this.upArrow_.innerHTML = lib.resource
      .getData('hterm/images/keyboard_arrow_up');
  this.downArrow_.innerHTML = lib.resource
      .getData('hterm/images/keyboard_arrow_down');
  this.closeButton_.innerHTML = lib.resource.getData('hterm/images/close');

  this.upArrow_.setAttribute('aria-label', hterm.msg('BUTTON_PREVIOUS'));
  this.downArrow_.setAttribute('aria-label', hterm.msg('BUTTON_NEXT'));
  this.input_.setAttribute('aria-label', hterm.msg('BUTTON_FIND'));
  this.closeButton_.setAttribute('aria-label', hterm.msg('BUTTON_CLOSE'));

  // Add event listeners to the elements.
  const el = (e) => /** @type {!EventListener} */ (e.bind(this));
  this.input_.addEventListener('input', el(this.onInput_));
  this.input_.addEventListener('keydown', el(this.onKeyDown_));
  this.input_.addEventListener('keypress', el(this.onKeyPressed_));
  this.input_.addEventListener('textInput', el(this.onInputText_));
  this.closeButton_.addEventListener('click', el(this.close));

  document.body.appendChild(this.findBar_);
};

/**
 * Display find bar.
 */
hterm.FindBar.prototype.display = function() {
  if (!this.underTest) {
    // TODO(crbug.com/209178): To be implemented.
    return;
  }
  this.findBar_.classList.add('enabled');
  this.findBar_.removeAttribute('aria-hidden');
  this.input_.focus();
};

/**
 * Close find bar.
 */
hterm.FindBar.prototype.close = function() {
  this.findBar_.classList.remove('enabled');
  this.findBar_.setAttribute('aria-hidden', 'true');
  this.terminal_.focus();
};

/**
 * @param {!Event} event The event triggered on input in find bar.
 */
hterm.FindBar.prototype.onInput_ = function(event) {
  // TODO(crbug.com/209178): To be implemented.
  event.preventDefault();
};

/**
 * @param {!Event} event The event triggered on key press in find bar.
 */
hterm.FindBar.prototype.onKeyPressed_ = function(event) {
  event.stopPropagation();
};

/**
 * @param {!Event} event The event triggered on text input in find bar.
 */
hterm.FindBar.prototype.onInputText_ = function(event) {
  event.stopPropagation();
};

/**
 * @param {!Event} event The event triggered on keydown in find bar.
 */
hterm.FindBar.prototype.onKeyDown_ = function(event) {
  if (event.key == 'Escape') {
    this.close();
  }
  // TODO(crbug.com/209178): To be implemented.
  event.stopPropagation();
};
