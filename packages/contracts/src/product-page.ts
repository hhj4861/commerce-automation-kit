/**
 * product-page-gen (원자 #10) ↔ 소비자 계약.
 *
 * 키워드/상품 하나를 받아 큐텐재팬(J'QSM) 등록용 상세페이지 산출물
 * (일본어 HTML 프래그먼트 + 텍스트 폴백 + 근거/컴플라이언스 리포트)을 만드는
 * 원자의 입출력 타입.
 *
 * 설계 판단:
 * - 카피 "생성"은 스킬(Claude)이 하고, 원자는 결정적(deterministic) 부분만 담당:
 *   약기법/화장품법 표현 lint · Qxpress 물류 게이트 · 마진 시뮬레이션 · HTML 렌더.
 * - 사람 승인 게이트(금지선 #3·#8)가 export 앞에 있다 — lint block 이 남은 문서는
 *   렌더 자체를 거부한다.
 * - 이미지는 경로/출처만 계약에 담는다. 타사 이미지 스크래핑은 금지선 #1.
 */

/**
 * 대상 마켓. v0.1 은 큐텐재팬. 'naver-smartstore' 는 2026-09-06 append(한국 시장 핸드크림 파일럿) —
 * 한국어 상세 렌더 전용이며 Qxpress 물류·JPY 마진 게이트는 적용되지 않는다.
 */
export type PageMarket = 'qoo10-jp' | 'naver-smartstore';

/** 시안 톤 3종 (2026-07-26 사용자 시안 확인 기준). */
export type PageTone = 'clean-derma' | 'premium-amber' | 'vivid-pop';

/** 산출 로케일. 큐텐재팬 상세는 ja, 내부 검토용 ko 병행 가능. */
export type PageLocale = 'ja' | 'ko';

/** 리서치로 검증된 주장 1건 — 출처 없는 주장은 verified=false 로 명시. */
export interface EvidenceClaim {
  text: string;
  sourceUrl?: string;
  verified: boolean;
}

/** 이미지 자산. origin 이 ai-generated 면 aiLabeled 필수 true(정직 표기 원칙). */
export interface PageImageAsset {
  slot: 'hero' | 'texture' | 'mood' | 'extra';
  /** 로컬 파일 경로. 등록 시 J'QSM 업로드 후 URL 로 치환된다. */
  path?: string;
  origin: 'user' | 'supplier-licensed' | 'ai-generated';
  /** 사용권 근거 한 줄(공급사 제공, 본인 촬영, 생성 프롬프트 등). */
  licenseNote: string;
  aiLabeled?: boolean;
}

/** 상세페이지 생성 입력 브리프. */
export interface ProductPageBrief {
  id: string;
  /** 사용자가 스킬에 던진 원 키워드(예: "나이아신 화장품"). */
  keyword: string;
  productName: string;
  brand: string;
  market: PageMarket;
  tone: PageTone;
  locale: PageLocale;
  /** 용량 표기(예: "30ml"). 일본 리스팅 규격 대조용. */
  volume?: string;
  /** 전성분(표기 의무 슬롯) — 미확정이면 빈 배열 + 렌더 시 경고. */
  ingredients: string[];
  /** 소구 근거 주장 목록 — verified=true 만 본문 카피에 사용해야 한다. */
  claims: EvidenceClaim[];
  images: PageImageAsset[];
  /** 실측 중량(g) — Qxpress 요율/Economy 게이트에 사용. */
  weightG?: number;
}

/** 렌더 가능한 섹션 타입 — 시안 8섹션 구조와 1:1. */
export type PageSectionType =
  | 'hero'
  | 'pain-points'
  | 'ingredient'
  | 'selling-points'
  | 'usage'
  | 'full-ingredients'
  | 'faq'
  | 'policy';

/** 섹션 하나의 카피. 렌더러는 이 데이터만으로 결정적으로 HTML 을 만든다. */
export interface PageSection {
  type: PageSectionType;
  /** 섹션 상단 소제목(영문 eyebrow 등). */
  eyebrow?: string;
  heading: string;
  body?: string;
  /** 체크리스트/포인트/FAQ 항목. */
  items?: Array<{ title?: string; text: string; note?: string }>;
  /** ingredient 게이지: [{ label, pct }] — pct 는 0~100. */
  gauges?: Array<{ label: string; pct: number }>;
}

/** 상세페이지 문서(카피 완성본). */
export interface ProductPageDoc {
  briefId: string;
  locale: PageLocale;
  sections: PageSection[];
}

/** 표현 lint 가 참조한 법역. */
export type ComplianceLaw = 'jp-yakkiho' | 'kr-cosmetics' | 'logistics' | 'platform';

export type ComplianceSeverity = 'block' | 'conditional' | 'note';

export interface ComplianceFinding {
  ruleId: string;
  law: ComplianceLaw;
  severity: ComplianceSeverity;
  /** 걸린 원문 표현. */
  matched: string;
  /** 어느 섹션에서 걸렸나 (raw text lint 면 'text'). */
  where: string;
  suggestion: string;
}

export interface ComplianceReport {
  findings: ComplianceFinding[];
  blockCount: number;
  conditionalCount: number;
  /** block 0건이어야 true — 렌더/export 하드 게이트. */
  gatePassed: boolean;
}

/** Qxpress 물류 게이트 결과. */
export interface LogisticsCheck {
  /** 인화성 의심 키워드 매치(스프레이·미스트·향수·염색 등) — 발송 불가 품목. */
  flammable: boolean;
  flammableMatches: string[];
  /** Economy(우편함 투함) 규격 충족 여부. 치수 미제공 시 null(무게만으로 판정 불가). */
  economyEligible: boolean | null;
  /** 요율표 기준 추정 배송비(JPY). 요율 미확정 구간이면 null. */
  estimatedJpy: number | null;
  notes: string[];
}

/** 마진 시뮬레이션 입력. 수치 근거: platform-selection-2026-07-26.md (검증 완료). */
export interface MarginInput {
  salePriceJpy: number;
  wholesaleKrw: number;
  /** JPY→KRW 환율 (예: 8.94). 호출 시점 실측값을 넣는다 — 하드코딩 금지. */
  jpyToKrw: number;
  scenario: 'normal' | 'megawari';
  /** Qxpress 배송비(JPY). logistics 게이트 추정치 또는 실측. */
  qxpressJpy: number;
  /** 도매처→집하지 국내 물류 배분(KRW/개). */
  domesticShipKrw: number;
  /** 일반과세자+적격증빙 전제의 부가세 환급(10/110) 반영 여부. */
  vatRefund: boolean;
  /** 광고비 매출 대비 %(메가와리 기본 4). */
  adRatePct?: number;
  /** 환전 스프레드 %(기본 1). */
  fxSpreadPct?: number;
  /** 통과 기준 순마진율 %(기본 15). */
  passThresholdPct?: number;
}

export interface MarginResult {
  revenueKrw: number;
  platformFeeKrw: number;
  shippingKrw: number;
  cogsKrw: number;
  fxCostKrw: number;
  netKrw: number;
  /** 반올림(소수 2자리) 후 값 — pass 판정도 이 값 기준(표시-판정 일치). */
  netMarginPct: number;
  pass: boolean;
  /** 적용된 수수료율 %(플랫폼 비용 합계). */
  appliedFeePct: number;
  /** 판정에 사용된 통과 문턱 % — 소비자 재검산용. */
  passThresholdPct: number;
}

/** export 산출물 매니페스트. */
export interface PageExportResult {
  format: 'qoo10-html';
  htmlPath: string;
  textPath: string;
  lintReportPath: string;
  warnings: string[];
}
