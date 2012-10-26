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
 * @param {lib.Storage.*} storage The storage object to use as a backing
 *     store.
 * @param {string} opt_prefix The optional prefix to be used for all preference
 *     names.  The '/' character should be used to separate levels of heirarchy,
 *     if you're going to have that kind of thing.  If provided, the prefix
 *     should start with a '/'.  If not provided, it defaults to '/'.
 */
lib.PreferenceManager = function(storage, opt_prefix) {
  this.storage_ = storage;
  this.storageObserver_ = this.onStorageChange_.bind(this);

  this.isActive_ = false;
  this.activate();

  var prefix = opt_prefix || '/';
  if (prefix.substr(prefix.length - 1) != '/')
    prefix += '/';

  this.prefix_ = prefix;

  this.prefRecords_ = {};
  this.globalObservers_ = [];

  this.childClasses_ = {};
  this.childLists_ = {};
};

/**
 * Used internally to indicate that the current value of the preference should
 * be taken from the default value defined with the preference.
 *
 * Equality tests against this value MUST use '===' or '!==' to be accurate.
 */
lib.PreferenceManager.prototype.DEFAULT_VALUE = new String('DEFAULT');

/**
 * An individual preference.
 *
 * These objects are managed by the PreferenceManager, you shoudn't need to
 * handle them directly.
 */
lib.PreferenceManager.Record = function(name, defaultValue) {
  this.name = name;
  this.defaultValue = defaultValue;
  this.currentValue = this.DEFAULT_VALUE;
  this.observers = [];
};

/**
 * A local copy of the DEFAULT_VALUE constant to make it less verbose.
 */
lib.PreferenceManager.Record.prototype.DEFAULT_VALUE =
    lib.PreferenceManager.prototype.DEFAULT_VALUE;

/**
 * Register a callback to be invoked when this preference changes.
 *
 * @param {function(value, string, lib.PreferenceManager} observer The function
 *     to invoke.  It will receive the new value, the name of the preference,
 *     and a reference to the PreferenceManager as parameters.
 */
lib.PreferenceManager.Record.prototype.addObserver = function(observer) {
  this.observers.push(observer);
};

/**
 * Unregister an observer callback.
 *
 * @param {function} observer A previously registered callback.
 */
lib.PreferenceManager.Record.prototype.removeObserver = function(observer) {
  var i = this.observers.indexOf(observer);
  if (i >= 0)
    this.observers.splice(i, 1);
};

/**
 * Fetch the value of this preference.
 */
lib.PreferenceManager.Record.prototype.get = function() {
  if (this.currentValue === this.DEFAULT_VALUE) {
    if (/^(string|number)$/.test(typeof this.defaultValue))
      return this.defaultValue;

    if (typeof this.defaultValue == 'object') {
      // We want to return a COPY of the default value so that users can
      // modify the array or object without changing the default value.
      return JSON.parse(JSON.stringify(this.defaultValue));
    }

    return this.defaultValue;
  }

  return this.currentValue;
};

/**
 * Stop this preference manager from tracking storage changes.
 *
 * Call this if you're going to swap out one preference manager for another so
 * that you don't get notified about irrelevant changes.
 */
lib.PreferenceManager.prototype.deactivate = function() {
  if (!this.isActive_)
    throw new Error('Not activated');

  this.isActive_ = false;
  this.storage_.removeObserver(this.storageObserver_);
};

/**
 * Start tracking storage changes.
 *
 * If you previously deactivated this preference manager, you can reactivate it
 * with this method.  You don't need to call this at initialization time, as
 * it's automatically called as part of the constructor.
 */
lib.PreferenceManager.prototype.activate = function() {
  if (this.isActive_)
    throw new Error('Already activated');

  this.isActive_ = true;
  this.storage_.addObserver(this.storageObserver_);
};

