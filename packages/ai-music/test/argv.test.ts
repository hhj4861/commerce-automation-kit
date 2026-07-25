/**
 * argv 음수 플래그 정규화 테스트 — `--lufs -14` 가 parseArgs 에서 크래시하지 않도록.
 */
import { describe, it, expect } from 'vitest';
import { normalizeNegativeFlags } from '../src/core/argv.js';

const FLAGS = ['lufs', 'fade-in', 'fade-out', 'music-vol'];

describe('normalizeNegativeFlags', () => {
  it('음수 값을 --flag=값 으로 합친다', () => {
    expect(normalizeNegativeFlags(['--lufs', '-14'], FLAGS)).toEqual(['--lufs=-14']);
    expect(normalizeNegativeFlags(['--fade-out', '-2.5'], FLAGS)).toEqual(['--fade-out=-2.5']);
    expect(normalizeNegativeFlags(['--music-vol', '-0.5'], FLAGS)).toEqual(['--music-vol=-0.5']);
  });

  it('전체 mix 라인에서 음수 플래그만 합치고 나머진 유지', () => {
    const inp = ['--video', 'ad.mp4', '--music', 'm.mp3', '--out', 'o.mp4', '--lufs', '-16', '--no-duck'];
    expect(normalizeNegativeFlags(inp, FLAGS)).toEqual([
      '--video', 'ad.mp4', '--music', 'm.mp3', '--out', 'o.mp4', '--lufs=-16', '--no-duck',
    ]);
  });

  it('양수/비대상 플래그는 건드리지 않음', () => {
    expect(normalizeNegativeFlags(['--lufs', '14'], FLAGS)).toEqual(['--lufs', '14']);
    expect(normalizeNegativeFlags(['--video', 'ad.mp4'], FLAGS)).toEqual(['--video', 'ad.mp4']);
    expect(normalizeNegativeFlags(['--music', '-x.mp3'], FLAGS)).toEqual(['--music', '-x.mp3']); // 대상 아님
  });
});
