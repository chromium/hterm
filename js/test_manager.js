// Copyright (c) 2011 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview JavaScript unit testing framework for synchronous and
 *     asynchronous tests.
 *
 * This file contains the TestManager and related classes.  At the moment it's
 * all collected in a single file since it's reasonably small (=~1k lines), and
 * it's a lot easier to include one file into your test harness than it is to
 * include seven.
 *
 * The following classes are defined...
 *
 *   TestManager - The root class and entrypoint for creating test runs.
 *   TestManager.Log - Logging service.
 *   TestManager.Suite - A collection of tests.
 *   TestManager.Test - A single test.
 *   TestManager.TestRun - Manages the execution of a set of tests.
 *   TestManager.Result - A single test result.
 */

/**
 * Root object in the unit test heirarchy, and keeper of the log object.
 *
 * @param {TestManager.Log} opt_log Optional TestManager.Log object.  Logs
 *     to the JavaScript console if ommitted.
 */
function TestManager(opt_log) {
  this.log = opt_log || new TestManager.Log();
}

/**
 * Create a new test run object for this test manager.
 *
 * @param {Object} opt_cx An object to be passed to test suite setup(),
 *     preamble(), and test cases during this test run.  This object is opaque
 *     to TestManager.* code.  It's entirely up to the test suite what it's
 *     used for.
 */
TestManager.prototype.createTestRun = function(opt_cx) {
  return new TestManager.TestRun(this, opt_cx);
};

/**
 * Called when a test run associated with this test manager completes.
 *
 * Clients may override this to call an appropriate function.
 */
TestManager.prototype.onTestRunComplete = function(testRun) {};

/**
 * Destination for test case output.
 *
 * @param {function(string)} opt_logFunction Optional function to call to
 *     write a string to the log.  If ommitted, console.log is used.
 */
TestManager.Log = function(opt_logFunction) {
  this.logFunction_ = opt_logFunction || function(s) { console.log(s) };
  this.pending_ = '';
  this.prefix_ = '';
  this.prefixStack_ = [];
};

/**
 * Add a prefix to log messages.
 *
 * This only affects log messages that are added after the prefix is pushed.
 *
 * @param {string} str The prefix to prepend to future log messages.
 */
TestManager.Log.prototype.pushPrefix = function(str) {
  this.prefixStack_.push(str);
  this.prefix_ = this.prefixStack_.join('');
};

/**
 * Remove the most recently added message prefix.
 */
TestManager.Log.prototype.popPrefix = function() {
  this.prefixStack_.pop();
  this.prefix_ = this.prefixStack_.join('');
};

/**
 * Queue up a string to print to the log.
 *
 * If a line is already pending, this string is added to it.
 *
 * The string is not actually printed to the log until flush() or println()
 * is called.  The following call sequence will result in TWO lines in the
 * log...
 *
 *   log.print('hello');
 *   log.print(' ');
 *   log.println('world');
 *
 * While a typical stream-like thing would result in 'hello world\n', this one
 * results in 'hello \nworld\n'.
 *
 * @param {string} str The string to add to the log.
 */
TestManager.Log.prototype.print = function(str) {
  if (this.pending_) {
    this.pending_ += str;
  } else {
    this.pending_ = this.prefix_ + str;
  }
};

/**
 * Print a line to the log and flush it immediately.
 *
 * @param {string} str The string to add to the log.
 */
TestManager.Log.prototype.println = function(str) {
  if (this.pending_)
    this.flush();

  this.logFunction_(this.prefix_ + str);
};

/**
 * Flush any pending log message.
 */
TestManager.Log.prototype.flush = function() {
  if (!this.pending_)
    return;

  this.logFunction_(this.pending_);
  this.pending_ = '';
};

