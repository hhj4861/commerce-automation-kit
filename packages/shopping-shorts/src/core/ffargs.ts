/**
 * 9:16 조립 렌더 — ffmpeg 인자 조립(순수). 실행은 adapters/ffmpeg.ts.
 *
 * 레이어 구조(강의 3편 편집 공정의 로컬 ffmpeg 화):
 *   자막(번인 drawtext) > 영상(클립 concat, 커버 크롭) > 내레이션(TTS) > BGM(더킹)
 * + 제휴 발행물은 상단에 대가성 고지 오버레이 상시 번인(강제 게이트).
 */
import type { CaptionCue, ShoppingShortsAssembleSpec } from '@cak/contracts';
import { DISCLOSURE_OVERLAY_TEXT } from './disclosure.js';

/** macOS 한글 기본 폰트. 다른 OS 는 인자로 재정의. */
export const DEFAULT_FONT_FILE = '/System/Library/Fonts/AppleSDGothicNeo.ttc';

/** drawtext 필터 값 이스케이프(ffmpeg 필터 문법 특수문자). */
export function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/,/g, '\\,');
}

export interface AssembleOpts {
  fontFile?: string;
  /** 자막 크기(기본 62 — 1080 폭 기준) */
  captionFontSize?: number;
  /** BGM 볼륨(내레이션 존재 시 더킹 수준, 기본 0.22) */
  musicVolume?: number;
}

/** 자막 한 줄의 drawtext 필터(릴스/쇼츠 하단 UI 세이프존 위 y=h-560). */
function captionFilter(cue: CaptionCue, fontFile: string, fontSize: number): string {
  return (
    `drawtext=fontfile=${fontFile}:text='${escapeDrawtext(cue.text)}'` +
    `:fontsize=${fontSize}:fontcolor=white:borderw=4:bordercolor=black@0.6` +
    `:x=(w-text_w)/2:y=h-560` +
    `:enable='between(t,${cue.startSec},${cue.endSec})'`
  );
}

/** 상단 고지 오버레이(상시 표시, 작게·반투명 — 가독은 유지). */
function disclosureFilter(fontFile: string): string {
  return (
    `drawtext=fontfile=${fontFile}:text='${escapeDrawtext(DISCLOSURE_OVERLAY_TEXT)}'` +
    `:fontsize=30:fontcolor=white@0.85:borderw=2:bordercolor=black@0.5` +
    `:x=(w-text_w)/2:y=140`
  );
}

/**
 * 조립 ffmpeg 인자.
 * - 클립: 커버 스케일(비율 유지 확대) 후 중앙 크롭 → fps 30 통일 → concat
 * - 오디오: 내레이션 1.0 + BGM(더킹 볼륨) amix / 한쪽만 있으면 단독 / 없으면 무음성
 * - -shortest: 오디오가 길어도 영상 길이에서 끝냄
 */
export function buildAssembleArgs(
  spec: ShoppingShortsAssembleSpec,
  out: string,
  opts: AssembleOpts = {},
): string[] {
  if (spec.clips.length === 0) throw new Error('clips 가 비어 있음 — 조립할 클립이 필요');
  const font = opts.fontFile ?? DEFAULT_FONT_FILE;
  const captionSize = opts.captionFontSize ?? 62;
  const musicVol = opts.musicVolume ?? 0.22;
  const { width, height } = spec;

  const args: string[] = ['-y'];
  for (const clip of spec.clips) args.push('-i', clip);
  const nClips = spec.clips.length;

  const hasNarration = typeof spec.narrationAudio === 'string' && spec.narrationAudio.length > 0;
  const hasMusic = typeof spec.music === 'string' && spec.music.length > 0;
  let narIdx = -1;
  let musIdx = -1;
  if (hasNarration) {
    narIdx = nClips;
    args.push('-i', spec.narrationAudio as string);
  }
  if (hasMusic) {
    musIdx = hasNarration ? nClips + 1 : nClips;
    args.push('-i', spec.music as string);
  }

  const parts: string[] = [];
  for (let i = 0; i < nClips; i++) {
    parts.push(
      `[${i}:v]scale=w=${width}:h=${height}:force_original_aspect_ratio=increase,` +
        `crop=${width}:${height},setsar=1,fps=30,setpts=PTS-STARTPTS[v${i}]`,
    );
  }
  const concatIn = Array.from({ length: nClips }, (_, i) => `[v${i}]`).join('');
  parts.push(`${concatIn}concat=n=${nClips}:v=1:a=0[vc]`);

  // 자막·고지 번인 체인
  const overlays: string[] = [];
  for (const cue of spec.captions) overlays.push(captionFilter(cue, font, captionSize));
  if (spec.disclosureOverlay) overlays.push(disclosureFilter(font));
  const videoLabel = overlays.length > 0 ? '[vo]' : '[vc]';
  if (overlays.length > 0) parts.push(`[vc]${overlays.join(',')}[vo]`);

  // 오디오 그래프 — 끝에 apad: 오디오가 영상보다 짧아도 -shortest 가 영상을 자르지 않게
  // (apad 로 무한 패딩 → shortest = 영상 길이. 오디오가 길면 영상 길이에서 잘림 — 의도대로)
  let audioLabel: string | null = null;
  if (hasNarration && hasMusic) {
    parts.push(`[${narIdx}:a]volume=1.0[an]`);
    parts.push(`[${musIdx}:a]volume=${musicVol}[am]`);
    parts.push(`[an][am]amix=inputs=2:duration=longest:dropout_transition=2,apad[aout]`);
    audioLabel = '[aout]';
  } else if (hasNarration) {
    parts.push(`[${narIdx}:a]volume=1.0,apad[aout]`);
    audioLabel = '[aout]';
  } else if (hasMusic) {
    parts.push(`[${musIdx}:a]volume=0.9,apad[aout]`);
    audioLabel = '[aout]';
  }

  args.push('-filter_complex', parts.join(';'));
  args.push('-map', videoLabel);
  if (audioLabel !== null) args.push('-map', audioLabel, '-c:a', 'aac', '-b:a', '192k', '-shortest');
  args.push('-c:v', 'libx264', '-crf', '18', '-preset', 'medium', out);
  return args;
}

/** 비트 길이 배열 → 번인 자막 타임라인(누적 시각). */
export function cuesFromBeats(
  beats: { caption: string; durationSec: number }[],
): CaptionCue[] {
  const cues: CaptionCue[] = [];
  let t = 0;
  for (const b of beats) {
    const end = t + b.durationSec;
    if (b.caption.trim().length > 0) cues.push({ text: b.caption, startSec: t, endSec: end });
    t = end;
  }
  return cues;
}
