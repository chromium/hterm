// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * First draft of the interface between the terminal and a third party dialog.
 *
 * This is rough.  It's just the terminal->dialog layer.  To complete things
 * we'll also need a command->terminal layer.  That will have to facilitate
 * command->terminal->dialog or direct command->dialog communication.
 *
 * I imagine this class will change significantly when that happens.
 */

/**
 * Construct a new frame for the given terminal.
 *
 * @param {!hterm.Terminal} terminal The parent terminal object.
 * @param {string} url The url to load in the frame.
 * @param {!Object=} options Optional options for the frame.  Not implemented.
 * @constructor
 */
hterm.Frame = function(terminal, url, options = {}) {
  this.terminal_ = terminal;
  this.div_ = terminal.div_;
  this.url = url;
  this.options = options;
  this.iframe_ = null;
  this.container_ = null;
  this.messageChannel_ = null;
};

/**
 * Handle messages from the iframe.
 *
 * @param {!MessageEvent} e The message to process.
 */
hterm.Frame.prototype.onMessage_ = function(e) {
  switch (e.data.name) {
    case 'ipc-init-ok':
      // We get this response after we send them ipc-init and they finish.
      this.sendTerminalInfo_();
      return;
    case 'terminal-info-ok':
      // We get this response after we send them terminal-info and they finish.
      // Show the finished frame, and then rebind our message handler to the
      // callback below.
      this.container_.style.display = 'flex';
      this.postMessage('visible');
      this.messageChannel_.port1.onmessage = this.onMessage.bind(this);
      this.onLoad();
      return;
    default:
      console.log('Unknown message from frame:', e.data);
  }
};

/**
 * Clients could override this, I guess.
 *
 * It doesn't support multiple listeners, but I'm not sure that would make sense
 * here.  It's probably better to speak directly to our parents.
 */
hterm.Frame.prototype.onMessage = function() {};

/**
 * Handle iframe onLoad event.
 */
hterm.Frame.prototype.onLoad_ = function() {
  this.messageChannel_ = new MessageChannel();
  this.messageChannel_.port1.onmessage = this.onMessage_.bind(this);
  this.messageChannel_.port1.start();
  this.iframe_.contentWindow.postMessage(
      {name: 'ipc-init', argv: [{messagePort: this.messageChannel_.port2}]},
      this.url, [this.messageChannel_.port2]);
};

/**
 * Clients may override this.
 */
hterm.Frame.prototype.onLoad = function() {};

/**
 * Sends the terminal-info message to the iframe.
 */
hterm.Frame.prototype.sendTerminalInfo_ = function() {
  lib.i18n.getAcceptLanguages(function(languages) {
      this.postMessage('terminal-info', [{
         acceptLanguages: languages,
         foregroundColor: this.terminal_.getForegroundColor(),
         backgroundColor: this.terminal_.getBackgroundColor(),
         cursorColor: this.terminal_.getCursorColor(),
         fontSize: this.terminal_.getFontSize(),
         fontFamily: this.terminal_.getFontFamily(),
         baseURL: lib.f.getURL('/'),
          }]
        );
    }.bind(this));
};

/**
 * User clicked the close button on the frame decoration.
 */
hterm.Frame.prototype.onCloseClicked_ = function() {
  this.close();
};

/**
 * Close this frame.
 */
hterm.Frame.prototype.close = function() {
  if (!this.container_ || !this.container_.parentNode) {
    return;
  }

  this.container_.parentNode.removeChild(this.container_);
  this.onClose();
};


/**
 * Clients may override this.
 */
hterm.Frame.prototype.onClose = function() {};

/**
 * Send a message to the iframe.
 *
 * @param {string} name The message name.
 * @param {!Array=} argv The message arguments.
 */
hterm.Frame.prototype.postMessage = function(name, argv) {
  if (!this.messageChannel_) {
    throw new Error('Message channel is not set up.');
  }

  this.messageChannel_.port1.postMessage({name: name, argv: argv});
};

/**
 * Show the UI for this frame.
 *
 * The iframe src is not loaded until this method is called.
 */
hterm.Frame.prototype.show = function() {
  var self = this;

  function opt(name, defaultValue) {
    if (name in self.options) {
      return self.options[name];
    }

    return defaultValue;
  }

  if (this.container_ && this.container_.parentNode) {
    console.error('Frame already visible');
    return;
  }

  var document = this.terminal_.document_;

  var container = this.container_ = document.createElement('div');
  container.style.cssText = (
      'position: absolute;' +
      'display: none;' +
      'flex-direction: column;' +
      'top: 10%;' +
      'left: 4%;' +
      'width: 90%;' +
      'height: 80%;' +
      'min-height: 20%;' +
      'max-height: 80%;' +
      'box-shadow: 0 0 2px ' + this.terminal_.getForegroundColor() + ';' +
      'border: 2px ' + this.terminal_.getForegroundColor() + ' solid;');

  var iframe = this.iframe_ = document.createElement('iframe');
  iframe.onload = this.onLoad_.bind(this);
  iframe.style.cssText = (
      'display: flex;' +
      'flex: 1;' +
      'width: 100%');
  iframe.setAttribute('src', this.url);
  iframe.setAttribute('seamless', true);
  container.appendChild(iframe);

  this.div_.appendChild(container);
};
