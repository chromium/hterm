// Copyright (c) 2015 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * A record of modifier bits and keycode used to define a key binding.
 *
 * The modifier names are enumerated in the static KeyPattern.modifiers
 * property below.  Each modifier can be true, false, or "*".  True means
 * the modifier key must be present, false means it must not, and "*" means
 * it doesn't matter.
 */
hterm.Keyboard.KeyPattern = function(spec) {
  this.wildcardCount = 0;
  this.keyCode = spec.keyCode;

  hterm.Keyboard.KeyPattern.modifiers.forEach(function(mod) {
    this[mod] = spec[mod] || false;
    if (this[mod] == '*')
      this.wildcardCount++;
  }.bind(this));
};

/**
 * Valid modifier names.
 */
hterm.Keyboard.KeyPattern.modifiers = [
  'shift', 'ctrl', 'alt', 'meta'
];

/**
 * A compare callback for Array.prototype.sort().
 *
 * The bindings code wants to be sure to search through the strictest key
 * patterns first, so that loosely defined patterns have a lower priority than
 * exact patterns.
 *
 * @param {hterm.Keyboard.KeyPattern} a
 * @param {hterm.Keyboard.KeyPattern} b
 */
hterm.Keyboard.KeyPattern.sortCompare = function(a, b) {
  if (a.wildcardCount < b.wildcardCount)
    return -1;

  if (a.wildcardCount > b.wildcardCount)
    return 1;

  return 0;
};

/**
 * Private method used to match this key pattern against other key patterns
 * or key down events.
 *
 * @param {Object} The object to match.
 * @param {boolean} True if we should ignore wildcards.  Useful when you want
 *   to perform and exact match against another key pattern.
 */
hterm.Keyboard.KeyPattern.prototype.match_ = function(obj, exactMatch) {
  if (this.keyCode != obj.keyCode)
    return false;

  var rv = true;

  hterm.Keyboard.KeyPattern.modifiers.forEach(function(mod) {
    var modValue = (mod in obj) ? obj[mod] : false;
    if (!rv || (!exactMatch && this[mod] == '*') || this[mod] == modValue)
      return;

    rv = false;
  }.bind(this));

  return rv;
};

/**
 * Return true if the given keyDown object is a match for this key pattern.
 *
 * @param {Object} keyDown An object with a keyCode property and zero or
 *   more boolean properties representing key modifiers.  These property names
 *   must match those defined in hterm.Keyboard.KeyPattern.modifiers.
 */
hterm.Keyboard.KeyPattern.prototype.matchKeyDown = function(keyDown) {
  return this.match_(keyDown, false);
};

/**
 * Return true if the given hterm.Keyboard.KeyPattern is exactly the same as
 * this one.
 *
 * @param {hterm.Keyboard.KeyPattern}
 */
hterm.Keyboard.KeyPattern.prototype.matchKeyPattern = function(keyPattern) {
  return this.match_(keyPattern, true);
};
