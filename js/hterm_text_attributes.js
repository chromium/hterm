// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * Constructor for TextAttribute objects.
 *
 * These objects manage a set of text attributes such as foreground/
 * background color, bold, faint, italic, blink, underline, and strikethrough.
 *
 * TextAttribute instances can be used to construct a DOM container implementing
 * the current attributes, or to test an existing DOM container for
 * compatibility with the current attributes.
 *
 * @constructor
 * @param {!Document=} document The parent document to use when creating
 *     new DOM containers.
 */
hterm.TextAttributes = function(document) {
  this.document_ = document;
  // These variables contain the source of the color as either:
  // SRC_DEFAULT  (use context default)
  // rgb(...)     (true color form)
  // number       (representing the index from color palette to use)
  /** @type {symbol|string|number} */
  this.foregroundSource = this.SRC_DEFAULT;
  /** @type {symbol|string|number} */
  this.backgroundSource = this.SRC_DEFAULT;
  /** @type {symbol|string|number} */
  this.underlineSource = this.SRC_DEFAULT;

  // These properties cache the value in the color table, but foregroundSource
  // and backgroundSource contain the canonical values.
  /** @type {symbol|string} */
  this.foreground = this.DEFAULT_COLOR;
  /** @type {symbol|string} */
  this.background = this.DEFAULT_COLOR;
  /** @type {symbol|string} */
  this.underlineColor = this.DEFAULT_COLOR;

  /** @const */
  this.defaultForeground = 'rgb(var(--hterm-foreground-color))';
  /** @const */
  this.defaultBackground = 'rgb(var(--hterm-background-color))';

  // Any attributes added here that do not default to falsey (e.g. undefined or
  // null) require a bit more care.  createContainer has to always attach the
  // attribute so matchesContainer can work correctly.
  this.bold = false;
  this.faint = false;
  this.italic = false;
  this.blink = false;
  this.underline = false;
  this.strikethrough = false;
  this.inverse = false;
  this.invisible = false;
  this.wcNode = false;
  this.asciiNode = true;
  /** @type {?string} */
  this.tileData = null;
  /** @type {?string} */
  this.uri = null;
  /** @type {?string} */
  this.uriId = null;

  /**
   * Colors set different to defaults in lib.colors.colorPalette.
   *
   * @type {!Array<string>}
   */
  this.colorPaletteOverrides = [];
};

/**
 * If false, we ignore the bold attribute.
 *
 * This is used for fonts that have a bold version that is a different size
 * than the normal weight version.
 */
hterm.TextAttributes.prototype.enableBold = true;

/**
 * If true, use bright colors (if available) for bold text.
 *
 * This setting is independent of the enableBold setting.
 */
hterm.TextAttributes.prototype.enableBoldAsBright = true;

/**
 * A sentinel constant meaning "whatever the default color is in this context".
 */
hterm.TextAttributes.prototype.DEFAULT_COLOR = Symbol('DEFAULT_COLOR');

/**
 * A constant string used to specify that source color is context default.
 */
hterm.TextAttributes.prototype.SRC_DEFAULT = Symbol('SRC_DEFAULT');

/**
 * The document object which should own the DOM nodes created by this instance.
 *
 * @param {!Document} document The parent document.
 */
hterm.TextAttributes.prototype.setDocument = function(document) {
  this.document_ = document;
};

/**
 * Create a deep copy of this object.
 *
 * @return {!hterm.TextAttributes} A deep copy of this object.
 */
hterm.TextAttributes.prototype.clone = function() {
  const rv = new hterm.TextAttributes();

  for (const key in this) {
    rv[key] = this[key];
  }

  rv.colorPaletteOverrides = this.colorPaletteOverrides.concat();
  return rv;
};

/**
 * Reset the current set of attributes.
 *
 * This does not affect the palette.  Use terminal.resetColorPalette() for
 * that.  It also doesn't affect the tile data, it's not meant to.
 */
