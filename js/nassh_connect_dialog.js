// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('lib.colors', 'lib.f', 'lib.fs', 'lib.MessageManager');

/**
 * Constructor a new ConnectDialog instance.
 *
 * There should only be one of these, and it assumes the connect dialog is
 * the only thing in the current window.
 *
 * @param {MessagePort} messagePort The HTML5 message port we should use to
 *     communicate with the nassh instance.
 */
nassh.ConnectDialog = function(messagePort) {

  // Message port back to the terminal.
  this.messagePort_ = messagePort;
  this.messagePort_.onmessage = this.onMessage_.bind(this);
  this.messagePort_.start();

  // Turn off spellcheck everywhere.
  var ary = document.querySelectorAll('input[type="text"]');
  for (var i = 0; i < ary.length; i++) {
    ary[i].setAttribute('spellcheck', 'false');
  }

  // The Message Manager instance, null until the messages have loaded.
  this.mm_ = null;

  // The nassh global pref manager.
  this.prefs_ = new nassh.PreferenceManager();
  this.prefs_.readStorage(function() {
      this.syncProfiles_(this.onPreferencesReady_.bind(this));
    }.bind(this));

  // The profile we're currently displaying.
  this.currentProfileRecord_ = null;

  // The 'new' profile is special in that it doesn't have a real id or
  // prefs object until it is saved for the first time.
  this.emptyProfileRecord_ = new nassh.ConnectDialog.ProfileRecord(
      'new', null, '[New Connection]');

  // Map of id->nassh.ConnectDialog.ProfileRecord.
  this.profileMap_ = {};

  // Array of nassh.ConnectDialog.ProfileRecord instances in display order.
  this.profileList_ = [];

  // We need this hack until CSS variables are supported on the stable channel.
  this.cssVariables_ = new nassh.CSSVariables(document.styleSheets[1]);

  // Cached DOM nodes.
  this.form_ = document.querySelector('form');
  this.connectButton_ = document.querySelector('#connect');
  this.deleteButton_ = document.querySelector('#delete');
};

/**
 * Global window message handler, uninstalled after proper handshake.
 */
nassh.ConnectDialog.onWindowMessage = function(e) {
  if (e.data.name != 'ipc-init') {
    console.warn('Unknown message from terminal:', e.data);
    return;
  }

  window.removeEventListener('message', nassh.ConnectDialog.onWindowMessage);

  lib.init(function() {
    window.dialog_ = new nassh.ConnectDialog(e.data.argv[0].messagePort);
  });
};

// Register the message listener.
window.addEventListener('message', nassh.ConnectDialog.onWindowMessage);

/**
 * Called by the preference manager when we've retrieved the current preference
 * values from storage.
 */
nassh.ConnectDialog.prototype.onPreferencesReady_ = function() {
  // Create and draw the shortcut list.
  this.shortcutList_ = new nassh.ColumnList(
      document.querySelector('#shortcut-list'), this.profileList_);

  // Install various (DOM and non-DOM) event handlers.
  this.installHandlers_();

  var profileIndex = 0;

  if (this.profileList_.length == 1) {
    // Just one profile record?  It's the "New..." profile, focus the form.
    this.$f('description').focus();

  } else {
    this.shortcutList_.focus();

    var lastProfileId = window.localStorage.getItem(
        '/nassh/connectDialog/lastProfileId');

    if (lastProfileId)
      profileIndex = Math.max(0, this.getProfileIndex_(lastProfileId));
  }

  this.shortcutList_.setActiveIndex(profileIndex);
  // The shortcut list will eventually do this async, but we want it now...
  this.setCurrentProfileRecord(this.profileList_[profileIndex]);

  nassh.getFileSystem(this.onFileSystemFound_.bind(this));
};

/**
 * Simple struct to collect data about a profile.
 */
nassh.ConnectDialog.ProfileRecord = function(id, prefs, opt_textContent) {
  this.id = id;
  this.prefs = prefs;
  this.textContent = opt_textContent || prefs.get('description');
};

