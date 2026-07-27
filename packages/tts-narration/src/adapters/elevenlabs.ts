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
}

/** 한국어 내레이션 1건 생성 → outPath 저장. */
export async function synthesizeNarration(o: NarrationOpts): Promise<NarrationClip> {
  if (!o.apiKey) throw new Error('apiKey 없음 (ELEVENLABS_API_KEY)');
  const text = o.text.trim();
  if (!text) throw new Error('내레이션 텍스트가 비어있음');

  const policy = resolvePolicy(text, o.env ?? process.env);
  const format = o.outputFormat ?? DEFAULT_OUTPUT_FORMAT;

  let res: Response;
  try {
    res = await fetch(
      `${ENDPOINT}/${policy.voiceId}?output_format=${encodeURIComponent(format)}`,
      {
        method: 'POST',
        headers: { 'xi-api-key': o.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRequestBody(text, policy)),
      },
    );
  } catch (e) {
    throw new Error(`ElevenLabs fetch 실패(네트워크): ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`ElevenLabs HTTP ${res.status}: ${detail.slice(0, 300)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error('ElevenLabs 응답이 비어있음(오디오 없음)');
  await writeFile(o.outPath, buf);

  return {
    file: o.outPath,
    text,
    voiceId: policy.voiceId,
    modelId: policy.modelId,
    createdAt: new Date().toISOString(),
  };
}
