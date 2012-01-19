// Copyright (c) 2011 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

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
 * Show an in-terminal alert dialog.
 *
 * This dialog is asynchronous, you'll be called back when it is dismissed.
 *
 * @param {string} message The message to display to the user.
 * @param {function} onOk The function to invoke when the dialog is dismissed.
 */
hterm.Terminal.IO.prototype.alert = function(message, onOk) {
  this.terminal_.alertDialog.show(message, onOk);
};

/**
 * Show an in-terminal prompt dialog.
 *
 * This dialog is asynchronous, you'll be called back when it is dismissed.
 *
 * @param {string} message The message to display to the user.
 * @param {string} defaultValue The default value to present to the user.
 * @param {function(string)} onOk The function to invoke if the dialog is
 *     accepted.
 * @param {function} onCancel The function to invoke if the dialog is cancelled.
 */
hterm.Terminal.IO.prototype.prompt = function(
    message, defaultValue, onOk, onCancel) {
  this.terminal_.promptDialog.show(message, defaultValue, onOk, onCancel);
};

/**
 * Show an in-terminal confirm dialog.
 *
 * This dialog is asynchronous, you'll be called back when it is dismissed.
 *
 * @param {string} message The message to display to the user.
 * @param {function} onOk The function to invoke if the dialog is accepted.
 * @param {function} onCancel The function to invoke if the dialog is cancelled.
 */
hterm.Terminal.IO.prototype.confirm = function(message, onOk, onCancel) {
  this.terminal_.confirmDialog.show(message, onOk, onCancel);
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
  console.log('Unobserverd VT keystroke: ' + string);
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
  console.log('Unobserverd terminal resized: ' + width + "x" + height);
};

/**
 * Print a string to the terminal.
 *
 * @param {string} string The string to print.
 */
hterm.Terminal.IO.prototype.print = function(string) {
  if (this.terminal_.io != this)
    throw 'Attempt to print from inactive IO object.';

  this.terminal_.interpret(string);
};

/**
 * Print a string to the terminal followed by a newline.
 *
 * @param {string} string The string to print.
 */
hterm.Terminal.IO.prototype.println = function(string) {
  this.terminal_.interpret(string + '\n');
};