/**
 * Get a localized message from the Message Manager.
 *
 * This converts all message name to UPPER_AND_UNDER format, since that's
 * pretty handy in the connect dialog.
 */
nassh.ConnectDialog.prototype.msg = function(name, opt_args) {
  if (!this.mm_)
    return 'loading...';

  return this.mm_.get(name.toUpperCase().replace(/-/g, '_'), opt_args);
};

/**
 * Align the bottom fields.
 *
 * We want a grid-like layout for these fields.  This is not easily done
 * with box layout, but since we're using a fixed width font it's a simple
 * hack.  We just left-pad all of the labels with &nbsp; so they're all
 * the same length.
 */
nassh.ConnectDialog.prototype.alignLabels_ = function() {
  var labels = [
      this.$f('identity').previousElementSibling,
      this.$f('argstr').previousElementSibling,
      this.$f('terminal-profile').previousElementSibling
  ];

  var labelWidth = Math.max.apply(
      null, labels.map(function(el) { return el.textContent.length }));

  labels.forEach(function(el) {
      el.textContent = lib.f.lpad(el.textContent, labelWidth, '\xa0');
    });
};

/**
 * Install various event handlers.
 */
nassh.ConnectDialog.prototype.installHandlers_ = function() {
  // Small utility to connect DOM events.
  function addListeners(node, events, handler, var_args) {
    for (var i = 2; i < arguments.length; i++) {
      handler = arguments[i];
      for (var j = 0; j < events.length; j++) {
        node.addEventListener(events[j], handler);
      }
    }
  }

  // Observe global 'profile-ids' list so we can keep the ColumnList updated.
  this.prefs_.addObservers(null, {
      'profile-ids': this.onProfileListChanged_.bind(this)
    });

  // Same for the 'description' field of all known profiles.
  for (var i = 0; i < this.profileList_.length; i++) {
    var rec = this.profileList_[i];
    if (rec.prefs) {
      rec.prefs.addObservers(null, {
       description: this.onDescriptionChanged_.bind(this)
      });
    }
  }

  // Watch for selection changes on the ColumnList so we can keep the
  // 'billboard' updated.
  this.shortcutList_.onActiveIndexChanged =
      this.onProfileIndexChanged.bind(this);

  // Register for keyboard shortcuts on the column list.
  this.shortcutList_.addEventListener('keydown',
                                      this.onShortcutListKeyDown_.bind(this));

  this.shortcutList_.addEventListener('dblclick',
                                      this.onShortcutListDblClick_.bind(this));

  this.form_.addEventListener('keyup', this.onFormKeyUp_.bind(this));

  this.connectButton_.addEventListener('click',
                                       this.onConnectClick_.bind(this));
  this.deleteButton_.addEventListener('click',
                                      this.onDeleteClick_.bind(this));

  this.$f('identity').addEventListener('select', function(e) {
      if (e.target.value == '')
        e.target.selectedIndex = 0;
    });

  // These fields interact with each-other's placeholder text.
  ['description', 'username', 'hostname', 'port', 'relay-host'
  ].forEach(function(name) {
      var field = this.$f(name);

      // Alter description or detail placeholders, and commit the pref.
      addListeners(field, ['change', 'keypress', 'keyup'],
                   this.updatePlaceholders_.bind(this, name),
                   this.maybeDirty_.bind(this, name));

      addListeners(field, ['focus'],
                   this.maybeCopyPlaceholder_.bind(this, name));
    }.bind(this));

  // These fields are plain text with no fancy properties.
  ['argstr', 'terminal-profile'
  ].forEach(function(name) {
      var field = this.$f(name)
      addListeners(field,
                   ['change', 'keypress', 'keyup'],
                   this.maybeDirty_.bind(this, name));
    }.bind(this));

  ['description', 'username', 'hostname', 'port', 'relay-host', 'identity',
   'argstr', 'terminal-profile'
  ].forEach(function(name) {
      addListeners(this.$f(name), ['focus', 'blur'],
                   this.onFormFocusChange_.bind(this, name));
    }.bind(this));

  // Listen for DEL on the identity select box.
  this.$f('identity').addEventListener('keyup', function(e) {
      if (e.keyCode == 46 && e.target.selectedIndex != 0) {
        this.deleteIdentity_(e.target.value);
      }
    }.bind(this));

  this.importFileInput_ = document.querySelector('#import-file-input');
  this.importFileInput_.addEventListener(
      'change', this.onImportFiles_.bind(this));

  var importLink = document.querySelector('#import-link');
  importLink.addEventListener('click', function(e) {
      this.importFileInput_.click();
      e.preventDefault();
    }.bind(this));
};

