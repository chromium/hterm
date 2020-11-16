// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * The RowProvider should return rows rooted by the custom tag name 'x-row'.
 * This ensures that we can quickly assign the correct display height
 * to the rows with css.
 *
 * @interface
 */
hterm.RowProvider = function() {};

/**
 * @abstract
 * @return {number} The current number of rows.
 */
hterm.RowProvider.prototype.getRowCount = function() {};

/**
 * Get specified row.
 *
 * @abstract
 * @param {number} index The index of the row.
 * @return {!Element}
 */
hterm.RowProvider.prototype.getRowNode = function(index) {};

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
 * @param {!hterm.RowProvider} rowProvider An object capable of providing rows
 *     as raw text or row nodes.
 * @constructor
 * @extends {hterm.PubSub}
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

  // The scroll wheel pixel delta multiplier to increase/decrease
  // the scroll speed of mouse wheel events. See: https://goo.gl/sXelnq
  this.scrollWheelMultiplier_ = 1;

  // The last touch events we saw to support touch based scrolling.  Indexed
  // by touch identifier since we can have more than one touch active.
  this.lastTouch_ = {};

  /**
   * Size of screen padding in pixels.
   */
  this.screenPaddingSize = 0;

  /**
   * True if the last scroll caused the scrollport to show the final row.
   */
  this.isScrolledEnd = true;

  /**
   * A guess at the current scrollbar width, fixed in resize().
   */
  this.currentScrollbarWidthPx = hterm.ScrollPort.DEFAULT_SCROLLBAR_WIDTH;

  /**
   * Whether the ctrl-v key on the screen should paste.
   */
  this.ctrlVPaste = false;

  /**
   * Whether to paste on dropped text.
   */
  this.pasteOnDrop = true;

  this.div_ = null;
  this.document_ = null;
  /** @type {?Element} */
  this.screen_ = null;

  // Collection of active timeout handles.
  this.timeouts_ = {};

  this.observers_ = {};

  // Offscreen selection rows that are set with 'aria-hidden'.
  // They must be unset when selection changes or the rows are visible.
  this.ariaHiddenSelectionRows_ = [];

  this.DEBUG_ = false;
};

/**
 * Default width for scrollbar used when the system such as CrOS pretends that
 * scrollbar is zero width.  CrOS currently uses 11px when expanded.
 *
 * @const {number}
 */
hterm.ScrollPort.DEFAULT_SCROLLBAR_WIDTH = 12;

/**
 * Proxy for the native selection object which understands how to walk up the
 * DOM to find the containing row node and sort out which comes first.
 *
 * @param {!hterm.ScrollPort} scrollPort The parent hterm.ScrollPort instance.
 * @constructor
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
 * @param {!Node} parent
 * @param {!Array<!Node>} childAry
 * @return {?Node} Returns null if none of the children are found.
 */
