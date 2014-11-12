// Copyright (c) 2014 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import cursorShape from 'hterm/struct/cursor_shape';
import keyActions from 'hterm/struct/key_actions';

import RowCol from 'hterm/struct/rowcol';
import Size from 'hterm/struct/size';
import TerminalOptions from 'hterm/struct/terminal_options';

export var struct = {
  cursorShape: cursorShape,
  keyActions: keyActions,
  RowCol: RowCol,
  Size: Size,
  TerminalOptions: TerminalOptions
};

export default struct;
