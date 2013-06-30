#!/bin/sh
# Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

# This script can be used to send an arbitrary string to the terminal clipboard
# using the OSC 52 escape sequence, as specified in
# http://invisible-island.net/xterm/ctlseqs/ctlseqs.html, section "Operating
# System Controls", Ps => 52.
#
# Clipboard data is read from stdin.
#
# Usage:
#
#   $ echo "hello world" | osc52.sh
#


# Max length of the OSC 52 sequence.  Sequences longer than this will not be
# sent to the terminal.
OSC_52_MAX_SEQUENCE="100000"

# This function base64's the entire source as a single blob and wraps it in a
# single OSC 52 sequence.
#
# This is appropriate when running on a raw terminal that supports OSC 52.
function get_osc52() {
  echo -ne "\e]52;c;$(base64 | tr -d '\n')\x07"
}

# This function base64's the entire source, wraps it in a single OSC 52,
# and then breaks the result into small chunks which are each wrapped in a
# DCS sequence.
#
# This is appropriate when running on `screen`.  Screen doesn't support OSC 52,
# but will pass the contents of a DCS sequence to the outer terminal unmolested.
# It imposes a small max length to DCS sequences, so we send in chunks.  Chunks
# is my dog.
function get_osc52_dsc() {
  local b64="$(base64)"
  local first_chunk=''

  for chunk in $b64; do
    if [ -z "$first_chunk" ]; then
      echo -ne "\eP\e]52;c;$chunk"
      first_chunk="1"
    else
      echo -ne "\e\x5c\eP$chunk"
    fi
  done

  echo -ne "\x07\e\\"
}

function main() {
  local str=''

  if [ $(expr "$TERM" : '.*screen') == 0 ]; then
    # Not in screen.
    str="$(get_osc52)"
  else
    str="$(get_osc52_dsc)"
  fi

  local len=${#str}
  if (("$len" < "$OSC_52_MAX_SEQUENCE")); then
    echo -n "$str"
  else
    echo "Selection too long to send to terminal: $len" >&2
  fi
}

main
