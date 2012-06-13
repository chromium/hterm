// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

// This file handles the onload event for google_relay.html.  It would have
// been included inline in the html file if Content Security Policy (CSP) didn't
// forbid it.

window.onload = function() {
  var relayHost = document.location.hash.substr(1).split('@')[1];
  sessionStorage.setItem('googleRelay.relayHost', relayHost);

  var path = sessionStorage.getItem('googleRelay.resumePath')
  if (!path) {
    console.error('Nowhere to resume to!');
    return;
  }

  var url = chrome.extension.getURL(path);
  console.log(url);
  document.location = url;
};
