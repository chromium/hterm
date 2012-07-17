// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

// TODO(davidben): When the string encoding API is implemented,
// replace this with the native in-browser implementation.
//
// http://wiki.whatwg.org/wiki/StringEncoding
// http://dvcs.w3.org/hg/encoding/raw-file/tip/Overview.html

/**
 * A stateful UTF-8 decoder.
 */
lib.UTF8Decoder = function() {
  // The number of bytes left in the current sequence.
  this.bytesLeft = 0;
  // The in-progress code point being decoded, if bytesLeft > 0.
  this.codePoint = 0;
  // The lower bound on the final code point, if bytesLeft > 0.
  this.lowerBound = 0;
};

/**
 * Decodes a some UTF-8 data, taking into account state from previous
 * data streamed through the encoder.
 *
 * @param {String} str data to decode, represented as a JavaScript
 *     String with each code unit representing a byte between 0x00 to
 *     0xFF.
 * @return {String} The data decoded into a JavaScript UTF-16 string.
 */
lib.UTF8Decoder.prototype.decode = function(str) {
  var ret = '';
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (this.bytesLeft == 0) {
      if (c <= 0x7F) {
        ret += str.charAt(i);
      } else if (0xC0 <= c && c <= 0xDF) {
        this.codePoint = c - 0xC0;
        this.bytesLeft = 1;
        this.lowerBound = 0x80;
      } else if (0xE0 <= c && c <= 0xEF) {
        this.codePoint = c - 0xE0;
        this.bytesLeft = 2;
        this.lowerBound = 0x800;
      } else if (0xF0 <= c && c <= 0xF7) {
        this.codePoint = c - 0xF0;
        this.bytesLeft = 3;
        this.lowerBound = 0x10000;
      } else if (0xF8 <= c && c <= 0xFB) {
        this.codePoint = c - 0xF8;
        this.bytesLeft = 4;
        this.lowerBound = 0x200000;
      } else if (0xFC <= c && c <= 0xFD) {
        this.codePoint = c - 0xFC;
        this.bytesLeft = 5;
        this.lowerBound = 0x4000000;
      } else {
        ret += '\ufffd';
      }
    } else {
      if (0x80 <= c && c <= 0xBF) {
        this.bytesLeft--;
        this.codePoint = (this.codePoint << 6) + (c - 0x80);
        if (this.bytesLeft == 0) {
          // Got a full sequence. Check if it's within bounds and
          // filter out surrogate pairs.
          var codePoint = this.codePoint;
          if (codePoint < this.lowerBound
              || (0xD800 <= codePoint && codePoint <= 0xDFFF)
              || codePoint > 0x10FFFF) {
            ret += '\ufffd';
          } else {
            // Encode as UTF-16 in the output.
            if (codePoint < 0x10000) {
              ret += String.fromCharCode(codePoint);
            } else {
              // Surrogate pair.
              codePoint -= 0x10000;
              ret += String.fromCharCode(
                0xD800 + ((codePoint >>> 10) & 0x3FF),
                0xDC00 + (codePoint & 0x3FF));
            }
          }
        }
      } else {
        // Too few bytes in multi-byte sequence. Rewind stream so we
        // don't lose the next byte.
        ret += '\ufffd';
        this.bytesLeft = 0;
        i--;
      }
    }
  }
  return ret;
};

/**
 * Encodes a UTF-16 string into UTF-8.
 *
 * TODO(davidben): Do we need a stateful version of this that can
 * handle a surrogate pair split in two calls? What happens if a
 * keypress event would have contained a character outside the BMP?
 *
 * @param {String} str The string to encode.
 * @return {String} The string encoded as UTF-8, as a JavaScript
 *     string with bytes represented as code units from 0x00 to 0xFF.
 */
lib.encodeUTF8 = function(str) {
  var ret = '';
  for (var i = 0; i < str.length; i++) {
    // Get a unicode code point out of str.
    var c = str.charCodeAt(i);
    if (0xDC00 <= c && c <= 0xDFFF) {
      c = 0xFFFD;
    } else if (0xD800 <= c && c <= 0xDBFF) {
      if (i+1 < str.length) {
        var d = str.charCodeAt(i+1);
        if (0xDC00 <= d && d <= 0xDFFF) {
          // Swallow a surrogate pair.
          c = 0x10000 + ((c & 0x3FF) << 10) + (d & 0x3FF);
          i++;
        } else {
          c = 0xFFFD;
        }
      } else {
        c = 0xFFFD;
      }
    }

    // Encode c in UTF-8.
    var bytesLeft;
    if (c <= 0x7F) {
      ret += str.charAt(i);
      continue;
    } else if (c <= 0x7FF) {
      ret += String.fromCharCode(0xC0 | (c >>> 6));
      bytesLeft = 1;
    } else if (c <= 0xFFFF) {
      ret += String.fromCharCode(0xE0 | (c >>> 12));
      bytesLeft = 2;
    } else /* if (c <= 0x10FFFF) */ {
      ret += String.fromCharCode(0xF0 | (c >>> 18));
      bytesLeft = 3;
    }

    while (bytesLeft > 0) {
      bytesLeft--;
      ret += String.fromCharCode(0x80 | ((c >>> (6 * bytesLeft)) & 0x3F));
    }
  }
  return ret;
};
