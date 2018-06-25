// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

hterm.ScrollPort.Tests = new lib.TestManager.Suite('hterm.ScrollPort.Tests');

hterm.ScrollPort.Tests.prototype.setup = function(cx) {
  this.setDefaults(cx,
      { visibleColumnCount: 80,
        visibleRowCount: 25,
        totalRowCount: 10000
      });

  var document = cx.window.document;

  document.body.innerHTML = '';

  this.rowProvider = new MockRowProvider(document, this.totalRowCount);

  var div = document.createElement('div');
  div.style.position = 'relative';
  div.style.height = '100%';
  div.style.width = '100%';
  document.body.appendChild(div);

  this.scrollPort = new hterm.ScrollPort(this.rowProvider);
  this.scrollPort.decorate(div);
  div.style.height = (this.scrollPort.characterSize.height *
                      this.visibleRowCount + 1 + 'px');
  this.scrollPort.resize();
};

/**
 * Ensure the selection is collapsed, row caching is on, and we're at the
 * top of the scroll port.
 */
hterm.ScrollPort.Tests.prototype.preamble = function(result, cx) {
  var selection = cx.window.getSelection();
  if (!selection.isCollapsed)
    selection.collapseToStart();

  this.rowProvider.setCacheEnabled(true);

  this.scrollPort.scrollRowToBottom(this.totalRowCount);
  this.scrollPort.scrollRowToTop(0);
};

/**
 * Basic test to make sure that the viewport contains the right number of
 * rows at the right places after some scrolling.
 */
hterm.ScrollPort.Tests.addTest('basic-scroll', function(result, cx) {
    var topRow = this.scrollPort.getTopRowIndex();
    result.assertEQ(topRow, 0);
    result.assertEQ(this.scrollPort.getBottomRowIndex(topRow),
                    this.visibleRowCount - 1);

    this.scrollPort.scrollRowToBottom(this.totalRowCount);
    topRow = this.scrollPort.getTopRowIndex();
    result.assertEQ(topRow,
                    this.totalRowCount - this.visibleRowCount);
    result.assertEQ(this.scrollPort.getBottomRowIndex(topRow),
                    this.totalRowCount - 1);

    result.pass();
  });

/**
 * Make sure the hterm.ScrollPort is reusing the same row nodes when it can.
 */
hterm.ScrollPort.Tests.addTest('node-recycler', function(result, cx) {
    // Force a sync redraw before we get started so we know we're done
    // calling getRowNode.
    this.scrollPort.redraw_();

    this.rowProvider.resetCallCount('getRowNode');
    this.scrollPort.scrollRowToTop(1);

    // Sync redraw so we know getRowNode was called again.
    this.scrollPort.redraw_();

    var count = this.rowProvider.getCallCount('getRowNode');

    // Scrolling from 0 to 1 should result in only one call to getRowNode.
    result.assertEQ(count,  1);

    result.pass();
  });

/**
 * Make sure the selection is maintained even after scrolling off screen.
 */
hterm.ScrollPort.Tests.addTest('scroll-selection', function(result, cx) {
    var doc = this.scrollPort.getDocument();

    var s = doc.getSelection();
    // IE does not supposed the extend method on selections.  They support
    // an approximation using addRange, but it automatically merges sibling
    // ranges and selects the parent node.  Ignore this test on IE for now.
    if (!s.extend) {
      result.pass();
    }

    // Scroll into a part of the buffer that can be scrolled off the top
    // and the bottom of the screen.
    this.scrollPort.scrollRowToTop(50);

    // Force a synchronous redraw.  We'll need to DOM to be correct in order
    // to alter the selection.
    this.scrollPort.redraw_();

    // And select some text in the middle of the visible range.
    var anchorRow = this.rowProvider.getRowNode(55);
    var anchorNode = anchorRow;
    while (anchorNode.firstChild)
      anchorNode = anchorNode.firstChild;
    s.collapse(anchorNode, 0);

    var focusRow = this.rowProvider.getRowNode(55 + this.visibleRowCount - 10);
    var focusNode = focusRow;
    while (focusNode.lastChild)
      focusNode = focusNode.lastChild;
    s.extend(focusNode, focusNode.length || 0);

    for (var i = 0; i < this.visibleRowCount; i++) {
      this.scrollPort.scrollRowToTop(50 - i);
      this.scrollPort.redraw_();
      result.assertEQ(anchorNode, s.anchorNode);
      result.assertEQ(focusNode, s.focusNode);
    }

    for (var i = 0; i < this.visibleRowCount; i++) {
      this.scrollPort.scrollRowToTop(50 + i);
      this.scrollPort.redraw_();
      result.assertEQ(anchorNode, s.anchorNode);
      result.assertEQ(focusNode, s.focusNode);
    }

    result.pass();
  });

