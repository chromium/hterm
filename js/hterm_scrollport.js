// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('hterm.PubSub', 'hterm.Size');

/**
 * A 'viewport' view of fixed-height rows with support for selection and
 * copy-to-clipboard.
 *
 * 'Viewport' in this case means that only the visible rows are in the DOM.
 * If the rowProvider has 100,000 rows, but the ScrollPort is only 25 rows
 * tall, then only 25 dom nodes are created.  The ScrollPort will ask the
 * RowProvider to create new visible rows on demand as they are scrolled in
 * to the visible area.
 *
 * This viewport is designed so that select and copy-to-clipboard still works,
 * even when all or part of the selection is scrolled off screen.
 *
 * Note that the X11 mouse clipboard does not work properly when all or part
 * of the selection is off screen.  It would be difficult to fix this without
 * adding significant overhead to pathologically large selection cases.
 *
 * The RowProvider should return rows rooted by the custom tag name 'x-row'.
 * This ensures that we can quickly assign the correct display height
 * to the rows with css.
 *
 * @param {RowProvider} rowProvider An object capable of providing rows as
 *     raw text or row nodes.
 */
hterm.ScrollPort = function(rowProvider) {
  hterm.PubSub.addBehavior(this);

  this.rowProvider_ = rowProvider;

  // SWAG the character size until we can measure it.
  this.characterSize = new hterm.Size(10, 10);

  // DOM node used for character measurement.
  this.ruler_ = null;

  this.selection = new hterm.ScrollPort.Selection(this);

  // A map of rowIndex => rowNode for each row that is drawn as part of a
  // pending redraw_() call.  Null if there is no pending redraw_ call.
  this.currentRowNodeCache_ = null;

  // A map of rowIndex => rowNode for each row that was drawn as part of the
  // previous redraw_() call.
  this.previousRowNodeCache_ = {};

  // Used during scroll events to detect when the underlying cause is a resize.
  this.lastScreenWidth_ = null;
  this.lastScreenHeight_ = null;

  // True if the user should be allowed to select text in the terminal.
  // This is disabled when the host requests mouse drag events so that we don't
  // end up with two notions of selection.
  this.selectionEnabled_ = true;

  // The last row count returned by the row provider, re-populated during
  // syncScrollHeight().
  this.lastRowCount_ = 0;

  /**
   * True if the last scroll caused the scrollport to show the final row.
   */
  this.isScrolledEnd = true;

  // The css rule that we use to control the height of a row.
  this.xrowCssRule_ = null;

  /**
   * A guess at the current scrollbar width, fixed in resize().
   */
  this.currentScrollbarWidthPx = 16

  this.div_ = null;
  this.document_ = null;

  // Collection of active timeout handles.
  this.timeouts_ = {};

  this.observers_ = {};

  this.DEBUG_ = false;
}

/**
 * Proxy for the native selection object which understands how to walk up the
 * DOM to find the containing row node and sort out which comes first.
 *
 * @param {hterm.ScrollPort} scrollPort The parent hterm.ScrollPort instance.
 */
hterm.ScrollPort.Selection = function(scrollPort) {
  this.scrollPort_ = scrollPort;

  /**
   * The row containing the start of the selection.
   *
   * This may be partially or fully selected.  It may be the selection anchor
   * or the focus, but its rowIndex is guaranteed to be less-than-or-equal-to
   * that of the endRow.
   *
   * If only one row is selected then startRow == endRow.  If there is no
   * selection or the selection is collapsed then startRow == null.
   */
  this.startRow = null;

  /**
   * The row containing the end of the selection.
   *
   * This may be partially or fully selected.  It may be the selection anchor
   * or the focus, but its rowIndex is guaranteed to be greater-than-or-equal-to
   * that of the startRow.
   *
   * If only one row is selected then startRow == endRow.  If there is no
   * selection or the selection is collapsed then startRow == null.
   */
  this.endRow = null;

  /**
   * True if startRow != endRow.
   */
  this.isMultiline = null;

  /**
   * True if the selection is just a point rather than a range.
   */
  this.isCollapsed = null;
};

/**
 * Given a list of DOM nodes and a container, return the DOM node that
 * is first according to a depth-first search.
 *
 * Returns null if none of the children are found.
 */
hterm.ScrollPort.Selection.prototype.findFirstChild = function(
    parent, childAry) {
  var node = parent.firstChild;

  while (node) {
    if (childAry.indexOf(node) != -1)
      return node;

    if (node.childNodes.length) {
      var rv = this.findFirstChild(node, childAry);
      if (rv)
        return rv;
    }

    node = node.nextSibling;
  }

  return null;
};

/**
 * Synchronize this object with the current DOM selection.
 *
 * This is a one-way synchronization, the DOM selection is copied to this
 * object, not the other way around.
 */
