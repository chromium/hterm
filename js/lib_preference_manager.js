// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * Constructor for lib.PreferenceManager objects.
 *
 * These objects deal with persisting changes to stable storage and notifying
 * consumers when preferences change.
 *
 * It is intended that the backing store could be something other than HTML5
 * storage, but there aren't any use cases at the moment.  In the future there
 * may be a chrome api to store sync-able name/value pairs, and we'd want
 * that.
 *
 * @param {string} opt_prefix The optional prefix to be used for all preference
 *     names.  The '/' character should be used to separate levels of heirarchy,
 *     if you're going to have that kind of thing.  If provided, the prefix
 *     should start with a '/'.  If not provided, it defaults to '/'.
 * @param {Storage} opt_storage The storage object to use as a backing store.
 *     Defaults to window.localStorage.
 * @param {EventTarget} opt_eventsource The object that will generate 'storage'
 *     events for the provided storage object.  These events tell us when
 *     another page has made a modification to the stored data.
 */
lib.PreferenceManager = function(opt_prefix, opt_storage, opt_eventsource) {
  var prefix = opt_prefix || '';
  if (prefix.substr(prefix.length - 1) != '/')
    prefix += '/';

  this.prefix_ = prefix;
  this.storage_ = opt_storage || window.localStorage;
  this.eventSource_ = opt_eventsource || window;

  this.prefDefs_ = {};
  this.globalObservers_ = [];

  // Pending set operations managed by the setLater method.
  this.pendingSets_ = {};

  this.eventSource_.addEventListener('storage',
                                     this.onStorageEvent_.bind(this), false);
};

/**
 * Define a preference.
 *
 * This registers a name, default value, and onChange handler for a preference.
 *
 * @param {string} key The name of the preference.  This will be prefixed by
 *     the prefix of this PreferenceManager before written to local storage.
 * @param {string|number|boolean|Object|Array|null} value The default value of
 *     this preference.  Anything that can be represented in JSON is a valid
 *     default value.
 */
lib.PreferenceManager.prototype.definePreference = function(
    key, value, opt_onChange) {
  var observers = opt_onChange ? [opt_onChange] : [];
  this.prefDefs_[key] = { defaultValue: value, observers: observers };
};

/**
 * Define multiple preferences with a single function call.
 *
 * @param {Array} defaults An array of 3-element arrays.  Each three element
 *     array should contain the [key, value, onChange] parameters for a
 *     preference.
 */
lib.PreferenceManager.prototype.definePreferences = function(defaults) {
  for (var i = 0; i < defaults.length; i++) {
    this.definePreference(defaults[i][0], defaults[i][1], defaults[i][2]);
  }
};

/**
 * Define multiple preferences with a single function call.
 *
 * @param {Array} defaults An array of 3-element arrays.  Each three element
 *     array should contain the [key, value, onChange] parameters for a
 *     preference.
 */
lib.PreferenceManager.prototype.observePreferences = function(global, map) {
  if (global)
    this.globalObservers_.push(global);

  if (!map)
    return;

  for (var key in map) {
    if (!(key in this.prefDefs_))
      throw new Error('Unknown preference: ' + key);

    var prefDef = this.prefDefs_[key];
    prefDef.observers.push(map[key]);
  }
};

/**
 * Dispatch the onChange handler for all known preferences.
 *
 * This can be used if you've changed a preference manager out from under
 * a live object (say to switch to a different prefix), in order to get
 * the application state in sync with the backing store.
 */
lib.PreferenceManager.prototype.notifyAll = function() {
  for (var key in this.prefDefs_) {
    this.notifyChange_(key);
  }
};

/**
 * Dispatch the onChange handler for a given preference.
 *
 * @param {string} key The preference to notify for, minus the prefix of
 *     this PreferenceManager.
 */
lib.PreferenceManager.prototype.notifyChange_ = function(key) {
  for (var i = 0; i < this.globalObservers_.length; i++)
    this.globalObservers_[i](key, this.get(key));

  var observers = this.prefDefs_[key].observers;
  for (var i = 0; i < observers.length; i++)
    observers[i](this.get(key), key, this);
};

