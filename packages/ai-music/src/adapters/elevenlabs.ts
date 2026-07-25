/**
 * ElevenLabs Music 공식 API 어댑터 (무인 자동 생성).
 * 실측 스펙(2026-07): POST https://api.elevenlabs.io/v1/music
 *   헤더 xi-api-key: <KEY>
 *   본문 { prompt, music_length_ms(3000..600000), model_id, force_instrumental }
 *   응답: 오디오 바이너리 직접(application/octet-stream). 폴링 불필요.
 * 라이선스: 정식 라이선스 학습 + 유료플랜 광고 clear.
 * 문서: https://elevenlabs.io/docs/api-reference/music/compose
 */
import { writeFile } from 'node:fs/promises';
import type { MusicTrack } from '@cak/contracts';

const ENDPOINT = 'https://api.elevenlabs.io/v1/music';
const MIN_MS = 3_000;
const MAX_MS = 600_000;

export interface ElevenLabsOpts {
  apiKey: string;
  prompt: string;
  lengthSec: number;
  instrumental: boolean;
  /** 기본 music_v2(최신·고품질) */
  modelId?: 'music_v1' | 'music_v2';
  outputFormat?: string;
  /** 저장 경로(mp3) */
  outPath: string;
}

/** ElevenLabs Music 으로 트랙 생성 → outPath 에 저장. */
export async function generateElevenLabs(o: ElevenLabsOpts): Promise<MusicTrack> {
  if (!o.apiKey) throw new Error('apiKey 없음 (ELEVENLABS_API_KEY)');
  const lengthMs = Math.min(MAX_MS, Math.max(MIN_MS, Math.round(o.lengthSec * 1000)));
  const format = o.outputFormat ?? 'mp3_44100_128';
  const body = {
    prompt: o.prompt,
    music_length_ms: lengthMs,
    model_id: o.modelId ?? 'music_v2',
    force_instrumental: o.instrumental,
  };

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}?output_format=${encodeURIComponent(format)}`, {
      method: 'POST',
      headers: { 'xi-api-key': o.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`ElevenLabs fetch 실패(네트워크): ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ElevenLabs HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error('ElevenLabs 응답이 비어있음(오디오 없음)');
  await writeFile(o.outPath, buf);

  // 실제 생성된 길이(클램프 반영)를 보고한다 — 요청 초와 다를 수 있음(3~600s 범위)
  const track: MusicTrack = { file: o.outPath, backend: 'elevenlabs', prompt: o.prompt, durationSec: lengthMs / 1000 };
  return track;
}
