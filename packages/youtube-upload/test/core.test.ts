/**
 * 순수 core 테스트 — 설명 조립 + videos.insert 바디.
 */
import { describe, it, expect } from 'vitest';
import type { YoutubeUploadJob } from '@cak/contracts';
import { buildDescription } from '../src/core/description.js';
import { buildVideoRequestBody } from '../src/core/video-resource.js';

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