hterm.ScrollPort.Selection.prototype.sync = function() {
  var self = this;

  // The dom selection object has no way to tell which nodes come first in
  // the document, so we have to figure that out.
  //
  // This function is used when we detect that the "anchor" node is first.
  function anchorFirst() {
    self.startRow = anchorRow;
    self.startNode = selection.anchorNode;
    self.startOffset = selection.anchorOffset;
    self.endRow = focusRow;
    self.endNode = selection.focusNode;
    self.endOffset = selection.focusOffset;
  }

  // This function is used when we detect that the "focus" node is first.
  function focusFirst() {
    self.startRow = focusRow;
    self.startNode = selection.focusNode;
    self.startOffset = selection.focusOffset;
    self.endRow = anchorRow;
    self.endNode = selection.anchorNode;
    self.endOffset = selection.anchorOffset;
  }

  var selection = this.scrollPort_.getDocument().getSelection();

  this.startRow = null;
  this.endRow = null;
  this.isMultiline = null;
  this.isCollapsed = !selection || selection.isCollapsed;

  if (this.isCollapsed)
    return;

  var anchorRow = selection.anchorNode;
  while (anchorRow && !('rowIndex' in anchorRow)) {
    anchorRow = anchorRow.parentNode;
  }

  if (!anchorRow) {
    console.error('Selection anchor is not rooted in a row node: ' +
                  selection.anchorNode.nodeName);
    return;
  }

  var focusRow = selection.focusNode;
  while (focusRow && !('rowIndex' in focusRow)) {
    focusRow = focusRow.parentNode;
  }

  if (!focusRow) {
    console.error('Selection focus is not rooted in a row node: ' +
                  selection.focusNode.nodeName);
    return;
  }

  if (anchorRow.rowIndex < focusRow.rowIndex) {
    anchorFirst();

  } else if (anchorRow.rowIndex > focusRow.rowIndex) {
    focusFirst();

  } else if (selection.focusNode == selection.anchorNode) {
    if (selection.anchorOffset < selection.focusOffset) {
      anchorFirst();
    } else {
      focusFirst();
    }

  } else {
    // The selection starts and ends in the same row, but isn't contained all
    // in a single node.
    var firstNode = this.findFirstChild(
        anchorRow, [selection.anchorNode, selection.focusNode]);

    if (!firstNode)
      throw new Error('Unexpected error syncing selection.');

    if (firstNode == selection.anchorNode) {
      anchorFirst();
    } else {
      focusFirst();
    }
  }

  this.isMultiline = anchorRow.rowIndex != focusRow.rowIndex;
};

/**
 * Turn a div into this hterm.ScrollPort.
 */
hterm.ScrollPort.prototype.decorate = function(div) {
  this.div_ = div;

  this.iframe_ = div.ownerDocument.createElement('iframe');
  this.iframe_.style.cssText = (
      'border: 0;' +
      'height: 100%;' +
      'position: absolute;' +
      'width: 100%');

  div.appendChild(this.iframe_);

  this.iframe_.contentWindow.addEventListener('resize',
                                              this.onResize_.bind(this));

  var doc = this.document_ = this.iframe_.contentDocument;
  doc.body.style.cssText = (
      'margin: 0px;' +
      'padding: 0px;' +
      'height: 100%;' +
      'width: 100%;' +
      'overflow: hidden;' +
      '-webkit-user-select: none;');

  var style = doc.createElement('style');
  style.textContent = 'x-row {}';
  doc.head.appendChild(style);

  this.xrowCssRule_ = doc.styleSheets[0].cssRules[0];
  this.xrowCssRule_.style.display = 'block';

  // TODO(rginda): Sorry, this 'screen_' isn't the same thing as hterm.Screen
  // from screen.js.  I need to pick a better name for one of them to avoid
  // the collision.
  this.screen_ = doc.createElement('x-screen');
  this.screen_.setAttribute('role', 'textbox');
  this.screen_.setAttribute('tabindex', '-1');
  this.screen_.style.cssText = (
      'display: block;' +
      'font-family: monospace;' +
      'font-size: 15px;' +
      'height: 100%;' +
      'overflow-y: scroll; overflow-x: hidden;' +
      'white-space: pre;' +
      'width: 100%;' +
      'outline: none !important');

  doc.body.appendChild(this.screen_);

  this.screen_.addEventListener('scroll', this.onScroll_.bind(this));
  this.screen_.addEventListener('mousewheel', this.onScrollWheel_.bind(this));
  this.screen_.addEventListener('copy', this.onCopy_.bind(this));
  this.screen_.addEventListener('paste', this.onPaste_.bind(this));
  this.screen_.addEventListener('mousedown', this.onMouseDown_.bind(this));

  // We send focus to this element just before a paste happens, so we can
  // capture the pasted text and forward it on to someone who cares.
  this.pasteTarget_ = doc.createElement('textarea');
  this.pasteTarget_.setAttribute('tabindex', '-1');
  this.pasteTarget_.style.cssText = (
    'position: absolute;' +
    'top: -999px;');

  doc.body.appendChild(this.pasteTarget_);

  // This is the main container for the fixed rows.
  this.rowNodes_ = doc.createElement('div');
  this.rowNodes_.style.cssText = (
      'display: block;' +
      'position: fixed;' +
      'overflow: hidden;' +
      '-webkit-user-select: text;');
  this.screen_.appendChild(this.rowNodes_);

  // Two nodes to hold offscreen text during the copy event.
  this.topSelectBag_ = doc.createElement('x-select-bag');
  this.topSelectBag_.style.cssText = (
      'display: block;' +
      'overflow: hidden;' +
      'white-space: pre;');

  this.bottomSelectBag_ = this.topSelectBag_.cloneNode();

  // Nodes above the top fold and below the bottom fold are hidden.  They are
  // only used to hold rows that are part of the selection but are currently
  // scrolled off the top or bottom of the visible range.
  this.topFold_ = doc.createElement('x-fold');
  this.topFold_.style.cssText = 'display: block;';
  this.rowNodes_.appendChild(this.topFold_);

  this.bottomFold_ = this.topFold_.cloneNode();
  this.rowNodes_.appendChild(this.bottomFold_);

  // This hidden div accounts for the vertical space that would be consumed by
  // all the rows in the buffer if they were visible.  It's what causes the
  // scrollbar to appear on the 'x-screen', and it moves within the screen when
  // the scrollbar is moved.
  //
  // It is set 'visibility: hidden' to keep the browser from trying to include
  // it in the selection when a user 'drag selects' upwards (drag the mouse to
  // select and scroll at the same time).  Without this, the selection gets
  // out of whack.
  this.scrollArea_ = doc.createElement('div');
  this.scrollArea_.style.cssText = 'visibility: hidden';
  this.screen_.appendChild(this.scrollArea_);

  this.setSelectionEnabled(true);
  this.resize();
};

