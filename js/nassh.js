// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// CSP means that we can't kick off the initialization from the html file,
// so we do it like this instead.
window.onload = function() {
    hterm.init(hterm.NaSSH.init);
};

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
  this.environment_ = argv.environment || {};
  this.io = null;
  this.verbose_ = false;
  this.relay_ = null;

  this.alertDialog = new AlertDialog(window.document.body);
  this.promptDialog = new PromptDialog(window.document.body);
};

/**
 * Static initialier called from nassh.html.
 *
 * This constructs a new Terminal instance and instructs it to run the NaSSH
 * command.
 */
hterm.NaSSH.init = function() {
  var profileName = hterm.parseQuery(document.location.search)['profile'];
  var terminal = new hterm.Terminal(profileName);
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
 * Start the nassh command.
 *
 * This is invoked by the terminal as a result of terminal.runCommandClass().
 */
hterm.NaSSH.prototype.run = function() {
  this.io = this.argv_.io.push();
  var self = this;

  this.initFileSystem_(function() {
      if (window.sessionStorage.getItem('nassh.promptOnReload') ||
          !self.argv_.argString) {
        // If promptOnReload isn't set and we haven't gotten the destination
        // as an argument then we need to ask the user for the destination.
        //
        // The promptOnReload session item allows us to remember that we've
        // displayed the dialog, so we can re-display it if the user reloads
        // the page.  (Items in sessionStorage are scoped to the tab, kept
        // between page reloads, and discarded when the tab goes away.)
        window.sessionStorage.setItem('nassh.promptOnReload', 'yes');

        // Timeout is a hack to give the dom a chance to draw the terminal.
        // Without the timeout, the destination prompt sometimes appears off
        // center.
        setTimeout(function() {
            self.promptForDestination_(document.location.hash.substr(1));
          }, 250);
      } else {
        if (!self.connectToDestination(self.argv_.argString)) {
          self.io.println(hterm.msg('BAD_DESTINATION', [self.argv_.argString]));
          self.exit(1);
        }
      }
    });
};

hterm.NaSSH.prototype.initFileSystem_ = function(onComplete) {
  var self = this;

  function onFileSystem(fileSystem) {
    self.fileSystem_ = fileSystem;
    onComplete();
  }

  var requestFS = window.requestFileSystem || window.webkitRequestFileSystem;
  requestFS(window.PERSISTENT,
            16 * 1024 * 1024,
            onFileSystem,
            hterm.flog('Error initializing filesystem', onComplete));
};

hterm.NaSSH.prototype.initPlugin_ = function(onComplete) {
  var self = this;
  function onPluginLoaded() {
    self.io.println(hterm.msg('PLUGIN_LOADING_COMPLETE'));
    onComplete();
  };

  this.io.print(hterm.msg('PLUGIN_LOADING'));

  this.plugin_ = window.document.createElement('embed');
  this.plugin_.style.cssText =
      ('position: absolute;' +
       'top: -99px' +
       'width: 0;' +
       'height: 0;');
  this.plugin_.setAttribute('src', '../plugin/ssh_client.nmf');
  this.plugin_.setAttribute('type', 'application/x-nacl');
  this.plugin_.addEventListener('load', onPluginLoaded);
  this.plugin_.addEventListener('message', this.onPluginMessage_.bind(this));

  document.body.insertBefore(this.plugin_, document.body.firstChild);
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
 * Notify plugin about new terminal size.
 *
 * @param {string|integer} terminal width.
 * @param {string|integer} terminal height.
 */
hterm.NaSSH.prototype.onTerminalResize_ = function(width, height) {
  this.sendToPlugin_('onResize', [Number(width), Number(height)]);
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
  if (destination == 'crosh') {
    document.location = "crosh.html"
    return true;
  }

  var ary = destination.match(/^([^@]+)@([^:@]+)(?::(\d+))?(?:@(.+))?$/);
  if (!ary)
    return false;

  if (ary[4]) {
    this.relay_ = new hterm.NaSSH.GoogleRelay(this.io, ary[4]);
    this.io.println(hterm.msg('INITIALIZING_RELAY', [ary[4]]));
    if (!this.relay_.init(ary[1], ary[2], (ary[3] || 22))) {
      // A false return value means we have to redirect to complete
      // initialization.  Bail out of the connect for now.  We'll resume it
      // when the relay is done with its redirect.
      return true;
    }
  }

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
  var proxySuffix = ''

  if (this.relay_) {
    proxySuffix = '@' + this.relay_.proxy;
    this.io.println(hterm.msg('FOUND_RELAY', this.relay_.relayServer));
  }

  document.location.hash = username + '@' + hostname + ':' + port + proxySuffix;

  this.io.println(hterm.msg('CONNECTING', [username + '@' + hostname, port]));
  this.io.onVTKeystroke = this.sendString_.bind(this);
  this.io.sendString = this.sendString_.bind(this);
  this.io.onTerminalResize = this.onTerminalResize_.bind(this);

  var argv = {};
  argv.username = username;
  argv.host = hostname;
  argv.port = port;
  argv.terminalWidth = this.io.terminal_.screenSize.width;
  argv.terminalHeight = this.io.terminal_.screenSize.height;
  argv.useJsSocket = !!this.relay_;
  argv.arguments = ['-C'];  // enable compression

  var self = this;
  this.initPlugin_(function() {
      if (!self.argv_.argString)
        self.io.println(hterm.msg('WELCOME_TIP'));

      window.onbeforeunload = self.onBeforeUnload_.bind(self);
      self.sendToPlugin_('setEnvironment', [self.environment_]);
      self.sendToPlugin_('startSession', [argv]);
    });

  document.querySelector('#terminal').focus();
};

/**
 * Exit the nassh command.
 */
hterm.NaSSH.prototype.exit = function(code) {
  this.io.pop();
  window.onbeforeunload = null;

  if (this.argv_.onExit)
    this.argv_.onExit(code);
};

/**
 * Remove all known hosts.
 */
hterm.NaSSH.prototype.removeAllKnownHosts = function() {
  this.fileSystem_.root.getFile(
      '/.ssh/known_hosts', {create: false},
      function(fileEntry) { fileEntry.remove(function() {}) });
};

/**
 * Remove a known host by index.
 *
 * @param {integer} index One-based index of the known host entry to remove.
 */
hterm.NaSSH.prototype.removeKnownHostByIndex = function(index) {
  var onError = hterm.flog('Error accessing /.ssh/known_hosts');
  var self = this;

  hterm.readFile(
      self.fileSystem_.root, '/.ssh/known_hosts',
      function(contents) {
        var ary = contents.split('\n');
        ary.splice(index - 1, 1);
        hterm.overwriteFile(self.fileSystem_.root, '/.ssh/known_hosts',
                            ary.join('\n'),
                            hterm.flog('done'),
                            onError);
      }, onError);
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
      self.alertDialog.show(hterm.msg('BAD_DESTINATION', [result]),
                            self.promptForDestination_.bind(self, result));
    }
  }

  function onCancel() {
    self.exit(1);
  }

  this.promptDialog.show(hterm.msg('CONNECT_MESSAGE'),
                         opt_default || hterm.msg('DESTINATION_PATTERN'),
                         onOk, onCancel);
};

