#!/bin/sh
# Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

# See <http://code.google.com/p/shflags/>.
source "$(dirname $0)/shflags"

DEFINE_string channel '' \
  "Manifest variant to select.  You should have a manifest-CHANNEL.json file \
in the extension directory." c
DEFINE_string extension_dir "$(pwd)" \
  "Directory containing the extension to pack." e
DEFINE_string keyfile '' \
  "Path to private key.  Required for crx files, ignored for zip." k
DEFINE_string shipdir '' \
  "Path to ship to.  Optional for crx files, ignored for zip." s
DEFINE_string type '' \
  "Type of package to create.  Either zip or crx." t
DEFINE_string workdir "$(pwd)/.." \
  "Work directory.  Zip and/or crx files will be created here." o

FLAGS "$@" || exit $?
eval set -- "${FLAGS_ARGV}"

# If we change the manifest, the original target is saved here so we can
# restore it later.
ORIGINAL_MANIFEST_TARGET=""

# Whitelist of files to be included in the zip file.
EXTENSION_FILES="    \
  manifest.json      \
  audio/*.ogg        \
  css/*.css          \
  html/*.html        \
  images/*.png       \
  js/*.js            \
  _locales/**/*.json \
  plugin/*           \
  plugin/**/*"

#
# Echo all arguments to stderr.
#
function echo_err() {
  echo "-*- $@" 1>&2
}

#
# Read a value from a manifest.json file.
#
#   get_key_value <key> <manifest_file>
#
# This only works on manifest files that have one key per line.
#
function get_key_value() {
  local key="$1"
  local file="$2"
  local line="$(grep "\"$key\":" "$file")"
  echo "$(expr match "$line" '.*\":\s*\"\([^\"]*\)')"
}

#
# Echo "1" if a string starts with the given substring, "0" otherwise.
#
#   starts_with <str> <substr>
#
function starts_with() {
  local str="$1"
  local substr="$2"

  if [ "${str:0:${#substr}}" == "$substr" ]; then
    echo "1"
  fi

  echo "0"
}

#
# Take "abcdefgh" and return it as "ghefcdab"
#
function byte_swap() {
  echo "${1:6:2}${1:4:2}${1:2:2}${1:0:2}"
}

#
# Compute a relative path for a given absolute path.
#
#   get_relative_path <source_dir> [<pwd>]
#
# If <pwd> is not provided, the return value will be relative to the present
# working directory.
#
function get_relative_path() {
  local source_dir="$(readlink -fm "$1")"
  local pwd="$2"

  if [ -z "$pwd" ]; then
    local pwd="$(readlink -f $(pwd))/"
  fi

  # First whittle the source_dir down to the point where it only contains
  # directories that it shares with pwd.
  local common_dirs="$source_dir"

  while [[ "$common_dirs" != "/" && \
    "$(starts_with "$pwd" "$common_dirs/")" == "0" ]]; do
    common_dirs="$(readlink -fm $common_dirs/..)"
  done

  if [ "$common_dirs" == "/" ]; then
    # If the only shared directory is "/", then just return the source
    # directory.
    echo "$source_dir"
    return
  fi

  # Return value starts with everything after the common directories.
  local rv="${source_dir:$((${#common_dirs} + 1))}"

  # Then prepend a "../" for every directory that we have to backtrack from
  # pwd to get to the common directory.
  local uncommon_dirs="${pwd:${#common_dirs}}"
  while [[ "$uncommon_dirs" != "." && "$uncommon_dirs" != "/" ]]; do
    rv="../$rv"
    uncommon_dirs="$(dirname $uncommon_dirs)"
  done

  echo "$rv"
}

#
# Replace the manifest.json symlink if we changed it.
#
function restore_manifest() {
  local extension_dir="$1"

  if [ ! -z "$ORIGINAL_MANIFEST_TARGET" ]; then
    echo_err "Restoring manifest: $(basename $ORIGINAL_MANIFEST_TARGET)"
    ln -sf "$ORIGINAL_MANIFEST_TARGET" "$extension_dir/manifest.json"
  fi
}

#
# Symlink a manifest variant to manifest.json.
#
# switch_manifest <extension_dir> <channel>
#
function switch_manifest() {
  local extension_dir="$1"
  local channel="$2"

  echo_err "Switching manifest: manifest-$channel.json"

  if [ -e "$extension_dir/manifest.json" -a \
    ! -L "$extension_dir/manifest.json" ]; then
    echo_err "Your manifest.json file exists and is not a symlink."
    exit 1
  fi

  ORIGINAL_MANIFEST_TARGET="$(readlink $extension_dir/manifest.json)"

  ln -sf "$extension_dir/manifest-$channel.json" "$extension_dir/manifest.json"
}

#
# Make a zip file for the given extension directory.
#
# extension_to_zip <extension_dir> <target_zip>
#
function extension_to_zip() {
  local extension_dir="$1"
  local target_zip="$2"

  if [ -e "$target_zip" ]; then
    echo_err "Target zip exists: $(get_relative_path "$target_zip")"
    exit 1
  fi

  echo_err "Creating zip file: $(get_relative_path $target_zip)"
  echo_err "Before compression:" \
    "$(zip -sf $target_zip $EXTENSION_FILES | tail -1)"

  zip -q $target_zip $EXTENSION_FILES 1>&2

  echo_err "After compression: $(du -h "$target_zip" | cut -f1)"
}

