/**
 * 블로그 export 빌더 — 저장된 신호의 읽기 전용 뷰를 §8 단방향 JSON 계약으로 조립한다.
 * (QUESTION-MINING.md §7 프로파일 / §8 브릿지)
 *
 * buildBlogExport 는 순수 함수(DB·IO 없음) → 테스트 용이. 조회·출력은 cli/index.ts 가 조립.
 *
 * 설계 원칙:
 *  - 수집기는 채널을 모른다. 프로파일 로직은 이 읽기 전용 뷰에만 존재(§7).
 *  - **보수 모드**: 질문 원문(source_questions) 미포함. 현재는 재표현·제목화 단계가
 *    없으므로 topic = 정규화 키워드(제3자 질문 원문 아님). 지어낸 제목을 넣지 않는다.
 *  - monthly_search 는 절대 검색량(D1-8) 미연동이라 지금은 넣지 않는다(지어내지 않음).
 *  - compliance 는 신호에서 전파하되 **가장 엄격한 값**(최소 TTL, resaleRestricted OR)으로 봉투에 싣는다.
 *  - 스코어는 참고 지표(자동 발행 트리거 금지 — 경계 5).
 */
import type { BlogExport, BlogExportItem, BlogProfileId } from '@cak/contracts';
import type { ExportRow } from '../store/signals.js';

/** 지원 프로파일(채널=blog 고정, 마켓 축만 분화 — §7). */
export const BLOG_PROFILES: Record<BlogProfileId, { market: 'kr' | 'global' }> = {
  'blog-kr': { market: 'kr' },
  'blog-global': { market: 'global' },
};

/** 프로파일이 없으면 D1-5 전 보수 기본값. 신호가 있으면 신호의 값이 우선한다. */
const CONSERVATIVE_COMPLIANCE = { resaleRestricted: true, cacheTtlHours: 24 };

export function isBlogProfile(id: string): id is BlogProfileId {
  return Object.prototype.hasOwnProperty.call(BLOG_PROFILES, id);
}

/** 미지원 프로파일은 조용히 넘기지 않고 실패시킨다(silent-drop 금지). */
export function resolveProfile(id: string): BlogProfileId {
  if (!isBlogProfile(id)) {
    throw new Error(
      `지원하지 않는 프로파일: ${id} (지원: ${Object.keys(BLOG_PROFILES).join(', ')})`,
    );
  }
  return id;
}

/** 여러 신호의 compliance 를 가장 엄격하게 합친다(수신측이 이 값으로 TTL 을 건다 — §8). */
function strictestCompliance(rows: ExportRow[]): { resaleRestricted: boolean; cacheTtlHours: number } {
  if (rows.length === 0) return { ...CONSERVATIVE_COMPLIANCE };
  return {
    resaleRestricted: rows.some((r) => r.compliance.resaleRestricted),
    cacheTtlHours: Math.min(...rows.map((r) => r.compliance.cacheTtlHours)),
  };
}

function toItem(row: ExportRow): BlogExportItem {
  return {
    // 재표현·제목화 단계 미구현 → 정규화 키워드를 topic 으로(질문 원문 아님).
    topic: row.keyword,
    keywords: [row.keyword],
    opportunity: row.opportunity,
    // category/monthly_search 는 지금 근거가 없어 생략(소비자 배정 / D1-8 후).
  };
}

/**
 * 저장 신호 행 → §8 export 봉투. 순수 함수.
 * @param rows signalsForExport() 결과(이미 프로파일 필터/정렬된 읽기 전용 뷰)
 * @param profile 프로파일 식별자(봉투 표기)
 * @param now 생성 시각(ISO) — 주입 가능(테스트/재현)
 */
export function buildBlogExport(
  rows: ExportRow[],
  opts: { profile: BlogProfileId; now: string },
): BlogExport {
  return {
    schemaVersion: 1,
    profile: opts.profile,
    generatedAt: opts.now,
    compliance: strictestCompliance(rows),
    items: rows.map(toItem),
  };
}
