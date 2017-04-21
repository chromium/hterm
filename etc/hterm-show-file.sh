#!/bin/sh
# Copyright 2017 The Chromium OS Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

# Write an error message and exit.
# Usage: <message>
die() {
  echo "ERROR: $*"
  exit 1
}

# Send a DCS sequence through tmux.
# Usage: <sequence>
tmux_dcs() {
  printf '\033Ptmux;\033%s\033\\' "$1"
}

# Send a DCS sequence through screen.
# Usage: <sequence>
screen_dcs() {
  printf '\033P\033%s\033\\' "$1"
}

# Send an escape sequence to hterm.
# Usage: <sequence>
print_seq() {
  local seq="$1"

  case ${TERM-} in
  screen*)
    # Since tmux defaults to setting TERM=screen (ugh), we need to detect
    # it here specially.
    if [ -n "${TMUX-}" ]; then
      tmux_dcs "${seq}"
    else
      screen_dcs "${seq}"
    fi
    ;;
  tmux*)
    tmux_dcs "${seq}"
    ;;
  *)
    echo "${seq}"
    ;;
  esac
}

# Base64 encode stdin.
b64enc() {
  base64 | tr -d '\n'
}

# Get the image height/width via imagemagick if possible.
# Usage: <file>
dimensions() {
  identify -format 'width=%wpx;height=%hpx;' "$1" 2>/dev/null
}

# Send the 1337 OSC sequence to display the file.
# Usage: <file>
show() {
  local name="$1"
  local opts="inline=1;$2"

  print_seq "$(printf '\033]1337;File=name=%s;%s%s:%s\a' \
    "$(echo "$(basename "${name}")" | b64enc)" \
    "$(dimensions "${name}")" \
    "${opts}" \
    "$(b64enc <"${name}")")"
}

# Write tool usage and exit.
# Usage: [error message]
usage() {
  if [ $# -gt 0 ]; then
    exec 1>&2
  fi
  cat <<EOF
Usage: hterm-show-file [options] <file> [options]

Send a file to hterm.  It can be shown inline or downloaded.
This can also be used for small file transfers.
EOF

  if [ $# -gt 0 ]; then
    echo
    die "$@"
  else
    exit 0
  fi
}

main() {
  set -e

  while [ $# -gt 0 ]; do
    case $1 in
    -h|--help)
      usage
      ;;
    -*)
      usage "Unknown option: $1"
      ;;
    *)
      break
      ;;
    esac
  done

  if [ $# -eq 0 ]; then
    die "Missing file to send"
  fi
  if [ $# -gt 2 ]; then
    usage "Too many arguments"
  fi

  show "$@"
}
main "$@"
