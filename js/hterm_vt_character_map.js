// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('lib.f');

/**
 * Character map object.
 *
 * Mapping from received to display character, used depending on the active
 * VT character set.
 *
 * GR maps are not currently supported.
 *
 * @param {string} description A human readable description of this map.
 * @param {Object} glmap The GL mapping from input to output characters.
 */
hterm.VT.CharacterMap = function(description, glmap) {
  /**
   * Short description for this character set, useful for debugging.
   */
  this.description = description;

  /**
   * The function to call to when this map is installed in GL.
   */
  this.GL = null;

  // Always keep an unmodified reference to the map.
  // This allows us to sanely reset back to the original state.
  this.glmapBase_ = glmap;

  // Now sync the internal state as needed.
  this.sync_();
};

/**
 * Internal helper for resyncing internal state.
 *
 * Used when the mappings change.
 *
 * @param {Object?} opt_glmap Additional mappings to overlay on top of the
 *     base mapping.
 */
hterm.VT.CharacterMap.prototype.sync_ = function(opt_glmap) {
  // If there are no maps, then reset the state back.
  if (!this.glmapBase_ && !opt_glmap) {
    this.GL = null;
    delete this.glmap_;
    delete this.glre_;
    return;
  }

  // Set the the GL mapping.  If we're given a custom mapping, then create a
  // new object to hold the merged map.  This way we can cleanly reset back.
  if (opt_glmap)
    this.glmap_ = Object.assign({}, this.glmapBase_, opt_glmap);
  else
    this.glmap_ = this.glmapBase_;

  var glchars = Object.keys(this.glmap_).map((key) =>
      '\\x' + lib.f.zpad(key.charCodeAt(0).toString(16)));
  this.glre_ = new RegExp('[' + glchars.join('') + ']', 'g');

  this.GL = (str) => str.replace(this.glre_, (ch) => this.glmap_[ch]);
};

/**
 * Reset map back to original mappings (discarding runtime updates).
 *
 * Specifically, any calls to setOverrides will be discarded.
 */
hterm.VT.CharacterMap.prototype.reset = function() {
  // If we haven't been given a custom mapping, then there's nothing to reset.
  if (this.glmap_ !== this.glmapBase_)
    this.sync_();
};

/**
 * Merge custom changes to this map.
 *
 * The input map need not duplicate the existing mappings as it is merged with
 * the existing base map (what was created with).  Subsequent calls to this
 * will throw away previous override settings.
 *
 * @param {Object} glmap The custom map to override existing mappings.
 */
hterm.VT.CharacterMap.prototype.setOverrides = function(glmap) {
  this.sync_(glmap);
};

/**
 * Return a copy of this mapping.
 *
 * @return {hterm.VT.CharacterMap} A new hterm.VT.CharacterMap instance.
 */
hterm.VT.CharacterMap.prototype.clone = function() {
  var map = new hterm.VT.CharacterMap(this.description, this.glmapBase_);
  if (this.glmap_ !== this.glmapBase_)
    map.setOverrides(this.glmap_);
  return map;
};

/**
 * Table of character maps.
 */
hterm.VT.CharacterMaps = function() {
  this.maps_ = hterm.VT.CharacterMaps.DefaultMaps;

  // Always keep an unmodified reference to the map.
  // This allows us to sanely reset back to the original state.
  this.mapsBase_ = this.maps_;
};

/**
 * Look up a previously registered map.
 *
 * @param {String} name The name of the map to lookup.
 * @return {hterm.VT.CharacterMap} The map, if it's been registered.
 */
hterm.VT.CharacterMaps.prototype.getMap = function(name) {
  if (this.maps_.hasOwnProperty(name))
    return this.maps_[name];
  else
    return undefined;
};

/**
 * Register a new map.
 *
 * Any previously registered maps by this name will be discarded.
 *
 * @param {String} name The name of the map.
 * @param {hterm.VT.CharacterMap} map The map to register.
 */
hterm.VT.CharacterMaps.prototype.addMap = function(name, map) {
  if (this.maps_ === this.mapsBase_)
    this.maps_ = Object.assign({}, this.mapsBase_);
  this.maps_[name] = map;
};

/**
 * Reset the table and all its maps back to original state.
 */
