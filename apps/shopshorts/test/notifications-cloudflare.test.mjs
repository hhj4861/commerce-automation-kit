import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { openNotifications } from '../lib/notifications-local.mjs';
import { cloudflareQueue, decodeMessage } from '../lib/notifications-cloudflare.mjs';
import { notificationConfig, notificationTransport } from '../lib/notification-transport.mjs';
import { provisionQueues } from '../notification-queue.mjs';

const config = { provider: 'cloudflare', accountId: 'a'.repeat(32), queueId: 'b'.repeat(32), deadLetterQueueId: 'c'.repeat(32), token: 'test-secret' };
const event = () => ({ version: 1, id: randomUUID(), source: 'job', sourceId: 'one', title: '기획 확인', name: '상품' });
const envelope = e => ({ id: randomUUID(), lease_id: randomUUID(), body: Buffer.from(JSON.stringify(e)).toString('base64'), metadata: { 'CF-Content-Type': 'json' } });
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'cf-notifications-'));
  let time = 0;
  const store = openNotifications(dir, { now: () => time });
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  const messages = [], dead = [], calls = [];
  const flags = { failPublish: false, failAck: false, hold: false };
  const fetchImpl = async (url, init) => {
    assert.ok(url.startsWith('https://api.cloudflare.com/'));
    assert.equal(init.headers.authorization, 'Bearer test-secret');
    const body = JSON.parse(init.body); calls.push({ url, body });
    const queue = url.includes(config.deadLetterQueueId) ? dead : messages;
    if (url.endsWith('/pull')) return Response.json({ success: true, result: { messages: flags.hold ? [] : [...queue] } });
    if (url.endsWith('/ack')) {
      if (flags.failAck) throw new Error('test-secret');
      for (const ack of body.acks) { const i = queue.findIndex(m => m.lease_id === ack.lease_id); if (i >= 0) queue.splice(i, 1); }
    } else {
      if (flags.failPublish) return Response.json({ success: false, errors: [{ code: 100, message: 'test-secret' }] }, { status: 503 });
      assert.equal(body.content_type, 'json'); messages.push(envelope(body.body));
    }
    return Response.json({ success: true, result: {} });
  };
  const transport = notificationTransport(store, config, { fetchImpl, now: () => time });
  return { dir, store, transport, messages, dead, calls, flags, advance: ms => { time += ms; } };
}

test('Cloudflare roundtrip uses lease_id and preserves existing read state', async t => {
  const f = fixture(t), old = event(), next = event();
  f.store.deliver(old); f.store.markRead('user', old.id, true);
  f.store.queue.enqueue(next); await f.transport.tick();
  assert.equal(f.store.list('user').items.length, 2);
  assert.equal(f.store.list('user').unreadCount, 1);
  assert.deepEqual(f.store.queue.stats(), { pending: 0, inflight: 0, dead: 0 });
  assert.equal(f.messages.length, 0);
  assert.ok(f.calls.some(c => c.body.acks?.[0]?.lease_id));
});

test('publish outage retains outbox; remote success lost before ack safely redelivers', async t => {
  const f = fixture(t), e = event(); f.store.queue.enqueue(e);
  f.flags.failPublish = true;
  await assert.rejects(f.transport.tick(), /HTTP 503/);
  assert.equal(f.store.queue.stats().pending, 1); assert.equal(f.store.list('a').items.length, 0);
  f.flags.failPublish = false; f.flags.failAck = true; f.advance(1000);
  await assert.rejects(f.transport.tick(), /연결 실패/);
  assert.equal(f.store.list('a').items.length, 1); assert.equal(f.messages.length, 1);
  f.flags.failAck = false; await f.transport.tick();
  assert.equal(f.store.list('a').items.length, 1); assert.equal(f.messages.length, 0);
});

test('published recovery copy survives restart and replays after retention lapse', async t => {
  const f = fixture(t), e = event(); f.store.queue.enqueue(e); f.flags.hold = true;
  await f.transport.tick(); assert.equal(f.store.queue.stats().pending, 1);
  const reopened = openNotifications(f.dir, { now: () => 25 * 3600_000 });
  try { assert.equal(reopened.queue.receive(true).event.id, e.id); }
  finally { reopened.close(); }
  f.advance(25 * 3600_000 + 31_000); f.messages.splice(0); f.flags.hold = false;
  await f.transport.tick(); assert.equal(f.store.list('a').items.length, 1);
});

