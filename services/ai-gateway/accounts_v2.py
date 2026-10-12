"""API-key-only accounts runtime for Cloud Run. The VM v1 entry point is unchanged."""
import asyncio
import hmac
import json
import os
import re

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from accounts_provider import Provider, ProviderError
from accounts_store import StoreError, from_env


CONNECT_DEADLINE = 9
CHAT_DEADLINE = 28


class BoundedRequest:
    """ASGI deadline cancels the endpoint itself, including an in-flight HTTP call."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        started = False

        async def private_send(message):
            nonlocal started
            if message['type'] == 'http.response.start':
                started = True
                message['headers'] = [*(h for h in message.get('headers', []) if h[0].lower() != b'cache-control'), (b'cache-control', b'no-store')]
            await send(message)

        try:
            async with asyncio.timeout(CHAT_DEADLINE if scope['path'] == '/v1/chat/completions' else CONNECT_DEADLINE):
                await self.app(scope, receive, private_send)
        except TimeoutError:
            if not started:
                await JSONResponse({'detail': 'account_timeout'}, status_code=504)(scope, receive, private_send)
        except Exception:
            if not started:
                await JSONResponse({'detail': 'account_backend_error'}, status_code=503)(scope, receive, private_send)


def public(row, allowed):
    return {'id': row['id'], 'provider': row['provider'], 'state': row['state'],
            'models': [m for m in row['models'] if m in allowed[row['provider']]] if row['state'] == 'connected' else []}


def create_app(env=None, store=None, provider=None):
    env = dict(os.environ if env is None else env)
    try:
        keys, models = json.loads(env['ACCOUNT_PLATFORM_KEYS']), json.loads(env['ACCOUNT_MODELS'])
        if not isinstance(keys, dict) or not keys or len(set(keys.values())) != len(keys) or any(
                not re.fullmatch('[a-z][a-z0-9-]{1,40}', p) or not isinstance(k, str) or not re.fullmatch('[!-~]{32,256}', k) for p, k in keys.items()):
            raise ValueError()
        if not isinstance(models, dict) or set(models) != {'openai', 'claude'} or any(
                not isinstance(v, list) or not 1 <= len(v) <= 30 or any(not isinstance(m, str) or not re.fullmatch('[a-zA-Z0-9.-]{1,100}', m) for m in v) for v in models.values()):
            raise ValueError()
    except (KeyError, ValueError, TypeError):
        raise ValueError('Invalid accounts API configuration') from None
    store, provider = store or from_env(env), provider or Provider()
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    app.state.store = store

    def scope(req):
        supplied, subject = req.headers.get('authorization', ''), req.headers.get('x-ai-subject', '')
        # Non-ASCII credentials are invalid; compare_digest(str) would otherwise raise.
        platform = next((p for p, k in keys.items() if hmac.compare_digest(supplied.encode(), ('Bearer ' + k).encode())), None)
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
            value = json.loads(data)
            if not isinstance(value, dict):
                raise ValueError()
            return value
        except (ValueError, RecursionError):
            raise HTTPException(400, 'invalid_body') from None

    async def db(method, *args):
        return await asyncio.to_thread(getattr(store, method), *args)

    app.add_middleware(BoundedRequest)

    @app.exception_handler(StoreError)
    async def storage_error(_request, error):
        return JSONResponse({'detail': error.code}, status_code=error.status)

    @app.exception_handler(ProviderError)
    async def provider_error(_request, error):
        return JSONResponse({'detail': error.code}, status_code=error.status)

    @app.get('/health')
    async def health():
        return {'ok': True}

    @app.get('/connections')
    async def listing(req: Request):
        return {'connections': [public(r, models) for r in await db('list', scope(req))]}

    @app.post('/connections')
    async def connect(req: Request):
        identity, data = scope(req), await body(req)
        name, key = data.get('provider'), data.get('apiKey')
        if name == 'codex' or data.get('authMethod') == 'claude-code':
            raise HTTPException(400, 'unsupported_auth_method')
        if name not in ('openai', 'claude'):
            raise HTTPException(400, 'unsupported_provider')
        if data.get('authMethod') not in (None, 'api-key'):
            raise HTTPException(400, 'unsupported_auth_method')
        pattern = r'sk-ant-api[A-Za-z0-9_-]{20,500}' if name == 'claude' else r'sk-[A-Za-z0-9_-]{20,500}'
        if not isinstance(key, str) or not re.fullmatch(pattern, key) or (name == 'openai' and key.startswith('sk-ant-')):
            raise HTTPException(400, 'api_key_required')
        ttl = data.get('ttlSeconds')
        if ttl is not None and (type(ttl) is not int or not 60 <= ttl <= 2592000):
            raise HTTPException(400, 'invalid_expiry')
        row = await db('create', identity, name, ttl)
        try:
            verified = await provider.verify(name, key, models[name])
        except ProviderError:
            row = await db('finish', row['id'], identity)
        else:
            row = await db('finish', row['id'], identity, key, verified)
        return JSONResponse(public(row, models), status_code=202)

    @app.delete('/connections/{id}')
    async def disconnect(id: str, req: Request):
        await db('disconnect', id, scope(req))
        return {'ok': True, 'providerGrantRevoked': False}

    @app.post('/v1/chat/completions')
    async def chat(req: Request):
        identity, data = scope(req), await body(req)
        selected = data.get('model')
        if not isinstance(selected, str) or not re.fullmatch('[a-f0-9]{32}:[a-zA-Z0-9.-]{1,100}', selected):
            raise HTTPException(400, 'invalid_model')
        id, model = selected.split(':')
        row, key = await db('secret', id, identity)
        if model not in models[row['provider']] or model not in row['models']:
            raise HTTPException(403, 'model_not_allowed')
        messages = data.get('messages')
        if not isinstance(messages, list) or not 1 <= len(messages) <= 21 or any(
                not isinstance(m, dict) or m.get('role') not in ('system', 'user', 'assistant') or not isinstance(m.get('content'), str)
                or not 1 <= len(m['content']) <= 8000 for m in messages) or not any(m['role'] == 'user' for m in messages):
            raise HTTPException(400, 'invalid_messages')
        if data.get('stream', False) is not False:
            raise HTTPException(400, 'stream_not_supported')
        options = {'max_tokens': data.get('max_tokens', 700)}
        if type(options['max_tokens']) is not int or not 1 <= options['max_tokens'] <= 2000:
            raise HTTPException(400, 'invalid_max_tokens')
        if 'response_format' in data:
            fmt = data['response_format']
            if not isinstance(fmt, dict) or fmt.get('type') != 'json_schema' or not isinstance(fmt.get('json_schema'), dict) or not isinstance(fmt['json_schema'].get('schema'), dict) or fmt['json_schema']['schema'].get('type') != 'object':
                raise HTTPException(400, 'invalid_response_format')
            options['response_format'] = fmt
        # Whitelist provider payload, never forward arbitrary URL/tool/header fields.
        messages = [{'role': m['role'], 'content': m['content']} for m in messages]
        try:
            text = await provider.complete(row['provider'], key, model, messages, options)
        except ProviderError as error:
            if error.status in (401, 403, 429):
                await db('fail', id, identity, 'quota_exceeded' if error.status == 429 else 'expired')
            raise
        current = await db('get', id, identity)
        if current['state'] != 'connected':
            raise HTTPException(409, 'connection_' + current['state'])
        return {'choices': [{'message': {'role': 'assistant', 'content': text}, 'finish_reason': 'stop'}]}

    return app


if __name__ == '__main__':
    import uvicorn
    try:
        app = create_app()
    except Exception:
        raise SystemExit('Accounts startup failed') from None
    uvicorn.run(app, host='0.0.0.0', port=int(os.environ.get('PORT', '8080')), access_log=False)
