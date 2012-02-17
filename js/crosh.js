// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * The Crosh-powered terminal command.
 *
 * This class defines a command that can be run in an hterm.Terminal instance.
 * The Crosh command uses terminalPrivate extension API to create and use crosh
 * process on ChromeOS machine.
 *
 *
 * @param {Object} argv The argument object passed in from the Terminal.
 */
hterm.Crosh = function(argv) {
  this.argv_ = argv;
  this.io = null;
  this.pid_ = -1;
};

/**
 * Static initialier called from crosh.html.
 *
 * This constructs a new Terminal instance and instructs it to run the Crosh
 * command.
 */
hterm.Crosh.init = function() {
  var terminal = new hterm.Terminal(15, 18);
  terminal.decorate(document.querySelector('#terminal'));

  // Useful for console debugging.
  window.term_ = terminal;

  // Looks like there is a race between this and terminal initialization, thus
  // adding timeout.
  setTimeout(function() {
      terminal.setCursorPosition(0, 0);
      terminal.setCursorVisible(true);
      terminal.runCommandClass(hterm.Crosh, document.location.hash.substr(1));
    }, 500);
  return true;
};

/**
 * The name of this command used in messages to the user.
 *
 * Perhaps this will also be used by the user to invoke this command, if we
 * build a shell command.
 */
hterm.Crosh.prototype.commandName = 'crosh';

/**
 * Called when an event from the crosh process is detected.
 *
 * @param pid Process id of the process the event came from.
 * @param type Type of the event.
 *             'stdout': Process output detected.
 *             'exit': Process has exited.
 * @param text Text that was detected on process output.
**/
hterm.Crosh.prototype.onProcessOutput_ = function(pid, type, text) {
  if (this.pid_ == -1 || pid != this.pid_)
    return;

  if (type == 'exit') {
    this.exit(0);
    return;
  }
  this.io.print(text);
}

/**
 * Start the crosh command.
 *
 * This is invoked by the terminal as a result of terminal.runCommandClass().
 */
hterm.Crosh.prototype.run = function() {
  this.io = this.argv_.io.push();

  if (!chrome.terminalPrivate) {
    this.io.println("Crosh is not supported on your version of Chrome :(");
    this.io.println("Minimal version of Chrome needed to run crosh is 18.");
    this.exit(1);
    return;
  }

  this.io.onVTKeystroke = this.sendString_.bind(this);
  this.io.sendString = this.sendString_.bind(this);

  var self = this;
  this.io.onTerminalResize = this.onTerminalResize_.bind(this);
  chrome.terminalPrivate.onProcessOutput.addListener(
      this.onProcessOutput_.bind(this));
  document.body.onunload = this.close_.bind(this);
  chrome.terminalPrivate.openTerminalProcess(this.commandName,
      function(pid) {
        if (pid == undefined || pid == -1) {
          self.io.println("Opening crosh process failed.");
          self.exit(1);
          return;
        }
        self.pid_ = pid;

        if (!chrome.terminalPrivate.onTerminalResize) {
          console.warn("Terminal resizing not supported.");
          return;
        }

        // Setup initial window size.
        self.onTerminalResize_(self.io.terminal_.screenSize.width,
                               self.io.terminal_.screenSize.height);
      }
  );
};

/**
 * Send a string to the crosh process.
 *
 * @param {string} string The string to send.
 */
hterm.Crosh.prototype.sendString_ = function(string) {
  if (this.pid_ == -1)
    return;
  chrome.terminalPrivate.sendInput(this.pid_, string);
};

/**
 * Closes crosh terminal and exits the crosh command.
**/
hterm.Crosh.prototype.close_ = function() {
    if (this.pid_ == -1)
      return;
    chrome.terminalPrivate.closeTerminalProcess(this.pid_);
    this.pid_ = -1;
}

/**
 * Notify process about new terminal size.
 *
 * @param {string|integer} terminal width.
 * @param {string|integer} terminal height.
 */
hterm.Crosh.prototype.onTerminalResize_ = function(width, height) {
  if (this.pid_ == -1)
    return;

  // We don't want to break older versions of chrome.
  if (!chrome.terminalPrivate.onTerminalResize)
    return;

  chrome.terminalPrivate.onTerminalResize(this.pid_,
      Number(width), Number(height),
      function(success) {
        if (!success)
          console.warn("terminalPrivate.onTerminalResize failed");
      }
  );
};

/**
 * Exit the crosh command.
 */
hterm.Crosh.prototype.exit = function(code) {
  this.close_();
  this.io.pop();
  if (this.argv_.onExit)
    this.argv_.onExit(code);
};

