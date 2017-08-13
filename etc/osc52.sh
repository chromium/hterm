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
get_osc52() {
  printf "%b" "\033]52;c;$(base64 | tr -d '\n')\a\n"
}

# This function base64's the entire source as a single blob and wraps it in a
# single OSC 52 sequence for tmux.
#
# This is for `tmux` sessions which filters OSC 52 locally.
get_osc52_tmux() {
  printf "%b" "\033Ptmux;\033\033]52;c;$(base64 | tr -d '\n')\a\033\\"
}

# This function base64's the entire source, wraps it in a single OSC 52,
# and then breaks the result into small chunks which are each wrapped in a
# DCS sequence.
#
# This is appropriate when running on `screen`.  Screen doesn't support OSC 52,
# but will pass the contents of a DCS sequence to the outer terminal unmolested.
# It imposes a small max length to DCS sequences, so we send in chunks.  Chunks
# is my dog.
get_osc52_dsc() {
  local b64="$(base64)"
  local chunk first_chunk=''

  for chunk in ${b64}; do
    if [ -z "${first_chunk}" ]; then
      printf "%b" "\033P\033]52;c;${chunk}"
      first_chunk="1"
    else
      printf "%b" "\033\0134\033P${chunk}"
    fi
  done

  printf "%b" "\a\033\0134"
}

main() {
  local str=''

  case ${TERM} in
  screen*)
    # Since tmux defaults to setting TERM=screen (ugh), we need to detect
    # it here specially.
    if [ -n "${TMUX-}" ]; then
      str="$(get_osc52_tmux)"
    else
      str="$(get_osc52_dsc)"
    fi
    ;;
  tmux*)
    str="$(get_osc52_tmux)"
    ;;
  *)
    str="$(get_osc52)"
    ;;
  esac

  local len=${#str}
  if [ "${len}" -lt "${OSC_52_MAX_SEQUENCE}" ]; then
    printf '%s' "${str}"
  else
    echo "ERROR: selection too long to send to terminal: ${len}" >&2
    exit 1
  fi
}

main "$@"
