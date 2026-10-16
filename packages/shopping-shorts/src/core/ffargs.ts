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
  /**
   * 오디오 패딩 상한(초) — `audioPadCapSec(클립 실측 길이 합, 클립 수)` 로 만든다.
   * 출력 길이를 정하지 않는다(그건 -shortest = 영상 끝). 없으면 상한 없는 패딩(audioPadTail 참고).
   */
  padCapSec?: number;
}

/**
 * 오디오 패딩 상한(초) = 영상 기준 길이 + 1 s + 조각(클립·세그먼트) 수/15 s.
 * 실제 영상은 조각마다 fps 30 프레임 올림(trim·tpad·fps)이 쌓여 기준 길이보다 조금 길다
 * (실측: 기준 17.65 s → 영상 17.733 s). 상한이 영상보다 짧으면 -shortest 가 출력을
 * 조용히 짧게 자르므로, 조각당 2 프레임(1/15 s) + 1 s 여유를 둔다.
 */
export function audioPadCapSec(videoSec: number, pieces: number): number {
  return videoSec + 1 + pieces / 15;
}

/**
 * 오디오 그래프 끝(`…[aout]` 앞) 패딩 꼬리 — 오디오가 영상보다 짧아도 -shortest 가 영상을
 * 자르지 않게 패딩한다(오디오가 길면 지금처럼 영상 길이에서 잘림).
 * - `asetpts=N/SR/TB`: 오디오 pts 를 표본 수로 다시 매긴다. 그래프 출구에 pts 없는(NOPTS) 프레임이
 *   섞이면(관측 — amix 출력으로 추정) 옵션 없는 apad 가 그 뒤 패딩 프레임에 쓰레기 pts(≈ -2.09e14 s)를 붙인다.
 * - `apad=whole_dur=<상한>`: 패딩을 상한에서 끝낸다(유한). 무한 패딩 + -shortest 는 위 pts 와
 *   만나면 ffmpeg 의 shortest 대기열이 오디오만 쌓다 한도(131072)에서 ENOSPC(exit 228)로 끝나
 *   잘린 mp4 를 남긴다. 8.0.1 은 간헐 — 짧은 사례(3 s) 측정 1~10%(모양·부하에 따라, 다중 트랙+BGM 이
 *   가장 잦고 BGM 없는 모양은 0 건 관측). ubuntu 6.1.1 은 옵션 없는 apad 꼴이 매번 실패했고, 이 꼴의
 *   6.1.1 효과는 아직 미확인(같은 그래프의 apad=whole_dur 단독은 6.1.1 CI 통과) — 근거: 2026-10-16
 *   apad-shortest 조사.
 * 상한이 없으면(capSec 생략) pts 재매김만 하고 패딩은 무한으로 둔다.
 */
