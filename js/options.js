// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview This file implements the hterm.Options class,
 * which stores current operating conditions for the terminal.  This object is
 * used instead of a series of parameters to allow saving/restoring of cursor
 * conditions easily, and to provide an easy place for common configuration
 * options.
 *
 * Original code by Cory Maccarrone.
 */

/**
 * Constructor for the hterm.Options class, optionally acting as a copy
 * constructor.
 *
 * @param {hterm.Options=} opt_copy Optional instance to copy.
 * @constructor
 */
hterm.Options = function(opt_copy) {
  // All attributes in this class are public to allow easy access by the
  // terminal.

  this.wraparound = opt_copy ? opt_copy.wraparound : true;
  this.reverseWraparound = opt_copy ? opt_copy.reverseWraparound : false;
  this.originMode = opt_copy ? opt_copy.originMode : false;
  this.autoCarriageReturn = opt_copy ? opt_copy.autoCarriageReturn : false;
  this.cursorVisible = opt_copy ? opt_copy.cursorVisible : false;
  this.cursorBlink = opt_copy ? opt_copy.cursorBlink : false;
  this.insertMode = opt_copy ? opt_copy.insertMode : false;
  this.reverseVideo = opt_copy ? opt_copy.reverseVideo : false;
};