/**
 * Enable or disable mouse based text selection in the scrollport.
 */
hterm.ScrollPort.prototype.setSelectionEnabled = function(state) {
  this.selectionEnabled_ = state;
};

/**
 * Select the font-family and font-smoothing for this scrollport.
 *
 * @param {string} fontFamily Value of the CSS 'font-family' to use for this
 *     scrollport.  Should be a monospace font.
 * @param {string} opt_smoothing Optional value for '-webkit-font-smoothing'.
 *     Defaults to an empty string if not specified.
 */
hterm.ScrollPort.prototype.setFontFamily = function(fontFamily, opt_smoothing) {
  this.screen_.style.fontFamily = fontFamily;
  if (opt_smoothing) {
    this.screen_.style.webkitFontSmoothing = opt_smoothing;
  } else {
    this.screen_.style.webkitFontSmoothing = '';
  }

  this.syncCharacterSize();
};

hterm.ScrollPort.prototype.getFontFamily = function() {
  return this.screen_.style.fontFamily;
};

hterm.ScrollPort.prototype.focus = function() {
  this.iframe_.focus();
  this.screen_.focus();
};

hterm.ScrollPort.prototype.getForegroundColor = function() {
  return this.screen_.style.color;
};

hterm.ScrollPort.prototype.setForegroundColor = function(color) {
  this.screen_.style.color = color;
};

hterm.ScrollPort.prototype.getBackgroundColor = function() {
  return this.screen_.style.backgroundColor;
};

hterm.ScrollPort.prototype.setBackgroundColor = function(color) {
  this.screen_.style.backgroundColor = color;
};

hterm.ScrollPort.prototype.setBackgroundImage = function(image) {
  this.screen_.style.backgroundImage = image;
};

hterm.ScrollPort.prototype.setBackgroundSize = function(size) {
  this.screen_.style.backgroundSize = size;
};

hterm.ScrollPort.prototype.setBackgroundPosition = function(position) {
  this.screen_.style.backgroundPosition = position;
};

/**
 * Get the usable size of the scrollport screen.
 *
 * The width will not include the scrollbar width.
 */
hterm.ScrollPort.prototype.getScreenSize = function() {
  var size = hterm.getClientSize(this.screen_);
  return {
    height: size.height,
    width: size.width - this.currentScrollbarWidthPx
  };
};

/**
 * Get the usable width of the scrollport screen.
 *
 * This the widget width minus scrollbar width.
 */
hterm.ScrollPort.prototype.getScreenWidth = function() {
  return this.getScreenSize().width ;
};

/**
 * Get the usable height of the scrollport screen.
 */
hterm.ScrollPort.prototype.getScreenHeight = function() {
  return this.getScreenSize().height;
};

/**
 * Return the document that holds the visible rows of this hterm.ScrollPort.
 */
hterm.ScrollPort.prototype.getDocument = function() {
  return this.document_;
};

/**
 * Clear out any cached rowNodes.
 */
hterm.ScrollPort.prototype.resetCache = function() {
  this.currentRowNodeCache_ = null;
  this.previousRowNodeCache_ = {};
};

/**
 * Change the current rowProvider.
 *
 * This will clear the row cache and cause a redraw.
 *
 * @param {Object} rowProvider An object capable of providing the rows
 *     in this hterm.ScrollPort.
 */
hterm.ScrollPort.prototype.setRowProvider = function(rowProvider) {
  this.resetCache();
  this.rowProvider_ = rowProvider;
  this.scheduleRedraw();
};

/**
 * Inform the ScrollPort that the root DOM nodes for some or all of the visible
 * rows are no longer valid.
 *
 * Specifically, this should be called if this.rowProvider_.getRowNode() now
 * returns an entirely different node than it did before.  It does not
 * need to be called if the content of a row node is the only thing that
 * changed.
 *
 * This skips some of the overhead of a full redraw, but should not be used
 * in cases where the scrollport has been scrolled, or when the row count has
 * changed.
 */
