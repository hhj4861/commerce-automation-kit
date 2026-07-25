/**
 * 쇼츠(9:16) 렌더용 ffmpeg 인자·필터 빌더 — spawn 없이 순수 로직만.
 * 전부 테스트 대상이며, POC(shorts-publish-poc)에서 검증된 패턴을 함수화한다.
 *
 * 설계 판단(사용자 통찰): 광고는 이미 시네마틱 + 자체 브랜딩/엔딩이 있으므로
 * 콘텐츠형 헤비 템플릿을 얹으면 프리미엄감이 죽는다 → 기본은 "최소 개입".
 *
 * 공통 인코딩: libx264 crf 18 preset medium, yuv420p, +faststart, aac 192k
 * (플랫폼 재인코딩을 대비해도 소스 화질을 최대 보존).
 */
import type { ShortsMode } from '@cak/contracts';

export const SHORTS_W = 1080;
export const SHORTS_H = 1920;

/**
 * 워드마크=라틴(브랜드명, 굵게), 태그라인=한글.
 * spawn 은 shell 없이 인자를 넘기므로 폰트 경로의 공백은 이스케이프 없이 통한다(실측 확인).
 * 다른 OS 는 opts.wordmarkFont/taglineFont 로 재정의한다.
 */
export const DEFAULT_WORDMARK_FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf';
export const DEFAULT_TAGLINE_FONT = '/System/Library/Fonts/AppleSDGothicNeo.ttc';

/**
 * 세이프존: 틱톡/릴스는 하단(≈y1500↓)·우측 레일에 캡션·버튼 UI가 겹친다.
 * 워드마크를 영상밴드 바로 아래 로어서드(하단에서 620px)로 올려 UI 위험영역 위에 둔다.
 */
export const WORDMARK_Y_FROM_BOTTOM = 620;
export const TAGLINE_Y_FROM_BOTTOM = 556;

/** "끝 N초는 원본 엔딩(자체 로고/타이틀)에 양보" — 워드마크 페이드아웃 규칙. */
export const END_RESERVE_SEC = 3.0;
export const FADEOUT_LEN_SEC = 1.5;
/** 페이드인 완료 후 최소 이만큼은 완전 불투명 유지(반짝임 방지). */
export const MIN_HOLD_SEC = 1.0;

/** 부동소수 잡음 제거용 3자리 반올림 문자열화(필터·테스트 결정성). */
export function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** drawtext 필터 값 이스케이프(ffmpeg 필터 문법 특수문자). */
export function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%');
}

export interface Fadeout {
  foStart: number;
  foEnd: number;
}

/** 영상 길이에 상대적인 페이드아웃 구간(끝 3초 양보, 1.5초에 걸쳐 사라짐). */
export function computeFadeout(durationSec: number): Fadeout {
  const foEnd = Math.max(2, durationSec - END_RESERVE_SEC);
  const foStart = Math.max(1, durationSec - END_RESERVE_SEC - FADEOUT_LEN_SEC);
  return { foStart: Math.round(foStart * 1000) / 1000, foEnd: Math.round(foEnd * 1000) / 1000 };
}

/**
 * 페이드아웃을 적용해도 되는 길이인지: 페이드인 끝 + 최소유지 + 페이드아웃 + 끝여백이
 * 영상 안에 들어가야 한다. 안 들어가면(짧은 광고) 워드마크를 지속시키는 게 낫다
 * — 반짝 떴다 사라지는 것보다.
 * @param fadeInEnd 이 컴포지션에서 가장 늦게 페이드인이 끝나는 시각(초)
 */
export function canFadeout(durationSec: number, fadeInEnd: number): boolean {
  return durationSec - END_RESERVE_SEC - FADEOUT_LEN_SEC >= fadeInEnd + MIN_HOLD_SEC;
}

export interface AlphaOpts {
  /** 페이드인 시작(초) */
  fadeInStart: number;
  /** 페이드인 길이(초) */
  fadeInLen: number;
  /** 페이드아웃(없으면 지속) */
  fadeout?: Fadeout;
}

/**
 * 워드마크 alpha 식:
 *  - fadeInStart~+fadeInLen 에 0→1
 *  - fadeout 있으면 foStart~foEnd 에 1→0, 이후 0 (원본 엔딩에 양보)
 *  - fadeout 없으면 이후 1 지속
 */
