// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('lib.f');

// CSP means that we can't kick off the initialization from the html file,
// so we do it like this instead.
window.onload = function() {
  function execNaSSH() {
    var profileName = lib.f.parseQuery(document.location.search)['profile'];

    var terminal = new hterm.Terminal(profileName);
    terminal.decorate(document.querySelector('#terminal'));
    terminal.onTerminalReady = function() {
        terminal.setCursorPosition(0, 0);
        terminal.setCursorVisible(true);
        terminal.runCommandClass(nassh.CommandInstance,
                                 document.location.hash.substr(1));
    };

    // Useful for console debugging.
    window.term_ = terminal;
  }

  lib.init(execNaSSH, console.log.bind(console));
};
