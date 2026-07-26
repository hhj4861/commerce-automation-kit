/**
 * 트랙 목록 → 챕터 테스트 — 순수 함수. 타임스탬프·누적시작·유튜브 포맷 고정.
 */
import { describe, it, expect } from 'vitest';
import type { LongformTrack } from '@cak/contracts';
import { formatTimestamp, totalDuration, buildChapters, formatYouTubeChapters } from '../src/core/tracklist.js';

const tracks: LongformTrack[] = [
  { file: 'a.mp3', title: 'Phonk', durationSec: 240 },
  { file: 'b.mp3', title: 'Trap', durationSec: 240 },
  { file: 'c.mp3', title: 'DnB', durationSec: 240.5 },
];

describe('formatTimestamp', () => {
  it('1시간 미만 M:SS', () => {
    expect(formatTimestamp(0)).toBe('0:00');
    expect(formatTimestamp(65)).toBe('1:05');
    expect(formatTimestamp(600)).toBe('10:00');
  });
  it('1시간 이상 H:MM:SS', () => {
    expect(formatTimestamp(3661)).toBe('1:01:01');
    expect(formatTimestamp(4800)).toBe('1:20:00');
  });
});

describe('totalDuration / buildChapters', () => {
  it('총 길이 합산', () => {
    expect(totalDuration(tracks)).toBe(720.5);
  });
  it('첫 챕터 0초, 누적 시작시간', () => {
    const c = buildChapters(tracks);
    expect(c[0]).toEqual({ startSec: 0, label: 'Phonk' });
    expect(c[1]).toEqual({ startSec: 240, label: 'Trap' });
    expect(c[2]).toEqual({ startSec: 480, label: 'DnB' });
  });
});

describe('formatYouTubeChapters', () => {
  it('유튜브 설명란 챕터 텍스트(첫 줄 0:00)', () => {
    const txt = formatYouTubeChapters(buildChapters(tracks));
    expect(txt).toBe('0:00 Phonk\n4:00 Trap\n8:00 DnB');
  });
});