hterm.VT.CharacterMaps.prototype.reset = function() {
  if (this.maps_ !== hterm.VT.CharacterMaps.DefaultMaps)
    this.maps_ = hterm.VT.CharacterMaps.DefaultMaps;
};

/**
 * Merge custom changes to this table.
 *
 * @param {Object} maps A set of hterm.VT.CharacterMap objects.
 */
hterm.VT.CharacterMaps.prototype.setOverrides = function(maps) {
  if (this.maps_ === this.mapsBase_)
    this.maps_ = Object.assign({}, this.mapsBase_);

  for (var name in maps) {
    var map = this.getMap(name);
    if (map !== undefined) {
      this.maps_[name] = map.clone();
      this.maps_[name].setOverrides(maps[name]);
    } else
      this.addMap(name, new hterm.VT.CharacterMap('user ' + name, maps[name]));
  }
};

/**
 * The default set of supported character maps.
 */
hterm.VT.CharacterMaps.DefaultMaps = {};

/**
 * VT100 Graphic character map.
 * http://vt100.net/docs/vt220-rm/table2-4.html
 */
hterm.VT.CharacterMaps.DefaultMaps['0'] = new hterm.VT.CharacterMap(
    'graphic', {
      '\x60':'\u25c6',  // ` -> diamond
      '\x61':'\u2592',  // a -> grey-box
      '\x62':'\u2409',  // b -> h/t
      '\x63':'\u240c',  // c -> f/f
      '\x64':'\u240d',  // d -> c/r
      '\x65':'\u240a',  // e -> l/f
      '\x66':'\u00b0',  // f -> degree
      '\x67':'\u00b1',  // g -> +/-
      '\x68':'\u2424',  // h -> n/l
      '\x69':'\u240b',  // i -> v/t
      '\x6a':'\u2518',  // j -> bottom-right
      '\x6b':'\u2510',  // k -> top-right
      '\x6c':'\u250c',  // l -> top-left
      '\x6d':'\u2514',  // m -> bottom-left
      '\x6e':'\u253c',  // n -> line-cross
      '\x6f':'\u23ba',  // o -> scan1
      '\x70':'\u23bb',  // p -> scan3
      '\x71':'\u2500',  // q -> scan5
      '\x72':'\u23bc',  // r -> scan7
      '\x73':'\u23bd',  // s -> scan9
      '\x74':'\u251c',  // t -> left-tee
      '\x75':'\u2524',  // u -> right-tee
      '\x76':'\u2534',  // v -> bottom-tee
      '\x77':'\u252c',  // w -> top-tee
      '\x78':'\u2502',  // x -> vertical-line
      '\x79':'\u2264',  // y -> less-equal
      '\x7a':'\u2265',  // z -> greater-equal
      '\x7b':'\u03c0',  // { -> pi
      '\x7c':'\u2260',  // | -> not-equal
      '\x7d':'\u00a3',  // } -> british-pound
      '\x7e':'\u00b7',  // ~ -> dot
    });

/**
 * British character map.
 * http://vt100.net/docs/vt220-rm/table2-5.html
 */
hterm.VT.CharacterMaps.DefaultMaps['A'] = new hterm.VT.CharacterMap(
    'british', {
      '\x23': '\u00a3',  // # -> british-pound
    });

/**
 * US ASCII map, no changes.
 */
hterm.VT.CharacterMaps.DefaultMaps['B'] = new hterm.VT.CharacterMap(
    'us', null);

/**
 * Dutch character map.
 * http://vt100.net/docs/vt220-rm/table2-6.html
 */
hterm.VT.CharacterMaps.DefaultMaps['4'] = new hterm.VT.CharacterMap(
    'dutch', {
      '\x23': '\u00a3',  // # -> british-pound

      '\x40': '\u00be',  // @ -> 3/4

      '\x5b': '\u0132',  // [ -> 'ij' ligature (xterm goes with \u00ff?)
      '\x5c': '\u00bd',  // \ -> 1/2
      '\x5d': '\u007c',  // ] -> vertical bar

      '\x7b': '\u00a8',  // { -> two dots
      '\x7c': '\u0066',  // | -> f
      '\x7d': '\u00bc',  // } -> 1/4
      '\x7e': '\u00b4',  // ~ -> acute
    });

