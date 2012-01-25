// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview Unit tests for the hterm.Screen class.
 */
hterm.Screen.Tests = new TestManager.Suite('hterm.Screen.Tests');

/**
 * Clear out the current document and create a new hterm.Screen object for
 * testing.
 *
 * Called before each test case in this suite.
 */
hterm.Screen.Tests.prototype.preamble = function(result, cx) {
  cx.window.document.body.innerHTML = '';
  cx.window.screen = this.screen = new hterm.Screen();
  cx.window.screen.setColumnCount(80);
};

/**
 * Test the push and pop functionality of the hterm.Screen.
 */
hterm.Screen.Tests.addTest('push-pop', function(result, cx) {
    // Push one at a time.
    var ary = [];
    for (var i = 0; i < 10; i++) {
      ary[i] = document.createElement('div');
      ary[i].textContent = i;
      this.screen.pushRow(ary[i]);
    }

    result.assertEQ(ary.length, this.screen.getHeight());

    // Pop one at a time.
    for (var i = ary.length - 1; i >= 0; i--) {
      result.assertEQ(ary[i], this.screen.popRow(), 'i:' + i);
    }

    // Bulk push.
    this.screen.pushRows(ary);
    result.assertEQ(ary.length, this.screen.rowsArray.length);

    // Bulk pop.
    var popary = this.screen.popRows(ary.length);

    result.assertEQ(ary.length, popary.length);

    for (var i = ary.length - 1; i >= 0; i--) {
      result.assertEQ(ary[i], popary[i], 'i:' + i);
    }

    // Reset, then partial bulk pop.
    this.screen.pushRows(ary);
    result.assertEQ(ary.length, this.screen.rowsArray.length);

    var popary = this.screen.popRows(5);
    for (var i = 0; i < 5; i++) {
      result.assertEQ(ary[i + 5], popary[i], 'i:' + i);
    }

    result.pass();
  });

/**
 * Test the unshift and shift functionality of the hterm.Screen.
 */
hterm.Screen.Tests.addTest('unshift-shift', function(result, cx) {
    // Unshift one at a time.
    var ary = [];
    for (var i = 0; i < 10; i++) {
      ary[i] = document.createElement('div');
      ary[i].textContent = i;
      this.screen.unshiftRow(ary[i]);
    }

    result.assertEQ(ary.length, this.screen.rowsArray.length);

    // Shift one at a time.
    for (var i = ary.length - 1; i >= 0; i--) {
      result.assertEQ(ary[i], this.screen.shiftRow(), 'i:' + i);
    }

    // Bulk unshift.
    this.screen.unshiftRows(ary);
    result.assertEQ(ary.length, this.screen.rowsArray.length);

    // Bulk shift.
    var shiftary = this.screen.shiftRows(ary.length);

    result.assertEQ(ary.length, shiftary.length);

    for (var i = ary.length - 1; i >= 0; i--) {
      result.assertEQ(ary[i], shiftary[i], 'i:' + i);
    }

    // Reset, then partial bulk shift.
    this.screen.unshiftRows(ary);
    result.assertEQ(ary.length, this.screen.rowsArray.length);

    var shiftary = this.screen.shiftRows(5);
    for (var i = 0; i < 5; i++) {
      result.assertEQ(ary[i], shiftary[i], 'i:' + i);
    }

    result.pass();
  });

/**
 * Test cursor positioning functionality.
 */
