// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Constructor for TextAttribute objects.
 *
 * These objects manage a set of text attributes such as foreground/
 * background color, bold, italic, blink and underline.
 *
 * TextAttribute instances can be used to construct a DOM container implementing
 * the current attributes, or to test an existing DOM container for
 * compatibility with the current attributes.
 *
 * @constructor
 * @param {HTMLDocument} document The parent document to use when creating
 *     new DOM containers.
 */
hterm.TextAttributes = function(document) {
  this.document_ = document;
  // This property contains the index that the foreground color came from.
  // This allows us to switch to the bright version of the color when the bold
  // attribute is set, which is what most other terminals do.
  this.foregroundIndex = null;

  this.foreground = this.DEFAULT_COLOR;
  this.background = this.DEFAULT_COLOR;
  this.bold = false;
  this.blink = false;
  this.underline = false;

  this.colorPalette = null;
  this.resetColorPalette();
};

/**
 * If false, we ignore the bold attribute.
 *
 * This is used for fonts that have a bold version that is a different size
 * than the normal weight version.
 */
hterm.TextAttributes.prototype.enableBold = true;

/**
 * A sentinel constant meaning "whatever the default color is in this context".
 */
hterm.TextAttributes.prototype.DEFAULT_COLOR = new String('');

/**
 * The document object which should own the DOM nodes created by this instance.
 *
 * @param {HTMLDocument} document The parent document.
 */
hterm.TextAttributes.prototype.setDocument = function(document) {
  this.document_ = document;
};

/**
 * Create a deep copy of this object.
 *
 * @return {hterm.TextAttributes} A deep copy of this object.
 */
hterm.TextAttributes.prototype.clone = function() {
  var rv = new hterm.TextAttributes(null);

  for (var key in this) {
    rv[key] = this[key];
  }

  rv.colorPalette = this.colorPalette.concat();
  return rv;
};

/**
 * Reset the current set of attributes.
 *
 * This does not affect the palette.  Use resetColorPalette() for that.
 */
hterm.TextAttributes.prototype.reset = function() {
  this.foregroundIndex = null;
  this.foreground = this.DEFAULT_COLOR;
  this.background = this.DEFAULT_COLOR;
  this.bold = false;
  this.blink = false;
  this.underline = false;
};

/**
 * Reset the color palette to the default state.
 */
hterm.TextAttributes.prototype.resetColorPalette = function() {
  this.colorPalette = hterm.colors.defaultColorPalette.concat();
};

/**
 * Test if the current attributes describe unstyled text.
 *
 * @return {boolean} True if the current attributes describe unstyled text.
 */
hterm.TextAttributes.prototype.isDefault = function() {
  return (this.foreground == this.DEFAULT_COLOR &&
          this.background == this.DEFAULT_COLOR &&
          !this.bold &&
          !this.blink &&
          !this.underline);
};

/**
 * Create a DOM container (a span or a text node) with a style to match the
 * current set of attributes.
 *
 * This method will create a plain text node if the text is unstyled, or
 * an HTML span if the text is styled.
 *
 * @param {string} opt_textContent Optional text content for the new container.
 * @return {HTMLNode} An HTML span or text node styled to match the current
 *     attributes.
 */
hterm.TextAttributes.prototype.createContainer = function(opt_textContent) {
  if (this.isDefault())
    return this.document_.createTextNode(opt_textContent);

  var span = this.document_.createElement('span');
  var style = span.style;

  if (this.foreground != this.DEFAULT_COLOR)
    style.color = this.foreground;

  if (this.background != this.DEFAULT_COLOR) {
    style.backgroundColor = this.background;
    // This bottom border ensures that the extra row of pixels at the bottom of
    // the character cell (used to hold underscores in some fonts) has the
    // correct background color.
    style.borderBottom = '1px ' + this.background + ' solid';
  }

  if (this.enableBold && this.bold)
    style.fontWeight = 'bold';

  if (this.blink)
    style.fontStyle = 'italic';

  if (this.underline)
    style.textDecoration = 'underline';

  if (opt_textContent)
    span.textContent = opt_textContent;

  return span;
};

/**
 * Tests if the provided object (string, span or text node) has the same
 * style as this TextAttributes instance.
 *
 * This indicates that text with these attributes could be inserted directly
 * into the target DOM node.
 *
 * For the purposes of this method, a string is considered a text node.
 *
 * @param {string|HTMLNode} obj The object to test.
 * @return {boolean} True if the provided container has the same style as
 *     this attributes instance.
 */
hterm.TextAttributes.prototype.matchesContainer = function(obj) {
  if (typeof obj == 'string' || obj.nodeType == 3)
    return this.isDefault();

  var style = obj.style;

  return (this.foreground == style.color &&
          this.background == style.backgroundColor &&
          (this.enableBold && this.bold) == !!style.fontWeight &&
          this.blink == !!style.fontStyle &&
          this.underline == !!style.textDecoration);
};

/**
 * Static method used to test if the provided objects (strings, spans or
 * text nodes) have the same style.
 *
 * For the purposes of this method, a string is considered a text node.
 *
 * @param {string|HTMLNode} obj1 An object to test.
 * @param {string|HTMLNode} obj2 Another object to test.
 * @return {boolean} True if the containers have the same style.
 */
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

/**
 * Static method to test if a given DOM container represents unstyled text.
 *
 * For the purposes of this method, a string is considered a text node.
 *
 * @param {string|HTMLNode} obj1 An object to test.
 * @return {boolean} True if the object is unstyled.
 */
hterm.TextAttributes.containerIsDefault = function(obj) {
  return typeof obj == 'string'  || obj.nodeType == 3;
};
