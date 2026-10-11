import { z } from 'zod';
import type { DramaEpisode, DramaSeries, DramaTopicSet } from '@cak/contracts';

export const ID = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'id는 소문자·숫자·하이픈(최대 40자)');

const verification = z.object({
  status: z.enum(['unverified', 'verified', 'human-approved', 'rejected']),
  judgeRef: z.string().optional(),
  approvedBy: z.string().optional(),
  at: z.string().optional(),
  note: z.string().optional(),
  lineHash: z.string().optional(),
  reviewContextDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/).optional(),
});

const line = z.object({
  speaker: ID,
  text: z.string().trim().min(1).max(200),
  kind: z.enum(['dialogue', 'monologue']),
  verification: verification.default({ status: 'unverified' }),
});

const propIds = z.array(z.string().trim().min(1));
const setup = z.object({ id: ID, name: z.string().trim().min(1), cameraEn: z.string().trim().min(1),
  refAssetId: z.string().trim().min(1).optional(), visiblePropIds: propIds }).strict();
const beat = z.object({ en: z.string().trim().min(1), sec: z.number().finite().positive().optional(),
  lines: z.array(z.number().int().nonnegative()).optional(),
  changes: z.record(z.string().trim().min(1), z.string().trim().min(1)).optional() }).strict();
const blocking = z.object({ characterId: ID, side: z.enum(['left', 'center', 'right']),
  depth: z.enum(['front', 'mid', 'back']).optional() }).strict();
const look = z.object({ id: ID, description: z.string().min(3), refAssetId: z.string().min(1).optional(),
  outfitRefAssetId: z.string().trim().min(1).optional() });

const character = z.object({
  id: ID,
  name: z.string().min(1),
  profile: z.string().min(3),
  speech: z.object({
    default: z.string().min(1),
    toSuperior: z.string().optional(),
    toSubordinate: z.string().optional(),
  }),
  looks: z.array(look).min(1),
});

const location = z.object({
  setups: z.array(setup).optional(),
  id: ID,
  name: z.string().min(1),
  anchorText: z.string().min(20),
  props: z.array(z.string().min(1)),
  refAssetId: z.string().min(1).optional(),
});

const cut = z.object({
  setupId: ID.optional(),
  blocking: z.array(blocking).optional(),
  blockingChange: z.enum(['move', 'reverse']).optional(),
  cameraMove: z.enum(['static', 'push-in', 'pull-out', 'pan', 'follow']).optional(),
  beats: z.array(beat).optional(),
  usedPropIds: propIds.optional(),
  continuesFromPrev: z.boolean().optional(),
  id: ID,
  locationId: ID,
  durationSec: z.number().int().min(1).max(60),
  cast: z.array(z.object({ characterId: ID, lookId: ID, carriesPropIds: propIds.optional() })),
  action: z.string().min(3),
  visualEn: z.string().min(10),
  sfx: z.string().optional(),
  caption: z.string().max(60).optional(),
  propState: z.record(z.string().min(1), z.string().min(1)).optional(),
  transitionIn: z.enum(['cut', 'flash', 'fade-black']).optional(),
  lines: z.array(line).default([]),
});

const topic = z.object({
  id: ID,
  logline: z.string().min(5),
  synopsis: z.string().min(10),
  claimedElements: z.array(ID).min(1),
  verifiedElements: z.array(ID).optional(),
});

export const topicSetSchema = z.object({ genreId: ID, topics: z.array(topic).min(1) });

export const seriesSchema = z.object({
  id: ID,
  title: z.string().min(1),
  logline: z.string().min(5),
  genreId: ID,
  topic,
  styleEn: z.string().min(10),
  characters: z.array(character).min(1),
  locations: z.array(location).min(1),
  episodes: z
    .array(z.object({ no: z.number().int().min(1), title: z.string().min(1), summary: z.string().min(5) }))
    .min(1),
  safety: z.object({ nonGraphic: z.literal(true) }),
});

export const episodeSchema = z.object({
  shotPolicy: z.object({ version: z.literal('shot-v1'), strict: z.literal(true) }).strict().optional(),
  authoredBy: z.enum(['claude', 'codex']).optional(),
  continuesFromEpisode: z.object({ no: z.number().int().positive(), cutId: ID }).strict().optional(),
  startsFresh: z.literal(true).optional(),
  seriesId: ID,
  no: z.number().int().min(1),
  title: z.string().min(1),
  cuts: z.array(cut).min(1),
});

export class ModelError extends Error {}

function issues(e: z.ZodError): string {
  return e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

export function parseSeries(raw: unknown): DramaSeries {
  const r = seriesSchema.safeParse(raw);
  if (!r.success) throw new ModelError(`시리즈 스키마 불일치: ${issues(r.error)}`);
  return r.data;
}

export function parseEpisode(raw: unknown): DramaEpisode {
  const r = episodeSchema.safeParse(raw);
  if (!r.success) throw new ModelError(`회차 스키마 불일치: ${issues(r.error)}`);
  return r.data;
}

export function parseTopicSet(raw: unknown): DramaTopicSet {
  const r = topicSetSchema.safeParse(raw);
  if (!r.success) throw new ModelError(`주제 묶음 스키마 불일치: ${issues(r.error)}`);
  return r.data;
}
