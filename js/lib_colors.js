// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * Namespace for color utilities.
 */
lib.colors = {};

/**
 * First, some canned regular expressions we're going to use in this file.
 *
 *
 *                              BRACE YOURSELF
 *
 *                                 ,~~~~.
 *                                 |>_< ~~
 *                                3`---'-/.
 *                                3:::::\v\
 *                               =o=:::::\,\
 *                                | :::::\,,\
 *
 *                        THE REGULAR EXPRESSIONS
 *                               ARE COMING.
 *
 * There's no way to break long RE literals in JavaScript.  Fix that why don't
 * you?  Oh, and also there's no way to write a string that doesn't interpret
 * escapes.
 *
 * Instead, we stoop to this .replace() trick.
 */
lib.colors.re_ = {
  // CSS hex color, #RGB.
  hex16: /#([a-f0-9])([a-f0-9])([a-f0-9])/i,

  // CSS hex color, #RRGGBB.
  hex24: /#([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})/i,

  // CSS rgb color, rgb(rrr,ggg,bbb).
  rgb: new RegExp(
      ('^/s*rgb/s*/(/s*(/d{1,3})/s*,/s*(/d{1,3})/s*,' +
       '/s*(/d{1,3})/s*/)/s*$'
       ).replace(/\//g, '\\'), 'i'),

  // CSS rgb color, rgb(rrr,ggg,bbb,aaa).
  rgba: new RegExp(
      ('^/s*rgba/s*' +
       '/(/s*(/d{1,3})/s*,/s*(/d{1,3})/s*,/s*(/d{1,3})/s*' +
       '(?:,/s*(/d+(?:/./d+)?)/s*)/)/s*$'
       ).replace(/\//g, '\\'), 'i'),

  // Either RGB or RGBA.
  rgbx: new RegExp(
      ('^/s*rgba?/s*' +
       '/(/s*(/d{1,3})/s*,/s*(/d{1,3})/s*,/s*(/d{1,3})/s*' +
       '(?:,/s*(/d+(?:/./d+)?)/s*)?/)/s*$'
       ).replace(/\//g, '\\'), 'i'),

  // An X11 "rgb:ddd/ddd/ddd" value.
  x11rgb: /^\s*rgb:([a-f0-9]{1,4})\/([a-f0-9]{1,4})\/([a-f0-9]{1,4})\s*$/i,

  // English color name.
  name: /[a-z][a-z0-9\s]+/,
};

/**
 * Convert a CSS rgb(ddd,ddd,ddd) color value into an X11 color value.
 *
 * Other CSS color values are ignored to ensure sanitary data handling.
 *
 * Each 'ddd' component is a one byte value specified in decimal.
 *
 * @param {string} value The CSS color value to convert.
 * @return {string} The X11 color value or null if the value could not be
 *     converted.
 */
lib.colors.rgbToX11 = function(value) {
  function scale(v) {
    v = (Math.min(v, 255) * 257).toString(16);
    while (v.length < 4)
      v = '0' + v;

    return v;
  }

  var ary = value.match(lib.colors.re_.rgbx);
  if (!ary)
    return null;

  return 'rgb:' + scale(ary[1]) + '/' + scale(ary[2]) + '/' + scale(ary[3]);
};

/**
 * Convert an X11 color value into an CSS rgb(...) color value.
 *
 * The X11 value may be an X11 color name, or an RGB value of the form
 * rgb:hhhh/hhhh/hhhh.  If a component value is less than 4 digits it is
 * padded out to 4, then scaled down to fit in a single byte.
 *
 * @param {string} value The X11 color value to convert.
 * @return {string} The CSS color value or null if the value could not be
 *     converted.
 */
lib.colors.x11ToCSS = function(v) {
  function scale(v) {
    // Pad out values with less than four digits.  This padding (probably)
    // matches xterm.  It's difficult to say for sure since xterm seems to
    // arrive at a padded value and then perform some combination of
    // gamma correction, color space tranformation, and quantization.

    if (v.length == 1) {
      // Single digits pad out to four by repeating the character.  "f" becomes
      // "ffff".  Scaling down a hex value of this pattern by 257 is the same
      // as cutting off one byte.  We skip the middle step and just double
      // the character.
      return parseInt(v + v, 16);
    }

    if (v.length == 2) {
      // Similar deal here.  X11 pads two digit values by repeating the
      // byte (or scale up by 257).  Since we're going to scale it back
      // down anyway, we can just return the original value.
      return parseInt(v, 16);
    }

    if (v.length == 3) {
      // Three digit values seem to be padded by repeating the final digit.
      // e.g. 10f becomes 10ff.
      v = v + v.substr(2);
    }

    // Scale down the 2 byte value.
    return Math.round(parseInt(v, 16) / 257);
  }

  var ary = v.match(lib.colors.re_.x11rgb);
  if (!ary)
    return lib.colors.nameToRGB(v);

  ary.splice(0, 1);
  return lib.colors.arrayToRGBA(ary.map(scale));
};

/**
 * Converts one or more CSS '#RRGGBB' color values into their rgb(...)
 * form.
 *
 * Arrays are converted in place. If a value cannot be converted, it is
 * replaced with null.
 *
 * @param {string|Array.<string>} A single RGB value or array of RGB values to
 *     convert.
 * @return {string|Array.<string>} The converted value or values.
 */
lib.colors.hexToRGB = function(arg) {
  function convert(hex) {
    var re = (hex.length == 4) ?
        lib.colors.re_.hex16 : lib.colors.re_.hex24;
    var ary = hex.match(re)
    if (!ary)
      return null;

    return 'rgb(' + parseInt(ary[1], 16) + ', ' +
        parseInt(ary[2], 16) + ', ' +
        parseInt(ary[3], 16) + ')';
  }

  if (arg instanceof Array) {
    for (var i = 0; i < arg.length; i++) {
      arg[i] = convert(arg[i]);
    }
  } else {
    arg = convert(arg);
  }

  return arg;
};

/**
 * Converts one or more CSS rgb(...) forms into their '#RRGGBB' color values.
 *
 * If given an rgba(...) form, the alpha field is thrown away.
 *
 * Arrays are converted in place. If a value cannot be converted, it is
 * replaced with null.
 *
 * @param {string|Array.<string>} A single rgb(...) value or array of rgb(...)
 *     values to convert.
 * @return {string|Array.<string>} The converted value or values.
 */
lib.colors.rgbToHex = function(arg) {
  function convert(rgb) {
    var ary = lib.colors.crackRGB(rgb);
    return '#' + ((parseInt(ary[0]) << 16) |
                  (parseInt(ary[1]) <<  8) |
                  (parseInt(ary[2]) <<  0)).toString(16);
  }

  if (arg instanceof Array) {
    for (var i = 0; i < arg.length; i++) {
      arg[i] = convert(arg[i]);
    }
  } else {
    arg = convert(arg);
  }

  return arg;
};

/**
 * Take any valid css color definition and turn it into an rgb or rgba value.
 *
 * Returns null if the value could not be normalized.
 */
lib.colors.normalizeCSS = function(def) {
  if (def.substr(0, 1) == '#')
    return lib.colors.hexToRGB(def);

  if (lib.colors.re_.rgbx.test(def))
    return def;

  return lib.colors.nameToRGB(def);
};

/**
 * Convert a 3 or 4 element array into an rgba(...) string.
 */
lib.colors.arrayToRGBA = function(ary) {
  var alpha = (ary.length > 3) ? ary[3] : 1;
  return 'rgba(' + ary[0] + ', ' + ary[1] + ', ' + ary[2] + ', ' + alpha + ')';
};

/**
 * Overwrite the alpha channel of an rgb/rgba color.
 */
lib.colors.setAlpha = function(rgb, alpha) {
  var ary = lib.colors.crackRGB(rgb);
  ary[3] = alpha;
  return lib.colors.arrayToRGBA(ary);
};

/**
 * Mix a percentage of a tint color into a base color.
 */
lib.colors.mix = function(base, tint, percent) {
  var ary1 = lib.colors.crackRGB(base);
  var ary2 = lib.colors.crackRGB(tint);

  for (var i = 0; i < 4; ++i) {
    var diff = ary1[i] - ary2[i];
    ary1[i] += diff * percent;
  }

  return lib.colors.arrayToRGBA(ary);
};

/**
 * Split an rgb/rgba color into an array of its components.
 *
 * On success, a 4 element array will be returned.  For rgb values, the alpha
 * will be set to 1.
 */
lib.colors.crackRGB = function(color) {
  if (color.substr(0, 4) == 'rgba') {
    var ary = color.match(lib.colors.re_.rgba);
    if (ary) {
      ary.shift();
      return ary;
    }
  } else {
    var ary = color.match(lib.colors.re_.rgb);
    if (ary) {
      ary.shift();
      ary.push(1);
      return ary;
    }
  }

  console.error('Couldn\'t crack: ' + color);
  return null;
};

/**
 * Convert an X11 color name into a CSS rgb(...) value.
 *
 * Names are stripped of spaces and converted to lowercase.  If the name is
 * unknown, null is returned.
 *
 * This list of color name to RGB mapping is derived from the stock X11
 * rgb.txt file.
 *
 * @param {string} name The color name to convert.
 * @return {string} The corresponding CSS rgb(...) value.
 */
lib.colors.nameToRGB = function(name) {
  if (name in lib.colors.colorNames)
    return lib.colors.colorNames[name];

  name = name.toLowerCase();
  if (name in lib.colors.colorNames)
    return lib.colors.colorNames[name];

  name = name.replace(/\s+/g, '');
  if (name in lib.colors.colorNames)
    return lib.colors.colorNames[name];

  return null;
};

/**
 * The stock color palette.
 */
lib.colors.stockColorPalette = lib.colors.hexToRGB
  ([// The "ANSI 16"...
    '#000000', '#CC0000', '#4E9A06', '#C4A000',
    '#3465A4', '#75507B', '#06989A', '#D3D7CF',
    '#555753', '#EF2929', '#00BA13', '#FCE94F',
    '#729FCF', '#F200CB', '#00B5BD', '#EEEEEC',

    // The 6x6 color cubes...
    '#000000', '#00005F', '#000087', '#0000AF', '#0000D7', '#0000FF',
    '#005F00', '#005F5F', '#005F87', '#005FAF', '#005FD7', '#005FFF',
    '#008700', '#00875F', '#008787', '#0087AF', '#0087D7', '#0087FF',
    '#00AF00', '#00AF5F', '#00AF87', '#00AFAF', '#00AFD7', '#00AFFF',
    '#00D700', '#00D75F', '#00D787', '#00D7AF', '#00D7D7', '#00D7FF',
    '#00FF00', '#00FF5F', '#00FF87', '#00FFAF', '#00FFD7', '#00FFFF',

    '#5F0000', '#5F005F', '#5F0087', '#5F00AF', '#5F00D7', '#5F00FF',
    '#5F5F00', '#5F5F5F', '#5F5F87', '#5F5FAF', '#5F5FD7', '#5F5FFF',
    '#5F8700', '#5F875F', '#5F8787', '#5F87AF', '#5F87D7', '#5F87FF',
    '#5FAF00', '#5FAF5F', '#5FAF87', '#5FAFAF', '#5FAFD7', '#5FAFFF',
    '#5FD700', '#5FD75F', '#5FD787', '#5FD7AF', '#5FD7D7', '#5FD7FF',
    '#5FFF00', '#5FFF5F', '#5FFF87', '#5FFFAF', '#5FFFD7', '#5FFFFF',

    '#870000', '#87005F', '#870087', '#8700AF', '#8700D7', '#8700FF',
    '#875F00', '#875F5F', '#875F87', '#875FAF', '#875FD7', '#875FFF',
    '#878700', '#87875F', '#878787', '#8787AF', '#8787D7', '#8787FF',
    '#87AF00', '#87AF5F', '#87AF87', '#87AFAF', '#87AFD7', '#87AFFF',
    '#87D700', '#87D75F', '#87D787', '#87D7AF', '#87D7D7', '#87D7FF',
    '#87FF00', '#87FF5F', '#87FF87', '#87FFAF', '#87FFD7', '#87FFFF',

    '#AF0000', '#AF005F', '#AF0087', '#AF00AF', '#AF00D7', '#AF00FF',
    '#AF5F00', '#AF5F5F', '#AF5F87', '#AF5FAF', '#AF5FD7', '#AF5FFF',
    '#AF8700', '#AF875F', '#AF8787', '#AF87AF', '#AF87D7', '#AF87FF',
    '#AFAF00', '#AFAF5F', '#AFAF87', '#AFAFAF', '#AFAFD7', '#AFAFFF',
    '#AFD700', '#AFD75F', '#AFD787', '#AFD7AF', '#AFD7D7', '#AFD7FF',
    '#AFFF00', '#AFFF5F', '#AFFF87', '#AFFFAF', '#AFFFD7', '#AFFFFF',

    '#D70000', '#D7005F', '#D70087', '#D700AF', '#D700D7', '#D700FF',
    '#D75F00', '#D75F5F', '#D75F87', '#D75FAF', '#D75FD7', '#D75FFF',
    '#D78700', '#D7875F', '#D78787', '#D787AF', '#D787D7', '#D787FF',
    '#D7AF00', '#D7AF5F', '#D7AF87', '#D7AFAF', '#D7AFD7', '#D7AFFF',
    '#D7D700', '#D7D75F', '#D7D787', '#D7D7AF', '#D7D7D7', '#D7D7FF',
    '#D7FF00', '#D7FF5F', '#D7FF87', '#D7FFAF', '#D7FFD7', '#D7FFFF',

    '#FF0000', '#FF005F', '#FF0087', '#FF00AF', '#FF00D7', '#FF00FF',
    '#FF5F00', '#FF5F5F', '#FF5F87', '#FF5FAF', '#FF5FD7', '#FF5FFF',
    '#FF8700', '#FF875F', '#FF8787', '#FF87AF', '#FF87D7', '#FF87FF',
    '#FFAF00', '#FFAF5F', '#FFAF87', '#FFAFAF', '#FFAFD7', '#FFAFFF',
    '#FFD700', '#FFD75F', '#FFD787', '#FFD7AF', '#FFD7D7', '#FFD7FF',
    '#FFFF00', '#FFFF5F', '#FFFF87', '#FFFFAF', '#FFFFD7', '#FFFFFF',

    // The greyscale ramp...
    '#080808', '#121212', '#1C1C1C', '#262626', '#303030', '#3A3A3A',
    '#444444', '#4E4E4E', '#585858', '#626262', '#6C6C6C', '#767676',
    '#808080', '#8A8A8A', '#949494', '#9E9E9E', '#A8A8A8', '#B2B2B2',
    '#BCBCBC', '#C6C6C6', '#D0D0D0', '#DADADA', '#E4E4E4', '#EEEEEE'
   ]);

/**
 * The current color palette, possibly with user changes.
 */
lib.colors.colorPalette = lib.colors.stockColorPalette;

/**
 * Named colors according to the stock X11 rgb.txt file.
 */
lib.colors.colorNames = {
  "aliceblue": "rgb(240, 248, 255)",
  "antiquewhite": "rgb(250, 235, 215)",
  "antiquewhite1": "rgb(255, 239, 219)",
  "antiquewhite2": "rgb(238, 223, 204)",
  "antiquewhite3": "rgb(205, 192, 176)",
  "antiquewhite4": "rgb(139, 131, 120)",
  "aquamarine": "rgb(127, 255, 212)",
  "aquamarine1": "rgb(127, 255, 212)",
  "aquamarine2": "rgb(118, 238, 198)",
  "aquamarine3": "rgb(102, 205, 170)",
  "aquamarine4": "rgb(69, 139, 116)",
  "azure": "rgb(240, 255, 255)",
  "azure1": "rgb(240, 255, 255)",
  "azure2": "rgb(224, 238, 238)",
  "azure3": "rgb(193, 205, 205)",
  "azure4": "rgb(131, 139, 139)",
  "beige": "rgb(245, 245, 220)",
  "bisque": "rgb(255, 228, 196)",
  "bisque1": "rgb(255, 228, 196)",
  "bisque2": "rgb(238, 213, 183)",
  "bisque3": "rgb(205, 183, 158)",
  "bisque4": "rgb(139, 125, 107)",
  "black": "rgb(0, 0, 0)",
  "blanchedalmond": "rgb(255, 235, 205)",
  "blue": "rgb(0, 0, 255)",
  "blue1": "rgb(0, 0, 255)",
  "blue2": "rgb(0, 0, 238)",
  "blue3": "rgb(0, 0, 205)",
  "blue4": "rgb(0, 0, 139)",
  "blueviolet": "rgb(138, 43, 226)",
  "brown": "rgb(165, 42, 42)",
  "brown1": "rgb(255, 64, 64)",
  "brown2": "rgb(238, 59, 59)",
  "brown3": "rgb(205, 51, 51)",
  "brown4": "rgb(139, 35, 35)",
  "burlywood": "rgb(222, 184, 135)",
  "burlywood1": "rgb(255, 211, 155)",
  "burlywood2": "rgb(238, 197, 145)",
  "burlywood3": "rgb(205, 170, 125)",
  "burlywood4": "rgb(139, 115, 85)",
  "cadetblue": "rgb(95, 158, 160)",
  "cadetblue1": "rgb(152, 245, 255)",
  "cadetblue2": "rgb(142, 229, 238)",
  "cadetblue3": "rgb(122, 197, 205)",
  "cadetblue4": "rgb(83, 134, 139)",
  "chartreuse": "rgb(127, 255, 0)",
  "chartreuse1": "rgb(127, 255, 0)",
  "chartreuse2": "rgb(118, 238, 0)",
  "chartreuse3": "rgb(102, 205, 0)",
  "chartreuse4": "rgb(69, 139, 0)",
  "chocolate": "rgb(210, 105, 30)",
  "chocolate1": "rgb(255, 127, 36)",
  "chocolate2": "rgb(238, 118, 33)",
  "chocolate3": "rgb(205, 102, 29)",
  "chocolate4": "rgb(139, 69, 19)",
  "coral": "rgb(255, 127, 80)",
  "coral1": "rgb(255, 114, 86)",
  "coral2": "rgb(238, 106, 80)",
  "coral3": "rgb(205, 91, 69)",
  "coral4": "rgb(139, 62, 47)",
  "cornflowerblue": "rgb(100, 149, 237)",
  "cornsilk": "rgb(255, 248, 220)",
  "cornsilk1": "rgb(255, 248, 220)",
  "cornsilk2": "rgb(238, 232, 205)",
  "cornsilk3": "rgb(205, 200, 177)",
  "cornsilk4": "rgb(139, 136, 120)",
  "cyan": "rgb(0, 255, 255)",
  "cyan1": "rgb(0, 255, 255)",
  "cyan2": "rgb(0, 238, 238)",
  "cyan3": "rgb(0, 205, 205)",
  "cyan4": "rgb(0, 139, 139)",
  "darkblue": "rgb(0, 0, 139)",
  "darkcyan": "rgb(0, 139, 139)",
  "darkgoldenrod": "rgb(184, 134, 11)",
  "darkgoldenrod1": "rgb(255, 185, 15)",
  "darkgoldenrod2": "rgb(238, 173, 14)",
  "darkgoldenrod3": "rgb(205, 149, 12)",
  "darkgoldenrod4": "rgb(139, 101, 8)",
  "darkgray": "rgb(169, 169, 169)",
  "darkgreen": "rgb(0, 100, 0)",
  "darkgrey": "rgb(169, 169, 169)",
  "darkkhaki": "rgb(189, 183, 107)",
  "darkmagenta": "rgb(139, 0, 139)",
  "darkolivegreen": "rgb(85, 107, 47)",
  "darkolivegreen1": "rgb(202, 255, 112)",
  "darkolivegreen2": "rgb(188, 238, 104)",
  "darkolivegreen3": "rgb(162, 205, 90)",
  "darkolivegreen4": "rgb(110, 139, 61)",
  "darkorange": "rgb(255, 140, 0)",
  "darkorange1": "rgb(255, 127, 0)",
  "darkorange2": "rgb(238, 118, 0)",
  "darkorange3": "rgb(205, 102, 0)",
  "darkorange4": "rgb(139, 69, 0)",
  "darkorchid": "rgb(153, 50, 204)",
  "darkorchid1": "rgb(191, 62, 255)",
  "darkorchid2": "rgb(178, 58, 238)",
  "darkorchid3": "rgb(154, 50, 205)",
  "darkorchid4": "rgb(104, 34, 139)",
  "darkred": "rgb(139, 0, 0)",
  "darksalmon": "rgb(233, 150, 122)",
  "darkseagreen": "rgb(143, 188, 143)",
  "darkseagreen1": "rgb(193, 255, 193)",
  "darkseagreen2": "rgb(180, 238, 180)",
  "darkseagreen3": "rgb(155, 205, 155)",
  "darkseagreen4": "rgb(105, 139, 105)",
  "darkslateblue": "rgb(72, 61, 139)",
  "darkslategray": "rgb(47, 79, 79)",
  "darkslategray1": "rgb(151, 255, 255)",
  "darkslategray2": "rgb(141, 238, 238)",
  "darkslategray3": "rgb(121, 205, 205)",
  "darkslategray4": "rgb(82, 139, 139)",
  "darkslategrey": "rgb(47, 79, 79)",
  "darkturquoise": "rgb(0, 206, 209)",
  "darkviolet": "rgb(148, 0, 211)",
  "debianred": "rgb(215, 7, 81)",
  "deeppink": "rgb(255, 20, 147)",
  "deeppink1": "rgb(255, 20, 147)",
  "deeppink2": "rgb(238, 18, 137)",
  "deeppink3": "rgb(205, 16, 118)",
  "deeppink4": "rgb(139, 10, 80)",
  "deepskyblue": "rgb(0, 191, 255)",
  "deepskyblue1": "rgb(0, 191, 255)",
  "deepskyblue2": "rgb(0, 178, 238)",
  "deepskyblue3": "rgb(0, 154, 205)",
  "deepskyblue4": "rgb(0, 104, 139)",
  "dimgray": "rgb(105, 105, 105)",
  "dimgrey": "rgb(105, 105, 105)",
  "dodgerblue": "rgb(30, 144, 255)",
  "dodgerblue1": "rgb(30, 144, 255)",
  "dodgerblue2": "rgb(28, 134, 238)",
  "dodgerblue3": "rgb(24, 116, 205)",
  "dodgerblue4": "rgb(16, 78, 139)",
  "firebrick": "rgb(178, 34, 34)",
  "firebrick1": "rgb(255, 48, 48)",
  "firebrick2": "rgb(238, 44, 44)",
  "firebrick3": "rgb(205, 38, 38)",
  "firebrick4": "rgb(139, 26, 26)",
  "floralwhite": "rgb(255, 250, 240)",
  "forestgreen": "rgb(34, 139, 34)",
  "gainsboro": "rgb(220, 220, 220)",
  "ghostwhite": "rgb(248, 248, 255)",
  "gold": "rgb(255, 215, 0)",
  "gold1": "rgb(255, 215, 0)",
  "gold2": "rgb(238, 201, 0)",
  "gold3": "rgb(205, 173, 0)",
  "gold4": "rgb(139, 117, 0)",
  "goldenrod": "rgb(218, 165, 32)",
  "goldenrod1": "rgb(255, 193, 37)",
  "goldenrod2": "rgb(238, 180, 34)",
  "goldenrod3": "rgb(205, 155, 29)",
  "goldenrod4": "rgb(139, 105, 20)",
  "gray": "rgb(190, 190, 190)",
  "gray0": "rgb(0, 0, 0)",
  "gray1": "rgb(3, 3, 3)",
  "gray10": "rgb(26, 26, 26)",
  "gray100": "rgb(255, 255, 255)",
  "gray11": "rgb(28, 28, 28)",
  "gray12": "rgb(31, 31, 31)",
  "gray13": "rgb(33, 33, 33)",
  "gray14": "rgb(36, 36, 36)",
  "gray15": "rgb(38, 38, 38)",
  "gray16": "rgb(41, 41, 41)",
  "gray17": "rgb(43, 43, 43)",
  "gray18": "rgb(46, 46, 46)",
  "gray19": "rgb(48, 48, 48)",
  "gray2": "rgb(5, 5, 5)",
  "gray20": "rgb(51, 51, 51)",
  "gray21": "rgb(54, 54, 54)",
  "gray22": "rgb(56, 56, 56)",
  "gray23": "rgb(59, 59, 59)",
  "gray24": "rgb(61, 61, 61)",
  "gray25": "rgb(64, 64, 64)",
  "gray26": "rgb(66, 66, 66)",
  "gray27": "rgb(69, 69, 69)",
  "gray28": "rgb(71, 71, 71)",
  "gray29": "rgb(74, 74, 74)",
  "gray3": "rgb(8, 8, 8)",
  "gray30": "rgb(77, 77, 77)",
  "gray31": "rgb(79, 79, 79)",
  "gray32": "rgb(82, 82, 82)",
  "gray33": "rgb(84, 84, 84)",
  "gray34": "rgb(87, 87, 87)",
  "gray35": "rgb(89, 89, 89)",
  "gray36": "rgb(92, 92, 92)",
  "gray37": "rgb(94, 94, 94)",
  "gray38": "rgb(97, 97, 97)",
  "gray39": "rgb(99, 99, 99)",
  "gray4": "rgb(10, 10, 10)",
  "gray40": "rgb(102, 102, 102)",
  "gray41": "rgb(105, 105, 105)",
  "gray42": "rgb(107, 107, 107)",
  "gray43": "rgb(110, 110, 110)",
  "gray44": "rgb(112, 112, 112)",
  "gray45": "rgb(115, 115, 115)",
  "gray46": "rgb(117, 117, 117)",
  "gray47": "rgb(120, 120, 120)",
  "gray48": "rgb(122, 122, 122)",
  "gray49": "rgb(125, 125, 125)",
  "gray5": "rgb(13, 13, 13)",
  "gray50": "rgb(127, 127, 127)",
  "gray51": "rgb(130, 130, 130)",
  "gray52": "rgb(133, 133, 133)",
  "gray53": "rgb(135, 135, 135)",
  "gray54": "rgb(138, 138, 138)",
  "gray55": "rgb(140, 140, 140)",
  "gray56": "rgb(143, 143, 143)",
  "gray57": "rgb(145, 145, 145)",
  "gray58": "rgb(148, 148, 148)",
  "gray59": "rgb(150, 150, 150)",
  "gray6": "rgb(15, 15, 15)",
  "gray60": "rgb(153, 153, 153)",
  "gray61": "rgb(156, 156, 156)",
  "gray62": "rgb(158, 158, 158)",
  "gray63": "rgb(161, 161, 161)",
  "gray64": "rgb(163, 163, 163)",
  "gray65": "rgb(166, 166, 166)",
  "gray66": "rgb(168, 168, 168)",
  "gray67": "rgb(171, 171, 171)",
  "gray68": "rgb(173, 173, 173)",
  "gray69": "rgb(176, 176, 176)",
  "gray7": "rgb(18, 18, 18)",
  "gray70": "rgb(179, 179, 179)",
  "gray71": "rgb(181, 181, 181)",
  "gray72": "rgb(184, 184, 184)",
  "gray73": "rgb(186, 186, 186)",
  "gray74": "rgb(189, 189, 189)",
  "gray75": "rgb(191, 191, 191)",
  "gray76": "rgb(194, 194, 194)",
  "gray77": "rgb(196, 196, 196)",
  "gray78": "rgb(199, 199, 199)",
  "gray79": "rgb(201, 201, 201)",
  "gray8": "rgb(20, 20, 20)",
  "gray80": "rgb(204, 204, 204)",
  "gray81": "rgb(207, 207, 207)",
  "gray82": "rgb(209, 209, 209)",
  "gray83": "rgb(212, 212, 212)",
  "gray84": "rgb(214, 214, 214)",
  "gray85": "rgb(217, 217, 217)",
  "gray86": "rgb(219, 219, 219)",
  "gray87": "rgb(222, 222, 222)",
  "gray88": "rgb(224, 224, 224)",
  "gray89": "rgb(227, 227, 227)",
  "gray9": "rgb(23, 23, 23)",
  "gray90": "rgb(229, 229, 229)",
  "gray91": "rgb(232, 232, 232)",
  "gray92": "rgb(235, 235, 235)",
  "gray93": "rgb(237, 237, 237)",
  "gray94": "rgb(240, 240, 240)",
  "gray95": "rgb(242, 242, 242)",
  "gray96": "rgb(245, 245, 245)",
  "gray97": "rgb(247, 247, 247)",
  "gray98": "rgb(250, 250, 250)",
  "gray99": "rgb(252, 252, 252)",
  "green": "rgb(0, 255, 0)",
  "green1": "rgb(0, 255, 0)",
  "green2": "rgb(0, 238, 0)",
  "green3": "rgb(0, 205, 0)",
  "green4": "rgb(0, 139, 0)",
  "greenyellow": "rgb(173, 255, 47)",
  "grey": "rgb(190, 190, 190)",
  "grey0": "rgb(0, 0, 0)",
  "grey1": "rgb(3, 3, 3)",
  "grey10": "rgb(26, 26, 26)",
  "grey100": "rgb(255, 255, 255)",
  "grey11": "rgb(28, 28, 28)",
  "grey12": "rgb(31, 31, 31)",
  "grey13": "rgb(33, 33, 33)",
  "grey14": "rgb(36, 36, 36)",
  "grey15": "rgb(38, 38, 38)",
  "grey16": "rgb(41, 41, 41)",
  "grey17": "rgb(43, 43, 43)",
  "grey18": "rgb(46, 46, 46)",
  "grey19": "rgb(48, 48, 48)",
  "grey2": "rgb(5, 5, 5)",
  "grey20": "rgb(51, 51, 51)",
  "grey21": "rgb(54, 54, 54)",
  "grey22": "rgb(56, 56, 56)",
  "grey23": "rgb(59, 59, 59)",
  "grey24": "rgb(61, 61, 61)",
  "grey25": "rgb(64, 64, 64)",
  "grey26": "rgb(66, 66, 66)",
  "grey27": "rgb(69, 69, 69)",
  "grey28": "rgb(71, 71, 71)",
  "grey29": "rgb(74, 74, 74)",
  "grey3": "rgb(8, 8, 8)",
  "grey30": "rgb(77, 77, 77)",
  "grey31": "rgb(79, 79, 79)",
  "grey32": "rgb(82, 82, 82)",
  "grey33": "rgb(84, 84, 84)",
  "grey34": "rgb(87, 87, 87)",
  "grey35": "rgb(89, 89, 89)",
  "grey36": "rgb(92, 92, 92)",
  "grey37": "rgb(94, 94, 94)",
  "grey38": "rgb(97, 97, 97)",
  "grey39": "rgb(99, 99, 99)",
  "grey4": "rgb(10, 10, 10)",
  "grey40": "rgb(102, 102, 102)",
  "grey41": "rgb(105, 105, 105)",
  "grey42": "rgb(107, 107, 107)",
  "grey43": "rgb(110, 110, 110)",
  "grey44": "rgb(112, 112, 112)",
  "grey45": "rgb(115, 115, 115)",
  "grey46": "rgb(117, 117, 117)",
  "grey47": "rgb(120, 120, 120)",
  "grey48": "rgb(122, 122, 122)",
  "grey49": "rgb(125, 125, 125)",
  "grey5": "rgb(13, 13, 13)",
  "grey50": "rgb(127, 127, 127)",
  "grey51": "rgb(130, 130, 130)",
  "grey52": "rgb(133, 133, 133)",
  "grey53": "rgb(135, 135, 135)",
  "grey54": "rgb(138, 138, 138)",
  "grey55": "rgb(140, 140, 140)",
  "grey56": "rgb(143, 143, 143)",
  "grey57": "rgb(145, 145, 145)",
  "grey58": "rgb(148, 148, 148)",
  "grey59": "rgb(150, 150, 150)",
  "grey6": "rgb(15, 15, 15)",
  "grey60": "rgb(153, 153, 153)",
  "grey61": "rgb(156, 156, 156)",
  "grey62": "rgb(158, 158, 158)",
  "grey63": "rgb(161, 161, 161)",
  "grey64": "rgb(163, 163, 163)",
  "grey65": "rgb(166, 166, 166)",
  "grey66": "rgb(168, 168, 168)",
  "grey67": "rgb(171, 171, 171)",
  "grey68": "rgb(173, 173, 173)",
  "grey69": "rgb(176, 176, 176)",
  "grey7": "rgb(18, 18, 18)",
  "grey70": "rgb(179, 179, 179)",
  "grey71": "rgb(181, 181, 181)",
  "grey72": "rgb(184, 184, 184)",
  "grey73": "rgb(186, 186, 186)",
  "grey74": "rgb(189, 189, 189)",
  "grey75": "rgb(191, 191, 191)",
  "grey76": "rgb(194, 194, 194)",
  "grey77": "rgb(196, 196, 196)",
  "grey78": "rgb(199, 199, 199)",
  "grey79": "rgb(201, 201, 201)",
  "grey8": "rgb(20, 20, 20)",
  "grey80": "rgb(204, 204, 204)",
  "grey81": "rgb(207, 207, 207)",
  "grey82": "rgb(209, 209, 209)",
  "grey83": "rgb(212, 212, 212)",
  "grey84": "rgb(214, 214, 214)",
  "grey85": "rgb(217, 217, 217)",
  "grey86": "rgb(219, 219, 219)",
  "grey87": "rgb(222, 222, 222)",
  "grey88": "rgb(224, 224, 224)",
  "grey89": "rgb(227, 227, 227)",
  "grey9": "rgb(23, 23, 23)",
  "grey90": "rgb(229, 229, 229)",
  "grey91": "rgb(232, 232, 232)",
  "grey92": "rgb(235, 235, 235)",
  "grey93": "rgb(237, 237, 237)",
  "grey94": "rgb(240, 240, 240)",
  "grey95": "rgb(242, 242, 242)",
  "grey96": "rgb(245, 245, 245)",
  "grey97": "rgb(247, 247, 247)",
  "grey98": "rgb(250, 250, 250)",
  "grey99": "rgb(252, 252, 252)",
  "honeydew": "rgb(240, 255, 240)",
  "honeydew1": "rgb(240, 255, 240)",
  "honeydew2": "rgb(224, 238, 224)",
  "honeydew3": "rgb(193, 205, 193)",
  "honeydew4": "rgb(131, 139, 131)",
  "hotpink": "rgb(255, 105, 180)",
  "hotpink1": "rgb(255, 110, 180)",
  "hotpink2": "rgb(238, 106, 167)",
  "hotpink3": "rgb(205, 96, 144)",
  "hotpink4": "rgb(139, 58, 98)",
  "indianred": "rgb(205, 92, 92)",
  "indianred1": "rgb(255, 106, 106)",
  "indianred2": "rgb(238, 99, 99)",
  "indianred3": "rgb(205, 85, 85)",
  "indianred4": "rgb(139, 58, 58)",
  "ivory": "rgb(255, 255, 240)",
  "ivory1": "rgb(255, 255, 240)",
  "ivory2": "rgb(238, 238, 224)",
  "ivory3": "rgb(205, 205, 193)",
  "ivory4": "rgb(139, 139, 131)",
  "khaki": "rgb(240, 230, 140)",
  "khaki1": "rgb(255, 246, 143)",
  "khaki2": "rgb(238, 230, 133)",
  "khaki3": "rgb(205, 198, 115)",
  "khaki4": "rgb(139, 134, 78)",
  "lavender": "rgb(230, 230, 250)",
  "lavenderblush": "rgb(255, 240, 245)",
  "lavenderblush1": "rgb(255, 240, 245)",
  "lavenderblush2": "rgb(238, 224, 229)",
  "lavenderblush3": "rgb(205, 193, 197)",
  "lavenderblush4": "rgb(139, 131, 134)",
  "lawngreen": "rgb(124, 252, 0)",
  "lemonchiffon": "rgb(255, 250, 205)",
  "lemonchiffon1": "rgb(255, 250, 205)",
  "lemonchiffon2": "rgb(238, 233, 191)",
  "lemonchiffon3": "rgb(205, 201, 165)",
  "lemonchiffon4": "rgb(139, 137, 112)",
  "lightblue": "rgb(173, 216, 230)",
  "lightblue1": "rgb(191, 239, 255)",
  "lightblue2": "rgb(178, 223, 238)",
  "lightblue3": "rgb(154, 192, 205)",
  "lightblue4": "rgb(104, 131, 139)",
  "lightcoral": "rgb(240, 128, 128)",
  "lightcyan": "rgb(224, 255, 255)",
  "lightcyan1": "rgb(224, 255, 255)",
  "lightcyan2": "rgb(209, 238, 238)",
  "lightcyan3": "rgb(180, 205, 205)",
  "lightcyan4": "rgb(122, 139, 139)",
  "lightgoldenrod": "rgb(238, 221, 130)",
  "lightgoldenrod1": "rgb(255, 236, 139)",
  "lightgoldenrod2": "rgb(238, 220, 130)",
  "lightgoldenrod3": "rgb(205, 190, 112)",
  "lightgoldenrod4": "rgb(139, 129, 76)",
  "lightgoldenrodyellow": "rgb(250, 250, 210)",
  "lightgray": "rgb(211, 211, 211)",
  "lightgreen": "rgb(144, 238, 144)",
  "lightgrey": "rgb(211, 211, 211)",
  "lightpink": "rgb(255, 182, 193)",
  "lightpink1": "rgb(255, 174, 185)",
  "lightpink2": "rgb(238, 162, 173)",
  "lightpink3": "rgb(205, 140, 149)",
  "lightpink4": "rgb(139, 95, 101)",
  "lightsalmon": "rgb(255, 160, 122)",
  "lightsalmon1": "rgb(255, 160, 122)",
  "lightsalmon2": "rgb(238, 149, 114)",
  "lightsalmon3": "rgb(205, 129, 98)",
  "lightsalmon4": "rgb(139, 87, 66)",
  "lightseagreen": "rgb(32, 178, 170)",
  "lightskyblue": "rgb(135, 206, 250)",
  "lightskyblue1": "rgb(176, 226, 255)",
  "lightskyblue2": "rgb(164, 211, 238)",
  "lightskyblue3": "rgb(141, 182, 205)",
  "lightskyblue4": "rgb(96, 123, 139)",
  "lightslateblue": "rgb(132, 112, 255)",
  "lightslategray": "rgb(119, 136, 153)",
  "lightslategrey": "rgb(119, 136, 153)",
  "lightsteelblue": "rgb(176, 196, 222)",
  "lightsteelblue1": "rgb(202, 225, 255)",
  "lightsteelblue2": "rgb(188, 210, 238)",
  "lightsteelblue3": "rgb(162, 181, 205)",
  "lightsteelblue4": "rgb(110, 123, 139)",
  "lightyellow": "rgb(255, 255, 224)",
  "lightyellow1": "rgb(255, 255, 224)",
  "lightyellow2": "rgb(238, 238, 209)",
  "lightyellow3": "rgb(205, 205, 180)",
  "lightyellow4": "rgb(139, 139, 122)",
  "limegreen": "rgb(50, 205, 50)",
  "linen": "rgb(250, 240, 230)",
  "magenta": "rgb(255, 0, 255)",
  "magenta1": "rgb(255, 0, 255)",
  "magenta2": "rgb(238, 0, 238)",
  "magenta3": "rgb(205, 0, 205)",
  "magenta4": "rgb(139, 0, 139)",
  "maroon": "rgb(176, 48, 96)",
  "maroon1": "rgb(255, 52, 179)",
  "maroon2": "rgb(238, 48, 167)",
  "maroon3": "rgb(205, 41, 144)",
  "maroon4": "rgb(139, 28, 98)",
  "mediumaquamarine": "rgb(102, 205, 170)",
  "mediumblue": "rgb(0, 0, 205)",
  "mediumorchid": "rgb(186, 85, 211)",
  "mediumorchid1": "rgb(224, 102, 255)",
  "mediumorchid2": "rgb(209, 95, 238)",
  "mediumorchid3": "rgb(180, 82, 205)",
  "mediumorchid4": "rgb(122, 55, 139)",
  "mediumpurple": "rgb(147, 112, 219)",
  "mediumpurple1": "rgb(171, 130, 255)",
  "mediumpurple2": "rgb(159, 121, 238)",
  "mediumpurple3": "rgb(137, 104, 205)",
  "mediumpurple4": "rgb(93, 71, 139)",
  "mediumseagreen": "rgb(60, 179, 113)",
  "mediumslateblue": "rgb(123, 104, 238)",
  "mediumspringgreen": "rgb(0, 250, 154)",
  "mediumturquoise": "rgb(72, 209, 204)",
  "mediumvioletred": "rgb(199, 21, 133)",
  "midnightblue": "rgb(25, 25, 112)",
  "mintcream": "rgb(245, 255, 250)",
  "mistyrose": "rgb(255, 228, 225)",
  "mistyrose1": "rgb(255, 228, 225)",
  "mistyrose2": "rgb(238, 213, 210)",
  "mistyrose3": "rgb(205, 183, 181)",
  "mistyrose4": "rgb(139, 125, 123)",
  "moccasin": "rgb(255, 228, 181)",
  "navajowhite": "rgb(255, 222, 173)",
  "navajowhite1": "rgb(255, 222, 173)",
  "navajowhite2": "rgb(238, 207, 161)",
  "navajowhite3": "rgb(205, 179, 139)",
  "navajowhite4": "rgb(139, 121, 94)",
  "navy": "rgb(0, 0, 128)",
  "navyblue": "rgb(0, 0, 128)",
  "oldlace": "rgb(253, 245, 230)",
  "olivedrab": "rgb(107, 142, 35)",
  "olivedrab1": "rgb(192, 255, 62)",
  "olivedrab2": "rgb(179, 238, 58)",
  "olivedrab3": "rgb(154, 205, 50)",
  "olivedrab4": "rgb(105, 139, 34)",
  "orange": "rgb(255, 165, 0)",
  "orange1": "rgb(255, 165, 0)",
  "orange2": "rgb(238, 154, 0)",
  "orange3": "rgb(205, 133, 0)",
  "orange4": "rgb(139, 90, 0)",
  "orangered": "rgb(255, 69, 0)",
  "orangered1": "rgb(255, 69, 0)",
  "orangered2": "rgb(238, 64, 0)",
  "orangered3": "rgb(205, 55, 0)",
  "orangered4": "rgb(139, 37, 0)",
  "orchid": "rgb(218, 112, 214)",
  "orchid1": "rgb(255, 131, 250)",
  "orchid2": "rgb(238, 122, 233)",
  "orchid3": "rgb(205, 105, 201)",
  "orchid4": "rgb(139, 71, 137)",
  "palegoldenrod": "rgb(238, 232, 170)",
  "palegreen": "rgb(152, 251, 152)",
  "palegreen1": "rgb(154, 255, 154)",
  "palegreen2": "rgb(144, 238, 144)",
  "palegreen3": "rgb(124, 205, 124)",
  "palegreen4": "rgb(84, 139, 84)",
  "paleturquoise": "rgb(175, 238, 238)",
  "paleturquoise1": "rgb(187, 255, 255)",
  "paleturquoise2": "rgb(174, 238, 238)",
  "paleturquoise3": "rgb(150, 205, 205)",
  "paleturquoise4": "rgb(102, 139, 139)",
  "palevioletred": "rgb(219, 112, 147)",
  "palevioletred1": "rgb(255, 130, 171)",
  "palevioletred2": "rgb(238, 121, 159)",
  "palevioletred3": "rgb(205, 104, 137)",
  "palevioletred4": "rgb(139, 71, 93)",
  "papayawhip": "rgb(255, 239, 213)",
  "peachpuff": "rgb(255, 218, 185)",
  "peachpuff1": "rgb(255, 218, 185)",
  "peachpuff2": "rgb(238, 203, 173)",
  "peachpuff3": "rgb(205, 175, 149)",
  "peachpuff4": "rgb(139, 119, 101)",
  "peru": "rgb(205, 133, 63)",
  "pink": "rgb(255, 192, 203)",
  "pink1": "rgb(255, 181, 197)",
  "pink2": "rgb(238, 169, 184)",
  "pink3": "rgb(205, 145, 158)",
  "pink4": "rgb(139, 99, 108)",
  "plum": "rgb(221, 160, 221)",
  "plum1": "rgb(255, 187, 255)",
  "plum2": "rgb(238, 174, 238)",
  "plum3": "rgb(205, 150, 205)",
  "plum4": "rgb(139, 102, 139)",
  "powderblue": "rgb(176, 224, 230)",
  "purple": "rgb(160, 32, 240)",
  "purple1": "rgb(155, 48, 255)",
  "purple2": "rgb(145, 44, 238)",
  "purple3": "rgb(125, 38, 205)",
  "purple4": "rgb(85, 26, 139)",
  "red": "rgb(255, 0, 0)",
  "red1": "rgb(255, 0, 0)",
  "red2": "rgb(238, 0, 0)",
  "red3": "rgb(205, 0, 0)",
  "red4": "rgb(139, 0, 0)",
  "rosybrown": "rgb(188, 143, 143)",
  "rosybrown1": "rgb(255, 193, 193)",
  "rosybrown2": "rgb(238, 180, 180)",
  "rosybrown3": "rgb(205, 155, 155)",
  "rosybrown4": "rgb(139, 105, 105)",
  "royalblue": "rgb(65, 105, 225)",
  "royalblue1": "rgb(72, 118, 255)",
  "royalblue2": "rgb(67, 110, 238)",
  "royalblue3": "rgb(58, 95, 205)",
  "royalblue4": "rgb(39, 64, 139)",
  "saddlebrown": "rgb(139, 69, 19)",
  "salmon": "rgb(250, 128, 114)",
  "salmon1": "rgb(255, 140, 105)",
  "salmon2": "rgb(238, 130, 98)",
  "salmon3": "rgb(205, 112, 84)",
  "salmon4": "rgb(139, 76, 57)",
  "sandybrown": "rgb(244, 164, 96)",
  "seagreen": "rgb(46, 139, 87)",
  "seagreen1": "rgb(84, 255, 159)",
  "seagreen2": "rgb(78, 238, 148)",
  "seagreen3": "rgb(67, 205, 128)",
  "seagreen4": "rgb(46, 139, 87)",
  "seashell": "rgb(255, 245, 238)",
  "seashell1": "rgb(255, 245, 238)",
  "seashell2": "rgb(238, 229, 222)",
  "seashell3": "rgb(205, 197, 191)",
  "seashell4": "rgb(139, 134, 130)",
  "sienna": "rgb(160, 82, 45)",
  "sienna1": "rgb(255, 130, 71)",
  "sienna2": "rgb(238, 121, 66)",
  "sienna3": "rgb(205, 104, 57)",
  "sienna4": "rgb(139, 71, 38)",
  "skyblue": "rgb(135, 206, 235)",
  "skyblue1": "rgb(135, 206, 255)",
  "skyblue2": "rgb(126, 192, 238)",
  "skyblue3": "rgb(108, 166, 205)",
  "skyblue4": "rgb(74, 112, 139)",
  "slateblue": "rgb(106, 90, 205)",
  "slateblue1": "rgb(131, 111, 255)",
  "slateblue2": "rgb(122, 103, 238)",
  "slateblue3": "rgb(105, 89, 205)",
  "slateblue4": "rgb(71, 60, 139)",
  "slategray": "rgb(112, 128, 144)",
  "slategray1": "rgb(198, 226, 255)",
  "slategray2": "rgb(185, 211, 238)",
  "slategray3": "rgb(159, 182, 205)",
  "slategray4": "rgb(108, 123, 139)",
  "slategrey": "rgb(112, 128, 144)",
  "snow": "rgb(255, 250, 250)",
  "snow1": "rgb(255, 250, 250)",
  "snow2": "rgb(238, 233, 233)",
  "snow3": "rgb(205, 201, 201)",
  "snow4": "rgb(139, 137, 137)",
  "springgreen": "rgb(0, 255, 127)",
  "springgreen1": "rgb(0, 255, 127)",
  "springgreen2": "rgb(0, 238, 118)",
  "springgreen3": "rgb(0, 205, 102)",
  "springgreen4": "rgb(0, 139, 69)",
  "steelblue": "rgb(70, 130, 180)",
  "steelblue1": "rgb(99, 184, 255)",
  "steelblue2": "rgb(92, 172, 238)",
  "steelblue3": "rgb(79, 148, 205)",
  "steelblue4": "rgb(54, 100, 139)",
  "tan": "rgb(210, 180, 140)",
  "tan1": "rgb(255, 165, 79)",
  "tan2": "rgb(238, 154, 73)",
  "tan3": "rgb(205, 133, 63)",
  "tan4": "rgb(139, 90, 43)",
  "thistle": "rgb(216, 191, 216)",
  "thistle1": "rgb(255, 225, 255)",
  "thistle2": "rgb(238, 210, 238)",
  "thistle3": "rgb(205, 181, 205)",
  "thistle4": "rgb(139, 123, 139)",
  "tomato": "rgb(255, 99, 71)",
  "tomato1": "rgb(255, 99, 71)",
  "tomato2": "rgb(238, 92, 66)",
  "tomato3": "rgb(205, 79, 57)",
  "tomato4": "rgb(139, 54, 38)",
  "turquoise": "rgb(64, 224, 208)",
  "turquoise1": "rgb(0, 245, 255)",
  "turquoise2": "rgb(0, 229, 238)",
  "turquoise3": "rgb(0, 197, 205)",
  "turquoise4": "rgb(0, 134, 139)",
  "violet": "rgb(238, 130, 238)",
  "violetred": "rgb(208, 32, 144)",
  "violetred1": "rgb(255, 62, 150)",
  "violetred2": "rgb(238, 58, 140)",
  "violetred3": "rgb(205, 50, 120)",
  "violetred4": "rgb(139, 34, 82)",
  "wheat": "rgb(245, 222, 179)",
  "wheat1": "rgb(255, 231, 186)",
  "wheat2": "rgb(238, 216, 174)",
  "wheat3": "rgb(205, 186, 150)",
  "wheat4": "rgb(139, 126, 102)",
  "white": "rgb(255, 255, 255)",
  "whitesmoke": "rgb(245, 245, 245)",
  "yellow": "rgb(255, 255, 0)",
  "yellow1": "rgb(255, 255, 0)",
  "yellow2": "rgb(238, 238, 0)",
  "yellow3": "rgb(205, 205, 0)",
  "yellow4": "rgb(139, 139, 0)",
  "yellowgreen": "rgb(154, 205, 50)"
};
