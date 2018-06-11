#!/bin/bash
# Copyright 2018 The Chromium OS Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

LIBDOT_DIR="$(dirname -- "$0")/../../libdot"
source "${LIBDOT_DIR}/bin/common.sh"

if [[ $# -eq 0 ]]; then
  cd "$(dirname "$0")"/..
  set -- js/*.js
fi

eslint "$@"
exec closure-compiler \
  --checks-only \
  --jscomp_warning=lintChecks \
  --language_in=ECMASCRIPT6_STRICT \
  "$@"
