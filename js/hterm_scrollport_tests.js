// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * A mock accessibility reader which will simply record the last string passed
 * to assertiveAnnounce.
 */
const MockAccessibilityReader = function() {
  this.accessibilityEnabled = false;
  this.lastStringAnnounced = '';
};

/**
 * Record the string passed to this function, which in a real implementation
 * would be announced by the screen reader.
 *
 * @param {string} str The string to announce.
 */
MockAccessibilityReader.prototype.assertiveAnnounce = function(str) {
  this.lastStringAnnounced = str;
};

hterm.ScrollPort.Tests = new lib.TestManager.Suite('hterm.ScrollPort.Tests');

hterm.ScrollPort.Tests.prototype.setup = function(cx) {
  this.visibleColumnCount = 80;
  this.visibleRowCount = 25;
  this.totalRowCount = 10000;

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
    assert.equal(topRow, 0);
    assert.equal(this.scrollPort.getBottomRowIndex(topRow),
                 this.visibleRowCount - 1);

    this.scrollPort.scrollRowToBottom(this.totalRowCount);
    topRow = this.scrollPort.getTopRowIndex();
    assert.equal(topRow, this.totalRowCount - this.visibleRowCount);
    assert.equal(this.scrollPort.getBottomRowIndex(topRow),
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
    assert.equal(count, 1);

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
      assert.strictEqual(anchorNode, s.anchorNode);
      assert.strictEqual(focusNode, s.focusNode);
    }

    for (var i = 0; i < this.visibleRowCount; i++) {
      this.scrollPort.scrollRowToTop(50 + i);
      this.scrollPort.redraw_();
      assert.strictEqual(anchorNode, s.anchorNode);
      assert.strictEqual(focusNode, s.focusNode);
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

  assert.strictEqual(anchorNode, s.anchorNode);
  assert.strictEqual(anchorNode, s.focusNode);
  assert.isTrue(s.isCollapsed);

  // When accessibility is enabled, the selection should be preserved after
  // scrolling.
  const mockAccessibilityReader = new MockAccessibilityReader();
  mockAccessibilityReader.accessibilityEnabled = true;
  this.scrollPort.setAccessibilityReader(mockAccessibilityReader);

  for (let i = 0; i < this.visibleRowCount; i++) {
    this.scrollPort.scrollRowToTop(50 - i);
    this.scrollPort.redraw_();
    assert.strictEqual(anchorNode, s.anchorNode);
    assert.strictEqual(anchorNode, s.focusNode);
  }

  for (let i = 0; i < this.visibleRowCount; i++) {
    this.scrollPort.scrollRowToTop(50 + i);
    this.scrollPort.redraw_();
    assert.strictEqual(anchorNode, s.anchorNode);
    assert.strictEqual(anchorNode, s.focusNode);
  }

  // When accessibility isn't enabled, the selection shouldn't be preserved
  // after scrolling.
  mockAccessibilityReader.accessibilityEnabled = false;

  for (let i = 0; i < this.visibleRowCount; i++) {
    this.scrollPort.scrollRowToTop(50 - i);
    this.scrollPort.redraw_();
  }

  for (let i = 0; i < this.visibleRowCount; i++) {
    this.scrollPort.scrollRowToTop(50 + i);
    this.scrollPort.redraw_();
  }

  assert.notStrictEqual(anchorNode, s.anchorNode);
  assert.notStrictEqual(anchorNode, s.focusNode);

  result.pass();
});

/**
 * Test the select-all function.
 */
hterm.ScrollPort.Tests.addTest('select-all', function(result, cx) {
    this.scrollPort.selectAll();
    assert.equal(0, this.scrollPort.selection.startRow.rowIndex);
    assert.equal(this.totalRowCount - 1,
                 this.scrollPort.selection.endRow.rowIndex);
    result.pass();
  });

/**
 * Test that the page up/down buttons are onscreen when selected but offscreen
 * otherwise.
 */
hterm.ScrollPort.Tests.addTest('page-up-down-visible', function(result, cx) {
  const doc = this.scrollPort.getDocument();

  this.scrollPort.allowScrollButtonsToDisplay_ = true;
  const mockAccessibilityReader = new MockAccessibilityReader();
  mockAccessibilityReader.accessibilityEnabled = true;
  this.scrollPort.setAccessibilityReader(mockAccessibilityReader);

  const selection = doc.getSelection();

  const pageUp = doc.getElementById('hterm:a11y:page-up');
  assert.isAtMost(pageUp.getBoundingClientRect().bottom, 0);

  selection.removeAllRanges();
  let range = document.createRange();
  range.selectNodeContents(pageUp.firstChild);
  selection.addRange(range);
  doc.dispatchEvent(new Event('selectionchange'));

  assert.isAtLeast(pageUp.getBoundingClientRect().top, 0);

  const pageDown = doc.getElementById('hterm:a11y:page-down');
  assert.isAtLeast(pageDown.getBoundingClientRect().top,
                   this.scrollPort.getScreenHeight());

  selection.removeAllRanges();
  range = document.createRange();
  range.selectNodeContents(pageDown.firstChild);
  selection.addRange(range);
  doc.dispatchEvent(new Event('selectionchange'));

  assert.isAtMost(pageDown.getBoundingClientRect().bottom,
                  this.scrollPort.getScreenHeight());

  result.pass();
});

