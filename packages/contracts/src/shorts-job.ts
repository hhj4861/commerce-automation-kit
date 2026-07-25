/**
 * shorts-publish (원자 #7) ↔ 소비자 계약.
 *
 * 완성 광고영상(가로 16:9 등)을 쇼츠/릴스(세로 9:16)로 재구성하고
 * YouTube/Instagram/TikTok 에 통합 업로드하는 원자의 입출력 타입.
 *
 * 설계 판단: 광고는 이미 시네마틱 + 자체 브랜딩/엔딩을 갖는다. 콘텐츠형 헤비
 * 템플릿(자막바·훅텍스트)은 프리미엄감을 죽이므로 기본은 "최소 개입" 모드다.
 */

/** 세로 재구성 방식. blur-brand 가 광고 쇼츠 기본값(블러필 + 절제된 워드마크). */
export type ShortsMode = 'crop' | 'blur' | 'blur-brand' | 'letterbox' | 'heavy';

/** 통합 업로드 대상 플랫폼. */
export type ShortsPlatform = 'youtube' | 'instagram' | 'tiktok';

/** 세로 렌더 스펙. */
export interface ShortsRenderSpec {
  mode: ShortsMode;
  /** 출력 가로(기본 1080) */
  width: number;
  /** 출력 세로(기본 1920) */
  height: number;
  /** 하단 워드마크(blur-brand/letterbox). 없으면 텍스트 없이 렌더. */
  brand?: string;
  /** 워드마크 2줄째(선택). 있으면 태그라인까지, 없으면 단일 워드마크(더 프리미엄). */
  tagline?: string;
}

/** YouTube 공개범위. TikTok 은 앱 검수 전 SELF_ONLY 강제될 수 있어 문자열로 둔다. */
export type YoutubePrivacy = 'private' | 'unlisted' | 'public';

/** 업로드 대상/메타. */
export interface PublishTarget {
  platforms: ShortsPlatform[];
  /** 공통 제목/캡션 */
  title: string;
  description?: string;
  tags?: string[];
  /**
   * AI 생성 정직 표기 — 유튜브 containsSyntheticMedia / 틱톡 is_aigc 로 전송.
   * 프로젝트 원칙(AI 출처·C2PA 은폐 금지)에 따라 소비자는 true 로 둔다.
   */
  aiDisclosed: boolean;
  /** 기본 private (POC 안전) */
  youtubePrivacy?: YoutubePrivacy;
  /** 틱톡 privacy_level (지정 시에만 전송) */
  tiktokPrivacy?: string;
}

/** 원자 입력: 소스영상 + 렌더 스펙 + (선택)업로드 대상. */
export interface ShortsJob {
  /** 완성 광고영상 경로(로컬 mp4) */
  sourceVideo: string;
  render: ShortsRenderSpec;
  /** 생략 시 렌더까지만. */
  publish?: PublishTarget;
}

/**
 * 업로드 결과. 실패는 silent drop 하지 않고 failures 로 투명화한다.
 * upload-post 는 비동기 처리라 requestId 로 상태 폴링한다.
 */
export interface PublishResult {
  ok: boolean;
  /** HTTP 상태코드 */
  status: number;
  /** upload-post request_id (비동기 상태 폴링용) */
  requestId?: string;
  /** 원응답(진단용) */
  body?: unknown;
  /** 실패 원인 목록(투명화). 성공 시 생략. */
  failures?: string[];
}
