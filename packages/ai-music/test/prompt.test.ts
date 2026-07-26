/**
 * 브리프→프롬프트 변환 테스트 — 순수 함수. 백엔드별 포맷·instrumental·태그 dedupe 고정.
 */
import { describe, it, expect } from 'vitest';
import type { MusicBrief } from '@cak/contracts';
import { buildStyleTags, briefToPrompt } from '../src/core/prompt.js';

const brief: MusicBrief = {
  energy: 'high',
  tempo: 'slow',
  moods: ['heroic', 'tender'],
  genres: ['orchestral'],
  instrumental: true,
  durationSec: 30,
  arc: 'slow build to a triumphant swell',
};

describe('buildStyleTags', () => {
  it('장르→무드→에너지→템포 순, 중복 제거', () => {
    expect(buildStyleTags(brief)).toEqual(['orchestral', 'heroic', 'tender', 'powerful', 'slow']);
  });
  it('중복 태그 dedupe', () => {
    expect(buildStyleTags({ ...brief, genres: ['orchestral'], moods: ['orchestral', 'heroic'] })).toEqual([
      'orchestral', 'heroic', 'powerful', 'slow',
    ]);
  });
});

describe('briefToPrompt — suno-manual', () => {
  it('style 에 instrumental, manualSteps 포함, backend 표기', () => {
    const p = briefToPrompt(brief, 'suno-manual');
    expect(p.backend).toBe('suno-manual');
    expect(p.style).toBe('orchestral, heroic, tender, powerful, slow, instrumental');
    expect(p.prompt).toBe('slow build to a triumphant swell'); // arc 사용
    expect(p.manualSteps?.length).toBeGreaterThan(0);
    expect(p.lengthSec).toBe(30);
    expect(p.instrumental).toBe(true);
  });
  it('instrumental=false 면 style 에 instrumental 미포함', () => {
    const p = briefToPrompt({ ...brief, instrumental: false }, 'suno-manual');
    expect(p.style).toBe('orchestral, heroic, tender, powerful, slow');
  });
});

describe('briefToPrompt — suno-auto', () => {
  it('suno-manual 과 동일 Suno 포맷, backend=suno-auto', () => {
    const p = briefToPrompt(brief, 'suno-auto');
    expect(p.backend).toBe('suno-auto');
    expect(p.style).toContain('instrumental');
  });
});

describe('briefToPrompt — elevenlabs', () => {
  it('자연어 프롬프트 + BPM + instrumental 문구, manualSteps 없음', () => {
    const p = briefToPrompt(brief, 'elevenlabs');
    expect(p.backend).toBe('elevenlabs');
    expect(p.prompt).toContain('around 70 BPM'); // slow
    expect(p.prompt).toContain('instrumental, no vocals');
    expect(p.prompt).toContain('slow build to a triumphant swell');
    expect(p.manualSteps).toBeUndefined();
  });
  it('instrumental=false 면 no vocals 문구 없음', () => {
    const p = briefToPrompt({ ...brief, instrumental: false }, 'elevenlabs');
    expect(p.prompt).not.toContain('no vocals');
  });
  it('up 템포는 120 BPM', () => {
    const p = briefToPrompt({ ...brief, tempo: 'up' }, 'elevenlabs');
    expect(p.prompt).toContain('around 120 BPM');
  });
  it('bpm 지정 시 tempo 기본값 대신 명시 BPM 사용', () => {
    const p = briefToPrompt({ ...brief, bpm: 135 }, 'elevenlabs'); // brief.tempo=slow(기본 70)
    expect(p.prompt).toContain('135 BPM');
    expect(p.prompt).not.toContain('around 70 BPM');
  });
});

describe('briefToPrompt — bpm (suno)', () => {
  it('bpm 지정 시 suno style 에 포함', () => {
    const p = briefToPrompt({ ...brief, bpm: 140 }, 'suno-manual');
    expect(p.style).toContain('140 BPM');
  });
});
