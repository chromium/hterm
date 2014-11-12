// Copyright (c) 2014 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Constructor for a Size record.
 *
 * Instances of this class have public read/write members for width and height.
 *
 * @param {integer} width The width of this record.
 * @param {integer} height The height of this record.
 */
export var Size = function(width, height) {
  this.width = width;
  this.height = height;
};

export default Size;

/**
 * Adjust the width and height of this record.
 *
 * @param {integer} width The new width of this record.
 * @param {integer} height The new height of this record.
 */
Size.prototype.resize = function(width, height) {
  this.width = width;
  this.height = height;
};

/**
 * Return a copy of this record.
 *
 * @return {Size} A new Size instance with the same width and height.
 */
Size.prototype.clone = function() {
  return new Size(this.width, this.height);
};

/**
 * Set the height and width of this instance based on another Size.
 *
 * @param {Size} that The object to copy from.
 */
Size.prototype.setTo = function(that) {
  this.width = that.width;
  this.height = that.height;
};

/**
 * Test if another Size instance is equal to this one.
 *
 * @param {Size} that The other Size instance.
 * @return {boolen} True if both instances have the same width/height, false
 *     otherwise.
 */
Size.prototype.equals = function(that) {
  return this.width == that.width && this.height == that.height;
};

/**
 * Return a string representation of this instance.
 *
 * @return {string} A string that identifies the width and height of this
 *     instance.
 */
Size.prototype.toString = function() {
  return '[Size: ' + this.width + ', ' + this.height + ']';
};