/**
 * Read the backing storage for these preferences.
 *
 * You should do this once at initialization time to prime the local cache
 * of preference values.  The preference manager will monitor the backing
 * storage for changes, so you should not need to call this more than once.
 *
 * This function recursively reads storage for all child preference managers as
 * well.
 *
 * This function is asynchronous, if you need to read preference values, you
 * *must* wait for the callback.
 *
 * @param {function()} opt_callback Optional function to invoke when the read
 *     has completed.
 */
lib.PreferenceManager.prototype.readStorage = function(opt_callback) {
  var pendingChildren = 0;

  function onChildComplete() {
    if (--pendingChildren == 0 && opt_callback)
      opt_callback();
  }

  var keys = Object.keys(this.prefRecords_).map(
      function(el) { return this.prefix_ + el }.bind(this));

  this.storage_.getItems(keys, function(items) {
      var prefixLength = this.prefix_.length;

      for (var key in items) {
        var value = items[key];
        var name = key.substr(prefixLength);

        var needSync = (name in this.childLists_ &&
                        (JSON.stringify(value) !=
                         JSON.stringify(this.prefRecords_[name].currentValue)));

        this.prefRecords_[name].currentValue = value;

        if (needSync) {
          pendingChildren++;
          this.syncChildList(name, onChildComplete);
        }
      }

      if (pendingChildren == 0 && opt_callback)
        setTimeout(opt_callback);
    }.bind(this));
};

/**
 * Define a preference.
 *
 * This registers a name, default value, and onChange handler for a preference.
 *
 * @param {string} name The name of the preference.  This will be prefixed by
 *     the prefix of this PreferenceManager before written to local storage.
 * @param {string|number|boolean|Object|Array|null} value The default value of
 *     this preference.  Anything that can be represented in JSON is a valid
 *     default value.
 * @param {function(value, string, lib.PreferenceManager} opt_observer A
 *     function to invoke when the preference changes.  It will receive the new
 *     value, the name of the preference, and a reference to the
 *     PreferenceManager as parameters.
 */
