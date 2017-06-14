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

/**
 * Verify map clones work.
 */
hterm.VT.CharacterMap.Tests.addTest('clone', function(result, cx) {
  var map = new hterm.VT.CharacterMap('test', {'a': 'A', 'b': 'B'});
  var dup = map.clone();

  // Make sure the dupe behaves the same, but isn't the same.
  result.assertEQ(map.description, dup.description);
  result.assertEQ(map.GL('a'), 'A');
  result.assertEQ(dup.GL('a'), 'A');

  dup.setOverrides({'b': 'C', 'x': 'X'});
  result.assertEQ(map.GL('b'), 'B');
  result.assertEQ(dup.GL('b'), 'C');
  result.assertEQ(map.GL('x'), 'x');
  result.assertEQ(dup.GL('X'), 'X');

  result.pass();
});

hterm.VT.CharacterMaps.Tests =
    new lib.TestManager.Suite('hterm.VT.CharacterMaps.Tests');

/**
 * Verify basic character map handling.
 */
hterm.VT.CharacterMaps.Tests.addTest('basic', function(result, cx) {
  var maps = new hterm.VT.CharacterMaps();

  // The default mapping should pass through to the default table.
  result.assert(maps.maps_ === maps.mapsBase_);
  result.assert(maps.maps_ === hterm.VT.CharacterMaps.DefaultMaps);

  // Reset works.
  maps.reset();
  result.assert(maps.maps_ === maps.mapsBase_);
  result.assert(maps.maps_ === hterm.VT.CharacterMaps.DefaultMaps);

  result.pass();
});

/**
 * Verify getMap works.
 */
hterm.VT.CharacterMaps.Tests.addTest('getMap', function(result, cx) {
  var maps = new hterm.VT.CharacterMaps();

  result.assert(maps.getMap('X') === undefined);
  result.assert(maps.getMap('0') !== undefined);
  result.assert(maps.getMap('0') === hterm.VT.CharacterMaps.DefaultMaps['0']);

  result.pass();
});

/**
 * Verify adding a new mapping doesn't mess with the default table.
 */
hterm.VT.CharacterMaps.Tests.addTest('new-map', function(result, cx) {
  var maps = new hterm.VT.CharacterMaps();
  var map = new hterm.VT.CharacterMap('test', {});

  // Add a new map to the table.
  result.assert(maps.getMap('X') === undefined);
  maps.addMap('X', map);
  result.assert(maps.getMap('X') === map);
  result.assert(hterm.VT.CharacterMaps.DefaultMaps['X'] === undefined);

  // The mapping table should be updated now.
  result.assert(maps.maps_ !== maps.mapsBase_);
  result.assert(maps.maps_ !== hterm.VT.CharacterMaps.DefaultMaps);

  // Reset works.
  maps.reset();
  result.assert(maps.maps_ === maps.mapsBase_);
  result.assert(maps.maps_ === hterm.VT.CharacterMaps.DefaultMaps);

  result.pass();
});

/**
 * Verify updating an existing mapping doesn't mess with the default table.
 */
hterm.VT.CharacterMaps.Tests.addTest('update-map', function(result, cx) {
  var maps = new hterm.VT.CharacterMaps();
  var map = new hterm.VT.CharacterMap('test', {});

  // Update a mapping in the table.
  result.assert(maps.getMap('0') !== undefined);
  maps.addMap('0', map);
  result.assert(maps.getMap('0') === map);
  result.assert(hterm.VT.CharacterMaps.DefaultMaps['0'] !== map);

  // The mapping table should be updated now.
  result.assert(maps.maps_ !== maps.mapsBase_);
  result.assert(maps.maps_ !== hterm.VT.CharacterMaps.DefaultMaps);

  // Reset works.
  maps.reset();
  result.assert(maps.maps_ === maps.mapsBase_);
  result.assert(maps.maps_ === hterm.VT.CharacterMaps.DefaultMaps);

  result.pass();
});

/**
 * Verify setting overrides work.
 */
hterm.VT.CharacterMaps.Tests.addTest('overrides', function(result, cx) {
  var maps = new hterm.VT.CharacterMaps();
  var map;

  // Check the default mappings.
  result.assert(maps.getMap('U') === undefined);
  result.assert(maps.getMap('V') === undefined);
  result.assert(maps.getMap('X') === undefined);
  result.assert(maps.getMap('0') !== undefined);

  // Update some maps and check the results.
  maps.setOverrides({
    'U': null,
    'V': {},
    'X': {'a': 'A'},
    '0': {'a': 'A'},
  });

  map = maps.getMap('U');
  result.assert(map !== undefined);
  result.assert(map.GL === null);

  map = maps.getMap('V');
  result.assert(map !== undefined);
  result.assertEQ(map.GL('a'), 'a');

  map = maps.getMap('X');
  result.assert(map !== undefined);
  result.assertEQ(map.GL('a'), 'A');

  map = maps.getMap('0');
  result.assert(map !== undefined);
  result.assertEQ(map.GL('a'), 'A');
  result.assertEQ(map.GL('\x60'), '\u25c6');

  // Now verify the default maps are sane.
  result.assert(hterm.VT.CharacterMaps.DefaultMaps['U'] === undefined);
  result.assert(hterm.VT.CharacterMaps.DefaultMaps['V'] === undefined);
  result.assert(hterm.VT.CharacterMaps.DefaultMaps['X'] === undefined);
  result.assert(hterm.VT.CharacterMaps.DefaultMaps['0'] !== undefined);
  result.assert(hterm.VT.CharacterMaps.DefaultMaps['0'] !== maps.getMap('0'));

  // Now reset the things back.
  maps.reset();
  result.assert(maps.getMap('U') === undefined);
  result.assert(maps.getMap('V') === undefined);
  result.assert(maps.getMap('X') === undefined);
  result.assert(maps.getMap('0') !== undefined);
  result.assert(hterm.VT.CharacterMaps.DefaultMaps['0'] === maps.getMap('0'));

  result.pass();
});
