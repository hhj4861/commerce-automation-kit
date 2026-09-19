import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../github-client.mjs';

test('GitHub masks values before safe multiline export; disallows response key injection', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cak-test-'));
  const env = { CAK_SECRETS_URL: 'https://broker.example', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://test.actions.githubusercontent.com/token', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'fixture-request', GITHUB_ENV: join(dir, 'env') };
  const logs = []; const original = console.log; console.log = line => logs.push(line);
  try {
    await writeFile(env.GITHUB_ENV, '');
    const fetcher = async url => new Response(JSON.stringify(String(url).includes('actions.githubusercontent.com') ? { value: 'fixture-oidc' } : { values: { ELEVENLABS_API_KEY: 'line1\nline2%\r' } }), { status: 200 });
    await run(env, fetcher);
    assert.match(logs[1], /^::add-mask::line1%0Aline2%25%0D$/);
    assert.match(await readFile(env.GITHUB_ENV, 'utf8'), /^ELEVENLABS_API_KEY<<CAK_/);
    const evil = async url => new Response(JSON.stringify(String(url).includes('actions.githubusercontent.com') ? { value: 'fixture-oidc' } : { values: { NODE_OPTIONS: '--import evil' } }));
    await assert.rejects(run(env, evil));
    await assert.rejects(run({ ...env, CAK_SECRETS_URL: 'http://broker.example' }, fetcher));
  } finally { console.log = original; await rm(dir, { recursive: true, force: true }); }
});
