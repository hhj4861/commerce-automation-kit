/**
 * youtube-upload (원자 #11) ↔ 소비자 계약.
 *
 * 롱폼 영상을 YouTube Data API v3(videos.insert)로 업로드하고 커스텀 썸네일을 세팅한다.
 * OAuth 리프레시 토큰으로 1회 인증 후 무인. 공식 API만 사용(스크래핑·우회 아님).
 */
import type { YoutubePrivacy } from './shorts-job.js';

export interface YoutubeUploadJob {
  /** 업로드할 로컬 영상 경로 */
  video: string;
  title: string;
  /** 설명(챕터는 chapters 로 별도 전달하면 자동 삽입) */
  description: string;
  tags?: string[];
  /** YouTube 카테고리 ID (예: '10' Music, '24' Entertainment) */
  categoryId?: string;
  privacyStatus: YoutubePrivacy;
  /** 커스텀 썸네일 경로(선택, 1280x720) */
  thumbnail?: string;
  /** 유튜브 챕터 텍스트("0:00 …") — 설명란에 삽입되어 챕터로 인식됨 */
  chapters?: string;
  /** 아동용 여부(기본 false) */
  madeForKids?: boolean;
}

export interface YoutubeUploadResult {
  ok: boolean;
  videoId?: string;
  url?: string;
  /** 썸네일 세팅 성공 여부(업로드 성공 후 별도 호출) */
  thumbnailSet?: boolean;
  /** 실패 원인(투명화). 성공 시 생략. */
  failures?: string[];
}
