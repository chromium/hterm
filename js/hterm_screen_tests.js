// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('lib.f');

/**
 * @fileoverview Unit tests for the hterm.Screen class.
 */
hterm.Screen.Tests = new lib.TestManager.Suite('hterm.Screen.Tests');

/**
 * Clear out the current document and create a new hterm.Screen object for
 * testing.
 *
 * Called before each test case in this suite.
 */
hterm.Screen.Tests.prototype.preamble = function(result, cx) {
  cx.window.document.body.innerHTML = '';
  this.screen = new hterm.Screen();
  this.screen.setColumnCount(80);
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

    var createWidecharNode = function(c) {
      var span = document.createElement('span');
      span.textContent = c;
      span.className = 'wc-node';
      span.wcNode = true;
      span.asciiNode = false;
      return span;
    };

    var wc_row = document.createElement('div');
    wc_row.appendChild(createWidecharNode('\u4E2D'));
    wc_row.appendChild(createWidecharNode('\u6587'));
    wc_row.appendChild(createWidecharNode('\u5B57'));
    wc_row.appendChild(createWidecharNode('\u4E32'));
    this.screen.pushRow(wc_row);

    this.screen.setCursorPosition(1, 2);
    this.screen.deleteChars(2);

    result.assertEQ(wc_row.innerHTML, '<span class="wc-node">\u4E2D</span>' +
                    '<span class="wc-node">\u5B57</span>' +
                    '<span class="wc-node">\u4E32</span>');

    this.screen.setCursorPosition(1, 0);
    this.screen.deleteChars(6);

    result.assertEQ(wc_row.innerHTML, '');

    result.pass();
  });

/**
 * Test the ability to insert text in a line.
 */
