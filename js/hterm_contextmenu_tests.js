// Copyright 2018 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview hterm.ContextMenu unit tests.
 */

describe('hterm_contextmenu_tests.js', () => {

/**
 * Verify we can show/hide an empty menu.
 */
it('contextmenu-stub', () => {
  const menu = new hterm.ContextMenu();

  // Show/hide this stub menu.  It should be fine.
  menu.show(/** @type {!Event} */ ({clientX: 0, clientY: 0}));
  menu.hide();
});

/**
 * Verify we can show/hide a simple menu.
 */
it('contextmenu-simple', () => {
  const document = window.document;
  const menu = new hterm.ContextMenu();
  menu.setDocument(document);

  // Create a basic menu.
  menu.setItems([{name: 'Foo', action: () => {}}]);

  // Show/hide this menu.
  menu.show(/** @type {!Event} */ ({clientX: 0, clientY: 0}));
  menu.hide();
});

/**
 * Check separator handling.
 */
it('contextmenu-separator', () => {
  const document = window.document;
  const menu = new hterm.ContextMenu();
  menu.setDocument(document);

  // Create a basic menu.
  menu.setItems([{name: hterm.ContextMenu.SEPARATOR}]);

  // Check the entries.
  assert.equal('separator', menu.element_.firstElementChild.className);

  // Show/hide this menu.
  menu.show(/** @type {!Event} */ ({clientX: 0, clientY: 0}));
  menu.hide();
});

});
