/**
 * 입력 검증 스키마(zod) — CLI 가 받은 JSON/문자열을 계약 타입으로 안전 변환.
 * 계약(@cak/contracts)은 순수 타입이므로 런타임 검증은 여기서 한다.
 */
import { z } from 'zod';
import type { ShortsJob, PublishTarget, ShortsRenderSpec } from '@cak/contracts';

export const shortsModeSchema = z.enum(['crop', 'blur', 'blur-brand', 'letterbox', 'heavy']);
export const shortsPlatformSchema = z.enum(['youtube', 'instagram', 'tiktok']);
export const youtubePrivacySchema = z.enum(['private', 'unlisted', 'public']);

export const shortsRenderSpecSchema = z.object({
  mode: shortsModeSchema,
  width: z.number().int().positive().default(1080),
  height: z.number().int().positive().default(1920),
  brand: z.string().optional(),
  tagline: z.string().optional(),
});

export const publishTargetSchema = z.object({
  platforms: z.array(shortsPlatformSchema).min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  aiDisclosed: z.boolean().default(true),
  youtubePrivacy: youtubePrivacySchema.optional(),
  tiktokPrivacy: z.string().optional(),
});

export const shortsJobSchema = z.object({
  sourceVideo: z.string().min(1),
  render: shortsRenderSpecSchema,
  publish: publishTargetSchema.optional(),
});

/** exactOptionalPropertyTypes 대응: undefined 필드를 제거해 계약 타입으로 좁힌다. */
function stripUndefined<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as T;
}

export function parseShortsRenderSpec(input: unknown): ShortsRenderSpec {
  return stripUndefined(shortsRenderSpecSchema.parse(input)) as ShortsRenderSpec;
}

export function parsePublishTarget(input: unknown): PublishTarget {
  return stripUndefined(publishTargetSchema.parse(input)) as PublishTarget;
}

export function parseShortsJob(input: unknown): ShortsJob {
  const j = shortsJobSchema.parse(input);
  const job: ShortsJob = {
    sourceVideo: j.sourceVideo,
    render: stripUndefined(j.render) as ShortsRenderSpec,
  };
  if (j.publish !== undefined) job.publish = stripUndefined(j.publish) as PublishTarget;
  return job;
}