hterm.ScrollPort.prototype.invalidate = function() {
  var node = this.topFold_.nextSibling;
  while (node != this.bottomFold_) {
    var nextSibling = node.nextSibling;
    node.parentElement.removeChild(node);
    node = nextSibling;
  }

  this.previousRowNodeCache_ = null;
  var topRowIndex = this.getTopRowIndex();
  var bottomRowIndex = this.getBottomRowIndex(topRowIndex);

  this.drawVisibleRows_(topRowIndex, bottomRowIndex);
};

hterm.ScrollPort.prototype.scheduleInvalidate = function() {
  if (this.timeouts_.invalidate)
    return;

  var self = this;
  this.timeouts_.invalidate = setTimeout(function () {
      delete self.timeouts_.invalidate;
      self.invalidate();
    }, 0);
};

/**
 * Set the font size of the ScrollPort.
 */
hterm.ScrollPort.prototype.setFontSize = function(px) {
  this.screen_.style.fontSize = px + 'px';
  this.syncCharacterSize();
};

/**
 * Return the current font size of the ScrollPort.
 */
hterm.ScrollPort.prototype.getFontSize = function() {
  return parseInt(this.screen_.style.fontSize);
};

/**
 * Measure the size of a single character in pixels.
 *
 * @param {string} opt_weight The font weight to measure, or 'normal' if
 *     omitted.
 * @return {hterm.Size} A new hterm.Size object.
 */
hterm.ScrollPort.prototype.measureCharacterSize = function(opt_weight) {
  if (!this.ruler_) {
    this.ruler_ = this.document_.createElement('div');
    this.ruler_.style.cssText = (
        'position: absolute;' +
        'top: 0;' +
        'left: 0;' +
        'visibility: hidden;' +
        'height: auto !important;' +
        'width: auto !important;');

    this.ruler_.textContent = ('XXXXXXXXXXXXXXXXXXXX' +
                               'XXXXXXXXXXXXXXXXXXXX' +
                               'XXXXXXXXXXXXXXXXXXXX' +
                               'XXXXXXXXXXXXXXXXXXXX' +
                               'XXXXXXXXXXXXXXXXXXXX');
  }

  this.ruler_.style.fontWeight = opt_weight || '';

  this.rowNodes_.appendChild(this.ruler_);
  var adjustedSize = hterm.getClientSize(this.ruler_);

  this.ruler_.style.webkitTextSizeAdjust = 'none';
  var unadjustedSize = hterm.getClientSize(this.ruler_);

  var zoomFactor = adjustedSize.width / unadjustedSize.width;

  this.ruler_.style.webkitTextSizeAdjust = '';

  // In some fonts, underscores actually show up below the reported height.
  // We add one to the height here to compensate, and have to add a bottom
  // border to text with a background color over in text_attributes.js.
  var size = new hterm.Size(adjustedSize.width / this.ruler_.textContent.length,
                            adjustedSize.height + 1);
  size.zoomFactor = zoomFactor;

  this.rowNodes_.removeChild(this.ruler_);
  return size;
};

/**
 * Synchronize the character size.
 *
 * This will re-measure the current character size and adjust the height
 * of an x-row to match.
 */
hterm.ScrollPort.prototype.syncCharacterSize = function() {
  this.characterSize = this.measureCharacterSize();

  var lineHeight = this.characterSize.height + 'px';
  this.xrowCssRule_.style.height = lineHeight;
  this.topSelectBag_.style.height = lineHeight;
  this.bottomSelectBag_.style.height = lineHeight;

  this.resize();

  if (this.DEBUG_) {
    // When we're debugging we add padding to the body so that the offscreen
    // elements are visible.
    this.document_.body.style.paddingTop =
        this.document_.body.style.paddingBottom =
        3 * this.characterSize.height + 'px';
  }
};

/**
 * Reset dimensions and visible row count to account for a change in the
 * dimensions of the 'x-screen'.
 */
hterm.ScrollPort.prototype.resize = function() {
  this.currentScrollbarWidthPx = hterm.getClientWidth(this.screen_) -
    this.screen_.clientWidth;

  this.syncScrollHeight();
  this.syncRowNodesDimensions_();

  var self = this;
  this.publish(
      'resize', { scrollPort: this },
      function() {
        self.scrollRowToBottom(self.rowProvider_.getRowCount());
        self.scheduleRedraw();
      });
};

/**
 * Set the position and size of the row nodes element.
 */
hterm.ScrollPort.prototype.syncRowNodesDimensions_ = function() {
  var screenSize = this.getScreenSize();

  this.lastScreenWidth_ = screenSize.width;
  this.lastScreenHeight_ = screenSize.height;

  // We don't want to show a partial row because it would be distracting
  // in a terminal, so we floor any fractional row count.
  this.visibleRowCount = Math.floor(
      screenSize.height / this.characterSize.height);

  // Then compute the height of our integral number of rows.
  var visibleRowsHeight = this.visibleRowCount * this.characterSize.height;

  // Then the difference between the screen height and total row height needs to
  // be made up for as top margin.  We need to record this value so it
  // can be used later to determine the topRowIndex.
  this.visibleRowTopMargin = 0;
  this.visibleRowBottomMargin = screenSize.height - visibleRowsHeight;

  this.topFold_.style.marginBottom = this.visibleRowTopMargin + 'px';


  var topFoldOffset = 0;
  var node = this.topFold_.previousSibling;
  while (node) {
    topFoldOffset += hterm.getClientHeight(node);
    node = node.previousSibling;
  }

  // Set the dimensions of the visible rows container.
  this.rowNodes_.style.width = screenSize.width + 'px';
  this.rowNodes_.style.height = visibleRowsHeight + topFoldOffset + 'px';
  this.rowNodes_.style.left = this.screen_.offsetLeft + 'px';
  this.rowNodes_.style.top = this.screen_.offsetTop - topFoldOffset + 'px';
};

