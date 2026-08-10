/**
 * ============================================================================
 *  광고영상 계약 (Ad Video Contract) — @cak/ad-video-gen ↔ 소비자
 * ============================================================================
 *
 *  힉스필드(MCP) 기반 광고영상 제작 파이프라인의 원자 입출력 단위.
 *  실제 생성 호출(MCP)은 오케스트레이터(Claude 스킬)가 수행하고,
 *  이 계약은 "무엇을 만들지(컨셉/잡)"와 "게이트 통과 여부"만 기술한다.
 *
 *  ▸ append-only. 필드 삭제/의미 변경은 breaking change.
 *  ▸ 사람 게이트: humanApproved=false 인 컨셉으로는 생성을 트리거하지 않는다
 *    (CLAUDE.md 금지선 — 무검수 광고 자동발행 금지).
 *  ▸ 스코어/지표(@cak/keyword-intel 등)를 이 잡의 자동 트리거로 쓰지 않는다.
 */

/** 사용 가능한 영상 모델 (힉스필드 입점 기준, 2026-07 실측 단가 존재 모델만) */
export type AdVideoModel =
  | 'seedance_2_0'          // 범용 (std)
  | 'seedance_2_0_fast'     // 시안용 저가
  | 'kling3_0'              // 시안·양산 저가
  | 'veo3_1'                // TV 송출급 최종 (4K+오디오, 최고가)
  | 'marketing_studio_video'; // 제품 URL 기반 광고 (아바타 자동삽입 주의)

/** 제작 티어 — 비용 정책의 축. draft(시안) → standard(확정본) → broadcast(TV 송출급) */
export type AdVideoTier = 'draft' | 'standard' | 'broadcast';

export type AdVideoResolution = '480p' | '720p' | '1080p' | '4k';

/** 15초 스팟의 장면 비트 (4~5개 권장) */
export interface AdBeat {
  /** 0부터 시작하는 순서 */
  index: number;
  /** 이 비트의 길이(초) — beats 합 = 목표 길이 */
  durationSec: number;
  /** 장면 묘사 (소구점이 '보이는' 장면이어야 함) */
  description: string;
  /**
   * 포커스 연출 극대화 태그(선택) — 광고적 비주얼 과장을 프롬프트에 자동 주입.
   * problem=문제를 극한으로, resolution=해소 대비를 극한으로, hero=제품 미화.
   * 주의: 과장은 "연출(비주얼)"에만 허용 — 문구·수치·기능의 사실 주장은 과장 금지(표시광고법).
   */
  emphasis?: 'problem' | 'resolution' | 'hero';
}

/**
 * 광고 컨셉 — 생성 전 반드시 통과해야 하는 3중 게이트의 기록.
 * 게이트: (1) 리서치 기반 소구점 (2) 고유성 테스트 (3) 서사 완결성 + 사람 승인.
 */
export interface AdConcept {
  /** 광고 대상 (제품/브랜드/소재) */
  subject: string;
  /** 카테고리 힌트 (음료/화장품/펫 등) — 선택 */
  category?: string;
  /** 리서치로 도출한 소구점 1~2개 (고정 표에서 고르지 않는다) */
  sellingPoints: string[];
  /** 소구점의 근거 (리서치 출처·일화·차별 스펙) — 빈 배열이면 게이트 실패 */
  evidence: string[];
  /**
   * 고유성 테스트 — "경쟁·유사 대상을 넣어도 광고가 성립하면 실패한 컨셉".
   * passed=false 컨셉은 생성 금지.
   */
  uniqueness: {
    passed: boolean;
    /** 무엇이 이 대상에게만 성립하는지 한 문장 */
    rationale: string;
  };
  /** 장면 비트 — 결과로 점프하지 않는 완결 서사여야 함 */
  beats: AdBeat[];
  /** 서사 완결성(인과 구멍 없음) 자체 점검 통과 여부 */
  narrativeComplete: boolean;
  /** 사람 게이트 — 사용자가 컨셉을 승인했는가. false면 생성 트리거 금지 */
  humanApproved: boolean;
}

/** 생성 1건의 명세 (MCP 호출 직전 상태의 스냅샷) */
export interface AdVideoJob {
  /** 대상 컨셉의 subject (역참조용) */
  subject: string;
  model: AdVideoModel;
  tier: AdVideoTier;
  resolution: AdVideoResolution;
  durationSec: number;
  /** 스타일 가이드가 포함된 최종 프롬프트 */
  prompt: string;
  /** 사전 견적 크레딧 (실측 단가표 기반) */
  estCredits: number;
  /** ISO8601 UTC */
  createdAt: string;
}
