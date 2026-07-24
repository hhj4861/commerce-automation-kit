/**
 * 텔레그램 Bot API 어댑터 — 일일 다이제스트를 "사람에게" 보내는 관측성 채널.
 * (obs/alerts.ts 의 "Phase 4+: 외부 채널 연결" TODO 의 실현)
 *
 * 원칙:
 *  - 공식 api.telegram.org 만 사용(비공식 클라이언트/우회 금지 — 네이버 어댑터와 동일 원칙).
 *  - 수신자는 본인 chat: 데이터 재판매·제3자 제공이 아니다(LEGAL-BOUNDARY 경계 2 무관).
 *  - 토큰/chat_id 미설정이면 조용히 비활성(null) — 수집 자동화가 리포트 설정에 인질 잡히지 않게.
 */
import { request } from 'undici';

export interface TelegramCredentials {
  botToken: string;
  chatId: string;
}

/** env 에서 로드. 하나라도 없으면 null(리포트 채널 비활성). */
export function loadTelegramCredentials(): TelegramCredentials | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return null;
  return { botToken, chatId };
}

export class TelegramApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`[telegram] HTTP ${status} — ${body.slice(0, 200)}`);
    this.name = 'TelegramApiError';
  }
}

/** sendMessage 는 4096자 제한 — 초과 시 순서 보존 분할 전송한다. */
const CHUNK_MAX = 4000; // 여유 마진

/**
 * 줄 경계 우선 분할 + 코드포인트 안전 절단.
 * `slice(i, i+N)` 은 UTF-16 코드유닛 단위라 📊 같은 서러게이트 쌍을 중간에서 자를 수 있고,
 * 그 청크는 무효 텍스트가 되어 전송이 깨진다(리뷰 확정 결함) — for..of(코드포인트 순회)로 방지.
 */
export function chunkText(text: string, max = CHUNK_MAX): string[] {
  const chunks: string[] = [];
  let cur = '';
  for (const line of text.split('\n')) {
    const candidate = cur ? `${cur}\n${line}` : line;
    if (candidate.length <= max) {
      cur = candidate;
      continue;
    }
    if (cur) chunks.push(cur);
    if (line.length <= max) {
      cur = line;
      continue;
    }
    // 단일 줄이 max 초과(비정상 케이스) — 코드포인트 경계로 안전 절단
    let buf = '';
    for (const cp of line) {
      if (buf.length + cp.length > max) {
        chunks.push(buf);
        buf = '';
      }
      buf += cp;
    }
    cur = buf;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export async function sendMessage(cred: TelegramCredentials, text: string): Promise<void> {
  for (const chunk of chunkText(text)) {
    const res = await request(`https://api.telegram.org/bot${cred.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cred.chatId, text: chunk, disable_web_page_preview: true }),
    });
    const body = await res.body.text();
    if (res.statusCode !== 200) throw new TelegramApiError(res.statusCode, body);
  }
}

/**
 * chat_id 탐색 도우미(`report --setup`) — 봇에게 아무 메시지나 1개 보낸 뒤 호출하면
 * 최근 대화의 chat 후보를 보여준다. 값 파싱은 방어적으로(필드 없으면 건너뜀).
 */
export async function listRecentChats(
  botToken: string,
): Promise<Array<{ chatId: string; label: string }>> {
  const res = await request(`https://api.telegram.org/bot${botToken}/getUpdates`, { method: 'GET' });
  const body = await res.body.text();
  if (res.statusCode !== 200) throw new TelegramApiError(res.statusCode, body);
  const parsed = JSON.parse(body) as {
    ok?: boolean;
    result?: Array<{ message?: { chat?: { id?: number; username?: string; first_name?: string; title?: string; type?: string } } }>;
  };
  const out = new Map<string, string>();
  for (const u of parsed.result ?? []) {
    const chat = u.message?.chat;
    if (!chat || chat.id === undefined) continue;
    const label = chat.title ?? chat.username ?? chat.first_name ?? chat.type ?? '(이름 없음)';
    out.set(String(chat.id), label);
  }
  return [...out.entries()].map(([chatId, label]) => ({ chatId, label }));
}
