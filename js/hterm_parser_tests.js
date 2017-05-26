// Copyright (c) 2015 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

hterm.Parser.Tests =
    new lib.TestManager.Suite('hterm.Parser.Tests');

hterm.Parser.Tests.prototype.negKeySeq = function(result, input, pattern) {
  try {
    var p = new hterm.Parser();
    p.reset(input);
    p.parseKeySequence(input);
  } catch(ex) {
    result.assert(!!ex);
    if (!ex.message.match(pattern)) {
      result.fail('Expected error matching: ' + pattern + ', got: ' +
          ex.message);
    }

    return;
  }

  result.fail('Expected failure for: ' + input);
};

hterm.Parser.Tests.addTest('sequence-identifiers', function(result) {
  var p = new hterm.Parser();

  var checkResult = function(input, output) {
    p.reset(input);
    var rv = p.parseKeySequence();
    result.assertEQ(rv.keyCode, output);
    result.assertEQ(rv.shift, false);
    result.assertEQ(rv.ctrl, false);
    result.assertEQ(rv.alt, false);
    result.assertEQ(rv.meta, false);
  };

  checkResult('X', 88);
  checkResult('x', 88);
  checkResult('ENTER', 13);
  checkResult('Ent', 13);
  checkResult('esc', 27);

  this.negKeySeq(result, 'FOO', /Unknown key: FOO/);

  result.pass();
});

hterm.Parser.Tests.addTest('modifiers', function(result) {
  var p = new hterm.Parser();

  var checkResult = function(input, shift, ctrl, alt, meta) {
    p.reset(input);
    var rv = p.parseKeySequence();
    result.assertEQ(rv.keyCode, 88);
    result.assertEQ(rv.shift, shift);
    result.assertEQ(rv.ctrl, ctrl);
    result.assertEQ(rv.alt, alt);
    result.assertEQ(rv.meta, meta);
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

  this.negKeySeq(result, 'shft-X', /Unknown key: shft$/);
  this.negKeySeq(result, 'SHFT-X', /Unknown key: SHFT$/);
  this.negKeySeq(result, 'Foo-X', /Unknown key: Foo$/);
  this.negKeySeq(result, 'Ctrl-Foo-X', /Unknown key: Foo$/);
  this.negKeySeq(result, 'Ctrl-Ctrl-X', /Duplicate modifier: Ctrl$/);
  this.negKeySeq(result, 'Control-Ctrl-X', /Duplicate modifier: Ctrl$/);
  this.negKeySeq(result, 'Ctrl', /Missing target key$/);
  this.negKeySeq(result, 'Ctrl-Alt"', /Missing target key$/);
  this.negKeySeq(result, 'Ctrl-', /Missing target key$/);
  this.negKeySeq(result, 'Ctrl-X-Alt', /Extra definition after target key$/);
  this.negKeySeq(result, 'toString-X', /Unknown key: toString$/);

  result.pass();
});

hterm.Parser.Tests.addTest('keycodes', function(result) {
  var p = new hterm.Parser();

  var checkResult = function(input, target, shift, ctrl, alt, meta) {
    p.reset(input);
    var rv = p.parseKeySequence();
    result.assertEQ(rv.keyCode, target);
    result.assertEQ(rv.shift, shift);
    result.assertEQ(rv.ctrl, ctrl);
    result.assertEQ(rv.alt, alt);
    result.assertEQ(rv.meta, meta);
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

    result.assertEQ(rv, output);
  };

  checkResult('CANCEL', hterm.Keyboard.KeyActions.CANCEL);
  checkResult('PASS', hterm.Keyboard.KeyActions.PASS);
  checkResult('DEFAULT', hterm.Keyboard.KeyActions.DEFAULT);

  checkResult('"123"', '123');

  result.pass();
});
