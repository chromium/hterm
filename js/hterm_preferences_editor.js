// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('hterm.PreferenceManager', 'lib.colors');

// CSP means that we can't kick off the initialization from the html file,
// so we do it like this instead.
window.onload = function() {
  function setupPreferences() {
    var prefsEditor = new hterm.PreferencesEditor();

    // Useful for console debugging.
    window.term_ = prefsEditor;

    // Set up labels.
    document.getElementById('label_header').innerText =
        hterm.msg('PREFERENCES_HEADER');
    document.getElementById('label_profile').innerText =
        hterm.msg('TERMINAL_PROFILE_LABEL');

    // Set up reset button.
    document.getElementById('reset').onclick = function() {
        prefsEditor.resetAll();
      };

    // Set up profile selection field.
    var profile = document.getElementById('profile');
    profile.oninput = function() {
        hterm.PreferencesEditor.debounce(profile, function(input) {
            prefsEditor.notify(hterm.msg('LOADING_LABEL'), 500);
            if (input.value.length)
              prefsEditor.selectProfile(input.value);
          });
      };
    profile.value = hterm.msg('FIELD_TERMINAL_PROFILE_PLACEHOLDER');

    // Allow people to reset individual fields by pressing escape.
    document.onkeyup = function(e) {
        if (document.activeElement.name == 'settings' && e.keyCode == 27)
          prefsEditor.reset(document.activeElement);
      };
  }

  lib.init(setupPreferences);
};

/**
 * Class for editing hterm profiles.
 *
 * @param {string} opt_profileId Optional profile name to read settings from;
 *     defaults to the "default" profile.
 */
hterm.PreferencesEditor = function(opt_profileId) {
  this.selectProfile(opt_profileId || 'default');
};

/**
 * Debounce action on input element.
 *
 * This way people can type up a setting before seeing an update.
 * Useful with settings such as font names or sizes.
 *
 * @param {object} input An HTML input element to pass down to callback.
 * @param {function} callback Function to call after debouncing while passing
 *     it the input object.
 * @param {integer} opt_timeout Optional how long to debounce.
 */
hterm.PreferencesEditor.debounce = function(input, callback, opt_timeout) {
  clearTimeout(input.timeout);
  input.timeout = setTimeout(function() {
      callback(input);
      input.timeout = null;
    }, opt_timeout || 500);
};

/**
 * Select a profile for editing.
 *
 * This will load the settings and update the HTML display.
 *
 * @param {string} profileId The profile name to read settings from.
 */
hterm.PreferencesEditor.prototype.selectProfile = function(profileId) {
  var prefsEditor = this;
  var prefs = new hterm.PreferenceManager(profileId);
  this.prefs_ = prefs;
  prefs.readStorage(function() {
      prefs.notifyAll();
      prefsEditor.syncPage();
    });
};

/**
 * Save the HTML color state to the preferences.
 *
 * Since the HTML5 color picker does not support alpha, we have to split
 * the rgb and alpha information across two input objects.
 *
 * @param {string} key The HTML input.id to use to locate the color input
 *     object.  By appending ':alpha' to the key name, we can also locate
 *     the range input object.
 */
hterm.PreferencesEditor.prototype.colorSave = function(key) {
  var cinput = document.getElementById(key);
  var ainput = document.getElementById(key + ':alpha');
  var rgb = lib.colors.hexToRGB(cinput.value);
  this.prefs_.set(key, lib.colors.setAlpha(rgb, ainput.value / 100));
};

/**
 * Save the HTML state to the preferences.
 *
 * @param {object} input An HTML input element to update the corresponding
 *     preferences key.  Uses input.id to locate relevant preference.
 */
