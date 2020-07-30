// Copyright 2017 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview Preference manager tests.
 */

describe('hterm_preference_manager_tests.js', () => {

/**
 * Make sure hterm translations are kept in sync with nassh.
 */
it('pref-messages-sync', () => {
  const toMsgId = (id) => id.replace(/-/g, '_').toUpperCase();
  const fromMsgId = (id) => id.replace(/_/g, '-').toLowerCase();
  const helpIdToMsgId = (id) => `PREF_${toMsgId(id)}`;
  const msgIdToHelpId = (id) => fromMsgId(id.substr(11));
  const nameIdToMsgId = (id) => `NAME_PREF_${toMsgId(id)}`;
  const msgIdToNameId = (id) => fromMsgId(id.substr(16));
  const titleIdToMsgId = (id) => `TITLE_PREF_${toMsgId(id)}`;

  // Load the translations database from nassh.
  const messages = /** @type {!lib.MessageManager.Messages} */
      (lib.resource.getData('hterm/test/messages'));
  hterm.messageManager.addMessages(messages);

  // Walk the loaded message ids and check for stale entries.
  /** @suppress {visibility} */
  const loadedMessages = hterm.messageManager.messages_;
  Object.entries(loadedMessages)
      .forEach(([msgId, nasshMsg]) => {
        if (msgId.startsWith('HTERM_PREF_')) {
          const key = msgIdToHelpId(msgId);
          assert.property(hterm.PreferenceManager.defaultPreferences, key,
                          `stale ${msgId} help translation for key ${key}`);
        }

        if (msgId.startsWith('HTERM_TITLE_PREF_')) {
          let found = false;
          hterm.PreferenceManager.categoryDefinitions.forEach((def) => {
            if (msgId == 'HTERM_' + titleIdToMsgId(def.id)) {
              found = true;
            }
          });
          assert.isTrue(found, `stale ${msgId} translation for category`);
        }

        if (msgId.startsWith('HTERM_NAME_PREF_')) {
          const key = msgIdToNameId(msgId);
          assert.property(hterm.PreferenceManager.defaultPreferences, key,
                          `stale ${msgId} name translation for key ${key}`);
        }
      });

  // Walk the local hterm prefs and make sure they match the nassh copy.
  Object.entries(hterm.PreferenceManager.defaultPreferences).forEach(
      ([key, entry]) => {
        // Check the pref name text.
        const nameId = nameIdToMsgId(key);
        const htermNameMsg = entry['name'];
        const nasshNameMsg = hterm.msg(nameId);
        assert.equal(htermNameMsg, nasshNameMsg, nameId);

        // Check the help text.
        const helpId = helpIdToMsgId(key);
        const htermHelpMsg = entry['help'];
        const nasshHelpMsg = hterm.msg(helpId);
        assert.equal(htermHelpMsg, nasshHelpMsg, helpId);
      });

  // Walk the hterm categories and make sure they match the nassh copy.
  hterm.PreferenceManager.categoryDefinitions.forEach((def) => {
    const msgId = titleIdToMsgId(def.id);
    const htermMsg = def.text;
    const nasshMsg = hterm.msg(msgId);
    assert.equal(htermMsg, nasshMsg, msgId);
  });
});

/**
 * Make sure default values can be parsed correctly.
 */
it('parse-defaults', () => {
  Object.entries(hterm.PreferenceManager.defaultPreferences)
      .forEach(([key, pref]) => {
        if (Array.isArray(pref.type)) {
          assert.isTrue(
              pref.type.indexOf(pref.default) !== -1,
              `invalid array pref ${key}, default ` +
                  `${pref.default} not in pref ${JSON.stringify(pref.type)}`);
          return;
        }
        const msg = `invalid ${pref.type} pref ${key}: ${pref.default}`;
        switch (pref.type) {
          case 'bool':
            assert.typeOf(pref.default, 'boolean', msg);
            break;
          case 'color': {
            const rgba = lib.colors.normalizeCSS(pref.default);
            assert.isNotNull(rgba, msg);
            assert.isNotNull(lib.colors.crackRGB(lib.notNull(rgba)), msg);
            break;
          }
          case 'int':
            assert.isTrue(Number.isInteger(pref.default), msg);
            break;
          case 'multiline-string':
            assert.typeOf(pref.default, 'string', msg);
            break;
          case 'string':
            assert.typeOf(pref.default, 'string', msg);
            break;
          case 'tristate':
            assert.isTrue(
                typeof pref.default === 'boolean' || pref.default === null,
                msg);
            break;
          case 'url':
            try {
              if (pref.default !== '') {
                // eslint-disable-next-line no-new
                new URL(pref.default);
              }
            } catch (e) {
              assert.fail(msg);
            }
            break;
          case 'value':
            // Anything goes for 'value'.
            break;
          default:
            assert.fail(`invalid pref ${key} unknown type: ${pref.type}`);
        }
      });
});

});
