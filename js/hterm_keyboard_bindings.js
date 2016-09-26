// Copyright (c) 2015 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * A mapping from hterm.Keyboard.KeyPattern to an action.
 *
 * TODO(rginda): For now this bindings code is only used for user overrides.
 * hterm.Keyboard.KeyMap still handles all of the built-in key mappings.
 * It'd be nice if we migrated that over to be hterm.Keyboard.Bindings based.
 */
hterm.Keyboard.Bindings = function() {
  this.bindings_ = {};
};

/**
 * Remove all bindings.
 */
hterm.Keyboard.Bindings.prototype.clear = function () {
  this.bindings_ = {};
};

/**
 * Add a new binding.
 *
 * Internal API that assumes parsed objects as inputs.
 * See the public addBinding for more details.
 *
 * @param {hterm.Keyboard.KeyPattern} keyPattern
 * @param {string|function|hterm.Keyboard.KeyAction} action
 */
hterm.Keyboard.Bindings.prototype.addBinding_ = function(keyPattern, action) {
  var binding = null;
  var list = this.bindings_[keyPattern.keyCode];
  if (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].keyPattern.matchKeyPattern(keyPattern)) {
        binding = list[i];
        break;
      }
    }
  }

  if (binding) {
    binding.action = action;
  } else {
    binding = {keyPattern: keyPattern, action: action};

    if (!list) {
      this.bindings_[keyPattern.keyCode] = [binding];
    } else {
      this.bindings_[keyPattern.keyCode].push(binding);

      list.sort(function(a, b) {
        return hterm.Keyboard.KeyPattern.sortCompare(
            a.keyPattern, b.keyPattern);
      });
    }
  }
};

/**
 * Add a new binding.
 *
 * If a binding for the keyPattern already exists it will be overridden.
 *
 * More specific keyPatterns take precedence over those with wildcards.  Given
 * bindings for "Ctrl-A" and "Ctrl-*-A", and a "Ctrl-A" keydown, the "Ctrl-A"
 * binding will match even if "Ctrl-*-A" was created last.
 *
 * If action is a string, it will be passed through hterm.Parser.parseKeyAction.
 *
 * For example:
 *   // Will replace Ctrl-P keystrokes with the string "hiya!".
 *   addBinding('Ctrl-P', "'hiya!'");
 *   // Will cancel the keystroke entirely (make it do nothing).
 *   addBinding('Alt-D', hterm.Keyboard.KeyActions.CANCEL);
 *   // Will execute the code and return the action.
 *   addBinding('Ctrl-T', function() {
 *     console.log('Got a T!');
 *     return hterm.Keyboard.KeyActions.PASS;
 *   });
 *
 * @param {string|hterm.Keyboard.KeyPattern} keyPattern
 * @param {string|function|hterm.Keyboard.KeyAction} action
 */
hterm.Keyboard.Bindings.prototype.addBinding = function(key, action) {
  // If we're given a hterm.Keyboard.KeyPattern object, pass it down.
  if (typeof key != 'string') {
    this.addBinding_(key, action);
    return;
  }

  // Here we treat key as a string.
  var p = new hterm.Parser();

  p.reset(key);
  var sequence;

  try {
    sequence = p.parseKeySequence();
  } catch (ex) {
    console.error(ex);
    return;
  }

  if (!p.isComplete()) {
    console.error(p.error('Expected end of sequence: ' + sequence));
    return;
  }

  // If action is a string, parse it.  Otherwise assume it's callable.
  if (typeof action == 'string') {
    p.reset(action);
    try {
      action = p.parseKeyAction();
    } catch (ex) {
      console.error(ex);
      return;
    }
  }

  if (!p.isComplete()) {
    console.error(p.error('Expected end of sequence: ' + sequence));
    return;
  }

  this.addBinding_(new hterm.Keyboard.KeyPattern(sequence), action);
};

/**
 * Add multiple bindings at a time using a map of {string: string, ...}
 *
 * This uses hterm.Parser to parse the maps key into KeyPatterns, and the
 * map values into {string|function|KeyAction}.
 *
 * For example:
 *  {
 *    // Will replace Ctrl-P keystrokes with the string "hiya!".
 *    'Ctrl-P': "'hiya!'",
 *    // Will cancel the keystroke entirely (make it do nothing).
 *    'Alt-D': hterm.Keyboard.KeyActions.CANCEL,
 *  }
 *
 * @param {Object} map
 */
hterm.Keyboard.Bindings.prototype.addBindings = function(map) {
  for (var key in map) {
    this.addBinding(key, map[key]);
  }
};

/**
 * Return the binding that is the best match for the given keyDown record,
 * or null if there is no match.
 *
 * @param {Object} keyDown An object with a keyCode property and zero or
 *   more boolean properties representing key modifiers.  These property names
 *   must match those defined in hterm.Keyboard.KeyPattern.modifiers.
 */
hterm.Keyboard.Bindings.prototype.getBinding = function(keyDown) {
  var list = this.bindings_[keyDown.keyCode];
  if (!list)
    return null;

  for (var i = 0; i < list.length; i++) {
    var binding = list[i];
    if (binding.keyPattern.matchKeyDown(keyDown))
      return binding;
  }

  return null;
};
