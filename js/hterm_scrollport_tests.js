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

    // Scroll into a part of the buffer that can be scrolled off the top
    // and the bottom of the screen.
    this.scrollPort.scrollRowToTop(50);

    // Force a synchronous redraw.  We'll need to DOM to be correct in order
    // to alter the selection.
    this.scrollPort.redraw_();

    // And select some text in the middle of the visible range.
    var s = doc.getSelection();

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
