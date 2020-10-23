// Copyright 2018 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview Context menu handling.
 */

/**
 * Manage the context menu usually shown when right clicking.
 *
 * @constructor
 */
hterm.ContextMenu = function() {
  // The document that contains this context menu.
  this.document_ = null;
  // The generated context menu (i.e. HTML elements).
  this.element_ = null;
  // The structured menu (i.e. JS objects).
  /** @type {!Array<!hterm.ContextMenu.Item>} */
  this.menu_ = [];
};

/** @typedef {{name:(string|symbol), action:function(!Event)}} */
hterm.ContextMenu.Item;

/**
 * Constant to add a separator to the context menu.
 */
hterm.ContextMenu.SEPARATOR = Symbol('-');

/**
 * Bind context menu to a specific document element.
 *
 * @param {!Document} document The document to use when creating elements.
 */
hterm.ContextMenu.prototype.setDocument = function(document) {
  if (this.element_) {
    this.element_.remove();
    this.element_ = null;
  }
  this.document_ = document;
  this.regenerate_();
  this.document_.body.appendChild(this.element_);
};

/**
 * Regenerate the HTML elements based on internal menu state.
 */
hterm.ContextMenu.prototype.regenerate_ = function() {
  if (!this.element_) {
    this.element_ = this.document_.createElement('menu');
    this.element_.id = 'hterm:context-menu';
  } else {
    this.hide();
  }

  // Clear out existing menu entries.
  while (this.element_.firstChild) {
    this.element_.removeChild(this.element_.firstChild);
  }

  this.menu_.forEach(({name, action}) => {
    const menuitem = this.document_.createElement('menuitem');
    if (name === hterm.ContextMenu.SEPARATOR) {
      menuitem.innerHTML = '<hr>';
      menuitem.className = 'separator';
    } else {
      menuitem.innerText = name;
      menuitem.addEventListener('mousedown', function(e) {
        e.preventDefault();
        action(e);
      });
    }
    this.element_.appendChild(menuitem);
  });
};

/**
 * Set all the entries in the context menu.
 *
 * This is an array of arrays.  The first element in the array is the string to
 * display while the second element is the function to call.
 *
 * The first element may also be the SEPARATOR constant to add a separator.
 *
 * This resets all existing menu entries.
 *
 * @param {!Array<!hterm.ContextMenu.Item>} items The menu entries.
 */
hterm.ContextMenu.prototype.setItems = function(items) {
  this.menu_ = items;
  this.regenerate_();
};

/**
 * Show the context menu.
 *
 * The event is used to determine where to show the menu.
 *
 * If no menu entries are defined, then nothing will be shown.
 *
 * @param {!Event} e The event triggering this display.
 * @param {!hterm.Terminal=} terminal The terminal object to get style info
 *     from.
 */
hterm.ContextMenu.prototype.show = function(e, terminal) {
  // If there are no menu entries, then don't try to show anything.
  if (this.menu_.length == 0) {
    return;
  }

  // If we have the terminal, sync the style preferences over.
  if (terminal) {
    this.element_.style.fontSize = terminal.getFontSize();
    this.element_.style.fontFamily = terminal.getFontFamily();
  }

  this.element_.style.top = `${e.clientY}px`;
  this.element_.style.left = `${e.clientX}px`;
  const docSize = this.document_.body.getBoundingClientRect();

  this.element_.style.display = 'block';

  // We can't calculate sizes until after it's displayed.
  const eleSize = this.element_.getBoundingClientRect();
  // Make sure the menu isn't clipped outside of the current element.
  const minY = Math.max(0, docSize.height - eleSize.height);
  const minX = Math.max(0, docSize.width - eleSize.width);
  if (minY < e.clientY) {
    this.element_.style.top = `${minY}px`;
  }
  if (minX < e.clientX) {
    this.element_.style.left = `${minX}px`;
  }
};

/**
 * Hide the context menu.
 */
hterm.ContextMenu.prototype.hide = function() {
  if (!this.element_) {
    return;
  }

  this.element_.style.display = 'none';
};