/**
 * Returns a new constructor function that will inherit from TestManager.Suite.
 *
 * Use this function to create a new test suite subclass.  It will return a
 * properly initialized constructor function for the subclass.  You can then
 * override the setup() and preamble() methods if necessary and add test cases
 * to the subclass.
 *
 *   var MyTests = new TestManager.Suite('MyTests');
 *
 *   MyTests.prototype.setup = function(cx) {
 *     // Sets this.size to cx.size if it exists, or the default value of 10
 *     // if not.
 *     this.setDefault(cx, {size: 10});
 *   };
 *
 *   MyTests.prototype.preamble = function(result, cx) {
 *     // Some tests (even successful ones) may side-effect this list, so
 *     // recreate it before every test.
 *     this.list = [];
 *     for (var i = 0; i < this.size; i++) {
 *       this.list[i] = i;
 *     }
 *   };
 *
 *   // Basic synchronous test case.
 *   MyTests.addTest('pop-length', function(result, cx) {
 *       this.list.pop();
 *
 *       // If this assertion fails, the testcase will stop here.
 *       result.assertEQ(this.list.length, this.size - 1);
 *
 *       // A test must indicate it has passed by calling this method.
 *       result.pass();
 *     });
 *
 *   // Sample asynchronous test case.
 *   MyTests.addTest('async-pop-length', function(result, cx) {
 *       var self = this;
 *
 *       var callback = function() {
 *           result.assertEQ(self.list.length, self.size - 1);
 *           result.pass();
 *       };
 *
 *       // Wait 100ms to check the array length for the sake of this example.
 *       setTimeout(callback, 100);
 *
 *       this.list.pop();
 *
 *       // Indicate that this test needs another 200ms to complete.
 *       // If the test does not report pass/fail by then, it is considered to
 *       // have timed out.
 *       result.requestTime(200);
 *     });
 *
 *   ...
 *
 * @param {string} suiteName The name of the test suite.
 */
TestManager.Suite = function(suiteName) {
  function ctor(testManager, cx) {
    this.testManager_ = testManager;
    this.suiteName = suiteName;

    this.setup(cx);
  }

  ctor.suiteName = suiteName;
  ctor.addTest = TestManager.Suite.addTest;
  ctor.disableTest = TestManager.Suite.disableTest;
  ctor.getTest = TestManager.Suite.getTest;
  ctor.getTestList = TestManager.Suite.getTestList;
  ctor.testList_ = [];
  ctor.testMap_ = {};
  ctor.prototype = { __proto__: TestManager.Suite.prototype };

  TestManager.Suite.subclasses.push(ctor);

  return ctor;
};

/**
 * List of TestManager.Suite subclasses, in the order they were defined.
 */
TestManager.Suite.subclasses = [];

/**
 * Add a test to a TestManager.Suite.
 *
 * This method is copied to new subclasses when they are created.
 */
TestManager.Suite.addTest = function(testName, testFunction) {
  if (testName in this.testMap_)
    throw 'Duplicate test name: ' + testName;

  var test = new TestManager.Test(this, testName, testFunction);
  this.testMap_[testName] = test;
  this.testList_.push(test);
};

/**
 * Defines a disabled test.
 */
TestManager.Suite.disableTest = function(testName, testFunction) {
  if (testName in this.testMap_)
    throw 'Duplicate test name: ' + testName;

  var test = new TestManager.Test(this, testName, testFunction);
  console.log('Disabled test: ' + test.fullName);
};

/**
 * Get a TestManager.Test instance by name.
 *
 * This method is copied to new subclasses when they are created.
 *
 * @param {string} testName The name of the desired test.
 * @return {TestManager.Test} The requested test, or undefined if it was not
 *     found.
 */
TestManager.Suite.getTest = function(testName) {
  return this.testMap_[testName];
};

/**
 * Get an array of TestManager.Tests associated with this Suite.
 *
 * This method is copied to new subclasses when they are created.
 */
TestManager.Suite.getTestList = function() {
  return this.testList_;
};

