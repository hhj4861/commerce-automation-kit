/**
 * ============================================================================
 *  쇼케이스 계약 (Showcase Contract) — @cak/showcase-site ↔ 소비자
 * ============================================================================
 *
 *  FIRSTFRAME형 광고 쇼케이스 사이트의 데이터·설정·배포 계약.
 *  단일 진실 소스는 사이트 디렉토리의 `works.json` 이며, 프론트가 로드하는
 *  `works.js` 는 works.json 에서 **생성**된다 (직접 편집 금지).
 *
 *  ▸ append-only. 필드 삭제/의미 변경은 breaking change.
 *  ▸ 이중언어(en/ko) 텍스트는 항상 쌍으로 존재해야 한다 (검증 대상).
 *  ▸ 배포는 명시적 명령으로만 — 지표/스코어에 의한 자동 배포 트리거 금지.
 */

/** 케이스 카드·라이트박스에 쓰이는 언어별 텍스트 블록 */
export interface ShowcaseText {
  /** 카테고리 라벨 (예: "Beverage · DTC") */
  cat: string;
  /** 킥커 메타 (예: "Beverage · DTC · 2026") */
  meta: string;
  /** 러닝타임 라벨 (예: "0:15 · 3 cuts") */
  runtime: string;
  /** 케이스 소제목 */
  h3: string;
  /** 케이스 본문 */
  p: string;
  /** 서비스/특징 칩 */
  chips: string[];
  /** "제작 방식" 문단 — HTML 허용(<b> 등) */
  how: string;
  /** 라이트박스 서브타이틀 */
  sub: string;
}

export interface ShowcaseClipText {
  label: string;
  cap: string;
}

/** 라이트박스에서 전환 가능한 컷 1개 */
export interface ShowcaseClip {
  /** 사이트 루트 기준 상대경로 (예: "media/poster-x.jpg") */
  poster: string;
  src: string;
  en: ShowcaseClipText;
  ko: ShowcaseClipText;
}

/** 실제 광고주 케이스 */
export interface ShowcaseWorkEntry {
  /** 고유 슬러그 (영문 소문자/숫자/하이픈) */
  id: string;
  /** 브랜드 표기 (언어 무관 그대로 노출) */
  brand: string;
  /** 케이스 대표 포스터 (사이트 루트 상대경로) */
  cover: string;
  /** hover 프리뷰 영상 (무음 루프) — 선택 */
  prev?: string;
  en: ShowcaseText;
  ko: ShowcaseText;
  clips: ShowcaseClip[];
}

/** "다음 캠페인" 예약 슬롯 — 텍스트 요건을 적용하지 않는다 */
export interface ShowcaseReservedEntry {
  id: string;
  reserved: true;
}

export type ShowcaseEntry = ShowcaseWorkEntry | ShowcaseReservedEntry;

/** works.json 파일의 루트 형태 */
export interface ShowcaseWorksFile {
  entries: ShowcaseEntry[];
}

/** 사이트 디렉토리의 site.config.json — 이 파일이 있으면 관리 대상 사이트다 */
export interface ShowcaseSiteConfig {
  /** 사이트 식별 이름 */
  name: string;
  deploy: {
    provider: 'cloudflare-pages';
    projectName: string;
    branch: string;
  };
  /** 사이트 디렉토리 기준 상대경로들 */
  paths: {
    /** 배포 시 index.html 이 될 HTML */
    html: string;
    worksJson: string;
    worksJs: string;
    media: string;
    dist: string;
  };
}

/** 배포 1회의 결과 보고 — 실패도 침묵하지 않고 이 형태로 노출한다 */
export interface ShowcaseDeployReport {
  provider: string;
  projectName: string;
  ok: boolean;
  /** 성공 시 배포 URL (프리뷰 URL 포함 가능) */
  url?: string;
  /** wrangler 출력 요약 (실패 원인 포함) */
  log: string;
}
