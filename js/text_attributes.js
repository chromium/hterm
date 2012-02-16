// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

hterm.TextAttributes = function(document) {
  this.document_ = document;
  // When the foreground color comes from the COLORS_16 array, this property
  // contains the index that the color came from.  This allows us to switch
  // to the bright version of the color when the bold attribute is set, which
  // is what most other terminals do.
  this.foregroundIndex16 = null;

  this.foreground = this.DEFAULT_COLOR;
  this.background = this.DEFAULT_COLOR;
  this.bold = false;
  this.blink = false;
  this.underline = false;
};

/**
 * Converts a var_args list of CSS '#RRGGBB' color values into the rgb(...)
 * form.
 *
 * We need to be able to read back CSS color values from a node and test
 * equality against the color tables.  CSS always returns in rgb(...),
 * but it's much more compact to specify colors using # notation.
 */
hterm.TextAttributes.defineColors = function(var_args) {
  var rv = Array.apply(null, arguments);

  for (var i = 0; i < rv.length; i++) {
    var ary = rv[i].match(/#([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})/i);
    if (ary) {
      rv[i] = 'rgb(' + parseInt(ary[1], 16) + ', ' +
          parseInt(ary[2], 16) + ', ' +
          parseInt(ary[3], 16) + ')';
    }
  }

  return rv;
};

hterm.TextAttributes.prototype.DEFAULT_COLOR = new String('');

hterm.TextAttributes.prototype.COLORS_16 = hterm.TextAttributes.defineColors(
    '#000000', '#CC0000', '#4E9A06', '#C4A000',
    '#3465A4', '#75507B', '#06989A', '#D3D7CF',
    '#555753', '#EF2929', '#8AE234', '#FCE94F',
    '#729FCF', '#AD7FA8', '#34E2E2', '#EEEEEC');

hterm.TextAttributes.prototype.COLORS_256 = hterm.TextAttributes.defineColors(
    '#000000', '#AA0000', '#00AA00', '#AA5500', '#0000AA', '#AA00AA', '#00AAAA',
    '#AAAAAA', '#555555', '#FF5555', '#55FF55', '#FFFF55', '#5555FF', '#FF55FF',
    '#55FFFF', '#FFFFFF', '#000000', '#00005F', '#000087', '#0000AF', '#0000D7',
    '#0000FF', '#005F00', '#005F5F', '#005F87', '#005FAF', '#005FD7', '#005FFF',
    '#008700', '#00875F', '#008787', '#0087AF', '#0087D7', '#0087FF', '#00AF00',
    '#00AF5F', '#00AF87', '#00AFAF', '#00AFD7', '#00AFFF', '#00D700', '#00D75F',
    '#00D787', '#00D7AF', '#00D7D7', '#00D7FF', '#00FF00', '#00FF5F', '#00FF87',
    '#00FFAF', '#00FFD7', '#00FFFF', '#5F0000', '#5F005F', '#5F0087', '#5F00AF',
    '#5F00D7', '#5F00FF', '#5F5F00', '#5F5F5F', '#5F5F87', '#5F5FAF', '#5F5FD7',
    '#5F5FFF', '#5F8700', '#5F875F', '#5F8787', '#5F87AF', '#5F87D7', '#5F87FF',
    '#5FAF00', '#5FAF5F', '#5FAF87', '#5FAFAF', '#5FAFD7', '#5FAFFF', '#5FD700',
    '#5FD75F', '#5FD787', '#5FD7AF', '#5FD7D7', '#5FD7FF', '#5FFF00', '#5FFF5F',
    '#5FFF87', '#5FFFAF', '#5FFFD7', '#5FFFFF', '#870000', '#87005F', '#870087',
    '#8700AF', '#8700D7', '#8700FF', '#875F00', '#875F5F', '#875F87', '#875FAF',
    '#875FD7', '#875FFF', '#878700', '#87875F', '#878787', '#8787AF', '#8787D7',
    '#8787FF', '#87AF00', '#87AF5F', '#87AF87', '#87AFAF', '#87AFD7', '#87AFFF',
    '#87D700', '#87D75F', '#87D787', '#87D7AF', '#87D7D7', '#87D7FF', '#87FF00',
    '#87FF5F', '#87FF87', '#87FFAF', '#87FFD7', '#87FFFF', '#AF0000', '#AF005F',
    '#AF0087', '#AF00AF', '#AF00D7', '#AF00FF', '#AF5F00', '#AF5F5F', '#AF5F87',
    '#AF5FAF', '#AF5FD7', '#AF5FFF', '#AF8700', '#AF875F', '#AF8787', '#AF87AF',
    '#AF87D7', '#AF87FF', '#AFAF00', '#AFAF5F', '#AFAF87', '#AFAFAF', '#AFAFD7',
    '#AFAFFF', '#AFD700', '#AFD75F', '#AFD787', '#AFD7AF', '#AFD7D7', '#AFD7FF',
    '#AFFF00', '#AFFF5F', '#AFFF87', '#AFFFAF', '#AFFFD7', '#AFFFFF', '#D70000',
    '#D7005F', '#D70087', '#D700AF', '#D700D7', '#D700FF', '#D75F00', '#D75F5F',
    '#D75F87', '#D75FAF', '#D75FD7', '#D75FFF', '#D78700', '#D7875F', '#D78787',
    '#D787AF', '#D787D7', '#D787FF', '#D7AF00', '#D7AF5F', '#D7AF87', '#D7AFAF',
    '#D7AFD7', '#D7AFFF', '#D7D700', '#D7D75F', '#D7D787', '#D7D7AF', '#D7D7D7',
    '#D7D7FF', '#D7FF00', '#D7FF5F', '#D7FF87', '#D7FFAF', '#D7FFD7', '#D7FFFF',
    '#FF0000', '#FF005F', '#FF0087', '#FF00AF', '#FF00D7', '#FF00FF', '#FF5F00',
    '#FF5F5F', '#FF5F87', '#FF5FAF', '#FF5FD7', '#FF5FFF', '#FF8700', '#FF875F',
    '#FF8787', '#FF87AF', '#FF87D7', '#FF87FF', '#FFAF00', '#FFAF5F', '#FFAF87',
    '#FFAFAF', '#FFAFD7', '#FFAFFF', '#FFD700', '#FFD75F', '#FFD787', '#FFD7AF',
    '#FFD7D7', '#FFD7FF', '#FFFF00', '#FFFF5F', '#FFFF87', '#FFFFAF', '#FFFFD7',
    '#FFFFFF', '#080808', '#121212', '#1C1C1C', '#262626', '#303030', '#3A3A3A',
    '#444444', '#4E4E4E', '#585858', '#626262', '#6C6C6C', '#767676', '#808080',
    '#8A8A8A', '#949494', '#9E9E9E', '#A8A8A8', '#B2B2B2', '#BCBCBC', '#C6C6C6',
    '#D0D0D0', '#DADADA', '#E4E4E4', '#EEEEEE');

hterm.TextAttributes.prototype.setDocument = function(document) {
  this.document_ = document;
};

hterm.TextAttributes.prototype.clone = function() {
  var rv = new hterm.TextAttributes(null);

  for (var key in this) {
    rv[key] = this[key];
  }

  return rv;
};

hterm.TextAttributes.prototype.reset = function() {
  this.foregroundIndex16 = null;
  this.foreground = this.DEFAULT_COLOR;
  this.background = this.DEFAULT_COLOR;
  this.bold = false;
  this.blink = false;
  this.underline = false;
};

hterm.TextAttributes.prototype.isDefault = function() {
  return (this.foreground == this.DEFAULT_COLOR &&
          this.background == this.DEFAULT_COLOR &&
          !this.bold &&
          !this.blink &&
          !this.underline);
};

hterm.TextAttributes.prototype.createContainer = function(str) {
  if (this.isDefault())
    return this.document_.createTextNode(str);

  var span = this.document_.createElement('span');
  var style = span.style;

  if (this.foreground != this.DEFAULT_COLOR)
    style.color = this.foreground;

  if (this.background != this.DEFAULT_COLOR)
    style.backgroundColor = this.background;

  if (this.bold)
    style.fontWeight = 'bold';

  if (this.blink)
    style.fontStyle = 'italic';

  if (this.underline)
    style.textDecoration = 'underline';

  if (str)
    span.textContent = str;

  return span;
};

hterm.TextAttributes.prototype.matchesContainer = function(obj) {
  if (typeof obj == 'string' || obj.nodeType == 3)
    return this.isDefault();

  var style = obj.style;

  return (this.foreground == style.color &&
          this.background == style.backgroundColor &&
          this.bold == !!style.fontWeight &&
          this.blink == !!style.fontStyle &&
          this.underline == !!style.textDecoration);
};

hterm.TextAttributes.containersMatch = function(obj1, obj2) {
  if (typeof obj1 == 'string')
    return hterm.TextAttributes.containerIsDefault(obj2);

  if (obj1.nodeType != obj2.nodeType)
    return false;

  if (obj1.nodeType == 3)
    return true;

  var style1 = obj1.style;
  var style2 = obj2.style;

  return (style1.color == style2.color &&
          style1.backgroundColor == style2.backgroundColor &&
          style1.fontWeight == style2.fontWeight &&
          style1.fontStyle == style2.fontStyle &&
          style1.textDecoration == style2.textDecoration);
};

hterm.TextAttributes.containerIsDefault = function(obj) {
  return typeof obj == 'string'  || obj.nodeType == 3;
};