/**
 * Set properties on a test suite instance, pulling the property value from
 * the context if it exists and from the defaults dictionary if not.
 *
 * This is intended to be used in your test suite's setup() method to
 * define parameters for the test suite which may be overridden through the
 * context object.  For example...
 *
 *   MySuite.prototype.setup = function(cx) {
 *     this.setDefaults(cx, {size: 10});
 *   };
 *
 * If the context object has a 'size' property then this.size will be set to
 * the value of cx.size, otherwise this.size will get a default value of 10.
 *
 * @param {Object} cx The context object for a test run.
 * @param {Object} defaults An object containing name/value pairs to set on
 *     this test suite instance.  The value listed here will be used if the
 *     name is not defined on the context object.
 */
TestManager.Suite.prototype.setDefaults = function(cx, defaults) {
  for (var k in defaults) {
    this[k] = (k in cx) ? cx[k] : defaults[k];
  }
};

/**
 * Subclassable method called to set up the test suite.
 *
 * The default implementation of this method is a no-op.  If your test suite
 * requires some kind of suite-wide setup, this is the place to do it.
 *
 * It's fine to store state on the test suite instance, that state will be
 * accessible to all tests in the suite.  If any test case fails, the entire
 * test suite object will be discarded and a new one will be created for
 * the remaining tests.
 *
 * Any side effects outside of this test suite instance must be idempotent.
 * For example, if you're adding DOM nodes to a document, make sure to first
 * test that they're not already there.  If they are, remove them rather than
 * reuse them.  You should not count on their state, since they were probably
 * left behind by a failed testcase.
 *
 * Any exception here will abort the remainder of the test run.
 *
 * @param {Object} cx The context object for a test run.
 */
TestManager.Suite.prototype.setup = function(cx) {};

/**
 * Subclassable method called to do pre-test set up.
 *
 * The default implementation of this method is a no-op.  If your test suite
 * requires some kind of pre-test setup, this is the place to do it.
 *
 * This can be used to avoid a bunch of boilerplate setup/teardown code in
 * this suite's testcases.
 *
 * Any exception here will abort the remainder of the test run.
 *
 * @param {TestManager.Result} result The result object for the upcoming test.
 * @param {Object} cx The context object for a test run.
 */
TestManager.Suite.prototype.preamble = function(result, cx) {};

/**
 * Subclassable method called to do post-test tear-down.
 *
 * The default implementation of this method is a no-op.  If your test suite
 * requires some kind of pre-test setup, this is the place to do it.
 *
 * This can be used to avoid a bunch of boilerplate setup/teardown code in
 * this suite's testcases.
 *
 * Any exception here will abort the remainder of the test run.
 *
 * @param {TestManager.Result} result The result object for the upcoming test.
 * @param {Object} cx The context object for a test run.
 */
TestManager.Suite.prototype.postamble = function(result, cx) {};

/**
 * Object representing a single test in a test suite.
 *
 * These are created as part of the TestManager.Suite.addTest() method.  You
 * should never have to construct one by hand.
 *
 * @param {TestManager.Suite} suiteClass The test suite class containing this
 *     test.
 * @param {string} testName The local name of this test case, not including the
 *     test suite name.
 * @param {function(TestManager.Result, Object)} testFunction The function to
 *     invoke for this test case.  This is passed a Result instance and the
 *     context object associated with the test run.
 *
 */
TestManager.Test = function(suiteClass, testName, testFunction) {
  /**
   * The test suite class containing this function.
   */
  this.suiteClass = suiteClass;

  /**
   * The local name of this test, not including the test suite name.
   */
  this.testName = testName;

  /**
   * The global name of this test, including the test suite name.
   */
  this.fullName = suiteClass.suiteName + '[' + testName + ']';

  // The function to call for this test.
  this.testFunction_ = testFunction;
};

/**
 * Execute this test.
 *
 * This is called by a TestManager.Result instance, as part of a
 * TestManager.TestRun.  You should not call it by hand.
 *
 * @param {TestManager.Result} result The result object for the test.
 */
