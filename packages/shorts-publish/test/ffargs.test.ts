/**
 * 쇼츠 렌더 인자 빌더 테스트 — spawn 없이 순수 함수만. 세이프존·페이드아웃 토큰 고정.
 */
import { describe, it, expect } from 'vitest';
import {
  fmt,
  escapeDrawtext,
  computeFadeout,
  canFadeout,
  wordmarkAlpha,
  buildBlurFill,
  buildShortsFilter,
  buildShortsArgs,
  DEFAULT_WORDMARK_FONT,
  DEFAULT_TAGLINE_FONT,
} from '../src/core/ffargs.js';

describe('fmt', () => {
  it('3자리 반올림으로 부동소수 잡음 제거', () => {
    expect(fmt(25.082999999999998)).toBe('25.083');
    expect(fmt(1.2)).toBe('1.2');
    expect(fmt(0.6)).toBe('0.6');
    expect(fmt(3)).toBe('3');
  });
});

describe('escapeDrawtext', () => {
  it('백슬래시·따옴표·콜론·퍼센트 이스케이프', () => {
    const r = escapeDrawtext("50%: it's");
    expect(r).toContain('\\%');
    expect(r).toContain('\\:');
    expect(r).toContain("\\'");
  });
});

describe('computeFadeout', () => {
  it('끝 3초 양보 + 1.5초 페이드아웃', () => {
    expect(computeFadeout(29.583)).toEqual({ foStart: 25.083, foEnd: 26.583 });
  });
  it('짧은 영상은 하한으로 클램프', () => {
    expect(computeFadeout(4)).toEqual({ foStart: 1, foEnd: 2 });
  });
});

describe('canFadeout', () => {
  it('길이가 충분하면 true', () => {
    expect(canFadeout(29.583, 1.2)).toBe(true);
    expect(canFadeout(7, 1.5)).toBe(true); // 7-4.5=2.5 >= 1.5+1
  });
  it('짧으면 false(반짝임 방지 → 지속)', () => {
    expect(canFadeout(5, 1.2)).toBe(false); // 0.5 >= 2.2 아님
    expect(canFadeout(6, 1.5)).toBe(false); // 1.5 >= 2.5 아님
  });
});

describe('wordmarkAlpha', () => {
  it('페이드아웃 있으면 끝에서 1→0 후 0', () => {
    const a = wordmarkAlpha({ fadeInStart: 0.6, fadeInLen: 0.6, fadeout: { foStart: 25.083, foEnd: 26.583 } });
    expect(a).toBe(
      'if(lt(t,0.6),0,if(lt(t,1.2),(t-0.6)/0.6,if(lt(t,25.083),1,if(lt(t,26.583),1-(t-25.083)/1.5,0))))',
    );
  });
  it('페이드아웃 없으면 지속(마지막 1)', () => {
    const a = wordmarkAlpha({ fadeInStart: 0.6, fadeInLen: 0.6 });
    expect(a).toBe('if(lt(t,0.6),0,if(lt(t,1.2),(t-0.6)/0.6,1))');
  });
  it('foStart 가 페이드인 끝보다 이르면 페이드인 끝으로 클램프(팝 방지)', () => {
    const a = wordmarkAlpha({ fadeInStart: 0.6, fadeInLen: 0.6, fadeout: { foStart: 0.8, foEnd: 5 } });
    // e=1.2 로 클램프, dur=5-1.2=3.8
    expect(a).toContain('if(lt(t,1.2),1,if(lt(t,5),1-(t-1.2)/3.8,0))');
  });
  it('유지 구간이 0 이하면 지속으로 폴백(반짝임 방지)', () => {
    const a = wordmarkAlpha({ fadeInStart: 0.6, fadeInLen: 0.6, fadeout: { foStart: 1, foEnd: 1.1 } });
    expect(a).toBe('if(lt(t,0.6),0,if(lt(t,1.2),(t-0.6)/0.6,1))');
  });
});

describe('buildBlurFill', () => {
  it('원본 보존 + 위아래 자기프레임 블러, 라벨 옵션', () => {
    expect(buildBlurFill(1080, 1920, 'base')).toBe(
      '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=24,eq=brightness=-0.06[bg];' +
        '[0:v]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[base]',
    );
    expect(buildBlurFill(1080, 1920)).toMatch(/overlay=\(W-w\)\/2:\(H-h\)\/2$/);
  });
});

