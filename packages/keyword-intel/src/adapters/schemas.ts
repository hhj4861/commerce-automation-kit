/**
 * 네이버 공식 API 응답의 런타임 검증 스키마 (D1-1 / D1-3 실측 필드 기준).
 *
 * 외부 API 는 스키마가 조용히 바뀔 수 있으므로(ARCHITECTURE §5), 어댑터는 `.json()` 을
 * 절대 그대로 캐스팅하지 않고 여기서 parse 로 검증한다. 검증 실패는 NaverSchemaError 로
 * 표면화한다(silent drop 금지 — 응답 스키마 불일치 알림의 근거).
 *
 * 관용:
 *  - `.passthrough()` 로 미래에 추가되는 응답 필드는 통과시키되(파괴 방지), 우리가 계약으로
 *    쓰는 필드는 존재/형식을 강제한다.
 *  - ⚠️ lprice/hprice 는 문서상 Integer 지만 실제 JSON 응답은 문자열("19900")로 온다(D1-1).
 *    따라서 z.string() 으로 받고, 수치화는 core/analyzer 에서 Number() 로 한다.
 */
import { z } from 'zod';

export const shopItemSchema = z
  .object({
    title: z.string(),
    link: z.string(),
    image: z.string(),
    lprice: z.string(),
    hprice: z.string(),
    mallName: z.string(),
    productId: z.string(),
    productType: z.string(),
    brand: z.string(),
    maker: z.string(),
    category1: z.string(),
    category2: z.string(),
    category3: z.string(),
    category4: z.string(),
  })
  .passthrough();

export const shopSearchResultSchema = z
  .object({
    total: z.number(),
    start: z.number(),
    display: z.number(),
    items: z.array(shopItemSchema),
  })
  .passthrough();

export const datalabResultSchema = z
  .object({
    startDate: z.string(),
    endDate: z.string(),
    timeUnit: z.enum(['date', 'week', 'month']),
    results: z.array(
      z.object({
        title: z.string(),
        keywords: z.array(z.string()),
        data: z.array(z.object({ period: z.string(), ratio: z.number() })),
      }),
    ),
  })
  .passthrough();

/**
 * 쇼핑인사이트 category/keywords 응답 (D1-4 공식 문서 실측 2026-07-25).
 * ⚠️ 검색 트렌드(datalabResultSchema)는 `results[].keywords`(복수)이지만, 쇼핑인사이트는
 *    `results[].keyword`(단수, 문자열 배열)다 — 공식 문서 원문 기준. 혼동 주의.
 * ratio 는 구간 최대=100 상대값(절대 클릭량 아님).
 */
export const shoppingInsightResultSchema = z
  .object({
    startDate: z.string(),
    endDate: z.string(),
    timeUnit: z.enum(['date', 'week', 'month']),
    results: z.array(
      z.object({
        title: z.string(),
        keyword: z.array(z.string()), // ⚠️ 단수 keyword (검색 트렌드의 keywords 와 다름)
        data: z.array(z.object({ period: z.string(), ratio: z.number() })),
      }),
    ),
  })
  .passthrough();

/** 응답 타입은 스키마에서 파생한다(타입과 런타임 검증의 단일 소스). */
export type ShopItem = z.infer<typeof shopItemSchema>;
export type ShopSearchResult = z.infer<typeof shopSearchResultSchema>;
export type DatalabResult = z.infer<typeof datalabResultSchema>;
export type ShoppingInsightResult = z.infer<typeof shoppingInsightResultSchema>;
