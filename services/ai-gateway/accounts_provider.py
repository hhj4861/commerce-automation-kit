"""Bounded, no-retry official provider HTTP calls. No upstream errors are returned."""
import asyncio
import json

import httpx


class ProviderError(Exception):
    def __init__(self, status=502, code='provider_error'):
        self.status, self.code = status, code
        super().__init__(code)


class Provider:
    def __init__(self, transport=None):
        self.transport = transport

    async def request(self, provider, key, path, body=None, timeout=28):
        base = 'https://api.openai.com' if provider == 'openai' else 'https://api.anthropic.com'
        headers = {'Authorization': 'Bearer ' + key} if provider == 'openai' else {'x-api-key': key, 'anthropic-version': '2023-06-01'}
        try:
            async with asyncio.timeout(timeout):
                async with httpx.AsyncClient(transport=self.transport, timeout=timeout, follow_redirects=False, trust_env=False) as client:
                    async with client.stream('GET' if body is None else 'POST', base + path, headers=headers, json=body) as response:
                        if response.status_code != 200:
                            status = response.status_code if response.status_code in (401, 403, 429) else 502
                            raise ProviderError(status)
                        data = bytearray()
                        async for chunk in response.aiter_bytes():
                            data.extend(chunk)
                            if len(data) > 1024 * 1024:
                                raise ProviderError()
                        value = json.loads(data)
                        if not isinstance(value, dict):
                            raise ProviderError()
                        return value
        except (TimeoutError, httpx.TimeoutException):
            raise ProviderError(504, 'provider_timeout') from None
        except (httpx.HTTPError, ValueError):
            raise ProviderError() from None

    async def verify(self, provider, key, allowed):
        # One request, no inference billed. Only explicitly configured model IDs can pass.
        value = await self.request(provider, key, '/v1/models' + ('?limit=1000' if provider == 'claude' else ''), timeout=5)
        rows = value.get('data')
        if not isinstance(rows, list) or any(not isinstance(m, dict) or not isinstance(m.get('id'), str) for m in rows):
            raise ProviderError()
        available = {m['id'] for m in rows if m.get('lifecycle') != 'retired'}
        selected = [m for m in allowed if m in available]
        if not selected:
            raise ProviderError(403, 'model_unavailable')
        return selected

    async def complete(self, provider, key, model, messages, options):
        structured = options.get('response_format')
        if provider == 'openai':
            body = {'model': model, 'messages': messages, 'max_completion_tokens': options['max_tokens'], 'store': False}
            if structured:
                body['response_format'] = structured
            value = await self.request(provider, key, '/v1/chat/completions', body)
            try:
                choice = value['choices'][0]
                if choice['finish_reason'] != 'stop' or choice['message'].get('refusal'):
                    raise ProviderError()
                text = choice['message']['content']
            except (KeyError, IndexError, TypeError):
                raise ProviderError() from None
        else:
            body = {'model': model, 'max_tokens': options['max_tokens'],
                    'messages': [m for m in messages if m['role'] != 'system']}
            system = '\n\n'.join(m['content'] for m in messages if m['role'] == 'system')
            if system:
                body['system'] = system
            if structured:
                body['output_config'] = {'format': {'type': 'json_schema', 'schema': structured['json_schema']['schema']}}
            value = await self.request(provider, key, '/v1/messages', body)
            blocks = value.get('content')
            if not isinstance(blocks, list) or any(not isinstance(b, dict) for b in blocks):
                raise ProviderError()
            if value.get('stop_reason') != 'end_turn':
                raise ProviderError()
            text = ''.join(b.get('text', '') for b in blocks if b.get('type') == 'text')
        if not isinstance(text, str) or not text.strip() or len(text) > (8000 if structured else 2000):
            raise ProviderError()
        if structured:
            try:
                if not isinstance(json.loads(text), dict):
                    raise ValueError()
            except ValueError:
                raise ProviderError() from None
        return text.strip()