test('inbox errors retry without ack; DLQ is durable, visible and manually retryable', async t => {
  const f = fixture(t), e = event(); f.messages.push(envelope(e));
  const deliver = f.store.deliver; f.store.deliver = () => { throw new Error('disk failure'); };
  await assert.rejects(f.transport.tick(), /재시도/);
  assert.ok(f.calls.some(c => c.body.retries?.length)); assert.equal(f.messages.length, 1);
  f.messages.splice(0); f.dead.push(envelope(e)); f.advance(60_000);
  await f.transport.tick(); assert.equal(f.dead.length, 0); assert.equal(f.store.queue.stats().dead, 1);
  f.store.deliver = deliver; f.store.queue.retryDead(); await f.transport.tick();
  assert.equal(f.store.list('a').items.length, 1);
});

test('malformed DLQ bodies are kept; DLQ cannot resurrect a delivered event', async t => {
  const f = fixture(t), e = event(); f.store.deliver(e);
  f.dead.push(envelope(e), { id: 'broken', lease_id: 'lease', body: '???', metadata: { 'CF-Content-Type': 'v8' } });
  await f.transport.tick(); assert.equal(f.dead.length, 0); assert.equal(f.store.queue.stats().dead, 1);
  assert.equal(f.store.list('a').items.length, 1);
});

test('wire format decoding and remote errors never expose token or response body', async () => {
  const e = event(); assert.deepEqual(decodeMessage(envelope(e)), e);
  assert.deepEqual(decodeMessage({ body: JSON.stringify(e), metadata: { 'CF-Content-Type': 'json' } }), e);
  assert.deepEqual(decodeMessage({ body: JSON.stringify(e), metadata: { 'CF-Content-Type': 'text' } }), e);
  assert.throws(() => decodeMessage({ body: '{}', metadata: {} }));
  const queue = cloudflareQueue({ ...config, fetchImpl: async () => Response.json({ success: false, errors: [{ code: 1000, message: 'test-secret' }] }, { status: 401 }) });
  await assert.rejects(queue.publish(e), error => !error.message.includes('test-secret') && error.message.includes('401'));
});

test('configuration defaults local, supports saved settings and fails closed on invalid config', t => {
  const f = fixture(t); assert.equal(notificationConfig(f.dir, {}).provider, 'local');
  writeFileSync(join(f.dir, 'notification-queue.json'), JSON.stringify({ ...config, token: undefined }));
  const loaded = notificationConfig(f.dir, { CLOUDFLARE_API_TOKEN: 'test-secret' });
  assert.equal(loaded.provider, 'cloudflare'); assert.equal(loaded.token, 'test-secret');
  assert.throws(() => notificationTransport(f.store, { ...loaded, queueId: '' }));
  writeFileSync(join(f.dir, 'notification-queue.json'), 'broken');
  assert.throws(() => notificationConfig(f.dir, {}), /설정 파일 오류/);
});

test('provision creates dedicated DLQ first and refuses incompatible existing consumers', async () => {
  const calls = [];
  const api = async (path, body) => {
    calls.push({ path, body });
    if (path.startsWith('?') || (path.endsWith('/consumers') && !body)) return [];
    if (path === '') return { queue_id: body.queue_name.endsWith('-dlq') ? config.deadLetterQueueId : config.queueId };
    return {};
  };
  assert.deepEqual(await provisionQueues(api, 'test'), { queueId: config.queueId, deadLetterQueueId: config.deadLetterQueueId });
  assert.equal(calls.find(c => c.body?.dead_letter_queue).body.dead_letter_queue, 'test-dlq');
  await assert.rejects(provisionQueues(async path => path.startsWith('?') ? [{ queue_name: 'test-dlq', queue_id: 'x' }] : [{ type: 'worker' }], 'test'), /기존 소비자/);
});
