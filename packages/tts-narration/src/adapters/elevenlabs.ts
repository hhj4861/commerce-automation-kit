/**
 * ElevenLabs TTS 공식 API 어댑터 (무인 자동 생성).
 * 실측 스펙(2026-07): POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}
 *   헤더 xi-api-key: <KEY>
 *   본문 { text, model_id, language_code? } · 쿼리 output_format
 *   응답: 오디오 바이너리 직접. 폴링 불필요.
 * hanmadi(/api/tts)와 같은 엔드포인트·같은 정책(core/policy.ts)을 쓴다.
 */
import { writeFile } from 'node:fs/promises';
import type { NarrationClip } from '@cak/contracts';
import { DEFAULT_OUTPUT_FORMAT, buildRequestBody, resolvePolicy } from '../core/policy.js';

const ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-speech';

export interface NarrationOpts {
  apiKey: string;
  text: string;
  /** 저장 경로(mp3) */
  outPath: string;
  outputFormat?: string;
  /** 생략 시 env(ELEVENLABS_*) → 검증된 기본값 순 */
  env?: Record<string, string | undefined>;
  /** 테스트/제한 재시도 주입용. */
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  timestamps?: boolean;
}

const SAFE_RETRY_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_CONNECT_TIMEOUT']);
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const errorCode = (e: unknown): string => String(
  (e as { code?: string } | null)?.code
  ?? (e as { cause?: { code?: string } } | null)?.cause?.code
  ?? '',
);

/** 한국어 내레이션 1건 생성 → outPath 저장. */
export async function synthesizeNarration(o: NarrationOpts): Promise<NarrationClip> {
  if (!o.apiKey) throw new Error('apiKey 없음 (ELEVENLABS_API_KEY)');
  const text = o.text.trim();
  if (!text) throw new Error('내레이션 텍스트가 비어있음');

  const policy = resolvePolicy(text, o.env ?? process.env);
  const format = o.outputFormat ?? DEFAULT_OUTPUT_FORMAT;

  const fetchFn = o.fetchFn ?? fetch;
  const sleep = o.sleep ?? delay;
  const maxAttempts = Math.max(1, Math.min(o.maxAttempts ?? 3, 3));
  let res: Response | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      res = await fetchFn(
        `${ENDPOINT}/${policy.voiceId}${o.timestamps ? '/with-timestamps' : ''}?output_format=${encodeURIComponent(format)}`,
        {
          method: 'POST',
          headers: { 'xi-api-key': o.apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(buildRequestBody(text, policy)),
        },
      );
    } catch (e) {
      const code = errorCode(e);
      // POST 응답 유실은 이중 과금 가능성이 있어 재시도하지 않는다. DNS·연결 수립 실패처럼
      // 서버가 요청을 처리하지 않았다고 판단할 수 있는 코드만 제한적으로 재시도한다.
      if (attempt < maxAttempts && SAFE_RETRY_CODES.has(code)) {
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      const suffix = code ? ` [${code}]` : '';
      throw new Error(`ElevenLabs fetch 실패(네트워크)${suffix}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (res.status === 429 && attempt < maxAttempts) {
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : 500 * 2 ** (attempt - 1));
      res = null;
      continue;
    }
    break;
  }
  if (!res) throw new Error('ElevenLabs 재시도 후 응답 없음');
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`ElevenLabs HTTP ${res.status}: ${detail.slice(0, 300)}`);
  }
  let buf: Buffer;
  let alignment: NarrationClip['alignment'];
  try {
    if (o.timestamps) {
      const data = await res.json() as { audio_base64?: string; alignment?: NarrationClip['alignment'] };
      alignment = data.alignment;
      if (!data.audio_base64 || !alignment || alignment.characters.join('') !== text
          || alignment.character_start_times_seconds.length !== alignment.characters.length
          || alignment.character_end_times_seconds.length !== alignment.characters.length
          || alignment.character_start_times_seconds.some((v, i) => !Number.isFinite(v) || v < 0 || v > alignment!.character_end_times_seconds[i]!
            || (i > 0 && v < alignment!.character_start_times_seconds[i-1]!))
          || alignment.character_end_times_seconds.some((v, i) => !Number.isFinite(v) || (i > 0 && v < alignment!.character_end_times_seconds[i-1]!))) {
        throw new Error('Invalid character timing response');
      }
      buf = Buffer.from(data.audio_base64, 'base64');
    } else buf = Buffer.from(await res.arrayBuffer());
  }
  catch (e) { throw new Error(`ElevenLabs 오디오 수신 실패(자동 재시도 안 함): ${e instanceof Error ? e.message : String(e)}`); }
  if (buf.length === 0) throw new Error('ElevenLabs 응답이 비어있음(오디오 없음)');
  await writeFile(o.outPath, buf);

  return {
    file: o.outPath,
    text,
    voiceId: policy.voiceId,
    modelId: policy.modelId,
    createdAt: new Date().toISOString(),
    ...(alignment ? { alignment } : {}),
  };
}
