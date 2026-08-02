import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequest } from '../functions/api/[[path]].js';

class Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async first() {
    if (this.sql.startsWith('SELECT data FROM jobs')) {
      const job = this.db.jobs.get(this.args[0]);
      return job ? { data: JSON.stringify(job) } : null;
    }
    return null;
  }

  async run() {
    if (this.sql.startsWith('DELETE FROM jobs')) {
      const changed = this.db.jobs.delete(this.args[0]) ? 1 : 0;
      return { meta: { changes: changed } };
    }
    if (this.sql.startsWith('DELETE FROM draft_requests')) {
      const changed = this.db.requests.delete(this.args[0]) ? 1 : 0;
      return { meta: { changes: changed } };
    }
    throw new Error(`지원하지 않는 테스트 SQL: ${this.sql}`);
  }
}

class FakeDb {
  constructor({ jobs = [], requests = [] } = {}) {
    this.jobs = new Map(jobs.map((job) => [job.brief.id, structuredClone(job)]));
    this.requests = new Set(requests);
  }

  prepare(sql) {
    return new Statement(this, sql);
  }
}

function envWith(job, requests = []) {
  const deletedMedia = [];
  return {
    env: {
      DB: new FakeDb({ jobs: job ? [job] : [], requests }),
      MEDIA: { delete: async (key) => deletedMedia.push(key) },
    },
    deletedMedia,
  };
}

test('DELETE /jobs/:id 는 D1 작업과 R2 preview/final을 함께 삭제한다', async () => {
  const job = { brief: { id: 'delete-me' }, script: {}, status: 'draft' };
  const { env, deletedMedia } = envWith(job);
  const response = await onRequest({
    request: new Request('https://example.test/api/jobs/delete-me', { method: 'DELETE' }),
    env,
  });

  assert.equal(response.status, 200);
  assert.equal(env.DB.jobs.has('delete-me'), false);
  assert.deepEqual(deletedMedia, [
    'jobs/delete-me/preview.mp4',
    'jobs/delete-me/final.mp4',
  ]);
});

test('실행 중인 콘텐츠는 삭제하지 않는다', async () => {
  const job = {
    brief: { id: 'busy-job' },
    script: {},
    status: 'generated',
    finalize: { state: 'running' },
  };
  const { env, deletedMedia } = envWith(job);
  const response = await onRequest({
    request: new Request('https://example.test/api/jobs/busy-job', { method: 'DELETE' }),
    env,
  });

  assert.equal(response.status, 409);
  assert.equal(env.DB.jobs.has('busy-job'), true);
  assert.deepEqual(deletedMedia, []);
});

test('DELETE /draft-requests/:slug 는 대기 요청을 취소하고 없는 요청은 404다', async () => {
  const { env } = envWith(null, ['waiting-topic']);
  const first = await onRequest({
    request: new Request('https://example.test/api/draft-requests/waiting-topic', { method: 'DELETE' }),
    env,
  });
  const second = await onRequest({
    request: new Request('https://example.test/api/draft-requests/waiting-topic', { method: 'DELETE' }),
    env,
  });

  assert.equal(first.status, 200);
  assert.equal(second.status, 404);
});

test('빈 키워드 피드는 기존 데이터를 지우기 전에 422로 거부한다', async () => {
  const { env } = envWith(null);
  const response = await onRequest({
    request: new Request('https://example.test/api/keyword-feeds/trend', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: [] }),
    }),
    env,
  });
  const result = await response.json();

  assert.equal(response.status, 422);
  assert.match(result.error, /빈 피드/);
});

test('잘못된 아카이브 날짜는 DB 변경 전에 거부한다', async () => {
  const { env } = envWith(null);
  const response = await onRequest({
    request: new Request('https://example.test/api/keyword-feeds/blog', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ snapshotDate: '31-07-2026', archiveOnly: true, items: [{ topic: '복구 항목', score: 1 }] }),
    }),
    env,
  });

  assert.equal(response.status, 400);
});
