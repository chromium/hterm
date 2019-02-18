// Copyright 2018 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview hterm.ContextMenu unit tests.
 */
hterm.ContextMenu.Tests = new lib.TestManager.Suite('hterm.ContextMenu.Tests');

/**
 * Verify we can show/hide an empty menu.
 */
hterm.ContextMenu.Tests.addTest('contextmenu-stub', function(result, cx) {
  const menu = new hterm.ContextMenu();

  // Show/hide this stub menu.  It should be fine.
  menu.show();
  menu.hide();

  result.pass();
});

/**
 * Verify we can show/hide a simple menu.
 */
hterm.ContextMenu.Tests.addTest('contextmenu-simple', function(result, cx) {
  const document = cx.window.document;
  const menu = new hterm.ContextMenu();
  menu.setDocument(document);

  // Create a basic menu.
  menu.setItems([['Foo', () => { return; }]]);

  // Show/hide this menu.
  menu.show({clientX: 0, clientY: 0});
  menu.hide();

  result.pass();
});

/**
 * Check separator handling.
 */
hterm.ContextMenu.Tests.addTest('contextmenu-separator', function(result, cx) {
  const document = cx.window.document;
  const menu = new hterm.ContextMenu();
  menu.setDocument(document);

  // Create a basic menu.
  menu.setItems([[hterm.ContextMenu.SEPARATOR]]);

  // Check the entries.
  assert.equal('separator', menu.element_.firstElementChild.className);

  // Show/hide this menu.
  menu.show({clientX: 0, clientY: 0});
  menu.hide();

  result.pass();
});