export function audioPadTail(capSec?: number): string {
  if (capSec === undefined) return 'asetpts=N/SR/TB,apad';
  if (!Number.isFinite(capSec) || capSec <= 0) {
    throw new Error(`오디오 패딩 상한이 올바르지 않음: ${capSec}`);
  }
  return `asetpts=N/SR/TB,apad=whole_dur=${capSec.toFixed(3)}`;
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

/**
 * 상단 고지 오버레이(상시 표시) — 영상을 가리지 않게 작고 반투명하게.
 * 단, 완전히 안 보이면 고지 의무 취지가 무너지므로 판독 가능한 하한(≈0.45)을 지킨다.
 */
function disclosureFilter(fontFile: string, text: string = DISCLOSURE_OVERLAY_TEXT): string {
  // 우측 상단 고정(사용자 결정 2026-07-28) — 작고 반투명, 영상을 가리지 않게
  return (
    `drawtext=fontfile=${fontFile}:text='${escapeDrawtext(text)}'` +
    `:fontsize=26:fontcolor=white@0.45:borderw=1:bordercolor=black@0.25` +
    `:x=w-text_w-36:y=64`
  );
}

/**
 * 조립 ffmpeg 인자.
 * - 클립: 커버 스케일(비율 유지 확대) 후 중앙 크롭 → fps 30 통일 → concat
 * - 오디오: 내레이션 1.0 + BGM(더킹 볼륨) amix / 한쪽만 있으면 단독 / 없으면 무음성
 * - -shortest: 오디오가 길어도 영상 길이에서 끝냄. 오디오가 짧으면 끝 패딩(audioPadTail —
 *   opts.padCapSec 가 있으면 그 상한까지만)으로 영상 길이를 지킨다
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

  // 오디오 그래프 — 끝 패딩: 오디오가 영상보다 짧아도 -shortest 가 영상을 자르지 않게
  // (패딩 → shortest = 영상 길이. 오디오가 길면 영상 길이에서 잘림 — 의도대로).
  // 패딩은 pts 재매김 + 상한(opts.padCapSec, CLI 가 클립을 probe 해 넘김) — audioPadTail 참고.
  // 오디오가 있을 때만 계산한다 — 무음 조립은 padCapSec 를 보지 않는다(0·NaN 이어도 던지지 않음).
  const padTail = hasNarration || hasMusic ? audioPadTail(opts.padCapSec) : '';
  let audioLabel: string | null = null;
  if (hasNarration && hasMusic) {
    parts.push(`[${narIdx}:a]volume=1.0[an]`);
    parts.push(`[${musIdx}:a]volume=${musicVol}[am]`);
    parts.push(`[an][am]amix=inputs=2:duration=longest:dropout_transition=2,${padTail}[aout]`);
    audioLabel = '[aout]';
  } else if (hasNarration) {
    parts.push(`[${narIdx}:a]volume=1.0,${padTail}[aout]`);
    audioLabel = '[aout]';
  } else if (hasMusic) {
    parts.push(`[${musIdx}:a]volume=0.9,${padTail}[aout]`);
    audioLabel = '[aout]';
  }

  args.push('-filter_complex', parts.join(';'));
  args.push('-map', videoLabel);
  if (audioLabel !== null) args.push('-map', audioLabel, '-c:a', 'aac', '-b:a', '192k', '-shortest');
  // +faststart: moov 를 파일 앞으로 — 대시보드/웹 스트리밍 재생 필수(실측: moov 후미면 브라우저 재생 끊김)
  args.push('-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', out);
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

// ---------------------------------------------------------------------------
// 동기(synced) 조립 — Vrew 스타일 (2026-07-28 바쿠치올.mp4 실측 재현)
//
// 실측 결함 2건에서 나온 재설계: ① 내레이션이 비트 영상보다 길면 다음 비트와
// 겹쳐 "TTS 중복", ② 영상이 내레이션보다 길면 비트 사이 무음 공백. 해법은
// **세그먼트 길이를 내레이션에 맞추는 것** — L_i = 내레이션 + 패딩(내레이션이
// 없는 세그먼트만 클립 길이). 남는 클립은 trim, 부족분은 마지막 프레임 홀드
// (tpad clone). 마지막 세그먼트만 endHoldSec 여운을 더해 뚝 끊기지 않게 한다.
// 자막(내레이션 전문)은 내레이션과 같은 타임라인 — 화면 중앙, 손글씨풍(나눔펜).
// ---------------------------------------------------------------------------

/** 세그먼트 내 자막 구절(한 줄) — 시각은 세그먼트 시작 기준 상대값. */
export interface SubtitleChunk {
  /** 한 줄 텍스트가 담긴 파일(drawtext textfile — 이스케이프 문제 회피) */
  file: string;
  startSec: number;
  endSec: number;
}

/** 동기 조립의 한 세그먼트(비트). */
export interface SyncedSegment {
  clip: string;
  /** 클립 실측 길이(초) — ffprobe */
  clipDurationSec: number;
  /** 비트 내레이션 mp3 (없으면 무내레이션 세그먼트) */
  narrationFile?: string;
  narrationDurationSec?: number;
  /** 구절 단위 한 줄 자막들(내레이션 진행에 맞춰 순차 표시 — Vrew 방식) */
  subtitles?: SubtitleChunk[];
}

export interface SyncedAssembleOpts {
  width: number;
  height: number;
  disclosureOverlay: boolean;
  /** 오버레이 문구(기본 쿠팡 파트너스 문구 — 쇼핑커넥트 등은 "(광고)") */
  disclosureText?: string;
  music?: string;
  fontFile?: string;
  /** 자막 크기(기본 62 — Vrew 유사) */
  subtitleFontSize?: number;
  /** 내레이션 뒤 여백(초, 기본 0.35) */
  narrationPadSec?: number;
  /** 마지막 세그먼트 끝 여운(초, 기본 0.6) — 내레이션 종료와 동시에 끊기는 것 방지 */
  endHoldSec?: number;
  musicVolume?: number;
}

/** 세그먼트 길이(초): 내레이션+패딩(내레이션 없으면 클립 길이) — 비트 간 무음 공백 제거. */
export function segmentLengthSec(seg: SyncedSegment, padSec = 0.35): number {
  return seg.narrationDurationSec !== undefined
    ? seg.narrationDurationSec + padSec
    : seg.clipDurationSec;
}

/**
 * 자막 구절 분할 — 내레이션 문장을 한 줄 분량(maxChars)의 구절로 자른다.
 * 쉼표·마침표 등 구두점 경계를 우선하고, 없으면 공백 경계로 자른다.
 */
export function splitSubtitleChunks(text: string, maxChars = 15): string[] {
  const words = text.trim().split(/\s+/);
  const chunks: string[] = [];
  let cur = '';
  for (const w of words) {
    const joined = cur.length === 0 ? w : cur + ' ' + w;
    if (joined.length <= maxChars) {
      cur = joined;
      // 구두점으로 끝나면 자연 경계에서 조기 분할(호흡 단위)
      if (/[,.!?…]$/.test(w) && cur.length >= Math.min(8, maxChars / 2)) {
        chunks.push(cur);
        cur = '';
      }
    } else {
      if (cur) chunks.push(cur);
      cur = w;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/**
 * 구절별 표시 시간 배분 — 내레이션 길이를 구절 글자수 비례로 나눈다(세그먼트 상대 시각).
 * 내레이션이 없으면 전체 길이를 균등 분배.
 */
export function chunkTimings(
  chunks: string[],
  totalSec: number,
): { startSec: number; endSec: number }[] {
  const weights = chunks.map((c) => Math.max(1, c.replace(/\s+/g, '').length));
  const sum = weights.reduce((a, b) => a + b, 0);
  const out: { startSec: number; endSec: number }[] = [];
  let t = 0;
  chunks.forEach((_, i) => {
    const d = (weights[i]! / sum) * totalSec;
    out.push({ startSec: t, endSec: i === chunks.length - 1 ? totalSec : t + d });
    t += d;
  });
  return out;
}

/** 동기 조립 ffmpeg 인자. */
export function buildSyncedAssembleArgs(
  segments: SyncedSegment[],
  out: string,
  opts: SyncedAssembleOpts,
): string[] {
  if (segments.length === 0) throw new Error('segments 가 비어 있음');
  const font = opts.fontFile ?? DEFAULT_FONT_FILE;
  const fontSize = opts.subtitleFontSize ?? 62;
  const pad = opts.narrationPadSec ?? 0.35;
  const musicVol = opts.musicVolume ?? 0.18;
  const { width, height } = opts;

  const args: string[] = ['-y'];
  segments.forEach((s) => args.push('-i', s.clip));
  const narIdxs: (number | null)[] = [];
  let inputIdx = segments.length;
  segments.forEach((s) => {
    if (s.narrationFile !== undefined) {
      args.push('-i', s.narrationFile);
      narIdxs.push(inputIdx++);
    } else narIdxs.push(null);
  });
  let musIdx = -1;
  if (opts.music !== undefined) {
    args.push('-i', opts.music);
    musIdx = inputIdx++;
  }

  // 타임라인 — 마지막 세그먼트만 끝 여운을 더한다(내레이션 종료 즉시 컷 방지)
  const endHold = opts.endHoldSec ?? 0.6;
  const lengths = segments.map(
    (s, i) => segmentLengthSec(s, pad) + (i === segments.length - 1 ? endHold : 0),
  );
  const offsets: number[] = [];
  lengths.reduce((acc, l, i) => { offsets[i] = acc; return acc + l; }, 0);
  const total = lengths.reduce((a, b) => a + b, 0);

  const parts: string[] = [];
  segments.forEach((s, i) => {
    // 클립 > 세그먼트 → 남는 꼬리 trim(무음 공백 제거), 클립 < 세그먼트 → 마지막 프레임 홀드
    const hold = Math.max(0, lengths[i]! - s.clipDurationSec);
    const trim = s.clipDurationSec - lengths[i]! > 0.01
      ? `,trim=duration=${lengths[i]!.toFixed(3)}` : '';
    const tpad = hold > 0.01 ? `,tpad=stop_mode=clone:stop_duration=${hold.toFixed(3)}` : '';
    parts.push(
      `[${i}:v]scale=w=${width}:h=${height}:force_original_aspect_ratio=increase,` +
        `crop=${width}:${height},setsar=1,fps=30${trim},setpts=PTS-STARTPTS${tpad}[v${i}]`,
    );
  });
  parts.push(`${segments.map((_, i) => `[v${i}]`).join('')}concat=n=${segments.length}:v=1:a=0[vc]`);

  // 자막(구절 단위 한 줄, 화면 중앙 45% — 한 줄이라 줄별 중앙정렬이 자동 성립) + 고지 오버레이
  // 테두리는 borderw(FreeType stroker)가 아니라 8방향 오프셋 검정 사본 + 흰 본문.
  // 실측(2026-07-29): 손글씨 폰트의 획 겹침 글자(잎·얇·땐)에서 borderw≥4가
  // 얇은 속공간을 검게 메워 "글자 깨짐"이 발생 — 오프셋 방식은 굵기를 유지하면서 무결.
  const OUTLINE_OFFSETS: [number, number][] = [
    [-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, 2], [-2, 2], [2, -2],
  ];
  const overlays: string[] = [];
  segments.forEach((s, i) => {
    for (const chunk of s.subtitles ?? []) {
      const st = offsets[i]! + chunk.startSec;
      const en = offsets[i]! + chunk.endSec;
      const enable = `:enable='between(t,${st.toFixed(3)},${en.toFixed(3)})'`;
      for (const [dx, dy] of OUTLINE_OFFSETS) {
        overlays.push(
          `drawtext=fontfile=${font}:textfile=${chunk.file}` +
            `:fontsize=${fontSize}:fontcolor=black` +
            `:x=(w-text_w)/2+(${dx}):y=(h-text_h)*0.45+(${dy})${enable}`,
        );
      }
      overlays.push(
        `drawtext=fontfile=${font}:textfile=${chunk.file}` +
          `:fontsize=${fontSize}:fontcolor=white` +
          `:x=(w-text_w)/2:y=(h-text_h)*0.45${enable}`,
      );
    }
  });
  if (opts.disclosureOverlay) overlays.push(disclosureFilter(DEFAULT_FONT_FILE, opts.disclosureText));
  const videoLabel = overlays.length > 0 ? '[vo]' : '[vc]';
  if (overlays.length > 0) parts.push(`[vc]${overlays.join(',')}[vo]`);

  // 오디오: 비트 내레이션을 각 세그먼트 시작에 배치 + (선택) BGM
  const audioLabels: string[] = [];
  segments.forEach((_, i) => {
    const idx = narIdxs[i];
    if (idx === null) return;
    const ms = Math.round(offsets[i]! * 1000);
    parts.push(`[${idx}:a]adelay=${ms}|${ms}[na${i}]`);
    audioLabels.push(`[na${i}]`);
  });
  if (musIdx >= 0) {
    parts.push(`[${musIdx}:a]volume=${musicVol},atrim=0:${total.toFixed(3)}[mus]`);
    audioLabels.push('[mus]');
  }
  // 끝 패딩(pts 재매김 + 상한) — 오디오가 짧으면 영상 끝까지 무음, 길이는 -shortest(영상 끝)가 정한다.
  // 상한 = 타임라인 total + 여유(audioPadCapSec) — 세그먼트별 프레임 올림으로 영상이 total 보다 길다.
  const padTail = audioPadTail(audioPadCapSec(total, segments.length));
  let audioLabel: string | null = null;
  if (audioLabels.length === 1) {
    parts.push(`${audioLabels[0]}${padTail}[aout]`);
    audioLabel = '[aout]';
  } else if (audioLabels.length > 1) {
    parts.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0,${padTail}[aout]`);
    audioLabel = '[aout]';
  }

  args.push('-filter_complex', parts.join(';'));
  args.push('-map', videoLabel);
  if (audioLabel !== null) args.push('-map', audioLabel, '-c:a', 'aac', '-b:a', '192k', '-shortest');
  args.push('-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', out);
  return args;
}
