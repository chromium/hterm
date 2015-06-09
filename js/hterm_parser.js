// Copyright (c) 2015 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('hterm.Keyboard.KeyActions');

/**
 * @constructor
 * Parses the key definition syntax used for user keyboard customizations.
 */
hterm.Parser = function() {
  /**
   * @type {string} The source string.
   */
  this.source = '';

  /**
   * @type {number} The current position.
   */
  this.pos = 0;

  /**
   * @type {string?} The character at the current position.
   */
  this.ch = null;
};

hterm.Parser.prototype.error = function(message) {
  return new Error('Parse error at ' + this.pos + ': ' + message);
};

hterm.Parser.prototype.isComplete = function() {
  return this.pos == this.source.length;
};

hterm.Parser.prototype.reset = function(source, opt_pos) {
  this.source = source;
  this.pos = opt_pos || 0;
  this.ch = source.substr(0, 1);
};

/**
 * Parse a key sequence.
 *
 * Key sequences look like:
 *  "X", Just the letter X.
 *  88, Another way of specifying the letter X.  88 is the keyCode for the 'xX'
 *    keycap.
 *  Ctrl-"X", Ctrl followed by the letter X.
 *  Ctrl-"x", Ctrl followed by the letter X.
 *  Ctrl-"8", Ctrl followed by the number 8 key.
 *  Ctrl-88, Another way of specifying Ctrl X.
 *  Ctrl-Alt-"[", Ctrl Alt and the open-square-bracket.
 *  Ctrl-Alt-[TAB], Ctrl Alt and the Tab key specified as a mnemonic.
 *
 * Modifier names are Ctrl, Alt, and Meta.  Mnemonic names come from
 * hterm_keyboard_keymap.js.
 *
 * @return {Object} An object with shift, ctrl, alt, meta, charCode
 *   properties.
 */
hterm.Parser.prototype.parseKeySequence = function() {
  var rv = {
    shift: false,
    ctrl: false,
    alt: false,
    meta: false,
    keyCode: null
  };

  while (this.pos < this.source.length) {
    this.skipSpace();

    var token = this.parseToken();
    if (token.type == 'integer') {
      rv.keyCode = token.value;

    } else if (token.type == 'identifier') {
      if (token.value.match(/^(shift|ctrl|alt|meta)$/i)) {
        var mod = token.value.toLowerCase();
        if (rv[mod] && rv[mod] != '*')
          throw this.error('Duplicate modifier: ' + token.value);
        rv[mod] = true;

      } else if (token.value in hterm.Parser.identifiers.keys) {
        rv.keyCode = hterm.Parser.identifiers.keys[token.value];

      } else {
        throw this.error('Unknown key: ' + token.value);
      }

    } else if (token.type == 'symbol') {
      if (token.value == '*') {
        ['shift', 'ctrl', 'alt', 'meta'].forEach(function(p) {
          if (!rv[p])
            rv[p] =  '*';
        });
      } else {
        throw this.error('Unexpected symbol: ' + token.value);
      }
    } else {
      throw this.error('Expected integer or identifier');
    }

    this.skipSpace();

    if (this.ch != '-')
      break;

    if (rv.keyCode != null)
      throw this.error('Extra definition after target key');

    this.advance(1);
  }

  if (rv.keyCode == null)
    throw this.error('Missing target key');

  return rv;
};

hterm.Parser.prototype.parseKeyAction = function() {
  this.skipSpace();

  var token = this.parseToken();

  if (token.type == 'string')
    return token.value;

  if (token.type == 'identifier') {
    if (token.value in hterm.Parser.identifiers.actions)
      return hterm.Parser.identifiers.actions[token.value];

    throw this.error('Unknown key action: ' + token.value);
  }

  throw this.error('Expected string or identifier');

};

hterm.Parser.prototype.peekString = function() {
  return this.ch == '\'' || this.ch == '"';
};

hterm.Parser.prototype.peekIdentifier = function() {
  return this.ch.match(/[a-z_]/i);
};

hterm.Parser.prototype.peekInteger = function() {
  return this.ch.match(/[0-9]/);
};

hterm.Parser.prototype.parseToken = function() {
  if (this.ch == '*') {
    var rv = {type: 'symbol', value: this.ch};
    this.advance(1);
    return rv;
  }

  if (this.peekIdentifier())
    return {type: 'identifier', value: this.parseIdentifier()};

  if (this.peekString())
    return {type: 'string', value: this.parseString()};

  if (this.peekInteger())
    return {type: 'integer', value: this.parseInteger()};


  throw this.error('Unexpected token');
};

