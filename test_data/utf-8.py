#!/usr/bin/env python3
# Copyright 2017 The Chromium OS Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

"""UTF8 dumper for testing terminal output.

You'll need to install the 'wcwidth' module on the system.
"""

import argparse
import sys
import wcwidth


def wcfilter(ch):
    """Return x/X for non-printable characters."""
    width = wcwidth.wcwidth(ch)
    if width == -1:
        return 'x'
    elif width == 0:
        return 'X'
    else:
        return ch


def gen_range(start, end):
    """Return a list of the numbers between |start| and |end|.

    This filters out surrogate pairs.
    """
    return [x for x in range(start, end) if x < 0xd800 or x >= 0xe000]


def print_range(opts):
    """Display all the code points requests by |opts|."""
    codepoints = gen_range(opts.start, opts.end)
    if not codepoints:
        return
    start = codepoints[0]
    codepoints = [wcfilter(chr(x)) for x in codepoints]
    i = 0
    spacer = opts.spacer or ' '
    while i < len(codepoints):
        data = codepoints[i:i + opts.width]
        print('%*x%s' % (opts.pad, i + start, spacer), end='')
        print(opts.spacer.join(data), end='')
        print(opts.spacer)
        i += opts.width


def print_header(opts):
    """Display the header for the codepoints."""
    print('%*s%s' % (opts.pad, '', opts.spacer or ' '), end='')
    i = 4
    width = 4
    if opts.spacer:
        width += 4 * len(opts.spacer) - 1
    while i <= opts.width:
        print('%*s%s' % (width, '+' + ('%x' % (i - 1)), opts.spacer), end='')
        i += 4
    print('')


class IntAction(argparse.Action):
    """Argparse callback to parse int/hex values."""
    def __call__(self, parser, namespace, values, option_string=None):
        setattr(namespace, self.dest, int(values, 0))


def get_parser():
    """Return an argparse parser for the CLI."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('-s', dest='start', default=0, action=IntAction,
                        help='First codepoint to display')
    parser.add_argument('-e', dest='end', default=0x800, action=IntAction,
                        help='Last codepoint to display')
    parser.add_argument('-w', dest='width', default=64, action=IntAction,
                        help='Width of the table')
    parser.add_argument('-p', dest='spacer', default='|',
                        help='Interspace character for table')
    return parser


def main(argv):
    """The main entry point!"""
    parser = get_parser()
    opts = parser.parse_args(argv)
    opts.pad = len('%x' % opts.end)

    print_header(opts)
    print_range(opts)


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
