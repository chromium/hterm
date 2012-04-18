// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// This file handles the onload event for google_relay.html.  It would have
// been included inline in the html file if Content Security Policy (CSP) didn't
// forbid it.
//
// This is separate from google_relay.js because that file depends on the
// 'hterm.NaSSH' object.

window.onload = function() {
  var relayHost = document.location.hash.substr(1).split('@')[1];
  sessionStorage.setItem('googleRelay.host', relayHost);

  var destination = sessionStorage.getItem('googleRelay.destination');
  var queryString = sessionStorage.getItem('googleRelay.queryString');
  var url = chrome.extension.getURL('html/nassh.html' + queryString +
                                    '#' + destination);
  console.log(url);
  document.location = url;
};
