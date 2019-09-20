// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @fileoverview hterm.Pubsub unit tests.
 */

describe('hterm_pubsub_tests.js', () => {

/**
 * Test that the appropriate methods are added to a hterm.PubSub target object.
 */
it('methods', () => {
    var obj = {};
    hterm.PubSub.addBehavior(obj);
    assert.hasAllKeys(obj, ['subscribe', 'unsubscribe', 'publish']);
  });

/**
 * Test that subscribers are notified in the proper order.
 */
it('publish-order', (done) => {
    var callbackCount = 0;

    function one() { assert.equal(1, ++callbackCount); }
    function two() { assert.equal(2, ++callbackCount); }
    function three() { assert.equal(3, ++callbackCount); }
    function last() { assert.equal(4, ++callbackCount); done(); }

    var obj = /** @type {!hterm.PubSub} */ ({});
    hterm.PubSub.addBehavior(obj);

    obj.subscribe('test', one);
    obj.subscribe('test', two);
    obj.subscribe('test', three);

    obj.publish('test', null, last);
  });

/**
 * Test that a published parameter is handed off to all subscribers.
 */
it('parameter', (done) => {
    var expected = {};

    function one(param) { assert.deepStrictEqual(expected, param); }
    function two(param) { assert.deepStrictEqual(expected, param); }
    function three(param) { assert.deepStrictEqual(expected, param); }
    function last(param) { assert.deepStrictEqual(expected, param); done(); }

    var obj = /** @type {!hterm.PubSub} */ ({});
    hterm.PubSub.addBehavior(obj);

    obj.subscribe('test', one);
    obj.subscribe('test', two);
    obj.subscribe('test', three);

    obj.publish('test', expected, last);
  });

/**
 * Test that the final callback is invoked, even if nobody has subscribed.
 */
it('forever-alone', (done) => {
    var calledLast = false;

    function last(param) { calledLast = true; }

    var obj = /** @type {!hterm.PubSub} */ ({});
    hterm.PubSub.addBehavior(obj);

    obj.publish('test', null, last);

    const check = () => {
      if (calledLast) {
        done();
      } else {
        setTimeout(check, 1);
      }
    };
    check();
  });

/**
 * Test that an exception raised by a subscriber does not stop the remaining
 * notifications.
 */
it('exception', function(done) {
    // We need to manually disable this.
    // https://github.com/mochajs/mocha/issues/1985
    const oldUncaught = Mocha.Runner.prototype.uncaught;
    Mocha.Runner.prototype.uncaught = () => {};

    var calledFoo = false;
    var calledBar = false;
    var calledLast = false;

    function foo() { throw 'EXPECTED_EXCEPTION'; }
    function bar() { calledBar = true; }
    function last() { calledLast = true; }

    var obj = /** @type {!hterm.PubSub} */ ({});
    hterm.PubSub.addBehavior(obj);

    obj.subscribe('test', foo);
    obj.subscribe('test', bar);

    obj.publish('test', null, last);

    const check = () => {
      if (calledLast) {
        assert.isFalse(calledFoo);
        assert.isTrue(calledBar);
        assert.isTrue(calledLast);
        Mocha.Runner.prototype.uncaught = oldUncaught;
        done();
      } else {
        setTimeout(check, 1);
      }
    };
    check();
  });

});
