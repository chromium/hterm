#!/bin/bash
# Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

# Used by hterm/concat/hterm_resources.concat to extract the topmost version
# number and release date from the changelog.

cd "$(readlink -f "$(dirname "$0")/..")"

if [ "$1" = "version" ]; then
  head -n1 doc/changelog.txt | cut -f1 -d',' | sed -e 's/ //g'
elif [ "$1" = "date" ]; then
  head -n1 doc/changelog.txt | cut -f2 -d',' | sed -e 's/ //g'
else
  head -n1 doc/changelog.txt
fi
