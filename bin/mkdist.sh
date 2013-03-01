#!/bin/bash
# Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

# Re-make the library deliverables in hterm/dist.
#
# The deliverables (things published for use by third parties) are...
#
#  dist/js/hterm_deps.js - Code that hterm depends on from outside of the
#    hterm/ directory.  If you also depend on some or all of these files you
#    may want to make this file yourself.
#
#  dist/js/hterm.js - The hterm code and resources.
#
#  dist/js/hterm_resource.js - Only the resources, used by hterm_test.html.
#
# Most apps will need to include "hterm_deps.js" and "hterm.js" (in that order)
# to make use of hterm.
#

COMMAND_LINE="$(readlink -f $0) $@"

if [ -z "$LIBDOT_SEARCH_PATH" ]; then
  export LIBDOT_SEARCH_PATH="$(readlink -f "$(dirname "$0")/../..")"
fi

cd "$(readlink -f "$(dirname "$0")/..")"
source "../libdot/bin/common.sh"

DEFINE_boolean forever "$FLAGS_FALSE" \
  "Recreate dist/js whenever an input file changes." f

FLAGS "$@" || exit $?
eval set -- "${FLAGS_ARGV}"

function concat() {
  local outdir="$1"
  local concat="../libdot/bin/concat.sh -I "

  insist $concat -i ./concat/hterm_deps.concat -o "$outdir/hterm_deps.js"
  insist $concat -i ./concat/hterm_resources.concat -o \
    "$outdir/hterm_resources.js"
  insist $concat -i ./concat/hterm.concat -o "$outdir/hterm.js"
}

function main() {
  rm -rf ./dist/js/
  mkdir -p ./dist/js/

  local inotify_list
  inotify_list="$(concat "./dist/js")"
  insist

  if [ "$FLAGS_forever" = "$FLAGS_TRUE" ]; then
    inotifywait -qqe modify $0 $inotify_list
    local err=$?
    if [[ $err != 0 && $err != 1 ]]; then
      echo_err "inotify exited with status code: $err"
      exit $err
    fi

    exec $COMMAND_LINE
  fi
}

main
