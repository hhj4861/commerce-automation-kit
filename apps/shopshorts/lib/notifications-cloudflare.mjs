// Official Queues HTTP API; receipts are lease_id.
export function cloudflareApi({ accountId, token, fetchImpl = fetch }) {
  if (!/^[a-f0-9]{32}$/.test(accountId || '') || !token?.trim()) throw new Error('Cloudflare Queues 계정/토큰 설정 필요');
  return async (path, body, method = body === undefined ? 'GET' : 'POST') => {
    let response, data;
    try {
      response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/queues${path}`, {
        method, headers: { authorization: `Bearer ${token.trim()}`, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000), redirect: 'error',
      });
      data = await response.json();
    } catch { throw new Error('Cloudflare Queues 연결 실패'); }
    if (!response.ok || data.success !== true) throw new Error(`Cloudflare Queues HTTP ${response.status} (code ${Number(data.errors?.[0]?.code) || 0})`);
    return data.result;
  };
}

export function decodeMessage(message) {
  const type = message.metadata?.['CF-Content-Type'];
  if (!['json', 'text', 'bytes'].includes(type) || typeof message.body !== 'string') throw new Error('지원하지 않는 큐 메시지 형식');
  if (type === 'text') return JSON.parse(message.body);
  // Docs describe base64; the live HTTP JSON producer also returns plain JSON (2026-09-19).
  if (type === 'json') {
    try { return JSON.parse(message.body); } catch { /* documented base64 representation */ }
  }
  return JSON.parse(Buffer.from(message.body, 'base64').toString('utf8'));
}

export function cloudflareQueue({ queueId, ...options }) {
  if (!/^[a-f0-9]{32}$/.test(queueId || '')) throw new Error('Cloudflare Queue ID 설정 필요');
  const api = cloudflareApi(options), path = `/${queueId}/messages`;
  return {
    publish: event => api(path, { body: event, content_type: 'json' }),
    pull: async () => {
      const result = await api(`${path}/pull`, { batch_size: 20, visibility_timeout_ms: 60_000 });
      if (!Array.isArray(result?.messages) || result.messages.some(m => !m.id || !m.lease_id)) throw new Error('Cloudflare Queues 응답 형식 오류');
      return result.messages;
    },
    ack: messages => messages.length ? api(`${path}/ack`, { acks: messages.map(m => ({ lease_id: m.lease_id })), retries: [] }) : undefined,
    retry: messages => messages.length ? api(`${path}/ack`, { acks: [], retries: messages.map(m => ({ lease_id: m.lease_id, delay_seconds: 30 })) }) : undefined,
  };
}