/**
 * Quick way to ask for a '#field-' element from the dom.
 */
nassh.ConnectDialog.prototype.$f = function(
    name, opt_attrName, opt_attrValue) {
  var node = document.querySelector('#field-' + name);
  if (!node)
    throw new Error('Can\'t find: #field-' + name);

  if (!opt_attrName)
    return node;

  if (typeof opt_attrValue == 'undefined')
    return node.getAttribute(opt_attrName);

  node.setAttribute(opt_attrName, opt_attrValue);
};

/**
 * Change the active profile.
 */
nassh.ConnectDialog.prototype.setCurrentProfileRecord = function(
    profileRecord) {
  if (!profileRecord)
    throw 'null profileRecord.';

  this.currentProfileRecord_ = profileRecord;
  this.syncForm_();

  // For console debugging.
  window.p_ = profileRecord;
};

/**
 * Change the enabled state of one of our <div role='button'> elements.
 *
 * Since they're not real <button> tags the don't react properly to the
 * disabled property.
 */
nassh.ConnectDialog.prototype.enableButton_ = function(button, state) {
  if (state) {
    button.removeAttribute('disabled');
    button.setAttribute('tabindex', '0');
  } else {
    button.setAttribute('disabled', 'disabled');
    button.setAttribute('tabindex', '-1');
  }
};

/**
 * Persist the current form to prefs, even if it's invalid.
 */
nassh.ConnectDialog.prototype.save = function() {
  if (!this.$f('description').value)
    return;

  var dirtyForm = false;
  var changedFields = {};

  var prefs = this.currentProfileRecord_.prefs;

  ['description', 'username', 'hostname', 'port', 'relay-host', 'identity',
   'argstr', 'terminal-profile'].forEach(function(name) {
       if (name == 'identity' && this.$f('identity').selectedIndex === 0)
         return;

       var value = this.$f(name).value;

       if (name == 'port')
         value = value ? parseInt(value) : null;

       if ((!prefs && !value) || (prefs && value == prefs.get(name)))
         return;

       dirtyForm = true;
       changedFields[name] = value;
     }.bind(this));

  if (dirtyForm) {
    if (!prefs) {
      var prefs = this.prefs_.createProfile();
      var rec = new nassh.ConnectDialog.ProfileRecord(
          prefs.id, prefs, changedFields['description']);
      this.currentProfileRecord_ = rec;

      prefs.addObservers(null, {
       description: this.onDescriptionChanged_.bind(this)
      });

      this.shortcutList_.redraw();
      setTimeout(function() {
          this.shortcutList_.setActiveIndex(this.profileList_.length - 1);
        }.bind(this), 0);
    }

    for (var name in changedFields) {
      this.currentProfileRecord_.prefs.set(name, changedFields[name]);
    }
  }
};

/**
 * Save any changes and connect if the form validates.
 */
nassh.ConnectDialog.prototype.connect = function(name, argv) {
  this.maybeCopyPlaceholders_();
  this.save();

  window.localStorage.setItem('/nassh/connectDialog/lastProfileId',
                              this.currentProfileRecord_.id);

  if (this.form_.checkValidity())
    this.postMessage('connectToProfile', [this.currentProfileRecord_.id]);
};