hterm.PreferencesEditor.prototype.save = function(input) {
  // Skip ones we don't yet handle.
  if (input.disabled)
    return;

  var keys = input.id.split(':');
  var key = keys[0];
  var prefs = this.prefs_;
  switch (input.type) {
    case 'checkbox':
      if (input.indeterminate) {
        prefs.set(key, null);
      } else {
        prefs.set(key, input.checked);
      }
      break;
    case 'number':
      prefs.set(key, Number(input.value));
      break;
    case 'range':
    case 'color':
      this.colorSave(key);
      break;
    case 'text':
    case 'textarea':
      var value = input.value;
      if (input.data == 'JSON') {
        try {
          value = JSON.parse(value);
        } catch (err) {
          this.notify(hterm.msg('JSON_PARSE_ERROR', key) + ': ' + err, 5000);
          value = prefs.get(key);
        }
      }
      prefs.set(key, value);
      break;
  }
};

/**
 * Sync the preferences state to the HTML color objects.
 *
 * @param {string} key The HTML input.id to use to locate the color input
 *     object.  By appending ':alpha' to the key name, we can also locate
 *     the range input object.
 * @param {object} pref The preference object to get the current state from.
 * @return {string} The rgba color information.
 */
hterm.PreferencesEditor.prototype.colorSync = function(key, pref) {
  var cinput = document.getElementById(key);
  var ainput = document.getElementById(key + ':alpha');

  var rgba = lib.colors.normalizeCSS(pref);

  cinput.value = lib.colors.rgbToHex(rgba);
  if (rgba) {
    ainput.value = lib.colors.crackRGB(rgba)[3] * 100;
  } else {
    ainput.value = ainput.max;
  }

  return rgba;
};

/**
 * Sync the preferences state to the HTML object.
 *
 * @param {Object} input An HTML input element to update the corresponding
 *     preferences key.  Uses input.id to locate relevant preference.
 */
hterm.PreferencesEditor.prototype.sync = function(input) {
  var keys = input.id.split(':');
  var key = keys[0];
  var pref = this.prefs_.get(key);

  if (input.type == 'color' || input.type == 'range') {
    var rgba = this.colorSync(key, pref);
  } else if (input.data == 'JSON') {
    input.value = JSON.stringify(pref);
  } else {
    input.value = pref;
  }
  switch (typeof pref) {
    case 'boolean':
      input.checked = pref;
      break;
  }

  // Now update the page to give more immediate feedback as to what
  // the preferences will look like in the terminal.
  var style = window.document.body.style;
  switch (key) {
    case 'background-color':
      style.backgroundColor = rgba;
      break;
    case 'background-image':
      style.backgroundImage = input.value;
      break;
    case 'background-size':
      style.backgroundSize = input.value;
      break;
    case 'background-position':
      style.backgroundPosition = input.value;
      break;
    case 'enable-bold':
      style.fontWeight = (input.checked && !input.indeterminate) ? 'bold' : '';
      break;
    case 'font-family':
      style.fontFamily = input.value;
      break;
    case 'font-size':
      style.fontSize = input.value + 'px';
      break;
    case 'font-smoothing':
      style.webkitFontSmoothing = input.value;
      break;
    case 'foreground-color':
      style.color = rgba;
      break;
    case 'scrollbar-visible':
      style.overflowY = input.checked ? 'scroll' : 'auto';
      break;
  }
};

/**
 * Update preferences from HTML input objects when the input changes.
 *
 * This is a helper that should be used in an event handler (e.g. onchange).
 * Should work with any input type.
 *
 * @param {Object} input An HTML input element to update from.
 */
hterm.PreferencesEditor.prototype.onInputChange = function(input) {
  this.save(input);
  this.sync(input);
};

/**
 * Update preferences from HTML checkbox input objects when the input changes.
 *
 * This is a helper that should be used in an event handler (e.g. onchange).
 * Used with checkboxes for tristate values (true/false/null).
 *
 * @param {Object} input An HTML checkbox input element to update from.
 */
hterm.PreferencesEditor.prototype.onInputChangeTristate = function(input) {
  switch (input.data % 3) {
    case 0: // unchecked -> indeterminate
       input.indeterminate = true;
       break;
    case 1: // indeterminate -> checked
       input.checked = true;
       break;
    case 2: // checked -> unchecked
       input.checked = false;
       break;
  }
  ++input.data;
  this.onInputChange(input);
};

