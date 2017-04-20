// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

var testManager;
var testRun;

window.onload = function() {
  lib.rtdep(hterm.testDeps);

  hterm.defaultStorage = new lib.Storage.Memory();

  lib.init(lib.f.alarm(function() {
    testManager = new lib.TestManager();
    testManager.log.save = true;

    testManager.onTestRunComplete = (testRun) => {
      var document = testRun.cx.window.document;
      document.body.innerHTML = '';

      var results = document.createElement('div');
      var p, pre;

      p = document.createElement('p');
      p.innerText = 'Check JavaScript console for test log/status.';
      results.appendChild(p);

      p = document.createElement('p');
      p.id = 'status';
      p.innerText = 'Finished.';
      p.className = (testRun.failures.length == 0) ? 'good' : 'bad';
      results.appendChild(p);

      p = document.createElement('p');
      p.id = 'passed';
      p.className = 'good';
      document.title = p.innerText = testRun.passes.length + ' tests passed.';
      results.appendChild(p);

      p = document.createElement('p');
      p.id = 'failed';
      p.className = 'bad';
      if (testRun.failures.length != 0)
        document.title = p.innerText =
            'ERROR: ' + testRun.failures.length + ' tests failed!';
      results.appendChild(p);

      pre = document.createElement('pre');
      pre.id = 'log';
      pre.innerText = testRun.testManager.log.data;
      results.appendChild(pre);

      // Only clear the body if everything passed in case the current rendering
      // is useful to debugging.  Insert our log/results above it.
      if (testRun.failures.length == 0)
        document.body.innerText = '';
      document.body.insertBefore(results, document.body.firstChild);
    };

    testManager.testPreamble = (result, cx) => {
      var testRun = result.testRun;
      cx.window.document.title =
          '[' + (testRun.passes.length + testRun.failures.length) + '] ' +
          result.test.fullName;
    };

    testRun = testManager.createTestRun({window: window});

    // Stop after the first failure to make it easier to debug in the
    // JS console.
    testRun.maxFailures = 1;

    testRun.selectPattern(testRun.ALL_TESTS);
    testRun.run();

  }), console.log.bind(console));
};