/**
 * Send a message back to the terminal.
 */
nassh.ConnectDialog.prototype.postMessage = function(name, argv) {
  this.messagePort_.postMessage({name: name, argv: argv || null});
};

/**
 * Set the profile's dirty bit if the given field has changed from it's current
 * pref value.
 */
nassh.ConnectDialog.prototype.maybeDirty_ = function(fieldName) {
  if (this.currentProfileRecord_.prefs) {
    if (this.$f(fieldName).value !=
        this.currentProfileRecord_.prefs.get(fieldName)) {
      this.currentProfileRecord_.dirty = true;
    }
  } else {
    if (this.$f(fieldName).value)
      this.currentProfileRecord_.dirty = true;
  }
};

/**
 * Invoke the mabyeCopyPlaceholder_ method for the fields we're willing
 * to bulk-default.
 */
nassh.ConnectDialog.prototype.maybeCopyPlaceholders_ = function() {
  ['description', 'username', 'hostname', 'port', 'relay-host'
  ].forEach(this.maybeCopyPlaceholder_.bind(this));
  this.syncButtons_();
};

/**
 * If the field is empty and the current placeholder isn't the default,
 * then initialize the field to the placeholder.
 */
nassh.ConnectDialog.prototype.maybeCopyPlaceholder_ = function(fieldName) {
  var field = this.$f(fieldName);
  var placeholder = field.getAttribute('placeholder');
  if (!field.value && placeholder != this.msg('FIELD_' + fieldName +
                                              '_PLACEHOLDER')) {
    field.value = placeholder;
  }
};

/**
 * Compute the placeholder text for a given field.
 */
nassh.ConnectDialog.prototype.updatePlaceholders_ = function(fieldName) {
  if (fieldName == 'description') {
    // If the description changed, update the username/host/etc placeholders.
    this.updateDetailPlaceholders_();
  } else {
    // Otherwise update the description placeholder.
    this.updateDescriptionPlaceholder_();
  }
};

/**
 * Update the placeholders in the detail (username, hostname, etc) fields.
 */
nassh.ConnectDialog.prototype.updateDetailPlaceholders_ = function() {
  // Try to split the description up into the sub-fields.
  var ary = this.$f('description').value.match(
      /^([^@]+)@([^:@]+)?(?::(\d+)?)?(?:@(.*))?$/);

  // Set a blank array if the match failed.
  ary = ary || [];

  // Remove element 0, the "full match" string.
  ary.shift();

  // Copy the remaining match elements into the appropriate placeholder
  // attribute.  Set the default placeholder text from this.str.placeholders
  // for any field that was not matched.
  ['username', 'hostname', 'port', 'relay-host'
  ].forEach(function(name) {
      var value = ary.shift();
      if (!value) {
        value = this.msg('FIELD_' + name + '_PLACEHOLDER');
      }

      this.$f(name, 'placeholder', value);
    }.bind(this));
};

/**
 * Update the description placeholder.
 */
nassh.ConnectDialog.prototype.updateDescriptionPlaceholder_ = function() {
  var username = this.$f('username').value;
  var hostname = this.$f('hostname').value;

  var placeholder;

  if (username && hostname) {
    placeholder = username + '@' + hostname;

    var v = this.$f('port').value;
    if (v)
      placeholder += ':' + v;

    v = this.$f('relay-host').value;
    if (v)
      placeholder += '@' + v;
  } else {
    placeholder = this.msg('FIELD_DESCRIPTION_PLACEHOLDER');
  }

  this.$f('description', 'placeholder', placeholder);
};

/**
 * Sync the form with the current profile record.
 */
nassh.ConnectDialog.prototype.syncForm_ = function() {
  ['description', 'username', 'hostname', 'port', 'argstr', 'relay-host',
   'identity', 'terminal-profile'
  ].forEach(function(n) {
      var emptyValue = '';
      if (n == 'identity')
        emptyValue = this.$f('identity').firstChild.textContent;

      if (this.currentProfileRecord_.prefs) {
        this.$f(n).value =
            this.currentProfileRecord_.prefs.get(n) || emptyValue;
      } else {
        this.$f(n).value = emptyValue;
      }
    }.bind(this));

  this.updateDetailPlaceholders_();
  this.updateDescriptionPlaceholder_();
};

