/**
 * 외부 입력(잡 JSON 파일) zod 검증 — 계약 타입과 1:1.
 * CLI·대시보드가 넘기는 JSON 은 신뢰하지 않고 전부 여기서 검증한다.
 */
import { z } from 'zod';
import type { ShoppingShortsBrief, ShortsScript } from '@cak/contracts';

export const hookTypeSchema = z.enum([
  'problem-solution',
  'before-after',
  'demo',
  'curiosity',
  'info-tip',
]);

export const briefSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, 'id 는 slug(소문자·숫자·하이픈)'),
  productName: z.string().min(1),
  affiliateUrl: z.string().url().optional(),
  sponsored: z.boolean().optional(),
  keyword: z.string().optional(),
  category: z.string().optional(),
  appealPoints: z.array(z.string().min(1)).min(1),
  isHealthFunctional: z.boolean().optional(),
  createdAt: z.string().min(1),
});

/**
 * zod optional(`T | undefined`)을 exactOptionalPropertyTypes 계약(`T?`)으로 정규화 —
 * undefined 키를 실제로 제거해서 계약 타입에 안전하게 맞춘다.
 */
export function toBrief(b: z.infer<typeof briefSchema>): ShoppingShortsBrief {
  return {
    id: b.id,
    productName: b.productName,
    appealPoints: b.appealPoints,
    createdAt: b.createdAt,
    ...(b.affiliateUrl !== undefined ? { affiliateUrl: b.affiliateUrl } : {}),
    ...(b.sponsored !== undefined ? { sponsored: b.sponsored } : {}),
    ...(b.keyword !== undefined ? { keyword: b.keyword } : {}),
    ...(b.category !== undefined ? { category: b.category } : {}),
    ...(b.isHealthFunctional !== undefined ? { isHealthFunctional: b.isHealthFunctional } : {}),
  };
}

export const beatSchema = z.object({
  index: z.number().int().nonnegative(),
  role: z.enum(['hook', 'body', 'cta']),
  durationSec: z.number().positive().max(60),
  narration: z.string(),
  caption: z.string(),
  visualPrompt: z.string().min(1),
});

export const scriptSchema = z.object({
  briefId: z.string().min(1),
  hookType: hookTypeSchema,
  title: z.string().min(1),
  beats: z.array(beatSchema).min(1).max(12),
  hashtags: z.array(z.string()),
  description: z.string(),
}) satisfies z.ZodType<ShortsScript>;

/** 검증 완료된 잡 파일 → 계약 타입 페어. */
export function toJob(j: JobFile): { brief: ShoppingShortsBrief; script: ShortsScript } {
  return { brief: toBrief(j.brief), script: j.script };
}

/** 잡 파일({brief, script}) — 대시보드 큐·CLI 공용 입력 형식. */
export const jobFileSchema = z
  .object({
    brief: briefSchema,
    script: scriptSchema,
  })
  .refine((j) => j.script.briefId === j.brief.id, {
    message: 'script.briefId 가 brief.id 와 다름',
  });

export type JobFile = z.infer<typeof jobFileSchema>;