/**
 * Make sure the selection is maintained for a collapsed selection.
 */
hterm.ScrollPort.Tests.addTest(
    'scroll-selection-collapsed', function(result, cx) {
  const doc = this.scrollPort.getDocument();

  const s = doc.getSelection();

  // Scroll into a part of the buffer that can be scrolled off the top
  // and the bottom of the screen.
  this.scrollPort.scrollRowToTop(50);

  // Force a synchronous redraw.  We'll need to DOM to be correct in order
  // to alter the selection.
  this.scrollPort.redraw_();

  // Create a collapsed selection.
  s.removeAllRanges();
  const anchorRow = this.rowProvider.getRowNode(53);
  const anchorNode = anchorRow;
  const range = doc.createRange();
  range.selectNode(anchorNode.firstChild);
  range.collapse(true);
  s.addRange(range);

  result.assertEQ(anchorNode, s.anchorNode);
  result.assertEQ(anchorNode, s.focusNode);
  result.assert(s.isCollapsed);

  // When accessibility is enabled, the selection should be preserved after
  // scrolling.
  this.scrollPort.setAccessibilityEnabled(true);

  for (let i = 0; i < this.visibleRowCount; i++) {
    this.scrollPort.scrollRowToTop(50 - i);
    this.scrollPort.redraw_();
    result.assertEQ(anchorNode, s.anchorNode);
    result.assertEQ(anchorNode, s.focusNode);
  }

  for (let i = 0; i < this.visibleRowCount; i++) {
    this.scrollPort.scrollRowToTop(50 + i);
    this.scrollPort.redraw_();
    result.assertEQ(anchorNode, s.anchorNode);
    result.assertEQ(anchorNode, s.focusNode);
  }

  // When accessibility isn't enabled, the selection shouldn't be preserved
  // after scrolling.
  this.scrollPort.setAccessibilityEnabled(false);

  for (let i = 0; i < this.visibleRowCount; i++) {
    this.scrollPort.scrollRowToTop(50 - i);
    this.scrollPort.redraw_();
  }

  for (let i = 0; i < this.visibleRowCount; i++) {
    this.scrollPort.scrollRowToTop(50 + i);
    this.scrollPort.redraw_();
  }

  result.assert(anchorNode != s.anchorNode);
  result.assert(anchorNode != s.focusNode);

  result.pass();
});

/**
 * Test the select-all function.
 */
hterm.ScrollPort.Tests.addTest('select-all', function(result, cx) {
    this.scrollPort.selectAll();
    result.assertEQ(0, this.scrollPort.selection.startRow.rowIndex);
    result.assertEQ(this.totalRowCount - 1,
                    this.scrollPort.selection.endRow.rowIndex);
    result.pass();
  });

/**
 * Test that the page up/down buttons are onscreen when selected but offscreen
 * otherwise.
 */
