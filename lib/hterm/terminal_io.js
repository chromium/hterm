// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import utf8 from 'hterm/i18n/utf8';

/**
 * Input/Output interface used by commands to communicate with the terminal.
 *
 * The active command must override the onVTKeystroke() and sendString() methods
 * of this class in order to receive keystrokes and send output to the correct
 * destination.
 *
 * Isolating commands from the terminal provides the following benefits:
 * - Provides a mechanism to save and restore onVTKeystroke and sendString
 *   handlers when invoking subcommands (see the push() and pop() methods).
 * - The isolation makes it easier to make changes in Terminal and supporting
 *   classes without affecting commands.
 *
 * @param {Terminal}
 */
export var TerminalIO = function(terminal) {
  this.terminal_ = terminal;

  // The IO object to restore on IO.pop().
  this.previousIO_ = null;
};

export default TerminalIO;

/**
 * Show the terminal overlay for a given amount of time.
 *
 * The terminal overlay appears in inverse video in a large font, centered
 * over the terminal.  You should probably keep the overlay message brief,
 * since it's in a large font and you probably aren't going to check the size
 * of the terminal first.
 *
 * @param {string} msg The text (not HTML) message to display in the overlay.
 * @param {number} opt_timeout The amount of time to wait before fading out
 *     the overlay.  Defaults to 1.5 seconds.  Pass null to have the overlay
 *     stay up forever (or until the next overlay).
 */
TerminalIO.prototype.showOverlay = function(message, opt_timeout) {
  this.terminal_.showOverlay(message, opt_timeout);
};

/**
 * Change the preference profile for the terminal.
 *
 * @param profileName {string} The name of the preference profile to activate.
 */
TerminalIO.prototype.setTerminalProfile = function(profileName) {
  this.terminal_.setProfile(profileName);
};

/**
 * Create a new TerminalIO instance and make it active on the Terminal
 * object associated with this instance.
 *
 * This is used to pass control of the terminal IO off to a subcommand.  The
 * IO.pop() method can be used to restore control when the subcommand completes.
 */
TerminalIO.prototype.push = function() {
  var io = new TerminalIO(this.terminal_);
  io.keyboardCaptured_ = this.keyboardCaptured_;

  io.columnCount = this.columnCount;
  io.rowCount = this.rowCount;

  io.previousIO_ = this.terminal_.io;
  this.terminal_.io = io;

  return io;
};

/**
 * Restore the Terminal's previous IO object.
 */
TerminalIO.prototype.pop = function() {
  this.terminal_.io = this.previousIO_;
};

/**
 * Called when data needs to be sent to the current command.
 *
 * Clients should override this to receive notification of pending data.
 *
 * @param {string} string The data to send.
 */
TerminalIO.prototype.sendString = function(string) {
  // Override this.
  console.log('Unhandled sendString: ' + string);
};

/**
 * Called when a terminal keystroke is detected.
 *
 * Clients should override this to receive notification of keystrokes.
 *
 * The keystroke data will be encoded according to the 'send-encoding'
 * preference.
 *
 * @param {string} string The VT key sequence.
 */
TerminalIO.prototype.onVTKeystroke = function(string) {
  // Override this.
  console.log('Unobserverd VT keystroke: ' + JSON.stringify(string));
};

TerminalIO.prototype.onTerminalResize_ = function(width, height) {
  var obj = this;
  while (obj) {
    obj.columnCount = width;
    obj.rowCount = height;
    obj = obj.previousIO_;
  }

  this.onTerminalResize(width, height);
};

/**
 * Called when terminal size is changed.
 *
 * Clients should override this to receive notification of resize.
 *
 * @param {string|integer} terminal width.
 * @param {string|integer} terminal height.
 */
TerminalIO.prototype.onTerminalResize = function(width, height) {
  // Override this.
};

/**
 * Write a UTF-8 encoded byte string to the terminal.
 *
 * @param {string} string The UTF-8 encoded string to print.
 */
TerminalIO.prototype.writeUTF8 = function(string) {
  if (this.terminal_.io != this)
    throw 'Attempt to print from inactive IO object.';

  this.terminal_.interpret(string);
};

/**
 * Write a UTF-8 encoded byte string to the terminal followed by crlf.
 *
 * @param {string} string The UTF-8 encoded string to print.
 */
TerminalIO.prototype.writelnUTF8 = function(string) {
  if (this.terminal_.io != this)
    throw 'Attempt to print from inactive IO object.';

  this.terminal_.interpret(string + '\r\n');
};

/**
 * Write a UTF-16 JavaScript string to the terminal.
 *
 * @param {string} string The string to print.
 */
TerminalIO.prototype.print =
TerminalIO.prototype.writeUTF16 = function(string) {
  this.writeUTF8(utf8.encode(string));
};

/**
 * Print a UTF-16 JavaScript string to the terminal followed by a newline.
 *
 * @param {string} string The string to print.
 */
TerminalIO.prototype.println =
TerminalIO.prototype.writelnUTF16 = function(string) {
  this.writelnUTF8(utf8.encode(string));
};
