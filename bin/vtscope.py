#!/usr/bin/python

# Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

import atexit
import json
import os
import re
import readline
import select
import socket
import sys

HISTFILE = os.path.expanduser('~/.vtscope_history')
LISTEN_HOST = '127.0.0.1'
LISTEN_PORT = 8383
PROMPT = 'vtscope> '
MAX_TEXT = 15

class VTScope(object):
  """VT Scope is a debugging aid for developers of terminal emulators.

  VT Scope provides an interactive shell which can load a pre-recorded terminal
  session and play it back to one or more clients in a controlled manner.

  It is possible to play through to a particular offset in the input or play
  until a given number of escape sequences have been encountered.

  The next escape sequence is displayed in VT Scope before it is sent to
  the target terminal(s), so that you know what's going to be printed before
  it happens.

  You can connect multiple destination terminals to the scope, in order to
  A/B test a known-good terminal with one under development.  Clients connect
  over a TCP socket to port 8383.  VT Scope only listens on the local
  127.0.0.1 interface.

  Canned VT sessions can be created with the 'script.py' command that comes
  with the pexpect Python package.

  Sample usage looks like this:

      # Open a can of data...
      vtscope> open ../test_data/vttest-01.log
      Read 16723 bytes from ../test_data/vttest-01.log.

      # When the next chunk of data is plain text, the offset, byte count,
      # and first 15 bytes are displayed...
      Next up: offset 0, 19 chars: "# 20120103.1540..."

      # Wait for two clients...
      vtscope> accept 2
      Listening on 127.0.0.1:8383
      Waiting for client 1/2...

      # At this point, open an xterm and type 'nc 127.0.0.1 8383', then open
      # hterm and do the same.
      Remote connected by ('127.0.0.1', 49464)
      Waiting for client 2/2...
      Remote connected by ('127.0.0.1', 49465)

      # Single step through the data...
      vtscope> step

      # When the next chunk of data is an escape sequence, it is displayed
      # with added spaces to make it easier to read.
      Next up: offset 19, ESC [ 0 c

      # Press ENTER to repeat the previous command.
      vtscope>
      Next up: offset 23, ESC [ ? 1 l

      # Step through multiple escape sequences at a time
      vtscope> step 10
      Next up: offset 28, ESC [ ? 3 l
      ...
      Next up: offset 73, ESC [ 0 m

      # Start from the beginning of the data...
      vtscope> reset
      Next up: offset 0, 19 chars: "# 20120103.1540..."

      # Seek directly to an offset, reset first if necessary...
      vtscope> seek 73
      Next up: offset 19, ESC [ 0 c
      ...
      Next up: offset 73, ESC [ 0 m

      # Exit vtscope.  Pressing Ctrl-D on a blank line works too.
      vtscope> exit
  """

  # The list of connected terminals.
  clients = []

  # True if we're running the REPL.
  running = False

  # The canned data.
  data = ''

  # The current start/end position in the data.  The characters between these
  # two positions are next up to be sent to the clients.
  start_position = 0
  end_position = 0

  # Patterns for escape sequences we expect to see in the data.
  re_escapes = {
      'vt100': re.compile(r'\[\??([0-9\b\s]*(;[0-9\b\s]+)*)?[\x3A-\x7E]'),
      'vt52': re.compile(r'(Y[\x20-0x7e]|[\x30-\x5A])'),
      'dec': re.compile(r'#\d'),
      'graphic': re.compile(r'\([012AB]'),
  }

  def run(self):
    """Start the VTScope REPL."""

    # Pressing ENTER on a blank line re-executes the previous command.
    last_command_line = ''

    self.running = True

    while self.running:
      try:
        command_line = raw_input(PROMPT)
      except EOFError:
        self.running = False
        print 'exit'
        return

      if not command_line:
        command_line = last_command_line

      self.dispatch_command(command_line)

      last_command_line = command_line

  def find_next_chunk(self):
    """Advance start_position and end_position to the next chunk in the
    canned data.
    """

    self.start_position = self.end_position

    if self.start_position >= len(self.data):
      return ''

    if self.data[self.start_position] == '\x1b':
      m = None
      for pattern in self.re_escapes.values():
        m = pattern.match(self.data, self.start_position + 1)
        if m:
          break

      if m:
        self.end_position = m.end()
      else:
        self.end_position = self.start_position + MAX_TEXT
        print 'Unable to find end of escape sequence.'

      sequence = self.data[self.start_position + 1 : self.end_position]
      return json.dumps('ESC ' + ' '.join(sequence))[1:-1]

    else:
      self.end_position = self.data.find('\x1b', self.start_position)
      if self.end_position == -1:
        self.end_position = len(self.data)

      plaintext = self.data[self.start_position : self.end_position]
      if len(plaintext) > MAX_TEXT:
        plaintext = plaintext[0:MAX_TEXT] + '...'

      return '%s chars: %s' % \
          (self.end_position - self.start_position, json.dumps(plaintext))

  def show_next_chunk(self):
    """Find the next chunk of data, and display it to the user."""

    snippet = self.find_next_chunk()

    if snippet:
      print 'Next up: offset %s, %s' % (self.start_position, snippet)
    else:
      print 'End of data.'

  def broadcast_chunk(self):
    """Broadcast the current chunk of data to the connected clients."""

    for fd in self.clients:
      fd.send(self.data[self.start_position : self.end_position])

  def dispatch_command(self, command_line):
    """Dispatch a command line to an appropriate cmd_* method."""

    command_args = command_line.split(' ')
    command_name = command_args[0]
    command_args = command_args[1:]
    if not command_name:
        return

    command_function = getattr(self, 'cmd_' + command_name, None)
    if not command_function:
      print 'Unknown command: "%s"' % command_name
      return

    if False:
      try:
        command_function(command_args)
      except Exception as ex:
        print 'Error executing %s: %s: %s' % \
            (command_name, type(ex), ex)
    else:
      command_function(command_args)

    return

  # Commands start here, in alphabetical order.

  def cmd_accept(self, args):
    """Wait for one or more clients to connect.

    Usage: accept [<client-count>]

    Clients can connect using the the 'nc' (aka netcat) command, with...

        $ nc 127.0.0.1 8383
    """

    count = int(args[0])

    print 'Listening on %s:%s' % (LISTEN_HOST, LISTEN_PORT)
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((LISTEN_HOST, LISTEN_PORT))
    sock.listen(1)

    self.clients = []

    while len(self.clients) < count:
      print 'Waiting for client %s/%s...' % (len(self.clients) + 1, count)
      (fd, addr) = sock.accept()
      self.clients.append(fd)
      print 'Remote connected by', addr

    sock.close()

  def cmd_exit(self, args):
    self.running = False

  def cmd_open(self, args):
    """Open a local file containing canned data.

    Usage: open <local-path>
    """

    filename = args[0]
    self.position = 0

    with open(filename) as f:
      self.data = f.read()

    print 'Read %s bytes from %s.' % (len(self.data), filename)
    self.cmd_reset([])

  def cmd_reset(self, args):
    """Reset the current position in the canned data and display the first
    chunk.

    Usage: reset
    """
    self.start_position = 0
    self.end_position = 0
    self.show_next_chunk()

  def cmd_seek(self, args):
    """Seek to a given position in the canned data.

    If the position comes before the current position, call cmd_reset() first.
    """

    pos = int(args[0])

    if pos > len(self.data):
      print 'Seek past end.'
      return

    if pos <= self.start_position:
      self.cmd_reset([])

    while self.end_position <= pos:
      self.broadcast_chunk()
      self.show_next_chunk()

  def cmd_step(self, args):
    """Step over a given number of escape sequences, or 1 if not specified.

    Usage: step [<count>]
    """

    if self.start_position >= len(self.data):
      print 'Already at end of data.'
      return

    if len(args) > 0:
      count = int(args[0])
    else:
      count = 1

    while count:
      self.broadcast_chunk()
      self.show_next_chunk()

      if self.start_position >= len(self.data):
        return

      count -= 1

if __name__ == '__main__':
  try:
    readline.read_history_file(HISTFILE)
  except IOError:
    pass

  atexit.register(lambda: readline.write_history_file(HISTFILE))

  vtscope = VTScope()
  vtscope.run()
