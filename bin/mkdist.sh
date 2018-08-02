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
#  dist/js/hterm_all.js - hterm_deps.js + hterm.js.  Most apps can just use
#    this.
#

LIBDOT_DIR="$(dirname -- "$0")/../../libdot"
source "${LIBDOT_DIR}/bin/common.sh"

cd "${BIN_DIR}/.."

function do_concat() {
  local outdir="$1"
  local concat=( concat )

  insist "${concat[@]}" -i ./concat/hterm_deps.concat -o "$outdir/hterm_deps.js"
  insist "${concat[@]}" -i ./concat/hterm_resources.concat -o \
    "$outdir/hterm_resources.js"
  insist "${concat[@]}" -i ./concat/hterm.concat -o "$outdir/hterm.js"

  cat "$outdir/hterm_deps.js" "$outdir/hterm_resources.js" \
    "$outdir/hterm.js" > "$outdir/hterm_all.js"
}

function main() {
  rm -rf ./dist/js/
  mkdir -p ./dist/js/
  do_concat "./dist/js"
}

main "$@"
