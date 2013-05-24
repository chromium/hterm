// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('lib.encodeUTF8');

/**
 * Input/Output interface used by commands to communicate with the terminal.
 *
 * Commands like `nassh` and `crosh` receive an instance of this class as
 * part of their argv object.  This allows them to write to and read from the
 * terminal without exposing them to an entire hterm.Terminal instance.
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
 * - In The Future commands may run in web workers where they would only be able
 *   to talk to a Terminal instance through an IPC mechanism.
 *
 * @param {hterm.Terminal}
 */
hterm.Terminal.IO = function(terminal) {
  this.terminal_ = terminal;

  // The IO object to restore on IO.pop().
  this.previousIO_ = null;
};

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
hterm.Terminal.IO.prototype.showOverlay = function(message, opt_timeout) {
  this.terminal_.showOverlay(message, opt_timeout);
};

/**
 * Open an frame in the current terminal window, pointed to the specified
 * url.
 *
 * Eventually we'll probably need size/position/decoration options.
 * The user should also be able to move/resize the frame.
 *
 * @param {string} url The URL to load in the frame.
 * @param {Object} opt_options Optional frame options.  Not implemented.
 */
hterm.Terminal.IO.prototype.createFrame = function(url, opt_options) {
  return new hterm.Frame(this.terminal_, url, opt_options);
};

/**
 * Change the preference profile for the terminal.
 *
 * @param profileName {string} The name of the preference profile to activate.
 */
hterm.Terminal.IO.prototype.setTerminalProfile = function(profileName) {
  this.terminal_.setProfile(profileName);
};

/**
 * Create a new hterm.Terminal.IO instance and make it active on the Terminal
 * object associated with this instance.
 *
 * This is used to pass control of the terminal IO off to a subcommand.  The
 * IO.pop() method can be used to restore control when the subcommand completes.
 */
hterm.Terminal.IO.prototype.push = function() {
  var io = new hterm.Terminal.IO(this.terminal_);
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
hterm.Terminal.IO.prototype.pop = function() {
  this.terminal_.io = this.previousIO_;
};

/**
 * Called when data needs to be sent to the current command.
 *
 * Clients should override this to receive notification of pending data.
 *
 * @param {string} string The data to send.
 */
hterm.Terminal.IO.prototype.sendString = function(string) {
  // Override this.
  console.log('Unhandled sendString: ' + string);
};

/**
 * Called when a terminal keystroke is detected.
 *
 * Clients should override this to receive notification of keystrokes.
 *
 * @param {string} string The VT key sequence.
 */
hterm.Terminal.IO.prototype.onVTKeystroke = function(string) {
  // Override this.
  console.log('Unobserverd VT keystroke: ' + JSON.stringify(string));
};

hterm.Terminal.IO.prototype.onTerminalResize_ = function(width, height) {
  var obj = this;
  while (obj) {
    obj.columnCount = width;
    obj.rowCount = height;
    obj = obj.previousIO_;
  }

  this.onTerminalResize();
};

/**
 * Called when terminal size is changed.
 *
 * Clients should override this to receive notification of resize.
 *
 * @param {string|integer} terminal width.
 * @param {string|integer} terminal height.
 */
hterm.Terminal.IO.prototype.onTerminalResize = function(width, height) {
  // Override this.
};

/**
 * Write a UTF-8 encoded byte string to the terminal.
 *
 * @param {string} string The UTF-8 encoded string to print.
 */
hterm.Terminal.IO.prototype.writeUTF8 = function(string) {
  if (this.terminal_.io != this)
    throw 'Attempt to print from inactive IO object.';

  this.terminal_.interpret(string);
};

/**
 * Write a UTF-8 encoded byte string to the terminal followed by crlf.
 *
 * @param {string} string The UTF-8 encoded string to print.
 */
hterm.Terminal.IO.prototype.writelnUTF8 = function(string) {
  if (this.terminal_.io != this)
    throw 'Attempt to print from inactive IO object.';

  this.terminal_.interpret(string + '\r\n');
};

/**
 * Write a UTF-16 JavaScript string to the terminal.
 *
 * @param {string} string The string to print.
 */
hterm.Terminal.IO.prototype.print =
hterm.Terminal.IO.prototype.writeUTF16 = function(string) {
  this.writeUTF8(lib.encodeUTF8(string));
};

/**
 * Print a UTF-16 JavaScript string to the terminal followed by a newline.
 *
 * @param {string} string The string to print.
 */
hterm.Terminal.IO.prototype.println =
hterm.Terminal.IO.prototype.writelnUTF16 = function(string) {
  this.writelnUTF8(lib.encodeUTF8(string));
};
