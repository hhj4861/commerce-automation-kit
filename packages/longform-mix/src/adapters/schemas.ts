/**
 * 입력 검증 스키마(zod) — tracks.json 을 계약 타입으로 안전 변환.
 * durationSec 는 선택(없으면 CLI 가 ffprobe 로 채움).
 */
import { z } from 'zod';
import type { LongformTrack } from '@cak/contracts';

export const trackInputSchema = z.object({
  file: z.string().min(1),
  title: z.string().min(1),
  durationSec: z.number().positive().optional(),
});

/** tracks.json 은 배열 또는 { tracks: [...] } 둘 다 허용. */
export const tracksFileSchema = z.union([
  z.array(trackInputSchema).min(1),
  z.object({ tracks: z.array(trackInputSchema).min(1) }),
]);

export interface TrackInput {
  file: string;
  title: string;
  durationSec?: number;
}

/** 파싱 결과를 TrackInput[] 로 정규화(durationSec 은 아직 없을 수 있음). */
export function parseTracks(input: unknown): TrackInput[] {
  const parsed = tracksFileSchema.parse(input);
  const arr = Array.isArray(parsed) ? parsed : parsed.tracks;
  return arr.map((t) => {
    const out: TrackInput = { file: t.file, title: t.title };
    if (t.durationSec !== undefined) out.durationSec = t.durationSec;
    return out;
  });
}

/** durationSec 이 채워진 TrackInput 을 계약 LongformTrack 으로. */
export function toLongformTrack(t: TrackInput & { durationSec: number }): LongformTrack {
  return { file: t.file, title: t.title, durationSec: t.durationSec };
}