hterm.TextAttributes.prototype.reset = function() {
  this.foregroundSource = this.SRC_DEFAULT;
  this.backgroundSource = this.SRC_DEFAULT;
  this.underlineSource = this.SRC_DEFAULT;
  this.foreground = this.DEFAULT_COLOR;
  this.background = this.DEFAULT_COLOR;
  this.underlineColor = this.DEFAULT_COLOR;
  this.bold = false;
  this.faint = false;
  this.italic = false;
  this.blink = false;
  this.underline = false;
  this.strikethrough = false;
  this.inverse = false;
  this.invisible = false;
  this.wcNode = false;
  this.asciiNode = true;
  this.uri = null;
  this.uriId = null;
};

/**
 * Test if the current attributes describe unstyled text.
 *
 * @return {boolean} True if the current attributes describe unstyled text.
 */
hterm.TextAttributes.prototype.isDefault = function() {
  return (this.foregroundSource == this.SRC_DEFAULT &&
          this.backgroundSource == this.SRC_DEFAULT &&
          !this.bold &&
          !this.faint &&
          !this.italic &&
          !this.blink &&
          !this.underline &&
          !this.strikethrough &&
          !this.inverse &&
          !this.invisible &&
          !this.wcNode &&
          this.asciiNode &&
          this.tileData == null &&
          this.uri == null);
};

/**
 * Create a DOM container (a span or a text node) with a style to match the
 * current set of attributes.
 *
 * This method will create a plain text node if the text is unstyled, or
 * an HTML span if the text is styled.  Due to lack of monospace wide character
 * fonts on certain systems (e.g. Chrome OS), we need to put each wide character
 * in a span of CSS class '.wc-node' which has double column width.
 * Each vt_tiledata tile is also represented by a span with a single
 * character, with CSS classes '.tile' and '.tile_<glyph number>'.
 *
 * @param {string=} textContent Optional text content for the new container.
 * @return {!Node} An HTML span or text nodes styled to match the current
 *     attributes.
 */