hterm.Parser.prototype.parseIdentifier = function() {
  if (!this.peekIdentifier())
    throw this.error('Expected identifier');

  return this.parsePattern(/[a-z0-9_]+/ig);
};

hterm.Parser.prototype.parseInteger = function() {
  var base = 10;

  if (this.ch == '0' && this.pos < this.source.length - 1 &&
      this.source.substr(this.pos + 1, 1) == 'x') {
    return parseInt(this.parsePattern(/0x[0-9a-f]+/gi));
  }

  return parseInt(this.parsePattern(/\d+/g));
};

/**
 * Parse a single or double quoted string.
 *
 * The current position should point at the initial quote character.  Single
 * quoted strings will be treated literally, double quoted will process escapes.
 *
 * TODO(rginda): Variable interpolation.
 *
 * @param {ParseState} parseState
 * @param {string} quote A single or double-quote character.
 * @return {string}
 */
hterm.Parser.prototype.parseString = function() {
  var result = '';

  var quote = this.ch;
  if (quote != '"' && quote != '\'')
    throw this.error('String expected');

  this.advance(1);

  var re = new RegExp('[\\\\' + quote + ']', 'g');

  while (this.pos < this.source.length) {
    re.lastIndex = this.pos;
    if (!re.exec(this.source))
      throw this.error('Unterminated string literal');

    result += this.source.substring(this.pos, re.lastIndex - 1);

    this.advance(re.lastIndex - this.pos - 1);

    if (quote == '"' && this.ch == '\\') {
      this.advance(1);
      result += this.parseEscape();
      continue;
    }

    if (quote == '\'' && this.ch == '\\') {
      result += this.ch;
      this.advance(1);
      continue;
    }

    if (this.ch == quote) {
      this.advance(1);
      return result;
    }
  }

  throw this.error('Unterminated string literal');
};


/**
 * Parse an escape code from the current position (which should point to
 * the first character AFTER the leading backslash.)
 *
 * @return {string}
 */
hterm.Parser.prototype.parseEscape = function() {
  var map = {
    '"': '"',
    '\'': '\'',
    '\\': '\\',
    'a': '\x07',
    'b': '\x08',
    'e': '\x1b',
    'f': '\x0c',
    'n': '\x0a',
    'r': '\x0d',
    't': '\x09',
    'v': '\x0b',
    'x': function() {
      var value = this.parsePattern(/[a-z0-9]{2}/ig);
      return String.fromCharCode(parseInt(value, 16));
    },
    'u': function() {
      var value = this.parsePattern(/[a-z0-9]{4}/ig);
      return String.fromCharCode(parseInt(value, 16));
    }
  };

  if (!(this.ch in map))
    throw this.error('Unknown escape: ' + this.ch);

  var value = map[this.ch];
  this.advance(1);

  if (typeof value == 'function')
    value = value.call(this);

  return value;
};

/**
 * Parse the given pattern starting from the current position.
 *
 * @param {RegExp} pattern A pattern representing the characters to span.  MUST
 *   include the "global" RegExp flag.
 * @return {string}
 */
hterm.Parser.prototype.parsePattern = function(pattern) {
  if (!pattern.global)
    throw this.error('Internal error: Span patterns must be global');

  pattern.lastIndex = this.pos;
  var ary = pattern.exec(this.source);

  if (!ary || pattern.lastIndex - ary[0].length != this.pos)
    throw this.error('Expected match for: ' + pattern);

  this.pos = pattern.lastIndex - 1;
  this.advance(1);

  return ary[0];
};


/**
 * Advance the current position.
 *
 * @param {number} count
 */
hterm.Parser.prototype.advance = function(count) {
  this.pos += count;
  this.ch = this.source.substr(this.pos, 1);
};

/**
 * @param {string=} opt_expect A list of valid non-whitespace characters to
 *   terminate on.
 * @return {void}
 */
hterm.Parser.prototype.skipSpace = function(opt_expect) {
  if (!/\s/.test(this.ch))
    return;

  var re = /\s+/gm;
  re.lastIndex = this.pos;

  var source = this.source;
  if (re.exec(source))
    this.pos = re.lastIndex;

  this.ch = this.source.substr(this.pos, 1);

  if (opt_expect) {
    if (this.ch.indexOf(opt_expect) == -1) {
      throw this.error('Expected one of ' + opt_expect + ', found: ' +
          this.ch);
    }
  }
};