hterm.ScrollPort.prototype.syncScrollHeight = function() {
  // Resize the scroll area to appear as though it contains every row.
  this.lastRowCount_ = this.rowProvider_.getRowCount();
  this.scrollArea_.style.height = (this.characterSize.height *
                                   this.lastRowCount_ +
                                   this.visibleRowTopMargin +
                                   this.visibleRowBottomMargin +
                                   'px');
};

/**
 * Schedule a redraw to happen asynchronously.
 *
 * If this method is called multiple times before the redraw has a chance to
 * run only one redraw occurs.
 */
hterm.ScrollPort.prototype.scheduleRedraw = function() {
  if (this.timeouts_.redraw)
    return;

  var self = this;
  this.timeouts_.redraw = setTimeout(function () {
      delete self.timeouts_.redraw;
      self.redraw_();
    }, 0);
};

/**
 * Redraw the current hterm.ScrollPort based on the current scrollbar position.
 *
 * When redrawing, we are careful to make sure that the rows that start or end
 * the current selection are not touched in any way.  Doing so would disturb
 * the selection, and cleaning up after that would cause flashes at best and
 * incorrect selection at worst.  Instead, we modify the DOM around these nodes.
 * We even stash the selection start/end outside of the visible area if
 * they are not supposed to be visible in the hterm.ScrollPort.
 */
hterm.ScrollPort.prototype.redraw_ = function() {
  this.resetSelectBags_();
  this.selection.sync();

  this.syncScrollHeight();

  this.currentRowNodeCache_ = {};

  var topRowIndex = this.getTopRowIndex();
  var bottomRowIndex = this.getBottomRowIndex(topRowIndex);

  this.drawTopFold_(topRowIndex);
  this.drawBottomFold_(bottomRowIndex);
  this.drawVisibleRows_(topRowIndex, bottomRowIndex);

  this.syncRowNodesDimensions_();

  this.previousRowNodeCache_ = this.currentRowNodeCache_;
  this.currentRowNodeCache_ = null;

  this.isScrolledEnd = (
    this.getTopRowIndex() + this.visibleRowCount >= this.lastRowCount_);
};

/**
 * Ensure that the nodes above the top fold are as they should be.
 *
 * If the selection start and/or end nodes are above the visible range
 * of this hterm.ScrollPort then the dom will be adjusted so that they appear
 * before the top fold (the first x-fold element, aka this.topFold).
 *
 * If not, the top fold will be the first element.
 *
 * It is critical that this method does not move the selection nodes.  Doing
 * so would clear the current selection.  Instead, the rest of the DOM is
 * adjusted around them.
 */
hterm.ScrollPort.prototype.drawTopFold_ = function(topRowIndex) {
  if (!this.selection.startRow ||
      this.selection.startRow.rowIndex >= topRowIndex) {
    // Selection is entirely below the top fold, just make sure the fold is
    // the first child.
    if (this.rowNodes_.firstChild != this.topFold_)
      this.rowNodes_.insertBefore(this.topFold_, this.rowNodes_.firstChild);

    return;
  }

  if (!this.selection.isMultiline ||
      this.selection.endRow.rowIndex >= topRowIndex) {
    // Only the startRow is above the fold.
    if (this.selection.startRow.nextSibling != this.topFold_)
      this.rowNodes_.insertBefore(this.topFold_,
                                  this.selection.startRow.nextSibling);
  } else {
    // Both rows are above the fold.
    if (this.selection.endRow.nextSibling != this.topFold_) {
      this.rowNodes_.insertBefore(this.topFold_,
                                  this.selection.endRow.nextSibling);
    }

    // Trim any intermediate lines.
    while (this.selection.startRow.nextSibling !=
           this.selection.endRow) {
      this.rowNodes_.removeChild(this.selection.startRow.nextSibling);
    }
  }

  while(this.rowNodes_.firstChild != this.selection.startRow) {
    this.rowNodes_.removeChild(this.rowNodes_.firstChild);
  }
};

/**
 * Ensure that the nodes below the bottom fold are as they should be.
 *
 * If the selection start and/or end nodes are below the visible range
 * of this hterm.ScrollPort then the dom will be adjusted so that they appear
 * after the bottom fold (the second x-fold element, aka this.bottomFold).
 *
 * If not, the bottom fold will be the last element.
 *
 * It is critical that this method does not move the selection nodes.  Doing
 * so would clear the current selection.  Instead, the rest of the DOM is
 * adjusted around them.
 */