export function wordmarkAlpha(o: AlphaOpts): string {
  const s = o.fadeInStart;
  const e = o.fadeInStart + o.fadeInLen;
  const fadeIn = `if(lt(t,${fmt(s)}),0,if(lt(t,${fmt(e)}),(t-${fmt(s)})/${fmt(o.fadeInLen)},`;
  if (o.fadeout) {
    // foStart 를 페이드인 끝(e) 이전으로 당기지 않는다 — 그렇지 않으면 알파가 튀며 워드마크가 팝된다.
    const fs = Math.max(o.fadeout.foStart, e);
    const foEnd = o.fadeout.foEnd;
    const dur = foEnd - fs;
    if (dur <= 0) return `${fadeIn}1))`; // 유지할 구간이 없으면 지속(페이드아웃 생략)
    return `${fadeIn}if(lt(t,${fmt(fs)}),1,if(lt(t,${fmt(foEnd)}),1-(t-${fmt(fs)})/${fmt(dur)},0))))`;
  }
  return `${fadeIn}1))`;
}

export interface ShortsRenderOpts {
  width?: number;
  height?: number;
  /** 워드마크(blur-brand/letterbox). 없으면 텍스트 없이. */
  brand?: string;
  /** 태그라인(선택, blur-brand 2줄째) */
  tagline?: string;
  /** 페이드아웃 계산용 소스 길이(초). 있으면 워드마크가 끝에서 사라진다. */
  durationSec?: number;
  wordmarkFont?: string;
  taglineFont?: string;
  /** heavy 모드 상단 훅/하단 캡션(대조군 데모용) */
  hook?: string;
  caption?: string;
}

