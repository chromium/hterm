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

# Send a notification running under tmux.
# Usage: [title] [body]
notify_tmux() {
  local title="${1-}" body="${2-}"
  printf '\033Ptmux;\033\033]777;notify;%s;%s\a\033\\' "${title}" "${body}"
}

# Send a notification.
# Usage: [title] [body]
notify() {
  local title="${1-}" body="${2-}"

  case ${TERM-} in
  screen*)
    # Since tmux defaults to setting TERM=screen (ugh), we need to detect
    # it here specially.
    if [ -n "${TMUX-}" ]; then
      notify_tmux "${title}" "${body}"
    else
      printf '\033P\033\033]777;notify;%s;%s\a\033\\' "${title}" "${body}"
    fi
    ;;
  tmux*)
    notify_tmux "${title}" "${body}"
    ;;
  *)
    printf '\033]777;notify;%s;%s\a' "${title}" "${body}"
    ;;
  esac
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