hterm.ScrollPort.prototype.drawBottomFold_ = function(bottomRowIndex) {
  if (!this.selection.endRow ||
      this.selection.endRow.rowIndex <= bottomRowIndex) {
    // Selection is entirely above the bottom fold, just make sure the fold is
    // the last child.
    if (this.rowNodes_.lastChild != this.bottomFold_)
      this.rowNodes_.appendChild(this.bottomFold_);

    return;
  }

  if (!this.selection.isMultiline ||
      this.selection.startRow.rowIndex <= bottomRowIndex) {
    // Only the endRow is below the fold.
    if (this.bottomFold_.nextSibling != this.selection.endRow)
      this.rowNodes_.insertBefore(this.bottomFold_,
                                  this.selection.endRow);
  } else {
    // Both rows are below the fold.
    if (this.bottomFold_.nextSibling != this.selection.startRow) {
      this.rowNodes_.insertBefore(this.bottomFold_,
                                  this.selection.startRow);
    }

    // Trim any intermediate lines.
    while (this.selection.startRow.nextSibling !=
           this.selection.endRow) {
      this.rowNodes_.removeChild(this.selection.startRow.nextSibling);
    }
  }

  while(this.rowNodes_.lastChild != this.selection.endRow) {
    this.rowNodes_.removeChild(this.rowNodes_.lastChild);
  }
};

/**
 * Ensure that the rows between the top and bottom folds are as they should be.
 *
 * This method assumes that drawTopFold_() and drawBottomFold_() have already
 * run, and that they have left any visible selection row (selection start
 * or selection end) between the folds.
 *
 * It recycles DOM nodes from the previous redraw where possible, but will ask
 * the rowSource to make new nodes if necessary.
 *
 * It is critical that this method does not move the selection nodes.  Doing
 * so would clear the current selection.  Instead, the rest of the DOM is
 * adjusted around them.
 */
hterm.ScrollPort.prototype.drawVisibleRows_ = function(
    topRowIndex, bottomRowIndex) {
  var self = this;

  // Keep removing nodes, starting with currentNode, until we encounter
  // targetNode.  Throws on failure.
  function removeUntilNode(currentNode, targetNode) {
    while (currentNode != targetNode) {
      if (!currentNode)
        throw 'Did not encounter target node';

      if (currentNode == self.bottomFold_)
        throw 'Encountered bottom fold before target node';

      var deadNode = currentNode;
      currentNode = currentNode.nextSibling;
      deadNode.parentNode.removeChild(deadNode);
    }
  }

  // Shorthand for things we're going to use a lot.
  var selectionStartRow = this.selection.startRow;
  var selectionEndRow = this.selection.endRow;
  var bottomFold = this.bottomFold_;

  // The node we're examining during the current iteration.
  var node = this.topFold_.nextSibling;

  var targetDrawCount = Math.min(this.visibleRowCount,
                                 this.rowProvider_.getRowCount());

  for (var drawCount = 0; drawCount < targetDrawCount; drawCount++) {
    var rowIndex = topRowIndex + drawCount;

    if (node == bottomFold) {
      // We've hit the bottom fold, we need to insert a new row.
      var newNode = this.fetchRowNode_(rowIndex);
      if (!newNode) {
        console.log("Couldn't fetch row index: " + rowIndex);
        break;
      }

      this.rowNodes_.insertBefore(newNode, node);
      continue;
    }

    if (node.rowIndex == rowIndex) {
      // This node is in the right place, move along.
      node = node.nextSibling;
      continue;
    }

    if (selectionStartRow && selectionStartRow.rowIndex == rowIndex) {
      // The selection start row is supposed to be here, remove nodes until
      // we find it.
      removeUntilNode(node, selectionStartRow);
      node = selectionStartRow.nextSibling;
      continue;
    }

    if (selectionEndRow && selectionEndRow.rowIndex == rowIndex) {
      // The selection end row is supposed to be here, remove nodes until
      // we find it.
      removeUntilNode(node, selectionEndRow);
      node = selectionEndRow.nextSibling;
      continue;
    }

    if (node == selectionStartRow || node == selectionEndRow) {
      // We encountered the start/end of the selection, but we don't want it
      // yet.  Insert a new row instead.
      var newNode = this.fetchRowNode_(rowIndex);
      if (!newNode) {
        console.log("Couldn't fetch row index: " + rowIndex);
        break;
      }

      this.rowNodes_.insertBefore(newNode, node);
      continue;
    }

    // There is nothing special about this node, but it's in our way.  Replace
    // it with the node that should be here.
    var newNode = this.fetchRowNode_(rowIndex);
    if (!newNode) {
      console.log("Couldn't fetch row index: " + rowIndex);
      break;
    }

    if (node == newNode) {
      node = node.nextSibling;
      continue;
    }

    this.rowNodes_.insertBefore(newNode, node);
    if (!newNode.nextSibling)
      debugger;
    this.rowNodes_.removeChild(node);
    node = newNode.nextSibling;
  }

  if (node != this.bottomFold_)
    removeUntilNode(node, bottomFold);
};

/**
 * Empty out both select bags and remove them from the document.
 *
 * These nodes hold the text between the start and end of the selection
 * when that text is otherwise off screen.  They are filled out in the
 * onCopy_ event.
 */
hterm.ScrollPort.prototype.resetSelectBags_ = function() {
  if (this.topSelectBag_.parentNode) {
    this.topSelectBag_.textContent = '';
    this.topSelectBag_.parentNode.removeChild(this.topSelectBag_);
  }

  if (this.bottomSelectBag_.parentNode) {
    this.bottomSelectBag_.textContent = '';
    this.bottomSelectBag_.parentNode.removeChild(this.bottomSelectBag_);
  }
};