TestManager.Test.prototype.run = function(result) {
  try {
    // Tests are applied to the parent TestManager.Suite subclass.
    this.testFunction_.apply(result.suite,
                             [result, result.testRun.cx]);
  } catch (ex) {
    if (ex instanceof TestManager.Result.TestComplete)
      return;

    result.println(ex.stack ? ex.stack : 'Test raised an exception: ' + ex);
    result.completeTest_(result.FAILED, false);
  }
};

/**
 * Used to choose a set of tests and run them.
 *
 * It's slightly more convenient to construct one of these from
 * TestManager.prototype.createTestRun().
 *
 * @param {TestManager} testManager The testManager associated with this
 *     TestRun.
 * @param {Object} cx A context to be passed into the tests.  This can be used
 *     to set parameters for the test suite or individual test cases.
 */
TestManager.TestRun = function(testManager, cx) {
  /**
   * The associated TestManager instance.
   */
  this.testManager = testManager;

  /**
   * Shortcut to the TestManager's log.
   */
  this.log = testManager.log;

  /**
   * The test run context.  It's entirely up to the test suite and test cases
   * how this is used.  It is opaque to TestManager.* classes.
   */
  this.cx = cx || {};

  /**
   * The list of test cases that encountered failures.
   */
  this.failures = [];

  /**
   * The list of test cases that passed.
   */
  this.passes = [];

  /**
   * The time the test run started, or null if it hasn't been started yet.
   */
  this.startDate = null;

  /**
   * The time in milliseconds that the test run took to complete, or null if
   * it hasn't completed yet.
   */
  this.duration = null;

  /**
   * The most recent result object, or null if the test run hasn't started
   * yet.  In order to detect late failures, this is not cleared when the test
   * completes.
   */
  this.currentResult = null;

  /**
   * Number of maximum failures.  The test run will stop when this number is
   * reached.  If 0 or ommitted, the entire set of selected tests is run, even
   * if some fail.
   */
  this.maxFailures = 0;

  /**
   * True if this test run ended early because of an unexpected condition.
   */
  this.panic = false;

  // List of pending test cases.
  this.testQueue_ = [];

};

/**
 * This value can be passed to select() to indicate that all tests should
 * be selected.
 */
TestManager.TestRun.prototype.ALL_TESTS = new String('<all-tests>');

/**
 * Add a single test to the test run.
 */
TestManager.TestRun.prototype.selectTest = function(test) {
  this.testQueue_.push(test);
};

TestManager.TestRun.prototype.selectSuite = function(suiteClass, opt_pattern) {
  var pattern = opt_pattern || this.ALL_TESTS;
  var selectCount = 0;
  var testList = suiteClass.getTestList();

  for (var j = 0; j < testList.length; j++) {
    var test = testList[j];
    // Note that we're using "!==" rather than "!=" so that we're matching
    // the ALL_TESTS String object, rather than the contents of the string.
    if (pattern !== this.ALL_TESTS) {
      if (pattern instanceof RegExp) {
        if (!pattern.test(test.testName))
          continue;
      } else if (test.testName != pattern) {
        continue;
      }
    }

    this.selectTest(test);
    selectCount++;
  }

  return selectCount;
};

/**
 * Selects one or more tests to gather results for.
 *
 * Selecting the same test more than once is allowed.
 *
 * @param {string|RegExp} pattern Pattern used to select tests.
 *     If TestRun.prototype.ALL_TESTS, all tests are selected.
 *     If a string, only the test that exactly matches is selected.
 *     If a RegExp, only tests matching the RegExp are added.
 *
 * @return {int} The number of additional tests that have been selected into
 *     this TestRun.
 */