hterm.Screen.Tests.addTest('insert', function(result, cx) {
    // Sample rows.  Row 0 is a simple, empty row.  Row 1 simulates rows with
    // mixed text attributes.
    var ary = [document.createElement('div'), document.createElement('div'),
               document.createElement('div')];
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
    var ws = lib.f.getWhitespace(this.screen.getWidth());

    // Check text clipping and cursor clamping.
    this.screen.clearCursorRow();
    this.screen.insertString('XXXX');
    this.screen.setCursorPosition(0, 2);
    this.screen.insertString(ws);
    this.screen.maybeClipCurrentRow();
    result.assertEQ(ary[0].innerHTML, 'XX' + ws.substr(2));
    result.assertEQ(this.screen.cursorPosition.column, 79);

    // Insert into a more complicated row.
    this.screen.setCursorPosition(1, 3);
    this.screen.insertString('XXXXX');
    result.assertEQ(ary[1].innerHTML, 'helXXXXXlo<div id="1"> </div>' +
                    '<div id="2">world</div>');

    // Test inserting widechar string.
    var wideCharString = '\u4E2D\u6587\u5B57\u4E32';
    this.screen.setCursorPosition(2, 0);
    this.screen.textAttributes.wcNode = true;
    this.screen.textAttributes.asciiNode = false;
    for (var i = 0; i < wideCharString.length; i++) {
      this.screen.insertString(wideCharString.charAt(i));
    }
    this.screen.textAttributes.wcNode = false;
    this.screen.textAttributes.asciiNode = true;
    result.assertEQ(ary[2].innerHTML, '<span class="wc-node">\u4E2D</span>' +
                    '<span class="wc-node">\u6587</span>' +
                    '<span class="wc-node">\u5B57</span>' +
                    '<span class="wc-node">\u4E32</span>');

    this.screen.clearCursorRow();
    this.screen.setCursorPosition(2, 3);
    this.screen.textAttributes.wcNode = true;
    this.screen.textAttributes.asciiNode = false;
    for (var i = 0; i < wideCharString.length; i++) {
      this.screen.insertString(wideCharString.charAt(i));
    }
    this.screen.textAttributes.wcNode = false;
    this.screen.textAttributes.asciiNode = true;
    result.assertEQ(ary[2].innerHTML, '   <span class="wc-node">\u4E2D</span>' +
                    '<span class="wc-node">\u6587</span>' +
                    '<span class="wc-node">\u5B57</span>' +
                    '<span class="wc-node">\u4E32</span>');

    this.screen.setCursorPosition(2, 7);
    this.screen.insertString('XXXXX');
    result.assertEQ(ary[2].innerHTML, '   <span class="wc-node">\u4E2D</span>' +
                    '<span class="wc-node">\u6587</span>' + 'XXXXX' +
                    '<span class="wc-node">\u5B57</span>' +
                    '<span class="wc-node">\u4E32</span>');

    this.screen.clearCursorRow();
    this.screen.insertString('XXXXX');
    this.screen.setCursorPosition(2, 3);
    this.screen.textAttributes.wcNode = true;
    this.screen.textAttributes.asciiNode = false;
    for (var i = 0; i < wideCharString.length; i++) {
      this.screen.insertString(wideCharString.charAt(i));
    }
    this.screen.textAttributes.wcNode = false;
    this.screen.textAttributes.asciiNode = true;
    result.assertEQ(ary[2].innerHTML, 'XXX<span class="wc-node">\u4E2D</span>' +
                    '<span class="wc-node">\u6587</span>' +
                    '<span class="wc-node">\u5B57</span>' +
                    '<span class="wc-node">\u4E32</span>XX');

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
    ary[2] = document.createElement('div');
    this.screen.pushRows(ary);

    this.screen.setCursorPosition(0, 3);
    this.screen.overwriteString('XXXXX');

    result.assertEQ(ary[0].innerHTML, 'helXXXXX<div id="2">rld</div>');

    this.screen.setCursorPosition(1, 0);
    this.screen.overwriteString('XXXXX');

    result.assertEQ(ary[1].innerHTML, 'XXXXX');

    // Test overwriting widechar string.
    var wideCharString = '\u4E2D\u6587\u5B57\u4E32';
    this.screen.setCursorPosition(2, 0);
    this.screen.textAttributes.wcNode = true;
    this.screen.textAttributes.asciiNode = false;
    for (var i = 0; i < wideCharString.length; i++) {
      this.screen.overwriteString(wideCharString.charAt(i));
    }
    this.screen.textAttributes.wcNode = false;
    this.screen.textAttributes.asciiNode = true;
    result.assertEQ(ary[2].innerHTML, '<span class="wc-node">\u4E2D</span>' +
                    '<span class="wc-node">\u6587</span>' +
                    '<span class="wc-node">\u5B57</span>' +
                    '<span class="wc-node">\u4E32</span>');

    this.screen.clearCursorRow();
    this.screen.insertString('XXXXX');
    this.screen.setCursorPosition(2, 3);
    this.screen.textAttributes.wcNode = true;
    this.screen.textAttributes.asciiNode = false;
    for (var i = 0; i < wideCharString.length; i++) {
      this.screen.overwriteString(wideCharString.charAt(i));
    }
    this.screen.textAttributes.wcNode = false;
    this.screen.textAttributes.asciiNode = true;
    result.assertEQ(ary[2].innerHTML, 'XXX<span class="wc-node">\u4E2D</span>' +
                    '<span class="wc-node">\u6587</span>' +
                    '<span class="wc-node">\u5B57</span>' +
                    '<span class="wc-node">\u4E32</span>');

    this.screen.setCursorPosition(2, 7);
    this.screen.overwriteString('OO');
    result.assertEQ(ary[2].innerHTML, 'XXX<span class="wc-node">\u4E2D</span>' +
                    '<span class="wc-node">\u6587</span>' + 'OO' +
                    '<span class="wc-node">\u4E32</span>');

    this.screen.clearCursorRow();
    this.screen.textAttributes.wcNode = true;
    this.screen.textAttributes.asciiNode = false;
    for (var i = 0; i < wideCharString.length; i++) {
      this.screen.insertString(wideCharString.charAt(i));
    }
    this.screen.textAttributes.wcNode = false;
    this.screen.textAttributes.asciiNode = true;
    this.screen.setCursorPosition(2, 4);
    this.screen.textAttributes.wcNode = true;
    this.screen.textAttributes.asciiNode = false;
    for (var i = 0; i < wideCharString.length; i++) {
      this.screen.overwriteString(wideCharString.charAt(i));
    }
    this.screen.textAttributes.wcNode = false;
    this.screen.textAttributes.asciiNode = true;
    result.assertEQ(ary[2].innerHTML, '<span class="wc-node">\u4E2D</span>' +
                    '<span class="wc-node">\u6587</span>' +
                    '<span class="wc-node">\u4E2D</span>' +
                    '<span class="wc-node">\u6587</span>' +
                    '<span class="wc-node">\u5B57</span>' +
                    '<span class="wc-node">\u4E32</span>');

    this.screen.clearCursorRow();
    this.screen.textAttributes.wcNode = true;
    this.screen.textAttributes.asciiNode = false;
    for (var i = 0; i < wideCharString.length; i++) {
      this.screen.insertString(wideCharString.charAt(i));
    }
    this.screen.textAttributes.wcNode = false;
    this.screen.textAttributes.asciiNode = true;
    this.screen.setCursorPosition(2, 0);
    this.screen.overwriteString('    ');
    result.assertEQ(ary[2].innerHTML, '    ' +
                    '<span class="wc-node">\u5B57</span>' +
                    '<span class="wc-node">\u4E32</span>');

    result.pass();
  });
