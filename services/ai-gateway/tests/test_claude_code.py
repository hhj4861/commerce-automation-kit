import asyncio
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

from cryptography.fernet import Fernet
from fastapi import HTTPException
import httpx
from account_service import Accounts, create_app, public_record
from claude_code import connect, chat, login_url

STATE = 's' * 43
URL = 'https://claude.com/cai/oauth/authorize?redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&response_type=code&code_challenge_method=S256&state=' + STATE
CODE = 'one-time-test-authorization#' + STATE


class NativeStorage(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.store = Accounts(self.root / 'db', Fernet.generate_key().decode(), str(self.root / 'profiles'))
        self.scope = ('festa', 'a' * 64)
        self.id = self.store.create(self.scope, 'claude', {'kind': 'claude-code'}, 60)['id']
        self.store.update(self.id, challenge={'kind': 'code-entry', 'url': URL, 'code': '', 'expiresAt': time.time() + 900})

    def test_scoped_one_time_code_is_encrypted_and_never_public(self):
        with self.assertRaises(HTTPException):
            self.store.submit_code(self.id, ('festa', 'b' * 64), CODE)
        with self.assertRaises(HTTPException):
            self.store.submit_code(self.id, self.scope, CODE.replace(STATE, 'x' * 43))
        for token in ['sk-ant-oat01-' + 'x' * 70, 'sk-ant-api' + 'a' * 30]:
            with self.assertRaises(HTTPException):
                self.store.submit_code(self.id, self.scope, token)
        self.store.submit_code(self.id, self.scope, CODE)
        record = public_record(self.store, self.store.get(self.id), {})
        self.assertTrue(record['challenge']['submitted'])
        self.assertNotIn(CODE, json.dumps(record))
        self.assertNotIn(CODE.encode(), (self.store.root / 'accounts.sqlite3').read_bytes())
        self.assertEqual(self.store.take_code(self.id), CODE)
        self.assertIsNone(self.store.take_code(self.id))
        with self.assertRaises(HTTPException):
            self.store.submit_code(self.id, self.scope, CODE)

    def test_expiry_erases_native_profile_and_rejects_code(self):
        directory = self.root / 'profiles' / self.id
        directory.mkdir(parents=True)
        (directory / 'fixture').write_text('private')
        with patch('account_service.time.time', return_value=9999999999):
            self.assertEqual(self.store.get(self.id)['state'], 'expired')
            self.assertFalse(directory.exists())
            with self.assertRaises(HTTPException):
                self.store.submit_code(self.id, self.scope, CODE)

    def test_url_origin_redirect_and_state_are_pinned(self):
        self.assertEqual(login_url(URL), URL)
        for value in [URL.replace('https://claude.com', 'https://evil.test'), URL + '#fragment', URL.replace('platform.claude.com', 'evil.test'), URL.replace('S256', 'plain')]:
            with self.assertRaises(ValueError):
                login_url(value)

    def test_native_subprocess_login_and_structured_generation(self):
        # Exercise real stdin/stdout and CLI-managed profile, no provider requests.
        binary = self.root / 'fixture-cli'
        binary.write_text('#!' + sys.executable + '\n' + '''import sys,os,json,pathlib
p=pathlib.Path(os.environ['CLAUDE_CONFIG_DIR'])
assert 'ANTHROPIC_API_KEY' not in os.environ
assert 'CLAUDE_CODE_OAUTH_TOKEN' not in os.environ
assert 'ACCOUNT_ENCRYPTION_KEY' not in os.environ
if sys.argv[1:3] == ['auth','login']:
 print('Opening browser to sign in...\\n''' + URL + '''', flush=True)
 code=sys.stdin.readline().strip()
 assert code == ''' + repr(CODE) + '''
 (p/'fixture-authenticated').write_text('native-owned')
elif sys.argv[1:3] == ['auth','status']:
 print(json.dumps({'loggedIn':(p/'fixture-authenticated').exists(),'authMethod':'claude.ai'}))
else:
 assert '--safe-mode' in sys.argv and '--no-session-persistence' in sys.argv
 assert sys.argv[sys.argv.index('--tools')+1] == ''
 assert '--strict-mcp-config' in sys.argv
 assert 'hello' in sys.stdin.read()
 print(json.dumps({'subtype':'success','is_error':False,'structured_output':{'reason':'ok'}}))
''')
        binary.chmod(0o700)
        self.store.update(self.id, challenge={})
        with ThreadPoolExecutor(1) as pool, patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'must-not-inherit', 'CLAUDE_CODE_OAUTH_TOKEN': 'must-not-inherit'}):
            future = pool.submit(connect, self.store, self.id, str(binary), self.store.claude_root)
            # Wait for the native process to publish its own challenge.
            for _ in range(200):
                challenge = self.store.unseal(self.id, self.store.get(self.id)['challenge'])
                if challenge and challenge.get('url') == URL:
                    break
                time.sleep(.01)
            self.store.submit_code(self.id, self.scope, CODE)
            self.assertEqual(future.result(timeout=5), {'reply': 'OK'})
        self.assertEqual(self.store.get(self.id)['state'], 'connected')
        result = chat(self.store, self.id, 'claude-test', {'messages': [{'role': 'user', 'content': 'hello'}], 'response_format': {'json_schema': {'schema': {'type': 'object'}}}}, str(binary), self.store.claude_root)
        self.assertEqual(json.loads(result['reply']), {'reason': 'ok'})


