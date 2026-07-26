/**
 * 롱폼 조립용 ffmpeg 인자 빌더 — spawn 없이 순수 로직만. 전부 로컬 ffmpeg(무료).
 *
 * - buildConcatAudioArgs: 여러 트랙을 하나의 오디오로 이어붙임(concat demuxer)
 * - buildVisualizerArgs: 오디오 반응형 비주얼라이저(네온 파형 + 타이틀) 영상 — 이미지 자산 불필요(무료)
 * - buildImageAssembleArgs: 배경 이미지를 총 길이만큼 루프한 영상
 * - buildThumbnailArgs: 1280x720 썸네일(이미지 + 타이틀 텍스트)
 */

export const DEFAULT_W = 1920;
export const DEFAULT_H = 1080;
export const DEFAULT_FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf';
/** 네온 파형 색(좌|우 채널) */
export const WAVE_COLORS = '0x00e5ff|0xff2d95';

/** drawtext 필터 값 이스케이프. */
export function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%');
}

/** concat demuxer 리스트 파일 한 줄(경로의 작은따옴표 이스케이프). */
export function concatListLine(path: string): string {
  return `file '${path.replace(/'/g, "'\\''")}'`;
}

/** 여러 오디오 → 하나(aac). listFile 은 "file '<경로>'" 줄들. */
export function buildConcatAudioArgs(listFile: string, out: string): string[] {
  return ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c:a', 'aac', '-b:a', '192k', out];
}

export interface VisualizerOpts {
  width?: number;
  height?: number;
  /** 배경색(16진). 기본 다크 네이비 */
  bgColor?: string;
  title?: string;
  subtitle?: string;
  font?: string;
  fps?: number;
}

/** 비주얼라이저 filter_complex 문자열(최종 출력 라벨 [v]). 입력 0 = 오디오. */
export function buildVisualizerFilter(o: VisualizerOpts = {}): string {
  const w = o.width ?? DEFAULT_W;
  const h = o.height ?? DEFAULT_H;
  const bg = o.bgColor ?? '0x0a0a16';
  const font = o.font ?? DEFAULT_FONT;
  const parts = [
    `color=c=${bg}:s=${w}x${h}[bg]`,
    `[0:a]showwaves=s=${w}x300:mode=cline:colors=${WAVE_COLORS}[wave]`,
    `[bg][wave]overlay=0:(H-h)/2[base]`,
  ];
  let last = 'base';
  if (o.title !== undefined && o.title.length > 0) {
    parts.push(
      `[${last}]drawtext=fontfile=${font}:text='${escapeDrawtext(o.title)}':fontcolor=white:fontsize=96:` +
        `x=(w-text_w)/2:y=170:shadowcolor=black@0.6:shadowx=2:shadowy=3[title]`,
    );
    last = 'title';
  }
  if (o.subtitle !== undefined && o.subtitle.length > 0) {
    parts.push(
      `[${last}]drawtext=fontfile=${font}:text='${escapeDrawtext(o.subtitle)}':fontcolor=white@0.8:fontsize=44:` +
        `x=(w-text_w)/2:y=290:shadowcolor=black@0.6:shadowx=2:shadowy=2[sub]`,
    );
    last = 'sub';
  }
  parts.push(`[${last}]null[v]`);
  return parts.join(';');
}

/** 비주얼라이저 완성 인자(입력 = 합쳐진 오디오). 오디오가 길이를 결정(-shortest). */
export function buildVisualizerArgs(audio: string, out: string, o: VisualizerOpts = {}): string[] {
  const fps = o.fps ?? 25;
  return [
    '-y',
    '-i',
    audio,
    '-filter_complex',
    buildVisualizerFilter(o),
    '-map',
    '[v]',
    '-map',
    '0:a',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-r',
    String(fps),
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    '-movflags',
    '+faststart',
    out,
  ];
}

export interface ImageAssembleOpts {
  width?: number;
  height?: number;
  fps?: number;
}

/** 배경 이미지를 오디오 길이만큼 루프한 영상(정적 이미지 효율 인코딩). */
export function buildImageAssembleArgs(image: string, audio: string, out: string, o: ImageAssembleOpts = {}): string[] {
  const w = o.width ?? DEFAULT_W;
  const h = o.height ?? DEFAULT_H;
  const fps = o.fps ?? 12;
  const vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
  return [
    '-y',
    '-loop',
    '1',
    '-framerate',
    String(fps),
    '-i',
    image,
    '-i',
    audio,
    '-vf',
    vf,
    '-c:v',
    'libx264',
    '-tune',
    'stillimage',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(fps),
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    '-movflags',
    '+faststart',
    out,
  ];
}

/** 썸네일 기본 폰트(한글 지원). */
export const THUMB_FONT = '/System/Library/Fonts/AppleSDGothicNeo.ttc';

export interface ThumbnailOpts {
  width?: number;
  height?: number;
  /** 1줄째(위, 흰색) */
  title: string;
  /** 2줄째(아래, 강조색) — 후킹은 2줄로 나누면 더 강함 */
  subtitle?: string;
  font?: string;
  /** 검정 외곽선 두께(기본 8) */
  outlineWidth?: number;
  /** 2줄째 강조색(기본 노랑 — 클릭 유발) */
  accentColor?: string;
}

