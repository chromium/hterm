// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview Unit tests for the hterm.Screen class.
 */

describe('hterm_screen_tests.js', () => {

/**
 * Clear out the current document and create a new hterm.Screen object for
 * testing.
 *
 * Called before each test case in this suite.
 */
beforeEach(function() {
  this.screen = new hterm.Screen();
  this.screen.setColumnCount(80);
});

/**
 * Test the push and pop functionality of the hterm.Screen.
 */
it('push-pop', function() {
    // Push one at a time.
    var ary = [];
    for (var i = 0; i < 10; i++) {
      ary[i] = document.createElement('div');
      ary[i].textContent = i;
      this.screen.pushRow(ary[i]);
    }

    assert.equal(ary.length, this.screen.getHeight());

    // Pop one at a time.
    for (var i = ary.length - 1; i >= 0; i--) {
      assert.equal(ary[i], this.screen.popRow(), 'i:' + i);
    }

    // Bulk push.
    this.screen.pushRows(ary);
    assert.equal(ary.length, this.screen.rowsArray.length);

    // Bulk pop.
    var popary = this.screen.popRows(ary.length);

    assert.equal(ary.length, popary.length);

    for (var i = ary.length - 1; i >= 0; i--) {
      assert.equal(ary[i], popary[i], 'i:' + i);
    }

    // Reset, then partial bulk pop.
    this.screen.pushRows(ary);
    assert.equal(ary.length, this.screen.rowsArray.length);

    popary = this.screen.popRows(5);
    for (var i = 0; i < 5; i++) {
      assert.equal(ary[i + 5], popary[i], 'i:' + i);
    }
  });

/**
 * Test the unshift and shift functionality of the hterm.Screen.
 */
it('unshift-shift', function() {
    // Unshift one at a time.
    var ary = [];
    for (var i = 0; i < 10; i++) {
      ary[i] = document.createElement('div');
      ary[i].textContent = i;
      this.screen.unshiftRow(ary[i]);
    }

    assert.equal(ary.length, this.screen.rowsArray.length);

    // Shift one at a time.
    for (var i = ary.length - 1; i >= 0; i--) {
      assert.equal(ary[i], this.screen.shiftRow(), 'i:' + i);
    }

    // Bulk unshift.
    this.screen.unshiftRows(ary);
    assert.equal(ary.length, this.screen.rowsArray.length);

    // Bulk shift.
    var shiftary = this.screen.shiftRows(ary.length);

    assert.equal(ary.length, shiftary.length);

    for (var i = ary.length - 1; i >= 0; i--) {
      assert.equal(ary[i], shiftary[i], 'i:' + i);
    }

    // Reset, then partial bulk shift.
    this.screen.unshiftRows(ary);
    assert.equal(ary.length, this.screen.rowsArray.length);

    shiftary = this.screen.shiftRows(5);
    for (var i = 0; i < 5; i++) {
      assert.equal(ary[i], shiftary[i], 'i:' + i);
    }
  });

/**
 * Test cursor positioning functionality.
 */
it('cursor-movement', function() {
    var ary = [];

    for (var i = 0; i < 3; i++) {
      ary[i] = document.createElement('div');
      ary[i].textContent = i;
      this.screen.pushRow(ary[i]);
    }

    this.screen.setCursorPosition(0, 0);
    assert.strictEqual(this.screen.cursorRowNode_, ary[0]);
    assert.strictEqual(this.screen.cursorNode_, ary[0].firstChild);
    assert.equal(this.screen.cursorOffset_, 0);

    this.screen.setCursorPosition(1, 0);
    assert.strictEqual(this.screen.cursorRowNode_, ary[1]);
    assert.strictEqual(this.screen.cursorNode_, ary[1].firstChild);
    assert.equal(this.screen.cursorOffset_, 0);

    this.screen.setCursorPosition(1, 10);
    assert.strictEqual(this.screen.cursorRowNode_, ary[1]);
    assert.strictEqual(this.screen.cursorNode_, ary[1].firstChild);
    assert.equal(this.screen.cursorOffset_, 10);

    this.screen.setCursorPosition(1, 5);
    assert.strictEqual(this.screen.cursorRowNode_, ary[1]);
    assert.strictEqual(this.screen.cursorNode_, ary[1].firstChild);
    assert.equal(this.screen.cursorOffset_, 5);

    this.screen.setCursorPosition(1, 10);
    assert.strictEqual(this.screen.cursorRowNode_, ary[1]);
    assert.strictEqual(this.screen.cursorNode_, ary[1].firstChild);
    assert.equal(this.screen.cursorOffset_, 10);

    ary[2].innerHTML = '01<div>23</div>45<div>67</div>89';

    this.screen.setCursorPosition(2, 0);
    assert.strictEqual(this.screen.cursorRowNode_, ary[2]);
    assert.strictEqual(this.screen.cursorNode_, ary[2].firstChild);
    assert.equal(this.screen.cursorOffset_, 0);

    this.screen.setCursorPosition(2, 1);
    assert.strictEqual(this.screen.cursorRowNode_, ary[2]);
    assert.strictEqual(this.screen.cursorNode_, ary[2].firstChild);
    assert.equal(this.screen.cursorOffset_, 1);

    this.screen.setCursorPosition(2, 2);
    assert.strictEqual(this.screen.cursorRowNode_, ary[2]);
    assert.strictEqual(this.screen.cursorNode_, ary[2].childNodes[1]);
    assert.equal(this.screen.cursorOffset_, 0);

    this.screen.setCursorPosition(2, 3);
    assert.strictEqual(this.screen.cursorRowNode_, ary[2]);
    assert.strictEqual(this.screen.cursorNode_, ary[2].childNodes[1]);
    assert.equal(this.screen.cursorOffset_, 1);

    this.screen.setCursorPosition(2, 4);
    assert.strictEqual(this.screen.cursorRowNode_, ary[2]);
    assert.strictEqual(this.screen.cursorNode_, ary[2].childNodes[2]);
    assert.equal(this.screen.cursorOffset_, 0);

    this.screen.setCursorPosition(2, 5);
    assert.strictEqual(this.screen.cursorRowNode_, ary[2]);
    assert.strictEqual(this.screen.cursorNode_, ary[2].childNodes[2]);
    assert.equal(this.screen.cursorOffset_, 1);

    this.screen.setCursorPosition(2, 6);
    assert.strictEqual(this.screen.cursorRowNode_, ary[2]);
    assert.strictEqual(this.screen.cursorNode_, ary[2].childNodes[3]);
    assert.equal(this.screen.cursorOffset_, 0);

    this.screen.setCursorPosition(2, 7);
    assert.strictEqual(this.screen.cursorRowNode_, ary[2]);
    assert.strictEqual(this.screen.cursorNode_, ary[2].childNodes[3]);
    assert.equal(this.screen.cursorOffset_, 1);

    this.screen.setCursorPosition(2, 8);
    assert.strictEqual(this.screen.cursorRowNode_, ary[2]);
    assert.strictEqual(this.screen.cursorNode_, ary[2].childNodes[4]);
    assert.equal(this.screen.cursorOffset_, 0);

    this.screen.setCursorPosition(2, 9);
    assert.strictEqual(this.screen.cursorRowNode_, ary[2]);
    assert.strictEqual(this.screen.cursorNode_, ary[2].childNodes[4]);
    assert.equal(this.screen.cursorOffset_, 1);

    this.screen.setCursorPosition(2, 18);
    assert.strictEqual(this.screen.cursorRowNode_, ary[2]);
    assert.strictEqual(this.screen.cursorNode_, ary[2].childNodes[4]);
    assert.equal(this.screen.cursorOffset_, 10);
  });

/**
 * Test character removal.
 */
it('delete-chars', function() {
    var row = document.createElement('div');
    row.innerHTML = 'hello<div id="1"> </div><div id="2">world</div>';
    this.screen.pushRow(row);

    this.screen.setCursorPosition(0, 3);
    this.screen.deleteChars(5);

    assert.equal(row.innerHTML, 'hel<div id="2">rld</div>');

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

    assert.equal(wc_row.innerHTML,
                 '<span class="wc-node">\u4E2D</span>' +
                 '<span class="wc-node">\u5B57</span>' +
                 '<span class="wc-node">\u4E32</span>');

    this.screen.setCursorPosition(1, 0);
    this.screen.deleteChars(6);

    assert.equal(wc_row.innerHTML, '');
  });

/**
 * Test replacing the start of a wide character with a narrow char.
 * https://crbug.com/577691
 */
it('wide-to-narrow-char-start', function() {
    const row = document.createElement('div');
    this.screen.pushRow(row);

    this.screen.setCursorPosition(0, 0);
    this.screen.overwriteString('abcdef');
    assert.equal('abcdef', row.textContent);

    this.screen.setCursorPosition(0, 2);
    this.screen.textAttributes.wcNode = true;
    this.screen.textAttributes.asciiNode = false;
    this.screen.overwriteString('\u{30c0}');
    this.screen.textAttributes.wcNode = false;
    this.screen.textAttributes.asciiNode = true;
    assert.equal('ab\u{30c0}ef', row.textContent);

    this.screen.setCursorPosition(0, 2);
    this.screen.overwriteString('x');
    assert.equal('abx ef', row.textContent);
  });

/**
 * Test replacing the end of a wide character with a narrow char.
 * https://crbug.com/577691
 */
it('wide-to-narrow-char-end', function() {
    const row = document.createElement('div');
    this.screen.pushRow(row);

    this.screen.setCursorPosition(0, 0);
    this.screen.overwriteString('abcdef');
    assert.equal('abcdef', row.textContent);

    this.screen.setCursorPosition(0, 2);
    this.screen.textAttributes.wcNode = true;
    this.screen.textAttributes.asciiNode = false;
    this.screen.overwriteString('\u{30c0}');
    this.screen.textAttributes.wcNode = false;
    this.screen.textAttributes.asciiNode = true;
    assert.equal('ab\u{30c0}ef', row.textContent);

    this.screen.setCursorPosition(0, 3);
    this.screen.overwriteString('x');
    assert.equal('ab xef', row.textContent);
  });

/**
 * Test the ability to insert text in a line.
 */
it('insert', function() {
    // Sample rows.  Row 0 is a simple, empty row.  Row 1 simulates rows with
    // mixed text attributes.
    var ary = [document.createElement('div'), document.createElement('div'),
               document.createElement('div')];
    ary[1].innerHTML = 'hello<div id="1"> </div><div id="2">world</div>';
    this.screen.pushRows(ary);

    // Basic insert.
    this.screen.setCursorPosition(0, 0);
    this.screen.insertString('XXXXX');
    assert.equal(ary[0].innerHTML, 'XXXXX');

    // Test that positioning the cursor beyond the end of the current text does
    // not cause spaces to be printed.
    this.screen.clearCursorRow();
    this.screen.setCursorPosition(0, 3);
    assert.equal(ary[0].innerHTML, '');

    // Print some text at this cursor position and make sure the spaces show up.
    this.screen.insertString('XXXXX');
    assert.equal(ary[0].innerHTML, '   XXXXX');

    // Fetch enough whitespace to ensure that the row is full.
    const ws = ' '.repeat(this.screen.getWidth());

    // Check text clipping and cursor clamping.
    this.screen.clearCursorRow();
    this.screen.insertString('XXXX');
    this.screen.setCursorPosition(0, 2);
    this.screen.insertString(ws);
    this.screen.maybeClipCurrentRow();
    assert.equal(ary[0].innerHTML, 'XX' + ws.substr(2));
    assert.equal(this.screen.cursorPosition.column, 79);

    // Insert into a more complicated row.
    this.screen.setCursorPosition(1, 3);
    this.screen.insertString('XXXXX');
    assert.equal(ary[1].innerHTML,
                 'helXXXXXlo<div id="1"> </div>' +
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
    assert.equal(ary[2].innerHTML,
                 '<span class="wc-node">\u4E2D</span>' +
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
    assert.equal(ary[2].innerHTML,
                 '   <span class="wc-node">\u4E2D</span>' +
                 '<span class="wc-node">\u6587</span>' +
                 '<span class="wc-node">\u5B57</span>' +
                 '<span class="wc-node">\u4E32</span>');

    this.screen.setCursorPosition(2, 7);
    this.screen.insertString('XXXXX');
    assert.equal(ary[2].innerHTML,
                 '   <span class="wc-node">\u4E2D</span>' +
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
    assert.equal(ary[2].innerHTML,
                 'XXX<span class="wc-node">\u4E2D</span>' +
                 '<span class="wc-node">\u6587</span>' +
                 '<span class="wc-node">\u5B57</span>' +
                 '<span class="wc-node">\u4E32</span>XX');
  });

/**
 * Test the ability to overwrite test.
 */
it('overwrite', function() {
    var ary = [];
    ary[0] = document.createElement('div');
    ary[0].innerHTML = 'hello<div id="1"> </div><div id="2">world</div>';
    ary[1] = document.createElement('div');
    ary[2] = document.createElement('div');
    this.screen.pushRows(ary);

    this.screen.setCursorPosition(0, 3);
    this.screen.overwriteString('XXXXX');

    assert.equal(ary[0].innerHTML, 'helXXXXX<div id="2">rld</div>');

    this.screen.setCursorPosition(1, 0);
    this.screen.overwriteString('XXXXX');

    assert.equal(ary[1].innerHTML, 'XXXXX');

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
    assert.equal(ary[2].innerHTML,
                 '<span class="wc-node">\u4E2D</span>' +
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
    assert.equal(ary[2].innerHTML,
                 'XXX<span class="wc-node">\u4E2D</span>' +
                 '<span class="wc-node">\u6587</span>' +
                 '<span class="wc-node">\u5B57</span>' +
                 '<span class="wc-node">\u4E32</span>');

    this.screen.setCursorPosition(2, 7);
    this.screen.overwriteString('OO');
    assert.equal(ary[2].innerHTML,
                 'XXX<span class="wc-node">\u4E2D</span>' +
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
    assert.equal(ary[2].innerHTML,
                 '<span class="wc-node">\u4E2D</span>' +
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
    assert.equal(ary[2].innerHTML,
                 '    ' +
                 '<span class="wc-node">\u5B57</span>' +
                 '<span class="wc-node">\u4E32</span>');
  });

/**
 * Check whitespace insertion handling.
 */
it('whitespace-fill', function() {
  const ta = this.screen.textAttributes;
  const row = document.createElement('div');
  this.screen.pushRow(row);

  // Plain text everywhere.
  this.screen.setCursorPosition(0, 3);
  this.screen.insertString('hi');
  assert.equal(row.innerHTML, '   hi');
  ta.reset();
  this.screen.clearCursorRow();

  // Insert wide character.
  this.screen.setCursorPosition(0, 3);
  ta.wcNode = true;
  ta.asciiNode = false;
  this.screen.insertString('\u5B57');
  assert.equal(row.innerHTML, '   <span class="wc-node">\u5B57</span>');
  ta.reset();
  this.screen.clearCursorRow();

  // Insert underline text.
  this.screen.setCursorPosition(0, 3);
  ta.underline = 'solid';
  this.screen.insertString('hi');
  assert.equal(row.innerHTML,
               '   <span style="text-decoration-style: solid; text-' +
               'decoration-line: underline;">hi</span>');
  ta.reset();
  this.screen.clearCursorRow();

  // Insert strike-through text.
  this.screen.setCursorPosition(0, 3);
  ta.strikethrough = true;
  this.screen.insertString('hi');
  assert.equal(row.innerHTML,
               '   <span style="text-decoration-line: line-through;">' +
               'hi</span>');
  ta.reset();
  this.screen.clearCursorRow();

  // Insert plain text, but after double underline text.
  this.screen.setCursorPosition(0, 0);
  ta.underline = 'double';
  this.screen.insertString('hi');
  ta.reset();
  this.screen.setCursorPosition(0, 5);
  this.screen.insertString('bye');
  assert.equal(row.innerHTML,
               '<span style="text-decoration-style: double; text-' +
               'decoration-line: underline;">hi</span>   bye');
  ta.reset();
  this.screen.clearCursorRow();

  // Insert plain text, but after strike-through text.
  this.screen.setCursorPosition(0, 0);
  ta.strikethrough = true;
  this.screen.insertString('hi');
  ta.reset();
  this.screen.setCursorPosition(0, 5);
  this.screen.insertString('bye');
  assert.equal(row.innerHTML,
               '<span style="text-decoration-line: line-through;">hi' +
               '</span>   bye');
  ta.reset();
  this.screen.clearCursorRow();

  // Do styled text with gaps between.
  this.screen.setCursorPosition(0, 0);
  this.screen.insertString('start ');
  ta.underline = 'wavy';
  this.screen.insertString('hi');
  this.screen.maybeClipCurrentRow();
  this.screen.setCursorPosition(0, 15);
  this.screen.insertString('bye');
  assert.equal(
      row.innerHTML,
      'start <span style="text-decoration-style: wavy; text-decoration-' +
      'line: underline;">hi</span>       <span style="text-decoration-' +
      'style: wavy; text-decoration-line: underline;">bye</span>');
  ta.reset();
  this.screen.clearCursorRow();
});

/**
 * Test expanding strings when selecting.
 */
it('expand-selection', function() {
  const document = window.document;
  const row = document.createElement('x-row');
  document.body.appendChild(row);

  // Test basic text selection.
  row.innerText = 'start this_is_a_testing_string|end';
  this.screen.pushRow(row);

  const range = document.createRange();
  const selection = document.getSelection();

  this.screen.setRange_(row, 10, 12, range);
  selection.removeAllRanges();
  selection.addRange(range);

  this.screen.wordBreakMatchLeft = '[^\\s\\|]';
  this.screen.wordBreakMatchRight = '[^\\s\\|]';
  this.screen.wordBreakMatchMiddle = '[^\\s\\|]*';
  this.screen.expandSelection(selection);

  assert.equal('this_is_a_testing_string', selection.toString());

  // Now test URL selection.
  row.innerText = 'start https://www.google.com/(end)';

  this.screen.setRange_(row, 7, 9, range);
  selection.removeAllRanges();
  selection.addRange(range);

  this.screen.expandSelectionForUrl(selection);

  assert.equal('https://www.google.com/', selection.toString());

  document.body.removeChild(row);
});

});