lib.PreferenceManager.prototype.definePreference = function(
    name, value, opt_onChange) {
  if (name in this.prefRecords_)
    throw new Error('Duplicate preference: ' + name);

  this.prefRecords_[name] = new lib.PreferenceManager.Record(name, value);

  if (opt_onChange)
    this.prefRecords_[name].addObserver(opt_onChange);
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
 * Define an ordered list of child preferences.
 *
 * Child preferences are different from just storing an array of JSON objects
 * in that each child is an instance of a preference manager.  This means you
 * can observe changes to individual child preferences, and get some validation
 * that you're not reading or writing to an undefined child preference value.
 *
 * @param {string} listName A name for the list of children.  This must be
 *     unique in this preference manager.  The listName will become a
 *     preference on this PreferenceManager used to store the ordered list of
 *     child ids.  It is also used in get/add/remove operations to identify the
 *     list of children to operate on.
 * @param {lib.PreferenceManager} childClass A subclass of lib.PreferenceManager
 *     defining the child preferences you wish to store.  The constructor
 *     function will receive a lib.Storage object, and a unique id for the
 *     child preferences.  It is the subclasses responsibility to prefix the
 *     id with an appropriate string.
 */
lib.PreferenceManager.prototype.defineChildren = function(
    listName, childClass) {

  // Define a preference to hold the ordered list of child ids.
  this.definePreference(listName, [],
                        this.onChildListChange_.bind(this, listName));
  this.childClasses_[listName] = childClass;
  this.childLists_[listName] = {};
};

/**
 * Register to observe preference changes.
 *
 * @param {Function} global A callback that will happen for every preference.
 *     Pass null if you don't need one.
 * @param {Object} map A map of preference specific callbacks.  Pass null if
 *     you don't need any.
 */
lib.PreferenceManager.prototype.addObservers = function(global, map) {
  if (global)
    this.globalObservers_.push(global);

  if (!map)
    return;

  for (var name in map) {
    if (!(name in this.prefRecords_))
      throw new Error('Unknown preference: ' + name);

    this.prefRecords_[name].addObserver(map[name]);
  }
};

/**
 * Dispatch the change observers for all known preferences.
 *
 * It may be useful to call this after readStorage completes, in order to
 * get application state in sync with user preferences.
 *
 * This can be used if you've changed a preference manager out from under
 * a live object, for example when switching to a different prefix.
 */
lib.PreferenceManager.prototype.notifyAll = function() {
  for (var name in this.prefRecords_) {
    this.notifyChange_(name);
  }
};

/**
 * Notify the change observers for a given preference.
 *
 * @param {string} name The name of the preference that changed.
 */
lib.PreferenceManager.prototype.notifyChange_ = function(name) {
  var record = this.prefRecords_[name];
  if (!record)
    throw new Error('Unknown pref: ' + name);

  var currentValue = record.get();

  for (var i = 0; i < this.globalObservers_.length; i++)
    this.globalObservers_[i](name, currentValue);

  for (var i = 0; i < record.observers.length; i++) {
    record.observers[i](currentValue, name, this);
  }
};

/**
 * Create a new child PreferenceManager for the given child list.
 *
 * @param {string} listName The child list to create the new instance from.
 */
lib.PreferenceManager.prototype.createChild = function(listName) {
  var ids = this.get(listName);
  var id;

  // Pick a random, unique 4-digit hex identifier for the new profile.
  while (!id || ids.indexOf(id) != -1) {
    id = Math.floor(Math.random() * 0xffff + 1).toString(16);
    id = lib.f.zpad(id, 4);
  }

  var childManager = new this.childClasses_[listName](this.storage_, id);
  childManager.resetAll();

  this.childLists_[listName][id] = childManager;

  ids.push(id);
  this.set(listName, ids);

  return childManager;
};

/**
 * Remove a child preferences instance.
 *
 * Removes a child preference manager and clears any preferences stored in it.
 *
 * @param {string} listName The name of the child list containing the child to
 *     remove.
 * @param {string} id The child ID.
 */
lib.PreferenceManager.prototype.removeChild = function(listName, id) {
  var prefs = this.getChild(listName, id);
  prefs.resetAll();

  var ids = this.get(listName);
  var i = ids.indexOf(id);
  if (i != -1) {
    ids.splice(i, 1);
    this.set(listName, ids);
  }

  delete this.childLists_[listName][id];
};

/**
 * Return a child PreferenceManager instance for a given id.
 *
 * If the child list or child id is not known this will throw an exception.
 *
 * @param {string} listName The child list to look in.
 * @param {string} id The child ID.
 */
lib.PreferenceManager.prototype.getChild = function(listName, id) {
  if (!(listName in this.childLists_))
      throw new Error('Unknown child list: ' + listName);

  var childList = this.childLists_[listName];
  if (!(id in childList))
      throw new Error('Unknown child id: ' + listName + ': ' + id);

  return childList[id];
};

/**
 * Synchronize a list of child PreferenceManagers instances with the current
 * list stored in prefs.
 *
 * This will instantiate any missing managers and read current preference values
 * from storage.  Any active managers that no longer appear in preferences will
 * be deleted.
 *
 * @param {string} listName The child list to synchronize.
 * @param {function()} opt_callback Optional function to invoke when the sync
 *     is complete.
 */
lib.PreferenceManager.prototype.syncChildList = function(
    listName, opt_callback) {

  var pendingChildren = 0;
  function onChildStorage() {
    if (--pendingChildren == 0 && opt_callback)
      opt_callback();
  }

  // The list of child ids that we *should* have a manager for.
  var currentIds = this.get(listName);

  // The known managers at the start of the sync.  Any manager still in this
  // list at the end should be discarded.
  var oldManagers = Object.keys(this.childLists_[listName]);

  for (var i = 0; i < currentIds.length; i++) {
    var id = currentIds[i];

    var managerIndex = oldManagers.indexOf(id);
    if (managerIndex >= 0)
      oldManagers.splice(managerIndex, 1);

    if (!this.childLists_[listName][id]) {
      var childManager = new this.childClasses_[listName](this.storage_, id);
      this.childLists_[listName][id] = childManager;
      pendingChildren++;
      childManager.readStorage(onChildStorage);
    }
  }

  for (var i = 0; i < oldManagers.length; i++) {
    delete this.childLists_[listName][oldManagers[i]];
  }

  if (!pendingChildren && opt_callback)
    setTimeout(opt_callback);
};

/**
 * Reset a preference to its default state.
 *
 * This will dispatch the onChange handler if the preference value actually
 * changes.
 *
 * @param {string} name The preference to reset.
 */
lib.PreferenceManager.prototype.reset = function(name) {
  var record = this.prefRecords_[name];
  if (!record)
    throw new Error('Unknown preference: ' + name);

  this.storage_.removeItem(this.prefix_ + name);

  if (record.currentValue !== this.DEFAULT_VALUE) {
    record.currentValue = this.DEFAULT_VALUE;
    this.notifyChange_(name);
  }
};

/**
 * Reset all preferences back to their default state.
 */
lib.PreferenceManager.prototype.resetAll = function() {
  var changed = [];

  for (var name in this.prefRecords_) {
    if (this.prefRecords_[name].currentValue !== this.DEFAULT_VALUE) {
      this.prefRecords_[name].currentValue = this.DEFAULT_VALUE;
      changed.push(name);
    }
  }

  var keys = Object.keys(this.prefRecords_).map(function(el) {
      return this.prefix_ + el;
  }.bind(this));

  this.storage_.removeItems(keys);

  changed.forEach(this.notifyChange_.bind(this));
};

/**
 * Return true if two values should be considered not-equal.
 *
 * If both values are the same scalar type and compare equal, this function
 * returns true, otherwise return false.
 *
 * This is used in places where we want to check if a preference has changed.
 * Rather than take the time to compare complex values we just consider them
 * to always be different.
 *
 * @param {*} a A value to compare.
 * @param {*} b A value to compare.
 */
lib.PreferenceManager.prototype.diff = function(a, b) {
  if ((typeof a) != (typeof b) || !(/^(number|string)$/.test(typeof a)))
    return true;

  return !(/^(number|string)$/.test(typeof a) && a == b);
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
lib.PreferenceManager.prototype.set = function(name, newValue) {
  var record = this.prefRecords_[name];
  if (!record)
    throw new Error('Unknown pref: ' + name);

  var oldValue = record.get();

  if (!this.diff(oldValue, newValue))
    return;

  if (this.diff(record.defaultValue, newValue)) {
    record.currentValue = newValue;
    this.storage_.setItem(this.prefix_ + name, newValue);
  } else {
    record.currentValue = this.DEFAULT_VALUE;
    this.storage_.removeItem(this.prefix_ + name);
  }

  this.notifyChange_(name);
};

/**
 * Get the value of a preference.
 *
 * @param {string} key The preference to get.
 */
lib.PreferenceManager.prototype.get = function(name) {
  var record = this.prefRecords_[name];
  if (!record)
    throw new Error('Unknown pref: ' + name);

  return record.get();
};

/**
 * Called when one of the child list preferences changes.
 */
lib.PreferenceManager.prototype.onChildListChange_ = function(listName) {
  this.syncChildList(listName);
};

/**
 * Called when a key in the storage changes.
 */
lib.PreferenceManager.prototype.onStorageChange_ = function(map) {
  for (var key in map) {
    if (this.prefix_) {
      if (key.substr(0, this.prefix_.length) != this.prefix_)
        continue;
    }

    var name = key.substr(this.prefix_.length);

    if (!(name in this.prefRecords_)) {
      // Sometimes we'll get notified about prefs that are no longer defined.
      continue;
    }

    var record = this.prefRecords_[name];

    var newValue = map[key].newValue;
    if (this.diff(record.currentValue, newValue)) {
      if (typeof newValue == 'undefined') {
        record.currentValue = record.DEFAULT_VALUE;
      } else {
        record.currentValue = newValue;
      }

      this.notifyChange_(name);
    }
  }
};