/**
 * Reset a preference to its default state.
 *
 * This will dispatch the onChange handler if the preference value actually
 * changes.
 *
 * @param {string} key The preference to reset.
 */
lib.PreferenceManager.prototype.reset = function(key) {
  var oldValue = this.get(key);
  this.storage_.removeItem(this.prefix_ + key);
  if (oldValue != this.get(key))
    this.notifyChange_(key);
};

lib.PreferenceManager.prototype.resetAll = function() {
  for (var key in this.prefDefs_) {
    this.reset(key);
  }
};

/**
 * Set a preference to a specific value.
 *
 * This will dispatch the onChange handler if the preference value actually
 * changes.
 *
 * @param {string} key The preference to set.
 * @param {*} value The value to set.  Anything that can be represented in
 *     JSON is a valid value.
 */
lib.PreferenceManager.prototype.set = function(key, value) {
  var prefDef = this.prefDefs_[key];
  if (!prefDef)
    throw new Error('Request to set unknown pref: ' + key);

  var oldValue = this.get(key);
  this.storage_.setItem(this.prefix_ + key, JSON.stringify(value));
  if (oldValue != this.get(key))
    this.notifyChange_(key);
};

/**
 * Set a preference after a short delay, in order to debounce multiple sets.
 *
 * If this function is invoked multiple times before the delay expires, the
 * pref will be saved just once, with the most recent value.
 *
 * @param {string} key The preference to set.
 * @param {*} value The value to set.  Anything that can be represented in
 *     JSON is a valid value.
 * @param {integer} opt_delay_ms Optional amount of time to wait, in
 *     milliseconds.  Defaults to 500ms.
 */
lib.PreferenceManager.prototype.setLater = function(key, value, opt_delay_ms) {
  var delay_ms = opt_delay_ms || 500;

  if (!(key in this.pendingSets_)) {
    setTimeout(function() {
        this.set(key, this.pendingSets_[key]);
        delete this.pendingSets_[key];
      }.bind(this),
      delay_ms);
  }

  this.pendingSets_[key] = value;
};

/**
 * Get the value of a preference.
 *
 * @param {string} key The preference to get.
 */
lib.PreferenceManager.prototype.get = function(key) {
  var rv = this.storage_.getItem(this.prefix_ + key);
  if (rv === null) {
    var prefDef = this.prefDefs_[key];
    if (!prefDef) {
      console.warn('Request for unknown pref: ' + key);
      return null;
    }

    return prefDef.defaultValue;
  }

  return JSON.parse(rv);
};

/**
 * List all preference keys that start with a given prefix.
 *
 * The prefix will be added to the prefix of this PreferenceManager.
 *
 * @param {string} opt_prefix Optional prefix.
 */
lib.PreferenceManager.prototype.listKeys = function(opt_prefix) {
  var rv = [];

  for (var i = 0; i < this.storage_.length; i++) {
    var key = this.storage_.key(i);
    if (this.prefix_) {
      // First check that the key starts with the prefix of this preference
      // manager.
      if (key.substr(0, this.prefix_.length) != this.prefix_)
        continue;

      key = key.substr(this.prefix_.length);
    }

    if (opt_prefix) {
      // Then check that it also starts with the prefix requested for this
      // listing.
      if (key.substr(0, opt_prefix.length) != opt_prefix)
        continue;

      key = key.substr(opt_prefix.length);
    }

    rv.push(key);
  }

  return rv.sort();
};

/**
 * Called when a key in the storage changes.
 */
lib.PreferenceManager.prototype.onStorageEvent_ = function(e) {
  if (e.storageArea != this.storage_)
    return;

  var key = e.key;
  if (this.prefix_) {
    if (key.substr(0, this.prefix_.length) != this.prefix_)
      return;

    key = key.substr(this.prefix_.length);
  }

  if (key in this.prefDefs_) {
    // Sometimes we'll get notified about prefs that are no longer defined.
    this.notifyChange_(key);
  }
};
