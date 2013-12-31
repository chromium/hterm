// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

lib.rtdep('lib.colors');

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
  this.foregroundIndex = null;
  this.backgroundIndex = null;

  // These properties cache the value in the color table, but foregroundIndex
  // and backgroundIndex contain the canonical values.
  this.foreground = this.DEFAULT_COLOR;
  this.background = this.DEFAULT_COLOR;

  this.defaultForeground = 'rgb(255, 255, 255)';
  this.defaultBackground = 'rgb(0, 0, 0)';

  this.bold = false;
  this.blink = false;
  this.underline = false;
  this.inverse = false;
  this.invisible = false;
  this.wcNode = false;

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
  this.backgroundIndex = null;
  this.foreground = this.DEFAULT_COLOR;
  this.background = this.DEFAULT_COLOR;
  this.bold = false;
  this.blink = false;
  this.underline = false;
  this.inverse = false;
  this.invisible = false;
  this.wcNode = false;
};

/**
 * Reset the color palette to the default state.
 */
hterm.TextAttributes.prototype.resetColorPalette = function() {
  this.colorPalette = lib.colors.colorPalette.concat();
  this.syncColors();
};

/**
 * Test if the current attributes describe unstyled text.
 *
 * @return {boolean} True if the current attributes describe unstyled text.
 */
hterm.TextAttributes.prototype.isDefault = function() {
  return (this.foregroundIndex == null &&
          this.backgroundIndex == null &&
          !this.bold &&
          !this.blink &&
          !this.underline &&
          !this.inverse &&
          !this.invisible &&
          !this.wcNode);
};

/**
 * Create a DOM container (a span or a text node) with a style to match the
 * current set of attributes.
 *
 * This method will create a plain text node if the text is unstyled, or
 * an HTML span if the text is styled.  Due to lack of monospace wide character
 * fonts on certain systems (e.g. Chrome OS), we need to put each wide character
 * in a span of CSS class '.wc-node' which has double column width.
 *
 * @param {string} opt_textContent Optional text content for the new container.
 * @return {HTMLNode} An HTML span or text nodes styled to match the current
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

  if (this.wcNode) {
    span.className = 'wc-node';
    span.wcNode = true;
  }

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

  // We don't want to put multiple wide characters in a wcNode. See the comment
  // in createContainer.
  return (!(this.wcNode || obj.wcNode) &&
          this.foreground == style.color &&
          this.background == style.backgroundColor &&
          (this.enableBold && this.bold) == !!style.fontWeight &&
          this.blink == !!style.fontStyle &&
          this.underline == !!style.textDecoration);
};

hterm.TextAttributes.prototype.setDefaults = function(foreground, background) {
  this.defaultForeground = foreground;
  this.defaultBackground = background;

  this.syncColors();
};

/**
 * Updates foreground and background properties based on current indices and
 * other state.
 *
 * @param {string} terminalForeground The terminal foreground color for use as
 *     inverse text background.
 * @param {string} terminalBackground The terminal background color for use as
 *     inverse text foreground.
 *
 */
hterm.TextAttributes.prototype.syncColors = function() {
  function getBrightIndex(i) {
    if (i < 8) {
      // If the color is from the lower half of the ANSI 16, add 8.
      return i + 8;
    }

    // If it's not from the 16 color palette, ignore bold requests.  This
    // matches the behavior of gnome-terminal.
    return i;
  }

  var foregroundIndex = this.foregroundIndex;
  var backgroundIndex = this.backgroundIndex;
  var defaultForeground = this.DEFAULT_COLOR;
  var defaultBackground = this.DEFAULT_COLOR;

  if (this.inverse) {
    foregroundIndex = this.backgroundIndex;
    backgroundIndex = this.foregroundIndex;
    // We can't inherit the container's color anymore.
    defaultForeground = this.defaultBackground;
    defaultBackground = this.defaultForeground;
  }

  if (this.bold) {
    if (foregroundIndex != null)
      foregroundIndex = getBrightIndex(foregroundIndex);
  }

  if (this.invisible)
    foregroundIndex = backgroundIndex;

  this.foreground = ((foregroundIndex == null) ? defaultForeground :
                     this.colorPalette[foregroundIndex]);
  this.background = ((backgroundIndex == null) ? defaultBackground :
                     this.colorPalette[backgroundIndex]);
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

/**
 * Static method to get the column width of a node's textContent.
 *
 * @param {HTMLElement} node The HTML element to get the width of textContent
 *     from.
 * @return {integer} The column width of the node's textContent.
 */
hterm.TextAttributes.nodeWidth = function(node) {
  if (node.wcNode) {
    return lib.wc.strWidth(node.textContent);
  } else {
    return node.textContent.length;
  }
}

/**
 * Static method to get the substr of a node's textContent.  The start index
 * and substr width are computed in column width.
 *
 * @param {HTMLElement} node The HTML element to get the substr of textContent
 *     from.
 * @param {integer} start The starting offset in column width.
 * @param {integer} width The width to capture in column width.
 * @return {integer} The extracted substr of the node's textContent.
 */
hterm.TextAttributes.nodeSubstr = function(node, start, width) {
  if (node.wcNode) {
    return lib.wc.substr(node.textContent, start, width);
  } else {
    return node.textContent.substr(start, width);
  }
}

/**
 * Static method to get the substring based of a node's textContent.  The
 * start index of end index are computed in column width.
 *
 * @param {HTMLElement} node The HTML element to get the substr of textContent
 *     from.
 * @param {integer} start The starting offset in column width.
 * @param {integer} end The ending offset in column width.
 * @return {integer} The extracted substring of the node's textContent.
 */
hterm.TextAttributes.nodeSubstring = function(node, start, end) {
  if (node.wcNode) {
    return lib.wc.substring(node.textContent, start, end);
  } else {
    return node.textContent.substring(start, end);
  }
}

/**
 * Static method to split a string into contiguous runs of single-width
 * characters and runs of double-width characters.
 *
 * @param {string} str The string to split.
 * @return {Array} An array of objects that contain substrings of str, where
 *     each substring is either a contiguous runs of single-width characters
 *     or a double-width character.  For object that contains a double-width
 *     character, its wcNode property is set to true.
 */
hterm.TextAttributes.splitWidecharString = function(str) {
  var rv = [];
  var base = 0, length = 0;

  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c < 128 || lib.wc.charWidth(c) == 1) {
      length++;
    } else {
      if (length) {
        rv.push({str: str.substr(base, length)});
      }
      rv.push({str: str.substr(i, 1), wcNode: true});
      base = i + 1;
      length = 0;
    }
  }

  if (length)
    rv.push({str: str.substr(base, length)});

  return rv;
}
