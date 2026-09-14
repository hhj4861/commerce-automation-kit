import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';

test('격리된 로컬 API에서 초안 승인 시 공통 생성 계획을 저장하고 올바른 클립만 받는다', { timeout: 30_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cak-common-video-test-'));
  const app = fileURLToPath(new URL('..', import.meta.url));
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: app, env: { ...process.env, SHOPSHORTS_PORT: '0', SHOPSHORTS_DATA_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (d) => { errors += d; });
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`서버 시작 실패: ${errors}`)), 10_000);
      child.on('error', (e) => { clearTimeout(timer); reject(e); });
      child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`서버 종료 ${code}: ${errors}`)); });
      child.stdout.on('data', (d) => {
        output += d;
        const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
        if (match) { clearTimeout(timer); resolve(Number(match[1])); }
      });
    });
    const call = async (path, body) => {
      const res = await fetch(`http://127.0.0.1:${port}/api/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return { status: res.status, data: await res.json() };
    };
    // 100 Continue 이후 본문을 보류해 서버가 잡을 읽은 뒤 다른 요청이 저장하는 경합을 재현한다.
    const approveDuring = async (id, during) => {
      let req;
      const response = new Promise((resolve, reject) => {
        req = request(`http://127.0.0.1:${port}/api/jobs/${id}/transition`, {
          method: 'POST', headers: { expect: '100-continue', 'content-type': 'application/json' },
        }, (res) => {
          let text = '';
          res.on('data', (d) => { text += d; });
          res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(text) }));
        });
        req.on('error', reject);
      });
      const ready = once(req, 'continue');
      req.flushHeaders();
      await ready;
      try { await during(); }
      finally { req.end(JSON.stringify({ to: 'script-approved' })); }
      return response;
    };
    // 실제 광고 컨셉과 같은 형태의 기획을 사용하되 외부 API/TTS/ffmpeg는 호출하지 않는다.
    const job = JSON.parse(await readFile(new URL('../../../packages/ad-video-gen/test/fixtures/shorts-job.json', import.meta.url), 'utf8'));
    assert.equal((await call('jobs', job)).status, 201);
    const estimate = await call(`jobs/${job.brief.id}/estimate`, {});
    assert.equal(estimate.data.model, 'seedance_2_0');
    assert.equal(estimate.data.referenceCredits, 126);
    const other = structuredClone(job);
    other.brief.id = 'concurrent-mug';
    other.script.briefId = other.brief.id;
    const approval = await approveDuring(job.brief.id, async () => {
      assert.equal((await call('jobs', other)).status, 201);
    });
    assert.equal(approval.status, 200, JSON.stringify(approval.data));
    assert.equal(approval.data.job.videoGeneration.plan.clips[0].model, 'seedance_2_0');
    const jobs = await (await fetch(`http://127.0.0.1:${port}/api/jobs`)).json();
    assert.equal(jobs.jobs.length, 2, '승인 중 등록된 다른 잡을 보존한다');
    assert.equal((await call(`jobs/${job.brief.id}/transition`, { to: 'generated', clipPaths: ['one.mp4'] })).status, 422);
    assert.equal((await call(`jobs/${job.brief.id}/set-link`, { platform: 'coupang', url: 'https://link.coupang.com/a/test123' })).status, 200);
    assert.equal((await call(`jobs/${job.brief.id}/transition`, { to: 'generated', clipPaths: ['a.mp4', 'b.mp4', 'c.mp4'] })).status, 200);
    const conflict = await approveDuring(other.brief.id, async () => {
      const edit = await fetch(`http://127.0.0.1:${port}/api/jobs/${other.brief.id}/video-direction`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ videoDirection: { ...other.videoDirection, extraStyle: 'Soft studio palette.' } }),
      });
      assert.equal(edit.status, 200);
    });
    assert.equal(conflict.status, 409, '승인 도중 수정한 기획을 덮어쓰지 않는다');
    const after = await (await fetch(`http://127.0.0.1:${port}/api/jobs`)).json();
    assert.equal(after.jobs.find((j) => j.brief.id === other.brief.id).status, 'draft');
    const invalid = structuredClone(job);
    invalid.brief.id = 'no-beats';
    invalid.script.briefId = 'no-beats';
    delete invalid.script.beats;
    assert.equal((await call('jobs', invalid)).status, 201);
    assert.equal((await call('jobs/no-beats/estimate', {})).status, 422);
  } finally {
    if (child.exitCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); }
    await rm(dir, { recursive: true, force: true });
  }
});
