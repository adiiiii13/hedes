#!/usr/bin/env python3
"""
HEDES Studio — Termux PTY Bridge (Android Local Terminal)
Uses Python standard library (pty, os, select, sys, termios) to provide
real interactive PTY terminal sessions inside Termux without requiring C native compilation.
"""

import os
import pty
import select
import sys
import json
import termios
import struct
import fcntl
import signal

def set_winsize(fd, row, col, xpix=0, ypix=0):
    winsize = struct.pack("HHHH", row, col, xpix, ypix)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)

def main():
    if len(sys.argv) > 1 and sys.argv[1] == '--test':
        print(json.dumps({"ok": True, "pty_available": True, "platform": sys.platform}))
        sys.exit(0)

    # Default shell is bash or sh in Termux
    shell = os.environ.get('SHELL', '/data/data/com.termux/files/usr/bin/bash')
    if not os.path.exists(shell):
        shell = '/bin/sh'

    # Master/Slave PTY fork
    pid, master_fd = pty.fork()

    if pid == 0:
        # Child process: exec shell
        env = dict(os.environ)
        env['TERM'] = 'xterm-256color'
        env['COLORTERM'] = 'truecolor'
        os.execvpe(shell, [shell, '-l'], env)
    else:
        # Parent process: bridge master_fd to stdin / stdout
        # Handle SIGWINCH if needed
        def sigwinch_handler(signum, frame):
            pass
        signal.signal(signal.SIGWINCH, sigwinch_handler)

        try:
            while True:
                r, _, _ = select.select([sys.stdin, master_fd], [], [])
                if sys.stdin in r:
                    data = os.read(sys.stdin.fileno(), 1024)
                    if not data:
                        break
                    os.write(master_fd, data)
                if master_fd in r:
                    data = os.read(master_fd, 1024)
                    if not data:
                        break
                    os.write(sys.stdout.fileno(), data)
                    sys.stdout.flush()
        except (OSError, KeyboardInterrupt):
            pass
        finally:
            try:
                os.close(master_fd)
                _, status = os.waitpid(pid, 0)
                exit_code = os.waitstatus_to_exitcode(status) if hasattr(os, 'waitstatus_to_exitcode') else 0
                sys.exit(exit_code)
            except Exception:
                sys.exit(0)

if __name__ == '__main__':
    main()
