// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('lib.f');

/**
 * UI Element that controls the multi-column list in the connect dialog.
 *
 * Maybe it should be promoted to a shared lib at some point.
 */
nassh.ColumnList = function(div, items, opt_columnCount) {
  this.div_ = div || null;
  this.items_ = items;
  this.columnCount = opt_columnCount || 2;
  this.activeIndex = null;

  this.document_ = null;

  if (div)
    this.decorate(div);
};

/**
 * Turn a div into a ColumnList.
 */
nassh.ColumnList.prototype.decorate = function(div) {
  this.div_ = div;
  this.document_ = div.ownerDocument;

  this.div_.style.overflowY = 'auto';
  this.div_.style.overflowX = 'hidden';
  this.div_.addEventListener('keydown', this.onKeyDown_.bind(this));

  this.redraw();
};

/**
 * Focus the ColumnList.
 */
nassh.ColumnList.prototype.focus = function() {
  if (!this.div_)
    throw 'Not intialized.';

  this.div_.focus();
};

/**
 * Add an event listener.
 */
nassh.ColumnList.prototype.addEventListener = function(var_args) {
  if (!this.div_)
    throw 'Not intialized.';

  this.div_.addEventListener.apply(this.div_, arguments);
};

/**
 * Have the ColumnList redraw after a brief timeout.
 *
 * Coalesces multiple invocations during the timeout period.
 */
nassh.ColumnList.prototype.scheduleRedraw = function() {
  if (this.redrawTimeout_)
    return;

  this.redrawTimeout_ = setTimeout(function() {
      this.redrawTimeout_ = null;
      this.redraw();
    }.bind(this), 100);
};

/**
 * Emoty out and redraw the list.
 */
nassh.ColumnList.prototype.redraw = function() {
  var div = this.div_;

  while (div.firstChild) {
    div.removeChild(div.firstChild);
  }

  div.setAttribute('tabindex', '0');
  div.setAttribute('role', 'listbox');

  var baseID = div.getAttribute('id');
  if (!baseID) {
    baseID = Math.floor(Math.random() * 0xffff + 1).toString(16);
    baseID = lib.f.zpad(baseID, 4);
    baseID = 'columnlist-' + baseID;
  }

  if (!this.items_.length)
    return;

  var columnWidth = (1 / this.columnCount * 100) + '%';

  for (var i = 0; i < this.columnCount; i++) {
    var column = this.document_.createElement('div');
    column.className = 'column-list-column';
    column.setAttribute('x-vbox', 'x-vbox');
    column.style.width = columnWidth;
    column.style.overflow = 'hidden';
    div.appendChild(column);
  }

  for (var i = 0; i < this.items_.length; i++) {
    var box = this.document_.createElement('div');
    box.setAttribute('x-box', 'x-box');
    box.setAttribute('role', 'option');
    box.setAttribute('id', baseID + '-item-' + i);
    box.className = 'column-list-item';
    box.style.overflow = 'hidden';

    var item = this.document_.createElement('div');
    item.textContent = this.items_[i].textContent || 'no-name';
    item.addEventListener('click', this.onItemClick_.bind(this, box));
    item.addEventListener('dblclick', this.onItemClick_.bind(this, box));
    box.appendChild(item);

    this.div_.childNodes[i % this.columnCount].appendChild(box);
  }

  this.setActiveIndex(Math.min(this.activeIndex, this.items_.length - 1));
};

/**
 * Set the index of the item that should be considered "active".
 */
nassh.ColumnList.prototype.setActiveIndex = function(i) {
  if (isNaN(i))
    throw new Error('Index is NaN');

  var before = this.activeIndex;

  if (i != this.activeIndex) {
    var n = this.getActiveNode_();
    if (n)
      n.classList.remove('active');

    setTimeout(
        this.onActiveIndexChanged.bind(this, {before: before, now: i}), 0);
  }

  this.activeIndex = i;
  var node = this.getActiveNode_();
  node.classList.add('active');
  this.div_.setAttribute('aria-activedescendant', node.getAttribute('id'));

  setTimeout(node.scrollIntoViewIfNeeded.bind(node), 0);
};

/**
 * Return the outer DOM node for the active item.
 */
nassh.ColumnList.prototype.getActiveNode_ = function() {
  return this.getNodeByIndex_(this.activeIndex);
};

/**
 * Given an index into the list, return the (row, column) location.
 */
