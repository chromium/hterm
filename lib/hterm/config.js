// Copyright (c) 2014 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import configDefs from 'hterm/config_defs';

export var Config = function() {
  this.values = {};

  for (var key in configDefs) {
    this.values[key] = configDefs[key][0];
  }

  this.observers = [];
};

export default Config;

Config.prototype.get = function(name) {
  if (!(name in this.values))
    throw new Error('Unknown config value: ' + name);

  return this.values[name];
};

Config.prototype.set = function(name, value) {
  this.values[name] = value;
  this.observers.forEach(function(callback) { callback(name, value) });
};

Config.prototype.addObserver = function(callback) {
  this.observers.push(callback);
};

Config.prototype.removeObserver = function(callback) {
  var i = this.observers.indexOf(callback);
  this.observers.splice(i, 1);
};
