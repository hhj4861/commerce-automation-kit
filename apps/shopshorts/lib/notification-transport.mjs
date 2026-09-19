import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cloudflareQueue, decodeMessage } from './notifications-cloudflare.mjs';
import { drainNotifications } from './notifications-local.mjs';

export function notificationConfig(dataDir, env) {
  let saved = {};
  try { saved = JSON.parse(readFileSync(join(dataDir, 'notification-queue.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('알림 큐 설정 파일 오류'); }
  const provider = env.SHOPSHORTS_NOTIFICATION_QUEUE || saved.provider || 'local';
  if (provider === 'local') return { provider };
  if (provider !== 'cloudflare') throw new Error('지원하지 않는 알림 큐');
  const tokenFile = env.SHOPSHORTS_CF_TOKEN_FILE || saved.tokenFile;
  let token = env.CLOUDFLARE_API_TOKEN;
  if (!token && tokenFile) {
    try { token = readFileSync(tokenFile, 'utf8').trim(); }
    catch { throw new Error('Cloudflare Queues 토큰 파일을 읽지 못했습니다'); }
  }
  return { provider, token, accountId: env.CLOUDFLARE_ACCOUNT_ID || saved.accountId,
    queueId: env.SHOPSHORTS_CF_QUEUE_ID || saved.queueId,
    deadLetterQueueId: env.SHOPSHORTS_CF_DLQ_ID || saved.deadLetterQueueId };
}

export function notificationTransport(store, config, { now = Date.now, fetchImpl } = {}) {
  if (config.provider === 'local') return { provider: 'local', tick: () => drainNotifications(store.queue, store.deliver) };
  if (config.provider !== 'cloudflare') throw new Error('지원하지 않는 알림 큐');
  const remote = cloudflareQueue({ ...config, fetchImpl });
  const dead = cloudflareQueue({ ...config, queueId: config.deadLetterQueueId, fetchImpl });
  let nextDeadPoll = 0;
  return {
    provider: 'cloudflare',
    async tick() {
      // Publish failure must not stop consumption of already accepted messages.
      let failure;
      for (let i = 0; i < 20; i++) {
        const message = store.queue.receive(true);
        if (!message) break;
        try {
          await remote.publish(message.event);
          store.queue.published(message.id, message.receipt);
        } catch (error) { store.queue.retry(message.id, message.receipt); failure = error; break; }
      }
      const messages = await remote.pull(), acks = [], retries = [];
      for (const message of messages) {
        try {
          const event = decodeMessage(message);
          store.deliver(event);
          store.queue.complete(event.id);
          acks.push(message);
        } catch { retries.push(message); }
      }
      // A crash/ack failure replays the same event ID; inbox insertion is idempotent.
      await remote.ack(acks);
      await remote.retry(retries);
      if (retries.length) failure = new Error('알림 전달 재시도 중');
      if (now() >= nextDeadPoll) {
        const failed = await dead.pull();
        for (const message of failed) {
          let event;
          try { event = decodeMessage(message); } catch { /* Preserve malformed payload for diagnosis. */ }
          if (!event || typeof event.id !== 'string' || !event.id) event = { id: `cloudflare:${message.id}`, malformed: message.body, metadata: message.metadata };
          store.queue.quarantine(event);
        }
        await dead.ack(failed); // only after every failure has a durable local copy
        nextDeadPoll = now() + 60_000;
      }
      if (failure) throw failure;
    },
  };
}