/**
 * Sync the enable state of the buttons.
 */
nassh.ConnectDialog.prototype.syncButtons_ = function() {
  this.enableButton_(
      this.deleteButton_,
      document.activeElement.getAttribute('id') == 'shortcut-list');

  this.enableButton_(this.connectButton_, this.form_.checkValidity());

};

/**
 * Sync the identity dropdown box with the filesystem.
 */
nassh.ConnectDialog.prototype.syncIdentityDropdown_ = function(opt_onSuccess) {
  var keyfileNames = [];
  var identitySelect = this.$f('identity');

  var selectedName;
  if (this.currentProfileRecord_.prefs) {
    selectedName = this.currentProfileRecord_.prefs.get('identity');
  } else {
    selectedName = identitySelect.value;
  }

  function clearSelect() {
    while (identitySelect.firstChild) {
      identitySelect.removeChild(identitySelect.firstChild);
    }
  }

  var onReadError = function() {
    clearSelect();
    var option = document.createElement('option');
    option.textContent = 'Error!';
    identitySelect.appendChild(option);
  }.bind(this);

  var onReadSuccess = function(entries) {
    for (var key in entries) {
      var ary = key.match(/^(.*)\.pub/);
      if (ary && ary[1] in entries)
        keyfileNames.push(ary[1]);
    }

    clearSelect();

    var option = document.createElement('option');
    option.textContent = '[default]';
    identitySelect.appendChild(option);

    for (var i = 0; i < keyfileNames.length; i++) {
      var option = document.createElement('option');
      option.textContent = keyfileNames[i];
      identitySelect.appendChild(option);
      if (keyfileNames[i] == selectedName)
        identitySelect.selectedIndex = i;
    }

    if (opt_onSuccess)
      opt_onSuccess();

  }.bind(this);

  lib.fs.readDirectory(this.fileSystem_.root, '/.ssh/', onReadSuccess,
                       lib.fs.err('Error enumerating /.ssh/', onReadError));
};

/**
 * Delete one a pair of identity files from the html5 filesystem.
 */
nassh.ConnectDialog.prototype.deleteIdentity_ = function(identityName) {
  var count = 0;

  var onRemove = function() {
    if (++count == 2)
      this.syncIdentityDropdown_();
  }.bind(this);

  lib.fs.removeFile(this.fileSystem_.root, '/.ssh/' + identityName,
                    onRemove);
  lib.fs.removeFile(this.fileSystem_.root, '/.ssh/' + identityName + '.pub',
                    onRemove);
};

nassh.ConnectDialog.prototype.deleteProfile_ = function(deadID) {
  if (this.currentProfileRecord_.id == deadID) {
    // The actual profile removal and list-updating will happen async.
    // Rather than come up with a fancy hack to update the selection when
    // it's done, we just move it before the delete.
    var currentIndex = this.shortcutList_.activeIndex;
    if (currentIndex == this.profileList_.length - 1) {
      // User is deleting the last (non-new) profile, select the one before
      // it.
      this.shortcutList_.setActiveIndex(this.profileList_.length - 2);
    } else {
      this.shortcutList_.setActiveIndex(currentIndex + 1);
    }
  }

  this.prefs_.removeProfile(deadID);
};

/**
 * Return the index into this.profileList_ for a given profile id.
 *
 * Returns -1 if the id is not found.
 */
nassh.ConnectDialog.prototype.getProfileIndex_ = function(id) {
  for (var i = 0; i < this.profileList_.length; i++) {
    if (this.profileList_[i].id == id)
      return i;
  }

  return -1;
};

/**
 * Sync the ColumnList with the known profiles.
 */