TestManager.TestRun.prototype.selectPattern = function(pattern) {
  var selectCount = 0;

  for (var i = 0; i < TestManager.Suite.subclasses.length; i++) {
    selectCount += this.selectSuite(TestManager.Suite.subclasses[i], pattern);
  }

  if (!selectCount) {
    this.log.println('No tests matched selection criteria: ' + pattern);
  }

  return selectCount;
};

/**
 * Hooked up to window.onerror during a test run in order to catch exceptions
 * that would otherwise go uncaught.
 */
TestManager.TestRun.prototype.onUncaughtException_ = function(
    message, file, line) {

  if (message.indexOf('Uncaught TestManager.Result.TestComplete') == 0) {
    // This is a result.pass() or result.fail() call from a callback.  We're
    // already going to deal with it as part of the completeTest_() call
    // that raised it.  We can safely squelch this error message.
    return true;
  }

  if (!this.currentResult)
    return;

  if (message == 'Uncaught ' + this.currentResult.expectedErrorMessage_) {
    // Test cases may need to raise an unhandled exception as part of the test.
    return;
  }

  var when = 'during';

  if (this.currentResult.status != this.currentResult.PENDING)
    when = 'after';

  this.log.println('Uncaught exception ' + when + ' test case: ' +
                   this.currentResult.test.fullName);
  this.log.println(message + ', ' + file + ':' + line);

  this.currentResult.completeTest_(this.currentResult.FAILED, false);

  return false;
};

/**
 * Called to when this test run has completed.
 *
 * This method typically re-runs itself asynchronously, in order to let the
 * DOM stabilize and short-term timeouts to complete before declaring the
 * test run complete.
 *
 * @param {boolean} opt_skipTimeout If true, the timeout is skipped and the
 *     test run is completed immediately.  This should only be used from within
 *     this function.
 */
TestManager.TestRun.prototype.onTestRunComplete_ = function(opt_skipTimeout) {
  if (!opt_skipTimeout) {
    // The final test may have left a lingering setTimeout(..., 0), or maybe
    // poked at the DOM in a way that will trigger a event to fire at the end
    // of this stack, so we give things a chance to settle down before our
    // final cleanup...
    setTimeout(this.onTestRunComplete_.bind(this), 0, true);
    return;
  }

  this.duration = (new Date()) - this.startDate;

  this.log.popPrefix();
  this.log.println('} ' + this.passes.length + ' passed, ' +
                   this.failures.length + ' failed, '  +
                   this.msToSeconds_(this.duration));
  this.log.println('');

  this.summarize();

  window.onerror = null;

  this.testManager.onTestRunComplete(this);
};

/**
 * Called by the TestManager.Result object when a test completes.
 *
 * @param {TestManager.Result} result The result object which has just
 *     completed.
 */
TestManager.TestRun.prototype.onResultComplete = function(result) {
  try {
    result.suite.postamble();
  } catch (ex) {
    this.log.println('Unexpected exception in postamble: ' +
                     (ex.stack ? ex.stack : ex));
    this.panic = true;
  }

  this.log.popPrefix();
  this.log.print('} ' + result.status + ', ' +
                 this.msToSeconds_(result.duration));
  this.log.flush();

  if (result.status == result.FAILED) {
    this.failures.push(result);
    this.currentSuite = null;
  } else if (result.status == result.PASSED) {
    this.passes.push(result);
  } else {
    this.log.println('Unknown result status: ' + result.test.fullName + ': ' +
                     result.status);
    return this.panic = true;
  }

  this.runNextTest_();
};

/**
 * Called by the TestManager.Result object when a test which has already
 * completed reports another completion.
 *
 * This is usually indicative of a buggy testcase.  It is probably reporting a
 * result on exit and then again from an asynchronous callback.
 *
 * It may also be the case that the last act of the testcase causes a DOM change
 * which triggers some event to run after the test returns.  If the event
 * handler reports a failure or raises an uncaught exception, the test will
 * fail even though it has already completed.
 *
 * In any case, re-completing a test ALWAYS moves it into the failure pile.
 *
 * @param {TestManager.Result} result The result object which has just
 *     completed.
 * @param {string} lateStatus The status that the test attempted to record this
 *     time around.
 */
