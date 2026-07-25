/**
 * 음악 믹스 인자 빌더 테스트 — 순수 함수. 더킹·LUFS·페이드·길이맞춤 토큰 고정.
 */
import { describe, it, expect } from 'vitest';
import {
  fmt,
  buildMusicChain,
  buildMusicFilterComplex,
  buildMusicMixArgs,
} from '../src/core/mixargs.js';

describe('fmt', () => {
  it('3자리 반올림', () => {
    expect(fmt(28.0000001)).toBe('28');
    expect(fmt(0.8)).toBe('0.8');
  });
});

describe('buildMusicChain', () => {
  it('loop→trim→fade in/out→volume (dur=30, fadeOut=2 → foStart=28)', () => {
    const c = buildMusicChain({ durationSec: 30, hasVideoAudio: true });
    expect(c).toBe(
      '[1:a]aloop=loop=-1:size=2147483647,atrim=0:30,afade=t=in:st=0:d=0.8,afade=t=out:st=28:d=2,volume=0.28',
    );
  });
  it('짧은 영상은 fadeOut 시작 0 으로 클램프', () => {
    const c = buildMusicChain({ durationSec: 1, hasVideoAudio: false, fadeOutSec: 2 });
    expect(c).toContain('afade=t=out:st=0:d=2');
  });
  it('볼륨 재정의', () => {
    expect(buildMusicChain({ durationSec: 10, hasVideoAudio: false, musicVol: 0.15 })).toContain('volume=0.15');
  });
});

describe('buildMusicFilterComplex', () => {
  it('영상 오디오 없음 → 음악만 loudnorm', () => {
    const f = buildMusicFilterComplex({ durationSec: 30, hasVideoAudio: false });
    expect(f).toBe(
      '[1:a]aloop=loop=-1:size=2147483647,atrim=0:30,afade=t=in:st=0:d=0.8,afade=t=out:st=28:d=2,volume=0.28[m];' +
        '[m]loudnorm=I=-14:TP=-1.5:LRA=11[a]',
    );
  });
  it('오디오 있음 + 더킹 → 사이드체인 후 믹스', () => {
    const f = buildMusicFilterComplex({ durationSec: 30, hasVideoAudio: true, duckUnderVoice: true });
    expect(f).toContain('[0:a]asplit=2[va][sc]');
    expect(f).toContain('sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300');
    expect(f).toContain('[va][mduck]amix=inputs=2:duration=first:dropout_transition=0[mix]');
    expect(f).toContain('loudnorm=I=-14');
  });
  it('오디오 있음 + 더킹 없음 → 단순 믹스(사이드체인 없음)', () => {
    const f = buildMusicFilterComplex({ durationSec: 30, hasVideoAudio: true, duckUnderVoice: false });
    expect(f).toContain('[0:a][mus]amix=inputs=2:duration=first');
    expect(f).not.toContain('sidechaincompress');
  });
  it('LUFS 재정의', () => {
    const f = buildMusicFilterComplex({ durationSec: 10, hasVideoAudio: false, targetLufs: -16 });
    expect(f).toContain('loudnorm=I=-16');
  });
});

describe('buildMusicMixArgs', () => {
  it('영상=입력0/음악=입력1, 영상 무손실 복사 + aac + faststart', () => {
    const args = buildMusicMixArgs('ad.mp4', 'm.mp3', 'out.mp4', { durationSec: 15, hasVideoAudio: true });
    expect(args.slice(0, 5)).toEqual(['-y', '-i', 'ad.mp4', '-i', 'm.mp3']);
    expect(args).toContain('-filter_complex');
    const joined = args.join(' ');
    expect(joined).toContain('-map 0:v -map [a]');
    expect(joined).toContain('-c:v copy -c:a aac -b:a 192k -movflags +faststart out.mp4');
  });
});
