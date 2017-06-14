// Copyright 2017 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('lib.f');

/**
 * @fileoverview Unit tests for hterm.VT.CharacterMap and friends.
 */
hterm.VT.CharacterMap.Tests =
    new lib.TestManager.Suite('hterm.VT.CharacterMap.Tests');

/**
 * Verify null maps work sanely.
 */
hterm.VT.CharacterMap.Tests.addTest('null-map', function(result, cx) {
  var map = new hterm.VT.CharacterMap('foo', null);

  result.assertEQ(map.description, 'foo');
  result.assertEQ(map.GL, null);

  result.pass();
});

/**
 * Verify empty maps work sanely.
 */
hterm.VT.CharacterMap.Tests.addTest('empty-map', function(result, cx) {
  var map = new hterm.VT.CharacterMap('foo bar', {});

  result.assertEQ(map.description, 'foo bar');
  result.assertEQ(typeof map.GL, 'function');

  result.pass();
});

/**
 * Verify GL map works.
 */
hterm.VT.CharacterMap.Tests.addTest('gl-translate', function(result, cx) {
  var map = new hterm.VT.CharacterMap('test', {'a': 'b'});

  result.assertEQ(map.GL('a'), 'b');
  result.assertEQ(map.GL('b'), 'b');
  result.assertEQ(map.GL('c'), 'c');

  result.pass();
});

/**
 * Verify handling of overrides.
 */
hterm.VT.CharacterMap.Tests.addTest('overrides', function(result, cx) {
  var map = new hterm.VT.CharacterMap('test', {'a': 'A', 'b': 'B'});

  // Verify things start off sane.
  result.assertEQ(map.GL('a'), 'A');
  result.assertEQ(map.GL('b'), 'B');
  result.assertEQ(map.GL('c'), 'c');
  result.assertEQ(map.GL('d'), 'd');

  // The override will update existing mappings.
  map.setOverrides({'a': 'A', 'c': 'C'})
  result.assertEQ(map.GL('a'), 'A');
  result.assertEQ(map.GL('b'), 'B');
  result.assertEQ(map.GL('c'), 'C');
  result.assertEQ(map.GL('d'), 'd');

  // Do the same thing again!
  map.setOverrides({'a': 'Z', 'd': 'D'})
  result.assertEQ(map.GL('a'), 'Z');
  result.assertEQ(map.GL('b'), 'B');
  result.assertEQ(map.GL('c'), 'c');
  result.assertEQ(map.GL('d'), 'D');

  result.pass();
});

/**
 * Verify handling of resets.
 */
hterm.VT.CharacterMap.Tests.addTest('resets', function(result, cx) {
  var map = new hterm.VT.CharacterMap('test', {'a': 'A', 'b': 'B'});

  // Verify things start off sane.
  result.assertEQ(map.GL('a'), 'A');
  result.assertEQ(map.GL('b'), 'B');
  result.assertEQ(map.GL('c'), 'c');
  result.assert(map.glmap_ === map.glmapBase_);

  // The override will generate a new internal mapping.
  map.setOverrides({'a': 'A', 'c': 'C'})
  result.assertEQ(map.GL('a'), 'A');
  result.assertEQ(map.GL('b'), 'B');
  result.assertEQ(map.GL('c'), 'C');
  result.assert(map.glmap_ !== map.glmapBase_);

  // Resetting will get the old mapping, and object state.
  map.reset();
  result.assertEQ(map.GL('a'), 'A');
  result.assertEQ(map.GL('b'), 'B');
  result.assertEQ(map.GL('c'), 'c');
  result.assert(map.glmap_ === map.glmapBase_);

  result.pass();
});