nassh.ConnectDialog.prototype.syncProfiles_ = function(opt_callback) {
  var ids = this.prefs_.get('profile-ids');

  this.profileList_.length = 0;
  var currentProfileExists = false;
  var emptyProfileExists = false;

  var deadProfiles = Object.keys(this.profileMap_);

  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    var p;

    if (this.currentProfileRecord_ && id == this.currentProfileRecord_.id)
      currentProfileExists = true;

    if (id == this.emptyProfileRecord_.id) {
      emptyProfileExists = true;
      p = this.emptyProfileRecord_;
    } else {
      p = this.profileMap_[id];
    }

    deadProfiles.splice(deadProfiles.indexOf(id), 1);

    if (!p) {
      p = this.profileMap_[id] = new nassh.ConnectDialog.ProfileRecord(
          id, this.prefs_.getProfile(id));
    } else if (p.prefs) {
      p.textContent = p.prefs.get('description');
    }

    this.profileList_.push(p);
  }

  for (var i = 0; i < deadProfiles.length; i++) {
    delete this.profileMap_[deadProfiles[i]];
  }

  if (!currentProfileExists) {
    this.setCurrentProfileRecord(this.emptyProfileRecord_);
  }

  if (!emptyProfileExists) {
    this.profileList_.unshift(this.emptyProfileRecord_);
    this.profileMap_[this.emptyProfileRecord_.id] = this.emptyProfileRecord_;
  }

  if (this.profileList_.length == 1) {
    if (opt_callback)
      opt_callback();
  }

  // Start at 1 for the "[New Connection]" profile.
  var initialized = 1;

  var onRead = function(profile) {
    profile.textContent = profile.prefs.get('description');

    if ((++initialized == this.profileList_.length) && opt_callback)
        opt_callback();
  };

  this.profileList_.forEach(function(profile) {
      if (profile.prefs)
        profile.prefs.readStorage(onRead.bind(this, profile));
    }.bind(this));
};

/**
 * Called when the message manager finishes loading the translations.
 */
nassh.ConnectDialog.prototype.onMessagesLoaded_ = function(mm, loaded, failed) {
  this.mm_ = mm;
  this.mm_.processI18nAttributes(document.body);
  this.alignLabels_();
  this.updateDetailPlaceholders_();
  this.updateDescriptionPlaceholder_();
};

/**
 * Success callback for lib.fs.getFileSystem().
 *
 * Kick off the "Identity" dropdown now that we have access to the filesystem.
 */
nassh.ConnectDialog.prototype.onFileSystemFound_ = function(
    fileSystem, sshDirectoryEntry) {
  this.fileSystem_ = fileSystem;
  this.sshDirectoryEntry_ = sshDirectoryEntry;
  this.syncIdentityDropdown_();

  // Tell the parent we're ready to roll.
  this.postMessage('ipc-init-ok');
};

/**
 * User initiated file import.
 *
 * This is the onChange hander for the `input type="file"`
 * (aka this.importFileInput_) control.
 */
nassh.ConnectDialog.prototype.onImportFiles_ = function(e) {
  var input = this.importFileInput_;
  var select = this.$f('identity');

  var onImportSuccess = function() {
    this.syncIdentityDropdown_(function() {
        select.selectedIndex = select.childNodes.length - 1;
      });
  }.bind(this);

  if (!input.files.length)
    return;

  nassh.importFiles(this.fileSystem_, '/.ssh/', input.files, onImportSuccess);

  return false;
};

/**
 * Keydown event on the shortcut list.
 */
nassh.ConnectDialog.prototype.onShortcutListKeyDown_ = function(e) {
  var isNewConnection = this.currentProfileRecord_ == this.emptyProfileRecord_;
  if (e.keyCode == 46) {
    // DEL delete the profile.
    if (!isNewConnection) {
      this.deleteProfile_(this.currentProfileRecord_.id);
    } else {
      // Otherwise the user is deleting the placeholder profile.  All we
      // do here is reset the form.
      this.syncForm_();
      this.$f('description').focus();
    }

  } else if (e.keyCode == 13) {
    if (isNewConnection) {
      this.$f('description').focus();
    } else {
      this.onConnectClick_();
    }
  }
};

