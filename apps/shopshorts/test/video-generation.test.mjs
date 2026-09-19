import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { prepareShortsVideo } from '../video-generation.mjs';
import { shortsGenerationRequest, videoGenerationProblem, videoInputFingerprint } from '../lib/video-generation.js';
import { onRequest } from '../functions/api/[[path]].js';

export function sampleJob() {
  return {
    brief: { id: 'quality-mug', productName: '테스트 머그', appealPoints: ['분리형 손잡이'], createdAt: '2026-09-14T00:00:00Z' },
    script: {
      briefId: 'quality-mug', title: '테스트 머그 구조 소개', hookType: 'demo', hashtags: [], description: '테스트 머그의 구조를 소개합니다.',
      beats: [
        { index: 0, role: 'hook', durationSec: 3, narration: '테스트 머그를 살펴보세요', caption: '분리형 손잡이', visualPrompt: 'A travel mug on a sculptural stone surface.' },
        { index: 1, role: 'body', durationSec: 5, narration: '손잡이를 분리하고 다시 끼워요', caption: '손잡이 분리', visualPrompt: 'The handle detaches and locks back into place.' },
        { index: 2, role: 'cta', durationSec: 5, narration: '제품 정보를 확인하세요', caption: '제품 정보 확인', visualPrompt: 'A close-up of the finished product.' },
      ],
    },
    videoDirection: {
      evidence: ['테스트용 제품 명세'], uniqueness: { passed: true, rationale: 'Detachable handle shown in a single continuous motion.' },
      narrativeComplete: true, emphasis: { 2: 'hero' },
    },
    status: 'script-approved', lintChecked: true,
  };
}

class Db {
  constructor(job) { this.job = job ? structuredClone(job) : null; }
  prepare(sql) {
    const db = this;
    return {
      bind(...args) { this.args = args; return this; },
      async first() {
        const snapshot = db.job ? { data: JSON.stringify(db.job) } : null;
        if (db.afterRead) { const pause = db.afterRead; delete db.afterRead; await pause(); }
        return snapshot;
      },
      async run() {
        if (sql.startsWith('UPDATE jobs SET data')) {
          if (!db.job || JSON.stringify(db.job) !== this.args[4]) return { meta: { changes: 0 } };
          db.job = JSON.parse(this.args[1]);
          return { meta: { changes: 1 } };
        }
        if (!sql.startsWith('INSERT INTO jobs')) throw new Error(sql);
        db.job = JSON.parse(this.args[1]);
        return { meta: { changes: 1 } };
      },
    };
  }
}
const call = (db, path, method, body, worker = false) => onRequest({
  env: { DB: db },
  request: new Request(`https://example.test/api/${path}`, {
    method, headers: { 'content-type': 'application/json', ...(worker ? { 'x-shopshorts-worker': '1' } : {}) },
    body: JSON.stringify(body),
  }),
});

let prepared;
before(async () => { prepared = await prepareShortsVideo(sampleJob()); });

test('공통 CLI를 실제 실행하여 광고 확정본 품질의 쇼츠 계획을 만든다', () => {
  assert.equal(prepared.plan.clips.length, 3);
  assert.equal(prepared.plan.tier, 'standard');
  for (const clip of prepared.plan.clips) {
    assert.equal(clip.model, 'seedance_2_0');
    assert.equal(clip.resolution, '1080p');
    assert.match(clip.prompt, /High-end cinematic TV commercial/);
    assert.match(clip.prompt, /central safe area/);
  }
  assert.match(prepared.plan.clips[2].prompt, /GLORIFY PRODUCT/);
});

test('미승인 입력 플래그로 승인 상태를 만들거나 누락 기획을 자동 합성하지 않는다', async () => {
  const job = sampleJob();
  job.status = 'draft';
  job.videoDirection.humanApproved = true;
  assert.throws(() => shortsGenerationRequest(job), /기획 승인/);
  job.status = 'script-approved';
  delete job.videoDirection;
  await assert.rejects(prepareShortsVideo(job), /videoDirection/);
});

test('대본 편집·상품 변경·티어 변경은 기존 계획을 무효화한다', async () => {
  for (const change of [
    (j) => { j.script.beats[0].visualPrompt = 'A different scene.'; },
    (j) => { j.brief.productName = '다른 머그'; },
    (j) => { j.videoTier = 'draft'; },
  ]) {
    const job = { ...sampleJob(), videoGeneration: structuredClone(prepared) };
    change(job);
    assert.match(await videoGenerationProblem(job), /변경/);
  }
});

test('JSON 키 순서만 바뀐 입력은 같은 계획으로 인식한다', async () => {
  const job = sampleJob();
  const reversed = { ...job, brief: Object.fromEntries(Object.entries(job.brief).reverse()) };
  assert.equal(await videoInputFingerprint(job), await videoInputFingerprint(reversed));
});

test('제휴 링크와 고지 변경은 영상 계획을 유지하고 표현 검증은 다시 요구한다', async () => {
  const db = new Db({ ...sampleJob(), videoGeneration: prepared });
  const linked = await call(db, 'jobs/quality-mug/set-link', 'POST', { platform: 'coupang', url: 'https://link.coupang.com/a/test123' });
  assert.equal(linked.status, 200, await linked.text());
  assert.equal(await videoGenerationProblem(db.job), null);
  assert.notEqual(db.job.lintChecked, true);
  assert.equal((await call(db, 'jobs/quality-mug/transition', 'POST', { to: 'generated', clipPaths: ['a', 'b', 'c'] })).status, 422);
  assert.equal((await call(db, 'jobs/quality-mug', 'PUT', { ...db.job, lintChecked: true }, true)).status, 200);
  assert.equal((await call(db, 'jobs/quality-mug/transition', 'POST', { to: 'generated', clipPaths: ['a', 'b', 'c'] })).status, 200);
});

