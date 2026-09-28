"""One provider operation per process; no shared OAuth globals between accounts."""
import contextlib
import importlib.metadata
import json
import os
import re
import sys
import tempfile
import time

from account_service import Accounts


def execute(action, id, model, messages):
    if importlib.metadata.version('litellm') != '1.102.1':
        raise RuntimeError('Pinned LiteLLM required')
    store = Accounts(os.environ['ACCOUNT_DATA_DIR'], os.environ['ACCOUNT_ENCRYPTION_KEY'])
    with store.lock(id), tempfile.TemporaryDirectory(prefix='account-auth-') as temp:
        row = store.get(id)
        if row['state'] == 'disconnected':
            raise RuntimeError('Disconnected')
        import litellm
        litellm.set_verbose = False
        litellm.turn_off_message_logging = True
        if row['provider'] == 'codex':
            os.environ['CHATGPT_TOKEN_DIR'] = temp
            from litellm.llms.chatgpt.authenticator import Authenticator
            from litellm.llms.chatgpt.common_utils import CHATGPT_DEVICE_VERIFY_URL
            from subscription_runtime import noninteractive_auth, repair_subscription_bridge
            # Preserve SDK exchange/PKCE/refresh implementation, replace file I/O
            # with authenticated encrypted storage bound to this random record ID.
            Authenticator._read_auth_file = lambda self: store.unseal(id, store.get(id)['secret'])
            Authenticator._write_auth_file = lambda self, value: store.update(id, secret=value)
            if action == 'connect':
                original = Authenticator._request_device_code
                def challenge(self):
                    value = original(self)
                    if CHATGPT_DEVICE_VERIFY_URL != 'https://auth.openai.com/codex/device' or not re.fullmatch(r'[A-Za-z0-9-]{4,32}', value['user_code']):
                        raise RuntimeError('Unexpected verification challenge')
                    store.update(id, challenge={'url': CHATGPT_DEVICE_VERIFY_URL, 'code': value['user_code'], 'expiresAt': time.time() + 900})
                    return value
                Authenticator._request_device_code = challenge
                Authenticator().get_access_token()
            noninteractive_auth()
            repair_subscription_bridge()
            route = {'model': 'chatgpt/' + model}
        else:
            secret = store.unseal(id, row['secret'])
            route = {'model': 'anthropic/' + model, 'api_key': secret['api_key']}
        options = {}
        if action == 'chat' and isinstance(messages, dict):
            options = {k: messages[k] for k in ('response_format', 'max_tokens') if k in messages}
            messages = messages['messages']
        reply = litellm.completion(**route, messages=messages if action == 'chat' else [{'role': 'user', 'content': 'Reply with only OK.'}], timeout=28, num_retries=0, **{'max_tokens': 700, **options})
        choice = reply.choices[0]
        if choice.finish_reason != 'stop' or getattr(choice.message, 'refusal', None):
            raise RuntimeError('Incomplete or refused model response')
        text = choice.message.content
        if not isinstance(text, str) or not text.strip() or len(text) > (8000 if options.get('response_format') else 2000):
            raise RuntimeError('Invalid model response')
        store.update(id, state='connected', challenge={})
        return {'reply': text.strip()}


def main():
    os.umask(0o077)
    action, id, model = sys.argv[1:]
    try:
        messages = json.load(sys.stdin)
        # Provider prints/logs must never enter the machine-readable response.
        with open(os.devnull, 'w') as sink, contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
            result = execute(action, id, model, messages)
        print(json.dumps(result), flush=True)
    except Exception as error:
        status = getattr(error, 'status_code', 502)
        status = status if type(status) is int and status in (401, 403, 409, 429, 504) else 502
        state = 'expired' if status in (401, 403) else 'quota_exceeded' if status == 429 else 'error'
        if status != 409:  # A busy lock must not invalidate the in-flight owner.
            try:
                store = Accounts(os.environ['ACCOUNT_DATA_DIR'], os.environ['ACCOUNT_ENCRYPTION_KEY'])
                store.update(id, state=state, challenge={})
            except Exception:
                pass
        print(json.dumps({'error': 'connection_' + state, 'status': status}), flush=True)
        raise SystemExit(1)


if __name__ == '__main__':
    main()