TestManager.TestRun.prototype.onResultReComplete = function(
    result, lateStatus) {
  this.log.println('Late complete for test: ' + result.test.fullName + ': ' +
                   lateStatus);

  // Consider any late completion a failure, even if it's a double-pass, since
  // it's a misuse of the testing API.
  var index = this.passes.indexOf(result);
  if (index >= 0) {
    this.passes.splice(index, 1);
    this.failures.push(result);
  }
};

/**
 * Run the next test in the queue.
 */
TestManager.TestRun.prototype.runNextTest_ = function() {
  if (this.panic || !this.testQueue_.length)
    return this.onTestRunComplete_();

  if (this.maxFailures && this.failures.length >= this.maxFailures) {
    this.log.println('Maximum failure count reached, aborting test run.');
    return this.onTestRunComplete_();
  }

  // Peek at the top test first.  We remove it later just before it's about
  // to run, so that we don't disturb the incomplete test count in the
  // event that we fail before running it.
  var test = this.testQueue_[0];
  var suite = this.currentResult ? this.currentResult.suite : null;

  try {
    if (!suite || !(suite instanceof test.suiteClass)) {
      this.log.println('Initializing suite: ' + test.suiteClass.suiteName);
      suite = new test.suiteClass(this.testManager, this.cx);
    }
  } catch (ex) {
    // If test suite setup fails we're not even going to try to run the tests.
    this.log.println('Exception during setup: ' + (ex.stack ? ex.stack : ex));
    this.panic = true;
    this.onTestRunComplete_();
    return;
  }

  try {
    this.log.print('Test: ' + test.fullName + ' {');
    this.log.pushPrefix('  ');

    this.currentResult = new TestManager.Result(this, suite, test);
    suite.preamble(this.currentResult, this.cx);

    this.testQueue_.shift();
  } catch (ex) {
    this.log.println('Unexpected exception during test preamble: ' +
                     (ex.stack ? ex.stack : ex));
    this.log.popPrefix();
    this.log.println('}');

    this.panic = true;
    this.onTestRunComplete_();
    return;
  }

  try {
    this.currentResult.run();
  } catch (ex) {
    // Result.run() should catch test exceptions and turn them into failures.
    // If we got here, it means there is trouble in the testing framework.
    this.log.println('Unexpected exception during test run: ' +
                     (ex.stack ? ex.stack : ex));
    this.panic = true;
  }
};

/**
 * Run the selected list of tests.
 *
 * Some tests may need to run asynchronously, so you cannot assume the run is
 * complete when this function returns.  Instead, pass in a function to be
 * called back when the run has completed.
 *
 * This function will log the results of the test run as they happen into the
 * log defined by the associated TestManager.  By default this is console.log,
 * which can be viewed in the JavaScript console of most browsers.
 *
 * The browser state is determined by the last test to run.  We intentionally
 * don't do any cleanup so that you can inspect the state of a failed test, or
 * leave the browser ready for manual testing.
 *
 * Any failures in TestManager.* code or test suite setup or test case preamble
 * will cause the test run to abort.
 */
TestManager.TestRun.prototype.run = function() {
  this.log.println('Running ' + this.testQueue_.length + ' test(s) {');
  this.log.pushPrefix('  ');

  window.onerror = this.onUncaughtException_.bind(this);
  this.startDate = new Date();
  this.runNextTest_();
};

/**
 * Format milliseconds as fractional seconds.
 */
TestManager.TestRun.prototype.msToSeconds_ = function(ms) {
  var secs = (ms / 1000).toFixed(2);
  return secs + 's';
};

/**
 * Log the current result summary.
 */
