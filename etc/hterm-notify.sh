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
  # Screen limits the length of string sequences, so we have to break it up.
  # Going by the screen history:
  #   (v4.2.1) Apr 2014 - today: 768 bytes
  #   Aug 2008 - Apr 2014 (v4.2.0): 512 bytes
  #   ??? - Aug 2008 (v4.0.3): 256 bytes
  # Since v4.2.0 is only ~4 years old, we'll use the 256 limit.
  # We can probably switch to the 768 limit in 2022.
  local limit=256
  # We go 4 bytes under the limit because we're going to insert two bytes
  # before (\eP) and 2 bytes after (\e\) each string.
  echo "$1" | \
    sed -E "s:.{$(( limit - 4 ))}:&\n:g" | \
    sed -E -e 's:^:\x1bP:' -e 's:$:\x1b\\:' | \
    tr -d '\n'
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

# Send a notification.
# Usage: [title] [body]
notify() {
  local title="${1-}" body="${2-}"
  print_seq "$(printf '\033]777;notify;%s;%s\a' "${title}" "${body}")"
}

# Write tool usage and exit.
# Usage: [error message]
usage() {
  if [ $# -gt 0 ]; then
    exec 1>&2
  fi
  cat <<EOF
Usage: hterm-notify [options] <title> [body]

Send a notification to hterm.

Notes:
- The title should not have a semi-colon in it.
- Neither field should have escape sequences in them.
  Best to stick to plain text.
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
    die "Missing message to send"
  fi
  if [ $# -gt 2 ]; then
    usage "Too many arguments"
  fi

  notify "$@"
}
main "$@"
