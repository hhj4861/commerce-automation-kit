import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { safeClaudeLogin, loginClaude, claudeArgs, claudeEnvironment, parseClaudeEvents, readClaudeCredential, executeClaudeAccountJob, generateClaude, setupCredential } from '../studio-account-claude.mjs';
import { accountFailureMessage, classifyClaudeFailure } from '../lib/llm-account-errors.js';

const url = 'https://claude.com/cai/oauth/authorize?state=state-bound-123&code_challenge=fixture-challenge&code_challenge_method=S256&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback';
const setup = { kind: 'claude-setup-token-v1', accessToken: 'sk-ant-oat01-' + 'x'.repeat(96) };
const wire = value => JSON.stringify(value) + '\n';
const oauth = token => ({ claudeAiOauth: { accessToken: 'fixture-access', refreshToken: token, expiresAt: Date.now() + 60000, scopes: ['user:inference', 'user:profile'] } });
const brief = { category: '심리학', format: 'short', duration: 32, focus: 'topic', topic: '집중력', direction: '' };
const suggestions = { suggestions: Array.from({ length: 3 }, (_, i) => ({ topic: `주제 ${i}`, direction: '차분한 설명', reason: '검색 근거' })), sources: [{ title: '자료', url: 'https://example.org/source' }] };
function child(onInput = () => {}) {
  const value = new EventEmitter();
  value.stdout = new PassThrough(); value.stderr = new PassThrough();
  value.stdin = new Writable({ write(chunk, _encoding, callback) { onInput(String(chunk)); callback(); } });
  value.kill = () => { queueMicrotask(() => value.emit('close', 1)); return true; };
  return value;
}

test('Claude URL only accepts official PKCE authorization and registered callback', () => {
  assert.equal(safeClaudeLogin(url).state, 'state-bound-123');
  for (const bad of [url.replace('https://claude.com', 'https://evil.test'), url.replace('/cai/oauth/authorize', '/other'), url.replace('S256', 'plain'), url.replace('platform.claude.com', 'evil.test'), url + '#fragment']) assert.throws(() => safeClaudeLogin(bad));
});

test('official login receives only state-matched one-time code, erased before stdin write', async () => {
  let saved, consumed = false, input;
  const c = child(text => { assert.equal(consumed, true); input = JSON.parse(text).code; queueMicrotask(() => { c.stdout.write(wire({ type: 'credential', accessToken: setup.accessToken })); c.emit('close', 0); }); });
  await loginClaude({ HOME: '/private/fixture', PATH: '/bin', CLAUDE_CONFIG_DIR: '/private/fixture/.claude' }, {
    update: async patch => { if (patch.job.manual) saved = patch.job.manual; if (patch.job.code === null) consumed = true; },
    read: async () => ({ job: { code: 'authcode123#state-bound-123' } }), pollMs: 1,
    spawnProcess: (bin, args, options) => { assert.match(bin, /claude-auth-venv\/bin\/python$/); assert.match(args[0], /studio-claude-login\.py$/); assert.equal(options.env.BROWSER, '/usr/bin/true'); setTimeout(() => c.stdout.write(wire({ type: 'authorization', url })), 0); return c; },
  });
  assert.equal(saved.url, url); assert.equal(input, 'authcode123#state-bound-123');
});

test('cancel terminates official login and wrong-state code is never fed to CLI', async () => {
  let writes = 0;
  for (const cancelled of [false, true]) {
    const controller = new AbortController(); const c = child(() => writes++);
    await assert.rejects(loginClaude({ HOME: '/fixture' }, { signal: controller.signal, pollMs: 1,
      update: async () => { if (cancelled) controller.abort(); }, read: async () => ({ job: { code: 'authcode123#wrong-state' } }),
      spawnProcess: () => { setTimeout(() => c.stdout.write(wire({ type: 'authorization', url })), 0); return c; },
    }));
  }
  assert.equal(writes, 0);
});

test('generation exposes only WebSearch and drops inherited auth, endpoint and plugin settings', () => {
  const env = claudeEnvironment({ HOME: '/isolated', PATH: '/bin', CLAUDE_CONFIG_DIR: '/isolated/.claude', ANTHROPIC_API_KEY: 'bad', CLAUDE_CODE_OAUTH_TOKEN: 'bad', ANTHROPIC_BASE_URL: 'https://evil.test', CLAUDE_CODE_USE_BEDROCK: '1' });
  assert.deepEqual(Object.keys(env), ['HOME', 'PATH', 'CLAUDE_CONFIG_DIR']);
  const args = claudeArgs('sonnet');
  assert.equal(args[args.indexOf('--tools') + 1], 'WebSearch');
  assert.equal(args[args.indexOf('--permission-mode') + 1], 'dontAsk');
  assert.ok(args.includes('--strict-mcp-config')); assert.throws(() => claudeArgs('bad model;cmd'));
});