class NativeAPI(unittest.IsolatedAsyncioTestCase):
    async def test_disconnect_kills_native_worker_tree_before_erasing_profile(self):
        with tempfile.TemporaryDirectory() as root:
            binary = Path(root) / 'pending-cli'
            binary.write_text('#!' + sys.executable + '\n' + 'import os,pathlib,time\np=pathlib.Path(os.environ["CLAUDE_CONFIG_DIR"])\n(p/"pid").write_text(str(os.getpid()))\nprint(' + repr(URL) + ',flush=True)\ntime.sleep(60)\n')
            binary.chmod(0o700)
            env = {'ACCOUNT_DATA_DIR': root + '/db', 'ACCOUNT_CLAUDE_CONFIG_ROOT': root + '/profiles',
                   'ACCOUNT_CLAUDE_BINARY': str(binary), 'PATH': os.environ['PATH'],
                   'ACCOUNT_ENCRYPTION_KEY': Fernet.generate_key().decode(), 'ACCOUNT_PLATFORM_KEYS': json.dumps({'festa': 'f' * 40}),
                   'ACCOUNT_MODELS': json.dumps({'codex': ['gpt-test'], 'claude': ['claude-test']})}
            app = create_app(env)
            headers = {'Authorization': 'Bearer ' + 'f' * 40, 'X-AI-Subject': 'a' * 64}
            async with app.router.lifespan_context(app), httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                response = await client.post('/connections', headers=headers, json={'provider': 'claude', 'authMethod': 'claude-code'})
                self.assertEqual(response.status_code, 202)
                id = response.json()['id']
                directory = Path(env['ACCOUNT_CLAUDE_CONFIG_ROOT']) / id
                for _ in range(100):
                    if (directory / 'pid').exists():
                        break
                    await asyncio.sleep(.05)
                pid = int((directory / 'pid').read_text())
                self.assertEqual((await client.delete('/connections/' + id, headers=headers)).status_code, 200)
                self.assertFalse(directory.exists())
                for _ in range(100):
                    try:
                        os.kill(pid, 0)
                    except ProcessLookupError:
                        break
                    stat = Path('/proc') / str(pid) / 'stat'
                    if stat.exists() and stat.read_text().split(') ', 1)[1].startswith('Z '):
                        break  # Killed descendant awaiting PID 1 reaping in containers.
                    await asyncio.sleep(.02)
                else:
                    self.fail('Native descendant survived disconnection')
                self.assertEqual(app.state.store.get(id)['state'], 'disconnected')

    async def test_opt_in_authorization_scope_cancel_and_legacy_api(self):
        with tempfile.TemporaryDirectory() as root:
            env = {'ACCOUNT_DATA_DIR': root + '/db', 'ACCOUNT_CLAUDE_CONFIG_ROOT': root + '/profiles',
                   'ACCOUNT_ENCRYPTION_KEY': Fernet.generate_key().decode(), 'ACCOUNT_PLATFORM_KEYS': json.dumps({'festa': 'f' * 40}),
                   'ACCOUNT_MODELS': json.dumps({'codex': ['gpt-test'], 'claude': ['claude-test']})}
            async def runner(action, id, model, messages, store):
                secret = store.unseal(id, store.get(id)['secret'])
                if secret.get('api_key'):
                    store.update(id, state='connected')
                    return {'reply': 'OK'}
                directory = Path(store.claude_root) / id
                directory.mkdir(parents=True)
                store.update(id, challenge={'kind': 'code-entry', 'url': URL, 'code': '', 'expiresAt': time.time() + 900})
                await asyncio.Event().wait()
            app = create_app(env, runner)
            headers = {'Authorization': 'Bearer ' + 'f' * 40, 'X-AI-Subject': 'a' * 64}
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                response = await client.post('/connections', headers=headers, json={'provider': 'claude', 'authMethod': 'claude-code'})
                self.assertEqual(response.status_code, 202)
                id = response.json()['id']
                await asyncio.sleep(0)
                endpoint = '/connections/' + id + '/authorize'
                self.assertEqual((await client.post(endpoint, headers={**headers, 'X-AI-Subject': 'b' * 64}, json={'code': CODE})).status_code, 404)
                self.assertEqual((await client.post(endpoint, headers=headers, json={'code': CODE})).status_code, 202)
                self.assertEqual((await client.post(endpoint, headers=headers, json={'code': CODE})).status_code, 409)
                self.assertNotIn(CODE, (await client.get('/connections', headers=headers)).text)
                self.assertEqual((await client.delete('/connections/' + id, headers=headers)).status_code, 200)
                self.assertFalse((Path(env['ACCOUNT_CLAUDE_CONFIG_ROOT']) / id).exists())
                self.assertEqual((await client.post(endpoint, headers=headers, json={'code': CODE})).status_code, 409)
                response = await client.post('/connections', headers=headers, json={'provider': 'claude', 'apiKey': 'sk-ant-api' + 'a' * 30})
                self.assertEqual(response.status_code, 202)
                await asyncio.sleep(0)
                self.assertEqual(app.state.store.get(response.json()['id'])['state'], 'connected')
                disabled = create_app({k: v for k, v in env.items() if k != 'ACCOUNT_CLAUDE_CONFIG_ROOT'}, runner)
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=disabled), base_url='http://test') as other:
                    self.assertEqual((await other.post('/connections', headers=headers, json={'provider': 'claude', 'authMethod': 'claude-code'})).status_code, 503)
