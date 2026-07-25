/**
 * ffmpeg/ffprobe 인자 빌더 — spawn 없이 인자 배열/필터 문자열만 생성하는 순수 로직.
 * 전부 테스트 대상이며, 실측에서 검증된 패턴을 그대로 함수화한다.
 *
 * 공통 원칙:
 *  - 재인코딩이 필요한 출력은 libx264 crf 18 preset medium (TV급 화질 기준)
 *  - 오디오 재인코딩은 aac 192k
 *  - 숫자 인자는 String() 으로만 변환(포맷 임의 변경 금지 — 테스트가 토큰을 고정)
 */

/** ffprobe: 첫 비디오 스트림의 width/height/duration 을 JSON 으로 */
export function buildProbeArgs(input: string): string[] {
  return [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height,duration',
    '-of',
    'json',
    input,
  ];
}

/** 포스터 프레임 1장 추출 (atSec 지점, JPEG 품질 3) */
export function buildPosterArgs(input: string, atSec: number, out: string): string[] {
  return ['-y', '-ss', String(atSec), '-i', input, '-frames:v', '1', '-q:v', '3', out];
}

export interface GridOpts {
  /** 추출 프레임 수 (기본 4 → 2x2 타일) */
  count?: number;
  /** 프레임 추출 간격(초) — fps=1/interval 로 select (기본 4초) */
  intervalSec?: number;
  /** 타일 셀 가로 픽셀 (기본 480) */
  scaleWidth?: number;
}

/** 검수용 프레임 그리드: fps 기반 select + scale + tile */
export function buildGridArgs(input: string, out: string, opts: GridOpts = {}): string[] {
  const count = opts.count ?? 4;
  const intervalSec = opts.intervalSec ?? 4;
  const scaleWidth = opts.scaleWidth ?? 480;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const filter = `fps=1/${intervalSec},scale=${scaleWidth}:-1,tile=${cols}x${rows}`;
  return ['-y', '-i', input, '-vf', filter, '-frames:v', '1', out];
}

export interface TitleOpts {
  text: string;
  /** 페이드인 시작 초 — alpha 가 1초에 걸쳐 0→1 */
  fadeInAt: number;
  /** macOS 기본 폰트. 다른 OS 는 인자로 재정의 */
  fontFile?: string;
  fontSize?: number;
  /** 하단에서 텍스트까지의 오프셋(px) */
  yOffset?: number;
}

export const DEFAULT_FONT_FILE = '/System/Library/Fonts/HelveticaNeue.ttc';

/** drawtext 필터 값 이스케이프 (ffmpeg 필터 문법의 특수문자) */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%');
}

/** drawtext 필터 문자열 — 페이드인 alpha 식 + 흰 글자 + black@0.35 그림자 (실측 패턴) */
export function buildDrawtextFilter(opts: TitleOpts): string {
  const fontFile = opts.fontFile ?? DEFAULT_FONT_FILE;
  const fontSize = opts.fontSize ?? 88;
  const yOffset = opts.yOffset ?? 190;
  const a = opts.fadeInAt;
  const alpha = `if(lt(t,${a}),0,if(lt(t,${a + 1}),t-${a},1))`;
  return (
    `drawtext=fontfile=${fontFile}:text='${escapeDrawtext(opts.text)}'` +
    `:fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=h-${yOffset}` +
    `:alpha='${alpha}':shadowcolor=black@0.35:shadowx=2:shadowy=2`
  );
}

/** 타이틀 오버레이 (영상 재인코딩, 오디오 무손실 복사) */
export function buildTitleArgs(input: string, out: string, opts: TitleOpts): string[] {
  return [
    '-y',
    '-i',
    input,
    '-vf',
    buildDrawtextFilter(opts),
    '-c:v',
    'libx264',
    '-crf',
    '18',
    '-preset',
    'medium',
    '-c:a',
    'copy',
    out,
  ];
}

/** concat demuxer 기반 이어붙이기 (listFile 은 "file '<경로>'" 줄들) */
export function buildConcatArgs(listFile: string, out: string): string[] {
  return [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listFile,
    '-c:v',
    'libx264',
    '-crf',
    '18',
    '-preset',
    'medium',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    out,
  ];
}

