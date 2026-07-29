/**
 * 네이버 **검색광고** 키워드도구(keywordstool) 어댑터 — openapi 와 별개 API군.
 *
 * ⚠️ openapi.naver.com(naver-client.ts)과 인증·호스트·약관이 모두 다르다:
 *   - 호스트: api.searchad.naver.com  (검색광고 계정 필요 — 별도 자격증명)
 *   - 인증: HMAC-SHA256 서명 (X-Timestamp/X-API-KEY/X-Customer/X-Signature)
 *   - 데이터: `trend`(데이터랩 상대 0~100)와 달리 **최근 30일 절대 검색수**(계약 absoluteVolume 의 근거)
 *
 * 약관: 이 데이터는 제3자 제공·재판매 금지(계약 keyword-signal.ts absoluteVolume 주석 참조).
 *       → 본인 시스템 내부 랭킹에만 사용하고 원본을 외부로 재배포하지 않는다.
 *
 * 한도: 검색광고 keywordstool 한도는 수치 비공개(계정+IP 유연제한) — 429 는 호출부에서
 *       적응형 백오프로 처리한다(코어 예산원장은 openapi 3소스 전용이라 여기에 끼우지 않는다).
 */
import { createHmac } from 'node:crypto';
import { request } from 'undici';
import { z } from 'zod';

const API_BASE = 'https://api.searchad.naver.com';
const KEYWORDSTOOL_URI = '/keywordstool';

export interface SearchAdCredentials {
  customerId: string;
  apiKey: string;
  secretKey: string;
}

/** 검색광고 자격증명 로드. 미설정이면 null(블로그 랭킹은 이 소스 없이도 실패 안 하고 스킵). */
export function loadSearchAdCredentials(): SearchAdCredentials | null {
  const customerId = process.env.NAVER_AD_CUSTOMER_ID?.trim();
  const apiKey = process.env.NAVER_AD_API_KEY?.trim();
  const secretKey = process.env.NAVER_AD_SECRET_KEY?.trim();
  if (!customerId || !apiKey || !secretKey) return null;
  return { customerId, apiKey, secretKey };
}

/** 서명 헤더 — signature = base64(hmac_sha256(secret, `${ts}.${method}.${uri}`)). */
function signedHeaders(
  method: string,
  uri: string,
  cred: SearchAdCredentials,
  now: () => number,
): Record<string, string> {
  const ts = String(now());
  const sig = createHmac('sha256', cred.secretKey).update(`${ts}.${method}.${uri}`).digest('base64');
  return {
    'X-Timestamp': ts,
    'X-API-KEY': cred.apiKey,
    'X-Customer': cred.customerId,
    'X-Signature': sig,
  };
}

/** compIdx(광고 경쟁도) — 한국어 응답을 정규화. 알 수 없으면 null(투명화). */
function normCompIdx(v: unknown): 'low' | 'mid' | 'high' | null {
  const s = String(v ?? '').trim();
  if (s === '낮음' || s.toLowerCase() === 'low') return 'low';
  if (s === '중간' || s.toLowerCase() === 'mid' || s.toLowerCase() === 'medium') return 'mid';
  if (s === '높음' || s.toLowerCase() === 'high') return 'high';
  return null;
}

/**
 * 검색수 파싱: 숫자거나 "< 10"(월 10회 미만 마스킹) 문자열. 마스킹은 진짜 0 과 구분해야
 * 하므로(계약 absoluteVolume.masked) null + masked=true 로 반환한다.
 */
function parseQc(v: unknown): { value: number | null; masked: boolean } {
  if (typeof v === 'number' && Number.isFinite(v)) return { value: v, masked: false };
  const s = String(v ?? '').trim();
  if (s.startsWith('<')) return { value: null, masked: true };
  const n = Number(s.replace(/[^0-9]/g, ''));
  return Number.isFinite(n) && s !== '' ? { value: n, masked: false } : { value: null, masked: false };
}

const keywordToolSchema = z.object({
  keywordList: z
    .array(
      z.object({
        relKeyword: z.string(),
        monthlyPcQcCnt: z.union([z.number(), z.string()]).optional(),
        monthlyMobileQcCnt: z.union([z.number(), z.string()]).optional(),
        compIdx: z.string().optional(),
        plAvgDepth: z.union([z.number(), z.string()]).optional(),
      }),
    )
    .default([]),
});

/** 한 연관키워드 행 — 검색광고 절대 검색수 + 광고 경쟁도. */
export interface KeywordToolRow {
  relKeyword: string;
  /** 최근 30일 PC 검색수. 마스킹("<10") 시 null */
  monthlyPc: number | null;
  /** 최근 30일 모바일 검색수. 마스킹 시 null */
  monthlyMobile: number | null;
  /** PC 또는 모바일이 마스킹됐는지 — 진짜 0 과 구분 */
  masked: boolean;
  /** 광고 경쟁도 */
  compIdx: 'low' | 'mid' | 'high' | null;
}

export class SearchAdApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`[searchad:keywordstool] HTTP ${status} — ${body.slice(0, 200)}`);
    this.name = 'SearchAdApiError';
  }

  /** 429 = 한도/스로틀(수치 비공개) → 호출부가 적응형 백오프로 처리. */
  get rateLimited(): boolean {
    return this.status === 429;
  }
}

/**
 * keywordstool 조회. hint 키워드의 연관 키워드 + 각 절대 검색수/경쟁도를 검색수 내림차순으로 반환.
 * 힌트는 공백 불가(API 제약) → 제거. 실패는 던져서 호출부가 백오프/스킵 판단하게 한다.
 */
export async function keywordTool(
  cred: SearchAdCredentials,
  hint: string,
  now: () => number = () => Date.now(),
): Promise<KeywordToolRow[]> {
  const q = hint.replace(/\s+/g, '').slice(0, 40);
  const url = `${API_BASE}${KEYWORDSTOOL_URI}?hintKeywords=${encodeURIComponent(q)}&showDetail=1`;
  const res = await request(url, {
    method: 'GET',
    headers: signedHeaders('GET', KEYWORDSTOOL_URI, cred, now),
  });
  if (res.statusCode !== 200) {
    throw new SearchAdApiError(res.statusCode, await res.body.text());
  }
  const parsed = keywordToolSchema.parse(await res.body.json());
  const rows = parsed.keywordList.map((k): KeywordToolRow => {
    const pc = parseQc(k.monthlyPcQcCnt);
    const mo = parseQc(k.monthlyMobileQcCnt);
    return {
      relKeyword: k.relKeyword,
      monthlyPc: pc.value,
      monthlyMobile: mo.value,
      masked: pc.masked || mo.masked,
      compIdx: normCompIdx(k.compIdx),
    };
  });
  const total = (r: KeywordToolRow): number => (r.monthlyPc ?? 0) + (r.monthlyMobile ?? 0);
  return rows.sort((a, b) => total(b) - total(a));
}
