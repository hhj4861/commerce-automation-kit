/**
 * ============================================================================
 *  블로그 export 계약 (wp-auto-blog 브릿지 — QUESTION-MINING.md §8)
 * ============================================================================
 *
 *  keyword-intel(생산자)이 `analyze --profile blog-kr|blog-global --json` 으로
 *  내보내고, 외부 repo wp-auto-blog(Python 소비자)가 pull 하는 **단방향 JSON 계약**.
 *  두 저장소는 서로 다른 법체계/컴플라이언스 — 코드·저장·게이트 통합 금지, 데이터만 흐른다.
 *
 *  ▸ append-only 로 진화. 필드 삭제/의미 변경은 breaking change.
 *  ▸ 스코어는 참고 지표(자동 발행 트리거 금지 — 경계 5).
 *  ▸ **보수 모드**: 제3자 질문 원문(source_questions)은 재표현 게이트(§8) 통과분만.
 *    D1-5 약관 확정 전에는 재표현·제목화된 topic 만 내보낸다. 질문 원문 미포함이 기본.
 *  ▸ JSON 키는 소비자(wp-auto-blog) 규약에 맞춘 형태다(items 의 monthly_search 등 snake_case).
 */

/** export 한 건 = 블로그 큐에 들어갈 소재 후보. */
export interface BlogExportItem {
  /** 재표현·제목화된 소재(현재: 정규화 키워드). 질문 원문 아님. */
  topic: string;
  /** 연관 키워드(현재: [keyword]). */
  keywords: string[];
  /** 블로그 카테고리 — kit 은 블로그 분류 체계를 모르므로 비워둔다(소비자가 배정). */
  category?: string;
  /** 월 검색량(절대치). Naver SearchAd keyword tool(D1-8) 미연동 시 null/생략. 지어내지 않는다. */
  monthly_search?: number | null;
  /** 기회 점수(0~100, 높을수록 수요·저경쟁). 참고 지표. */
  opportunity?: number;
}

/** export 봉투. schemaVersion·compliance 필수(§8/§10). */
export interface BlogExport {
  /** 계약 버전. 소비자가 지원 버전만 수락한다. */
  schemaVersion: 1;
  /** 채널-마켓 2축 프로파일 식별자: 'blog-kr' | 'blog-global' | … */
  profile: string;
  /** 생성 시각(ISO8601). */
  generatedAt: string;
  /** 컴플라이언스 전파 — 수신측이 TTL 을 자기 저장소에 건다(§8). */
  compliance: { resaleRestricted: boolean; cacheTtlHours: number };
  /** 소재 후보 목록. 비어도 유효(해외 소스 미연동 시 등). */
  items: BlogExportItem[];
}

/** 지원 프로파일 식별자(채널=blog 고정, 마켓 축만 분화). */
export type BlogProfileId = 'blog-kr' | 'blog-global';