export interface SpliceSpec {
  /** 베이스 영상 전체 길이(초). 생략하면 resumeAt 부터 끝까지 open-ended trim */
  baseDur?: number;
  /** 베이스에서 자를 지점(초) — [0..cutAt] 유지 */
  cutAt: number;
  /** 삽입 후 베이스 재개 지점(초) — [resumeAt..끝] 유지 */
  resumeAt: number;
}

/**
 * 스플라이스 filter_complex: base[0..cutAt] + insert 전체 + base[resumeAt..끝]
 * 을 trim/atrim + setpts/asetpts + concat=n=3 으로 잇는다 (실측 패턴 그대로).
 * 입력 0 = base, 입력 1 = insert.
 */
export function buildSpliceFilter(spec: SpliceSpec): string {
  const tailEnd = spec.baseDur !== undefined ? `:${spec.baseDur}` : '';
  const tailTrim =
    spec.baseDur !== undefined
      ? `trim=${spec.resumeAt}${tailEnd}`
      : `trim=start=${spec.resumeAt}`;
  const tailAtrim =
    spec.baseDur !== undefined
      ? `atrim=${spec.resumeAt}${tailEnd}`
      : `atrim=start=${spec.resumeAt}`;
  return [
    `[0:v]trim=0:${spec.cutAt},setpts=PTS-STARTPTS[v0]`,
    `[0:a]atrim=0:${spec.cutAt},asetpts=PTS-STARTPTS[a0]`,
    `[1:v]setpts=PTS-STARTPTS[v1]`,
    `[1:a]asetpts=PTS-STARTPTS[a1]`,
    `[0:v]${tailTrim},setpts=PTS-STARTPTS[v2]`,
    `[0:a]${tailAtrim},asetpts=PTS-STARTPTS[a2]`,
    `[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[v][a]`,
  ].join(';');
}

export interface SpliceOpts extends SpliceSpec {
  /** 최종 결과에 타이틀 오버레이까지 얹을 때 */
  title?: TitleOpts;
}

/** 스플라이스 완성 인자 (base=입력0, insert=입력1) */
export function buildSpliceArgs(base: string, insert: string, out: string, opts: SpliceOpts): string[] {
  const spec: SpliceSpec = { cutAt: opts.cutAt, resumeAt: opts.resumeAt };
  if (opts.baseDur !== undefined) spec.baseDur = opts.baseDur;
  let filter = buildSpliceFilter(spec);
  let videoLabel = '[v]';
  if (opts.title) {
    filter += `;[v]${buildDrawtextFilter(opts.title)}[vt]`;
    videoLabel = '[vt]';
  }
  return [
    '-y',
    '-i',
    base,
    '-i',
    insert,
    '-filter_complex',
    filter,
    '-map',
    videoLabel,
    '-map',
    '[a]',
    '-c:v',
    'libx264',
    '-crf',
    '18',
    '-preset',
    'medium',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    out,
  ];
}

export interface MixVoOpts {
  /** 배경(원본 오디오) 볼륨 (기본 0.32) */
  bgVol?: number;
  /** VO 볼륨 (기본 1.5) */
  voVol?: number;
  /** VO 시작 지연(ms, 기본 900) */
  delayMs?: number;
}

/** 영상 배경음 + VO 믹스 (영상 스트림은 무손실 복사) */
export function buildMixVoArgs(video: string, vo: string, out: string, opts: MixVoOpts = {}): string[] {
  const bgVol = opts.bgVol ?? 0.32;
  const voVol = opts.voVol ?? 1.5;
  const delayMs = opts.delayMs ?? 900;
  const filter =
    `[0:a]volume=${bgVol}[bg];` +
    `[1:a]adelay=${delayMs}|${delayMs},volume=${voVol}[vo];` +
    `[bg][vo]amix=inputs=2:duration=first:dropout_transition=2[a]`;
  return [
    '-y',
    '-i',
    video,
    '-i',
    vo,
    '-filter_complex',
    filter,
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
    out,
  ];
}
