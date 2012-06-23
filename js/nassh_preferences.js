// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('lib.f', 'lib.PreferenceManager');

/**
 * PreferenceManager subclass managing global NaSSH preferences.
 *
 * This is currently just an ordered list of known connection profiles.
 */
nassh.GlobalPreferences = function() {
  lib.PreferenceManager.call(this, '/nassh/prefs/');

  this.definePreferences
  ([
    // Ordered list of profile IDs, mapping to ProfilePreference objects.
    ['profile-ids', []],
   ]);
};

nassh.GlobalPreferences.prototype = {
  __proto__: lib.PreferenceManager.prototype
};

/**
 * Create a new nassh.ProfilePreferences object and append it to the list
 * of known connection profiles.
 *
 * @param {string} opt_description Optional description for the new profile.
 */
nassh.GlobalPreferences.prototype.createProfile = function(opt_description) {
  var profileIDs = this.get('profile-ids');
  var id;

  while (!id || profileIDs.indexOf(id) != -1) {
    id = Math.floor(Math.random() * 0xffff + 1).toString(16);
    id = lib.f.zpad(id, 4);
  }

  profileIDs.push(id);
  this.set('profile-ids', profileIDs);

  var profilePrefs = this.getProfile(id);
  profilePrefs.resetAll();

  if (opt_description)
    profilePrefs.set('description', opt_description);

  return profilePrefs;
};

/**
 * Remove a connection profile.
 *
 * Removes a profile from the list of known profiles and clears any preferences
 * stored for it.
 *
 * @param {string} id The profile ID.
 */
nassh.GlobalPreferences.prototype.removeProfile = function(id) {
  var prefs = this.getProfile(id);
  prefs.resetAll();

  var ids = this.get('profile-ids');
  var i = ids.indexOf(id);
  if (i != -1) {
    ids.splice(i, 1);
    this.set('profile-ids', ids);
  }
};

/**
 * Return a nassh.PreferenceProfile instance for a given profile id.
 *
 * If the profile is not in the list of known profiles this will throw an
 * exception.
 *
 * @param {string} id The profile ID.
 */
nassh.GlobalPreferences.prototype.getProfile = function(id) {
  if (this.get('profile-ids').indexOf(id) == -1)
    throw new Error('Unknown profile id: ' + id);

  return new nassh.ProfilePreferences(id);
};

/**
 * lib.PreferenceManager subclass managing per-connection NaSSH preferences.
 */
nassh.ProfilePreferences = function(id) {
  lib.PreferenceManager.call(this, '/nassh/prefs/profiles/' + id);

  this.id = id;

  this.definePreferences
  ([
    /**
     * The free-form description of this connection profile.
     */
    ['description', ''],

    /**
     * The username.
     */
    ['username', ''],

    /**
     * The hostname or IP address.
     */
    ['hostname', ''],

    /**
     * The port, or null to use the default port.
     */
    ['port', null],

    /**
     * The relay host, hardcoded to use nassh.GoogleRelay at the moment.
     */
    ['relay-host', ''],

    /**
     * The private key file to use as the identity for this extension.
     *
     * Must be relative to the /.ssh/ directory.
     */
    ['identity', ''],

    /**
     * The argument string to pass to the ssh executable.
     *
     * Use '--' to separate ssh arguments from the target command/arguments.
     */
    ['argstr', ''],

    /**
     * The terminal profile to use for this connection.
     */
    ['terminal-profile', ''],
   ]);
};

nassh.ProfilePreferences.prototype = {
  __proto__: lib.PreferenceManager.prototype
};
