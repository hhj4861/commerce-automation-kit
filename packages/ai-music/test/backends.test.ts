/**
 * 백엔드 레지스트리·우선순위 해석 테스트 — 순수 함수.
 * 핵심: reserved(suno-auto)는 절대 자동 선택되지 않고, api 는 키 있어야 선택된다.
 */
import { describe, it, expect } from 'vitest';
import { BACKENDS, DEFAULT_PRIORITY, resolveBackend } from '../src/core/backends.js';

const noKey = () => false;
const hasKey = (env: string) => env === 'ELEVENLABS_API_KEY';

describe('레지스트리', () => {
  it('suno-auto 는 reserved + 라이선스 unsafe(자동 금지 슬롯)', () => {
    expect(BACKENDS['suno-auto'].mode).toBe('reserved');
    expect(BACKENDS['suno-auto'].licenseSafe).toBe(false);
  });
  it('elevenlabs=api(광고 clear), suno-manual=manual(사람 게이트)', () => {
    expect(BACKENDS.elevenlabs.mode).toBe('api');
    expect(BACKENDS.elevenlabs.licenseSafe).toBe(true);
    expect(BACKENDS['suno-manual'].mode).toBe('manual');
    expect(BACKENDS['suno-manual'].licenseSafe).toBe(true);
  });
  it('기본 우선순위 = elevenlabs → suno-manual', () => {
    expect(DEFAULT_PRIORITY).toEqual(['elevenlabs', 'suno-manual']);
  });
});

describe('resolveBackend', () => {
  it('키 없으면 elevenlabs 건너뛰고 suno-manual 선택', () => {
    const r = resolveBackend(['elevenlabs', 'suno-manual'], noKey);
    expect(r.chosen?.id).toBe('suno-manual');
    expect(r.skipped.map((s) => s.id)).toEqual(['elevenlabs']);
  });
  it('키 있으면 elevenlabs 선택', () => {
    const r = resolveBackend(['elevenlabs', 'suno-manual'], hasKey);
    expect(r.chosen?.id).toBe('elevenlabs');
  });
  it('suno-auto 는 항상 건너뜀(reserved) — 뒤 suno-manual 선택', () => {
    const r = resolveBackend(['suno-auto', 'suno-manual'], noKey);
    expect(r.chosen?.id).toBe('suno-manual');
    expect(r.skipped[0]?.id).toBe('suno-auto');
  });
  it('사용 가능 백엔드 없으면 chosen 없음 + 사유 투명화', () => {
    const r = resolveBackend(['suno-auto'], noKey);
    expect(r.chosen).toBeUndefined();
    expect(r.skipped[0]?.id).toBe('suno-auto');
  });
});
