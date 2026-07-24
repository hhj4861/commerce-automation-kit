/**
 * ============================================================================
 *  출력 계약 (Output Contract) — 이 모듈이 외부에 노출하는 유일한 인터페이스
 * ============================================================================
 *
 *  "모듈을 독립 구축한 뒤 하나씩 조합한다"는 전략의 실체가 바로 이 파일이다.
 *  다른 어떤 모듈(슬라이드 렌더러, 쿠팡 연동 등)도 이 모듈의 내부 구현을 몰라도 되고,
 *  오직 아래 `KeywordSignal` 타입만 알면 조합할 수 있다.
 *
 *  ▸ 이 계약은 append-only 로 진화시킨다. 필드 삭제/의미 변경은 breaking change.
 *  ▸ 소비 모듈은 이 파일만 import 한다 (adapters/core 를 직접 import 하지 않는다).
 *  ▸ 이 계약에는 "홈쇼핑 낙수 신호" 같은 반증된 개념을 넣지 않는다.
 *    (blueprint-review 감사 결론: 낙수는 구매지표에서 소멸 → 트리거로 쓰지 않는다)
 *    이 모듈은 트리거가 아니라 "일반 수요·경쟁 참고 지표"만 산출한다.
 */

/** 수집 소스. 전부 네이버 공식 API. 스크래핑 소스는 계약상 존재하지 않는다. */
export type IntelSource = 'naver_search_shop' | 'naver_datalab_search' | 'naver_datalab_shopping';

/** 상대 지표임을 타입으로 강제 — 절대 판매량이 아니다. 오해 방지용 브랜딩 타입. */
export type RelativeIndex = number & { readonly __brand: 'RelativeIndex_0_100' };

/** 한 키워드에 대한 시장 인텔리전스 스냅샷. 이 모듈의 원자 출력 단위. */
export interface KeywordSignal {
  /** 정규화된 키워드 (소문자/공백정리 등은 core에서 처리) */
  keyword: string;

  /** 이 스냅샷이 만들어진 시점 (ISO8601, UTC) */
  capturedAt: string;

  /** 쇼핑 검색 API 기반 경쟁/가격 지표 */
  competition: {
    /** 검색결과 총 상품 수 (naver shop `total`) — 경쟁 밀도의 프록시 */
    totalProducts: number;
    /** 상위 N개 상품의 최저가 분포 */
    priceLow: number | null;
    priceHigh: number | null;
    priceMedian: number | null;
    /** 상위 결과에서 몰(mallName) 고유 개수 — 판매자 집중도 */
    distinctSellers: number;
    /** 상위 결과 중 브랜드/제조사가 명시된 비율 (0~1) */
    brandedRatio: number;
  };

  /**
   * 검색어 트렌드 (데이터랩). 절대 검색량이 아니라 기간 내 상대값(0~100).
   * 데이터가 없으면 null (호출 한도/미수집 구분은 `coverage` 로).
   */
  trend: {
    /** 최근 기간 상대 검색량 (0~100) */
    latest: RelativeIndex | null;
    /** 직전 동일 기간 대비 변화율 (%) — 양수=상승. null=계산 불가 */
    momentumPct: number | null;
    /** timeUnit 단위 시계열 (그래프/판단 근거용) */
    series: ReadonlyArray<{ period: string; ratio: RelativeIndex }>;
  };

  /** 파생 스코어 (core/analyzer 산출). 정의는 ARCHITECTURE.md §4 참조 */
  scores: {
    /** 수요 대비 경쟁 매력도 (0~100). 높을수록 "수요 있고 경쟁 덜함" */
    opportunity: number;
    /** 이 스코어를 신뢰할 수 있는 정도 (0~1). 데이터 결측 시 하락 */
    confidence: number;
  };

  /** 이 신호가 어떤 소스로/얼마나 채워졌는지 (부분 결측 투명화) */
  coverage: {
    sources: IntelSource[];
    /** 각 소스별 성공 여부 — 트렌드 결측인데 성공으로 오인하는 것 방지 */
    ok: Partial<Record<IntelSource, boolean>>;
    /** 한도 초과로 스킵된 소스 (budget에 걸린 경우) */
    skippedByBudget: IntelSource[];
  };

  /**
   * 규정 준수 메타. 이 데이터를 하위 모듈이 어떻게 쓸 수 있는지의 경계.
   * LEGAL-BOUNDARY.md 의 제약을 런타임까지 전파한다.
   */
  compliance: {
    /** 네이버 약관상 원본 재판매가 금지되면 true (구현 D1 실측 후 세팅) */
    resaleRestricted: boolean;
    /** 캐시 허용 최대 기간(시간). 약관 확인 전 기본값은 보수적으로 낮게 */
    cacheTtlHours: number;
  };
}

/** 배치 수집 결과. CLI/스케줄러가 반환하는 상위 단위. */
export interface IntelBatch {
  runId: string;
  requestedKeywords: string[];
  signals: KeywordSignal[];
  /** 수집 실패 키워드와 사유 (silent drop 금지) */
  failures: Array<{ keyword: string; reason: string }>;
  /** 이 배치에서 소비한 API 호출 수 (한도 관측) */
  callsSpent: Record<IntelSource, number>;
  startedAt: string;
  finishedAt: string;
}
