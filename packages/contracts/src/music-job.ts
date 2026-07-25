/**
 * ai-music (원자 #8) ↔ 소비자 계약.
 *
 * 광고 컨셉에서 음악 브리프를 만들고, 백엔드별 생성 프롬프트로 변환하고,
 * 생성된(또는 사용자가 라이선스한) 트랙을 광고영상에 믹스하는 원자의 타입.
 *
 * 라이선스 판단: Suno 는 공식 API 가 없어(2026-07) 자동화는 비공식 래퍼뿐 →
 * ToS·프로젝트 금지선 위반이므로 'suno-manual'(사람이 Suno UI 에서 생성) 만 지원.
 * 완전 무인은 공식 API + 라이선스 학습(광고 clear)인 'elevenlabs' 로.
 */

export type MusicEnergy = 'low' | 'medium' | 'high';
export type MusicTempo = 'slow' | 'mid' | 'up';

/**
 * 생성 백엔드.
 * - suno-manual: 사람이 Suno UI 에서 생성(프롬프트만 산출) — Suno 최고품질을 합법적으로 쓰는 길
 * - suno-auto: 공식 Suno API 전용 슬롯. 공식 API 부재(2026-07) + 비공식 래퍼는 ToS·금지선 위반이라 미지원(예약)
 * - elevenlabs: 공식 API 무인(라이선스 학습, 광고 clear)
 */
export type MusicBackendId = 'suno-manual' | 'suno-auto' | 'elevenlabs';

/** 광고 특색을 음악 스펙으로 옮긴 브리프(리서치된 컨셉에서 사람/스킬이 채운다). */
export interface MusicBrief {
  energy: MusicEnergy;
  tempo: MusicTempo;
  /** 무드 태그 예: ['heroic','tender','cinematic'] */
  moods: string[];
  /** 장르 태그 예: ['orchestral','ambient'] */
  genres: string[];
  /** 광고 배경은 대개 true(보컬 없이 VO/장면 아래) */
  instrumental: boolean;
  /** 광고 길이에 맞춘 트랙 길이(초) */
  durationSec: number;
  /** 구조 힌트 예: 'slow build to a triumphant swell' */
  arc?: string;
}

/** 브리프를 백엔드별 프롬프트로 변환한 결과. */
export interface MusicPromptPlan {
  backend: MusicBackendId;
  /** 붙여넣거나 API 로 보낼 프롬프트 본문 */
  prompt: string;
  /** 스타일/장르 태그(콤마 구분) */
  style: string;
  instrumental: boolean;
  lengthSec: number;
  /** suno-manual 이면 사용자에게 보여줄 수동 단계 안내 */
  manualSteps?: string[];
}

/** 음악을 광고에 입힐 때의 믹스 스펙. */
export interface MusicMixSpec {
  /** 음악 기본 볼륨(0..1) */
  musicVol: number;
  /** VO/대사 아래로 더킹(사이드체인) */
  duckUnderVoice: boolean;
  /** 최종 러프니스 타깃(LUFS) — 플랫폼 표준 -14 */
  targetLufs: number;
  fadeInSec: number;
  fadeOutSec: number;
}

/** 생성/라이선스된 트랙(믹스 입력). */
export interface MusicTrack {
  /** 로컬 오디오 파일 경로 */
  file: string;
  backend: MusicBackendId;
  /** 어떤 프롬프트로 만들었는지(추적) */
  prompt?: string;
  durationSec?: number;
}
