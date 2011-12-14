// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * The NaCl-ssh-powered terminal command.
 *
 * This class defines a command that can be run in an hterm.Terminal instance.
 * The NaSSH command creates an instance of the NaCl-ssh plugin and uses it to
 * communicate with an ssh daemon.
 *
 * If you want to use something other than this NaCl plugin to connect to a
 * remote host (like a shellinaboxd, etc), you'll want to create a brand new
 * command.
 *
 * @param {Object} argv The argument object passed in from the Terminal.
 */
hterm.NaSSH = function(argv) {
  this.argv_ = argv;
  this.io = null;
  this.verbose_ = false;
};

/**
 * Static initialier called from nassh.html.
 *
 * This constructs a new Terminal instance and instructs it to run the NaSSH
 * command.
 */
hterm.NaSSH.init = function() {
  var terminal = new hterm.Terminal(15, 18);
  terminal.decorate(document.querySelector('#terminal'));

  // Useful for console debugging.
  window.term_ = terminal;

  var self = this;
  setTimeout(function() {
      terminal.setCursorPosition(0, 0);
      terminal.setCursorVisible(true);
      terminal.runCommandClass(hterm.NaSSH, document.location.hash.substr(1));
    }, 0);
};

/**
 * The name of this command used in messages to the user.
 *
 * Perhaps this will also be used by the user to invoke this command, if we
 * build a shell command.
 */
hterm.NaSSH.prototype.commandName = 'nassh';

/**
 * Splash screen message.
 *
 * Inside joke.
 */
hterm.NaSSH.prototype.welcomeMessage =
    ["",
     "               \\/",
     "               /\\",
     "              /  \\                  ,^^^,",
     "             /    \\                ( o/o )",
     "            /      \\               _\\ = /_",
     "           /        \\             |  ...  |",
     "          /          \\            |_|   |_|",
     "         /      |\\    \\            e|___|e",
     "        /       | \\    \\            | | |",
     "       /        |  \\    \\           | | |",
     "     ./..ww.....!   \\....\\.w       c__|__D",
     "",
     "    D O N ' T  P A C K  Y O U R  T E P E E !",
     "",
     "          hterm is almost ready!",
     ""];

/**
 * Start the nassh command.
 *
 * This is invoked by the terminal as a result of terminal.runCommandClass().
 */
hterm.NaSSH.prototype.run = function() {
  this.io = this.argv_.io.push();

  for (var i = 0; i < this.welcomeMessage.length; i++) {
    this.io.println(this.welcomeMessage[i]);
  }

  this.io.print(hterm.msg('PLUGIN_LOADING'));

  this.plugin_ = window.document.createElement('embed');
  this.plugin_.style.width = '0';
  this.plugin_.style.height = '0';
  this.plugin_.setAttribute('src', '../plugin/ssh_client.nmf');
  this.plugin_.setAttribute('type', 'application/x-nacl');
  this.plugin_.addEventListener('load', this.onPluginLoaded_.bind(this));
  this.plugin_.addEventListener('message', this.onPluginMessage_.bind(this));
  document.body.appendChild(this.plugin_);
};

/**
 * Send a message to the nassh plugin.
 *
 * @param {string} name The name of the message to send.
 * @param {Array} arguments The message arguments.
 */
hterm.NaSSH.prototype.sendToPlugin_ = function(name, arguments) {
  var str = JSON.stringify({name: name, arguments: arguments});

  if (this.verbose_ && name != 'onRead')
    console.log('>>>   to: ' + name + ': ' + JSON.stringify(arguments));

  this.plugin_.postMessage(str);
};

/**
 * Send a string to the remote host.
 *
 * @param {string} string The string to send.
 */
hterm.NaSSH.prototype.sendString_ = function(string) {
  this.sendToPlugin_('onRead', [0, btoa(string)]);
};

