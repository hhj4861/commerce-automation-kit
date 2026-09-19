#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { cloudflareApi } from './lib/notifications-cloudflare.mjs';

// Re-running setup reuses exact names; it never replaces an existing consumer.
export async function provisionQueues(api, name) {
  if (!/^[a-z0-9][a-z0-9-]{0,58}$/.test(name)) throw new Error('큐 이름은 소문자/숫자/하이픈, 최대 59자입니다');
  async function ensure(queueName, deadLetterName) {
    const found = await api(`?name=${encodeURIComponent(queueName)}`);
    if (!Array.isArray(found)) throw new Error('Cloudflare 큐 목록 응답 오류');
    let queue = found.find(q => q.queue_name === queueName);
    if (!queue) queue = await api('', { queue_name: queueName, settings: { message_retention_period: 86400 } });
    if (!queue?.queue_id) throw new Error('Cloudflare 큐 생성 응답 오류');
    const consumers = await api(`/${queue.queue_id}/consumers`);
    if (!Array.isArray(consumers)) throw new Error('Cloudflare 소비자 목록 응답 오류');
    if (consumers.length) {
      const consumer = consumers[0];
      if (consumers.length !== 1 || consumer.type !== 'http_pull' || (deadLetterName && consumer.dead_letter_queue !== deadLetterName)) {
        throw new Error(`${queueName}: 기존 소비자 설정이 다릅니다. 별도 큐 이름을 지정하세요`);
      }
    } else {
      await api(`/${queue.queue_id}/consumers`, {
        type: 'http_pull', ...(deadLetterName ? { dead_letter_queue: deadLetterName } : {}),
        settings: { max_retries: deadLetterName ? 5 : 100, visibility_timeout_ms: 60_000 },
      });
    }
    return queue.queue_id;
  }
  const deadLetterQueueId = await ensure(`${name}-dlq`);
  const queueId = await ensure(name, `${name}-dlq`);
  return { queueId, deadLetterQueueId };
}

async function main() {
  const { values } = parseArgs({ options: {
    account: { type: 'string' }, 'token-file': { type: 'string' }, 'data-dir': { type: 'string' },
    queue: { type: 'string', default: 'shopshorts-notifications' }, apply: { type: 'boolean', default: false },
  } });
  const accountId = values.account || process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId || !values['data-dir']) throw new Error('--account 및 --data-dir 필요');
  const dataDir = resolve(values['data-dir']);
  const tokenFile = values['token-file'] ? resolve(values['token-file']) : undefined;
  if (!values.apply) {
    console.log(JSON.stringify({ apply: false, accountId, queues: [values.queue, `${values.queue}-dlq`], config: join(dataDir, 'notification-queue.json') }));
    return;
  }
  const token = process.env.CLOUDFLARE_API_TOKEN || (tokenFile && readFileSync(tokenFile, 'utf8').trim());
  const ids = await provisionQueues(cloudflareApi({ accountId, token }), values.queue);
  const config = { provider: 'cloudflare', accountId, ...ids, ...(tokenFile ? { tokenFile } : {}) };
  mkdirSync(dataDir, { recursive: true });
  const path = join(dataDir, 'notification-queue.json');
  writeFileSync(`${path}.tmp`, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
  console.log(JSON.stringify({ applied: true, queues: ids, config: path, restartRequired: true }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