nassh.ConnectDialog.prototype.onShortcutListDblClick_ = function(e) {
  this.onConnectClick_();
};

/**
 * Called when the ColumnList says the active profile changed.
 */
nassh.ConnectDialog.prototype.onProfileIndexChanged = function(e) {
  this.setCurrentProfileRecord(this.profileList_[e.now]);
  this.syncButtons_();
};

/**
 * Someone clicked on the connect button.
 */
nassh.ConnectDialog.prototype.onConnectClick_ = function(e) {
  if (this.connectButton_.getAttribute('disabled'))
    return;

  this.connect();
};

/**
 * Someone clicked on the connect button.
 */
nassh.ConnectDialog.prototype.onDeleteClick_ = function(e) {
  if (this.deleteButton_.getAttribute('disabled'))
    return;

  this.deleteIdentity_(e.target.value);
};

/**
 * KeyUp on the form element.
 */
nassh.ConnectDialog.prototype.onFormKeyUp_ = function(e) {
  if (e.keyCode == 13) {  // ENTER
    this.connect();
  } else if (e.keyCode == 27) {  // ESC
    this.syncForm_();
    this.shortcutList_.focus();
  }
};

/**
 * Focus change on the form element.
 *
 * This handler is registered to every form element's focus and blur events.
 * Keep in mind that for change in focus from one input to another will invoke
 * this twice.
 */
nassh.ConnectDialog.prototype.onFormFocusChange_ = function(e) {
  this.syncButtons_();
  this.save();
};

/**
 * Pref callback invoked when the global 'profile-ids' changed.
 */
nassh.ConnectDialog.prototype.onProfileListChanged_ = function() {
  this.syncProfiles_(function() { this.shortcutList_.redraw() }.bind(this));
};

/**
 * Pref callback invoked when a profile's description has changed.
 */
nassh.ConnectDialog.prototype.onDescriptionChanged_ = function(
    value, name, prefs) {
  if (this.profileMap_[prefs.id]) {
    this.profileMap_[prefs.id].textContent = value;
    this.shortcutList_.scheduleRedraw();
  }
};

/**
 * Handle a message from the terminal.
 */
nassh.ConnectDialog.prototype.onMessage_ = function(e) {
  if (e.data.name in this.onMessageName_) {
    this.onMessageName_[e.data.name].apply(this, e.data.argv);
  } else {
    console.warn('Unhandled message: ' + e.data.name, e.data);
  }
};

/**
 * Terminal message handlers.
 */
nassh.ConnectDialog.prototype.onMessageName_ = {};

/**
 * termianl-info: The terminal introduces itself.
 */
nassh.ConnectDialog.prototype.onMessageName_['terminal-info'] = function(info) {
  var mm = new lib.MessageManager(info.acceptLanguages);
  mm.findAndLoadMessages('/_locales/$1/messages.json',
                         this.onMessagesLoaded_.bind(this, mm));

  document.body.style.fontFamily = info.fontFamily;
  document.body.style.fontSize = info.fontSize + 'px';

  var fg = lib.colors.normalizeCSS(info.foregroundColor);
  var bg = lib.colors.normalizeCSS(info.backgroundColor);
  var cursor = lib.colors.normalizeCSS(info.cursorColor);

  var vars = {
    'background-color': bg,
    'foreground-color': fg,
    'cursor-color': cursor,
  };

  for (var i = 10; i < 100; i += 5) {
    vars['background-color-' + i] = lib.colors.setAlpha(bg, i / 100);
    vars['foreground-color-' + i] = lib.colors.setAlpha(fg, i / 100);
    vars['cursor-color-' + i] = lib.colors.setAlpha(cursor, i / 100);
  }

  this.cssVariables_.reset(vars);
};
