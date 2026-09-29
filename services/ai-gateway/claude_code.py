"""Run the unmodified Claude Code CLI in a private, per-connection profile.

The CLI owns OAuth exchange/refresh/credentials. Never read its credential files.
"""
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import subprocess
import time
from urllib.parse import urlparse, parse_qs

from fastapi import HTTPException


def profile(root, id):
    if not root or not Path(root).is_absolute() or not re.fullmatch(r'[a-f0-9]{32}', id):
        raise RuntimeError('Claude Code profile not configured')
    return Path(root) / id


def remove_profile(root, id):
    if root:
        try:
            shutil.rmtree(profile(root, id))
        except FileNotFoundError:
            pass


def login_url(value):
    url = urlparse(value)
    query = parse_qs(url.query)
    if (url.scheme != 'https' or url.netloc != 'claude.com' or url.path != '/cai/oauth/authorize'
            or url.fragment or query.get('redirect_uri') != ['https://platform.claude.com/oauth/code/callback']
            or query.get('response_type') != ['code'] or query.get('code_challenge_method') != ['S256']
            or not re.fullmatch(r'[A-Za-z0-9_-]{20,200}', query.get('state', [''])[0])):
        raise ValueError('Unexpected native login URL')
    return value


def code_for_challenge(code, challenge):
    if not isinstance(code, str) or not re.fullmatch(r'[A-Za-z0-9_-]{10,1000}#[A-Za-z0-9_-]{20,200}', code):
        raise HTTPException(400, 'invalid_authorization_code')
    expected = parse_qs(urlparse(login_url(challenge['url'])).query)['state'][0]
    if code.split('#')[1] != expected:
        raise HTTPException(400, 'invalid_authorization_code')
    return code


def environment(root, id):
    directory = profile(root, id)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    directory.chmod(0o700)
    env = {k: os.environ[k] for k in ('PATH', 'LANG', 'SSL_CERT_FILE') if k in os.environ}
    env.update(CLAUDE_CONFIG_DIR=str(directory), BROWSER='/bin/true', DISABLE_AUTOUPDATER='1')
    return directory, env


def invoke(binary, args, directory, env, prompt=None, timeout=28):
    # The parent account worker owns the process group and kills all descendants.
    result = subprocess.run([binary, *args], input=prompt, text=True, cwd=directory,
                            env=env, capture_output=True, timeout=timeout)
    if result.returncode or len(result.stdout) > 64000:
        raise RuntimeError('Native Claude Code failed')
    return json.loads(result.stdout)


def connect(store, id, binary, root):
    directory, env = environment(root, id)
    proc = subprocess.Popen([binary, 'auth', 'login', '--claudeai'], cwd=directory, env=env,
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    selector = selectors.DefaultSelector()
    selector.register(proc.stdout, selectors.EVENT_READ)
    deadline, output, published = time.monotonic() + 900, '', False
    try:
        while proc.poll() is None:
            if time.monotonic() > deadline:
                raise HTTPException(504, 'provider_timeout')
            if store.get(id)['state'] != 'authorizing':
                raise HTTPException(409, 'connection_disconnected')
            for key, _ in selector.select(0.2):
                chunk = os.read(key.fd, 8192)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                output += chunk.decode('utf-8', errors='replace')
                if len(output) > 64000:
                    raise RuntimeError('Unexpected native login output')
                if not published:
                    match = re.search(r'https://[^\s\x1b]+', output)
                    if match:
                        url = login_url(match[0])
                        store.update(id, challenge={'kind': 'code-entry', 'url': url, 'code': '', 'expiresAt': time.time() + 900})
                        published = True
            if published:
                code = store.take_code(id)
                if code:
                    proc.stdin.write((code + '\n').encode())
                    proc.stdin.flush()
        if proc.returncode:
            raise RuntimeError('Native login failed')
        status = invoke(binary, ['auth', 'status', '--json'], directory, env)
        if status.get('loggedIn') is not True or status.get('authMethod') != 'claude.ai':
            raise RuntimeError('Native subscription login required')
        store.update(id, state='connected', challenge={})
        return {'reply': 'OK'}
    finally:
        selector.close()
        if proc.poll() is None:
            proc.kill()
        proc.communicate()
        if store.get(id)['state'] != 'connected':
            remove_profile(root, id)


def chat(store, id, model, messages, binary, root):
    directory, env = environment(root, id)
    options = messages if isinstance(messages, dict) else {'messages': messages}
    args = ['-p', '--model', model, '--output-format', 'json', '--tools', '',
            '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--safe-mode',
            '--setting-sources', '', '--disable-slash-commands', '--no-session-persistence']
    schema = options.get('response_format', {}).get('json_schema', {}).get('schema')
    if schema:
        args += ['--json-schema', json.dumps(schema)]
    # Preserve roles as data; no shell, tools, local project, hooks, or MCP access.
    prompt = 'Respond to the following conversation.\n' + json.dumps(options['messages'], ensure_ascii=False)
    try:
        result = invoke(binary, args, directory, env, prompt)
        if store.get(id)['state'] != 'connected':
            raise HTTPException(409, 'connection_disconnected')
        if result.get('is_error') or result.get('subtype') != 'success':
            raise RuntimeError('Incomplete native model response')
        text = json.dumps(result['structured_output'], ensure_ascii=False) if schema and 'structured_output' in result else result.get('result')
        if not isinstance(text, str) or not text.strip() or len(text) > (8000 if schema else 2000):
            raise RuntimeError('Invalid native model response')
        return {'reply': text.strip()}
    finally:
        if store.get(id)['state'] in ('expired', 'disconnected'):
            remove_profile(root, id)