hterm.TextAttributes.prototype.createContainer = function(textContent = '') {
  if (this.isDefault()) {
    // Only attach attributes where we need an explicit default for the
    // matchContainer logic below.
    const node = this.document_.createTextNode(textContent);
    node.asciiNode = true;
    return node;
  }

  const span = this.document_.createElement('span');
  const style = span.style;
  const classes = [];

  if (this.foreground != this.DEFAULT_COLOR) {
    style.color = this.foreground.toString();
  }

  if (this.background != this.DEFAULT_COLOR) {
    style.backgroundColor = this.background.toString();
  }

  if (this.enableBold && this.bold) {
    style.fontWeight = 'bold';
  }

  if (this.faint) {
    span.faint = true;
  }

  if (this.italic) {
    style.fontStyle = 'italic';
  }

  if (this.blink) {
    classes.push('blink-node');
    span.blinkNode = true;
  }

  let textDecorationLine = '';
  span.underline = this.underline;
  if (this.underline) {
    textDecorationLine += ' underline';
    style.textDecorationStyle = this.underline;
  }
  if (this.underlineColor != this.DEFAULT_COLOR) {
    style.textDecorationColor = this.underlineColor;
  }
  if (this.strikethrough) {
    textDecorationLine += ' line-through';
    span.strikethrough = true;
  }
  if (textDecorationLine) {
    style.textDecorationLine = textDecorationLine;
  }

  if (this.wcNode) {
    classes.push('wc-node');
    span.wcNode = true;
  }
  span.asciiNode = this.asciiNode;

  if (this.tileData != null) {
    classes.push('tile');
    classes.push('tile_' + this.tileData);
    span.tileNode = true;
  }

  if (textContent) {
    span.textContent = textContent;
  }

  if (this.uri) {
    classes.push('uri-node');
    span.uriId = this.uriId;
    span.title = this.uri;
    span.addEventListener('click', hterm.openUrl.bind(this, this.uri));
  }

  if (classes.length) {
    span.className = classes.join(' ');
  }

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
 * @param {string|!Node} obj The object to test.
 * @return {boolean} True if the provided container has the same style as
 *     this attributes instance.
 */
hterm.TextAttributes.prototype.matchesContainer = function(obj) {
  if (typeof obj == 'string' || obj.nodeType == Node.TEXT_NODE) {
    return this.isDefault();
  }

  const style = obj.style;

  // We don't want to put multiple characters in a wcNode or a tile.
  // See the comments in createContainer.
  // For attributes that default to false, we do not require that obj have them
  // declared, so always normalize them using !! (to turn undefined into false)
  // in the compares below.
  return (!(this.wcNode || obj.wcNode) &&
          this.asciiNode == obj.asciiNode &&
          !(this.tileData != null || obj.tileNode) &&
          this.uriId == obj.uriId &&
          (this.foreground == this.DEFAULT_COLOR &&
           style.color == '') &&
          (this.background == this.DEFAULT_COLOR &&
           style.backgroundColor == '') &&
          (this.underlineColor == this.DEFAULT_COLOR &&
           style.textDecorationColor == '') &&
          (this.enableBold && this.bold) == !!style.fontWeight &&
          this.blink == !!obj.blinkNode &&
          this.italic == !!style.fontStyle &&
          this.underline == obj.underline &&
          !!this.strikethrough == !!obj.strikethrough);
};

/**
 * Updates foreground and background properties based on current indices and
 * other state.
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

  // Expand the default color as makes sense.
  const getDefaultColor = (color, defaultColor) => {
    return color == this.DEFAULT_COLOR ? defaultColor : color;
  };

  // TODO(joelhockey): Remove redundant `typeof foo == 'number'` when
  // externs/es6.js is updated.
  // https://github.com/google/closure-compiler/pull/3472.

  if (this.enableBoldAsBright && this.bold) {
    if (typeof this.foregroundSource == 'number' &&
        Number.isInteger(this.foregroundSource)) {
      this.foregroundSource = getBrightIndex(this.foregroundSource);
    }
  }

  /**
   * @param {symbol|string|number} source
   * @return {symbol|string}
   */
  const colorFromSource = (source) => {
    if (source == this.SRC_DEFAULT) {
      return this.DEFAULT_COLOR;
    } else if (typeof source == 'number' && Number.isInteger(source)) {
      return `rgb(var(--hterm-color-${source}))`;
    } else {
      return source.toString();
    }
  };

  this.foreground = colorFromSource(this.foregroundSource);

  if (this.faint) {
    if (this.foreground == this.DEFAULT_COLOR) {
      this.foreground = 'rgba(var(--hterm-foreground-color), 0.67)';
    } else if (typeof this.foregroundSource == 'number' &&
        Number.isInteger(this.foregroundSource)) {
      this.foreground =
          `rgba(var(--hterm-color-${this.foregroundSource}), 0.67)`;
    } else {
      this.foreground = lib.colors.setAlpha(this.foreground.toString(), 0.67);
    }
  }

  this.background = colorFromSource(this.backgroundSource);

  // Once we've processed the bold-as-bright and faint attributes, swap.
  // This matches xterm/gnome-terminal.
  if (this.inverse) {
    const swp = getDefaultColor(this.foreground, this.defaultForeground);
    this.foreground = getDefaultColor(this.background, this.defaultBackground);
    this.background = swp;
  }

  // Process invisible settings last to keep it simple.
  if (this.invisible) {
    this.foreground = this.background;
  }

  this.underlineColor = colorFromSource(this.underlineSource);
};

/**
 * Static method used to test if the provided objects (strings, spans or
 * text nodes) have the same style.
 *
 * For the purposes of this method, a string is considered a text node.
 *
 * @param {string|!Node} obj1 An object to test.
 * @param {string|!Node} obj2 Another object to test.
 * @return {boolean} True if the containers have the same style.
 */
hterm.TextAttributes.containersMatch = function(obj1, obj2) {
  if (typeof obj1 == 'string') {
    return hterm.TextAttributes.containerIsDefault(obj2);
  }

  if (obj1.nodeType != obj2.nodeType) {
    return false;
  }

  if (obj1.nodeType == Node.TEXT_NODE) {
    return true;
  }

  const style1 = obj1.style;
  const style2 = obj2.style;

  return (style1.color == style2.color &&
          style1.backgroundColor == style2.backgroundColor &&
          style1.backgroundColor == style2.backgroundColor &&
          style1.fontWeight == style2.fontWeight &&
          style1.fontStyle == style2.fontStyle &&
          style1.textDecoration == style2.textDecoration &&
          style1.textDecorationColor == style2.textDecorationColor &&
          style1.textDecorationStyle == style2.textDecorationStyle &&
          style1.textDecorationLine == style2.textDecorationLine);
};