test('Claude results require successful completion and actual successful WebSearch result', () => {
  const search = [{ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'WebSearch', id: 's1' }] } }, { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 's1', content: 'results' }] } }];
  const result = { type: 'result', subtype: 'success', is_error: false, result: JSON.stringify(suggestions) };
  const lines = values => values.map(v => JSON.stringify(v)).join('\n');
  assert.deepEqual(parseClaudeEvents(lines([...search, result])), { searched: true, value: suggestions });
  assert.equal(parseClaudeEvents(lines([result])).searched, false);
  search[1].message.content[0].is_error = true;
  assert.equal(parseClaudeEvents(lines([...search, result])).searched, false);
  for (const values of [search, [{ ...result, is_error: true }], [{ ...result, result: 'not JSON' }]]) assert.throws(() => parseClaudeEvents(lines(values)));
});

test('credential capture prefers refreshed isolated macOS Keychain over stale file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'claude-credential-test-'));
  try {
    await writeFile(join(dir, '.credentials.json'), JSON.stringify(oauth('old')), { mode: 0o600 });
    const env = { CLAUDE_CONFIG_DIR: dir };
    assert.equal((await readClaudeCredential(env, { platform: 'linux' })).claudeAiOauth.refreshToken, 'old');
    const current = await readClaudeCredential(env, { platform: 'darwin', execute: async (_bin, args) => { assert.match(args[2], /^Claude Code-credentials-[a-f0-9]{8}$/); return { stdout: JSON.stringify(oauth('rotated')) }; } });
    assert.equal(current.claudeAiOauth.refreshToken, 'rotated');
    await assert.rejects(readClaudeCredential(env, { platform: 'darwin', execute: async () => { throw Object.assign(Error('private diagnostic'), { code: 36 }); } }), e => !e.message.includes('private diagnostic'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('connected Claude credential powers recommendation, rotation is persisted on failure', async () => {
  let runtime; const patches = [];
  await assert.rejects(executeClaudeAccountJob({ credential: { credentials: oauth('original') }, job: { kind: 'recommend', input: brief } }, {
    env: { PATH: '/bin', HOME: '/operator', ANTHROPIC_API_KEY: 'must-not-inherit', SHOPSHORTS_CLAUDE_MODEL: 'sonnet' },
    identify: async env => { runtime = env; assert.notEqual(env.HOME, '/operator'); assert.equal(env.ANTHROPIC_API_KEY, undefined); return { loggedIn: true }; },
    credential: env => readClaudeCredential(env, { platform: 'linux' }), cleanup: async () => {},
    update: async patch => patches.push(patch), generator: env => async (_prompt, options) => { assert.equal(options.model, 'sonnet'); await writeFile(join(env.CLAUDE_CONFIG_DIR, '.credentials.json'), JSON.stringify(oauth('rotated'))); throw Error('fixture generation failure'); },
  }), /fixture generation failure/);
  assert.equal(patches.at(-1).credential.credentials.claudeAiOauth.refreshToken, 'rotated');
  await assert.rejects(stat(runtime.HOME), { code: 'ENOENT' });
});

test('Claude login stores official credential and account label, cleans temporary runtime', async () => {
  let runtime, saved;
  await executeClaudeAccountJob({ job: { kind: 'connect' } }, {
    login: async env => { runtime = env; return setup; },
    credential: env => readClaudeCredential(env, { platform: 'linux' }), cleanup: async () => {},
    identify: async () => { throw Error('setup-token must not read Keychain auth status'); }, update: async patch => { saved = patch; },
  });
  assert.equal(saved.provider, 'claude'); assert.equal(saved.account, 'Claude 구독 계정'); assert.equal(saved.job.state, 'done'); assert.equal(saved.job.code, null);
  assert.equal(saved.credential.accessToken, setup.accessToken);
  await assert.rejects(stat(runtime.HOME), { code: 'ENOENT' });
});

test('Claude refresh persistence failure retains private cache without returning secret diagnostics', async () => {
  let runtime;
  try {
    await assert.rejects(executeClaudeAccountJob({ credential: { credentials: oauth('original') }, job: { kind: 'recommend', input: brief } }, {
      identify: async env => { runtime = env; return {}; }, credential: env => readClaudeCredential(env, { platform: 'linux' }), cleanup: async () => {},
      generator: () => async () => ({ value: suggestions, searched: true }), update: async () => { throw Error('storage unavailable'); },
    }), /storage unavailable/);
    assert.equal((await stat(runtime.HOME)).mode & 0o777, 0o700);
    assert.equal((await stat(join(runtime.CLAUDE_CONFIG_DIR, '.credentials.json'))).mode & 0o777, 0o600);
  } finally { if (runtime) await rm(runtime.HOME, { recursive: true, force: true }); }
});

test('CLI failures expose a fixed actionable reason, never raw output or credentials', async () => {
  for (const [diagnostic, code] of [
    ['authentication_error: token expired', 'CLAUDE_AUTH_FAILED'],
    ['rate_limit_error: usage limit reached', 'CLAUDE_RATE_LIMITED'],
    ['keychain: user interaction is not allowed', 'CLAUDE_KEYCHAIN_FAILED'],
    ['fetch failed ECONNRESET', 'CLAUDE_NETWORK_FAILED'],
    ['unrecognized private diagnostic', 'CLAUDE_REQUEST_FAILED'],
  ]) {
    const c = child();
    await assert.rejects(generateClaude({ HOME: '/isolated' }, { spawnProcess() {
      setTimeout(() => { c.stderr.write(diagnostic + ' fixture-secret-token'); c.stdout.write('private-auth-url'); c.emit('close', 1); }, 0);
      return c;
    } })('fixture prompt'), error => {
      assert.equal(error.code, code);
      assert.doesNotMatch(error.message, /fixture-secret-token|private-auth-url|private diagnostic/);
      assert.equal(accountFailureMessage('claude', error), error.message);
      return true;
    });
  }
  assert.equal(classifyClaudeFailure('No diagnostic'), 'CLAUDE_REQUEST_FAILED');
  assert.doesNotMatch(accountFailureMessage('claude', Error('private-secret')), /private-secret/);
});

test('official login failures are distinguished from recommendation failures', async () => {
  const c = child();
  await assert.rejects(loginClaude({ HOME: '/isolated' }, { update: async () => {}, read: async () => ({}), spawnProcess() {
    setTimeout(() => c.emit('close', 1), 0); return c;
  } }), { code: 'CLAUDE_LOGIN_FAILED' });
});

test('stream result error is classified without exposing the provider response', () => {
  assert.throws(() => parseClaudeEvents(JSON.stringify({ type: 'result', is_error: true, subtype: 'error', result: 'rate_limit_error private-account-data' })), error => {
    assert.equal(error.code, 'CLAUDE_RATE_LIMITED'); assert.doesNotMatch(error.message, /private-account-data/); return true;
  });
  assert.throws(() => parseClaudeEvents('invalid private output'), { code: 'CLAUDE_OUTPUT_INVALID' });
});


test('setup-token recommendation passes only that owner token and never touches Keychain', async () => {
  let runtime, result;
  const forbidden = async () => { throw Error('Keychain path must not be called'); };
  await executeClaudeAccountJob({ credential: setup, job: { kind: 'recommend', input: brief } }, {
    env: { HOME: '/operator', PATH: '/bin', CLAUDE_CODE_OAUTH_TOKEN: 'operator-secret' },
    identify: forbidden, credential: forbidden, cleanup: forbidden,
    generator: (env, options) => { runtime = env; assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, undefined); assert.equal(options.oauthToken, setup.accessToken); return async () => ({ searched: true, value: suggestions }); },
    update: async patch => { result = patch; },
  });
  assert.equal(result.job.state, 'done'); assert.equal(result.job.result.provider, 'claude');
  await assert.rejects(stat(runtime.HOME), { code: 'ENOENT' });
});

test('explicit owner OAuth token reaches the CLI without importing operator credentials', async () => {
  const c = child();
  const result = await generateClaude({ HOME: '/isolated', CLAUDE_CODE_OAUTH_TOKEN: 'operator-secret' }, { oauthToken: setup.accessToken, spawnProcess(_bin, _args, options) {
    assert.equal(options.env.CLAUDE_CODE_OAUTH_TOKEN, setup.accessToken);
    queueMicrotask(() => { c.stdout.write(wire({ type: 'result', subtype: 'success', result: JSON.stringify(suggestions) })); c.emit('close', 0); }); return c;
  } })('prompt');
  assert.equal(result.value.suggestions.length, 3);
  assert.equal(setupCredential({ ...setup, accessToken: 'sk-ant-api03-' + 'x'.repeat(96) }), false);
});

test('new login never calls Keychain and retains restricted recovery file if vault write fails', async () => {
  let runtime;
  try {
    await assert.rejects(executeClaudeAccountJob({ job: { kind: 'connect' } }, {
      login: async env => { runtime = env; return setup; },
      identify: async () => { throw Error('must not identify through Keychain'); },
      cleanup: async () => { throw Error('must not clear Keychain'); },
      update: async () => { throw Error('vault unavailable'); },
    }), /vault unavailable/);
    const file = join(runtime.CLAUDE_CONFIG_DIR, 'setup-token.json');
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.equal(JSON.parse(await readFile(file, 'utf8')).accessToken, setup.accessToken);
  } finally { if(runtime) await rm(runtime.HOME, { recursive: true, force: true }); }
});