hterm.ScrollPort.Tests.addTest('page-up-down-hidden', function(result, cx) {
  const doc = this.scrollPort.getDocument();

  this.scrollPort.allowScrollButtonsToDisplay_ = true;

  const selection = doc.getSelection();

  const pageUp = doc.getElementById('hterm:a11y:page-up');
  result.assert(pageUp.getBoundingClientRect().bottom <= 0);

  selection.removeAllRanges();
  let range = document.createRange();
  range.selectNodeContents(pageUp.firstChild);
  selection.addRange(range);
  doc.dispatchEvent(new Event('selectionchange'));

  result.assert(pageUp.getBoundingClientRect().top >= 0);

  const pageDown = doc.getElementById('hterm:a11y:page-down');
  result.assert(pageDown.getBoundingClientRect().top >=
                this.scrollPort.getScreenHeight());

  selection.removeAllRanges();
  range = document.createRange();
  range.selectNodeContents(pageDown.firstChild);
  selection.addRange(range);
  doc.dispatchEvent(new Event('selectionchange'));

  result.assert(pageDown.getBoundingClientRect().bottom <=
                this.scrollPort.getScreenHeight());

  result.pass();
});

/**
 * Test that clicking page up/down causes the viewport to scroll up/down.
 */
hterm.ScrollPort.Tests.addTest('page-up-down-scroll', function(result, cx) {
  const doc = this.scrollPort.getDocument();

  const topRow = 50;
  this.scrollPort.scrollRowToTop(topRow);
  result.assertEQ(this.scrollPort.getTopRowIndex(), topRow);

  const pageDown = doc.getElementById('hterm:a11y:page-down');
  pageDown.dispatchEvent(new Event('click'));
  result.assertEQ(this.scrollPort.getTopRowIndex(), topRow + 24);

  const pageUp = doc.getElementById('hterm:a11y:page-up');
  pageUp.dispatchEvent(new Event('click'));
  result.assertEQ(this.scrollPort.getTopRowIndex(), topRow);

  result.pass();
});

/**
 * Test that the page up/down buttons are enabled/disabled correctly at the top
 * and bottom of the scrollport.
 */
hterm.ScrollPort.Tests.addTest('page-up-down-state', function(result, cx) {
  const doc = this.scrollPort.getDocument();
  const pageUp = doc.getElementById('hterm:a11y:page-up');
  const pageDown = doc.getElementById('hterm:a11y:page-down');

  this.scrollPort.scrollRowToTop(0);
  this.scrollPort.redraw_();
  result.assertEQ(pageUp.getAttribute('aria-disabled'), 'true');
  result.assertEQ(pageDown.getAttribute('aria-disabled'), 'false');

  this.scrollPort.scrollRowToTop(50);
  this.scrollPort.redraw_();
  result.assertEQ(pageUp.getAttribute('aria-disabled'), 'false');
  result.assertEQ(pageDown.getAttribute('aria-disabled'), 'false');

  this.scrollPort.scrollRowToTop(10000);
  this.scrollPort.redraw_();
  result.assertEQ(pageUp.getAttribute('aria-disabled'), 'false');
  result.assertEQ(pageDown.getAttribute('aria-disabled'), 'true');

  result.pass();
});

/**
 * Remove the scrollPort that was set up and leave the user with a full-page
 * scroll port.
 *
 * This should always be the last test of the suite, since it leaves the user
 * with a full page scrollPort to poke at.
 */
hterm.ScrollPort.Tests.addTest('fullscreen', function(result, cx) {
    var document = cx.window.document;

    document.body.innerHTML = '';

    this.rowProvider = new MockRowProvider(document, this.totalRowCount);

    var div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.height = '100%';
    div.style.width = '100%';
    document.body.appendChild(div);

    this.scrollPort = new hterm.ScrollPort(this.rowProvider,
                                           this.fontSize, this.lineHeight);
    this.scrollPort.decorate(div);

    cx.window.scrollPort = this.scrollPort;

    var divSize = hterm.getClientSize(div);

    result.assert(divSize.height > 0);
    result.assert(divSize.width > 0);
    result.assertEQ(divSize.height,
                    hterm.getClientHeight(this.scrollPort.iframe_));

    result.pass();
  });

hterm.ScrollPort.DragAndDropTests =
    new lib.TestManager.Suite('hterm.ScrollPort.DragAndDrop.Tests');

