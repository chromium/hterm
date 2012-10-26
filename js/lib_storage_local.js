// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * window.localStorage based class with an async interface that is
 * interchangeable with other lib.Storage.* implementations.
 */
lib.Storage.Local = function() {
  this.observers_ = [];
  this.storage_ = window.localStorage;
  window.addEventListener('storage', this.onStorage_.bind(this));
};

/**
 * Called by the storage implementation when the storage is modified.
 */
lib.Storage.Local.prototype.onStorage_ = function(e) {
  if (e.storageArea != this.storage_)
    return;

  var o = {};
  o[e.key] = {
    oldValue: JSON.parse(e.oldValue),
    newValue: JSON.parse(e.newValue)
  };

  for (var i = 0; i < this.observers_.length; i++) {
    this.observers_[i](o);
  }
};

/**
 * Register a function to observe storage changes.
 *
 * @param {function(map)} callback The function to invoke when the storage
 *     changes.
 */
lib.Storage.Local.prototype.addObserver = function(callback) {
  this.observers_.push(callback);
};

/**
 * Unregister a change observer.
 *
 * @param {function} observer A previously registered callback.
 */
lib.Storage.Local.prototype.removeObserver = function(callback) {
  var i = this.observers_.indexOf(callback);
  if (i != -1)
    this.observers_.splice(i, 1);
};

/**
 * Delete everything in this storage.
 *
 * @param {function(map)} callback The function to invoke when the delete
 *     has completed.
 */
lib.Storage.Local.prototype.clear = function(opt_callback) {
  this.storage_.clear();

  if (opt_callback)
    setTimeout(opt_callback, 0);
};

/**
 * Return the current value of a storage item.
 *
 * @param {string} key The key to look up.
 * @param {function(value) callback The function to invoke when the value has
 *     been retrieved.
 */
lib.Storage.Local.prototype.getItem = function(key, callback) {
  var value = this.storage_.getItem(key);

  if (typeof value == 'string') {
    try {
      value = JSON.parse(value);
    } catch (e) {
      // If we can't parse the value, just return it unparsed.
    }
  }

  setTimeout(callback.bind(null, value), 0);
};

/**
 * Fetch the values of multiple storage items.
 *
 * @param {Array} keys The keys to look up.
 * @param {function(map) callback The function to invoke when the values have
 *     been retrieved.
 */
lib.Storage.Local.prototype.getItems = function(keys, callback) {
  var rv = {};

  for (var i = keys.length - 1; i >= 0; i--) {
    var key = keys[i];
    var value = this.storage_.getItem(key);
    if (typeof value == 'string') {
      try {
        rv[key] = JSON.parse(value);
      } catch (e) {
        // If we can't parse the value, just return it unparsed.
        rv[key] = value;
      }
    } else {
      keys.splice(i, 1);
    }
  }

  setTimeout(callback.bind(null, rv), 0);
};

/**
 * Set a value in storage.
 *
 * @param {string} key The key for the value to be stored.
 * @param {*} value The value to be stored.  Anything that can be serialized
 *     with JSON is acceptable.
 * @param {function()} opt_callback Optional function to invoke when the
 *     set is complete.  You don't have to wait for the set to complete in order
 *     to read the value, since the local cache is updated synchronously.
 */
lib.Storage.Local.prototype.setItem = function(key, value, opt_callback) {
  this.storage_.setItem(key, JSON.stringify(value));

  if (opt_callback)
    setTimeout(opt_callback);
};

/**
 * Set multiple values in storage.
 *
 * @param {Object} map A map of key/values to set in storage.
 * @param {function()} opt_callback Optional function to invoke when the
 *     set is complete.  You don't have to wait for the set to complete in order
 *     to read the value, since the local cache is updated synchronously.
 */
lib.Storage.Local.prototype.setItems = function(obj, opt_callback) {
  for (var key in obj) {
    this.storage_.setItem(key, JSON.stringify(obj[key]));
  }

  if (opt_callback)
    setTimeout(opt_callback);
};

/**
 * Remove an item from storage.
 *
 * @param {string} key The key to be removed.
 * @param {function()} opt_callback Optional function to invoke when the
 *     remove is complete.  You don't have to wait for the set to complete in
 *     order to read the value, since the local cache is updated synchronously.
 */
lib.Storage.Local.prototype.removeItem = function(key, opt_callback) {
  this.storage_.removeItem(key);

  if (opt_callback)
    setTimeout(opt_callback);
};

/**
 * Remove multiple items from storage.
 *
 * @param {Array} keys The keys to be removed.
 * @param {function()} opt_callback Optional function to invoke when the
 *     remove is complete.  You don't have to wait for the set to complete in
 *     order to read the value, since the local cache is updated synchronously.
 */
lib.Storage.Local.prototype.removeItems = function(ary, opt_callback) {
  for (var i = 0; i < ary.length; i++) {
    this.storage_.removeItem(ary[i]);
  }

  if (opt_callback)
    setTimeout(opt_callback);
};
