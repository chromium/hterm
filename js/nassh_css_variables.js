// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * Constructor for the CSS variables hack.
 *
 * This allows us to use CSS variables even if they're not supported natively.
 * It's a hack because this code is somewhat brittle, but it gets the job done
 * for nassh.
 *
 * Once the Chrome stable channel supports CSS variables this class can be
 * retired.  See <https://bugs.webkit.org/show_bug.cgi?id=85580>.
 *
 * We use it so that the connect dialog can style itself based on the user's
 * color scheme.
 */
nassh.CSSVariables = function(styleSheet) {
  this.styleSheet_ = styleSheet;
  this.variables_ = {};
  this.dynamicRules_ = [];

  this.loadSource_();
};

/**
 * Regexp to match variable references.
 */
nassh.CSSVariables.reFindVar = /var\s*\(\s*([^\)]+)\s*\)/;


/**
 * Regexp to match variable references.
 */
nassh.CSSVariables.reReplaceVar = /var\s*\(\s*([^\)]+)\s*\)/g;

/**
 * Parse the CSS source.
 *
 * This is pretty brittle.  It scans the CSS source for selectors and rules.
 * Each rule is split into property-name and value.  Any values with variable
 * references are stored with their corresponding css rule (the real rule from
 * the StyleSheet object), property-name, and unresolved value.
 *
 * It naively strips comments, but can be easily confused by strings.
 */
nassh.CSSVariables.prototype.parse_ = function(source) {
  // Look for the end of a rule block, allowing for nested blocks.
  // Start must point after the open brace, and on-or-before before the first
  // property name.
  function parseBlock(start) {
    var openParen = 1;
    var count = 0;

    while (openParen && start + count < source.length) {
      var ch = source.substr(start + count, 1);
      if (ch == '{') {
        openParen++;
      } else if (ch == '}') {
        openParen--;
      }

      count++;
    }

    return source.substr(pos, count - 1);
  };

  // Strip all the comments so they don't confuse us.
  source = source.replace(/\/\*.*?\*\//g, '');

  // Current position in the CSS source.
  var pos = 0;

  // Total number of rules we've encountered so far.  We use this to index
  // into this.styleSheet_.rules so we can find the real rule object.
  var ruleNumber = 0;

  while (pos < source.length) {
    var nextBrace = source.indexOf('{', pos);
    if (nextBrace == -1)
      break;

    // Before the nextBrace is the selector text, but we don't need it.
    pos = nextBrace + 1;

    var ruleText = parseBlock(pos);
    ruleText.split(';').forEach(function(pair) {
        var colon = pair.indexOf(':');
        if (colon == -1)
          return;

        var value = pair.substr(colon + 1).trim();
        if (nassh.CSSVariables.reFindVar.test(value)) {
          // This value mentions a variable, so we stash [rule, prop, value]
          // for later use in this.sync().
          var rule = this.styleSheet_.rules[ruleNumber];
          var prop = pair.substr(0, colon).trim();
          this.dynamicRules_.push([rule, prop, value]);
        }

      }.bind(this));

    pos += ruleText.length + 1;
    ruleNumber++;
  }

  this.sync();
};

/**
 * Load the CSS source with an XMLHttpRequest.
 *
 * Calls this.parse_() when the load completes.
 */
nassh.CSSVariables.prototype.loadSource_ = function() {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', this.styleSheet_.href);

  xhr.onloadend = function() {
    if (xhr.status != 200) {
      console.error('Error loading: ' + this.styleSheet_.href + ': ' +
                    xhr.status);
      return;
    }

    this.parse_(xhr.responseText);
  }.bind(this);

  xhr.send();
};

/**
 * Sync CSS variable references with their current values.
 *
 * This directly modifies the associated styleSheet object.
 */
nassh.CSSVariables.prototype.sync = function() {
  var replaceVar = function(match, varname) {
    if (varname in this.variables_)
      return this.variables_[varname];

    return 'unknown-variable:' + varname;
  }.bind(this);

  this.dynamicRules_.forEach(function(ary) {
      var rule = ary[0];
      var prop = ary[1];
      var value = ary[2];
      value = value.replace(nassh.CSSVariables.reReplaceVar, replaceVar);
      rule.style[prop] = value;
    });
};

/**
 * Reset all variables to empty (or to the optional map object) and calls
 * this.sync().
 */
nassh.CSSVariables.prototype.reset = function(opt_map) {
  this.variables_ = opt_map || {};
  this.sync();
};

/**
 * Set one or more variables and invoke this.sync().
 */
nassh.CSSVariables.prototype.set = function(var_args) {
  for (var i = 0; i < arguments.length; i += 2) {
    this.variables_[arguments[i]] = arguments[i + 1];
  }

  this.sync();
};
