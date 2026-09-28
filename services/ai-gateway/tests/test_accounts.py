import asyncio
import json
import tempfile
import unittest
from unittest.mock import patch
import os
from types import SimpleNamespace

from cryptography.fernet import Fernet
from fastapi import HTTPException
import httpx

from account_service import Accounts, create_app


class AccountAPI(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.env = {'ACCOUNT_DATA_DIR': self.temp.name, 'ACCOUNT_ENCRYPTION_KEY': Fernet.generate_key().decode(),
                    'ACCOUNT_PLATFORM_KEYS': json.dumps({'hanmadi': 'h' * 40, 'festa': 'f' * 40}),
                    'ACCOUNT_MODELS': json.dumps({'codex': ['gpt-test', 'gpt-second'], 'claude': ['claude-test']})}
        self.calls = []

        async def runner(action, id, model, messages, store):
            self.calls.append((action, id, model))
            if action == 'connect':
                store.update(id, secret={'access_token': 'fixture-private-token'}, state='connected')
            return {'reply': 'こんにちは'}

        self.app = create_app(self.env, runner)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url='http://test')
        self.addAsyncCleanup(self.client.aclose)
        self.headers = {'Authorization': 'Bearer ' + 'h' * 40, 'X-AI-Subject': 'a' * 64}

    async def connect(self, provider='codex', extra=None):
        r = await self.client.post('/connections', headers=self.headers, json={'provider': provider, **(extra or {})})
        self.assertEqual(r.status_code, 202, r.text)
        await asyncio.sleep(0)
        return r.json()['id']

    async def test_real_http_scope_encryption_and_selection(self):
        id = await self.connect()
        listing = await self.client.get('/connections', headers=self.headers)
        self.assertEqual(listing.json()['connections'][0]['state'], 'connected')
        self.assertNotIn('fixture-private-token', listing.text)
        self.assertNotIn('fixture-private-token', (self.app.state.store.root / 'accounts.sqlite3').read_bytes().decode(errors='replace'))
        self.assertEqual(listing.headers['cache-control'], 'no-store')
        response = await self.client.post('/v1/chat/completions', headers=self.headers, json={'model': id + ':gpt-second', 'messages': [{'role': 'user', 'content': 'hi'}]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.calls[-1], ('chat', id, 'gpt-second'))

    async def test_other_subject_or_platform_cannot_list_use_or_disconnect(self):
        id = await self.connect()
        for headers in [{**self.headers, 'X-AI-Subject': 'b' * 64}, {**self.headers, 'Authorization': 'Bearer ' + 'f' * 40}]:
            self.assertEqual((await self.client.get('/connections', headers=headers)).json()['connections'], [])
            self.assertEqual((await self.client.delete('/connections/' + id, headers=headers)).status_code, 404)
            r = await self.client.post('/v1/chat/completions', headers=headers, json={'model': id + ':gpt-test'})
            self.assertEqual(r.status_code, 404)

    async def test_unverified_model_and_revoked_account_fail_closed(self):
        id = await self.connect()
        body = {'model': id + ':unlisted', 'messages': [{'role': 'user', 'content': 'hi'}]}
        self.assertEqual((await self.client.post('/v1/chat/completions', headers=self.headers, json=body)).status_code, 403)
        self.assertEqual((await self.client.delete('/connections/' + id, headers=self.headers)).status_code, 200)
        body['model'] = id + ':gpt-test'
        self.assertEqual((await self.client.post('/v1/chat/completions', headers=self.headers, json=body)).status_code, 409)
        row = self.app.state.store.get(id)
        self.assertIsNone(row['secret'])
        with self.assertRaises(HTTPException):
            self.app.state.store.update(id, secret={'late': 'token'}, state='connected')

    async def test_no_auth_or_invalid_key_never_starts_connection(self):
        self.assertEqual((await self.client.get('/connections')).status_code, 401)
        for body in [{'provider': 'claude', 'apiKey': 'sk-ant-oat01-' + 'a' * 100}, {'provider': 'codex', 'apiKey': 'token'}, {'provider': 'other'}]:
            self.assertEqual((await self.client.post('/connections', headers=self.headers, json=body)).status_code, 400)
        self.assertEqual(self.calls, [])

    async def test_duplicate_connect_and_body_limit(self):
        await self.connect()
        self.assertEqual((await self.client.post('/connections', headers=self.headers, json={'provider': 'codex'})).status_code, 409)
        self.assertEqual((await self.client.post('/connections', headers=self.headers, content='a' * 65000)).status_code, 413)

    async def test_restart_keeps_encrypted_identity_bound_record(self):
        id = await self.connect()
        recovered = Accounts(self.temp.name, self.env['ACCOUNT_ENCRYPTION_KEY'])
        row = recovered.get(id, ('hanmadi', 'a' * 64))
        self.assertEqual(recovered.unseal(id, row['secret'])['access_token'], 'fixture-private-token')
        with self.assertRaises(ValueError):
            recovered.unseal('other', row['secret'])

    async def test_cancel_pending_login_stops_worker_and_clears_credentials(self):
        started, cancelled = asyncio.Event(), asyncio.Event()
        async def pending(action, id, model, messages, store):
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()
        app = create_app(self.env, pending)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            response = await client.post('/connections', headers=self.headers, json={'provider': 'codex'})
            id = response.json()['id']
            await asyncio.wait_for(started.wait(), 1)
            self.assertEqual((await client.delete('/connections/' + id, headers=self.headers)).status_code, 200)
            self.assertTrue(cancelled.is_set())
            self.assertEqual(app.state.store.get(id)['state'], 'disconnected')

    async def test_concurrent_account_lock_fails_without_changing_credentials(self):
        id = await self.connect()
        with self.app.state.store.lock(id):
            with self.assertRaises(HTTPException):
                with self.app.state.store.lock(id):
                    self.fail('lock should reject')
        self.assertEqual(self.app.state.store.get(id)['state'], 'connected')


class RevocationRace(unittest.TestCase):
    def test_disconnect_cannot_be_undone_by_an_inflight_refresh(self):
        from concurrent.futures import ThreadPoolExecutor, TimeoutError
        from threading import Event
        with tempfile.TemporaryDirectory() as temp:
            store = Accounts(temp, Fernet.generate_key().decode())
            scope = ('hanmadi', 'a' * 64)
            id = store.create(scope, 'codex')['id']
            store.update(id, state='connected', secret={'token': 'old'})
            encrypting, release, revoking = Event(), Event(), Event()
            original = store.seal
            def paused_seal(id, value):
                encrypting.set()
                if not release.wait(3):
                    raise RuntimeError('test release timed out')
                return original(id, value)
            def revoke():
                revoking.set()
                store.disconnect(id, scope)
            with ThreadPoolExecutor(2) as pool, patch.object(store, 'seal', paused_seal):
                refresh = pool.submit(store.update, id, state='connected', secret={'token': 'new'})
                self.assertTrue(encrypting.wait(1))
                deletion = pool.submit(revoke)
                try:
                    self.assertTrue(revoking.wait(1))
                    # The write lock must span the state check and encryption.
                    with self.assertRaises(TimeoutError):
                        deletion.result(timeout=.2)
                finally:
                    release.set()
                refresh.result(timeout=2)
                deletion.result(timeout=2)
            row = store.get(id)
            self.assertEqual(row['state'], 'disconnected')
            self.assertIsNone(row['secret'])


class PinnedWorker(unittest.TestCase):
    def test_sdk_device_flow_uses_encrypted_storage_and_selected_model(self):
        import litellm
        from litellm.llms.chatgpt.authenticator import Authenticator
        from account_worker import execute
        import contextlib
        import io
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {'ACCOUNT_DATA_DIR': temp, 'ACCOUNT_ENCRYPTION_KEY': Fernet.generate_key().decode()}):
            store = Accounts(temp, os.environ['ACCOUNT_ENCRYPTION_KEY'])
            row = store.create(('hanmadi', 'a' * 64), 'codex')
            response = SimpleNamespace(choices=[SimpleNamespace(finish_reason='stop', message=SimpleNamespace(content='OK', refusal=None))])
            # Real pinned SDK device flow; only provider I/O and inference mocked.
            with contextlib.ExitStack() as stack:
                for name in ('_read_auth_file', '_write_auth_file', '_login_device_code', 'get_access_token'):
                    stack.enter_context(patch.object(Authenticator, name, getattr(Authenticator, name)))
                stack.enter_context(patch.object(Authenticator, '_request_device_code', return_value={'user_code': 'TEST-1234', 'device_auth_id': 'fixture', 'interval': '5'}))
                stack.enter_context(patch.object(Authenticator, '_poll_for_authorization_code', return_value={}))
                stack.enter_context(patch.object(Authenticator, '_exchange_code_for_tokens', return_value={'access_token': 'private-fixture-token'}))
                stack.enter_context(patch.object(Authenticator, '_build_auth_record', return_value={'access_token': 'private-fixture-token', 'expires_at': 9999999999}))
                complete = stack.enter_context(patch.object(litellm, 'completion', return_value=response))
                stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
                self.assertEqual(execute('connect', row['id'], 'gpt-test', None), {'reply': 'OK'})
                self.assertEqual(complete.call_args.kwargs['model'], 'chatgpt/gpt-test')
                saved = store.get(row['id'])
                self.assertEqual(saved['state'], 'connected')
                self.assertEqual(store.unseal(row['id'], saved['secret'])['access_token'], 'private-fixture-token')
                self.assertNotIn(b'private-fixture-token', (store.root / 'accounts.sqlite3').read_bytes())
                with self.assertRaises(RuntimeError):
                    Authenticator()._login_device_code()
                response.choices[0].finish_reason = 'length'
                with self.assertRaises(RuntimeError):
                    execute('chat', row['id'], 'gpt-test', [{'role': 'user', 'content': 'hello'}])


if __name__ == '__main__':
    unittest.main()