/**
 * 1280x720 클릭 유발 썸네일 — 이미지 커버 크롭 + 하단 스크림 +
 * 굵은 2줄 후킹 텍스트(검정 외곽선). 한글 플레이리스트 썸네일 스타일.
 */
export function buildThumbnailArgs(image: string, out: string, o: ThumbnailOpts): string[] {
  const w = o.width ?? 1280;
  const h = o.height ?? 720;
  const font = o.font ?? THUMB_FONT;
  const bw = o.outlineWidth ?? 8;
  const accent = o.accentColor ?? '0xFFE24D';
  const hasSub = o.subtitle !== undefined && o.subtitle.length > 0;
  const scrimY = Math.round(h * 0.52);
  let vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
  // 하단 스크림(텍스트 가독성)
  vf += `,drawbox=x=0:y=${scrimY}:w=${w}:h=${h - scrimY}:color=black@0.4:t=fill`;
  // 1줄째(흰색 + 검정 외곽선). 2줄이면 위로 올림.
  const titleY = hasSub ? 'h-250' : 'h-170';
  vf +=
    `,drawtext=fontfile=${font}:text='${escapeDrawtext(o.title)}':fontcolor=white:fontsize=96:` +
    `borderw=${bw}:bordercolor=black:x=(w-text_w)/2:y=${titleY}:shadowcolor=black@0.6:shadowx=3:shadowy=3`;
  if (o.subtitle !== undefined && o.subtitle.length > 0) {
    // 2줄째(강조색 + 검정 외곽선)
    vf +=
      `,drawtext=fontfile=${font}:text='${escapeDrawtext(o.subtitle)}':fontcolor=${accent}:fontsize=104:` +
      `borderw=${bw}:bordercolor=black:x=(w-text_w)/2:y=h-130:shadowcolor=black@0.6:shadowx=3:shadowy=3`;
  }
  return ['-y', '-i', image, '-vf', vf, '-frames:v', '1', '-q:v', '2', out];
}

/** 글자 사이에 공백을 넣어 letterspaced 타이틀을 만든다("GYM HYPE" → "G Y M   H Y P E"). */
export function letterspace(text: string): string {
  return [...text].join(' ');
}

export interface AestheticThumbnailOpts {
  width?: number;
  height?: number;
  /** 상단 태그(예: 'PLAYLIST' → 【 PLAYLIST 】). 생략 가능 */
  tag?: string;
  /** 메인 타이틀(호출측에서 letterspace 적용 권장) */
  title: string;
  subtitle?: string;
  /** 타이틀 폰트(기본 Arial Bold, 라틴) */
  font?: string;
  /** 태그(【 】) 폰트(기본 CJK) */
  tagFont?: string;
}

/**
 * 감성(플레이리스트 채널) 썸네일 — 무드 비네트 + 하단 스크림 + 【 태그 】 +
 * letterspaced 흰 타이틀/서브. 클릭베이트 대신 세련된 톤.
 */
export function buildAestheticThumbnailArgs(image: string, out: string, o: AestheticThumbnailOpts): string[] {
  const w = o.width ?? 1280;
  const h = o.height ?? 720;
  const font = o.font ?? DEFAULT_FONT;
  const tagFont = o.tagFont ?? THUMB_FONT;
  const hasSub = o.subtitle !== undefined && o.subtitle.length > 0;
  const scrimY = Math.round(h * 0.61);
  let vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
  vf += `,drawbox=x=0:y=0:w=${w}:h=${h}:color=black@0.2:t=fill`; // 무드 비네트
  vf += `,drawbox=x=0:y=${scrimY}:w=${w}:h=${h - scrimY}:color=black@0.42:t=fill`; // 하단 스크림
  if (o.tag !== undefined && o.tag.length > 0) {
    vf +=
      `,drawtext=fontfile=${tagFont}:text='${escapeDrawtext(`【 ${o.tag} 】`)}':fontcolor=white@0.85:fontsize=30:` +
      `x=(w-text_w)/2:y=64:shadowcolor=black:shadowx=1:shadowy=1`;
  }
  const titleY = hasSub ? 'h-215' : 'h-150';
  vf +=
    `,drawtext=fontfile=${font}:text='${escapeDrawtext(o.title)}':fontcolor=white:fontsize=98:` +
    `x=(w-text_w)/2:y=${titleY}:shadowcolor=black@0.6:shadowx=2:shadowy=3`;
  if (o.subtitle !== undefined && o.subtitle.length > 0) {
    vf +=
      `,drawtext=fontfile=${font}:text='${escapeDrawtext(o.subtitle)}':fontcolor=white@0.82:fontsize=30:` +
      `x=(w-text_w)/2:y=h-90:shadowcolor=black@0.6:shadowx=1:shadowy=2`;
  }
  return ['-y', '-i', image, '-vf', vf, '-frames:v', '1', '-q:v', '2', out];
}

/** 짧은 배경 영상을 오디오 길이만큼 무한 루프해 롱폼 영상으로. */
export function buildVideoLoopArgs(video: string, audio: string, out: string, o: ImageAssembleOpts = {}): string[] {
  const w = o.width ?? DEFAULT_W;
  const h = o.height ?? DEFAULT_H;
  const vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
  return [
    '-y',
    '-stream_loop',
    '-1',
    '-i',
    video,
    '-i',
    audio,
    '-map',
    '0:v',
    '-map',
    '1:a',
    '-vf',
    vf,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    '-movflags',
    '+faststart',
    out,
  ];
}