hterm.ScrollPort.Selection.prototype.findFirstChild = function(
    parent, childAry) {
  let node = parent.firstChild;

  while (node) {
    if (childAry.indexOf(node) != -1) {
      return node;
    }

    if (node.childNodes.length) {
      const rv = this.findFirstChild(node, childAry);
      if (rv) {
        return rv;
      }
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
  // The dom selection object has no way to tell which nodes come first in
  // the document, so we have to figure that out.
  //
  // This function is used when we detect that the "anchor" node is first.
  const anchorFirst = () => {
    this.startRow = anchorRow;
    this.startNode = selection.anchorNode;
    this.startOffset = selection.anchorOffset;
    this.endRow = focusRow;
    this.endNode = selection.focusNode;
    this.endOffset = selection.focusOffset;
  };

  // This function is used when we detect that the "focus" node is first.
  const focusFirst = () => {
    this.startRow = focusRow;
    this.startNode = selection.focusNode;
    this.startOffset = selection.focusOffset;
    this.endRow = anchorRow;
    this.endNode = selection.anchorNode;
    this.endOffset = selection.anchorOffset;
  };

  const selection = this.scrollPort_.getDocument().getSelection();

  this.startRow = null;
  this.endRow = null;
  this.isMultiline = null;
  this.isCollapsed = !selection || selection.isCollapsed;

  if (!selection) {
    return;
  }

  // Usually collapsed selections wouldn't be interesting, however screen
  // readers will set a collapsed selection as they navigate through the DOM.
  // It is important to preserve these nodes in the DOM as scrolling happens
  // so that screen reader navigation isn't cleared.
  const accessibilityEnabled = this.scrollPort_.accessibilityReader_ &&
      this.scrollPort_.accessibilityReader_.accessibilityEnabled;
  if (this.isCollapsed && !accessibilityEnabled) {
    return;
  }

  let anchorRow = selection.anchorNode;
  while (anchorRow && anchorRow.nodeName != 'X-ROW') {
    anchorRow = anchorRow.parentNode;
  }

  if (!anchorRow) {
    // Don't set a selection if it's not a row node that's selected.
    return;
  }

  let focusRow = selection.focusNode;
  while (focusRow && focusRow.nodeName != 'X-ROW') {
    focusRow = focusRow.parentNode;
  }

  if (!focusRow) {
    // Don't set a selection if it's not a row node that's selected.
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
    const firstNode = this.findFirstChild(
        anchorRow, [selection.anchorNode, selection.focusNode]);

    if (!firstNode) {
      throw new Error('Unexpected error syncing selection.');
    }

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
 *
 * @param {!Element} div
 * @param {function()=} callback
 */
hterm.ScrollPort.prototype.decorate = function(div, callback) {
  this.div_ = div;

  this.iframe_ = div.ownerDocument.createElement('iframe');
  this.iframe_.style.cssText = (
      'border: 0;' +
      'height: 100%;' +
      'position: absolute;' +
      'width: 100%');

  div.appendChild(this.iframe_);

  const onLoad = () => {
    this.paintIframeContents_();
    if (callback) {
      callback();
    }
  };

  // Insert Iframe content asynchronously in FF.  Otherwise when the frame's
  // load event fires in FF it clears out the content of the iframe.
  if ('mozInnerScreenX' in window) { // detect a FF only property
    this.iframe_.addEventListener('load', () => onLoad());
  } else {
    onLoad();
  }
};


/**
 * Initialises the content of this.iframe_. This needs to be done asynchronously
 * in FF after the Iframe's load event has fired.
 *
 * @private
 */
hterm.ScrollPort.prototype.paintIframeContents_ = function() {
  this.iframe_.contentWindow.addEventListener('resize',
                                              this.onResize_.bind(this));

  const doc = this.document_ = this.iframe_.contentDocument;
  doc.body.style.cssText = (
      'margin: 0px;' +
      'padding: 0px;' +
      'height: 100%;' +
      'width: 100%;' +
      'overflow: hidden;' +
      'cursor: var(--hterm-mouse-cursor-style);' +
      'user-select: none;');

  const metaCharset = doc.createElement('meta');
  metaCharset.setAttribute('charset', 'utf-8');
  doc.head.appendChild(metaCharset);

  if (this.DEBUG_) {
    // When we're debugging we add padding to the body so that the offscreen
    // elements are visible.
    this.document_.body.style.paddingTop =
        this.document_.body.style.paddingBottom =
        'calc(var(--hterm-charsize-height) * 3)';
  }

  const style = doc.createElement('style');
  style.textContent = (
      'x-row {' +
      '  display: block;' +
      '  height: var(--hterm-charsize-height);' +
      '  line-height: var(--hterm-charsize-height);' +
      '}');
  doc.head.appendChild(style);

  this.userCssLink_ = doc.createElement('link');
  this.userCssLink_.setAttribute('rel', 'stylesheet');

  this.userCssText_ = doc.createElement('style');
  doc.head.appendChild(this.userCssText_);

  // TODO(rginda): Sorry, this 'screen_' isn't the same thing as hterm.Screen
  // from screen.js.  I need to pick a better name for one of them to avoid
  // the collision.
  // We make this field editable even though we don't actually allow anything
  // to be edited here so that Chrome will do the right thing with virtual
  // keyboards and IMEs.  But make sure we turn off all the input helper logic
  // that doesn't make sense here, and might inadvertently mung or save input.
  // Some of these attributes are standard while others are browser specific,
  // but should be safely ignored by other browsers.
  this.screen_ = doc.createElement('x-screen');
  this.screen_.setAttribute('contenteditable', 'true');
  this.screen_.setAttribute('spellcheck', 'false');
  this.screen_.setAttribute('autocomplete', 'off');
  this.screen_.setAttribute('autocorrect', 'off');
  this.screen_.setAttribute('autocapitalize', 'none');

  // In some ways the terminal behaves like a text box but not in all ways. It
  // is not editable in the same ways a text box is editable and the content we
  // want to be read out by a screen reader does not always align with the edits
  // (selection changes) that happen in the terminal window. Use the log role so
  // that the screen reader doesn't treat it like a text box and announce all
  // selection changes. The announcements that we want spoken are generated
  // by a separate live region, which gives more control over what will be
  // spoken.
  this.screen_.setAttribute('role', 'log');
  this.screen_.setAttribute('aria-live', 'off');
  this.screen_.setAttribute('aria-roledescription', 'Terminal');

  // Set aria-readonly to indicate to the screen reader that the text on the
  // screen is not modifiable by the html cursor. It may be modifiable by
  // sending input to the application running in the terminal, but this is
  // orthogonal to the DOM's notion of modifiable.
  this.screen_.setAttribute('aria-readonly', 'true');
  this.screen_.setAttribute('tabindex', '-1');
  this.screen_.style.cssText = `
      background-color: rgb(var(--hterm-background-color));
      caret-color: transparent;
      color: rgb(var(--hterm-foreground-color));
      display: block;
      font-family: monospace;
      font-size: 15px;
      font-variant-ligatures: none;
      height: 100%;
      overflow-y: scroll; overflow-x: hidden;
      white-space: pre;
      width: 100%;
      outline: none !important;
  `;


  /**
   * @param {function(...)} f
   * @return {!EventListener}
   */
  const el = (f) => /** @type {!EventListener} */ (f);
  this.screen_.addEventListener('scroll', el(this.onScroll_.bind(this)));
  this.screen_.addEventListener('wheel', el(this.onScrollWheel_.bind(this)));
  this.screen_.addEventListener('touchstart', el(this.onTouch_.bind(this)));
  this.screen_.addEventListener('touchmove', el(this.onTouch_.bind(this)));
  this.screen_.addEventListener('touchend', el(this.onTouch_.bind(this)));
  this.screen_.addEventListener('touchcancel', el(this.onTouch_.bind(this)));
  this.screen_.addEventListener('copy', el(this.onCopy_.bind(this)));
  this.screen_.addEventListener('paste', el(this.onPaste_.bind(this)));
  this.screen_.addEventListener('drop', el(this.onDragAndDrop_.bind(this)));

  doc.body.addEventListener('keydown', this.onBodyKeyDown_.bind(this));

  // Add buttons to make accessible scrolling through terminal history work
  // well. These are positioned off-screen until they are selected, at which
  // point they are moved on-screen.
  const a11yButtonHeight = 30;
  const a11yButtonBorder = 1;
  const a11yButtonTotalHeight = a11yButtonHeight + 2 * a11yButtonBorder;
  const a11yButtonStyle = `
    border-style: solid;
    border-width: ${a11yButtonBorder}px;
    color: rgb(var(--hterm-foreground-color));
    cursor: pointer;
    font-family: monospace;
    font-weight: bold;
    height: ${a11yButtonHeight}px;
    line-height: ${a11yButtonHeight}px;
    padding: 0 8px;
    position: fixed;
    right: var(--hterm-screen-padding-size);
    text-align: center;
    z-index: 1;
  `;
  // Note: we use a <div> rather than a <button> because we don't want it to be
  // focusable. If it's focusable this interferes with the contenteditable
  // focus.
  this.scrollUpButton_ = this.document_.createElement('div');
  this.scrollUpButton_.id = 'hterm:a11y:page-up';
  this.scrollUpButton_.innerText = hterm.msg('BUTTON_PAGE_UP', [], 'Page up');
  this.scrollUpButton_.setAttribute('role', 'button');
  this.scrollUpButton_.style.cssText = a11yButtonStyle;
  this.scrollUpButton_.style.top = `${-a11yButtonTotalHeight}px`;
  this.scrollUpButton_.addEventListener('click', this.scrollPageUp.bind(this));

  this.scrollDownButton_ = this.document_.createElement('div');
  this.scrollDownButton_.id = 'hterm:a11y:page-down';
  this.scrollDownButton_.innerText =
      hterm.msg('BUTTON_PAGE_DOWN', [], 'Page down');
  this.scrollDownButton_.setAttribute('role', 'button');
  this.scrollDownButton_.style.cssText = a11yButtonStyle;
  this.scrollDownButton_.style.bottom = `${-a11yButtonTotalHeight}px`;
  this.scrollDownButton_.addEventListener(
      'click', this.scrollPageDown.bind(this));

  this.optionsButton_ = this.document_.createElement('div');
  this.optionsButton_.id = 'hterm:a11y:options';
  this.optionsButton_.innerText =
      hterm.msg('OPTIONS_BUTTON_LABEL', [], 'Options');
  this.optionsButton_.setAttribute('role', 'button');
  this.optionsButton_.style.cssText = a11yButtonStyle;
  this.optionsButton_.style.bottom = `${-2 * a11yButtonTotalHeight}px`;
  this.optionsButton_.addEventListener(
      'click', this.publish.bind(this, 'options'));

  doc.body.appendChild(this.scrollUpButton_);
  doc.body.appendChild(this.screen_);
  doc.body.appendChild(this.scrollDownButton_);
  doc.body.appendChild(this.optionsButton_);

  // We only allow the scroll buttons to display after a delay, otherwise the
  // page up button can flash onto the screen during the intial change in focus.
  // This seems to be because it is the first element inside the <x-screen>
  // element, which will get focussed on page load.
  this.allowA11yButtonsToDisplay_ = false;
  setTimeout(() => { this.allowA11yButtonsToDisplay_ = true; }, 500);
  this.document_.addEventListener('selectionchange', () => {
    this.selection.sync();

    if (!this.allowA11yButtonsToDisplay_) {
      return;
    }

    const accessibilityEnabled = this.accessibilityReader_ &&
        this.accessibilityReader_.accessibilityEnabled;

    const selection = this.document_.getSelection();
    let selectedElement;
    if (selection.anchorNode && selection.anchorNode.parentElement) {
      selectedElement = selection.anchorNode.parentElement;
    }
    if (accessibilityEnabled && selectedElement == this.scrollUpButton_) {
      this.scrollUpButton_.style.top = `${this.screenPaddingSize}px`;
    } else {
      this.scrollUpButton_.style.top = `${-a11yButtonTotalHeight}px`;
    }
    if (accessibilityEnabled && selectedElement == this.scrollDownButton_) {
      this.scrollDownButton_.style.bottom = `${this.screenPaddingSize}px`;
    } else {
      this.scrollDownButton_.style.bottom = `${-a11yButtonTotalHeight}px`;
    }
    if (accessibilityEnabled && selectedElement == this.optionsButton_) {
      this.optionsButton_.style.bottom = `${this.screenPaddingSize}px`;
    } else {
      this.optionsButton_.style.bottom = `${-2 * a11yButtonTotalHeight}px`;
    }
  });

  // This is the main container for the fixed rows.
  this.rowNodes_ = doc.createElement('div');
  this.rowNodes_.id = 'hterm:row-nodes';
  this.rowNodes_.style.cssText = (
      'display: block;' +
      'position: fixed;' +
      'overflow: hidden;' +
      'user-select: text;');
  this.screen_.appendChild(this.rowNodes_);

  // Two nodes to hold offscreen text during the copy event.
  this.topSelectBag_ = doc.createElement('x-select-bag');
  this.topSelectBag_.style.cssText = (
      'display: block;' +
      'overflow: hidden;' +
      'height: var(--hterm-charsize-height);' +
      'white-space: pre;');

  this.bottomSelectBag_ = this.topSelectBag_.cloneNode();

  // Nodes above the top fold and below the bottom fold are hidden.  They are
  // only used to hold rows that are part of the selection but are currently
  // scrolled off the top or bottom of the visible range.
  this.topFold_ = doc.createElement('x-fold');
  this.topFold_.id = 'hterm:top-fold-for-row-selection';
  this.topFold_.style.cssText = `
    display: block;
    height: var(--hterm-screen-padding-size);
  `;
  this.rowNodes_.appendChild(this.topFold_);

  this.bottomFold_ = this.topFold_.cloneNode();
  this.bottomFold_.id = 'hterm:bottom-fold-for-row-selection';
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
  this.scrollArea_.id = 'hterm:scrollarea';
  this.scrollArea_.style.cssText = 'visibility: hidden';
  this.screen_.appendChild(this.scrollArea_);

  // We send focus to this element just before a paste happens, so we can
  // capture the pasted text and forward it on to someone who cares.
  this.pasteTarget_ = doc.createElement('textarea');
  this.pasteTarget_.id = 'hterm:ctrl-v-paste-target';
  this.pasteTarget_.setAttribute('tabindex', '-1');
  this.pasteTarget_.setAttribute('aria-hidden', 'true');
  this.pasteTarget_.style.cssText = (
    'position: absolute;' +
    'height: 1px;' +
    'width: 1px;' +
    'left: 0px; ' +
    'bottom: 0px;' +
    'opacity: 0');
  this.pasteTarget_.contentEditable = true;

  this.screen_.appendChild(this.pasteTarget_);
  this.pasteTarget_.addEventListener(
      'textInput', this.handlePasteTargetTextInput_.bind(this));

  this.resize();
};

/**
 * Set the AccessibilityReader object to use to announce page scroll updates.
 *
 * @param {!hterm.AccessibilityReader} accessibilityReader for announcing page
 *     scroll updates.
 */
hterm.ScrollPort.prototype.setAccessibilityReader =
    function(accessibilityReader) {
  this.accessibilityReader_ = accessibilityReader;
};

/**
 * Scroll the terminal one page up (minus one line) relative to the current
 * position.
 */
hterm.ScrollPort.prototype.scrollPageUp = function() {
  if (this.getTopRowIndex() == 0) {
    return;
  }

  const i = this.getTopRowIndex();
  this.scrollRowToTop(i - this.visibleRowCount + 1);

  this.assertiveAnnounce_();
};

/**
 * Scroll the terminal one page down (minus one line) relative to the current
 * position.
 */
hterm.ScrollPort.prototype.scrollPageDown = function() {
  if (this.isScrolledEnd) {
    return;
  }

  const i = this.getTopRowIndex();
  this.scrollRowToTop(i + this.visibleRowCount - 1);

  this.assertiveAnnounce_();
};

/**
 * Select the font-family and font-smoothing for this scrollport.
 *
 * @param {string} fontFamily Value of the CSS 'font-family' to use for this
 *     scrollport.  Should be a monospace font.
 * @param {string=} smoothing Optional value for '-webkit-font-smoothing'.
 *     Defaults to an empty string if not specified.
 */
hterm.ScrollPort.prototype.setFontFamily = function(
    fontFamily, smoothing = '') {
  this.screen_.style.fontFamily = fontFamily;
  this.screen_.style.webkitFontSmoothing = smoothing;

  this.syncCharacterSize();
};

/** @return {string} */
hterm.ScrollPort.prototype.getFontFamily = function() {
  return this.screen_.style.fontFamily;
};

/**
 * Set a custom stylesheet to include in the scrollport.
 *
 * Defaults to null, meaning no custom css is loaded.  Set it back to null or
 * the empty string to remove a previously applied custom css.
 *
 * @param {?string} url
 */
hterm.ScrollPort.prototype.setUserCssUrl = function(url) {
  if (url) {
    this.userCssLink_.setAttribute('href', url);

    if (!this.userCssLink_.parentNode) {
      this.document_.head.appendChild(this.userCssLink_);
    }
  } else if (this.userCssLink_.parentNode) {
    this.document_.head.removeChild(this.userCssLink_);
  }
};

/** @param {string} text */
hterm.ScrollPort.prototype.setUserCssText = function(text) {
  this.userCssText_.textContent = text;
};

/** Focus. */
hterm.ScrollPort.prototype.focus = function() {
  this.iframe_.focus();
  this.screen_.focus();
  this.publish('focus');
};

/**
 * Unfocus the scrollport.
 */
hterm.ScrollPort.prototype.blur = function() {
  this.screen_.blur();
};

/** @param {string} image */
hterm.ScrollPort.prototype.setBackgroundImage = function(image) {
  this.screen_.style.backgroundImage = image;
};

/** @param {string} size */
hterm.ScrollPort.prototype.setBackgroundSize = function(size) {
  this.screen_.style.backgroundSize = size;
};

/** @param {string} position */
hterm.ScrollPort.prototype.setBackgroundPosition = function(position) {
  this.screen_.style.backgroundPosition = position;
};

/** @param {number} size */
hterm.ScrollPort.prototype.setScreenPaddingSize = function(size) {
  this.screenPaddingSize = size;
  this.resize();
};

/** @param {boolean} ctrlVPaste */
hterm.ScrollPort.prototype.setCtrlVPaste = function(ctrlVPaste) {
  this.ctrlVPaste = ctrlVPaste;
};

/** @param {boolean} pasteOnDrop */
hterm.ScrollPort.prototype.setPasteOnDrop = function(pasteOnDrop) {
  this.pasteOnDrop = pasteOnDrop;
};

/**
 * Get the usable size of the scrollport screen.
 *
 * The width will not include the scrollbar width.
 *
 * @return {{height: number, width: number}}
 */
hterm.ScrollPort.prototype.getScreenSize = function() {
  const size = this.screen_.getBoundingClientRect();
  const rightPadding = Math.max(
      this.screenPaddingSize, this.currentScrollbarWidthPx);
  return {
    height: size.height - (2 * this.screenPaddingSize),
    width: size.width - this.screenPaddingSize - rightPadding,
  };
};

/**
 * Get the usable width of the scrollport screen.
 *
 * This the widget width minus scrollbar width.
 *
 * @return {number}
 */
hterm.ScrollPort.prototype.getScreenWidth = function() {
  return this.getScreenSize().width;
};

/**
 * Get the usable height of the scrollport screen.
 *
 * @return {number}
 */
hterm.ScrollPort.prototype.getScreenHeight = function() {
  return this.getScreenSize().height;
};

/**
 * Get the horizontal position in px where the scrollbar starts.
 *
 * @return {number}
 */
hterm.ScrollPort.prototype.getScrollbarX = function() {
  return this.screen_.getBoundingClientRect().width -
         this.currentScrollbarWidthPx;
};

/**
 * Return the document that holds the visible rows of this hterm.ScrollPort.
 *
 * @return {!Document}
 */
hterm.ScrollPort.prototype.getDocument = function() {
  return this.document_;
};

/**
 * Returns the x-screen element that holds the rows of this hterm.ScrollPort.
 *
 * @return {?Element}
 */
hterm.ScrollPort.prototype.getScreenNode = function() {
  return this.screen_;
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
 * @param {!hterm.RowProvider} rowProvider An object capable of providing the
 *     rows in this hterm.ScrollPort.
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
  let node = this.topFold_.nextSibling;
  while (node != this.bottomFold_) {
    const nextSibling = node.nextSibling;
    node.parentElement.removeChild(node);
    node = nextSibling;
  }

  this.previousRowNodeCache_ = null;
  const topRowIndex = this.getTopRowIndex();
  const bottomRowIndex = this.getBottomRowIndex(topRowIndex);

  this.drawVisibleRows_(topRowIndex, bottomRowIndex);
};

/**
 * Schedule invalidate.
 */
hterm.ScrollPort.prototype.scheduleInvalidate = function() {
  if (this.timeouts_.invalidate) {
    return;
  }

  this.timeouts_.invalidate = setTimeout(() => {
    delete this.timeouts_.invalidate;
    this.invalidate();
  });
};

/**
 * Set the font size of the ScrollPort.
 *
 * @param {number} px
 */
hterm.ScrollPort.prototype.setFontSize = function(px) {
  this.screen_.style.fontSize = px + 'px';
  this.syncCharacterSize();
};

/**
 * Return the current font size of the ScrollPort.
 *
 * @return {number}
 */
hterm.ScrollPort.prototype.getFontSize = function() {
  return parseInt(this.screen_.style.fontSize, 10);
};

/**
 * Measure the size of a single character in pixels.
 *
 * @param {string=} weight The font weight to measure, or 'normal' if
 *     omitted.
 * @return {!hterm.Size} A new hterm.Size object.
 */
hterm.ScrollPort.prototype.measureCharacterSize = function(weight = '') {
  // Number of lines used to average the height of a single character.
  const numberOfLines = 100;
  // Number of chars per line used to average the width of a single character.
  const lineLength = 100;

  if (!this.ruler_) {
    this.ruler_ = this.document_.createElement('div');
    this.ruler_.id = 'hterm:ruler-character-size';
    this.ruler_.style.cssText = (
        'position: absolute;' +
        'top: 0;' +
        'left: 0;' +
        'visibility: hidden;' +
        'height: auto !important;' +
        'width: auto !important;');

    // We need to put the text in a span to make the size calculation
    // work properly in Firefox
    this.rulerSpan_ = this.document_.createElement('span');
    this.rulerSpan_.id = 'hterm:ruler-span-workaround';
    this.rulerSpan_.innerHTML =
        ('X'.repeat(lineLength) + '\r').repeat(numberOfLines);
    this.ruler_.appendChild(this.rulerSpan_);

    this.rulerBaseline_ = this.document_.createElement('span');
    this.rulerSpan_.id = 'hterm:ruler-baseline';
    // We want to collapse it on the baseline
    this.rulerBaseline_.style.fontSize = '0px';
    this.rulerBaseline_.textContent = 'X';
  }

  this.rulerSpan_.style.fontWeight = weight;

  this.rowNodes_.appendChild(this.ruler_);
  const rulerSize = this.rulerSpan_.getBoundingClientRect();

  const size = new hterm.Size(rulerSize.width / lineLength,
                            rulerSize.height / numberOfLines);

  this.ruler_.appendChild(this.rulerBaseline_);
  this.ruler_.removeChild(this.rulerBaseline_);

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

  this.resize();
};

/**
 * Reset dimensions and visible row count to account for a change in the
 * dimensions of the 'x-screen'.
 */
hterm.ScrollPort.prototype.resize = function() {
  this.syncScrollbarWidth_();
  this.syncScrollHeight();
  this.syncRowNodesDimensions_();

  this.publish(
      'resize', {scrollPort: this},
      () => this.scheduleRedraw());
};

/**
 * Announce text content on the current screen for the screen reader.
 */
hterm.ScrollPort.prototype.assertiveAnnounce_ = function() {
  if (!this.accessibilityReader_) {
    return;
  }

  const topRow = this.getTopRowIndex();
  const bottomRow = this.getBottomRowIndex(topRow);

  let percentScrolled = 100 * topRow /
      Math.max(1, this.rowProvider_.getRowCount() - this.visibleRowCount);
  percentScrolled = Math.min(100, Math.round(percentScrolled));
  let currentScreenContent = hterm.msg('ANNOUNCE_CURRENT_SCREEN_HEADER',
                                       [percentScrolled],
                                       '$1% scrolled,');
  currentScreenContent += '\n';

  for (let i = topRow; i <= bottomRow; ++i) {
    const node = this.fetchRowNode_(i);
    currentScreenContent += node.textContent + '\n';
  }

  this.accessibilityReader_.assertiveAnnounce(currentScreenContent);
};

/**
 * Set the position and size of the row nodes element.
 */
hterm.ScrollPort.prototype.syncRowNodesDimensions_ = function() {
  const screenSize = this.getScreenSize();

  this.lastScreenWidth_ = screenSize.width;
  this.lastScreenHeight_ = screenSize.height;

  // We don't want to show a partial row because it would be distracting
  // in a terminal, so we floor any fractional row count.
  this.visibleRowCount = lib.f.smartFloorDivide(
      screenSize.height, this.characterSize.height);

  // Then compute the height of our integral number of rows.
  const visibleRowsHeight = this.visibleRowCount * this.characterSize.height;

  // Then the difference between the screen height and total row height needs to
  // be made up for as top margin.  We need to record this value so it
  // can be used later to determine the topRowIndex.
  this.visibleRowTopMargin = 0;
  this.visibleRowBottomMargin = screenSize.height - visibleRowsHeight;

  this.topFold_.style.marginBottom = this.visibleRowTopMargin + 'px';


  let topFoldOffset = 0;
  let node = this.topFold_.previousSibling;
  while (node) {
    topFoldOffset += node.getBoundingClientRect().height;
    node = node.previousSibling;
  }

  // Set the dimensions of the visible rows container.
  this.rowNodes_.style.width = screenSize.width + 'px';
  this.rowNodes_.style.height =
      visibleRowsHeight + topFoldOffset + this.screenPaddingSize + 'px';
  this.rowNodes_.style.left =
      this.screen_.offsetLeft + this.screenPaddingSize + 'px';
  this.rowNodes_.style.top =
      this.screen_.offsetTop - topFoldOffset + 'px';
};

/**
 * Measure scrollbar width.
 *
 * @private
 */
hterm.ScrollPort.prototype.syncScrollbarWidth_ = function() {
  const width = this.screen_.getBoundingClientRect().width -
                this.screen_.clientWidth;
  if (width > 0) {
    this.currentScrollbarWidthPx = width;
  }
};

/**
 * Resize the scroll area to appear as though it contains every row.
 */
hterm.ScrollPort.prototype.syncScrollHeight = function() {
  this.lastRowCount_ = this.rowProvider_.getRowCount();
  this.scrollArea_.style.height = (this.characterSize.height *
                                   this.lastRowCount_ +
                                   (2 * this.screenPaddingSize) +
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
  if (this.timeouts_.redraw) {
    return;
  }

  this.timeouts_.redraw = setTimeout(() => {
    delete this.timeouts_.redraw;
    this.redraw_();
  });
};

/**
 * Update the state of scroll up/down buttons.
 *
 * If the viewport is at the top or bottom row of output, these buttons will
 * be made transparent and clicking them shouldn't scroll any further.
 */
hterm.ScrollPort.prototype.updateScrollButtonState_ = function() {
  const setButton = (button, disabled) => {
    button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    button.style.opacity = disabled ? 0.5 : 1;
  };
  setButton(this.scrollUpButton_, this.getTopRowIndex() == 0);
  setButton(this.scrollDownButton_, this.isScrolledEnd);
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

  const topRowIndex = this.getTopRowIndex();
  const bottomRowIndex = this.getBottomRowIndex(topRowIndex);

  this.drawTopFold_(topRowIndex);
  this.drawBottomFold_(bottomRowIndex);
  this.drawVisibleRows_(topRowIndex, bottomRowIndex);
  this.ariaHideOffscreenSelectionRows_(topRowIndex, bottomRowIndex);

  this.syncRowNodesDimensions_();

  this.previousRowNodeCache_ = this.currentRowNodeCache_;
  this.currentRowNodeCache_ = null;

  this.isScrolledEnd = (
    this.getTopRowIndex() + this.visibleRowCount >= this.lastRowCount_);

  this.updateScrollButtonState_();
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
 *
 * @param {number} topRowIndex
 */
hterm.ScrollPort.prototype.drawTopFold_ = function(topRowIndex) {
  if (!this.selection.startRow ||
      this.selection.startRow.rowIndex >= topRowIndex) {
    // Selection is entirely below the top fold, just make sure the fold is
    // the first child.
    if (this.rowNodes_.firstChild != this.topFold_) {
      this.rowNodes_.insertBefore(this.topFold_, this.rowNodes_.firstChild);
    }

    return;
  }

  if (!this.selection.isMultiline ||
      this.selection.endRow.rowIndex >= topRowIndex) {
    // Only the startRow is above the fold.
    if (this.selection.startRow.nextSibling != this.topFold_) {
      this.rowNodes_.insertBefore(this.topFold_,
                                  this.selection.startRow.nextSibling);
    }
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

  while (this.rowNodes_.firstChild != this.selection.startRow) {
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
 *
 * @param {number} bottomRowIndex
 */
hterm.ScrollPort.prototype.drawBottomFold_ = function(bottomRowIndex) {
  if (!this.selection.endRow ||
      this.selection.endRow.rowIndex <= bottomRowIndex) {
    // Selection is entirely above the bottom fold, just make sure the fold is
    // the last child.
    if (this.rowNodes_.lastChild != this.bottomFold_) {
      this.rowNodes_.appendChild(this.bottomFold_);
    }

    return;
  }

  if (!this.selection.isMultiline ||
      this.selection.startRow.rowIndex <= bottomRowIndex) {
    // Only the endRow is below the fold.
    if (this.bottomFold_.nextSibling != this.selection.endRow) {
      this.rowNodes_.insertBefore(this.bottomFold_,
                                  this.selection.endRow);
    }
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

  while (this.rowNodes_.lastChild != this.selection.endRow) {
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
 *
 * @param {number} topRowIndex
 * @param {number} bottomRowIndex
 */
hterm.ScrollPort.prototype.drawVisibleRows_ = function(
    topRowIndex, bottomRowIndex) {
  // Keep removing nodes, starting with currentNode, until we encounter
  // targetNode.  Throws on failure.
  const removeUntilNode = (currentNode, targetNode) => {
    while (currentNode != targetNode) {
      if (!currentNode) {
        throw new Error('Did not encounter target node');
      }

      if (currentNode == this.bottomFold_) {
        throw new Error('Encountered bottom fold before target node');
      }

      const deadNode = currentNode;
      currentNode = currentNode.nextSibling;
      deadNode.parentNode.removeChild(deadNode);
    }
  };

  // Shorthand for things we're going to use a lot.
  const selectionStartRow = this.selection.startRow;
  const selectionEndRow = this.selection.endRow;
  const bottomFold = this.bottomFold_;

  // The node we're examining during the current iteration.
  let node = this.topFold_.nextSibling;

  const targetDrawCount = Math.min(this.visibleRowCount,
                                   this.rowProvider_.getRowCount());

  for (let drawCount = 0; drawCount < targetDrawCount; drawCount++) {
    const rowIndex = topRowIndex + drawCount;

    if (node == bottomFold) {
      // We've hit the bottom fold, we need to insert a new row.
      const newNode = this.fetchRowNode_(rowIndex);
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
      const newNode = this.fetchRowNode_(rowIndex);
      if (!newNode) {
        console.log("Couldn't fetch row index: " + rowIndex);
        break;
      }

      this.rowNodes_.insertBefore(newNode, node);
      continue;
    }

    // There is nothing special about this node, but it's in our way.  Replace
    // it with the node that should be here.
    const newNode = this.fetchRowNode_(rowIndex);
    if (!newNode) {
      console.log("Couldn't fetch row index: " + rowIndex);
      break;
    }

    if (node == newNode) {
      node = node.nextSibling;
      continue;
    }

    this.rowNodes_.insertBefore(newNode, node);
    this.rowNodes_.removeChild(node);
    node = newNode.nextSibling;
  }

  if (node != this.bottomFold_) {
    removeUntilNode(node, bottomFold);
  }
};

/**
 * Ensure aria-hidden is set on any selection rows that are offscreen.
 *
 * The attribute aria-hidden is set to 'true' so that hidden rows are ignored
 * by screen readers.  We keep a list of currently hidden rows so they can be
 * reset each time this function is called as the selection and/or scrolling
 * may have changed.
 *
 * @param {number} topRowIndex Index of top row on screen.
 * @param {number} bottomRowIndex Index of bottom row on screen.
 */
hterm.ScrollPort.prototype.ariaHideOffscreenSelectionRows_ = function(
    topRowIndex, bottomRowIndex) {
  // Reset previously hidden selection rows.
  const hiddenRows = this.ariaHiddenSelectionRows_;
  let row;
  while ((row = hiddenRows.pop())) {
    row.removeAttribute('aria-hidden');
  }

  function checkRow(row) {
    if (row && (row.rowIndex < topRowIndex || row.rowIndex > bottomRowIndex)) {
      row.setAttribute('aria-hidden', 'true');
      hiddenRows.push(row);
    }
  }
  checkRow(this.selection.startRow);
  checkRow(this.selection.endRow);
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
 *
 * @param {!Node} rowNode
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
 *
 * @param {number} rowIndex
 * @return {!Node}
 */
hterm.ScrollPort.prototype.fetchRowNode_ = function(rowIndex) {
  let node;

  if (this.previousRowNodeCache_ && rowIndex in this.previousRowNodeCache_) {
    node = this.previousRowNodeCache_[rowIndex];
  } else {
    node = this.rowProvider_.getRowNode(rowIndex);
  }

  if (this.currentRowNodeCache_) {
    this.cacheRowNode_(node);
  }

  return node;
};

/**
 * Select all rows in the viewport.
 */
hterm.ScrollPort.prototype.selectAll = function() {
  let firstRow;

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

  const lastRowIndex = this.rowProvider_.getRowCount() - 1;
  let lastRow;

  if (this.bottomFold_.previousSibling.rowIndex != lastRowIndex) {
    while (this.bottomFold_.nextSibling) {
      this.rowNodes_.removeChild(this.bottomFold_.nextSibling);
    }

    lastRow = this.fetchRowNode_(lastRowIndex);
    this.rowNodes_.appendChild(lastRow);
  } else {
    lastRow = this.bottomFold_.previousSibling.rowIndex;
  }

  const selection = this.document_.getSelection();
  selection.collapse(firstRow, 0);
  selection.extend(lastRow, lastRow.childNodes.length);

  this.selection.sync();
};

/**
 * Return the maximum scroll position in pixels.
 *
 * @return {number}
 */
hterm.ScrollPort.prototype.getScrollMax_ = function() {
  return this.scrollArea_.getBoundingClientRect().height +
         this.visibleRowTopMargin + this.visibleRowBottomMargin -
         this.screen_.getBoundingClientRect().height;
};

/**
 * Scroll the given rowIndex to the top of the hterm.ScrollPort.
 *
 * @param {number} rowIndex Index of the target row.
 */
hterm.ScrollPort.prototype.scrollRowToTop = function(rowIndex) {
  // Other scrollRowTo* functions and scrollLineUp could pass rowIndex < 0.
  if (rowIndex < 0) {
    rowIndex = 0;
  }

  this.syncScrollHeight();

  this.isScrolledEnd = (
    rowIndex + this.visibleRowCount >= this.lastRowCount_);

  let scrollTop = rowIndex * this.characterSize.height +
      this.visibleRowTopMargin;

  const scrollMax = this.getScrollMax_();
  if (scrollTop > scrollMax) {
    scrollTop = scrollMax;
  }

  if (this.screen_.scrollTop == scrollTop) {
    return;
  }

  this.screen_.scrollTop = scrollTop;
  this.scheduleRedraw();
};

/**
 * Scroll the given rowIndex to the bottom of the hterm.ScrollPort.
 *
 * @param {number} rowIndex Index of the target row.
 */
hterm.ScrollPort.prototype.scrollRowToBottom = function(rowIndex) {
  this.scrollRowToTop(rowIndex - this.visibleRowCount);
};

/**
 * Scroll the given rowIndex to the middle of the hterm.ScrollPort.
 *
 * @param {number} rowIndex Index of the target row.
 */
hterm.ScrollPort.prototype.scrollRowToMiddle = function(rowIndex) {
  this.scrollRowToTop(rowIndex - Math.floor(this.visibleRowCount / 2));
};

/**
 * Return the row index of the first visible row.
 *
 * This is based on the scroll position.  If a redraw_ is in progress this
 * returns the row that *should* be at the top.
 *
 * @return {number}
 */
hterm.ScrollPort.prototype.getTopRowIndex = function() {
  return Math.round(this.screen_.scrollTop / this.characterSize.height);
};

/**
 * Return the row index of the last visible row.
 *
 * This is based on the scroll position.  If a redraw_ is in progress this
 * returns the row that *should* be at the bottom.
 *
 * @param {number} topRowIndex
 * @return {number}
 */
hterm.ScrollPort.prototype.getBottomRowIndex = function(topRowIndex) {
  return topRowIndex + this.visibleRowCount - 1;
};

/**
 * Handler for scroll events.
 *
 * The onScroll event fires when scrollArea's scrollTop property changes.  This
 * may be due to the user manually move the scrollbar, or a programmatic change.
 *
 * @param {!Event} e
 */
hterm.ScrollPort.prototype.onScroll_ = function(e) {
  const screenSize = this.getScreenSize();
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
  this.publish('scroll', {scrollPort: this});
};

/**
 * Clients can override this if they want to hear scrollwheel events.
 *
 * Clients may call event.preventDefault() if they want to keep the scrollport
 * from also handling the events.
 *
 * @param {!WheelEvent} e
 */
hterm.ScrollPort.prototype.onScrollWheel = function(e) {};

/**
 * Handler for scroll-wheel events.
 *
 * The onScrollWheel event fires when the user moves their scrollwheel over this
 * hterm.ScrollPort.  Because the frontmost element in the hterm.ScrollPort is
 * a fixed position DIV, the scroll wheel does nothing by default.  Instead, we
 * have to handle it manually.
 *
 * @param {!WheelEvent} e
 */
hterm.ScrollPort.prototype.onScrollWheel_ = function(e) {
  this.onScrollWheel(e);

  if (e.defaultPrevented) {
    return;
  }

  // Figure out how far this event wants us to scroll.
  const delta = this.scrollWheelDelta(e);

  let top = this.screen_.scrollTop - delta.y;
  if (top < 0) {
    top = 0;
  }

  const scrollMax = this.getScrollMax_();
  if (top > scrollMax) {
    top = scrollMax;
  }

  if (top != this.screen_.scrollTop) {
    // Moving scrollTop causes a scroll event, which triggers the redraw.
    this.screen_.scrollTop = top;

    // Only preventDefault when we've actually scrolled.  If there's nothing
    // to scroll we want to pass the event through so Chrome can detect the
    // overscroll.
    e.preventDefault();
  } else if (e.ctrlKey) {
    // Holding Contrl while scrolling will trigger zoom events.  Defeat them!
    // Touchpad pinches also hit here via fake events.  https://crbug.com/289887
    e.preventDefault();
  }
};

/**
 * Calculate how far a wheel event should scroll.
 *
 * This normalizes the browser's concept of a scroll (pixels, lines, etc...)
 * into a standard pixel distance.
 *
 * @param {!WheelEvent} e The mouse wheel event to process.
 * @return {{x:number, y:number}} The x & y of how far (in pixels) to scroll.
 */
hterm.ScrollPort.prototype.scrollWheelDelta = function(e) {
  const delta = {x: 0, y: 0};

  switch (e.deltaMode) {
    case WheelEvent.DOM_DELTA_PIXEL:
      delta.x = e.deltaX * this.scrollWheelMultiplier_;
      delta.y = e.deltaY * this.scrollWheelMultiplier_;
      break;
    case WheelEvent.DOM_DELTA_LINE:
      delta.x = e.deltaX * this.characterSize.width;
      delta.y = e.deltaY * this.characterSize.height;
      break;
    case WheelEvent.DOM_DELTA_PAGE: {
      const {width, height} = this.screen_.getBoundingClientRect();
      delta.x = e.deltaX * this.characterSize.width * width;
      delta.y = e.deltaY * this.characterSize.height * height;
      break;
    }
  }

  // The Y sign is inverted from what we would expect: up/down are
  // negative/positive respectively.  The X sign is sane though: left/right
  // are negative/positive respectively.
  delta.y *= -1;

  return delta;
};

/**
 * Clients can override this if they want to hear touch events.
 *
 * Clients may call event.preventDefault() if they want to keep the scrollport
 * from also handling the events.
 *
 * @param {!TouchEvent} e
 */
hterm.ScrollPort.prototype.onTouch = function(e) {};

/**
 * Handler for touch events.
 *
 * @param {!TouchEvent} e
 */
hterm.ScrollPort.prototype.onTouch_ = function(e) {
  this.onTouch(e);

  if (e.defaultPrevented) {
    return;
  }

  // Extract the fields from the Touch event that we need.  If we saved the
  // event directly, it has references to other objects (like x-row) that
  // might stick around for a long time.  This way we only have small objects
  // in our lastTouch_ state.
  const scrubTouch = function(t) {
    return {
      id: t.identifier,
      y: t.clientY,
      x: t.clientX,
    };
  };

  let i, touch;
  switch (e.type) {
    case 'touchstart':
      // Workaround focus bug on CrOS if possible.
      // TODO(vapier): Drop this once https://crbug.com/919222 is fixed.
      if (hterm.os == 'cros' && window.chrome && chrome.windows) {
        chrome.windows.getCurrent((win) => {
          if (!win.focused) {
            chrome.windows.update(win.id, {focused: true});
          }
        });
      }

      // Save the current set of touches.
      for (i = 0; i < e.changedTouches.length; ++i) {
        touch = scrubTouch(e.changedTouches[i]);
        this.lastTouch_[touch.id] = touch;
      }
      break;

    case 'touchcancel':
    case 'touchend':
      // Throw away existing touches that we're finished with.
      for (i = 0; i < e.changedTouches.length; ++i) {
        delete this.lastTouch_[e.changedTouches[i].identifier];
      }
      break;

    case 'touchmove': {
      // Walk all of the touches in this one event and merge all of their
      // changes into one delta.  This lets multiple fingers scroll faster.
      let delta = 0;
      for (i = 0; i < e.changedTouches.length; ++i) {
        touch = scrubTouch(e.changedTouches[i]);
        delta += (this.lastTouch_[touch.id].y - touch.y);
        this.lastTouch_[touch.id] = touch;
      }

      // Invert to match the touchscreen scrolling direction of browser windows.
      delta *= -1;

      let top = this.screen_.scrollTop - delta;
      if (top < 0) {
        top = 0;
      }

      const scrollMax = this.getScrollMax_();
      if (top > scrollMax) {
        top = scrollMax;
      }

      if (top != this.screen_.scrollTop) {
        // Moving scrollTop causes a scroll event, which triggers the redraw.
        this.screen_.scrollTop = top;
      }
      break;
    }
  }

  // To disable gestures or anything else interfering with our scrolling.
  e.preventDefault();
};

/**
 * Handler for resize events.
 *
 * The browser will resize us such that the top row stays at the top, but we
 * prefer to the bottom row to stay at the bottom.
 *
 * @param {!FocusEvent} e
 */
hterm.ScrollPort.prototype.onResize_ = function(e) {
  // Re-measure, since onResize also happens for browser zoom changes.
  this.syncCharacterSize();
};

/**
 * Clients can override this if they want to hear copy events.
 *
 * Clients may call event.preventDefault() if they want to keep the scrollport
 * from also handling the events.
 *
 * @param {!ClipboardEvent} e
 */
hterm.ScrollPort.prototype.onCopy = function(e) { };

/**
 * Handler for copy-to-clipboard events.
 *
 * If some or all of the selected rows are off screen we may need to fill in
 * the rows between selection start and selection end.  This handler determines
 * if we're missing some of the selected text, and if so populates one or both
 * of the "select bags" with the missing text.
 *
 * @param {!ClipboardEvent} e
 */
hterm.ScrollPort.prototype.onCopy_ = function(e) {
  this.onCopy(e);

  if (e.defaultPrevented) {
    return;
  }

  this.resetSelectBags_();
  this.selection.sync();

  if (this.selection.isCollapsed ||
      this.selection.endRow.rowIndex - this.selection.startRow.rowIndex < 2) {
    return;
  }

  const topRowIndex = this.getTopRowIndex();
  const bottomRowIndex = this.getBottomRowIndex(topRowIndex);

  if (this.selection.startRow.rowIndex < topRowIndex) {
    // Start of selection is above the top fold.
    let endBackfillIndex;

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
    let startBackfillIndex;

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
 * Focuses on the paste target on a ctrl-v keydown event, as in
 * FF a content editable element must be focused before the paste event.
 *
 * @param {!KeyboardEvent} e
 */
hterm.ScrollPort.prototype.onBodyKeyDown_ = function(e) {
  if (!this.ctrlVPaste) {
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.keyCode == 86 /* 'V' */) {
    this.pasteTarget_.focus();
  }
};

/**
 * Handle a paste event on the the ScrollPort's screen element.
 *
 * TODO: Handle ClipboardData.files transfers.  https://crbug.com/433581.
 *
 * @param {!ClipboardEvent} e
 */
hterm.ScrollPort.prototype.onPaste_ = function(e) {
  this.pasteTarget_.focus();

  setTimeout(() => {
    this.publish('paste', {text: this.pasteTarget_.value});
    this.pasteTarget_.value = '';
    this.focus();
  });
};

/**
 * Handles a textInput event on the paste target. Stops this from
 * propagating as we want this to be handled in the onPaste_ method.
 *
 * @param {!Event} e
 */
hterm.ScrollPort.prototype.handlePasteTargetTextInput_ = function(e) {
  e.stopPropagation();
};

/**
 * Handle a drop event on the the ScrollPort's screen element.
 *
 * By default we try to copy in the structured format (HTML/whatever).
 * The shift key can select plain text though.
 *
 * TODO: Handle DataTransfer.files transfers.  https://crbug.com/433581.
 *
 * @param {!DragEvent} e The drag event that fired us.
 */
hterm.ScrollPort.prototype.onDragAndDrop_ = function(e) {
  if (!this.pasteOnDrop) {
    return;
  }

  e.preventDefault();

  let data;
  let format;

  // If the shift key active, try to find a "rich" text source (but not plain
  // text).  e.g. text/html is OK.
  if (e.shiftKey) {
    e.dataTransfer.types.forEach((t) => {
      if (!format && t != 'text/plain' && t.startsWith('text/')) {
        format = t;
      }
    });

    // If we found a non-plain text source, try it out first.
    if (format) {
      data = e.dataTransfer.getData(format);
    }
  }

  // If we haven't loaded anything useful, fall back to plain text.
  if (!data) {
    data = e.dataTransfer.getData('text/plain');
  }

  if (data) {
    this.publish('paste', {text: data});
  }
};

/**
 * Set the vertical scrollbar mode of the ScrollPort.
 *
 * @param {boolean} state
 */
hterm.ScrollPort.prototype.setScrollbarVisible = function(state) {
  if (state) {
    this.screen_.style.overflowY = 'scroll';
    this.currentScrollbarWidthPx = hterm.ScrollPort.DEFAULT_SCROLLBAR_WIDTH;
    this.syncScrollbarWidth_();
  } else {
    this.screen_.style.overflowY = 'hidden';
    this.currentScrollbarWidthPx = 0;
  }
};

/**
 * Set scroll wheel multiplier. This alters how much the screen scrolls on
 * mouse wheel events.
 *
 * @param {number} multiplier
 */
hterm.ScrollPort.prototype.setScrollWheelMoveMultipler = function(multiplier) {
  this.scrollWheelMultiplier_ = multiplier;
};
