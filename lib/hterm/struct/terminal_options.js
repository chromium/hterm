// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * The defaults are as defined in http://www.vt100.net/docs/vt510-rm/DECSTR
 * except that we enable autowrap (wraparound) by defaut since that seems to
 * be what xterm does.
 *
 * @param {hterm.Options=} opt_copy Optional instance to copy.
 * @constructor
 */
export var TerminalOptions = function(opt_copy) {
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
  this.bracketedPaste = opt_copy ? opt_copy.bracketedPaste : false;
};

export default TerminalOptions;