test('클라우드는 티어 이름만 유지한 품질 하향과 비용 확인 생략을 거부한다', async () => {
  for (const change of [
    (p) => { p.clips[0].model = 'kling3_0'; },
    (p) => { p.clips[0].resolution = '480p'; },
    (p) => { p.clips[0].generateAudio = true; },
    (p) => { p.costPreflightRequired = false; },
    (p) => { p.clips[0].generationDurationSec = 3; },
  ]) {
    const db = new Db(sampleJob());
    const modified = structuredClone(prepared);
    change(modified.plan);
    assert.equal((await call(db, 'jobs/quality-mug', 'PUT', { ...db.job, videoGeneration: modified }, true)).status, 422);
  }
});

test('클라우드 등록 → 승인 → 공통 계획 수신 → 생성 완료가 연결된다', async () => {
  const db = new Db();
  const input = sampleJob();
  const created = await call(db, 'jobs', 'POST', { ...input, videoGeneration: prepared });
  assert.equal(created.status, 201);
  assert.deepEqual(db.job.videoDirection, input.videoDirection);
  assert.equal(db.job.status, 'draft');
  assert.equal(db.job.videoGeneration, undefined);
  assert.equal((await call(db, 'jobs/quality-mug/transition', 'POST', { to: 'script-approved' })).status, 200);
  const result = await call(db, 'jobs/quality-mug', 'PUT', { ...db.job, lintChecked: true, videoGeneration: prepared }, true);
  assert.equal(result.status, 200, await result.text());
  const complete = await call(db, 'jobs/quality-mug/transition', 'POST', { to: 'generated', clipPaths: ['a.mp4', 'b.mp4', 'c.mp4'] });
  assert.equal(complete.status, 200, await complete.text());
  assert.equal(db.job.status, 'generated');
});

test('계획 없는 클립 생성 완료는 transition과 worker PUT 모두 거부한다', async () => {
  const db = new Db(sampleJob());
  assert.equal((await call(db, 'jobs/quality-mug/transition', 'POST', { to: 'generated', clipPaths: ['a.mp4'] })).status, 422);
  assert.equal((await call(db, 'jobs/quality-mug', 'PUT', { ...db.job, status: 'generated', clipPaths: ['a.mp4'] }, true)).status, 422);
  assert.equal(db.job.status, 'script-approved');
});

test('워커가 승인된 대본을 수정하거나 사람 승인 자체를 대신할 수 없다', async () => {
  const db = new Db({ ...sampleJob(), videoGeneration: prepared });
  const edit = structuredClone(db.job);
  edit.script.beats[0].narration = '바꾼 대본';
  assert.equal((await call(db, 'jobs/quality-mug', 'PUT', edit, true)).status, 409);
  assert.equal((await call(db, 'jobs/quality-mug/video-direction', 'PUT', { videoDirection: {} })).status, 409);
  assert.equal((await call(db, 'jobs/quality-mug/transition', 'POST', { to: 'draft' })).status, 200);
  assert.equal(db.job.videoGeneration, undefined);
  assert.equal((await call(db, 'jobs/quality-mug', 'PUT', { ...db.job, status: 'script-approved' }, true)).status, 422);
});

test('순서가 뒤섞인 대본과 장면 수가 다른 결과를 거부한다', async () => {
  const job = sampleJob();
  job.script.beats.reverse();
  assert.throws(() => shortsGenerationRequest(job), /순서/);
  const valid = { ...sampleJob(), videoGeneration: prepared };
  assert.match(await videoGenerationProblem(valid, ['one.mp4']), /클립 파일 수/);
});

test('클라우드 워커 저장 도중 사람 반려가 발생하면 승인을 되살리지 않는다', async () => {
  const db = new Db({ ...sampleJob(), videoGeneration: prepared });
  const stale = structuredClone(db.job);
  let release, started;
  const read = new Promise((r) => { started = r; });
  const resume = new Promise((r) => { release = r; });
  db.afterRead = async () => { started(); await resume; };
  const workerSave = call(db, 'jobs/quality-mug', 'PUT', stale, true);
  await read;
  try {
    assert.equal((await call(db, 'jobs/quality-mug/transition', 'POST', { to: 'rejected' })).status, 200);
  } finally { release(); }
  assert.equal((await workerSave).status, 409);
  assert.equal(db.job.status, 'rejected');
  assert.equal(db.job.videoGeneration, undefined);
});

test('요청 시작 전에도 오래된 워커 스냅샷은 최신 작업 내용을 덮어쓸 수 없다', async () => {
  const db = new Db({ ...sampleJob(), updatedAt: '2026-09-14T01:00:00Z' });
  const stale = structuredClone(db.job);
  db.job.updatedAt = '2026-09-14T01:01:00Z';
  db.job.note = '사람이 추가한 검수 의견';
  assert.equal((await call(db, 'jobs/quality-mug', 'PUT', stale, true)).status, 409);
  assert.equal(db.job.note, '사람이 추가한 검수 의견');
});
