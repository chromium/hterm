// Copyright 2017 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview Unit tests for hterm.VT.CharacterMap and friends.
 */

describe('hterm_vt_character_map_tests.js', () => {

/**
 * Verify null maps work sanely.
 */
it('null-map', () => {
  const map = new hterm.VT.CharacterMap('foo', null);

  assert.equal(map.description, 'foo');
  assert.isNull(map.GL);
});

/**
 * Verify empty maps work sanely.
 */
it('empty-map', () => {
  const map = new hterm.VT.CharacterMap('foo bar', {});

  assert.equal(map.description, 'foo bar');
  assert.equal(typeof map.GL, 'function');
});

/**
 * Verify GL map works.
 */
it('gl-translate', () => {
  const map = new hterm.VT.CharacterMap('test', {'a': 'b'});

  assert.equal(map.GL('a'), 'b');
  assert.equal(map.GL('b'), 'b');
  assert.equal(map.GL('c'), 'c');
});

/**
 * Verify handling of overrides.
 */
it('overrides', () => {
  const map = new hterm.VT.CharacterMap('test', {'a': 'A', 'b': 'B'});

  // Verify things start off sane.
  assert.equal(map.GL('a'), 'A');
  assert.equal(map.GL('b'), 'B');
  assert.equal(map.GL('c'), 'c');
  assert.equal(map.GL('d'), 'd');

  // The override will update existing mappings.
  map.setOverrides({'a': 'A', 'c': 'C'});
  assert.equal(map.GL('a'), 'A');
  assert.equal(map.GL('b'), 'B');
  assert.equal(map.GL('c'), 'C');
  assert.equal(map.GL('d'), 'd');

  // Do the same thing again!
  map.setOverrides({'a': 'Z', 'd': 'D'});
  assert.equal(map.GL('a'), 'Z');
  assert.equal(map.GL('b'), 'B');
  assert.equal(map.GL('c'), 'c');
  assert.equal(map.GL('d'), 'D');
});

/**
 * Verify handling of resets.
 */
it('resets', () => {
  const map = new hterm.VT.CharacterMap('test', {'a': 'A', 'b': 'B'});

  // Verify things start off sane.
  assert.equal(map.GL('a'), 'A');
  assert.equal(map.GL('b'), 'B');
  assert.equal(map.GL('c'), 'c');
  assert.strictEqual(map.glmap_, map.glmapBase_);

  // The override will generate a new internal mapping.
  map.setOverrides({'a': 'A', 'c': 'C'});
  assert.equal(map.GL('a'), 'A');
  assert.equal(map.GL('b'), 'B');
  assert.equal(map.GL('c'), 'C');
  assert.notStrictEqual(map.glmap_, map.glmapBase_);

  // Resetting will get the old mapping, and object state.
  map.reset();
  assert.equal(map.GL('a'), 'A');
  assert.equal(map.GL('b'), 'B');
  assert.equal(map.GL('c'), 'c');
  assert.strictEqual(map.glmap_, map.glmapBase_);
});

/**
 * Verify map clones work.
 */
it('clone', () => {
  const map = new hterm.VT.CharacterMap('test', {'a': 'A', 'b': 'B'});
  const dup = map.clone();

  // Make sure the dupe behaves the same, but isn't the same.
  assert.equal(map.description, dup.description);
  assert.equal(map.GL('a'), 'A');
  assert.equal(dup.GL('a'), 'A');

  dup.setOverrides({'b': 'C', 'x': 'X'});
  assert.equal(map.GL('b'), 'B');
  assert.equal(dup.GL('b'), 'C');
  assert.equal(map.GL('x'), 'x');
  assert.equal(dup.GL('X'), 'X');
});

/**
 * Verify basic character map handling.
 */
it('basic', () => {
  const maps = new hterm.VT.CharacterMaps();

  // The default mapping should pass through to the default table.
  assert.strictEqual(maps.maps_, maps.mapsBase_);
  assert.strictEqual(maps.maps_, hterm.VT.CharacterMaps.DefaultMaps);

  // Reset works.
  maps.reset();
  assert.strictEqual(maps.maps_, maps.mapsBase_);
  assert.strictEqual(maps.maps_, hterm.VT.CharacterMaps.DefaultMaps);
});

/**
 * Verify getMap works.
 */
it('getMap', () => {
  const maps = new hterm.VT.CharacterMaps();

  assert.isUndefined(maps.getMap('X'));
  assert.isDefined(maps.getMap('0'));
  assert.strictEqual(maps.getMap('0'), hterm.VT.CharacterMaps.DefaultMaps['0']);
});

/**
 * Verify adding a new mapping doesn't mess with the default table.
 */
it('new-map', () => {
  const maps = new hterm.VT.CharacterMaps();
  const map = new hterm.VT.CharacterMap('test', {});

  // Add a new map to the table.
  assert.isUndefined(maps.getMap('X'));
  maps.addMap('X', map);
  assert.strictEqual(maps.getMap('X'), map);
  assert.isUndefined(hterm.VT.CharacterMaps.DefaultMaps['X']);

  // The mapping table should be updated now.
  assert.notStrictEqual(maps.maps_, maps.mapsBase_);
  assert.notStrictEqual(maps.maps_, hterm.VT.CharacterMaps.DefaultMaps);

  // Reset works.
  maps.reset();
  assert.strictEqual(maps.maps_, maps.mapsBase_);
  assert.strictEqual(maps.maps_, hterm.VT.CharacterMaps.DefaultMaps);
});

/**
 * Verify updating an existing mapping doesn't mess with the default table.
 */
it('update-map', () => {
  const maps = new hterm.VT.CharacterMaps();
  const map = new hterm.VT.CharacterMap('test', {});

  // Update a mapping in the table.
  assert.isDefined(maps.getMap('0'));
  maps.addMap('0', map);
  assert.strictEqual(maps.getMap('0'), map);
  assert.notStrictEqual(hterm.VT.CharacterMaps.DefaultMaps['0'], map);

  // The mapping table should be updated now.
  assert.notStrictEqual(maps.maps_, maps.mapsBase_);
  assert.notStrictEqual(maps.maps_, hterm.VT.CharacterMaps.DefaultMaps);

  // Reset works.
  maps.reset();
  assert.strictEqual(maps.maps_, maps.mapsBase_);
  assert.strictEqual(maps.maps_, hterm.VT.CharacterMaps.DefaultMaps);
});

/**
 * Verify setting overrides work.
 */
it('overrides', () => {
  const maps = new hterm.VT.CharacterMaps();
  let map;

  // Check the default mappings.
  assert.isUndefined(maps.getMap('U'));
  assert.isUndefined(maps.getMap('V'));
  assert.isUndefined(maps.getMap('X'));
  assert.isDefined(maps.getMap('0'));

  // Update some maps and check the results.
  maps.setOverrides({
    'U': null,
    'V': {},
    'X': {'a': 'A'},
    '0': {'a': 'A'},
  });

  map = maps.getMap('U');
  assert.isDefined(map);
  assert.isNull(map.GL);

  map = maps.getMap('V');
  assert.isDefined(map);
  assert.equal(map.GL('a'), 'a');

  map = maps.getMap('X');
  assert.isDefined(map);
  assert.equal(map.GL('a'), 'A');

  map = maps.getMap('0');
  assert.isDefined(map);
  assert.equal(map.GL('a'), 'A');
  assert.equal(map.GL('\x60'), '\u25c6');

  // Now verify the default maps are sane.
  assert.isUndefined(hterm.VT.CharacterMaps.DefaultMaps['U']);
  assert.isUndefined(hterm.VT.CharacterMaps.DefaultMaps['V']);
  assert.isUndefined(hterm.VT.CharacterMaps.DefaultMaps['X']);
  assert.isDefined(hterm.VT.CharacterMaps.DefaultMaps['0']);
  assert.notStrictEqual(
      hterm.VT.CharacterMaps.DefaultMaps['0'], maps.getMap('0'));

  // Now reset the things back.
  maps.reset();
  assert.isUndefined(maps.getMap('U'));
  assert.isUndefined(maps.getMap('V'));
  assert.isUndefined(maps.getMap('X'));
  assert.isDefined(maps.getMap('0'));
  assert.strictEqual(hterm.VT.CharacterMaps.DefaultMaps['0'], maps.getMap('0'));
});

});
