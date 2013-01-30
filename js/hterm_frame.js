// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('lib.f');

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
 * @param terminal {hterm.Terminal} The parent terminal object.
 * @param url {String} The url to load in the frame.
 * @param opt_options {Object} Optional options for the frame.  Not implemented.
 */
hterm.Frame = function(terminal, url, opt_options) {
  this.terminal_ = terminal;
  this.div_ = terminal.div_;
  this.url = url;
  this.options = opt_options || {};
  this.iframe_ = null;
  this.container_ = null;
  this.messageChannel_ = null;
};

/**
 * Handle messages from the iframe.
 */
hterm.Frame.prototype.onMessage_ = function(e) {
  if (e.data.name != 'ipc-init-ok') {
    console.log('Unknown message from frame:', e.data);
    return;
  }

  this.sendTerminalInfo_();
  this.messageChannel_.port1.onmessage = this.onMessage.bind(this);
  this.onLoad();
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
      [this.messageChannel_.port2], this.url);
};

/**
 * Clients may override this.
 */
hterm.Frame.prototype.onLoad = function() {};

/**
 * Sends the terminal-info message to the iframe.
 */
hterm.Frame.prototype.sendTerminalInfo_ = function() {
  lib.f.getAcceptLanguages(function(languages) {
      this.postMessage('terminal-info', [{
         acceptLanguages: languages,
         foregroundColor: this.terminal_.getForegroundColor(),
         backgroundColor: this.terminal_.getBackgroundColor(),
         cursorColor: this.terminal_.getCursorColor(),
         fontSize: this.terminal_.getFontSize(),
         fontFamily: this.terminal_.getFontFamily(),
         baseURL: lib.f.getURL('/')
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
  if (!this.container_ || !this.container_.parentNode)
      return;

  this.container_.parentNode.removeChild(this.container_);
  this.onClose();
};


/**
 * Clients may override this.
 */
hterm.Frame.prototype.onClose = function() {};

/**
 * Send a message to the iframe.
 */
hterm.Frame.prototype.postMessage = function(name, argv) {
  if (!this.messageChannel_)
    throw new Error('Message channel is not set up.');

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
    if (name in self.options)
      return self.options[name];

    return defaultValue;
  }

  var self = this;

  if (this.container_ && this.container_.parentNode) {
    console.error('Frame already visible');
    return;
  }

  var headerHeight = '16px';

  var width = opt('width', 640);
  var height = opt('height', 480);
  var left = (this.div_.clientWidth - width) / 2;
  var top = (this.div_.clientHeight - height) / 2;

  var document = this.terminal_.document_;

  var container = this.container_ = document.createElement('div');
  container.style.cssText = (
      'position: absolute;' +
      'display: -webkit-flex;' +
      '-webkit-flex-direction: column;' +
      'top: 10%;' +
      'left: 4%;' +
      'width: 90%;' +
      'height: 80%;' +
      'box-shadow: 0 0 2px ' + this.terminal_.getForegroundColor() + ';' +
      'border: 2px ' + this.terminal_.getForegroundColor() + ' solid;');

  var header = document.createElement('div');
  header.style.cssText = (
      'display: -webkit-flex;' +
      '-webkit-justify-content: flex-end;' +
      'height: ' + headerHeight + ';' +
      'background-color: ' + this.terminal_.getForegroundColor() + ';' +
      'color: ' + this.terminal_.getBackgroundColor() + ';' +
      'font-size: 16px;' +
      'font-family: ' + this.terminal_.getFontFamily());
  container.appendChild(header);

  var button = document.createElement('div');
  button.setAttribute('role', 'button');
  button.style.cssText = (
      'margin-top: -3px;' +
      'margin-right: 3px;' +
      'cursor: pointer;');
  button.textContent = '\u2a2f';
  button.addEventListener('click', this.onCloseClicked_.bind(this));
  header.appendChild(button);

  var iframe = this.iframe_ = document.createElement('iframe');
  iframe.onload = this.onLoad_.bind(this);
  iframe.style.cssText = (
      'display: -webkit-flex;' +
      '-webkit-flex: 1;' +
      'width: 100%');
  iframe.setAttribute('src', this.url);
  iframe.setAttribute('seamless', true);
  container.appendChild(iframe);

  this.div_.appendChild(container);
};
