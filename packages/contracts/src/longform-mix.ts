/**
 * longform-mix (원자 #9) ↔ 소비자 계약.
 *
 * 여러 트랙(ai-music 로 생성)을 하나의 롱폼 음악 믹스 영상으로 조립한다:
 * 트랙들을 이어붙이고, 배경 비주얼(이미지/짧은 영상)을 총 길이만큼 루프하고,
 * 유튜브 챕터(타임스탬프) 목록과 썸네일을 만든다. (업로드는 별도 단계)
 */

/** 믹스에 들어갈 트랙 한 개. */
export interface LongformTrack {
  /** 로컬 오디오 경로 */
  file: string;
  /** 챕터에 표시될 제목 */
  title: string;
  /** 길이(초) — 챕터 타임스탬프 계산용 */
  durationSec: number;
}

/** 챕터 마크(유튜브 타임스탬프). 첫 챕터는 반드시 0초. */
export interface ChapterMark {
  startSec: number;
  label: string;
}

/** 배경 비주얼 종류. */
export type VisualKind = 'image' | 'video';

/** 롱폼 조립 스펙. */
export interface LongformSpec {
  tracks: LongformTrack[];
  /** 배경(이미지 또는 짧은 영상 경로) — 총 길이만큼 루프 */
  visual: string;
  visualKind: VisualKind;
  width: number;
  height: number;
}

/** 썸네일 스펙(1280x720 기본). */
export interface ThumbnailSpec {
  /** 배경 이미지 경로(예: 핏한 여성 운동선수 — fit/athletic/confident) */
  image: string;
  title: string;
  subtitle?: string;
  width: number;
  height: number;
}
