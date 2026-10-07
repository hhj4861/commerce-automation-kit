import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegAvailable, joinSimilarity, runFfmpeg } from '../src/adapters/ffmpeg.js';
import { JOIN_MIN_SSIM, judgeJoin } from '../src/core/join.js';

describe('cut join check', () => {
  it('flags a join below the similarity floor', () => {
    // 2026-10-07 실측: 시작 프레임으로 이어 붙인 경계 0.53, 따로 생성한 경계 0.21~0.36
    expect(JOIN_MIN_SSIM).toBe(0.45);
    expect(judgeJoin('c2', 'c3', 0.36)).toMatchObject({ severity: 'block', cutId: 'c3' });
    expect(judgeJoin('c1', 'c2', 0.53)).toBeNull();
  });
});

describe.skipIf(!ffmpegAvailable())('cut join similarity with real ffmpeg', () => {
  it('is high when the next clip starts on the previous last frame and low otherwise', () => {
    const dir = mkdtempSync(join(tmpdir(), 'join-'));
    // 구도가 완전히 다른 장면 = 잡음 화면
    const clip = (name: string, src: string) => {
      const f = join(dir, name);
      runFfmpeg(['-y', '-f', 'lavfi', '-i', src, '-t', '1', '-pix_fmt', 'yuv420p', f]);
      return f;
    };
    const a = clip('a.mp4', 'smptebars=s=320x180');
    const same = clip('b.mp4', 'smptebars=s=320x180');
    const other = clip('c.mp4', 'nullsrc=s=320x180,geq=lum=random(1)*255:cb=128:cr=128');
    expect(joinSimilarity(a, same)).toBeGreaterThan(0.9);
    expect(joinSimilarity(a, other)).toBeLessThan(JOIN_MIN_SSIM);
  });
});
