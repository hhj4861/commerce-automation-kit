import assert from 'node:assert/strict';
import test from 'node:test';
import { updateJobWithRetry } from '../lib/job-updates.js';

test('409이면 최신 작업을 읽고 패치를 재계산해 사람 메모를 보존한다', async () => {
  let puts = 0;
  let current = { brief: { id: 'a' }, status: 'generated', note: '처음', count: 0 };
  const api = async (_, opts) => {
    if (!opts) return { jobs: [structuredClone(current)] };
    puts++;
    if (puts === 1) {
      current = { ...current, note: '사람 메모', count: 10 };
      throw Object.assign(new Error('충돌'), { status: 409 });
    }
    current = JSON.parse(opts.body);
  };
  await updateJobWithRetry(api, 'a', async (fresh) => ({ count: fresh.count + 1 }));
  assert.equal(puts, 2);
  assert.equal(current.note, '사람 메모');
  assert.equal(current.count, 11);
});

test('재시도 중 반려를 발견하면 null 패치로 쓰기를 중단한다', async () => {
  let puts = 0;
  const api = async (_, opts) => {
    if (!opts) return { jobs: [{ brief: { id: 'a' }, status: puts ? 'rejected' : 'script-approved' }] };
    puts++;
    throw Object.assign(new Error('충돌'), { status: 409 });
  };
  const result = await updateJobWithRetry(api, 'a', (fresh) => fresh.status === 'rejected' ? null : { note: '결과' });
  assert.equal(puts, 1);
  assert.equal(result.status, 'rejected');
});

test('충돌은 3회로 제한하고 다른 HTTP 실패는 재시도하지 않는다', async () => {
  for (const status of [409, 500, 403]) {
    let puts = 0;
    const api = async (_, opts) => {
      if (!opts) return { jobs: [{ brief: { id: 'a' }, status: 'draft' }] };
      puts++;
      throw Object.assign(new Error('실패'), { status });
    };
    await assert.rejects(updateJobWithRetry(api, 'a', () => ({ note: '결과' })), /실패/);
    assert.equal(puts, status === 409 ? 3 : 1);
  }
});