TestManager.TestRun.prototype.summarize = function() {
  if (this.failures.length) {
    for (var i = 0; i < this.failures.length; i++) {
      this.log.println('FAILED: ' + this.failures[i].test.fullName);
    }
  }

  if (this.testQueue_.length) {
    this.log.println('Test run incomplete: ' + this.testQueue_.length +
                     ' test(s) were not run.');
  }
};

/**
 * Record of the result of a single test.
 *
 * These are constructed during a test run, you shouldn't have to make one
 * on your own.
 *
 * An instance of this class is passed in to each test function.  It can be
 * used to add messages to the test log, to record a test pass/fail state, to
 * test assertions, or to create exception-proof wrappers for callback
 * functions.
 *
 * @param {TestManager.TestRun} testRun The TestRun instance associated with
 *     this result.
 * @param {TestManager.Suit} suite The Suite containing the test we're
 *     collecting this result for.
 * @param {TestManager.Test} test The test we're collecting this result for.
 */
TestManager.Result = function(testRun, suite, test) {
  /**
   * The TestRun instance associated with this result.
   */
  this.testRun = testRun;

  /**
   * The Suite containing the test we're collecting this result for.
   */
  this.suite = suite;

  /**
   * The test we're collecting this result for.
   */
  this.test = test;

  /**
   * The time we started to collect this result, or null if we haven't started.
   */
  this.startDate = null;

  /**
   * The time in milliseconds that the test took to complete, or null if
   * it hasn't completed yet.
   */
  this.duration = null;

  /**
   * The current status of this test result.
   */
  this.status = this.PENDING;

  // An error message that the test case is expected to generate.
  this.expectedErrorMessage_ = null;
};

/**
 * Possible values for this.status.
 */
TestManager.Result.prototype.PENDING = 'pending';
TestManager.Result.prototype.FAILED  = 'FAILED';
TestManager.Result.prototype.PASSED  = 'passed';

/**
 * Exception thrown when a test completes (pass or fail), to ensure no more of
 * the test is run.
 */
TestManager.Result.TestComplete = function(result) {
  this.result = result;
};

TestManager.Result.TestComplete.prototype.toString = function() {
  return 'TestManager.Result.TestComplete: ' + this.result.test.fullName +
      ', status: ' + this.result.status;
}

/**
 * Start the test associated with this result.
 */
TestManager.Result.prototype.run = function() {
  var self = this;

  this.startDate = new Date();
  this.test.run(this);

  if (this.status == this.PENDING && !this.timeout_) {
    this.println('Test did not return a value and did not request more time.');
    this.completeTest_(this.FAILED, false);
  }
};

/**
 * Unhandled error message this test expects to generate.
 *
 * This must be the exact string that would appear in the JavaScript console,
 * minus the 'Uncaught ' prefix.
 *
 * The test case does *not* automatically fail if the error message is not
 * encountered.
 */
TestManager.Result.prototype.expectErrorMessage = function(str) {
  this.expectedErrorMessage_ = str;
};

/**
 * Function called when a test times out.
 */
TestManager.Result.prototype.onTimeout_ = function() {
  this.timeout_ = null;

  if (this.status != this.PENDING)
    return;

  this.println('Test timed out.');
  this.completeTest_(this.FAILED, false);
};

/**
 * Indicate that a test case needs more time to complete.
 *
 * Before a test case returns it must report a pass/fail result, or request more
 * time to do so.
 *
 * If a test does not report pass/fail before the time expires it will
 * be reported as a timeout failure.  Any late pass/fails will be noted in the
 * test log, but will not affect the final result of the test.
 *
 * Test cases may call requestTime more than once.  If you have a few layers
 * of asynchronous API to go through, you should call this once per layer with
 * an estimate of how long each callback will take to complete.
 *
 * @param {int} ms Number of milliseconds requested.
 */
TestManager.Result.prototype.requestTime = function(ms) {
  if (this.timeout_)
    clearTimeout(this.timeout_);

  this.timeout_ = setTimeout(this.onTimeout_.bind(this), ms);
};

