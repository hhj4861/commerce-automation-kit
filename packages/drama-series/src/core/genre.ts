import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const KEY = z.string().regex(/^[a-z-]+$/);
const check = z.object({ task: z.string().min(10), pass: z.string().min(5), fail: z.string().min(5) });
/** 수위 판정. undecided = 판정기가 확신하지 못했을 때 처리(기본 block). 확정 fail 은 항상 block */
const safetyCheck = check.extend({ undecided: z.enum(['block', 'review']).optional() });
const element = check.extend({ name: z.string().min(1) });
const score = z.object({ task: z.string().min(10), levels: z.array(z.string().min(3)).min(2).max(10) });

export const genreSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    promise: z.string().min(5),
    hookRules: z.array(z.string().min(1)).min(1),
    scenarioChecks: z.record(KEY, check).refine((o) => Object.keys(o).length >= 3, '시나리오 판정 항목은 3개 이상'),
    /** 조회 유발 요소. 주제 관문이 판정한다 */
    hookElements: z.record(KEY, element).refine((o) => Object.keys(o).length >= 3, '조회 유발 요소는 3개 이상'),
    minHookElements: z.number().int().min(1),
    /** 재미 요소 점수(참고용, 차단하지 않음) */
    funChecks: z.record(KEY, score),
    /** 수위 경계. 주제·시나리오 모두에 적용 */
    safetyChecks: z.record(KEY, safetyCheck).refine((o) => Object.keys(o).length >= 1, '수위 안전 판정은 1개 이상'),
    dialogueStyle: z.array(z.string().min(1)),
    actionRules: z.array(z.string().min(1)),
    bannedWords: z.array(z.string().min(1)),
    structure: z.object({
      pilotCuts: z.number().int().min(1),
      episodeMinutes: z.tuple([z.number().positive(), z.number().positive()]),
    }),
  })
  .refine((g) => g.minHookElements <= Object.keys(g.hookElements).length, '최소 요소 수가 요소 목록보다 많음');

export type GenrePack = z.infer<typeof genreSchema>;
export class GenreError extends Error {}

const GENRE_DIR = fileURLToPath(new URL('../../genres/', import.meta.url));
const readPack = (file: string): Record<string, unknown> => JSON.parse(readFileSync(`${GENRE_DIR}${file}`, 'utf8')) as Record<string, unknown>;
const asRecord = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

export function listGenres(): string[] {
  return readdirSync(GENRE_DIR)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

/** 장르 팩을 `_shared.json`(공통 조회 유발 요소·재미·수위)과 병합해 검증한다. 팩 값이 우선한다. */
export function loadGenre(id: string): GenrePack {
  if (!/^[a-z0-9-]+$/.test(id)) throw new GenreError(`잘못된 장르 id: ${id}`);
  if (!existsSync(`${GENRE_DIR}${id}.json`)) throw new GenreError(`장르 팩 없음: ${id} (있는 것: ${listGenres().join(', ')})`);
  const shared = readPack('_shared.json');
  const pack = readPack(`${id}.json`);
  const merged = {
    ...shared,
    ...pack,
    hookElements: { ...asRecord(shared.hookElements), ...asRecord(pack.hookElements) },
    funChecks: { ...asRecord(shared.funChecks), ...asRecord(pack.funChecks) },
    safetyChecks: { ...asRecord(shared.safetyChecks), ...asRecord(pack.safetyChecks) },
  };
  const r = genreSchema.safeParse(merged);
  if (!r.success) throw new GenreError(`장르 팩 스키마 불일치(${id}): ${r.error.issues.map((i) => i.message).join('; ')}`);
  if (r.data.id !== id) throw new GenreError(`파일명과 id 불일치: ${id} ≠ ${r.data.id}`);
  return r.data;
}
