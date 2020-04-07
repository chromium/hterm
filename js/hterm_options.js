// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

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
 * The defaults are as defined in http://www.vt100.net/docs/vt510-rm/DECSTR
 * except that we enable autowrap (wraparound) by default since that seems to
 * be what xterm does.
 *
 * @param {!hterm.Options=} copy Optional instance to copy.
 * @constructor
 */
hterm.Options = function(copy = undefined) {
  // All attributes in this class are public to allow easy access by the
  // terminal.

  this.wraparound = copy ? copy.wraparound : true;
  this.reverseWraparound = copy ? copy.reverseWraparound : false;
  this.originMode = copy ? copy.originMode : false;
  this.autoCarriageReturn = copy ? copy.autoCarriageReturn : false;
  this.cursorVisible = copy ? copy.cursorVisible : false;
  this.cursorBlink = copy ? copy.cursorBlink : false;
  this.insertMode = copy ? copy.insertMode : false;
  this.reverseVideo = copy ? copy.reverseVideo : false;
  this.bracketedPaste = copy ? copy.bracketedPaste : false;
};
