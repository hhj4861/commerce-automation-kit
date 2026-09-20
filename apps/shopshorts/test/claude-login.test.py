import importlib.util
import json
import os
from pathlib import Path
import select
import signal
import subprocess
import sys
import tempfile
import unittest
import pyte

sys.dont_write_bytecode = True
BRIDGE = Path(__file__).resolve().parents[1] / 'studio-claude-login.py'
spec = importlib.util.spec_from_file_location('bridge', BRIDGE)
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)
URL = 'https://claude.com/cai/oauth/authorize?state=fixture-state&code_challenge=fixture&code_challenge_method=S256&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback'
TOKEN = 'sk-ant-oat01-' + 'x' * 96


class LoginTest(unittest.TestCase):
    def test_terminal_repaint_preserves_exact_token(self):
        screen = pyte.Screen(4096, 40)
        stream = pyte.Stream(screen)
        frame = '\x1b[2J\x1b[HYour OAuth token:\r\n\r\n' + TOKEN + '\r\n\r\nStore this token securely'
        for char in frame:
            stream.feed(char)
        self.assertEqual(bridge.completed_token('\n'.join(screen.display)), TOKEN)

    def test_partial_api_refresh_or_unanchored_tokens_are_rejected(self):
        self.assertIsNone(bridge.completed_token(TOKEN))
        self.assertIsNone(bridge.completed_token('Your OAuth token:\n' + TOKEN))
        for prefix in ['sk-ant-api03-', 'sk-ant-ort01-']:
            self.assertIsNone(bridge.completed_token('Your OAuth token:\n' + prefix + 'x' * 96 + '\nStore this token securely'))
        self.assertIsNone(bridge.authorization(URL.replace('claude.com/', 'evil.test/', 1)))

    def start(self, folder):
        cli = Path(folder) / 'claude'
        cli.write_text(f'''#!{sys.executable}
import os,sys,time
from pathlib import Path
assert sys.argv[1:]==['setup-token']
assert sys.stdin.isatty() and sys.stdout.isatty()
Path({str(Path(folder) / 'pid')!r}).write_text(str(os.getpid()))
print({URL!r},flush=True)
code=sys.stdin.readline().strip()
assert code=='authcode123#fixture-state'
sys.stdout.write('\\x1b[2J\\x1b[HYour OAuth token:\\r\\n\\r\\n'+{TOKEN!r}+'\\r\\n\\r\\nStore this token securely\\r\\n')
sys.stdout.flush()
time.sleep(30)
''')
        cli.chmod(0o700)
        return subprocess.Popen([sys.executable, str(BRIDGE)], stdin=subprocess.PIPE,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                env={**os.environ, 'PATH': folder + os.pathsep + os.environ['PATH']})

    def event(self, proc):
        self.assertTrue(select.select([proc.stdout], [], [], 5)[0], 'bridge output timeout')
        return json.loads(proc.stdout.readline())

    def test_pty_login_private_protocol_and_child_cleanup(self):
        with tempfile.TemporaryDirectory() as folder:
            proc = self.start(folder)
            try:
                self.assertEqual(self.event(proc), {'type': 'authorization', 'url': URL})
                proc.stdin.write(json.dumps({'code': 'authcode123#fixture-state'}) + '\n')
                proc.stdin.flush()
                self.assertEqual(self.event(proc), {'type': 'credential', 'accessToken': TOKEN})
                out, err = proc.communicate(timeout=5)
                self.assertEqual(proc.returncode, 0)
                self.assertEqual(out + err, '')
                with self.assertRaises(ProcessLookupError):
                    os.kill(int((Path(folder) / 'pid').read_text()), 0)
            finally:
                if proc.poll() is None:
                    proc.terminate()
                    proc.communicate(timeout=5)

    def test_wrong_state_never_reaches_cli(self):
        with tempfile.TemporaryDirectory() as folder:
            proc = self.start(folder)
            try:
                self.event(proc)
                proc.stdin.write(json.dumps({'code': 'authcode123#wrong-state'}) + '\n')
                proc.stdin.flush()
                self.assertEqual(self.event(proc), {'type': 'error', 'code': 'CLAUDE_AUTH_FAILED'})
                out, err = proc.communicate(timeout=5)
                self.assertNotIn(TOKEN, out + err)
            finally:
                if proc.poll() is None:
                    proc.terminate()
                    proc.communicate(timeout=5)

    def test_cancel_terminates_cli_process_group(self):
        with tempfile.TemporaryDirectory() as folder:
            proc = self.start(folder)
            self.event(proc)
            proc.send_signal(signal.SIGTERM)
            proc.communicate(timeout=5)
            with self.assertRaises(ProcessLookupError):
                os.kill(int((Path(folder) / 'pid').read_text()), 0)


if __name__ == '__main__':
    unittest.main()
