// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * Utility class used to add publish/subscribe/unsubscribe functionality to
 * an existing object.
 */
hterm.PubSub = function() {
  this.observers_ = {};
};

/**
 * Add publish, subscribe, and unsubscribe methods to an existing object.
 *
 * No other properties of the object are touched, so there is no need to
 * worry about clashing private properties.
 *
 * @param {Object} obj The object to add this behavior to.
 */
hterm.PubSub.addBehavior = function(obj) {
  var pubsub = new hterm.PubSub();
  for (var m in hterm.PubSub.prototype) {
    obj[m] = hterm.PubSub.prototype[m].bind(pubsub);
  }
};

/**
 * Subscribe to be notified of messages about a subject.
 *
 * @param {string} subject The subject to subscribe to.
 * @param {function(Object)} callback The function to invoke for notifications.
 */
hterm.PubSub.prototype.subscribe = function(subject, callback) {
  if (!(subject in this.observers_))
    this.observers_[subject] = [];

  this.observers_[subject].push(callback);
};

/**
 * Unsubscribe from a subject.
 *
 * @param {string} subject The subject to unsubscribe from.
 * @param {function(Object)} callback A callback previously registered via
 *     subscribe().
 */
hterm.PubSub.prototype.unsubscribe = function(subject, callback) {
  var list = this.observers_[subject];
  if (!list)
    throw 'Invalid subject: ' + subject;

  var i = list.indexOf(callback);
  if (i < 0)
    throw 'Not subscribed: ' + subject;

  list.splice(i, 1);
};

/**
 * Publish a message about a subject.
 *
 * Subscribers (and the optional final callback) are invoked asynchronously.
 * This method will return before anyone is actually notified.
 *
 * @param {string} subject The subject to publish about.
 * @param {Object} e An arbitrary object associated with this notification.
 * @param {function(Object)} opt_lastCallback An optional function to call after
 *     all subscribers have been notified.
 */
hterm.PubSub.prototype.publish = function(subject, e, opt_lastCallback) {
  function notifyList(i) {
    // Set this timeout before invoking the callback, so we don't have to
    // concern ourselves with exceptions.
    if (i < list.length - 1)
      setTimeout(notifyList, 0, i + 1);

    list[i](e);
  }

  var list = this.observers_[subject];
  if (list) {
    // Copy the list, in case it changes while we're notifying.
    list = [].concat(list);
  }

  if (opt_lastCallback) {
    if (list) {
      list.push(opt_lastCallback);
    } else {
      list = [opt_lastCallback];
    }
  }

  if (list)
    setTimeout(notifyList, 0, 0);
};