/**
 * Place a row node in the cache of visible nodes.
 *
 * This method may only be used during a redraw_.
 */
hterm.ScrollPort.prototype.cacheRowNode_ = function(rowNode) {
  this.currentRowNodeCache_[rowNode.rowIndex] = rowNode;
};

/**
 * Fetch the row node for the given index.
 *
 * This will return a node from the cache if possible, or will request one
 * from the RowProvider if not.
 *
 * If a redraw_ is in progress the row will be added to the current cache.
 */
hterm.ScrollPort.prototype.fetchRowNode_ = function(rowIndex) {
  var node;

  if (this.previousRowNodeCache_ && rowIndex in this.previousRowNodeCache_) {
    node = this.previousRowNodeCache_[rowIndex];
  } else {
    node = this.rowProvider_.getRowNode(rowIndex);
  }

  if (this.currentRowNodeCache_)
    this.cacheRowNode_(node);

  return node;
};

/**
 * Select all rows in the viewport.
 */
hterm.ScrollPort.prototype.selectAll = function() {
  var firstRow;

  if (this.topFold_.nextSibling.rowIndex != 0) {
    while (this.topFold_.previousSibling) {
      this.rowNodes_.removeChild(this.topFold_.previousSibling);
    }

    firstRow = this.fetchRowNode_(0);
    this.rowNodes_.insertBefore(firstRow, this.topFold_);
    this.syncRowNodesDimensions_();
  } else {
    firstRow = this.topFold_.nextSibling;
  }

  var lastRowIndex = this.rowProvider_.getRowCount() - 1;
  var lastRow;

  if (this.bottomFold_.previousSibling.rowIndex != lastRowIndex) {
    while (this.bottomFold_.nextSibling) {
      this.rowNodes_.removeChild(this.bottomFold_.nextSibling);
    }

    lastRow = this.fetchRowNode_(lastRowIndex);
    this.rowNodes_.appendChild(lastRow);
  } else {
    lastRow = this.bottomFold_.previousSibling.rowIndex;
  }

  var selection = this.document_.getSelection();
  selection.collapse(firstRow, 0);
  selection.extend(lastRow, lastRow.childNodes.length);

  this.selection.sync();
};

/**
 * Return the maximum scroll position in pixels.
 */
hterm.ScrollPort.prototype.getScrollMax_ = function(e) {
  return (hterm.getClientHeight(this.scrollArea_) +
          this.visibleRowTopMargin + this.visibleRowBottomMargin -
          hterm.getClientHeight(this.screen_));
};

/**
 * Scroll the given rowIndex to the top of the hterm.ScrollPort.
 *
 * @param {integer} rowIndex Index of the target row.
 */
hterm.ScrollPort.prototype.scrollRowToTop = function(rowIndex) {
  this.syncScrollHeight();

  this.isScrolledEnd = (
    rowIndex + this.visibleRowCount >= this.lastRowCount_);

  var scrollTop = rowIndex * this.characterSize.height +
      this.visibleRowTopMargin;

  var scrollMax = this.getScrollMax_();
  if (scrollTop > scrollMax)
    scrollTop = scrollMax;

  if (this.screen_.scrollTop == scrollTop)
    return;

  this.screen_.scrollTop = scrollTop;
  this.scheduleRedraw();
};

/**
 * Scroll the given rowIndex to the bottom of the hterm.ScrollPort.
 *
 * @param {integer} rowIndex Index of the target row.
 */
hterm.ScrollPort.prototype.scrollRowToBottom = function(rowIndex) {
  this.syncScrollHeight();

  this.isScrolledEnd = (
    rowIndex + this.visibleRowCount >= this.lastRowCount_);

  var scrollTop = rowIndex * this.characterSize.height +
      this.visibleRowTopMargin + this.visibleRowBottomMargin;
  scrollTop -= this.visibleRowCount * this.characterSize.height;

  if (scrollTop < 0)
    scrollTop = 0;

  if (this.screen_.scrollTop == scrollTop)
    return;

  this.screen_.scrollTop = scrollTop;
};

/**
 * Return the row index of the first visible row.
 *
 * This is based on the scroll position.  If a redraw_ is in progress this
 * returns the row that *should* be at the top.
 */
hterm.ScrollPort.prototype.getTopRowIndex = function() {
  return Math.floor(this.screen_.scrollTop / this.characterSize.height);
};

/**
 * Return the row index of the last visible row.
 *
 * This is based on the scroll position.  If a redraw_ is in progress this
 * returns the row that *should* be at the bottom.
 */
hterm.ScrollPort.prototype.getBottomRowIndex = function(topRowIndex) {
  return topRowIndex + this.visibleRowCount - 1;
};

/**
 * Handler for scroll events.
 *
 * The onScroll event fires when scrollArea's scrollTop property changes.  This
 * may be due to the user manually move the scrollbar, or a programmatic change.
 */
hterm.ScrollPort.prototype.onScroll_ = function(e) {
  var screenSize = this.getScreenSize();
  if (screenSize.width != this.lastScreenWidth_ ||
      screenSize.height != this.lastScreenHeight_) {
    // This event may also fire during a resize (but before the resize event!).
    // This happens when the browser moves the scrollbar as part of the resize.
    // In these cases, we want to ignore the scroll event and let onResize
    // handle things.  If we don't, then we end up scrolling to the wrong
    // position after a resize.
    this.resize();
    return;
  }

  this.redraw_();
  this.publish('scroll', { scrollPort: this });
};