hterm.Screen.Tests.addTest('cursor-movement', function(result, cx) {
    var ary = [];

    for (var i = 0; i < 3; i++) {
      ary[i] = document.createElement('div');
      ary[i].textContent = i;
      this.screen.pushRow(ary[i]);
    }

    this.screen.setCursorPosition(0, 0);
    result.assertEQ(this.screen.cursorRowNode_, ary[0]);
    result.assertEQ(this.screen.cursorNode_, ary[0].firstChild);
    result.assertEQ(this.screen.cursorOffset_, 0);

    this.screen.setCursorPosition(1, 0);
    result.assertEQ(this.screen.cursorRowNode_, ary[1]);
    result.assertEQ(this.screen.cursorNode_, ary[1].firstChild);
    result.assertEQ(this.screen.cursorOffset_, 0);

    this.screen.setCursorPosition(1, 10);
    result.assertEQ(this.screen.cursorRowNode_, ary[1]);
    result.assertEQ(this.screen.cursorNode_, ary[1].firstChild);
    result.assertEQ(this.screen.cursorOffset_, 10);

    this.screen.setCursorPosition(1, 5);
    result.assertEQ(this.screen.cursorRowNode_, ary[1]);
    result.assertEQ(this.screen.cursorNode_, ary[1].firstChild);
    result.assertEQ(this.screen.cursorOffset_, 5);

    this.screen.setCursorPosition(1, 10);
    result.assertEQ(this.screen.cursorRowNode_, ary[1]);
    result.assertEQ(this.screen.cursorNode_, ary[1].firstChild);
    result.assertEQ(this.screen.cursorOffset_, 10);

    ary[2].innerHTML = '01<div>23</div>45<div>67</div>89';

    this.screen.setCursorPosition(2, 0);
    result.assertEQ(this.screen.cursorRowNode_, ary[2]);
    result.assertEQ(this.screen.cursorNode_, ary[2].firstChild);
    result.assertEQ(this.screen.cursorOffset_, 0);

    this.screen.setCursorPosition(2, 1);
    result.assertEQ(this.screen.cursorRowNode_, ary[2]);
    result.assertEQ(this.screen.cursorNode_, ary[2].firstChild);
    result.assertEQ(this.screen.cursorOffset_, 1);

    this.screen.setCursorPosition(2, 2);
    result.assertEQ(this.screen.cursorRowNode_, ary[2]);
    result.assertEQ(this.screen.cursorNode_, ary[2].childNodes[1]);
    result.assertEQ(this.screen.cursorOffset_, 0);

    this.screen.setCursorPosition(2, 3);
    result.assertEQ(this.screen.cursorRowNode_, ary[2]);
    result.assertEQ(this.screen.cursorNode_, ary[2].childNodes[1]);
    result.assertEQ(this.screen.cursorOffset_, 1);

    this.screen.setCursorPosition(2, 4);
    result.assertEQ(this.screen.cursorRowNode_, ary[2]);
    result.assertEQ(this.screen.cursorNode_, ary[2].childNodes[2]);
    result.assertEQ(this.screen.cursorOffset_, 0);

    this.screen.setCursorPosition(2, 5);
    result.assertEQ(this.screen.cursorRowNode_, ary[2]);
    result.assertEQ(this.screen.cursorNode_, ary[2].childNodes[2]);
    result.assertEQ(this.screen.cursorOffset_, 1);

    this.screen.setCursorPosition(2, 6);
    result.assertEQ(this.screen.cursorRowNode_, ary[2]);
    result.assertEQ(this.screen.cursorNode_, ary[2].childNodes[3]);
    result.assertEQ(this.screen.cursorOffset_, 0);

    this.screen.setCursorPosition(2, 7);
    result.assertEQ(this.screen.cursorRowNode_, ary[2]);
    result.assertEQ(this.screen.cursorNode_, ary[2].childNodes[3]);
    result.assertEQ(this.screen.cursorOffset_, 1);

    this.screen.setCursorPosition(2, 8);
    result.assertEQ(this.screen.cursorRowNode_, ary[2]);
    result.assertEQ(this.screen.cursorNode_, ary[2].childNodes[4]);
    result.assertEQ(this.screen.cursorOffset_, 0);

    this.screen.setCursorPosition(2, 9);
    result.assertEQ(this.screen.cursorRowNode_, ary[2]);
    result.assertEQ(this.screen.cursorNode_, ary[2].childNodes[4]);
    result.assertEQ(this.screen.cursorOffset_, 1);

    this.screen.setCursorPosition(2, 18);
    result.assertEQ(this.screen.cursorRowNode_, ary[2]);
    result.assertEQ(this.screen.cursorNode_, ary[2].childNodes[4]);
    result.assertEQ(this.screen.cursorOffset_, 10);

    result.pass();
  });

