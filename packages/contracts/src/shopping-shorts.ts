/**
 * shopping-shorts (원자 #12) ↔ 소비자 계약.
 *
 * "쇼핑쇼츠"(상품 소개 세로영상 + 제휴 링크) 제작 파이프라인의 입출력 타입.
 * 소재 신호는 keyword-intel(#1), 클립 생성은 힉스필드(스킬), 업로드는 shorts-publish(#7)가
 * 담당하고, 이 원자는 그 사이의 결정적 구간(대본 검증·고지 강제·9:16 조립)을 맡는다.
 *
 * 설계 제약 (강의 3편 실측 분석에서 도출, 2026-07-27):
 * - 소재 영상은 전량 자체 생성(힉스필드) — 타인 영상/이미지 재가공 입력은 계약 밖(금지선 #1).
 * - 훅 유형에 '가짜 경험담'은 의도적으로 없다 — 실경험 없는 후기 서사는 기만광고 소지.
 * - 제휴 링크가 있는 발행물은 대가성 고지가 강제된다(공정위 추천·보증 심사지침).
 */

/**
 * 훅 유형. 강의 공통 패턴에서 합법 성립 가능한 것만 채택.
 * (fake-experience 류는 의도적 제외 — 위 헤더 주석 참조)
 */
export type ShortsHookType =
  | 'problem-solution' // 불편 제시 → 해결 데모
  | 'before-after'     // 사용 전/후 대비(과장·효능단정은 lint 가 차단)
  | 'demo'             // 제품 작동/사용 순수 데모
  | 'curiosity'        // 호기심 훅("이게 왜 필요하냐면")
  | 'info-tip';        // 정보성 팁 프레임(카테고리 지식 + 제품 소개)

/** 소재(상품) 브리프 — 파이프라인의 시작점. */
export interface ShoppingShortsBrief {
  /** slug (파일·잡 식별자) */
  id: string;
  /** 소개할 상품명(발행 시 링크 대상과 일치해야 함 — 영상·링크 불일치는 기만) */
  productName: string;
  /**
   * 제휴(파트너스) 링크 — 사용자가 파트너스에서 직접 발급해 수동 입력.
   * 발행 게이트: 이 값이 있으면 고지문구 검증 없이는 발행 불가.
   * TODO(D1): 파트너스 딥링크 API 어댑터는 약관 실측 후 예약 슬롯.
   */
  affiliateUrl?: string;
  /**
   * 유료 의뢰·자체 판매 상품 홍보물(2026-09-06 append). 제휴 링크가 없어도 경제적 대가가 있는
   * 콘텐츠이므로 영상 오버레이·설명란에 "(광고)" 표기를 강제한다(공정위 추천·보증 심사지침).
   */
  sponsored?: boolean;
  /** keyword-intel 연동 소재 키워드(출처 추적용) */
  keyword?: string;
  category?: string;
  /** 소구점(리서치 근거 있는 것만) */
  appealPoints: string[];
  /** 건강기능식품 여부 — true 면 표현 lint 가 강화 모드(효능단정 전면 차단) */
  isHealthFunctional?: boolean;
  /** ISO 8601 */
  createdAt: string;
}

/** 대본의 한 비트(장면 단위). */
export interface ShortsScriptBeat {
  index: number;
  role: 'hook' | 'body' | 'cta';
  durationSec: number;
  /** TTS 내레이션 대본(기본 포함 포맷) */
  narration: string;
  /** 화면 번인 자막(짧게) */
  caption: string;
  /** 힉스필드 생성 프롬프트 — 자체 생성 전용(외부 소스 URL 금지) */
  visualPrompt: string;
}

/** 쇼츠 1편의 대본. */
export interface ShortsScript {
  briefId: string;
  hookType: ShortsHookType;
  /** 업로드 제목 */
  title: string;
  beats: ShortsScriptBeat[];
  hashtags: string[];
  /** 업로드 설명란 — 제휴 링크 존재 시 대가성 고지 문구가 포함돼야 발행 가능 */
  description: string;
}

export type ScriptLintSeverity = 'block' | 'warn';

/** 표현 lint 발견 항목. */
export interface ScriptLintFinding {
  rule: string;
  severity: ScriptLintSeverity;
  /** 위치 경로 (예: beats[2].narration, description) */
  field: string;
  /** 걸린 원문 */
  matched: string;
  reason: string;
}

/** 표현 lint 리포트 — block 1건이라도 있으면 조립·발행 거부. */
export interface ScriptLintReport {
  ok: boolean;
  findings: ScriptLintFinding[];
}

/** 번인 자막 한 줄. */
export interface CaptionCue {
  text: string;
  startSec: number;
  endSec: number;
}

/** 9:16 조립 렌더 스펙(로컬 ffmpeg). */
export interface ShoppingShortsAssembleSpec {
  /** 비트 순서대로의 생성 클립 경로들(자체 생성물만) */
  clips: string[];
  /** TTS 내레이션 오디오(없으면 무내레이션) */
  narrationAudio?: string;
  /** BGM(내레이션 더킹 믹스) */
  music?: string;
  /** 번인 자막 타임라인 */
  captions: CaptionCue[];
  /** 출력 해상도(기본 1080×1920) */
  width: number;
  height: number;
  /**
   * 영상 내 대가성 고지 오버레이("쿠팡 파트너스 수수료" 표기).
   * 제휴 링크가 있는 잡은 true 여야 조립 허용.
   */
  disclosureOverlay: boolean;
}

/** 파이프라인 상태 — 사람 게이트: script-approved(기획 승인)·review(발행 검수). */
export type ShoppingShortsStatus =
  | 'draft'            // 대본 초안(스킬 생성)
  | 'script-approved'  // 사람 승인(게이트 1) → 클립 생성 가능
  | 'generated'        // 클립 생성 완료
  | 'assembled'        // 9:16 조립 완료
  | 'review'           // 발행 검수 대기(게이트 2)
  | 'published'        // 발행 완료
  | 'rejected';        // 반려(사유는 노트로)

/** 쇼핑쇼츠 잡(대시보드 큐의 단위). */
export interface ShoppingShortsJob {
  brief: ShoppingShortsBrief;
  script: ShortsScript;
  status: ShoppingShortsStatus;
  /** 반려/검수 노트 */
  note?: string;
  /** 생성 클립 경로들 */
  clipPaths?: string[];
  /** 조립 산출물(9:16 mp4) */
  outputVideo?: string;
  /** shorts-publish 업로드 결과 참조(requestId 등) */
  publishRef?: string;
  /** ISO 8601 */
  updatedAt: string;
}
