"""Private platform-scoped account API. Deploy behind TLS, never expose admin keys."""
import asyncio
from contextlib import contextmanager, asynccontextmanager
import fcntl
import hmac
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time
import uuid

from cryptography.fernet import Fernet
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse


class Accounts:
    def __init__(self, directory, key):
        self.root = Path(directory)
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.root.chmod(0o700)
        self.cipher = Fernet(key.encode())
        with self.db() as db:
            db.execute('CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, platform TEXT, subject TEXT, provider TEXT, state TEXT, secret BLOB, challenge BLOB, updated REAL)')

    @contextmanager
    def db(self):
        path = self.root / 'accounts.sqlite3'
        db = sqlite3.connect(path, timeout=5)
        path.chmod(0o600)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def seal(self, id, value):
        return self.cipher.encrypt(json.dumps({'id': id, 'value': value}).encode())

    def unseal(self, id, value):
        if not value:
            return None
        data = json.loads(self.cipher.decrypt(value))
        if data['id'] != id:
            raise ValueError('Credential binding mismatch')
        return data['value']

    def get(self, id, scope=None):
        with self.db() as db:
            row = db.execute('SELECT * FROM accounts WHERE id=?', (id,)).fetchone()
        if row is None or (scope and (row['platform'], row['subject']) != scope):
            raise HTTPException(404, 'connection_not_found')
        return dict(row)

    def list(self, scope):
        with self.db() as db:
            return [dict(r) for r in db.execute('SELECT * FROM accounts WHERE platform=? AND subject=? AND state != ? ORDER BY updated', (*scope, 'disconnected'))]

    def create(self, scope, provider, secret=None):
        # One unfinished/connected record per provider and platform subject.
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute('SELECT 1 FROM accounts WHERE platform=? AND subject=? AND provider=? AND state != ?', (*scope, provider, 'disconnected')).fetchone():
                raise HTTPException(409, 'disconnect_before_reconnecting')
            id = uuid.uuid4().hex
            db.execute('INSERT INTO accounts VALUES (?,?,?,?,?,?,?,?)', (id, *scope, provider, 'authorizing', self.seal(id, secret) if secret else None, None, time.time()))
        return self.get(id)

    def update(self, id, *, state=None, secret=None, challenge=None):
        with self.db() as db:
            row = db.execute('SELECT state FROM accounts WHERE id=?', (id,)).fetchone()
            if row is None or row['state'] == 'disconnected':
                raise HTTPException(409, 'connection_disconnected')
            if secret is not None:
                db.execute('UPDATE accounts SET secret=? WHERE id=?', (self.seal(id, secret), id))
            if challenge is not None:
                db.execute('UPDATE accounts SET challenge=? WHERE id=?', (self.seal(id, challenge), id))
            db.execute('UPDATE accounts SET state=COALESCE(?,state),updated=? WHERE id=?', (state, time.time(), id))

    def disconnect(self, id, scope):
        self.get(id, scope)
        with self.db() as db:
            db.execute('UPDATE accounts SET state=?,secret=NULL,challenge=NULL,updated=? WHERE id=?', ('disconnected', time.time(), id))

    @contextmanager
    def lock(self, id):
        if not re.fullmatch('[a-f0-9]{32}', id):
            raise HTTPException(400, 'invalid_connection')
        with (self.root / (id + '.lock')).open('a') as handle:
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise HTTPException(409, 'connection_busy') from None
            yield


def public_record(store, row, models):
    state = row['state']
    challenge = store.unseal(row['id'], row['challenge']) if state == 'authorizing' else None
    if state == 'authorizing' and time.time() - row['updated'] > 960:
        state, challenge = 'expired', None
    result = {'id': row['id'], 'provider': row['provider'], 'state': state,
              'models': models.get(row['provider'], []) if state == 'connected' else []}
    if challenge and challenge.get('expiresAt', 0) > time.time():
        result['challenge'] = challenge
    return result