/**
 * Update the preferences page to reflect current preference object.
 *
 * Will basically rewrite the displayed HTML code on the fly.
 */
hterm.PreferencesEditor.prototype.syncPage = function() {
  var prefsEditor = this;

  var tbl = document.getElementById('settings');

  // Clear out existing settings table.
  while (tbl.hasChildNodes()) {
    tbl.removeChild(tbl.firstChild);
  }

  // Create the table of settings.
  var typeMap = {
    'boolean': 'checkbox',
    'number': 'number',
    'object': 'text',
    'string': 'text',
  };
  for (var key in this.prefs_.prefRecords_) {
    var input = document.createElement('input');
    var pref = this.prefs_.get(key);

    var onchangeCursorReset = function() {
        hterm.PreferencesEditor.debounce(this, function(input) {
            // Chrome has a bug where it resets cursor position on us when
            // we debounce the input.  So manually save & restore cursor.
            var i = input.selectionStart;
            prefsEditor.onInputChange(input);
            if (document.activeElement === input)
              input.setSelectionRange(i, i);
          });
      };
    var onchange = function() {
        hterm.PreferencesEditor.debounce(this, function(input) {
            prefsEditor.onInputChange(input);
          });
      };
    var oninput = null;

    var keyParts = key.split('-')
    if (key == 'enable-bold' ||
        key == 'mouse-paste-button') {
      input.indeterminate = true;
      input.type = 'checkbox';
      input.data = 1;
      onchange = function() {
          prefsEditor.onInputChangeTristate(this);
        };
    } else if (keyParts[keyParts.length - 1] == 'color') {
      input.type = 'color';
    } else {
      var type = typeof pref;
      switch (type) {
        case 'object':
          // We'll use JSON to go between object/user text.
          input = document.createElement('textarea');
          input.data = 'JSON';
          onchange = onchangeCursorReset;
          break;
        case 'string':
          // Save simple strings immediately.
          oninput = onchangeCursorReset;
          onchange = null;
          break;
      }
      input.type = typeMap[type];
    }

    input.name = 'settings';
    input.id = key;
    input.onchange = onchange;
    input.oninput = oninput;

    var row = tbl.insertRow(-1);
    row.insertCell(0).innerText = key;
    var cell = row.insertCell(1);
    cell.appendChild(input);

    if (input.type == 'color') {
      // Since the HTML5 color picker does not support alpha,
      // we have to create a dedicated slider for it.
      var ainput = document.createElement('input');
      ainput.type = 'range';
      ainput.id = key + ':alpha';
      ainput.min = '0';
      ainput.max = '100';
      ainput.name = 'settings';
      ainput.onchange = onchange;
      ainput.oninput = oninput;
      cell.appendChild(ainput);
    }

    this.sync(input);
  }
};

/**
 * Reset all preferences to their default state and update the HTML objects.
 */
hterm.PreferencesEditor.prototype.resetAll = function() {
  var settings = document.getElementsByName('settings');

  this.prefs_.resetAll();
  for (var i = 0; i < settings.length; ++i)
    this.sync(settings[i]);
  this.notify(hterm.msg('PREFERENCES_RESET'));
};

/**
 * Reset specified preference to its default state.
 *
 * @param {object} input An HTML input element to reset.
 */
hterm.PreferencesEditor.prototype.reset = function(input) {
  var keys = input.id.split(':');
  var key = keys[0];
  this.prefs_.reset(key);
  this.sync(input);
};

/**
 * Display a message to the user.
 *
 * @param {string} msg The string to show to the user.
 * @param {integer} opt_timeout Optional how long to show the message.
 */
hterm.PreferencesEditor.prototype.notify = function(msg, opt_timeout) {
  // Update status to let user know options were updated.
  clearTimeout(this.notifyTimeout_);
  var status = document.getElementById('label_status');
  status.innerText = msg;
  this.notifyTimeout_ = setTimeout(function() {
      status.innerHTML = '&nbsp;';
    }, opt_timeout || 1000);
};
