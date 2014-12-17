#!/bin/bash

if [ "$(basename $(readlink -f $(dirname "$0")/..))" != "hterm" ]; then
  echo "Your hterm repository directory MUST be called 'hterm' for this script"
  echo "to work."
  exit
fi

cd "$(dirname "$0")/../.."
mkdir -p hterm/tar
tar -czf hterm/tar/hterm.tar.gz hterm/package.json hterm/dist/amd hterm/dist/cjs
tar -tzf hterm/tar/hterm.tar.gz
