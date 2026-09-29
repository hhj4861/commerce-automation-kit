#!/usr/bin/env python3
"""Synthetic CLI for subprocess tests. Never contacts an external provider."""
import json
import os
from pathlib import Path
import sys
import time

url = 'https://claude.com/cai/oauth/authorize?redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&response_type=code&code_challenge_method=S256&state=' + 's' * 43
profile = Path(os.environ['CLAUDE_CONFIG_DIR'])
assert not {'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'ACCOUNT_ENCRYPTION_KEY'} & os.environ.keys()
if sys.argv[1:3] == ['auth', 'login']:
    (profile / 'pid').write_text(str(os.getpid()))
    print('Opening browser to sign in...\n' + url, flush=True)
    if profile.parent.name == 'pending-profiles':
        time.sleep(60)
    else:
        assert sys.stdin.readline().strip() == 'one-time-test-authorization#' + 's' * 43
        (profile / 'fixture-authenticated').write_text('native-owned')
elif sys.argv[1:3] == ['auth', 'status']:
    print(json.dumps({'loggedIn': (profile / 'fixture-authenticated').exists(), 'authMethod': 'claude.ai'}))
else:
    assert '--safe-mode' in sys.argv and '--no-session-persistence' in sys.argv
    assert sys.argv[sys.argv.index('--tools') + 1] == ''
    assert '--strict-mcp-config' in sys.argv
    assert 'hello' in sys.stdin.read()
    print(json.dumps({'subtype': 'success', 'is_error': False, 'structured_output': {'reason': 'ok'}}))