nassh.ColumnList.prototype.getRowColByIndex_ = function(i) {
  return {
    row: parseInt(i / this.columnCount),
    column: i % this.columnCount
  };
};

/**
 * Given a 1d index into the list, return the DOM node.
 */
nassh.ColumnList.prototype.getNodeByIndex_ = function(i) {
  var rc = this.getRowColByIndex_(i);
  return this.getNodeByRowCol_(rc.row, rc.column);
};

/**
 * Given a (row, column) location, return an index into the list.
 */
nassh.ColumnList.prototype.getIndexByRowCol_ = function(
    row, column) {
  return this.columnCount * row + column;
};

/**
 * Given a (row, column) location, return a DOM node.
 */
nassh.ColumnList.prototype.getNodeByRowCol_ = function(
    row, column) {
  if (this.div_.childNodes.length <= column)
    return null;

  return this.div_.childNodes[column].childNodes[row] || null;
};

/**
 * Someone clicked on an item in the list.
 */
nassh.ColumnList.prototype.onItemClick_ = function(srcNode, e) {
  var node = srcNode.previousSibling;
  var row = 0;
  while (node) {
    row++;
    node = node.previousSibling;
  }

  node = srcNode.parentNode.previousSibling;
  var column = 0;
  while (node) {
    column++;
    node = node.previousSibling;
  }

  var i = this.getIndexByRowCol_(row, column);
  this.setActiveIndex(i);

  e.preventDefault();
  return false;
};

/**
 * Return the height (in items) of a given column.
 */
nassh.ColumnList.prototype.getColumnHeight_ = function(column) {
  return this.div_.childNodes[column].childNodes.length;
};

/**
 * Clients can override this to learn when the active index changes.
 */
nassh.ColumnList.prototype.onActiveIndexChanged = function(e) { };

/**
 * Clients can override this to handle onKeyDown events.
 *
 * They can return false (literally) to block the ColumnList from also
 * handling the event.
 */
nassh.ColumnList.prototype.onKeyDown = function(e) { };

/**
 * Handle a key down event on the div.
 */
nassh.ColumnList.prototype.onKeyDown_ = function(e) {
  if (this.onKeyDown(e) === false)
    return;

  var i = this.activeIndex;
  var rc = this.getRowColByIndex_(i);
  var node = this.getActiveNode_();

  switch (e.keyCode) {
    case 38:  // UP
      if (i == 0) {
        // UP from the first item, warp to the last.
        i = this.items_.length - 1;
      } else if (rc.row == 0) {
       // UP from the first row, warp to bottom of previous column.
        i = this.getIndexByRowCol_(this.getColumnHeight_(rc.column - 1) - 1,
                                   rc.column - 1);
      } else {
        // UP from anywhere else, just move up a row.
        i = this.getIndexByRowCol_(rc.row - 1, rc.column);
      }
      break;

    case 40:  // DOWN
      if (i == this.items_.length - 1) {
        // DOWN from last item, warp to the first.
        i = 0;
      } else if (rc.row == this.getColumnHeight_(rc.column) - 1) {
        // DOWN from the bottom row, warp to top of the next.
        i = this.getIndexByRowCol_(0, rc.column + 1);
      } else {
        // DOWN from anywhere else, move down a row.
        i = this.getIndexByRowCol_(rc.row + 1, rc.column);
      }
      break;

    case 39:  // RIGHT
      if (i == this.items_.length - 1) {
        // RIGHT from last item, warp to the first.
        i = 0;
      } else if (rc.column >= this.columnCount - 1 ||
                 rc.row >= this.getColumnHeight_(rc.column + 1)) {
        // RIGHT from last column (of this row), warp to the first column of
        // next row.
        i = this.getIndexByRowCol_(rc.row + 1, 0);
      } else {
        // RIGHT from anywhere else, move right a column.
        i = this.getIndexByRowCol_(rc.row, rc.column + 1);
      }
      break;

    case 37:  // LEFT
      if (i == 0) {
        // LEFT from first item, warp to the last.
        i = this.items_.length - 1;
      } else if (rc.column == 0) {
        // LEFT from first column, warp to the last column of previous row.
        i = this.getIndexByRowCol_(rc.row - 1, this.columnCount - 1);
      } else {
        // LEFT from anywhere else, move left a column.
        i = this.getIndexByRowCol_(rc.row, rc.column - 1);
      }
      break;
  }

  if (i != this.activeIndex) {
    this.setActiveIndex(i);
  }
};
