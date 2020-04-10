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
 */

/*
 * (This documentation moved out of JSDoc block due to use of '@@')
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

describe('hterm_vt_canned_tests.js', () => {

before(function() {
  this.visibleColumnCount = 80;
  this.visibleRowCount = 25;
});

/**
 * Clear out the current document and create a new hterm.Terminal object for
 * testing.
 *
 * Called before each test case in this suite.
 */
beforeEach(function(done) {
  const document = window.document;

  const div = document.createElement('div');
  div.style.position = 'absolute';
  document.body.appendChild(div);

  this.div = div;

  this.terminal = new hterm.Terminal();

  // Allow column width changes by default so the canned data can request a
  // known terminal width.
  this.terminal.vt.allowColumnWidthChanges_ = true;

  this.terminal.decorate(div);
  this.terminal.setWidth(this.visibleColumnCount);
  this.terminal.setHeight(this.visibleRowCount);
  this.terminal.onTerminalReady = () => {
    // The canned tests want access to graphics charsets, so make sure the
    // encoding is not utf-8 (as we might default to).
    this.terminal.vt.setEncoding('iso-2022');

    this.terminal.setCursorPosition(0, 0);
    this.terminal.setCursorVisible(true);

    done();
  };
});

/**
 * Ensure that blink is off after the test so we don't have runaway timeouts.
 *
 * Called after each test case in this suite.
 */
afterEach(function() {
  this.terminal.setCursorBlink(false);
  document.body.removeChild(this.div);
});

/**
 * Test a can of data.
 *
 * @param {!hterm.Terminal} terminal The terminal to run canned tests against.
 * @param {string} name The name of canned test.
 */
const testData = function(terminal, name) {
  let data = lib.resource.getData(`hterm/test/canned/${name}`);

  let m = data.match(/^(#[^\n]*\n)*@@ HEADER_START/);
  // And that it has optional lead-in comments followed by a header.
  assert.isTrue(!!m, 'data has a header');

  const headerStart = m[0].length;

  // And that the header has an ending.
  m = data.match(/^@@ HEADER_END\r?\n/m);
  assert.isTrue(!!m, 'header ends');

  const header = data.substring(headerStart, m.index);
  data = data.substr(headerStart + header.length + m[0].length);

  let startOffset = 0;
  const headerLines = header.split(/\r?\n/);

  for (let headerIndex = 0; headerIndex < headerLines.length; headerIndex++) {
    const line = headerLines[headerIndex];
    if (!line || /^(#.*|\s*)$/.test(line)) {
      // Skip blank lines and comment lines.
      continue;
    }

    const ary = line.match(
        /^@@\s+OFFSET:(\d+)\s+LINES:(\d+)\s+CURSOR:(\d+),(\d+)\s*$/);
    assert.isTrue(!!ary, 'header line: ' + line);

    const endOffset = Number(ary[1]);
    // console.log(`Playing to offset: ${endOffset}`);
    terminal.interpret(data.substring(startOffset, endOffset));

    const lineCount = Number(ary[2]);
    for (let rowIndex = 0; rowIndex < lineCount; rowIndex++) {
      headerIndex++;
      assert.equal(terminal.getRowText(rowIndex),
                   headerLines[headerIndex],
                   'row:' + rowIndex);
    }

    assert.equal(terminal.getCursorRow(), Number(ary[3]), 'cursor row');
    assert.equal(terminal.getCursorColumn(), Number(ary[4]),
                 'cursor column');

    startOffset = endOffset;
  }

  terminal.setWidth(null);
  terminal.setHeight(null);
};

[
  // A pre-recorded session of vttest menu option 1, 'Test of cursor movements'.
  'vttest-01',
  'vttest-02',
  'charsets',
].forEach((name) => {
  it(name, function() {
    testData(this.terminal, name);
  }).timeout(5000);
});

});
