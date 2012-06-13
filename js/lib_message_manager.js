// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * MessageManager class handles internationalized strings.
 *
 * Note: chrome.i18n isn't sufficient because...
 *     1. There's a bug in chrome that makes it unavailable in iframes:
 *        http://crbug.com/130200
 *     2. The client code may not be packaged in a Chrome extension.
 *     3. The client code may be part of a library packaged in a third-party
 *        Chrome extension.
 *
 * @param {Array} languages List of languages to load, in the order they
 *     should be loaded.  Newer messages replace older ones.  'en' is
 *     automatically added as the first language if it is not already present.
 */
lib.MessageManager = function(languages) {
  this.languages_ = languages.map(
      function(el) { return el.replace(/-/g, '_') });

  if (this.languages_.indexOf('en') == -1)
    this.languages_.unshift('en');

  this.messages = {};
};

/**
 * Add message definitions to the message manager.
 *
 * This takes an object of the same format of a Chrome messages.json file.  See
 * <http://code.google.com/chrome/extensions/i18n-messages.html>.
 */
lib.MessageManager.prototype.addMessages = function(defs) {
  for (var key in defs) {
    var def = defs[key];

    if (!def.placeholders) {
      this.messages[key] = def.message;
    } else {
      // Replace "$NAME$" placeholders with "$1", etc.
      this.messages[key] = def.message.replace(
          /\$([a-z][^\s\$]+)\$/ig,
          function(m, name) {
            return defs[key].placeholders[name.toLowerCase()].content;
          });
    }
  }
};

/**
 * Load the first available language message bundle.
 *
 * @param {string} pattern A url pattern containing a "$1" where the locale
 *     name should go.
 * @param {function(Array,Array)} onComplete Function to be called when loading
 *     is complete.  The two arrays are the list of successful and failed
 *     locale names.  If the first parameter is length 0, no locales were
 *     loaded.
 */
lib.MessageManager.prototype.findAndLoadMessages = function(
    pattern, onComplete) {
  var languages = this.languages_.concat();
  var loaded = [];
  var failed = [];

  function onLanguageComplete(state) {
    if (state) {
      loaded = languages.shift();
    } else {
      failed = languages.shift();
    }

    if (languages.length) {
      tryNextLanguage();
    } else {
      onComplete(loaded, failed);
    }
  }

  var tryNextLanguage = function() {
    this.loadMessages(this.replaceReferences(pattern, languages),
                      onLanguageComplete.bind(this, true),
                      onLanguageComplete.bind(this, false));
  }.bind(this);

  tryNextLanguage();
};

/**
 * Load messages from a messages.json file.
 */
lib.MessageManager.prototype.loadMessages = function(
    url, onSuccess, opt_onError) {
  var xhr = new XMLHttpRequest();

  xhr.onloadend = function() {
    if (xhr.status != 200) {
      if (opt_onError)
        opt_onError(xhr.status);

      return;
    }

    this.addMessages(JSON.parse(xhr.responseText));
    onSuccess();
  }.bind(this);

  xhr.open('GET', url);
  xhr.send();
};

/**
 * Replace $1...$n references with the elements of the args array.
 *
 * @param {string} msg String containing the message and argument references.
 * @param {Array} args Array containing the argument values.
 */
lib.MessageManager.prototype.replaceReferences = function(msg, args) {
  return msg.replace(/\$(\d+)/g, function (m, index) {
      return args[index - 1];
    });
};

/**
 * Get a message by name, optionally replacing arguments too.
 *
 * @param {string} msgname String containing the name of the message to get.
 * @param {Array} opt_args Optional array containing the argument values.
 * @param {string} opt_default Optional value to return if the msgname is not
 *     found.  Returns the message name by default.
 */
lib.MessageManager.prototype.get = function(msgname, opt_args, opt_default) {
  if (!(msgname in this.messages)) {
    console.warn('Unknown message: ' + msgname);
    return (typeof opt_default == 'undefined') ? msgname : opt_default;
  }

  if (!opt_args)
    return this.messages[msgname];

  if (!(opt_args instanceof Array))
    opt_args = [opt_args];

  return this.replaceReferences(this.messages[msgname], opt_args);
};

/**
 * Process all of the "i18n" html attributes found in a given dom fragment.
 *
 * Each i18n attribute should contain a JSON object.  The keys are taken to
 * be attribute names, and the values are message names.
 *
 * If the JSON object has a "_" (underscore) key, it's value is used as the
 * textContent of the element.
 *
 * Message names can refer to other attributes on the same element with by
 * prefixing with a dollar sign.  For example...
 *
 *   <button id='send-button'
 *           i18n='{"aria-label": "$id", "_": "SEND_BUTTON_LABEL"}'
 *           ></button>
 *
 * The aria-label message name will be computed as "SEND_BUTTON_ARIA_LABEL".
 * Notice that the "id" attribute was appended to the target attribute, and
 * the result converted to UPPER_AND_UNDER style.
 */
lib.MessageManager.prototype.processI18nAttributes = function(dom) {
  // Convert the "lower-and-dashes" attribute names into
  // "UPPER_AND_UNDER" style.
  function thunk(str) { return str.replace(/-/g, '_').toUpperCase() }

  var nodes = dom.querySelectorAll('[i18n]');

  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    var i18n = node.getAttribute('i18n');

    if (!i18n)
      continue;

    try {
      i18n = JSON.parse(i18n);
    } catch (ex) {
      console.error('Can\'t parse ' + node.tagName + '#' + node.id + ': ' +
                    i18n);
      throw ex;
    }

    for (var key in i18n) {
      var msgname = i18n[key];
      if (msgname.substr(0, 1) == '$')
        msgname = thunk(node.getAttribute(msgname.substr(1)) + '_' + key);

      var msg = this.get(msgname);
      if (key == '_') {
        node.textContent = msg;
      } else {
        node.setAttribute(key, msg);
      }
    }
  }
};
