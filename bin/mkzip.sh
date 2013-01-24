#!/bin/sh
# Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

DIR="$(readlink -f "$(dirname "$0")/..")"
../libdot/bin/mkzip.sh -s "$DIR" -w ~/obj/hterm/ "$@"