/**
 * Static method to test if a given DOM container represents unstyled text.
 *
 * For the purposes of this method, a string is considered a text node.
 *
 * @param {string|!Node} obj An object to test.
 * @return {boolean} True if the object is unstyled.
 */
hterm.TextAttributes.containerIsDefault = function(obj) {
  return typeof obj == 'string'  || obj.nodeType == Node.TEXT_NODE;
};

/**
 * Static method to get the column width of a node's textContent.
 *
 * @param {!Node} node The HTML element to get the width of textContent
 *     from.
 * @return {number} The column width of the node's textContent.
 */
hterm.TextAttributes.nodeWidth = function(node) {
  if (!node.asciiNode) {
    return lib.wc.strWidth(node.textContent);
  } else {
    return node.textContent.length;
  }
};

/**
 * Static method to get the substr of a node's textContent.  The start index
 * and substr width are computed in column width.
 *
 * @param {!Node} node The HTML element to get the substr of textContent
 *     from.
 * @param {number} start The starting offset in column width.
 * @param {number=} width The width to capture in column width.
 * @return {string} The extracted substr of the node's textContent.
 */
hterm.TextAttributes.nodeSubstr = function(node, start, width) {
  if (!node.asciiNode) {
    return lib.wc.substr(node.textContent, start, width);
  } else {
    return node.textContent.substr(start, width);
  }
};

/**
 * Static method to get the substring based of a node's textContent.  The
 * start index of end index are computed in column width.
 *
 * @param {!Element} node The HTML element to get the substr of textContent
 *     from.
 * @param {number} start The starting offset in column width.
 * @param {number} end The ending offset in column width.
 * @return {string} The extracted substring of the node's textContent.
 */
hterm.TextAttributes.nodeSubstring = function(node, start, end) {
  if (!node.asciiNode) {
    return lib.wc.substring(node.textContent, start, end);
  } else {
    return node.textContent.substring(start, end);
  }
};

/**
 * Static method to split a string into contiguous runs of single-width
 * characters and runs of double-width characters.
 *
 * @param {string} str The string to split.
 * @return {!Array<{str:string, wcNode:boolean, asciiNode:boolean,
 *     wcStrWidth:number}>} An array of objects that contain substrings of str,
 *     where each substring is either a contiguous runs of single-width
 *     characters or a double-width character.  For objects that contain a
 *     double-width character, its wcNode property is set to true.  For objects
 *     that contain only ASCII content, its asciiNode property is set to true.
 */
hterm.TextAttributes.splitWidecharString = function(str) {
  const asciiRegex = new RegExp('^[\u0020-\u007f]*$');

  // Optimize for printable ASCII.  This should only take ~1ms/MB, but cuts out
  // 40ms+/MB when true.  If we're dealing with UTF8, then it's already slow.
  if (asciiRegex.test(str)) {
    return [{
      str: str,
      wcNode: false,
      asciiNode: true,
      wcStrWidth: str.length,
    }];
  }

  // Iterate over each grapheme and merge them together in runs of similar
  // strings.  We want to keep narrow and wide characters separate, and the
  // fewer overall segments we have, the faster we'll be as processing each
  // segment in the terminal print code is a bit slow.
  const segmenter = new Intl.Segmenter(undefined, {type: 'grapheme'});
  const it = segmenter.segment(str);

  const rv = [];
  let segment = it.next();
  while (!segment.done) {
    const grapheme = segment.value.segment;
    const isAscii = asciiRegex.test(grapheme);
    const strWidth = isAscii ? 1 : lib.wc.strWidth(grapheme);
    const isWideChar =
        isAscii ? false : (lib.wc.charWidth(grapheme.codePointAt(0)) == 2);

    // Only merge non-wide characters together.  Every wide character needs to
    // be separate so it can get a unique container.
    const prev = rv[rv.length - 1];
    if (prev && !isWideChar && !prev.wcNode) {
      prev.str += grapheme;
      prev.wcStrWidth += strWidth;
      prev.asciiNode = prev.asciiNode && isAscii;
    } else {
      rv.push({
        str: grapheme,
        wcNode: isWideChar,
        asciiNode: isAscii,
        wcStrWidth: strWidth,
      });
    }

    segment = it.next();
  }

  return rv;
};
