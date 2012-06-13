// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

hterm.PubSub.Tests = new lib.TestManager.Suite('hterm.PubSub.Tests');

/**
 * Test that the appropriate methods are added to a hterm.PubSub target object.
 */
hterm.PubSub.Tests.addTest('methods', function(result, cx) {
    var obj = {};
    hterm.PubSub.addBehavior(obj);

    result.assertEQ(3, Object.keys(obj).length);

    var methodNames = ['subscribe', 'unsubscribe', 'publish'];
    for (var i in methodNames.length) {
      result.assert(methodNames[i] in obj, methodNames[i]);
    }

    result.pass();
  });

/**
 * Test that subscribers are notified in the proper order.
 */
hterm.PubSub.Tests.addTest('publish-order', function(result, cx) {
    var callbackCount = 0;

    function one() { result.assertEQ(1, ++callbackCount) }
    function two() { result.assertEQ(2, ++callbackCount) }
    function three() { result.assertEQ(3, ++callbackCount) }
    function last() { result.assertEQ(4, ++callbackCount); result.pass() }

    var obj = {};
    hterm.PubSub.addBehavior(obj);

    obj.subscribe('test', one);
    obj.subscribe('test', two);
    obj.subscribe('test', three);

    obj.publish('test', null, last);

    result.requestTime(100);
  });

/**
 * Test that a published parameter is haneded off to all subscribers.
 */
hterm.PubSub.Tests.addTest('parameter', function(result, cx) {
    var expected = {};

    function one(param) { result.assertEQ(expected, param) }
    function two(param) { result.assertEQ(expected, param) }
    function three(param) { result.assertEQ(expected, param) }
    function last(param) { result.assertEQ(expected, param); result.pass() }

    var obj = {};
    hterm.PubSub.addBehavior(obj);

    obj.subscribe('test', one);
    obj.subscribe('test', two);
    obj.subscribe('test', three);

    obj.publish('test', expected, last);

    result.requestTime(100);
  });

/**
 * Test that the final callback is invoked, even if nobody has subscribed.
 */
hterm.PubSub.Tests.addTest('forever-alone', function(result, cx) {
    result.pass();
    return;

    var calledLast = false;

    function last(param) { calledLast = true }

    var obj = {};
    hterm.PubSub.addBehavior(obj);

    obj.publish('test', null, last);

    setTimeout(function() {
        result.assert(calledLast);
        console.log('PASS');
        result.pass();
      }, 100);

    result.requestTime(200);
  });

/**
 * Test that an exception raised by a subscriber does not stop the remaining
 * notifications.
 */
hterm.PubSub.Tests.addTest('exception', function(result, cx) {
    var calledFoo = false;
    var calledBar = false;
    var calledLast = false;

    function foo() { throw 'EXPECTED_EXCEPTION' }
    function bar() { calledBar = true }
    function last() { calledLast = true }

    var obj = {};
    hterm.PubSub.addBehavior(obj);

    obj.subscribe('test', foo);
    obj.subscribe('test', bar);

    obj.publish('test', null, last);

    result.expectErrorMessage('EXPECTED_EXCEPTION');

    setTimeout(function() {
        result.assert(calledFoo == false);
        result.assert(calledBar);
        result.assert(calledLast);
        result.pass();
      }, 100);

    result.requestTime(200);
  });
