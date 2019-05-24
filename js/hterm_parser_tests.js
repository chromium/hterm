// Copyright (c) 2015 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview hterm.Parser unit tests.
 */

hterm.Parser.Tests =
    new lib.TestManager.Suite('hterm.Parser.Tests');

/**
 * Helper to check parseKeySequence failing behavior.
 *
 * @param {string} input The key sequence to parse.
 * @param {RegExp} pattern The error message checker.
 */
const negKeySeq = function(input, pattern) {
  try {
    var p = new hterm.Parser();
    p.reset(input);
    p.parseKeySequence(input);
  } catch(ex) {
    assert.isTrue(!!ex);
    assert.match(ex.message, pattern);
    return;
  }

  assert.fail(`Expected failure for: ${input}`);
};

hterm.Parser.Tests.addTest('sequence-identifiers', function(result) {
  var p = new hterm.Parser();

  var checkResult = function(input, output) {
    p.reset(input);
    var rv = p.parseKeySequence();
    assert.equal(rv.keyCode, output);
    assert.isFalse(rv.shift);
    assert.isFalse(rv.ctrl);
    assert.isFalse(rv.alt);
    assert.isFalse(rv.meta);
  };

  checkResult('X', 88);
  checkResult('x', 88);
  checkResult('ENTER', 13);
  checkResult('Ent', 13);
  checkResult('esc', 27);

  negKeySeq('FOO', /Unknown key: FOO/);

  result.pass();
});

hterm.Parser.Tests.addTest('modifiers', function(result) {
  var p = new hterm.Parser();

  var checkResult = function(input, shift, ctrl, alt, meta) {
    p.reset(input);
    var rv = p.parseKeySequence();
    assert.equal(rv.keyCode, 88);
    assert.equal(rv.shift, shift);
    assert.equal(rv.ctrl, ctrl);
    assert.equal(rv.alt, alt);
    assert.equal(rv.meta, meta);
  };

  checkResult('Shift-X', true, false, false, false);
  checkResult('Ctrl-X', false, true, false, false);
  checkResult('Control-X', false, true, false, false);
  checkResult('Alt-X', false, false, true, false);
  checkResult('Meta-X', false, false, false, true);

  checkResult('SHIFT-X', true, false, false, false);
  checkResult('CTRL-X', false, true, false, false);
  checkResult('CONTROL-X', false, true, false, false);
  checkResult('ALT-X', false, false, true, false);
  checkResult('META-X', false, false, false, true);

  checkResult('Shift-Ctrl-X', true, true, false, false);
  checkResult('ShIfT-cTrL-x', true, true, false, false);
  checkResult('Shift-Alt-X', true, false, true, false);
  checkResult('Shift-Meta-X', true, false, false, true);
  checkResult('Shift-Ctrl-Alt-Meta-X', true, true, true, true);

  checkResult('Shift-*-X', true, '*', '*', '*');
  checkResult('Shift-Ctrl-*-X', true, true, '*', '*');
  checkResult('Shift-Ctrl-Alt-*-X', true, true, true, '*');
  checkResult('Shift-Ctrl-Alt-Meta-*-X', true, true, true, true);

  negKeySeq('shft-X', /Unknown key: shft$/);
  negKeySeq('SHFT-X', /Unknown key: SHFT$/);
  negKeySeq('Foo-X', /Unknown key: Foo$/);
  negKeySeq('Ctrl-Foo-X', /Unknown key: Foo$/);
  negKeySeq('Ctrl-Ctrl-X', /Duplicate modifier: Ctrl$/);
  negKeySeq('Control-Ctrl-X', /Duplicate modifier: Ctrl$/);
  negKeySeq('Ctrl', /Missing target key$/);
  negKeySeq('Ctrl-Alt"', /Missing target key$/);
  negKeySeq('Ctrl-', /Missing target key$/);
  negKeySeq('Ctrl-X-Alt', /Extra definition after target key$/);
  negKeySeq('toString-X', /Unknown key: toString$/);

  result.pass();
});

hterm.Parser.Tests.addTest('keycodes', function(result) {
  var p = new hterm.Parser();

  var checkResult = function(input, target, shift, ctrl, alt, meta) {
    p.reset(input);
    var rv = p.parseKeySequence();
    assert.equal(rv.keyCode, target);
    assert.equal(rv.shift, shift);
    assert.equal(rv.ctrl, ctrl);
    assert.equal(rv.alt, alt);
    assert.equal(rv.meta, meta);
  };

  checkResult('88', 88, false, false, false, false);
  checkResult('Shift-88', 88, true, false, false, false);
  checkResult('Shift-Ctrl-Alt-Meta-88', 88, true, true, true, true);

  checkResult('0', 0, false, false, false, false);
  checkResult('Shift-0', 0, true, false, false, false);
  checkResult('Shift-Ctrl-Alt-Meta-0', 0, true, true, true, true);

  checkResult('0x123456789abcdef', 0x123456789abcdef,
              false, false, false, false);


  checkResult('0xf', 15, false, false, false, false);
  checkResult('Ctrl-0xf', 15, false, true, false, false);
  checkResult('Ctrl-0x0f', 15, false, true, false, false);
  checkResult('Ctrl-Alt-0xf', 15, false, true, true, false);
  checkResult('0xff', 255, false, false, false, false);
  checkResult('Ctrl-0xff', 255, false, true, false, false);
  checkResult('Ctrl-Alt-0xff', 255, false, true, true, false);

  result.pass();
});

hterm.Parser.Tests.addTest('actions', function(result) {
  var p = new hterm.Parser();

  var checkResult = function(input, output) {
    p.reset(input);
    var rv = p.parseKeyAction();

    assert.strictEqual(rv, output);
  };

  checkResult('CANCEL', hterm.Keyboard.KeyActions.CANCEL);
  checkResult('PASS', hterm.Keyboard.KeyActions.PASS);
  checkResult('DEFAULT', hterm.Keyboard.KeyActions.DEFAULT);

  checkResult('"123"', '123');

  result.pass();
});
