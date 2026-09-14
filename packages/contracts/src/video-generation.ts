/** 광고 엔진을 사용하는 공통 영상 생성 계약. 실제 MCP 호출은 승인된 계획을 소비한다. */
import type { AdBeat, AdConcept, AdVideoAspectRatio, AdVideoModel, AdVideoResolution, AdVideoTier } from './ad-video-job.js';

export type VideoGenerationTarget = 'ad' | 'shorts';

export interface VideoGenerationRequest {
  concept: AdConcept;
  target: VideoGenerationTarget;
  /** 양쪽 모두 standard 기본값. 시안으로 낮추려면 draft를 명시한다. */
  tier?: AdVideoTier;
  /** 기본: 광고는 스팟 전체, 쇼츠는 비트별 클립. */
  splitByBeat?: boolean;
  extraStyle?: string;
}

export interface VideoGenerationClip {
  index: number;
  beatIndices: number[];
  prompt: string;
  durationSec: number;
  model: AdVideoModel;
  resolution: AdVideoResolution;
  aspectRatio: AdVideoAspectRatio;
  generateAudio: false;
  /** 과거 실측 참고값. 실제 호출 전 get_cost 확인을 대체하지 않는다. */
  referenceCredits: number | null;
}

export interface VideoGenerationPlan {
  engine: 'ad-cinematic-v1';
  target: VideoGenerationTarget;
  subject: string;
  tier: AdVideoTier;
  splitByBeat: boolean;
  clips: VideoGenerationClip[];
  referenceCredits: number | null;
  costPreflightRequired: true;
  warnings: string[];
}

/** 쇼츠 대본의 장면/길이는 script 한 곳에서 읽고, 광고 수준의 기획 근거만 추가한다. */
export interface VideoCreativeDirection {
  evidence: string[];
  uniqueness: AdConcept['uniqueness'];
  narrativeComplete: boolean;
  emphasis?: Record<string, NonNullable<AdBeat['emphasis']>>;
  extraStyle?: string;
}

export interface PreparedShortsVideo {
  /** 브리프·대본·연출·티어가 변경되면 계획을 다시 만들게 하는 입력 지문. */
  sourceFingerprint: string;
  plan: VideoGenerationPlan;
}