/**
 * Report something very bad.
 *
 * This indicates to the user that something fatal happend when the only
 * alternative is to appear comatose.
 */
hterm.NaSSH.prototype.reportUnexpectedError_ = function(err) {
  var msg;
  if (this.messages_) {
    msg = this.msg('UNEXPECTED_ERROR');
  } else {
    msg = 'An unexpected error occurred, please check the JavaScript console ' +
      'for more details.';
  }

  if (err)
    console.log(err);

  this.terminal_.interpret(msg);
};

/**
 * Initiate a connection to a remote host given a destination string.
 *
 * @param {string} destination A string of the form username@host[:port].
 */
hterm.NaSSH.prototype.connectToDestination = function(destination) {
  var ary = destination.match(/^([^@]+)@([^:]+)(?::(\d+))?$/);
  if (!ary)
    return false;

  this.connectTo(ary[1], ary[2], ary[3]);
  return true;
};

/**
 * Initiate a connection to a remote host.
 *
 * @param {string} username The username to provide.
 * @param {string} hostname The hostname or IP address to connect to.
 * @param {string|integer} opt_port The optional port number to connect to.
 *     Defaults to 22 if not provided.
 */
hterm.NaSSH.prototype.connectTo = function(username, hostname, opt_port) {
  var port = opt_port ? Number(opt_port) : 22;

  document.location.hash = username + '@' + hostname + ':' + port;

  this.io.println(hterm.msg('WELCOME_TIP'));
  this.io.println(hterm.msg('CONNECTING', [username, hostname, port]));
  this.io.onVTKeystroke = this.sendString_.bind(this);
  this.io.sendString = this.sendString_.bind(this);

  this.sendToPlugin_('startSession', [ {
        username: username,
        host: hostname,
        port: port,
        terminalWidth: this.io.terminal_.screenSize.width,
        terminalHeight: this.io.terminal_.screenSize.height
    }]);
};

/**
 * Exit the nassh command.
 */
hterm.NaSSH.prototype.exit = function(code) {
  this.io.pop();

  if (this.argv_.onExit)
    this.argv_.onExit(code);
};

/**
 * Display a prompt to the user asking for a target destination.
 *
 * This calls connectToDestination once the user provides the destination
 * string.
 *
 * @param {string} opt_default The default destination string to show in the
 *     prompt dialog.
 */
hterm.NaSSH.prototype.promptForDestination_ = function(opt_default) {
  var self = this;

  function onOk(result) {
    if (!self.connectToDestination(result)) {
      self.io.alert(hterm.msg('BAD_DESTINATION', [result]),
                    self.promptForDestination_.bind(self, result));
    }
  }

  function onCancel() {
    self.exit(1);
  }

  this.io.prompt(hterm.msg('CONNECT_MESSAGE'),
                 opt_default || hterm.msg('DESTINATION_PATTERN'),
                 onOk, onCancel);
};

/**
 * Called once the NaCl plugin loads.
 */
hterm.NaSSH.prototype.onPluginLoaded_ = function() {
  this.io.println(hterm.msg('PLUGIN_LOADING_COMPLETE'));

  if (this.argv_.argString) {
    if (!this.connectToDestination(this.argv_.argString)) {
      this.io.println(hterm.msg('BAD_DESTINATION', [this.argv_.argString]));
      this.exit(1);
    }
  } else {
    this.promptForDestination_();
  }
};

/**
 * Called when the plugin sends us a message.
 *
 * This parses the message and dispatches an appropriate onPlugin_[*] method.
 */
hterm.NaSSH.prototype.onPluginMessage_ = function(msg) {
  var obj = JSON.parse(msg.data);

  if (this.verbose_ && obj.name != 'write')
    console.log('<<< from: ' + obj.name + ': ' + JSON.stringify(obj.arguments));

  var name = obj.name;

  if (name in this.onPlugin_) {
    this.onPlugin_[name].apply(this, obj.arguments);
  } else {
    console.log('Unknown plugin message: ' + name);
  }
};

