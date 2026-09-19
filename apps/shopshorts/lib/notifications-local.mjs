import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// A local durable queue and inbox repository, sharing a database, not delivery state.
// Queue contract: enqueue(event), receive(), ack(id, receipt), retry(id, receipt).
export function openNotifications(dataDir, { now = Date.now, leaseMs = 30_000, maxAttempts = 5 } = {}) {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dataDir, 'notifications.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_sources (key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notification_queue (
      id TEXT PRIMARY KEY, payload TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0, available_at INTEGER NOT NULL, receipt TEXT, last_error TEXT);
    CREATE INDEX IF NOT EXISTS notification_queue_due ON notification_queue(state, available_at);
    CREATE TABLE IF NOT EXISTS notifications (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notification_reads (user_id TEXT NOT NULL, notification_id TEXT NOT NULL, PRIMARY KEY(user_id, notification_id));
    CREATE TABLE IF NOT EXISTS notification_preferences (user_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL);
  `);
  const enqueue = event => db.prepare('INSERT OR IGNORE INTO notification_queue(id,payload,available_at) VALUES (?,?,?)').run(event.id, JSON.stringify(event), now());
  const observe = db.transaction(observations => {
    for (const { key, fingerprint, event } of observations) {
      if (db.prepare('SELECT fingerprint FROM notification_sources WHERE key=?').get(key)?.fingerprint === fingerprint) continue;
      if (event) enqueue({ ...event, id: randomUUID(), version: 1, occurredAt: new Date(now()).toISOString() });
      db.prepare('INSERT INTO notification_sources(key,fingerprint) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET fingerprint=excluded.fingerprint').run(key, fingerprint);
    }
  });
  const receive = db.transaction(() => {
    db.prepare("UPDATE notification_queue SET state='dead',last_error='처리 횟수 초과' WHERE state='inflight' AND available_at<=? AND attempts>=?").run(now(), maxAttempts);
    const row = db.prepare("SELECT * FROM notification_queue WHERE state IN ('pending','inflight') AND available_at<=? ORDER BY available_at,rowid LIMIT 1").get(now());
    if (!row) return null;
    const receipt = randomUUID();
    db.prepare("UPDATE notification_queue SET state='inflight',attempts=attempts+1,receipt=?,available_at=? WHERE id=?").run(receipt, now() + leaseMs, row.id);
    return { id: row.id, receipt, event: JSON.parse(row.payload) };
  });
  const ack = (id, receipt) => db.prepare("DELETE FROM notification_queue WHERE id=? AND receipt=? AND state='inflight' AND available_at>?").run(id, receipt, now()).changes > 0;
  const retry = (id, receipt) => {
    const row = db.prepare("SELECT attempts FROM notification_queue WHERE id=? AND receipt=? AND state='inflight' AND available_at>?").get(id, receipt, now());
    if (!row) return false;
    db.prepare('UPDATE notification_queue SET state=?,available_at=?,receipt=NULL,last_error=? WHERE id=?').run(row.attempts >= maxAttempts ? 'dead' : 'pending', now() + Math.min(60_000, 1000 * 2 ** (row.attempts - 1)), '알림 저장 실패 — 재시도 필요', id);
    return true;
  };
  const deliver = event => {
    if (event.version !== 1 || !event.id || !['job', 'studio'].includes(event.source) || typeof event.title !== 'string' || typeof event.name !== 'string') throw new Error('알림 이벤트 형식 오류');
    // Never trust a queue payload to supply an arbitrary external or script URL.
    const href = event.source === 'job' ? `/?job=${encodeURIComponent(event.sourceId)}` : `/studio?id=${encodeURIComponent(event.sourceId)}`;
    db.prepare('INSERT OR IGNORE INTO notifications(id,payload) VALUES (?,?)').run(event.id, JSON.stringify({ ...event, href }));
  };
  const queue = {
    enqueue, receive: () => receive.immediate(), ack, retry,
    stats: () => Object.fromEntries(['pending', 'inflight', 'dead'].map(state => [state, db.prepare('SELECT count(*) AS n FROM notification_queue WHERE state=?').get(state).n])),
    retryDead: () => db.prepare("UPDATE notification_queue SET state='pending',attempts=0,available_at=?,receipt=NULL WHERE state='dead'").run(now()).changes,
  };
  const preference = user => db.prepare('SELECT enabled FROM notification_preferences WHERE user_id=?').get(user)?.enabled !== 0;
  const list = (user, { unread = false, before = 0, limit = 50 } = {}) => {
    const rows = db.prepare(`SELECT n.*,r.notification_id AS is_read FROM notifications n LEFT JOIN notification_reads r ON r.notification_id=n.id AND r.user_id=? WHERE (?=0 OR n.seq<?) AND (?=0 OR r.notification_id IS NULL) ORDER BY n.seq DESC LIMIT ?`).all(user, before, before, unread ? 1 : 0, limit + 1);
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(row => ({ ...JSON.parse(row.payload), seq: row.seq, read: !!row.is_read }));
    return {
      items, nextCursor: hasMore ? items.at(-1).seq : null,
      throughSeq: db.prepare('SELECT coalesce(max(seq),0) AS n FROM notifications').get().n,
      unreadCount: db.prepare('SELECT count(*) AS n FROM notifications n WHERE NOT EXISTS (SELECT 1 FROM notification_reads r WHERE r.notification_id=n.id AND r.user_id=?)').get(user).n,
      enabled: preference(user), queue: queue.stats(),
    };
  };
  return {
    queue, deliver, observe: observations => observe.immediate(observations), list, close: () => db.close(),
    setPreference(user, enabled) { db.prepare('INSERT INTO notification_preferences(user_id,enabled) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled').run(user, enabled ? 1 : 0); },
    markRead(user, id, read) {
      if (!db.prepare('SELECT 1 FROM notifications WHERE id=?').get(id)) return false;
      if (read) db.prepare('INSERT OR IGNORE INTO notification_reads(user_id,notification_id) VALUES (?,?)').run(user, id);
      else db.prepare('DELETE FROM notification_reads WHERE user_id=? AND notification_id=?').run(user, id);
      return true;
    },
    markAllRead(user, throughSeq) { db.prepare('INSERT OR IGNORE INTO notification_reads(user_id,notification_id) SELECT ?,id FROM notifications WHERE seq<=?').run(user, throughSeq); },
  };
}

// Ack only AFTER inbox persistence. A crash between the two replays the same ID safely.
export async function drainNotifications(queue, deliver, limit = 100) {
  for (let i = 0; i < limit; i++) {
    const message = await queue.receive();
    if (!message) break;
    try { await deliver(message.event); await queue.ack(message.id, message.receipt); }
    catch { await queue.retry(message.id, message.receipt); }
  }
}

export async function notificationApi(request, store, user) {
  const url = new URL(request.url), path = url.pathname;
  const json = (data, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
  if (path === '/api/notifications' && request.method === 'GET') {
    const before = Number(url.searchParams.get('before') || 0);
    if (!Number.isSafeInteger(before) || before < 0) return json({ error: '목록 위치가 올바르지 않습니다.' }, 400);
    return json(store.list(user, { unread: url.searchParams.get('filter') === 'unread', before }));
  }
  if (request.method !== 'POST') return json({ error: '지원하지 않는 요청입니다.' }, 405);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON 요청이 필요합니다.' }, 400); }
  if (!body || typeof body !== 'object') return json({ error: '요청 형식 오류' }, 400);
  if (path === '/api/notifications/preferences') {
    if (typeof body.enabled !== 'boolean') return json({ error: 'enabled 값이 필요합니다.' }, 400);
    store.setPreference(user, body.enabled);
  } else if (path === '/api/notifications/read-all') {
    if (!Number.isSafeInteger(body.throughSeq) || body.throughSeq < 0) return json({ error: '목록 기준값이 필요합니다.' }, 400);
    store.markAllRead(user, body.throughSeq);
  } else if (path === '/api/notifications/retry') {
    store.queue.retryDead();
  } else {
    const match = path.match(/^\/api\/notifications\/([a-f0-9-]+)\/read$/);
    if (!match) return json({ error: '알림 경로가 없습니다.' }, 404);
    if (typeof body.read !== 'boolean') return json({ error: 'read 값이 필요합니다.' }, 400);
    if (!store.markRead(user, match[1], body.read)) return json({ error: '알림을 찾지 못했어요.' }, 404);
  }
  return json({ ok: true });
}
