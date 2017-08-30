// Copyright (c) 2015 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('lib.f');

/**
 * @fileoverview Unit tests for hterm.TextAttributes.
 */
hterm.TextAttributes.Tests =
    new lib.TestManager.Suite('hterm.TextAttributes.Tests');

/**
 * Make sure isDefault works sanely.
 */
hterm.TextAttributes.Tests.addTest('isDefault', function(result, cx) {
  var tattrs = new hterm.TextAttributes();

  // We should be in the default state initially.
  result.assertEQ(true, tattrs.isDefault());

  // Changing an attribute should take it out of the default state.
  tattrs.asciiNode = false;
  result.assertEQ(false, tattrs.isDefault());

  // But resetting it gets us back.
  tattrs.reset();
  result.assertEQ(true, tattrs.isDefault());

  result.pass();
});

/**
 * Make sure createContainer works sanely.
 */
hterm.TextAttributes.Tests.addTest('createContainer', function(result, cx) {
  var tattrs = new hterm.TextAttributes(cx.window.document);
  var node;

  // We don't check all the fields currently.  Not clear it's worth the effort.
  // Focus on fields that have had issues in the past.

  // This should create a default text node.
  node = tattrs.createContainer('asdf');
  result.assertEQ('asdf', node.textContent);
  result.assertEQ(Node.TEXT_NODE, node.nodeType);
  result.assertEQ(false, !!node.blinkNode);
  result.assertEQ(true, node.asciiNode);

  // Get a non-default node.
  tattrs.blink = true;
  node = tattrs.createContainer('asdf');
  result.assertEQ('asdf', node.textContent);
  result.assertEQ(Node.ELEMENT_NODE, node.nodeType);
  result.assertEQ(true, node.blinkNode);
  result.assertEQ(true, node.asciiNode);

  result.pass();
});

/**
 * Make sure matchesContainer works correctly.
 */
hterm.TextAttributes.Tests.addTest('matchesContainer', function(result, cx) {
  var tattrs = new hterm.TextAttributes(cx.window.document);
  var node;

  // For plain string, this is just isDefault.
  result.assertEQ(true, tattrs.matchesContainer(''));

  // For basic text nodes (which this returns by default), we should match.
  node = tattrs.createContainer('asdf');
  result.assertEQ(Node.TEXT_NODE, node.nodeType);
  result.assertEQ(true, tattrs.matchesContainer(node));

  // Now create a node to play with.  Make sure it's not a default node.
  tattrs.underline = true;
  node = tattrs.createContainer('asdf');
  result.assertEQ(Node.ELEMENT_NODE, node.nodeType);
  result.assertEQ(true, tattrs.matchesContainer(node));

  result.pass();
});

hterm.TextAttributes.Tests.addTest('splitWidecharString-ascii', function(result, cx) {
  var text = 'abcdefghijklmn';

  var actual = hterm.TextAttributes.splitWidecharString(text);
  result.assertEQ(actual.length, 1, "Normal text shouldn't be split.");
  result.assertEQ(actual[0].str, text,
                  "The text doesn't have enough content.");
  result.assert(!actual[0].wcNode, "The text shouldn't be wide.");

  result.pass();
});

hterm.TextAttributes.Tests.addTest('splitWidecharString-wide', function(result, cx) {
  var text = 'abcd\u3041\u3042def\u3043ghi';

  var actual = hterm.TextAttributes.splitWidecharString(text);
  result.assertEQ(actual.length, 6, 'Failed to split wide chars.');
  result.assertEQ(actual[0].str, 'abcd',
                  'Failed to obtain the first segment');
  result.assert(!actual[0].wcNode, "First segment shouldn't be wide");
  result.assertEQ(actual[1].str, '\u3041',
                  'Failed to obtain the second segment');
  result.assert(actual[1].wcNode, 'Second segment should be wide');
  result.assertEQ(actual[2].str, '\u3042',
                  'Failed to obtain the third segment');
  result.assert(actual[2].wcNode, 'Third segment should be wide');
  result.assertEQ(actual[3].str, 'def',
                  'Failed to obtain the forth segment');
  result.assert(!actual[3].wcNode, "Forth segment shouldn't be wide");
  result.assertEQ(actual[4].str, '\u3043',
                  'Failed to obtain the fifth segment');
  result.assert(actual[4].wcNode, 'Fifth segment should be wide');
  result.assertEQ(actual[5].str, 'ghi',
                  'Failed to obtain the sixth segment');
  result.assert(!actual[5].wcNode, "Sixth segment shouldn't be wide");

  result.pass();
});

hterm.TextAttributes.Tests.addTest('splitWidecharString-surrogates', function(result, cx) {
  var text = 'abc\uD834\uDD00\uD842\uDD9D';

  var actual = hterm.TextAttributes.splitWidecharString(text);
  result.assertEQ(actual.length, 2, 'Failed to split surrogate pairs.');
  result.assertEQ(actual[0].str, 'abc\uD834\uDD00',
                  'Failed to obtain the first segment');
  result.assert(!actual[0].wcNode, "First segment shouldn't be wide");
  result.assertEQ(actual[1].str, '\uD842\uDD9D',
                  'The second segment should be a wide character built by ' +
                  'a surrogate pair');
  result.assert(actual[1].wcNode, 'The second segment should be wide');

  result.pass();
});

hterm.TextAttributes.Tests.addTest('splitWidecharString-ccs', function(result, cx) {
  var text = 'xA\u030Ax';

  var actual = hterm.TextAttributes.splitWidecharString(text);
  result.assertEQ(actual.length, 1, 'Failed to split combining sequences.');
  result.assertEQ(actual[0].str, text);

  result.pass();
});
