/**
 * works.json / site.config.json / ffprobe 출력의 zod 런타임 검증 스키마.
 *
 * 계약(@cak/contracts 의 Showcase*)을 그대로 미러링한다 — 타입은 계약이 진실이고,
 * 여기는 파일에서 읽은 값의 런타임 검증만 담당한다.
 *
 * 관용:
 *  - work entry 는 `.passthrough()` — 계약이 append-only 로 진화하므로 미래 필드는
 *    통과시키되(파괴 방지), 우리가 쓰는 필드는 존재/형식을 강제한다.
 *  - 파싱 실패 메시지는 "어떤 엔트리의 어떤 필드"인지 특정되게 core/works.ts 의
 *    formatIssues 로 경로를 붙여 노출한다 (silent drop 금지).
 */
import { z } from 'zod';

/** 케이스 카드·라이트박스 언어별 텍스트 블록 (ShowcaseText) */
export const showcaseTextSchema = z
  .object({
    cat: z.string(),
    meta: z.string(),
    runtime: z.string(),
    h3: z.string(),
    p: z.string(),
    chips: z.array(z.string()),
    how: z.string(),
    sub: z.string(),
  })
  .passthrough();

export const showcaseClipTextSchema = z.object({ label: z.string(), cap: z.string() }).passthrough();

/** 라이트박스 컷 1개 (ShowcaseClip) */
export const showcaseClipSchema = z
  .object({
    poster: z.string().min(1),
    src: z.string().min(1),
    en: showcaseClipTextSchema,
    ko: showcaseClipTextSchema,
  })
  .passthrough();

/** 실제 광고주 케이스 (ShowcaseWorkEntry) */
export const showcaseWorkEntrySchema = z
  .object({
    id: z.string().min(1),
    brand: z.string().min(1),
    cover: z.string().min(1),
    prev: z.string().min(1).optional(),
    en: showcaseTextSchema,
    ko: showcaseTextSchema,
    clips: z.array(showcaseClipSchema),
  })
  .passthrough();

/** "다음 캠페인" 예약 슬롯 (ShowcaseReservedEntry) — 텍스트 요건 미적용 */
export const showcaseReservedEntrySchema = z
  .object({
    id: z.string().min(1),
    reserved: z.literal(true),
  })
  .passthrough();

/** reserved 엔트리와 일반 엔트리의 union */
export const showcaseEntrySchema = z.union([showcaseReservedEntrySchema, showcaseWorkEntrySchema]);

/** works.json 루트 (ShowcaseWorksFile) */
export const showcaseWorksFileSchema = z.object({ entries: z.array(showcaseEntrySchema) });

/** site.config.json (ShowcaseSiteConfig) — 이 파일이 있어야 관리 대상 사이트다 */
export const showcaseSiteConfigSchema = z.object({
  name: z.string().min(1),
  deploy: z.object({
    provider: z.literal('cloudflare-pages'),
    projectName: z.string().min(1),
    branch: z.string().min(1),
  }),
  paths: z.object({
    html: z.string().min(1),
    worksJson: z.string().min(1),
    worksJs: z.string().min(1),
    media: z.string().min(1),
    dist: z.string().min(1),
  }),
});

/**
 * ffprobe `-of json` 출력 — width/height 는 비디오 스트림, duration 은 format 에서 온다.
 * (duration 은 문서와 달리 문자열("15.023000")로 오므로 z.string 으로 받고 수치화는 media.ts 에서)
 */
export const ffprobeOutputSchema = z
  .object({
    streams: z
      .array(z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).passthrough())
      .min(1),
    format: z.object({ duration: z.string() }).passthrough(),
  })
  .passthrough();
