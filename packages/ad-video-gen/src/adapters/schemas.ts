/**
 * 외부 입력(JSON 파일·CLI 인자) 검증용 zod 스키마.
 * @cak/contracts 의 타입과 1:1 로 맞춘다 — 계약이 진실이고 스키마는 런타임 방어막.
 *
 * exactOptionalPropertyTypes 때문에 zod 의 `field?: T | undefined` 추론을
 * 계약 타입(`field?: T`)으로 그대로 대입할 수 없어, parse 후 정규화 함수로 변환한다.
 */
import { z } from 'zod';
import type { AdConcept, AdVideoModel, AdVideoResolution, AdVideoTier } from '@cak/contracts';

export const adVideoModelSchema: z.ZodType<AdVideoModel> = z.enum([
  'seedance_2_0',
  'seedance_2_0_fast',
  'kling3_0',
  'veo3_1',
  'marketing_studio_video',
]);

export const adVideoTierSchema: z.ZodType<AdVideoTier> = z.enum(['draft', 'standard', 'broadcast']);

export const adVideoResolutionSchema: z.ZodType<AdVideoResolution> = z.enum(['480p', '720p', '1080p', '4k']);

export const adBeatSchema = z.object({
  index: z.number().int().min(0),
  durationSec: z.number(),
  description: z.string(),
});

export const adConceptSchema = z.object({
  subject: z.string().min(1),
  category: z.string().optional(),
  sellingPoints: z.array(z.string()),
  evidence: z.array(z.string()),
  uniqueness: z.object({
    passed: z.boolean(),
    rationale: z.string(),
  }),
  beats: z.array(adBeatSchema),
  narrativeComplete: z.boolean(),
  humanApproved: z.boolean(),
});

/** unknown(JSON 파일 내용) → AdConcept. 스키마 불일치는 zod 에러로 throw. */
export function parseAdConcept(input: unknown): AdConcept {
  const r = adConceptSchema.parse(input);
  const concept: AdConcept = {
    subject: r.subject,
    sellingPoints: r.sellingPoints,
    evidence: r.evidence,
    uniqueness: r.uniqueness,
    beats: r.beats,
    narrativeComplete: r.narrativeComplete,
    humanApproved: r.humanApproved,
  };
  if (r.category !== undefined) concept.category = r.category;
  return concept;
}