/**
 * Test character removal.
 */
hterm.Screen.Tests.addTest('delete-chars', function(result, cx) {
    var row = document.createElement('div');
    row.innerHTML = 'hello<div id="1"> </div><div id="2">world</div>';
    this.screen.pushRow(row);

    this.screen.setCursorPosition(0, 3);
    this.screen.deleteChars(5);

    result.assertEQ(row.innerHTML, 'hel<div id="2">rld</div>');
    result.pass();
  });

/**
 * Test the ability to insert text in a line.
 */
hterm.Screen.Tests.addTest('insert', function(result, cx) {
    // Sample rows.  Row 0 is a simple, empty row.  Row 1 simulates rows with
    // mixed text attributes.
    var ary = [document.createElement('div'), document.createElement('div')];
    ary[1].innerHTML = 'hello<div id="1"> </div><div id="2">world</div>';
    this.screen.pushRows(ary);

    // Basic insert.
    this.screen.setCursorPosition(0, 0);
    this.screen.insertString('XXXXX');
    result.assertEQ(ary[0].innerHTML, 'XXXXX');

    // Test that positioning the cursor beyond the end of the current text does
    // not cause spaces to be printed.
    this.screen.clearCursorRow();
    this.screen.setCursorPosition(0, 3);
    result.assertEQ(ary[0].innerHTML, '');

    // Print some text at this cursor position and make sure the spaces show up.
    this.screen.insertString('XXXXX');
    result.assertEQ(ary[0].innerHTML, '   XXXXX');

    // Fetch enough whitespace to ensure that the row is full.
    var ws = hterm.getWhitespace(this.screen.getWidth());

    // Check simple overflow.
    this.screen.clearCursorRow();
    this.screen.insertString('XXXX');
    this.screen.setCursorPosition(0, 0);
    this.screen.insertString(ws);
    var overflow = this.screen.maybeClipCurrentRow();
    result.assertEQ(overflow.length, 1);
    result.assertEQ(overflow[0].nodeType, 3);
    result.assertEQ(overflow[0].textContent, 'XXXX');

    // Insert into a more complicated row.
    this.screen.setCursorPosition(1, 3);
    this.screen.insertString('XXXXX');
    result.assertEQ(ary[1].innerHTML, 'helXXXXXlo<div id="1"> </div>' +
                    '<div id="2">world</div>');

    // Check multi-attribute overflow.
    this.screen.setCursorPosition(1, 0);
    this.screen.insertString(ws);
    overflow = this.screen.maybeClipCurrentRow();
    result.assert(overflow instanceof Array);
    result.assertEQ(overflow.length, 3);
    result.assertEQ(overflow[0].nodeType, 3);
    result.assertEQ(overflow[0].textContent, "helXXXXXlo");
    result.assertEQ(overflow[1].tagName, 'DIV');
    result.assertEQ(overflow[1].textContent, " ");
    result.assertEQ(overflow[2].tagName, 'DIV');
    result.assertEQ(overflow[2].textContent, "world");

    result.pass();
  });

/**
 * Test the ability to overwrite test.
 */
hterm.Screen.Tests.addTest('overwrite', function(result, cx) {
    var ary = [];
    ary[0] = document.createElement('div');
    ary[0].innerHTML = 'hello<div id="1"> </div><div id="2">world</div>';
    ary[1] = document.createElement('div');
    this.screen.pushRows(ary);

    this.screen.setCursorPosition(0, 3);
    this.screen.overwriteString('XXXXX');

    result.assertEQ(ary[0].innerHTML, 'helXXXXX<div id="2">rld</div>');

    this.screen.setCursorPosition(1, 0);
    this.screen.overwriteString('XXXXX');

    result.assertEQ(ary[1].innerHTML, 'XXXXX');

    result.pass();
  });