/**
 * Clients can override this if they want to hear scrollwheel events.
 *
 * Clients may call event.preventDefault() if they want to keep the scrollport
 * from also handling the events.
 */
hterm.ScrollPort.prototype.onScrollWheel = function(e) {};

/**
 * Handler for scroll-wheel events.
 *
 * The onScrollWheel event fires when the user moves their scrollwheel over this
 * hterm.ScrollPort.  Because the frontmost element in the hterm.ScrollPort is
 * a fixed position DIV, the scroll wheel does nothing by default.  Instead, we
 * have to handle it manually.
 */
hterm.ScrollPort.prototype.onScrollWheel_ = function(e) {
  this.onScrollWheel(e);

  if (e.defaultPrevented)
    return;

  var top = this.screen_.scrollTop - e.wheelDeltaY;
  if (top < 0)
    top = 0;

  var scrollMax = this.getScrollMax_();
  if (top > scrollMax)
    top = scrollMax;

  if (top != this.screen_.scrollTop) {
    // Moving scrollTop causes a scroll event, which triggers the redraw.
    this.screen_.scrollTop = top;

    // Only preventDefault when we've actually scrolled.  If there's nothing
    // to scroll we want to pass the event through so Chrome can detect the
    // overscroll.
    e.preventDefault();
  }
};

/**
 * Handler for resize events.
 *
 * The browser will resize us such that the top row stays at the top, but we
 * prefer to the bottom row to stay at the bottom.
 */
hterm.ScrollPort.prototype.onResize_ = function(e) {
  // Re-measure, since onResize also happens for browser zoom changes.
  this.syncCharacterSize();
  this.resize();
};

/**
 * Clients can override this if they want to hear copy events.
 *
 * Clients may call event.preventDefault() if they want to keep the scrollport
 * from also handling the events.
 */
hterm.ScrollPort.prototype.onCopy = function(e) { };

/**
 * Handler for copy-to-clipboard events.
 *
 * If some or all of the selected rows are off screen we may need to fill in
 * the rows between selection start and selection end.  This handler determines
 * if we're missing some of the selected text, and if so populates one or both
 * of the "select bags" with the missing text.
 */
hterm.ScrollPort.prototype.onCopy_ = function(e) {
  this.onCopy(e);

  if (e.defaultPrevented)
    return;

  this.resetSelectBags_();
  this.selection.sync();

  if (!this.selection.startRow ||
      this.selection.endRow.rowIndex - this.selection.startRow.rowIndex < 2) {
    return;
  }

  var topRowIndex = this.getTopRowIndex();
  var bottomRowIndex = this.getBottomRowIndex(topRowIndex);

  if (this.selection.startRow.rowIndex < topRowIndex) {
    // Start of selection is above the top fold.
    var endBackfillIndex;

    if (this.selection.endRow.rowIndex < topRowIndex) {
      // Entire selection is above the top fold.
      endBackfillIndex = this.selection.endRow.rowIndex;
    } else {
      // Selection extends below the top fold.
      endBackfillIndex = this.topFold_.nextSibling.rowIndex;
    }

    this.topSelectBag_.textContent = this.rowProvider_.getRowsText(
        this.selection.startRow.rowIndex + 1, endBackfillIndex);
    this.rowNodes_.insertBefore(this.topSelectBag_,
                                this.selection.startRow.nextSibling);
    this.syncRowNodesDimensions_();
  }

  if (this.selection.endRow.rowIndex > bottomRowIndex) {
    // Selection ends below the bottom fold.
    var startBackfillIndex;

    if (this.selection.startRow.rowIndex > bottomRowIndex) {
      // Entire selection is below the bottom fold.
      startBackfillIndex = this.selection.startRow.rowIndex + 1;
    } else {
      // Selection starts above the bottom fold.
      startBackfillIndex = this.bottomFold_.previousSibling.rowIndex + 1;
    }

    this.bottomSelectBag_.textContent = this.rowProvider_.getRowsText(
        startBackfillIndex, this.selection.endRow.rowIndex);
    this.rowNodes_.insertBefore(this.bottomSelectBag_, this.selection.endRow);
  }
};

/**
 * Handle a paste event on the the ScrollPort's screen element.
 */
hterm.ScrollPort.prototype.onPaste_ = function(e) {
  this.pasteTarget_.focus();

  var self = this;
  setTimeout(function() {
      self.publish('paste', { text: self.pasteTarget_.value });
      self.pasteTarget_.value = '';
      self.screen_.focus();
    }, 0);
};

/**
 * Handle mouse down events on the ScrollPort's screen element.
 */
hterm.ScrollPort.prototype.onMouseDown_ = function(e) {
  if (e.which == 1 && !this.selectionEnabled_) {
    e.preventDefault();
  }
};

/**
 * Set the vertical scrollbar mode of the ScrollPort.
 */
hterm.ScrollPort.prototype.setScrollbarVisible = function(state) {
  this.screen_.style.overflowY = state ? 'scroll' : 'hidden';
};
