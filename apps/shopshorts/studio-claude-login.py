"""Private pipe bridge to the unmodified official `claude setup-token` CLI.

No credential files, Keychain commands, OAuth endpoints, or terminal logs.
Only the parent account worker reads stdout; never attach this pipe to a log.
"""
import codecs
import fcntl
import json
import os
import pty
import re
import select
import signal
import struct
import subprocess
import sys
import termios
import time
from urllib.parse import parse_qs, urlsplit


def emit(value):
    print(json.dumps(value), flush=True)


def authorization(screen):
    for match in re.finditer(r'https://[^\s]+', screen):
        url = urlsplit(match.group())
        query = parse_qs(url.query)
        if (url.scheme == 'https' and url.netloc in ('claude.com', 'claude.ai')
                and url.path in ('/cai/oauth/authorize', '/oauth/authorize')
                and query.get('code_challenge_method') == ['S256']
                and query.get('state') and query.get('code_challenge')):
            return match.group(), query['state'][0]
    return None


def completed_token(screen):
    # Read only the completed success section, never a partial stream token.
    for match in re.finditer(r'Your OAuth token[^\n]*\n(.*?)Store this token securely', screen, re.S):
        token = ''.join(line.strip() for line in match[1].splitlines())
        if re.fullmatch(r'sk-ant-oat01-[A-Za-z0-9._~+/-]{64,4096}={0,2}', token):
            return token
    return None


def stop_process(proc):
    try:
        os.killpg(proc.pid, signal.SIGTERM)
        proc.wait(timeout=1)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.wait()
    except ProcessLookupError:
        proc.wait()


def main():
    try:
        import pyte
    except ImportError:
        emit({'type': 'error', 'code': 'CLAUDE_LOGIN_RUNTIME_MISSING'})
        return
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 4096, 0, 0))
    attrs = termios.tcgetattr(slave)
    attrs[3] &= ~termios.ECHO
    termios.tcsetattr(slave, termios.TCSANOW, attrs)
    proc = None
    try:
        proc = subprocess.Popen(['claude', 'setup-token'], stdin=slave, stdout=slave,
                                stderr=slave, start_new_session=True)
        os.close(slave)
        slave = None
        def cancel(_signum, _frame):
            raise InterruptedError()
        signal.signal(signal.SIGTERM, cancel)
        signal.signal(signal.SIGINT, cancel)
        terminal = pyte.Screen(4096, 40)
        stream = pyte.Stream(terminal)
        decoder = codecs.getincrementaldecoder('utf8')(errors='replace')
        state = None
        submitted = False
        received = 0
        deadline = time.monotonic() + 590
        while time.monotonic() < deadline:
            ready, _, _ = select.select([master, sys.stdin], [], [], .2)
            if sys.stdin in ready:
                line = sys.stdin.readline(8192)
                if not line:
                    return
                code = json.loads(line).get('code', '')
                if (submitted or not state or not re.fullmatch(r'[A-Za-z0-9._~+=/-]{8,2048}#[A-Za-z0-9._~-]{8,512}', code)
                        or code.startswith('sk-') or code.split('#')[1] != state):
                    emit({'type': 'error', 'code': 'CLAUDE_AUTH_FAILED'})
                    return
                os.write(master, code.encode())
                time.sleep(.15)  # Ink treats text + Enter in one chunk as paste.
                os.write(master, b'\r')
                submitted = True
            if master not in ready:
                continue
            try:
                data = os.read(master, 65536)
            except OSError:
                break
            if not data:
                break
            received += len(data)
            if received > 2 * 1024 * 1024:
                break
            stream.feed(decoder.decode(data))
            screen = '\n'.join(line.rstrip() for line in terminal.display)
            if not state:
                found = authorization(screen)
                if found:
                    url, state = found
                    emit({'type': 'authorization', 'url': url})
            token = completed_token(screen) if submitted else None
            if token:
                emit({'type': 'credential', 'accessToken': token})
                return
            if submitted and 'OAuth error' in screen:
                emit({'type': 'error', 'code': 'CLAUDE_AUTH_FAILED'})
                return
        emit({'type': 'error', 'code': 'CLAUDE_TIMEOUT' if time.monotonic() >= deadline else 'CLAUDE_LOGIN_FAILED'})
    except InterruptedError:
        pass
    except FileNotFoundError:
        emit({'type': 'error', 'code': 'CLAUDE_NOT_INSTALLED'})
    except Exception:
        emit({'type': 'error', 'code': 'CLAUDE_LOGIN_FAILED'})
    finally:
        if proc is not None:
            stop_process(proc)
        os.close(master)
        if slave is not None:
            os.close(slave)


if __name__ == '__main__':
    main()