/**
 * Test that the page up/down buttons aren't moved onscreen when accessibility
 * isn't enabled.
 *
 */
hterm.ScrollPort.Tests.addTest('page-up-down-hidden', function(result, cx) {
  const doc = this.scrollPort.getDocument();

  this.scrollPort.allowScrollButtonsToDisplay_ = true;
  const mockAccessibilityReader = new MockAccessibilityReader();
  mockAccessibilityReader.accessibilityEnabled = false;
  this.scrollPort.setAccessibilityReader(mockAccessibilityReader);

  const selection = doc.getSelection();

  const pageUp = doc.getElementById('hterm:a11y:page-up');
  assert.isAtMost(pageUp.getBoundingClientRect().bottom, 0);

  selection.removeAllRanges();
  let range = document.createRange();
  range.selectNodeContents(pageUp.firstChild);
  selection.addRange(range);
  doc.dispatchEvent(new Event('selectionchange'));

  assert.isAtMost(pageUp.getBoundingClientRect().bottom, 0);

  const pageDown = doc.getElementById('hterm:a11y:page-down');
  assert.isAtLeast(pageDown.getBoundingClientRect().top,
                   this.scrollPort.getScreenHeight());

  selection.removeAllRanges();
  range = document.createRange();
  range.selectNodeContents(pageDown.firstChild);
  selection.addRange(range);
  doc.dispatchEvent(new Event('selectionchange'));

  assert.isAtLeast(pageDown.getBoundingClientRect().top,
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
  assert.equal(this.scrollPort.getTopRowIndex(), topRow);

  const pageDown = doc.getElementById('hterm:a11y:page-down');
  pageDown.dispatchEvent(new Event('click'));
  assert.equal(this.scrollPort.getTopRowIndex(), topRow + 24);

  const pageUp = doc.getElementById('hterm:a11y:page-up');
  pageUp.dispatchEvent(new Event('click'));
  assert.equal(this.scrollPort.getTopRowIndex(), topRow);

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
  assert.equal(pageUp.getAttribute('aria-disabled'), 'true');
  assert.equal(pageDown.getAttribute('aria-disabled'), 'false');

  this.scrollPort.scrollRowToTop(50);
  this.scrollPort.redraw_();
  assert.equal(pageUp.getAttribute('aria-disabled'), 'false');
  assert.equal(pageDown.getAttribute('aria-disabled'), 'false');

  this.scrollPort.scrollRowToTop(10000);
  this.scrollPort.redraw_();
  assert.equal(pageUp.getAttribute('aria-disabled'), 'false');
  assert.equal(pageDown.getAttribute('aria-disabled'), 'true');

  result.pass();
});

/**
 * Test that paging up/down causes the screen contents to be announced
 * correctly.
 */
hterm.ScrollPort.Tests.addTest('page-up-down-announce', function(result, cx) {
  const doc = this.scrollPort.getDocument();

  this.scrollPort.scrollRowToTop(0);
  const mockAccessibilityReader = new MockAccessibilityReader();
  this.scrollPort.setAccessibilityReader(mockAccessibilityReader);

  const pageDown = doc.getElementById('hterm:a11y:page-down');
  pageDown.dispatchEvent(new Event('click'));
  assert.equal(
      mockAccessibilityReader.lastStringAnnounced,
      '0% scrolled,\n' +
      'This is line 24 red green yellow blue magenta cyan\n' +
      'This is line 25 red green yellow blue magenta cyan\n' +
      'This is line 26 red green yellow blue magenta cyan\n' +
      'This is line 27 red green yellow blue magenta cyan\n' +
      'This is line 28 red green yellow blue magenta cyan\n' +
      'This is line 29 red green yellow blue magenta cyan\n' +
      'This is line 30 red green yellow blue magenta cyan\n' +
      'This is line 31 red green yellow blue magenta cyan\n' +
      'This is line 32 red green yellow blue magenta cyan\n' +
      'This is line 33 red green yellow blue magenta cyan\n' +
      'This is line 34 red green yellow blue magenta cyan\n' +
      'This is line 35 red green yellow blue magenta cyan\n' +
      'This is line 36 red green yellow blue magenta cyan\n' +
      'This is line 37 red green yellow blue magenta cyan\n' +
      'This is line 38 red green yellow blue magenta cyan\n' +
      'This is line 39 red green yellow blue magenta cyan\n' +
      'This is line 40 red green yellow blue magenta cyan\n' +
      'This is line 41 red green yellow blue magenta cyan\n' +
      'This is line 42 red green yellow blue magenta cyan\n' +
      'This is line 43 red green yellow blue magenta cyan\n' +
      'This is line 44 red green yellow blue magenta cyan\n' +
      'This is line 45 red green yellow blue magenta cyan\n' +
      'This is line 46 red green yellow blue magenta cyan\n' +
      'This is line 47 red green yellow blue magenta cyan\n' +
      'This is line 48 red green yellow blue magenta cyan\n');

  const pageUp = doc.getElementById('hterm:a11y:page-up');
  pageUp.dispatchEvent(new Event('click'));
  const linesOneToTwentyFive = '0% scrolled,\n' +
      'This is line 0 red green yellow blue magenta cyan\n' +
      'This is line 1 red green yellow blue magenta cyan\n' +
      'This is line 2 red green yellow blue magenta cyan\n' +
      'This is line 3 red green yellow blue magenta cyan\n' +
      'This is line 4 red green yellow blue magenta cyan\n' +
      'This is line 5 red green yellow blue magenta cyan\n' +
      'This is line 6 red green yellow blue magenta cyan\n' +
      'This is line 7 red green yellow blue magenta cyan\n' +
      'This is line 8 red green yellow blue magenta cyan\n' +
      'This is line 9 red green yellow blue magenta cyan\n' +
      'This is line 10 red green yellow blue magenta cyan\n' +
      'This is line 11 red green yellow blue magenta cyan\n' +
      'This is line 12 red green yellow blue magenta cyan\n' +
      'This is line 13 red green yellow blue magenta cyan\n' +
      'This is line 14 red green yellow blue magenta cyan\n' +
      'This is line 15 red green yellow blue magenta cyan\n' +
      'This is line 16 red green yellow blue magenta cyan\n' +
      'This is line 17 red green yellow blue magenta cyan\n' +
      'This is line 18 red green yellow blue magenta cyan\n' +
      'This is line 19 red green yellow blue magenta cyan\n' +
      'This is line 20 red green yellow blue magenta cyan\n' +
      'This is line 21 red green yellow blue magenta cyan\n' +
      'This is line 22 red green yellow blue magenta cyan\n' +
      'This is line 23 red green yellow blue magenta cyan\n' +
      'This is line 24 red green yellow blue magenta cyan\n'
  assert.equal(mockAccessibilityReader.lastStringAnnounced,
               linesOneToTwentyFive);

  // Test that other forms of scrolling won't cause announcements.
  this.scrollPort.scrollRowToTop(2000);
  assert.equal(mockAccessibilityReader.lastStringAnnounced,
               linesOneToTwentyFive);

  // Ensure the percentage is computed correctly.
  pageDown.dispatchEvent(new Event('click'));
  assert.equal(
      mockAccessibilityReader.lastStringAnnounced,
      '20% scrolled,\n' +
      'This is line 2024 red green yellow blue magenta cyan\n' +
      'This is line 2025 red green yellow blue magenta cyan\n' +
      'This is line 2026 red green yellow blue magenta cyan\n' +
      'This is line 2027 red green yellow blue magenta cyan\n' +
      'This is line 2028 red green yellow blue magenta cyan\n' +
      'This is line 2029 red green yellow blue magenta cyan\n' +
      'This is line 2030 red green yellow blue magenta cyan\n' +
      'This is line 2031 red green yellow blue magenta cyan\n' +
      'This is line 2032 red green yellow blue magenta cyan\n' +
      'This is line 2033 red green yellow blue magenta cyan\n' +
      'This is line 2034 red green yellow blue magenta cyan\n' +
      'This is line 2035 red green yellow blue magenta cyan\n' +
      'This is line 2036 red green yellow blue magenta cyan\n' +
      'This is line 2037 red green yellow blue magenta cyan\n' +
      'This is line 2038 red green yellow blue magenta cyan\n' +
      'This is line 2039 red green yellow blue magenta cyan\n' +
      'This is line 2040 red green yellow blue magenta cyan\n' +
      'This is line 2041 red green yellow blue magenta cyan\n' +
      'This is line 2042 red green yellow blue magenta cyan\n' +
      'This is line 2043 red green yellow blue magenta cyan\n' +
      'This is line 2044 red green yellow blue magenta cyan\n' +
      'This is line 2045 red green yellow blue magenta cyan\n' +
      'This is line 2046 red green yellow blue magenta cyan\n' +
      'This is line 2047 red green yellow blue magenta cyan\n' +
      'This is line 2048 red green yellow blue magenta cyan\n');

  result.pass();
});

/**
 * Test that paging up/down when at the top/bottom of the screen doesn't trigger
 * any announcement.
 */
hterm.ScrollPort.Tests.addTest(
    'page-up-down-dont-announce', function(result, cx) {
  const doc = this.scrollPort.getDocument();

  this.scrollPort.scrollRowToTop(0);
  const mockAccessibilityReader = new MockAccessibilityReader();
  this.scrollPort.setAccessibilityReader(mockAccessibilityReader);

  const pageUp = doc.getElementById('hterm:a11y:page-up');
  pageUp.dispatchEvent(new Event('click'));
  assert.equal(mockAccessibilityReader.lastStringAnnounced, '');

  this.scrollPort.scrollRowToTop(10000);
  const pageDown = doc.getElementById('hterm:a11y:page-down');
  pageDown.dispatchEvent(new Event('click'));
  assert.equal(mockAccessibilityReader.lastStringAnnounced, '');

  result.pass();
});

/**
 * Make sure that offscreen elements are marked aria-hidden.
 */
hterm.ScrollPort.Tests.addTest('scroll-selection-hidden', function(result, cx) {
  const doc = this.scrollPort.getDocument();

  const s = doc.getSelection();
  // IE does not supposed the extend method on selections.  They support
  // an approximation using addRange, but it automatically merges sibling
  // ranges and selects the parent node.  Ignore this test on IE for now.
  if (!s.extend) {
    result.pass();
    return;
  }

  // Scroll into a part of the buffer that can be scrolled off the top
  // and the bottom of the screen.
  this.scrollPort.scrollRowToTop(1000);

  // Force a synchronous redraw.  We'll need to DOM to be correct in order
  // to alter the selection.
  this.scrollPort.redraw_();

  // And select some text in the middle of the visible range.
  const anchorRow = this.rowProvider.getRowNode(1003);
  let anchorNode = anchorRow;
  while (anchorNode.firstChild)
    anchorNode = anchorNode.firstChild;
  s.collapse(anchorNode, 0);

  const focusRow = this.rowProvider.getRowNode(1004);
  let focusNode = focusRow;
  while (focusNode.lastChild)
    focusNode = focusNode.lastChild;
  s.extend(focusNode, focusNode.length || 0);

  assert.isNull(anchorRow.getAttribute('aria-hidden'));
  assert.isNull(focusRow.getAttribute('aria-hidden'));

  this.scrollPort.scrollRowToTop(0);
  this.scrollPort.redraw_();

  assert.equal(anchorRow.getAttribute('aria-hidden'), 'true');
  assert.equal(focusRow.getAttribute('aria-hidden'), 'true');

  this.scrollPort.scrollRowToTop(1000);
  this.scrollPort.redraw_();

  assert.isNull(anchorRow.getAttribute('aria-hidden'));
  assert.isNull(focusRow.getAttribute('aria-hidden'));

  this.scrollPort.scrollRowToTop(2000);
  this.scrollPort.redraw_();

  assert.equal(anchorRow.getAttribute('aria-hidden'), 'true');
  assert.equal(focusRow.getAttribute('aria-hidden'), 'true');

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

    assert.isAbove(divSize.height, 0);
    assert.isAbove(divSize.width, 0);
    assert.equal(divSize.height,
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
    assert.equal('plain', e.text);
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
    assert.equal('plain', e.text);
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
    assert.equal('html', e.text);
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
    assert.equal('plain', e.text);
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
    assert.equal('plain', e.text);
    result.pass();
  });
  this.scrollPort.onDragAndDrop_(e);

  result.requestTime(200);
});

/**
 * Verify paste doesn't happen if it's disabled.
 */
hterm.ScrollPort.DragAndDropTests.addTest('drag-drop-disabled', function(result, cx) {
  const e = new MockDragEvent();
  this.scrollPort.subscribe('paste', assert.fail);

  this.scrollPort.setPasteOnDrop(false);

  e.dataTransfer.setData('text/plain', 'plain');
  this.scrollPort.onDragAndDrop_(e);

  result.requestTime(1000);
  setTimeout(() => result.pass(), 100);
});

/**
 * Verify bad sources don't trigger paste events.
 */
hterm.ScrollPort.DragAndDropTests.addTest('drag-drop-unusable', function(result, cx) {
  const e = new MockDragEvent();
  this.scrollPort.subscribe('paste', assert.fail);

  // Binary only data shouldn't trigger an event.
  e.dataTransfer.setData('application/x-executable', 'plain');
  this.scrollPort.onDragAndDrop_(e);

  // Neither should empty text.
  e.dataTransfer.setData('text/plain', '');
  this.scrollPort.onDragAndDrop_(e);

  result.requestTime(1000);
  setTimeout(() => result.pass(), 100);
});