describe('buildShortsFilter — 모드별', () => {
  it('crop: -vf scale+crop 커버', () => {
    const { flag, filter } = buildShortsFilter('crop');
    expect(flag).toBe('-vf');
    expect(filter).toBe('scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920');
  });

  it('blur: -filter_complex 블러필(텍스트 없음)', () => {
    const { flag, filter } = buildShortsFilter('blur');
    expect(flag).toBe('-filter_complex');
    expect(filter).toBe(buildBlurFill(1080, 1920));
  });

  it('blur-brand: 세이프존 워드마크 + 페이드아웃(duration 있음, 단일)', () => {
    const { flag, filter } = buildShortsFilter('blur-brand', { brand: 'KOREA JINDO', durationSec: 29.583 });
    expect(flag).toBe('-filter_complex');
    expect(filter).toContain(`;[base]drawtext=fontfile=${DEFAULT_WORDMARK_FONT}:text='KOREA JINDO'`);
    expect(filter).toContain('fontsize=46');
    expect(filter).toContain('y=h-620');
    expect(filter).toContain('if(lt(t,25.083),1,if(lt(t,26.583)');
    expect(filter).not.toContain('[b1]'); // 태그라인 없음
  });

  it('blur-brand: 태그라인 있으면 2줄(세이프존 y=h-556)', () => {
    const { filter } = buildShortsFilter('blur-brand', {
      brand: 'KOREA JINDO', tagline: '충성심의 대명사, 진돗개', durationSec: 29.583,
    });
    expect(filter).toContain('[b1];[b1]drawtext=');
    expect(filter).toContain(`fontfile=${DEFAULT_TAGLINE_FONT}`);
    expect(filter).toContain("text='충성심의 대명사, 진돗개'");
    expect(filter).toContain('fontsize=28');
    expect(filter).toContain('y=h-556');
  });

  it('blur-brand: duration 없으면 워드마크 지속(페이드아웃 없음)', () => {
    const { filter } = buildShortsFilter('blur-brand', { brand: 'X' });
    expect(filter).toContain("(t-0.6)/0.6,1))");
    expect(filter).not.toContain('25.083');
  });

  it('blur-brand: 짧은 광고(5s)는 페이드아웃 생략하고 지속(반짝임 방지)', () => {
    const { filter } = buildShortsFilter('blur-brand', { brand: 'X', durationSec: 5 });
    expect(filter).toContain("(t-0.6)/0.6,1))"); // 지속 분기
    expect(filter).not.toContain('1-(t-'); // 페이드아웃 램프 없음
  });

  it('blur-brand: 긴 광고(29.583s)는 페이드아웃 적용', () => {
    const { filter } = buildShortsFilter('blur-brand', { brand: 'X', durationSec: 29.583 });
    expect(filter).toContain('if(lt(t,25.083),1,if(lt(t,26.583),1-(t-25.083)/1.5,0))');
  });

  it('blur-brand: 브랜드 없으면 blur 와 동일(빈 워드마크 방지)', () => {
    const { flag, filter } = buildShortsFilter('blur-brand', {});
    expect(flag).toBe('-filter_complex');
    expect(filter).toBe(buildBlurFill(1080, 1920));
  });

  it('letterbox: -vf fit(decrease)+중앙 pad + 정적 워드마크(세로 긴 입력도 안전)', () => {
    const { flag, filter } = buildShortsFilter('letterbox', { brand: 'KOREA JINDO' });
    expect(flag).toBe('-vf');
    expect(filter).toContain('scale=1080:1920:force_original_aspect_ratio=decrease');
    expect(filter).toContain('pad=1080:1920:(1080-iw)/2:(1920-ih)/2:black');
    expect(filter).toContain("drawtext=fontfile=");
    expect(filter).toContain('fontsize=40');
    expect(filter).toContain('y=h-620');
  });

  it('letterbox: 브랜드 없으면 drawtext 없음', () => {
    const { filter } = buildShortsFilter('letterbox', {});
    expect(filter).not.toContain('drawtext');
  });

  it('heavy: 대조군 훅/캡션(기본값 + 재정의)', () => {
    const def = buildShortsFilter('heavy', {});
    expect(def.flag).toBe('-filter_complex');
    expect(def.filter).toContain('color=c=0x101418:s=1080x1920');
    expect(def.filter).toContain("text='이건 아무 개나 못 해'");
    expect(def.filter).toContain("text='충성심의 대명사, 진돗개'");
    const custom = buildShortsFilter('heavy', { hook: 'HOOK', caption: 'CAP' });
    expect(custom.filter).toContain("text='HOOK'");
    expect(custom.filter).toContain("text='CAP'");
  });
});

describe('buildShortsArgs', () => {
  it('crop: -vf + libx264 crf18 yuv420p faststart aac192k', () => {
    const args = buildShortsArgs('in.mp4', 'out.mp4', 'crop');
    expect(args.slice(0, 5)).toEqual([
      '-y', '-i', 'in.mp4', '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
    ]);
    const joined = args.join(' ');
    expect(joined).toContain('-c:v libx264 -profile:v high -pix_fmt yuv420p -preset medium -crf 18');
    expect(joined).toContain('-c:a aac -b:a 192k -movflags +faststart out.mp4');
  });

  it('blur-brand: -filter_complex 로 필터 전달', () => {
    const args = buildShortsArgs('in.mp4', 'out.mp4', 'blur-brand', { brand: 'B' });
    expect(args).toContain('-filter_complex');
    expect(args).not.toContain('-vf');
  });
});
