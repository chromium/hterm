// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

function BaseDialog(parentNode) {
  this.parentNode_ = parentNode;
  this.document_ = parentNode.ownerDocument;

  // The DOM element from the dialog which should receive focus when the
  // dialog is first displayed.
  this.initialFocusElement_ = null;

  // The DOM element from the parent which had focus before we were displayed,
  // so we can restore it when we're hidden.
  this.previousActiveElement_ = null;

  this.initDom_();
}

/**
 * Default text for Ok and Cancel buttons.
 *
 * Clients should override these with localized labels.
 */
BaseDialog.OK_LABEL = '[LOCALIZE ME] Ok';
BaseDialog.CANCEL_LABEL = '[LOCALIZE ME] Cancel';

/**
 * Number of miliseconds animation is expected to take, plus some margin for
 * error.
 */
BaseDialog.ANIMATE_STABLE_DURATION = 500;

BaseDialog.prototype.initDom_ = function() {
  var doc = this.document_;
  this.container_ = doc.createElement('div');
  this.container_.className = 'dialog-container';
  this.container_.addEventListener('keydown',
                                   this.onContainerKeyDown_.bind(this));

  this.frame_ = doc.createElement('div');
  this.frame_.className = 'dialog-frame';
  this.container_.appendChild(this.frame_);

  this.title_ = doc.createElement('div');
  this.title_.className = 'dialog-title';
  this.frame_.appendChild(this.title_);

  this.text_ = doc.createElement('div');
  this.text_.className = 'dialog-text';
  this.frame_.appendChild(this.text_);

  var buttons = doc.createElement('div');
  buttons.className = 'dialog-buttons';
  this.frame_.appendChild(buttons);

  this.okButton_ = doc.createElement('button');
  this.okButton_.className = 'dialog-ok';
  this.okButton_.textContent = BaseDialog.OK_LABEL;
  this.okButton_.addEventListener('click', this.onOkClick_.bind(this));
  buttons.appendChild(this.okButton_);

  this.cancelButton_ = doc.createElement('button');
  this.cancelButton_.className = 'dialog-cancel';
  this.cancelButton_.textContent = BaseDialog.CANCEL_LABEL;
  this.cancelButton_.addEventListener('click',
                                      this.onCancelClick_.bind(this));
  buttons.appendChild(this.cancelButton_);

  this.initialFocusElement_ = this.okButton_;
};

BaseDialog.prototype.onOk_ = null;
BaseDialog.prototype.onCancel_ = null;

BaseDialog.prototype.onContainerKeyDown_ = function(event) {
  // Handle Escape.
  if (event.keyCode == 27 && !this.cancelButton_.disabled) {
    this.onCancelClick_(event);
    event.preventDefault();
  }
};

BaseDialog.prototype.onOkClick_ = function(event) {
  this.hide();
  if (this.onOk_)
    this.onOk_();
};

BaseDialog.prototype.onCancelClick_ = function(event) {
  this.hide();
  if (this.onCancel_)
    this.onCancel_();
};

BaseDialog.prototype.setOkLabel = function(label) {
  this.okButton_.textContent = label;
};

BaseDialog.prototype.setCancelLabel = function(label) {
  this.cancelButton_.textContent = label;
};

BaseDialog.prototype.show = function(message, onOk, onCancel, onShow) {
  this.showWithTitle(null, message, onOk, onCancel, onShow);
};

BaseDialog.prototype.showWithTitle = function(title, message,
                                              onOk, onCancel, onShow) {
  this.previousActiveElement_ = this.document_.activeElement;
  this.parentNode_.appendChild(this.container_);

  this.onOk_ = onOk;
  this.onCancel_ = onCancel;

  if (title) {
    this.title_.textContent = title;
    this.title_.hidden = false;
  } else {
    this.title_.textContent = "";
    this.title_.hidden = true;
  }
  this.text_.textContent = message;

  var top = (this.document_.body.clientHeight -
             this.frame_.clientHeight) / 2;
  var left = (this.document_.body.clientWidth -
              this.frame_.clientWidth) / 2;

  // Disable transitions so that we can set the initial position of the
  // dialog right away.
  this.frame_.style.webkitTransitionProperty = '';
  this.frame_.style.top = (top - 50) + 'px';
  this.frame_.style.left = (left + 10) + 'px';

  var self = this;
  setTimeout(function () {
      // Note that we control the opacity of the *container*, but the top/left
      // of the *frame*.
      self.container_.style.opacity = '1';
      self.frame_.style.top = top + 'px';
      self.frame_.style.left = left + 'px';
      self.frame_.style.webkitTransitionProperty = 'left, top';
      self.initialFocusElement_.focus();
      setTimeout(function() {
          if (onShow)
            onShow();
        }, BaseDialog.ANIMATE_STABLE_DURATION);
    }, 0);
};

BaseDialog.prototype.hide = function(onHide) {
  // Note that we control the opacity of the *container*, but the top/left
  // of the *frame*.
  this.container_.style.opacity = '0';
  this.frame_.style.top = (parseInt(this.frame_.style.top) + 50) + 'px';
  this.frame_.style.left = (parseInt(this.frame_.style.left) - 10) + 'px';

  if (this.previousActiveElement_) {
    this.previousActiveElement_.focus();
  } else {
    this.document_.body.focus();
  }

  var self = this;
  setTimeout(function() {
      // Wait until the transition is done before removing the dialog.
      self.parentNode_.removeChild(self.container_);
      if (onHide)
        onHide();
    }, BaseDialog.ANIMATE_STABLE_DURATION);
};

/**
 * AlertDialog contains just a message and an ok button.
 */
function AlertDialog(parentNode) {
  BaseDialog.apply(this, [parentNode]);
  this.cancelButton_.style.display = 'none';
}

AlertDialog.prototype = {__proto__: BaseDialog.prototype};

AlertDialog.prototype.show = function(message, onOk, onShow) {
  return BaseDialog.prototype.show.apply(this, [message, onOk, onOk, onShow]);
};

/**
 * ConfirmDialog contains a message, an ok button, and a cancel button.
 */
function ConfirmDialog(parentNode) {
  BaseDialog.apply(this, [parentNode]);
}

ConfirmDialog.prototype = {__proto__: BaseDialog.prototype};

/**
 * PromptDialog contains a message, a text input, an ok button, and a
 * cancel button.
 */
function PromptDialog(parentNode) {
  BaseDialog.apply(this, [parentNode]);
  this.input_ = this.document_.createElement('input');
  this.input_.setAttribute('type', 'text');
  this.input_.addEventListener('focus', this.onInputFocus.bind(this));
  this.input_.addEventListener('keypress', this.onKeyDown_.bind(this));
  this.initialFocusElement_ = this.input_;
  this.frame_.insertBefore(this.input_, this.text_.nextSibling);
}

PromptDialog.prototype = {__proto__: BaseDialog.prototype};

PromptDialog.prototype.onInputFocus = function(event) {
  this.input_.select();
};

PromptDialog.prototype.onKeyDown_ = function(event) {
  if (event.keyCode == 13) {  // Enter
    this.onOkClick_(event);
    event.preventDefault();
  }
}

PromptDialog.prototype.show = function(message, defaultValue, onOk, onCancel,
                                       onShow) {
  this.input_.value = defaultValue || '';
  return BaseDialog.prototype.show.apply(this, [message, onOk, onCancel,
                                                onShow]);
};

PromptDialog.prototype.getValue = function() {
  return this.input_.value;
};

PromptDialog.prototype.onOkClick_ = function(event) {
  this.hide();
  if (this.onOk_)
    this.onOk_(this.getValue());
};