hterm.NaSSH.prototype.onBeforeUnload_ = function(e) {
  var msg = hterm.msg('BEFORE_UNLOAD');
  e.returnValue = msg;
  return msg;
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

  if (path == '/dev/random') {
    var streamClass = hterm.NaSSH.Stream.Random;
    var stream = hterm.NaSSH.Stream.openStream(streamClass, fd, path, onOpen);
    stream.onClose = function(reason) {
      self.sendToPlugin_('onClose', [fd, reason]);
    };
  } else {
    self.sendToPlugin_('onOpenFile', [fd, false]);
  }
};

hterm.NaSSH.prototype.onPlugin_.openSocket = function(fd, host, port) {
  if (!this.relay_) {
    this.sendToPlugin_('onOpenSocket', [fd, false]);
    return;
  }

  var self = this;
  var stream = this.relay_.openSocket(
      fd, host, port,
      function onOpen(success) {
        self.sendToPlugin_('onOpenSocket', [fd, success]);
      });

  stream.onDataAvailable = function(data) {
    self.sendToPlugin_('onRead', [fd, data]);
  };

  stream.onClose = function(reason) {
    console.log('close: ' + fd);
    self.sendToPlugin_('onClose', [fd, reason]);
  };
};

/**
 * Plugin wants to write some data to a file descriptor.
 *
 * This is used to write to HTML5 Filesystem files.
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
    if (fd)
      console.warn('Attempt to read from unknown fd: ' + fd);
    return;
  }

  stream.asyncRead(size, function(b64bytes) {
      self.sendToPlugin_('onRead', [fd, b64bytes]);
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