/**
 * Finnish character map.
 * http://vt100.net/docs/vt220-rm/table2-7.html
 */
hterm.VT.CharacterMaps.DefaultMaps['C'] =
hterm.VT.CharacterMaps.DefaultMaps['5'] = new hterm.VT.CharacterMap(
    'finnish', {
      '\x5b': '\u00c4',  // [ -> 'A' umlaut
      '\x5c': '\u00d6',  // \ -> 'O' umlaut
      '\x5d': '\u00c5',  // ] -> 'A' ring
      '\x5e': '\u00dc',  // ~ -> 'u' umlaut

      '\x60': '\u00e9',  // ` -> 'e' acute

      '\x7b': '\u00e4',  // { -> 'a' umlaut
      '\x7c': '\u00f6',  // | -> 'o' umlaut
      '\x7d': '\u00e5',  // } -> 'a' ring
      '\x7e': '\u00fc',  // ~ -> 'u' umlaut
    });

/**
 * French character map.
 * http://vt100.net/docs/vt220-rm/table2-8.html
 */
hterm.VT.CharacterMaps.DefaultMaps['R'] = new hterm.VT.CharacterMap(
    'french', {
      '\x23': '\u00a3',  // # -> british-pound

      '\x40': '\u00e0',  // @ -> 'a' grave

      '\x5b': '\u00b0',  // [ -> ring
      '\x5c': '\u00e7',  // \ -> 'c' cedilla
      '\x5d': '\u00a7',  // ] -> section symbol (double s)

      '\x7b': '\u00e9',  // { -> 'e' acute
      '\x7c': '\u00f9',  // | -> 'u' grave
      '\x7d': '\u00e8',  // } -> 'e' grave
      '\x7e': '\u00a8',  // ~ -> umlaut
    });

/**
 * French Canadian character map.
 * http://vt100.net/docs/vt220-rm/table2-9.html
 */
hterm.VT.CharacterMaps.DefaultMaps['Q'] = new hterm.VT.CharacterMap(
    'french canadian', {
      '\x40': '\u00e0',  // @ -> 'a' grave

      '\x5b': '\u00e2',  // [ -> 'a' circumflex
      '\x5c': '\u00e7',  // \ -> 'c' cedilla
      '\x5d': '\u00ea',  // ] -> 'e' circumflex
      '\x5e': '\u00ee',  // ^ -> 'i' circumflex

      '\x60': '\u00f4',  // ` -> 'o' circumflex

      '\x7b': '\u00e9',  // { -> 'e' acute
      '\x7c': '\u00f9',  // | -> 'u' grave
      '\x7d': '\u00e8',  // } -> 'e' grave
      '\x7e': '\u00fb',  // ~ -> 'u' circumflex
    });

/**
 * German character map.
 * http://vt100.net/docs/vt220-rm/table2-10.html
 */
hterm.VT.CharacterMaps.DefaultMaps['K'] = new hterm.VT.CharacterMap(
    'german', {
      '\x40': '\u00a7',  // @ -> section symbol (double s)

      '\x5b': '\u00c4',  // [ -> 'A' umlaut
      '\x5c': '\u00d6',  // \ -> 'O' umlaut
      '\x5d': '\u00dc',  // ] -> 'U' umlaut

      '\x7b': '\u00e4',  // { -> 'a' umlaut
      '\x7c': '\u00f6',  // | -> 'o' umlaut
      '\x7d': '\u00fc',  // } -> 'u' umlaut
      '\x7e': '\u00df',  // ~ -> eszett
    });

/**
 * Italian character map.
 * http://vt100.net/docs/vt220-rm/table2-11.html
 */
hterm.VT.CharacterMaps.DefaultMaps['Y'] = new hterm.VT.CharacterMap(
    'italian', {
      '\x23': '\u00a3',  // # -> british-pound

      '\x40': '\u00a7',  // @ -> section symbol (double s)

      '\x5b': '\u00b0',  // [ -> ring
      '\x5c': '\u00e7',  // \ -> 'c' cedilla
      '\x5d': '\u00e9',  // ] -> 'e' acute

      '\x60': '\u00f9',  // ` -> 'u' grave

      '\x7b': '\u00e0',  // { -> 'a' grave
      '\x7c': '\u00f2',  // | -> 'o' grave
      '\x7d': '\u00e8',  // } -> 'e' grave
      '\x7e': '\u00ec',  // ~ -> 'i' grave
    });

