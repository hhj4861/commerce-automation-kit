/**
 * upload-post 통합 업로드용 multipart 텍스트 필드 빌더 — I/O 없이 순수 로직.
 * 파일 필드(video/thumbnail)는 adapter 에서 붙인다. 여기서는 텍스트 필드만 결정.
 *
 * 실측 스펙(2026-07): POST https://api.upload-post.com/api/upload,
 *   헤더 Authorization: Apikey <KEY>, 본문 multipart/form-data.
 *   필드: video, title, user, platform[](반복) + 플랫폼별 옵션.
 * 문서: https://docs.upload-post.com/api/upload-video/
 *
 * AI 표기: 유튜브 containsSyntheticMedia / 틱톡 is_aigc — aiDisclosed 를 그대로 전송한다
 * (프로젝트 원칙: AI 출처·C2PA 은폐 금지).
 */
import type { PublishTarget } from '@cak/contracts';

/** multipart 텍스트 필드 하나. platform[] 처럼 같은 name 이 반복될 수 있어 배열로 표현. */
export interface UploadField {
  name: string;
  value: string;
}

/**
 * PublishTarget → multipart 텍스트 필드 배열(순서 보존).
 * @param user upload-post 대시보드의 프로필(user) 이름
 */
export function buildUploadTextFields(target: PublishTarget, user: string): UploadField[] {
  const fields: UploadField[] = [];
  fields.push({ name: 'title', value: target.title });
  fields.push({ name: 'user', value: user });
  for (const p of target.platforms) fields.push({ name: 'platform[]', value: p });

  if (target.platforms.includes('youtube')) {
    if (target.description !== undefined && target.description.length > 0) {
      fields.push({ name: 'youtube_description', value: target.description });
    }
    for (const t of target.tags ?? []) fields.push({ name: 'tags', value: t });
    fields.push({ name: 'privacyStatus', value: target.youtubePrivacy ?? 'private' });
    fields.push({ name: 'containsSyntheticMedia', value: target.aiDisclosed ? 'true' : 'false' });
    fields.push({ name: 'selfDeclaredMadeForKids', value: 'false' });
  }
  if (target.platforms.includes('tiktok')) {
    if (target.tiktokPrivacy !== undefined && target.tiktokPrivacy.length > 0) {
      fields.push({ name: 'privacy_level', value: target.tiktokPrivacy });
    }
    fields.push({ name: 'is_aigc', value: target.aiDisclosed ? 'true' : 'false' });
  }
  if (target.platforms.includes('instagram')) {
    // 인스타는 global description 을 무시하고 instagram_title(→ title 폴백)이 캡션 전문이 된다
    // (실측 2026-07-28, docs.upload-post.com). description(제휴 링크·대가성 고지 포함)이
    // 캡션에서 탈락하지 않도록 title+description 을 합쳐 전송한다.
    if (target.description !== undefined && target.description.length > 0) {
      fields.push({ name: 'instagram_title', value: `${target.title}\n\n${target.description}` });
    }
    fields.push({ name: 'media_type', value: 'REELS' });
    fields.push({ name: 'share_to_feed', value: 'true' });
  }
  return fields;
}

export interface UploadDescription {
  endpoint: string;
  auth: string;
  /** 실제 전송될 텍스트 필드 + video/thumbnail 파일 표시 */
  fields: UploadField[];
}

export const UPLOAD_ENDPOINT = 'https://api.upload-post.com/api/upload';
export const UPLOAD_STATUS_ENDPOINT = 'https://api.upload-post.com/api/uploadposts/status';

/** 계정 연결 전 검증용 dry-run 설명(실제 호출 없이 무엇이 전송될지). */
export function describeUpload(
  target: PublishTarget,
  user: string,
  video: string,
  thumbnail?: string,
): UploadDescription {
  const fields: UploadField[] = [{ name: 'video', value: `@${video}` }];
  // adapter 는 커버를 thumbnail(유튜브) + cover_image(인스타) 두 파트로 보낸다 → dry-run 도 동일하게.
  if (thumbnail !== undefined) {
    fields.push({ name: 'thumbnail', value: `@${thumbnail}` });
    fields.push({ name: 'cover_image', value: `@${thumbnail}` });
  }
  fields.push(...buildUploadTextFields(target, user));
  return { endpoint: `POST ${UPLOAD_ENDPOINT}`, auth: 'Authorization: Apikey ****', fields };
}
