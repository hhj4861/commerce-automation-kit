/**
 * 입력 검증 스키마(zod) — CLI 가 받은 JSON 을 계약 타입으로 안전 변환.
 */
import { z } from 'zod';
import type { MusicBrief } from '@cak/contracts';

export const musicEnergySchema = z.enum(['low', 'medium', 'high']);
export const musicTempoSchema = z.enum(['slow', 'mid', 'up']);
export const musicBackendIdSchema = z.enum(['suno-manual', 'suno-auto', 'elevenlabs']);

export const musicBriefSchema = z.object({
  energy: musicEnergySchema,
  tempo: musicTempoSchema,
  moods: z.array(z.string()).default([]),
  genres: z.array(z.string()).default([]),
  instrumental: z.boolean().default(true),
  durationSec: z.number().positive(),
  bpm: z.number().positive().optional(),
  arc: z.string().optional(),
});

/** exactOptionalPropertyTypes 대응: undefined 필드 제거 후 계약 타입으로. */
export function parseMusicBrief(input: unknown): MusicBrief {
  const b = musicBriefSchema.parse(input);
  const brief: MusicBrief = {
    energy: b.energy,
    tempo: b.tempo,
    moods: b.moods,
    genres: b.genres,
    instrumental: b.instrumental,
    durationSec: b.durationSec,
  };
  if (b.bpm !== undefined) brief.bpm = b.bpm;
  if (b.arc !== undefined) brief.arc = b.arc;
  return brief;
}
