;; Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
;; Use of this source code is governed by a BSD-style license that can be
;; found in the LICENSE file.
;;
;; This script can be loaded during emacs initialization to automatically
;; send `kill-region' and `kill-ring-save' regions to your system clipboard.
;; The OSC 52 terminal escape sequence is used to transfer the selection from
;; emacs to the host terminal.
;;
;; It works in hterm, xterm, and other terminal emulators which support the
;; sequence.
;;
;; As long as the outer terminal supports OSC 52, this will also works under
;; screen via `osc52-select-text-dcs', and tmux via `osc52-select-text-tmux'.
;;

(defcustom osc52-max-sequence 100000
  "Maximum length of the OSC 52 sequence.

The OSC 52 sequence requires a terminator byte.  Some terminals will ignore or
mistreat a terminated sequence that is longer than a certain size, usually to
protect users from runaway sequences.

This variable allows you to tweak the maximum number of bytes that will be sent
using the OSC 52 sequence.

If you select a region larger than this size, it won't be copied to your system
clipboard.  Since clipboard data is base 64 encoded, the actual number of
characters that can be copied is 1/3 of this value.")

(defun osc52-select-text (string &optional replace yank-handler)
  "Copy STRING to the system clipboard using the OSC 52 escape sequence.

Set `interprogram-cut-function' to this when using a compatible terminal, and
your system clipboard will be updated whenever you copy a region of text in
emacs.

If the resulting OSC 52 sequence would be longer than
`osc52-max-sequence', then the STRING is not sent to the system
clipboard.

This function sends a raw OSC 52 sequence and will work on a bare terminal
emulators.  It does not work on screen or tmux terminals, since they don't
natively support OSC 52."
  (let ((b64-length (+ (* (length string) 3) 2)))
    (if (<= b64-length osc52-max-sequence)
        (send-string-to-terminal
         (concat "\e]52;c;"
                 (base64-encode-string string t)
                 "\07"))
        (message "Selection too long to send to terminal %d" b64-length)
        (sit-for 2))))

(defun osc52-select-text-dcs (string &optional replace yank-handler)
  "Copy STRING to the system clipboard using the OSC 52 escape sequence, for
screen users.

Set `interprogram-cut-function' to this when using the screen program, and your
system clipboard will be updated whenever you copy a region of text in emacs.

If the resulting OSC 52 sequence would be longer than
`osc52-max-sequence', then the STRING is not sent to the system
clipboard.

This function wraps the OSC 52 in a Device Control String sequence.  This causes
screen to pass the wrapped OSC 52 sequence along to the host termianl.  This
function also chops long DCS sequences into multiple smaller ones to avoid
hitting screen's max DCS length."
  (let ((b64-length (+ (* (length string) 3) 2)))
    (if (<= b64-length osc52-max-sequence)
        (send-string-to-terminal
         (concat "\eP\e]52;c;"
                 (replace-regexp-in-string "\n" "\e\\\\\eP"
                                           (base64-encode-string string))
                 "\07\e\\"))
        (message "Selection too long to send to terminal %d" b64-length)
        (sit-for 2))))

(defun osc52-select-text-tmux (string &optional replace yank-handler)
  "Copy STRING to the system clipboard using the OSC 52 escape sequence, for
tmux users.

Set `interprogram-cut-function' to this when using the tmux program, and your
system clipboard will be updated whenever you copy a region of text in emacs.

If the resulting OSC 52 sequence would be longer than
`osc52-max-sequence', then the STRING is not sent to the system
clipboard.

This function wraps the OSC 52 in a Device Control String sequence.  This
causes tmux to pass the wrapped OSC 52 sequence along to the host terminal."
  (let ((b64-length (+ (* (length string) 3) 2)))
    (if (<= b64-length osc52-max-sequence)
        (send-string-to-terminal
         (concat "\ePtmux;\e\e]52;c;"
                 (replace-regexp-in-string "\n" ""
                                           (base64-encode-string string))
                 "\07\e\\"))
      (message "Selection too long to send to terminal %d" b64-length)
      (set-for 2))))

(defun osc52-set-cut-function ()
  "Initialize the `interprogram-cut-function' based on the value of
`window-system' and the TERM environment variable."
  (if (not window-system)
      (setq interprogram-cut-function
            (cond ((not (null (getenv "STY"))) 'osc52-select-text-dcs)
                  ((not (null (getenv "TMUX"))) 'osc52-select-text-tmux)
                  (t 'osc52-select-text)))))
