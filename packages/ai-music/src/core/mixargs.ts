/**
 * 음악을 광고영상에 입히는 ffmpeg 인자 빌더 (순수 로직, spawn 없음).
 *
 * - 음악을 영상 길이에 맞춰 loop→trim, 페이드 인/아웃, 볼륨 조정
 * - VO/대사가 있으면 사이드체인으로 음악을 그 아래로 더킹(음성 우선)
 * - 최종 러프니스를 플랫폼 표준 -14 LUFS 로 정규화
 * 입력 0 = 영상, 입력 1 = 음악.
 */

export const DEFAULT_MUSIC_VOL = 0.28;
export const DEFAULT_TARGET_LUFS = -14;
export const DEFAULT_FADE_IN_SEC = 0.8;
export const DEFAULT_FADE_OUT_SEC = 2.0;

/** 3자리 반올림 문자열화(필터·테스트 결정성). */
export function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

export interface MusicMixOpts {
  /** 영상 길이(초) — 음악을 여기에 맞춰 trim */
  durationSec: number;
  /** 영상에 오디오 스트림이 있는지(없으면 음악만) */
  hasVideoAudio: boolean;
  musicVol?: number;
  /** VO/대사 아래로 더킹(hasVideoAudio 일 때만 의미) */
  duckUnderVoice?: boolean;
  targetLufs?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
}

/** 음악 준비 체인([1:a] → loop/trim/fade/volume), 라벨 없이 반환. */
export function buildMusicChain(o: MusicMixOpts): string {
  const dur = o.durationSec;
  const fi = o.fadeInSec ?? DEFAULT_FADE_IN_SEC;
  const fo = o.fadeOutSec ?? DEFAULT_FADE_OUT_SEC;
  const vol = o.musicVol ?? DEFAULT_MUSIC_VOL;
  const foStart = Math.max(0, dur - fo);
  return (
    `[1:a]aloop=loop=-1:size=2147483647,atrim=0:${fmt(dur)},` +
    `afade=t=in:st=0:d=${fmt(fi)},afade=t=out:st=${fmt(foStart)}:d=${fmt(fo)},volume=${fmt(vol)}`
  );
}

/** 최종 filter_complex 문자열 생성. */
export function buildMusicFilterComplex(o: MusicMixOpts): string {
  const lufs = o.targetLufs ?? DEFAULT_TARGET_LUFS;
  const loudnorm = `loudnorm=I=${fmt(lufs)}:TP=-1.5:LRA=11`;
  const music = buildMusicChain(o);

  if (!o.hasVideoAudio) {
    // 영상에 오디오 없음 → 음악만 정규화
    return `${music}[m];[m]${loudnorm}[a]`;
  }
  const duck = o.duckUnderVoice ?? true;
  if (duck) {
    // 음악을 영상 오디오(VO/대사)로 더킹 후 믹스
    return (
      `${music}[mus];` +
      `[0:a]asplit=2[va][sc];` +
      `[mus][sc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300[mduck];` +
      `[va][mduck]amix=inputs=2:duration=first:dropout_transition=0[mix];` +
      `[mix]${loudnorm}[a]`
    );
  }
  // 더킹 없이 단순 믹스
  return (
    `${music}[mus];` +
    `[0:a][mus]amix=inputs=2:duration=first:dropout_transition=0[mix];` +
    `[mix]${loudnorm}[a]`
  );
}

/** 음악 믹스 완성 인자(영상=입력0, 음악=입력1). 영상 스트림은 무손실 복사. */
export function buildMusicMixArgs(video: string, music: string, out: string, o: MusicMixOpts): string[] {
  return [
    '-y',
    '-i',
    video,
    '-i',
    music,
    '-filter_complex',
    buildMusicFilterComplex(o),
    '-map',
    '0:v',
    '-map',
    '[a]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    out,
  ];
}