/** 세로 커버(9:16)로 scale+crop 하는 공통 조각. */
function coverCrop(w: number, h: number): string {
  return `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
}

/** 블러필 베이스(원본 보존 + 위아래 자기프레임 블러). outLabel 주면 그 라벨로 종료. */
export function buildBlurFill(w: number, h: number, outLabel?: string): string {
  const tail = outLabel ? `[${outLabel}]` : '';
  return (
    `[0:v]${coverCrop(w, h)},gblur=sigma=24,eq=brightness=-0.06[bg];` +
    `[0:v]scale=${w}:-2[fg];` +
    `[bg][fg]overlay=(W-w)/2:(H-h)/2${tail}`
  );
}

/** 워드마크 drawtext 조각(단독 라틴 워드마크). */
function wordmarkDraw(brand: string, font: string, alpha: string): string {
  return (
    `drawtext=fontfile=${font}:text='${escapeDrawtext(brand)}':fontcolor=white@0.94:fontsize=46:` +
    `x=(w-text_w)/2:y=h-${WORDMARK_Y_FROM_BOTTOM}:shadowcolor=black@0.6:shadowx=0:shadowy=2:alpha='${alpha}'`
  );
}

/** 태그라인 drawtext 조각(한글 2줄째). */
function taglineDraw(tagline: string, font: string, alpha: string): string {
  return (
    `drawtext=fontfile=${font}:text='${escapeDrawtext(tagline)}':fontcolor=white@0.74:fontsize=28:` +
    `x=(w-text_w)/2:y=h-${TAGLINE_Y_FROM_BOTTOM}:shadowcolor=black@0.6:shadowx=0:shadowy=2:alpha='${alpha}'`
  );
}

export interface ShortsFilter {
  /** '-vf'(단일 체인) 또는 '-filter_complex'(다입력/라벨) */
  flag: '-vf' | '-filter_complex';
  filter: string;
}

/** 모드별 필터그래프 생성. */
export function buildShortsFilter(mode: ShortsMode, opts: ShortsRenderOpts = {}): ShortsFilter {
  const w = opts.width ?? SHORTS_W;
  const h = opts.height ?? SHORTS_H;
  const wmFont = opts.wordmarkFont ?? DEFAULT_WORDMARK_FONT;
  const tagFont = opts.taglineFont ?? DEFAULT_TAGLINE_FONT;

  switch (mode) {
    // 센터 크롭: 세로 풀블리드, 바 없음(피사체 중앙 컷 전용).
    case 'crop':
      return { flag: '-vf', filter: coverCrop(w, h) };

    // 블러필: 전체 보존, 텍스트 없음.
    case 'blur':
      return { flag: '-filter_complex', filter: buildBlurFill(w, h) };

    // 블러필 + 절제된 워드마크(하단 세이프존) — 광고 쇼츠 권장 기본값.
    case 'blur-brand': {
      const brand = opts.brand ?? '';
      if (brand.length === 0) {
        // 브랜드 없으면 blur 와 동일(빈 워드마크 방지).
        return { flag: '-filter_complex', filter: buildBlurFill(w, h) };
      }
      const hasTag = opts.tagline !== undefined && opts.tagline.length > 0;
      // 가장 늦게 페이드인이 끝나는 시각: 태그라인(0.9+0.6=1.5) vs 워드마크(0.6+0.6=1.2)
      const fadeInEndMax = hasTag ? 1.5 : 1.2;
      // 길이가 충분할 때만 "끝 3초 양보" 페이드아웃 — 짧은 광고는 지속(반짝임 방지).
      const fadeout =
        opts.durationSec !== undefined && canFadeout(opts.durationSec, fadeInEndMax)
          ? computeFadeout(opts.durationSec)
          : undefined;
      const wmAlphaOpts: AlphaOpts = { fadeInStart: 0.6, fadeInLen: 0.6 };
      const tagAlphaOpts: AlphaOpts = { fadeInStart: 0.9, fadeInLen: 0.6 };
      if (fadeout) {
        wmAlphaOpts.fadeout = fadeout;
        tagAlphaOpts.fadeout = fadeout;
      }
      let filter = `${buildBlurFill(w, h, 'base')};[base]${wordmarkDraw(brand, wmFont, wordmarkAlpha(wmAlphaOpts))}`;
      if (opts.tagline !== undefined && opts.tagline.length > 0) {
        filter += `[b1];[b1]${taglineDraw(opts.tagline, tagFont, wordmarkAlpha(tagAlphaOpts))}`;
      }
      return { flag: '-filter_complex', filter };
    }

    // 레터박스: 원본 100% + 검정 바 + 얇은 하단 워드마크(정적, 세이프존).
    case 'letterbox': {
      const brand = opts.brand ?? '';
      // force_original_aspect_ratio=decrease 로 프레임 안에 완전히 맞춘 뒤 중앙 패딩
      // (세로가 9:16보다 긴 입력도 pad 높이를 초과하지 않아 크래시 안 함).
      let filter = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(${w}-iw)/2:(${h}-ih)/2:black`;
      if (brand.length > 0) {
        filter +=
          `,drawtext=fontfile=${wmFont}:text='${escapeDrawtext(brand)}':fontcolor=white@0.88:fontsize=40:` +
          `x=(w-text_w)/2:y=h-${WORDMARK_Y_FROM_BOTTOM}:shadowcolor=black@0.5:shadowx=0:shadowy=2`;
      }
      return { flag: '-vf', filter };
    }

    // (대조군) 콘텐츠형 헤비 템플릿 — 광고엔 부적합함을 보여주는 데모.
    case 'heavy': {
      const hook = escapeDrawtext(opts.hook ?? '이건 아무 개나 못 해');
      const caption = escapeDrawtext(opts.caption ?? '충성심의 대명사, 진돗개');
      const filter =
        `[0:v]scale=${w}:-2[fg];` +
        `color=c=0x101418:s=${w}x${h}:d=1[bgc];` +
        `[bgc][fg]overlay=(W-w)/2:(H-h)/2[mid];` +
        `[mid]drawbox=x=0:y=150:w=${w}:h=210:color=0x000000@0.55:t=fill[m2];` +
        `[m2]drawtext=fontfile=${tagFont}:text='${hook}':fontcolor=0xFFE24D:fontsize=64:x=(w-text_w)/2:y=205:shadowcolor=black:shadowx=2:shadowy=2[m3];` +
        `[m3]drawbox=x=0:y=1470:w=${w}:h=170:color=0xFF3B3B@0.9:t=fill[m4];` +
        `[m4]drawtext=fontfile=${tagFont}:text='${caption}':fontcolor=white:fontsize=52:x=(w-text_w)/2:y=1520:shadowcolor=black:shadowx=2:shadowy=2`;
      return { flag: '-filter_complex', filter };
    }
  }
}

/** 쇼츠 렌더 완성 인자(입력 → 9:16 mp4). */
export function buildShortsArgs(
  input: string,
  out: string,
  mode: ShortsMode,
  opts: ShortsRenderOpts = {},
): string[] {
  const { flag, filter } = buildShortsFilter(mode, opts);
  return [
    '-y',
    '-i',
    input,
    flag,
    filter,
    '-c:v',
    'libx264',
    '-profile:v',
    'high',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'medium',
    '-crf',
    '18',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    out,
  ];
}
