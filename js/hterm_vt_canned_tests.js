// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview VT canned data test suite.
 *
 * This suite plays back pre-recorded VT sessions.  The recorded data is
 * expected to define checkpoints where we should stop and compare the current
 * terminal screen to expected results.
 *
 * See ../test_data/vttest-01.log for an example of a recorded session that
 * includes the required checkpoints.
 *
 * The ../bin/vtscope.py script can be used to replay canned data to one
 * or more terminals at the same time.  It understands how to ignore the header
 * information contained in the pre-recorded sessions.
 *
 * Pre-recorded sessions look like this...
 *
 *   @@ HEADER_START
 *
 *   @@ OFFSET:xxx LINES:yyy CURSOR:row,column
 *   PLACE yyy LINES
 *   OF EXPECTED RESULTS HERE
 *
 *   @@ OFFSET:xxx1 LINES:yyy1 CURSOR:row,column
 *   PLACE yyy1 LINES
 *   OF EXPECTED RESULTS HERE
 *
 *   ... repeat as necessary ...
 *
 *   @@ HEADER_END
 *   Place the recorded VT session here.  You can record it with the
 *   `script.py` command that comes with the pexpect Python package, or
 *   just turn on logging on your standard terminal application, if it
 *   has the option.
 *
 * Everything between '@@ HEADER_START' and '@@ HEADER_END' is considered
 * part of the header information.  The vtscope.py script will skip over it
 * entirely.  All offsets in the OFFSET lines of the header (and in the
 * vtscope.py `seek` command) assume that OFFSET 0 is starts on the line after
 * '@@ HEADER_END'.
 *
 * This test suite will stop at each defined OFFSET.  The LINES setting tells
 * the suite how many of the lines in the terminal are significant, and will
 * compare those lines to the expected results.  The CURSOR position tells
 * the test suite where the cursor is expected to be found.
 *
 * If there is any mismatch in the expected lines, or the cursor is left in
 * the wrong position, the test case will fail.
 *
 * All OFFSET lines must include a LINES and CURSOR setting in the correct
 * order.
 *
 * Blank lines and lines starting with a "#" between header definitions are
 * ignored.
 */

hterm.VT.CannedTests = new lib.TestManager.Suite('hterm.VT.CannedTests');

hterm.VT.CannedTests.prototype.setup = function(cx) {
  this.setDefaults(cx,
      { visibleColumnCount: 80,
        visibleRowCount: 25,
      });
};

/**
 * Clear out the current document and create a new hterm.Terminal object for
 * testing.
 *
 * Called before each test case in this suite.
 */
hterm.VT.CannedTests.prototype.preamble = function(result, cx) {
  var document = cx.window.document;

  document.body.innerHTML = '';

  var div = document.createElement('div');
  div.style.position = 'absolute';
  document.body.appendChild(div);

  this.div = div;

  cx.window.terminal = this.terminal = new hterm.Terminal();

  // Allow column width changes by default so the canned data can request a
  // known terminal width.
  this.terminal.vt.allowColumnWidthChanges_ = true;

  this.terminal.decorate(div);
  this.terminal.setWidth(this.visibleColumnCount);
  this.terminal.setHeight(this.visibleRowCount);
};

/**
 * Ensure that blink is off after the test so we don't have runaway timeouts.
 *
 * Called after each test case in this suite.
 */
hterm.VT.CannedTests.prototype.postamble = function(result, cx) {
  this.terminal.setCursorBlink(false);
};

/**
 * Overridden addTest method.
 *
 * This takes only a filename, and constructs a test function that will load
 * the specified canned data and test it out.
 *
 * @param {string} fileName The path to the file containing the canned data
 *     to test.
 */
hterm.VT.CannedTests.addTest = function(fileName) {
  function testProxy(result, cx) {
    var self = this;
    setTimeout(function() {
        self.terminal.setCursorPosition(0, 0);
        self.terminal.setCursorVisible(true);
        self.loadCannedData(result, fileName, self.testCannedData.bind(self));
      }, 0);

    result.requestTime(5000);
  }

  var ary = fileName.match(/([^\/.]+)(\.[^.]+)?$/);
  lib.TestManager.Suite.addTest.apply(this, [ary[1], testProxy]);
};

/**
 * Load canned data using XMLHttpRequest.
 *
 * If the data fails to load the test case will fail.
 *
 * @param {TestManager.Result} result The result object associated with this
 *     test.
 * @param {string} fileName The path to the file containing the canned data
 *     load.
 * @param {function} callback The function to call when the data has been
 *     loaded.
 */
hterm.VT.CannedTests.prototype.loadCannedData = function(
    result, fileName, callback) {
  var xhr = new XMLHttpRequest();
  window.xhr = xhr;

  xhr.open('GET', fileName);
  xhr.onreadystatechange = function() {
    if (this.readyState != 4)
      return;

    result.assert(this.status == 200 || this.status == 0);
    callback(result, this.responseText);
  };

  xhr.send(null);
};

/**
 * Test a can of data.
 *
 * @param {TestManager.Result} result The result object associated with this
 *     test.
 * @param {string} data The canned data, including header.
 */
hterm.VT.CannedTests.prototype.testCannedData = function(result, data) {
  // Make sure we got some data.
  result.assert(!!data, 'canned data is not empty');

  var m = data.match(/^(#[^\n]*\n)*@@ HEADER_START/)
  // And that it has optional lead-in comments followed by a header.
  result.assert(!!m, 'data has a header');

  var headerStart = m[0].length;

  // And that the header has an ending.
  m = data.match(/^@@ HEADER_END\r?\n/m);
  result.assert(!!m, 'header ends');

  var header = data.substring(headerStart, m.index);
  data = data.substr(headerStart + header.length + m[0].length);

  var startOffset = 0;
  var headerLines = header.split(/\r?\n/);

  for (var headerIndex = 0; headerIndex < headerLines.length; headerIndex++) {
    var line = headerLines[headerIndex];
    if (!line || /^(#.*|\s*)$/.test(line)) {
      // Skip blank lines and comment lines.
      continue;
    }

    var ary = line.match(
        /^@@\s+OFFSET:(\d+)\s+LINES:(\d+)\s+CURSOR:(\d+),(\d+)\s*$/);
    result.assert(!!ary, 'header line: ' + line);

    var endOffset = Number(ary[1]);
    result.println('Playing to offset: ' + endOffset);
    this.terminal.interpret(data.substring(startOffset, endOffset));

    var lineCount = Number(ary[2]);
    for (var rowIndex = 0; rowIndex < lineCount; rowIndex++) {
      headerIndex++;
      result.assertEQ(this.terminal.getRowText(rowIndex),
                      headerLines[headerIndex],
                      'row:' + rowIndex);
    }

    result.assertEQ(this.terminal.getCursorRow(), Number(ary[3]), 'cursor row');
    result.assertEQ(this.terminal.getCursorColumn(), Number(ary[4]),
                    'cursor column');

    startOffset = endOffset;
  }

  terminal.setWidth(null);
  terminal.setHeight(null);
  result.pass();
};

/**
 * A pre-recorded session of vttest menu option 1, 'Test of cursor movements'.
 */
hterm.VT.CannedTests.addTest('../test_data/vttest-01.log');

hterm.VT.CannedTests.addTest('../test_data/vttest-02.log');

hterm.VT.CannedTests.addTest('../test_data/charsets.log');
