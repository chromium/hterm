// Copyright 2017 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview Preference manager tests.
 */

hterm.PreferenceManager.Tests = new lib.TestManager.Suite('hterm.PreferenceManager.Tests');

/**
 * Make sure hterm translations are kept in sync with nassh.
 */
hterm.PreferenceManager.Tests.addTest('pref-messages-sync', function(result, cx) {
  const prefIdToMsgId = (id) => 'PREF_' + id.replace(/-/g, '_').toUpperCase();
  const msgIdToPrefId = (id) => id.substr(11).replace(/_/g, '-').toLowerCase();
  const titleIdToMsgId = (id) => `TITLE_PREF_${id.toUpperCase()}`;

  // Load the translations database from nassh.
  hterm.messageManager.loadMessages(
      '../../nassh/_locales/en/messages.json',
      () => {
        // Walk the loaded message ids and check for stale entries.
        Object.entries(hterm.messageManager.messages).forEach(
            ([msgId, nasshMsg]) => {
              if (msgId.startsWith('HTERM_PREF_')) {
                const key = msgIdToPrefId(msgId);
                result.assert(key in hterm.PreferenceManager.defaultPreferences,
                              `stale ${msgId} translation for key ${key}`);
              }

              if (msgId.startsWith('HTERM_TITLE_PREF_')) {
                let found = false;
                hterm.PreferenceManager.categoryDefinitions.forEach((def) => {
                  if (msgId == 'HTERM_' + titleIdToMsgId(def.id))
                    found = true;
                });
                result.assert(found,
                              `stale ${msgId} translation for category`);
              }
            });

        // Walk the local hterm prefs and make sure they match the nassh copy.
        Object.entries(hterm.PreferenceManager.defaultPreferences).forEach(
            ([key, entry]) => {
              const msgId = prefIdToMsgId(key);
              const htermMsg = entry[3];
              const nasshMsg = hterm.msg(msgId);
              result.assertEQ(htermMsg, nasshMsg, msgId);
            });

        // Walk the hterm categories and make sure they match the nassh copy.
        hterm.PreferenceManager.categoryDefinitions.forEach((def) => {
          const msgId = titleIdToMsgId(def.id);
          const htermMsg = def.text;
          const nasshMsg = hterm.msg(msgId);
          result.assertEQ(htermMsg, nasshMsg, msgId);
        });

        result.pass();
      },
      (xhr) => {
        console.warn('skipping test: unable to load messages.json');
        result.pass();
      }
  );

  result.requestTime(200);
});
