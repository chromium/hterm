// Copyright (c) 2014 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import TestManager from 'test/test_manager';

import 'test/pubsub_tests';
import 'test/screen_tests';
import 'test/scrollport_tests';
import 'test/terminal_tests';
import 'test/vt_tests';
import 'test/canned_tests';

var testManager = new TestManager();
var testRun = testManager.createTestRun({window: window});

testRun.selectPattern(testRun.ALL_TESTS);
testRun.run();
