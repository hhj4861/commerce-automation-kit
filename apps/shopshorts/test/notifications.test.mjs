import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openNotifications, drainNotifications, notificationApi } from '../lib/notifications-local.mjs';
import { jobObservations, studioObservations } from '../lib/notification-events.mjs';

const event = (fields = {}) => ({ version: 1, id: randomUUID(), source: 'job', sourceId: 'test', title: '기획 확인', name: '테스트 상품', occurredAt: new Date().toISOString(), ...fields });
function fixture(t, options) {
  const dir = mkdtempSync(join(tmpdir(), 'cak-notifications-'));
  const store = openNotifications(dir, options);
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  return { dir, store };
}

test('queue survives restart, redelivery is idempotent and read state survives', async t => {
  let time = 1000;
  const { dir, store } = fixture(t, { now: () => time });
  const e = event(); store.queue.enqueue(e);
  const first = store.queue.receive(); store.deliver(first.event); store.markRead('a', e.id, true);
  // Simulate a second process after an interrupted consumer (no acknowledgement).
  const resumed = openNotifications(dir, { now: () => time });
  try {
    assert.equal(resumed.queue.receive(), null);
    time += 31_000;
    await drainNotifications(resumed.queue, resumed.deliver);
    assert.equal(resumed.list('a').items.length, 1);
    assert.equal(resumed.list('a').unreadCount, 0);
    assert.equal(resumed.queue.stats().inflight, 0);
    assert.equal(store.queue.ack(e.id, first.receipt), false);
  } finally { resumed.close(); }
});

test('leases are exclusive across connections and expired receipts cannot ack or retry', t => {
  let time = 0;
  const { dir, store } = fixture(t, { now: () => time });
  const other = openNotifications(dir, { now: () => time });
  try {
    const e = event(); store.queue.enqueue(e);
    const first = store.queue.receive(); assert.equal(other.queue.receive(), null);
    time = 30_001;
    assert.equal(store.queue.ack(e.id, first.receipt), false);
    assert.equal(store.queue.retry(e.id, first.receipt), false);
    const second = other.queue.receive();
    assert.notEqual(second.receipt, first.receipt);
    assert.equal(store.queue.ack(e.id, first.receipt), false);
    assert.equal(other.queue.ack(e.id, second.receipt), true);
  } finally { other.close(); }
});

test('delivery failures back off, reach dead letter, and explicitly retry only notifications', async t => {
  let time = 0;
  const { store } = fixture(t, { now: () => time, maxAttempts: 2 });
  store.queue.enqueue(event());
  let attempts = 0;
  const fail = () => { attempts++; throw new Error('private detail'); };
  await drainNotifications(store.queue, fail); await drainNotifications(store.queue, fail);
  assert.equal(attempts, 1); assert.equal(store.queue.stats().pending, 1);
  time = 1000; await drainNotifications(store.queue, fail);
  assert.equal(store.queue.stats().dead, 1);
  assert.equal(store.list('a').items.length, 0);
  assert.equal(store.queue.retryDead(), 1);
  await drainNotifications(store.queue, store.deliver);
  assert.equal(store.list('a').unreadCount, 1);
});

test('repeated crashed leases also reach dead letter', t => {
  let time = 0;
  const { store } = fixture(t, { now: () => time, maxAttempts: 2, leaseMs: 100 });
  store.queue.enqueue(event()); store.queue.receive();
  time = 101; store.queue.receive(); time = 202;
  assert.equal(store.queue.receive(), null); assert.equal(store.queue.stats().dead, 1);
});

test('observations deduplicate refreshes but record status round trips and task failures', async t => {
  const { store } = fixture(t);
  const job = { brief: { id: 'a', productName: '상품' }, status: 'draft' };
  store.observe(jobObservations(job)); store.observe(jobObservations({ ...job, updatedAt: 'later' }));
  store.observe(jobObservations({ ...job, status: 'script-approved' }));
  store.observe(jobObservations(job));
  store.observe(jobObservations({ ...job, finalize: { state: 'error', error: 'secret' } }));
  const project = { id: 's', title: '영상', task: { id: 't', action: 'render', state: 'failed' } };
  store.observe(studioObservations(project)); store.observe(studioObservations(project));
  await drainNotifications(store.queue, store.deliver);
  assert.equal(store.list('a').items.length, 4);
  assert.ok(!JSON.stringify(store.list('a')).includes('secret'));
});

test('read status and preferences are per account; mute preserves history', t => {
  const { store } = fixture(t); const e = event(); store.deliver(e);
  store.markRead('a', e.id, true); store.setPreference('a', false);
  assert.equal(store.list('a').unreadCount, 0); assert.equal(store.list('a').enabled, false);
  assert.equal(store.list('b').unreadCount, 1); assert.equal(store.list('b').enabled, true);
  store.markRead('a', e.id, false); assert.equal(store.list('a').unreadCount, 1);
  assert.equal(store.markRead('a', 'missing', true), false);
});

test('pagination has no duplicates and read-all never consumes later notifications', t => {
  const { store } = fixture(t);
  for (let i = 0; i < 55; i++) store.deliver(event());
  const first = store.list('a'); const next = store.list('a', { before: first.nextCursor });
  assert.equal(first.items.length, 50); assert.equal(next.items.length, 5);
  assert.equal(new Set([...first.items, ...next.items].map(x => x.id)).size, 55);
  store.deliver(event()); store.markAllRead('a', first.throughSeq);
  assert.equal(store.list('a', { unread: true }).items.length, 1);
  assert.equal(store.list('b').unreadCount, 56);
});

test('queue content cannot provide an external navigation target', t => {
  const { store } = fixture(t);
  store.deliver(event({ href: 'javascript:alert(1)', sourceId: '</a>?' }));
  assert.equal(store.list('a').items[0].href, '/?job=%3C%2Fa%3E%3F');
});

test('notification API validates actions, request bodies and missing records', async t => {
  const { store } = fixture(t);
  const call = (path, body) => notificationApi(new Request(`http://localhost/api/notifications${path}`, { method: 'POST', body: JSON.stringify(body) }), store, 'a');
  assert.equal((await call('/preferences', { enabled: 'false' })).status, 400);
  assert.equal((await call('/read-all', { throughSeq: -1 })).status, 400);
  assert.equal((await call('/read-all', null)).status, 400);
  assert.equal((await call(`/${randomUUID()}/read`, { read: true })).status, 404);
  assert.equal((await call('/retry', {})).status, 200);
  assert.equal((await notificationApi(new Request('http://localhost/api/notifications?before=no'), store, 'a')).status, 400);
});
