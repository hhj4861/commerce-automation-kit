/**
 * 순수 core 테스트 — 설명 조립 + videos.insert 바디.
 */
import { describe, it, expect } from 'vitest';
import type { YoutubeUploadJob } from '@cak/contracts';
import { buildDescription, formatHashtags } from '../src/core/description.js';
import { buildVideoRequestBody } from '../src/core/video-resource.js';
import { validateCommentText } from '../src/core/comment.js';

describe('formatHashtags', () => {
  it('선행 #·공백 제거하고 #a #b 로', () => {
    expect(formatHashtags(['gym', '#workout', 'gym mix'])).toBe('#gym #workout #gymmix');
  });
  it('빈 것 제외', () => {
    expect(formatHashtags(['', '  ', '#'])).toBe('');
  });
});

describe('buildDescription', () => {
  it('챕터 있으면 설명 뒤에 붙인다', () => {
    expect(buildDescription('베이스 설명', '0:00 A\n4:00 B')).toBe('베이스 설명\n\n0:00 A\n4:00 B');
  });
  it('챕터 없으면 설명만', () => {
    expect(buildDescription('베이스', undefined)).toBe('베이스');
    expect(buildDescription('베이스', '  ')).toBe('베이스');
  });
  it('설명 비어있으면 챕터만', () => {
    expect(buildDescription('', '0:00 A')).toBe('0:00 A');
  });
  it('해시태그는 맨 아래(설명+챕터+해시태그)', () => {
    expect(buildDescription('설명', '0:00 A', ['gym', 'workout'])).toBe('설명\n\n0:00 A\n\n#gym #workout');
  });
  it('설명만 + 해시태그', () => {
    expect(buildDescription('설명', undefined, ['phonk'])).toBe('설명\n\n#phonk');
  });
});

const job: YoutubeUploadJob = {
  video: 'mix.mp4',
  title: 'GYM HYPE MIX Vol.1',
  description: '',
  privacyStatus: 'private',
  tags: ['gym', 'workout'],
  categoryId: '10',
  madeForKids: false,
};

describe('buildVideoRequestBody', () => {
  it('snippet + status 조립, madeForKids=selfDeclaredMadeForKids', () => {
    const b = buildVideoRequestBody(job, '설명+챕터');
    expect(b.snippet.title).toBe('GYM HYPE MIX Vol.1');
    expect(b.snippet.description).toBe('설명+챕터');
    expect(b.snippet.tags).toEqual(['gym', 'workout']);
    expect(b.snippet.categoryId).toBe('10');
    expect(b.status.privacyStatus).toBe('private');
    expect(b.status.selfDeclaredMadeForKids).toBe(false);
  });
  it('tags/categoryId 없으면 생략', () => {
    const b = buildVideoRequestBody(
      { video: 'v', title: 't', description: '', privacyStatus: 'public', madeForKids: true },
      'd',
    );
    expect(b.snippet.tags).toBeUndefined();
    expect(b.snippet.categoryId).toBeUndefined();
    expect(b.status.privacyStatus).toBe('public');
    expect(b.status.selfDeclaredMadeForKids).toBe(true);
  });
});

describe('validateCommentText — 제휴 링크 댓글의 대가성 고지 강제', () => {
  const LINK = '제품 보러가기: https://link.coupang.com/a/abc123';
  const DISCLOSURE = '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

  it('링크+고지 → 통과', () => {
    expect(validateCommentText(`${LINK}\n\n${DISCLOSURE}`)).toEqual([]);
  });
  it('링크만(고지 없음) → 거부', () => {
    const p = validateCommentText(LINK);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('고지');
  });
  it('단축 도메인 coupa.ng 도 제휴 링크로 판정', () => {
    expect(validateCommentText('https://coupa.ng/xyz')).toHaveLength(1);
  });
  it('공백 변형으로 고지 우회 불가(정규화 판정) — "파트 너스"+"수수료" 인정', () => {
    expect(validateCommentText(`${LINK} 파트 너스 활동으로 수 수료를 받을 수 있음`)).toEqual([]);
  });
  it('링크 없는 일반 댓글은 고지 불요', () => {
    expect(validateCommentText('영상 잘 봤습니다!')).toEqual([]);
  });
  it('빈 텍스트 거부', () => {
    expect(validateCommentText('  ')).toHaveLength(1);
  });
  it('10,000자 초과 거부', () => {
    expect(validateCommentText('a'.repeat(10_001))).toHaveLength(1);
  });
});