/**
 * Plugin message handlers.
 */
hterm.NaSSH.prototype.onPlugin_ = {};

/**
 * Log a message from the plugin.
 */
hterm.NaSSH.prototype.onPlugin_.printLog = function(str) {
  console.log('plugin log: ' + str);
};

/**
 * Plugin has exited.
 */
hterm.NaSSH.prototype.onPlugin_.exit = function(code) {
  console.log('plugin exit: ' + code);
  this.exit(code);
};

/**
 * Plugin wants to open a file.
 *
 * The plugin leans on JS to provide a persistent filesystem, which we do via
 * the HTML5 Filesystem API.
 *
 * In the future, the plugin may handle its own files.
 */
hterm.NaSSH.prototype.onPlugin_.openFile = function(fd, path, mode) {
  var self = this;
  function onOpen(success) {
    self.sendToPlugin_('onOpenFile', [fd, success]);
  }

  var streamClass;
  if (path == '/dev/random') {
    streamClass = hterm.NaSSH.Stream.Random;
  } else {
    streamClass = hterm.NaSSH.Stream.File;
  }

  var stream = hterm.NaSSH.Stream.openStream(streamClass, fd, path, onOpen);

  stream.onClose = function(reason) {
    // TODO(rginda): The plugin doesn't seem to like us to confirm closes
    // of /dev/random.
    if (this.path != '/dev/random')
      self.sendToPlugin_('onClose', [fd, reason]);
  };
};

/**
 * The plugin wants to open a socket.
 *
 * TODO(rginda): I don't know how much of this is going to change in the near
 * future, so I'm not going to document it yet.
 */
hterm.NaSSH.prototype.onPlugin_.openSocket = function(fd, host, port) {
  var self = this;

  function onOpen(status) {
    self.sendToPlugin_('onOpenSocket', [fd, status]);
  };

  function onURL(url) {
    var stream = hterm.NaSSH.Stream.openStream(
        hterm.NaSSH.Stream.Socket, fd, url, onOpen);

    stream.onDataAvailable = function(data) {
      self.sendToPlugin_('onRead', [fd, data]);
    };

    stream.onClose = function(reason) {
      self.sendToPlugin_('onClose', [fd, reason]);
    };
  }

  chrome.webSocketProxyPrivate.getURLForTCP(host, port, {}, onURL);
};

/**
 * Plugin wants to write some data to a file descriptor.
 *
 * This is used to write to sockets as well as HTML5 Filesystem files.
 */
hterm.NaSSH.prototype.onPlugin_.write = function(fd, data) {
  if (fd == 1 || fd == 2) {
    var string = atob(data);
    this.io.print(string);
    return;
  }

  var stream = hterm.NaSSH.Stream.getStreamByFd(fd);
  if (!stream) {
    console.warn('Attempt to write to unknown fd: ' + fd);
    return;
  }

  stream.asyncWrite(data);
};

/**
 * Plugin wants to read from a fd.
 */
hterm.NaSSH.prototype.onPlugin_.read = function(fd, size) {
  var self = this;
  var stream = hterm.NaSSH.Stream.getStreamByFd(fd);

  if (!stream) {
    console.warn('Attempt to read from unknown fd: ' + fd);
    return;
  }

  stream.asyncRead(size, function(b64bytes) {
      self.sendToPlugin_('onRead', [fd, b64bytes]);
      if (stream instanceof hterm.NaSSH.Stream.File) {
        stream.close('EOF');
      }
    });
};

/**
 * Plugin wants to close a file descriptor.
 */
hterm.NaSSH.prototype.onPlugin_.close = function(fd) {
  var self = this;
  var stream = hterm.NaSSH.Stream.getStreamByFd(fd);
  if (!stream) {
    console.warn('Attempt to close unknown fd: ' + fd);
    return;
  }

  stream.close();
};