/**
 * Report the completion of a test.
 *
 * @param {string} status The status of the test case.
 * @param {boolean} opt_throw Optional boolean indicating whether or not
 *     to throw the TestComplete exception.
 */
TestManager.Result.prototype.completeTest_ = function(status, opt_throw) {
  if (this.status != this.PENDING) {
    this.testRun.onResultReComplete(this, status);
    return;
  }

  this.duration = (new Date()) - this.startDate;
  this.status = status;

  this.testRun.onResultComplete(this);

  if (arguments.length < 2 || opt_throw)
    throw new TestManager.Result.TestComplete(this);
};

/**
 * Assert that an actual value is exactly equal to the expected value.
 *
 * This uses the JavaScript '===' operator in order to avoid type coercion.
 *
 * If the assertion fails, the test is marked as a failure and a TestCompleted
 * exception is thrown.
 *
 * @param {*} actual The actual measured value.
 * @param {*} expected The value expected.
 * @param {string} opt_name An optional name used to identify this
 *     assertion in the test log.  If ommitted it will be the file:line
 *     of the caller.
 */
TestManager.Result.prototype.assertEQ = function(actual, expected, opt_name) {
  if (actual === expected)
    return;

  var name = opt_name ? '[' + opt_name + ']' : '';
  this.fail('assertEQ' + name + ': ' + this.getCallerLocation_(1) + ': ' +
            String(actual) + ' !== ' + String(expected));
};

/**
 * Assert that a value is true.
 *
 * This uses the JavaScript '===' operator in order to avoid type coercion.
 * The must be the boolean value `true`, not just some "truish" value.
 *
 * If the assertion fails, the test is marked as a failure and a TestCompleted
 * exception is thrown.
 *
 * @param {boolean} actual The actual measured value.
 * @param {string} opt_name An optional name used to identify this
 *     assertion in the test log.  If ommitted it will be the file:line
 *     of the caller.
 */
TestManager.Result.prototype.assert = function(actual, opt_name) {
  if (actual === true)
    return;

  var name = opt_name ? '[' + opt_name + ']' : '';

  this.fail('assert' + name + ': ' + this.getCallerLocation_(1) + ': ' +
            String(actual));
};

/**
 * Return the filename:line of a calling stack frame.
 *
 * This uses a dirty hack.  It throws an exception, catches it, and examines
 * the stack property of the caught exception.
 *
 * @param {int} frameIndex The stack frame to return.  0 is the frame that
 *     called this method, 1 is its caller, and so on.
 * @return {string} A string of the format "filename:linenumber".
 */
TestManager.Result.prototype.getCallerLocation_ = function(frameIndex) {
  try {
    throw new Error();
  } catch (ex) {
    var frame = ex.stack.split('\n')[frameIndex + 2];
    var ary = frame.match(/([^/]+:\d+):\d+\)?$/);
    return ary ? ary[1] : '???';
  }
};

/**
 * Write a message to the result log.
 */
TestManager.Result.prototype.println = function(message) {
  this.testRun.log.println(message);
};

/**
 * Mark a failed test and exit out of the rest of the test.
 *
 * This will throw a TestCompleted exception, causing the current test to stop.
 *
 * @param {string} opt_message Optional message to add to the log.
 */
TestManager.Result.prototype.fail = function(opt_message) {
  if (arguments.length)
    this.println(opt_message);

  this.completeTest_(this.FAILED, true);
};

/**
 * Mark a passed test and exit out of the rest of the test.
 *
 * This will throw a TestCompleted exception, causing the current test to stop.
 *
 * @param {string} opt_message Optional message to add to the log.
 */
TestManager.Result.prototype.pass  = function(opt_message) {
  if (arguments.length)
    this.println(opt_message);

  this.completeTest_(this.PASSED, true);
};
