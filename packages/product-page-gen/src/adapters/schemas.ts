/**
 * zod 스키마 — brief/doc JSON 입력 검증 (CLI validate/render 진입점).
 * 계약 타입(@cak/contracts)과 1:1. 계약이 진실이고 스키마는 그 런타임 투영이다.
 */
import { z } from 'zod';

export const evidenceClaimSchema = z.object({
  text: z.string().min(1),
  sourceUrl: z.string().url().optional(),
  verified: z.boolean(),
});

export const pageImageAssetSchema = z
  .object({
    slot: z.enum(['hero', 'texture', 'mood', 'extra']),
    path: z.string().min(1).optional(),
    origin: z.enum(['user', 'supplier-licensed', 'ai-generated']),
    licenseNote: z.string().min(1),
    aiLabeled: z.boolean().optional(),
  })
  .refine((img) => img.origin !== 'ai-generated' || img.aiLabeled === true, {
    message: 'ai-generated 이미지는 aiLabeled=true 필수 (정직 표기 원칙)',
  });

export const productPageBriefSchema = z.object({
  id: z.string().min(1),
  keyword: z.string().min(1),
  productName: z.string().min(1),
  brand: z.string().min(1),
  market: z.literal('qoo10-jp'),
  tone: z.enum(['clean-derma', 'premium-amber', 'vivid-pop']),
  locale: z.enum(['ja', 'ko']),
  volume: z.string().optional(),
  ingredients: z.array(z.string()),
  claims: z.array(evidenceClaimSchema),
  images: z.array(pageImageAssetSchema),
  weightG: z.number().positive().optional(),
});

export const pageSectionSchema = z.object({
  type: z.enum(['hero', 'pain-points', 'ingredient', 'selling-points', 'usage', 'full-ingredients', 'faq', 'policy']),
  eyebrow: z.string().optional(),
  heading: z.string().min(1),
  body: z.string().optional(),
  items: z.array(z.object({ title: z.string().optional(), text: z.string().min(1), note: z.string().optional() })).optional(),
  gauges: z.array(z.object({ label: z.string().min(1), pct: z.number().min(0).max(100) })).optional(),
});

export const productPageDocSchema = z.object({
  briefId: z.string().min(1),
  locale: z.enum(['ja', 'ko']),
  sections: z.array(pageSectionSchema).min(1),
});

export type BriefInput = z.infer<typeof productPageBriefSchema>;
export type DocInput = z.infer<typeof productPageDocSchema>;
