#!/bin/bash
# Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

LIBDOT_DIR="$(dirname -- "$0")/../../libdot"
source "${LIBDOT_DIR}/bin/common.sh"

cd "${BIN_DIR}/.."

if [ -z "${DISPLAY}" ]; then
  export DISPLAY="0.0"
fi

if [ -z "$CHROME_TEST_PROFILE" ]; then
  CHROME_TEST_PROFILE=$HOME/.config/google-chrome-run_local
fi

mkdir -p "${CHROME_TEST_PROFILE}"

./bin/mkdist.sh

# Chrome goes by many names.  We know them all!
find_chrome() {
  local bin
  for bin in google-chrome google-chrome-{stable,beta,unstable,trunk}; do
    if which ${bin} 2>/dev/null; then
      return
    fi
  done
}

if [ -z "${CHROME_BIN}" ]; then
  CHROME_BIN=$(find_chrome)
  if [ -z "${CHROME_BIN}" ]; then
    echo "error: could not find google-chrome; please set CHROME_BIN" >&2
    exit 1
  fi
  echo "Running tests against ${CHROME_BIN}; set CHROME_BIN to use a diff browser"
fi

# We quote CHROME_BIN because it might contain spaces.  On macOS or Windows,
# this can be common with names like "Google Chrome".  It means it doesn't
# allow people to pass flags, but we can figure that out when/if anyone makes
# such a request.
"${CHROME_BIN}" \
  "file:///$(pwd)/html/hterm_test.html" \
  --allow-file-access-from-files \
  --unlimited-quota-for-files \
  --user-data-dir="${CHROME_TEST_PROFILE}" \
  &>/dev/null </dev/null &