#
# Turn a zip + private key into a crx file.
#
#   zip_to_crx <source_zip> <key_file> <target_crx>
#
# See http://code.google.com/chrome/extensions/crx.html
#
function zip_to_crx() {
  local source_zip="$1"
  local key_file="$2"
  local target_crx="$3"

  echo_err "Creating crx file: $(get_relative_path "$target_crx")"

  local pub_len="$(openssl rsa -pubout -outform DER 2>/dev/null < \
      "$key_file" | wc -c)"
  local pub_len_hex=$(byte_swap $(printf '%08x\n' "$pub_len"))

  local sig_len="$(openssl sha1 -sha1 -binary -sign "$key_file" < \
      "$source_zip" | wc -c)"
  local sig_len_hex=$(byte_swap $(printf '%08x\n' "$sig_len"))

  local crmagic_hex="4372 3234" # Cr24
  local version_hex="0200 0000" # 2

  ( echo "$crmagic_hex $version_hex $pub_len_hex $sig_len_hex" | xxd -r -p
    openssl rsa -pubout -outform DER 2>/dev/null < "$key_file"
    openssl sha1 -sha1 -binary -sign "$key_file" < "$source_zip"
    cat "$source_zip"
  ) > "$target_crx"
}

#
# Copy a crx file to a target directory, make it world readable, and update
# the updates.xml file.
#
#   ship_crx <extension_dir> <source_crx> <target_dir>
#
# If this function finds an 'updates.xml.t' file in the target directory it
# will be used as a template to create a new 'updates.xml' file.  The template
# can refer to the current version as '$VERSION', and the current crx file
# as '$CRX_FILE'.
#
function ship_crx() {
  local extension_dir="$1"
  local source_crx="$2"
  local target_dir="$3"

  local basename_crx="$(basename "$source_crx")"

  echo_err "Shipping crx: $target_dir/$basename_crx"

  cp "$source_crx" "$target_dir"
  chmod a+r "$target_dir/$basename_crx"

  if [ -f "$target_dir/updates.xml.t" ]; then
    echo_err "Editing updates file: $target_dir/updates.xml"
    sed -e "s/\$CRX_FILE/$basename_crx/" -e "s/\$VERSION/$version/" \
      < "$target_dir/updates.xml.t" > "$target_dir/updates.xml"
    chmod a+r "$target_dir/updates.xml"
  fi

  local current="$(\
      get_key_value 'name' "$extension_dir/manifest.json")-current.crx"

  if [ -L "$target_dir/$current" ]; then
    echo_err "Updating symlink: $target_dir/$current"
    ln -sf "$basename_crx" "$target_dir/$current"
  fi
}

#
# Create a crx of the extension.
#
#   package_crx <extension_dir> <key_file> <output_dir>
#
# The crx file name will be based on the name and version of the extension as
# read from the manifest file.
#
# Echos the crx file name on success.
#
function package_crx() {
  local extension_dir="$1"
  local key_file="$2"
  local output_dir="$3"

  local version=$(get_key_value "version" "$extension_dir/manifest.json")
  local name=$(get_key_value "name" "$extension_dir/manifest.json")

  local target_zip="$output_dir/$name-$version.zip"
  extension_to_zip "$extension_dir" "$target_zip"
  if [ ! -s "$target_zip" ]; then
    return
  fi

  local target_crx="$output_dir/$name-$version.crx"
  zip_to_crx "$target_zip" "$key_file" "$target_crx"

  echo "$target_crx"
}

#
# Create a zip of the extension.
#
#   package_zip <extension_dir> <output_dir>
#
# The zip file name will be based on the name and version of the extension as
# read from the manifest file.
#
# Echos the zip file name on success.
#
function package_zip() {
  local extension_dir="$1"
  local output_dir="$2"

  local version=$(get_key_value "version" "$extension_dir/manifest.json")
  local name=$(get_key_value "name" "$extension_dir/manifest.json")

  local target_zip="$output_dir/$name-$version.zip"
  extension_to_zip "$extension_dir" "$target_zip"

  echo "$target_zip"
}

#
# Main.
#
function main() {
  local extension_dir="$FLAGS_extension_dir"
  local work_dir="$FLAGS_workdir"

  if [ "$FLAGS_type" == "crx" ]; then
    if [ -z "$FLAGS_keyfile" ]; then
      echo_err "Missing --keyfile."
      exit 1
    fi
  elif [ "$FLAGS_type" != "zip" ]; then
    echo_err "Missing or invalid --type."
    exit 1
  fi

  if [ ! -z "$FLAGS_channel" ]; then
    switch_manifest "$extension_dir" "$FLAGS_channel"
  fi

  local outfile=""

  if [ "$FLAGS_type" == "zip" ]; then
    outfile="$(package_zip "$extension_dir" "$work_dir")"
  else
    outfile="$(package_crx "$extension_dir" "$FLAGS_keyfile" "$work_dir")"
  fi

  restore_manifest "$extension_dir"

  if [[ -z "$outfile" || ! -s "$outfile" ]]; then
    echo_err "Error creating package."
    exit 1
  fi

  if [[ "$FLAGS_type" == "crx" && ! -z "$FLAGS_shipdir" ]]; then
    ship_crx "$extension_dir" "$outfile" "$FLAGS_shipdir"
  fi
}

main