/**
 * Norwegian/Danish character map.
 * http://vt100.net/docs/vt220-rm/table2-12.html
 */
hterm.VT.CharacterMaps.DefaultMaps['E'] =
hterm.VT.CharacterMaps.DefaultMaps['6'] = new hterm.VT.CharacterMap(
    'norwegian/danish', {
      '\x40': '\u00c4',  // @ -> 'A' umlaut

      '\x5b': '\u00c6',  // [ -> 'AE' ligature
      '\x5c': '\u00d8',  // \ -> 'O' stroke
      '\x5d': '\u00c5',  // ] -> 'A' ring
      '\x5e': '\u00dc',  // ^ -> 'U' umlaut

      '\x60': '\u00e4',  // ` -> 'a' umlaut

      '\x7b': '\u00e6',  // { -> 'ae' ligature
      '\x7c': '\u00f8',  // | -> 'o' stroke
      '\x7d': '\u00e5',  // } -> 'a' ring
      '\x7e': '\u00fc',  // ~ -> 'u' umlaut
    });

/**
 * Spanish character map.
 * http://vt100.net/docs/vt220-rm/table2-13.html
 */
hterm.VT.CharacterMaps.DefaultMaps['Z'] = new hterm.VT.CharacterMap(
    'spanish', {
      '\x23': '\u00a3',  // # -> british-pound

      '\x40': '\u00a7',  // @ -> section symbol (double s)

      '\x5b': '\u00a1',  // [ -> '!' inverted
      '\x5c': '\u00d1',  // \ -> 'N' tilde
      '\x5d': '\u00bf',  // ] -> '?' inverted

      '\x7b': '\u00b0',  // { -> ring
      '\x7c': '\u00f1',  // | -> 'n' tilde
      '\x7d': '\u00e7',  // } -> 'c' cedilla
    });

/**
 * Swedish character map.
 * http://vt100.net/docs/vt220-rm/table2-14.html
 */
hterm.VT.CharacterMaps.DefaultMaps['7'] =
hterm.VT.CharacterMaps.DefaultMaps['H'] = new hterm.VT.CharacterMap(
    'swedish', {
      '\x40': '\u00c9',  // @ -> 'E' acute

      '\x5b': '\u00c4',  // [ -> 'A' umlaut
      '\x5c': '\u00d6',  // \ -> 'O' umlaut
      '\x5d': '\u00c5',  // ] -> 'A' ring
      '\x5e': '\u00dc',  // ^ -> 'U' umlaut

      '\x60': '\u00e9',  // ` -> 'e' acute

      '\x7b': '\u00e4',  // { -> 'a' umlaut
      '\x7c': '\u00f6',  // | -> 'o' umlaut
      '\x7d': '\u00e5',  // } -> 'a' ring
      '\x7e': '\u00fc',  // ~ -> 'u' umlaut
    });

/**
 * Swiss character map.
 * http://vt100.net/docs/vt220-rm/table2-15.html
 */
hterm.VT.CharacterMaps.DefaultMaps['='] = new hterm.VT.CharacterMap(
    'swiss', {
      '\x23': '\u00f9',  // # -> 'u' grave

      '\x40': '\u00e0',  // @ -> 'a' grave

      '\x5b': '\u00e9',  // [ -> 'e' acute
      '\x5c': '\u00e7',  // \ -> 'c' cedilla
      '\x5d': '\u00ea',  // ] -> 'e' circumflex
      '\x5e': '\u00ee',  // ^ -> 'i' circumflex
      '\x5f': '\u00e8',  // _ -> 'e' grave

      '\x60': '\u00f4',  // ` -> 'o' circumflex

      '\x7b': '\u00e4',  // { -> 'a' umlaut
      '\x7c': '\u00f6',  // | -> 'o' umlaut
      '\x7d': '\u00fc',  // } -> 'u' umlaut
      '\x7e': '\u00fb',  // ~ -> 'u' circumflex
    });