/**
 * We can't generate useful DragEvents as the dataTransfer member is forced
 * read-only, so create a fake object and call the drag handler directly.
 * This is a bit ugly, but the web makes us do it.
 */
const MockDragEvent = function(shift) {
  this.dataTransfer = new DataTransfer();
  this.shiftKey = !!shift;
  this.preventDefault = () => {};
};

hterm.ScrollPort.DragAndDropTests.prototype.preamble = function(cx) {
  // Create a new port since so the subscribe event doesn't stick to
  // this.scrollPort across multiple tests.
  this.scrollPort = new hterm.ScrollPort();
};

/**
 * A single text/plain element.
 */
hterm.ScrollPort.DragAndDropTests.addTest('drag-drop-text', function(result, cx) {
  const e = new MockDragEvent();
  e.dataTransfer.setData('text/plain', 'plain');

  this.scrollPort.subscribe('paste', (e) => {
    result.assertEQ('plain', e.text);
    result.pass();
  });
  this.scrollPort.onDragAndDrop_(e);

  result.requestTime(200);
});

/**
 * Pick between text & html based on shift key not pressed.
 */
hterm.ScrollPort.DragAndDropTests.addTest('drag-drop-text-no-shift', function(result, cx) {
  const e = new MockDragEvent();
  e.dataTransfer.setData('text/html', 'html');
  e.dataTransfer.setData('text/plain', 'plain');

  this.scrollPort.subscribe('paste', (e) => {
    result.assertEQ('plain', e.text);
    result.pass();
  });
  this.scrollPort.onDragAndDrop_(e);

  result.requestTime(200);
});

/**
 * Pick between text & html based on shift key pressed.
 */
hterm.ScrollPort.DragAndDropTests.addTest('drag-drop-text-shift', function(result, cx) {
  const e = new MockDragEvent(true /* shift */);
  e.dataTransfer.setData('text/html', 'html');
  e.dataTransfer.setData('text/plain', 'plain');

  this.scrollPort.subscribe('paste', (e) => {
    result.assertEQ('html', e.text);
    result.pass();
  });
  this.scrollPort.onDragAndDrop_(e);

  result.requestTime(200);
});

/**
 * Verify fallback when first source is empty & shift key is not pressed.
 */
hterm.ScrollPort.DragAndDropTests.addTest('drag-drop-text-fallback-no-shift', function(result, cx) {
  const e = new MockDragEvent();
  e.dataTransfer.setData('text/html', '');
  e.dataTransfer.setData('text/plain', 'plain');

  this.scrollPort.subscribe('paste', (e) => {
    result.assertEQ('plain', e.text);
    result.pass();
  });
  this.scrollPort.onDragAndDrop_(e);

  result.requestTime(200);
});

/**
 * Verify fallback when first source is empty & shift key is pressed.
 */
hterm.ScrollPort.DragAndDropTests.addTest('drag-drop-text-fallback-shift', function(result, cx) {
  const e = new MockDragEvent(true /* shift */);
  e.dataTransfer.setData('text/html', '');
  e.dataTransfer.setData('text/plain', 'plain');

  this.scrollPort.subscribe('paste', (e) => {
    result.assertEQ('plain', e.text);
    result.pass();
  });
  this.scrollPort.onDragAndDrop_(e);

  result.requestTime(200);
});

/**
 * Verify bad sources don't trigger paste events.
 */
hterm.ScrollPort.DragAndDropTests.addTest('drag-drop-unusable', function(result, cx) {
  const e = new MockDragEvent();
  this.scrollPort.subscribe('paste', () => result.fail());

  // Binary only data shouldn't trigger an event.
  e.dataTransfer.setData('application/x-executable', 'plain');
  this.scrollPort.onDragAndDrop_(e);

  // Neither should empty text.
  e.dataTransfer.setData('text/plain', '');
  this.scrollPort.onDragAndDrop_(e);

  result.requestTime(1000);
  setTimeout(() => result.pass(), 100);
});
