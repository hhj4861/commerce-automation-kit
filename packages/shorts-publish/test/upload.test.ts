/**
 * upload-post 필드 빌더 테스트 — 순수 함수. 필드명·AI표기·플랫폼별 옵션 고정.
 */
import { describe, it, expect } from 'vitest';
import type { PublishTarget } from '@cak/contracts';
import { buildUploadTextFields, describeUpload, UPLOAD_ENDPOINT } from '../src/core/upload.js';

function values(fields: { name: string; value: string }[], name: string): string[] {
  return fields.filter((f) => f.name === name).map((f) => f.value);
}

const full: PublishTarget = {
  platforms: ['youtube', 'instagram', 'tiktok'],
  title: 'T',
  description: 'D',
  tags: ['a', 'b'],
  aiDisclosed: true,
  youtubePrivacy: 'private',
};

describe('buildUploadTextFields', () => {
  it('공통 필드: title/user/platform[] 반복', () => {
    const f = buildUploadTextFields(full, 'myuser');
    expect(values(f, 'title')).toEqual(['T']);
    expect(values(f, 'user')).toEqual(['myuser']);
    expect(values(f, 'platform[]')).toEqual(['youtube', 'instagram', 'tiktok']);
  });

  it('유튜브: description/tags/privacyStatus + AI 표기', () => {
    const f = buildUploadTextFields(full, 'u');
    expect(values(f, 'youtube_description')).toEqual(['D']);
    expect(values(f, 'tags')).toEqual(['a', 'b']);
    expect(values(f, 'privacyStatus')).toEqual(['private']);
    expect(values(f, 'containsSyntheticMedia')).toEqual(['true']);
    expect(values(f, 'selfDeclaredMadeForKids')).toEqual(['false']);
  });

  it('틱톡 is_aigc / 인스타 REELS·share_to_feed', () => {
    const f = buildUploadTextFields(full, 'u');
    expect(values(f, 'is_aigc')).toEqual(['true']);
    expect(values(f, 'media_type')).toEqual(['REELS']);
    expect(values(f, 'share_to_feed')).toEqual(['true']);
  });

  it('인스타: description 있으면 instagram_title=제목+설명(캡션 전문 — 링크·고지 탈락 방지)', () => {
    const f = buildUploadTextFields(full, 'u');
    expect(values(f, 'instagram_title')).toEqual(['T\n\nD']);
  });

  it('인스타: description 없으면 instagram_title 생략(title 폴백)', () => {
    const f = buildUploadTextFields({ platforms: ['instagram'], title: 'T', aiDisclosed: true }, 'u');
    expect(values(f, 'instagram_title')).toEqual([]);
  });

  it('aiDisclosed=false 면 AI 표기 false 로 전송(은폐 아님, 명시적 false)', () => {
    const f = buildUploadTextFields({ ...full, aiDisclosed: false }, 'u');
    expect(values(f, 'containsSyntheticMedia')).toEqual(['false']);
    expect(values(f, 'is_aigc')).toEqual(['false']);
  });

  it('유튜브 단독: 틱톡/인스타 필드 없음', () => {
    const f = buildUploadTextFields({ platforms: ['youtube'], title: 'T', aiDisclosed: true }, 'u');
    expect(values(f, 'is_aigc')).toEqual([]);
    expect(values(f, 'media_type')).toEqual([]);
    expect(values(f, 'containsSyntheticMedia')).toEqual(['true']);
  });

  it('description 없으면 youtube_description 필드 없음', () => {
    const f = buildUploadTextFields({ platforms: ['youtube'], title: 'T', aiDisclosed: true }, 'u');
    expect(values(f, 'youtube_description')).toEqual([]);
  });

  it('tiktokPrivacy 지정 시 privacy_level 전송', () => {
    const f = buildUploadTextFields({ platforms: ['tiktok'], title: 'T', aiDisclosed: true, tiktokPrivacy: 'SELF_ONLY' }, 'u');
    expect(values(f, 'privacy_level')).toEqual(['SELF_ONLY']);
  });

  it('youtubePrivacy 미지정 시 기본 private', () => {
    const f = buildUploadTextFields({ platforms: ['youtube'], title: 'T', aiDisclosed: true }, 'u');
    expect(values(f, 'privacyStatus')).toEqual(['private']);
  });
});

describe('describeUpload', () => {
  it('dry-run 설명: 엔드포인트/마스킹된 auth/video @경로', () => {
    const d = describeUpload(full, 'u', '/x/short.mp4');
    expect(d.endpoint).toBe(`POST ${UPLOAD_ENDPOINT}`);
    expect(d.auth).toContain('****');
    expect(d.fields[0]).toEqual({ name: 'video', value: '@/x/short.mp4' });
    expect(values(d.fields, 'platform[]')).toEqual(['youtube', 'instagram', 'tiktok']);
  });

  it('thumbnail 주면 thumbnail+cover_image 둘 다(어댑터 전송과 일치)', () => {
    const d = describeUpload(full, 'u', '/x/short.mp4', '/x/thumb.jpg');
    expect(values(d.fields, 'thumbnail')).toEqual(['@/x/thumb.jpg']);
    expect(values(d.fields, 'cover_image')).toEqual(['@/x/thumb.jpg']);
  });
});