def create_app(env=None, runner=None):
    env = dict(os.environ if env is None else env)
    keys = json.loads(env['ACCOUNT_PLATFORM_KEYS'])
    models = json.loads(env['ACCOUNT_MODELS'])
    if not keys or any(not re.fullmatch('[a-z][a-z0-9-]{1,40}', k) or not isinstance(v, str) or len(v) < 32 for k, v in keys.items()):
        raise ValueError('Strong per-platform keys required')
    if set(models) != {'codex', 'claude'} or any(not isinstance(v, list) or not v or any(not isinstance(m, str) or not re.fullmatch(r'[a-zA-Z0-9.-]{1,100}', m) for m in v) for v in models.values()):
        raise ValueError('Explicit provider model allowlists required')
    store = Accounts(env['ACCOUNT_DATA_DIR'], env['ACCOUNT_ENCRYPTION_KEY'])
    tasks = {}
    @asynccontextmanager
    async def lifespan(app):
        yield
        for task in tuple(tasks.values()):
            task.cancel()
        await asyncio.gather(*tuple(tasks.values()), return_exceptions=True)
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.state.store = store
    slots = {action: asyncio.Semaphore(8) for action in ('connect', 'chat')}

    async def run(action, id, model, messages=None):
        async with slots[action]:
            if runner:
                return await runner(action, id, model, messages, store)
            child_env = {k: env[k] for k in ('PATH', 'LANG', 'SSL_CERT_FILE') if k in env}
            child_env.update({k: env[k] for k in ('ACCOUNT_DATA_DIR', 'ACCOUNT_ENCRYPTION_KEY')})
            child_env.update(LITELLM_TELEMETRY='False', PYTHONNOUSERSITE='1')
            proc = await asyncio.create_subprocess_exec(sys.executable, str(Path(__file__).with_name('account_worker.py')), action, id, model,
                env=child_env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            try:
                stdout, _ = await asyncio.wait_for(proc.communicate(json.dumps(messages).encode()), 920 if action == 'connect' else 32)
                if len(stdout) > 20000:
                    raise ValueError('Invalid worker output')
                result = json.loads(stdout)
                if proc.returncode != 0:
                    raise HTTPException(result.get('status', 502), result.get('error', 'provider_error'))
                # A revoked connection cannot deliver a late response.
                if store.get(id)['state'] == 'disconnected':
                    raise HTTPException(409, 'connection_disconnected')
                return result
            except (asyncio.TimeoutError, asyncio.CancelledError) as error:
                if proc.returncode is None:
                    proc.kill()
                await proc.communicate()
                if isinstance(error, asyncio.CancelledError):
                    raise
                raise HTTPException(504, 'provider_timeout') from None
            except (ValueError, KeyError):
                raise HTTPException(502, 'provider_error') from None

    async def connect_job(id, provider):
        try:
            await run('connect', id, models[provider][0])
        except Exception:
            try:
                if store.get(id)['state'] == 'authorizing':
                    store.update(id, state='error', challenge={})
            except HTTPException:
                pass  # Explicitly disconnected while the provider was running.

    def scope(req):
        supplied = req.headers.get('authorization', '')
        platform = next((p for p, key in keys.items() if hmac.compare_digest(supplied, 'Bearer ' + key)), None)
        subject = req.headers.get('x-ai-subject', '')
        if not platform or not re.fullmatch('[a-f0-9]{64}', subject):
            raise HTTPException(401, 'unauthorized')
        return platform, subject

    async def body(req):
        data = bytearray()
        async for chunk in req.stream():
            data.extend(chunk)
            if len(data) > 64000:
                raise HTTPException(413, 'body_too_large')
        try:
            result = json.loads(data)
            if not isinstance(result, dict):
                raise ValueError()
            return result
        except ValueError:
            raise HTTPException(400, 'invalid_body') from None

    @app.middleware('http')
    async def private_response(request, call_next):
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        return response

    @app.get('/connections')
    async def listing(req: Request):
        identity = scope(req)
        return {'connections': [public_record(store, r, models) for r in store.list(identity)]}

    @app.post('/connections')
    async def connect(req: Request):
        identity = scope(req)
        data = await body(req)
        provider, key = data.get('provider'), data.get('apiKey')
        if provider not in models:
            raise HTTPException(400, 'unsupported_provider')
        if provider == 'claude' and (not isinstance(key, str) or not re.fullmatch(r'sk-ant-api[A-Za-z0-9_-]{20,500}', key)):
            raise HTTPException(400, 'claude_api_key_required')
        if provider == 'codex' and key is not None:
            raise HTTPException(400, 'use_official_device_login')
        # Refuse excess pending jobs before allocating durable state.
        if len(tasks) >= 8:
            raise HTTPException(429, 'connection_capacity')
        row = store.create(identity, provider, {'api_key': key} if key else None)
        task = asyncio.create_task(connect_job(row['id'], provider))
        tasks[row['id']] = task
        task.add_done_callback(lambda _: tasks.pop(row['id'], None))
        return JSONResponse(public_record(store, row, models), status_code=202)

    @app.delete('/connections/{id}')
    async def disconnect(id: str, req: Request):
        store.disconnect(id, scope(req))
        task = tasks.get(id)
        if task:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        return {'ok': True, 'providerGrantRevoked': False}

    @app.post('/v1/chat/completions')
    async def chat(req: Request):
        identity = scope(req)
        data = await body(req)
        selected = data.get('model', '')
        if not isinstance(selected, str) or selected.count(':') != 1:
            raise HTTPException(400, 'invalid_model')
        id, model = selected.split(':')
        row = store.get(id, identity)
        if row['state'] != 'connected':
            raise HTTPException(409, 'connection_' + row['state'])
        if model not in models[row['provider']]:
            raise HTTPException(403, 'model_not_allowed')
        messages = data.get('messages')
        if not isinstance(messages, list) or not 1 <= len(messages) <= 21 or any(not isinstance(m, dict) or m.get('role') not in ('system', 'user', 'assistant') or not isinstance(m.get('content'), str) or not 1 <= len(m['content']) <= 8000 for m in messages):
            raise HTTPException(400, 'invalid_messages')
        result = await run('chat', id, model, messages)
        return {'choices': [{'message': {'role': 'assistant', 'content': result['reply']}}]}

    return app


if __name__ == '__main__':
    import uvicorn
    os.umask(0o077)
    uvicorn.run(create_app(), host='0.0.0.0', port=4190, access_log=False)
