import { describe, expect, it } from 'vitest';
import type { ShoppingShortsAssembleSpec } from '@cak/contracts';
import { buildAssembleArgs, cuesFromBeats, escapeDrawtext } from '../src/core/ffargs.js';

function spec(over: Partial<ShoppingShortsAssembleSpec> = {}): ShoppingShortsAssembleSpec {
  return {
    clips: ['a.mp4', 'b.mp4'],
    captions: [{ text: '건조 공간 부족?', startSec: 0, endSec: 3 }],
    width: 1080,
    height: 1920,
    disclosureOverlay: false,
    ...over,
  };
}

function filterOf(args: string[]): string {
  const i = args.indexOf('-filter_complex');
  expect(i).toBeGreaterThan(-1);
  return args[i + 1]!;
}

describe('buildAssembleArgs', () => {
  it('클립이 없으면 던진다', () => {
    expect(() => buildAssembleArgs(spec({ clips: [] }), 'out.mp4')).toThrow();
  });

  it('클립 수만큼 커버 스케일·크롭 후 concat', () => {
    const f = filterOf(buildAssembleArgs(spec(), 'out.mp4'));
    expect(f).toContain('force_original_aspect_ratio=increase');
    expect(f).toContain('crop=1080:1920');
    expect(f).toContain('concat=n=2:v=1:a=0[vc]');
  });

  it('자막은 enable=between 구간 번인', () => {
    const f = filterOf(buildAssembleArgs(spec(), 'out.mp4'));
    expect(f).toContain("enable='between(t,0,3)'");
  });

  it('disclosureOverlay=true 면 고지 텍스트가 필터에 포함', () => {
    const f = filterOf(buildAssembleArgs(spec({ disclosureOverlay: true }), 'out.mp4'));
    expect(f).toContain('파트너스');
  });

  it('내레이션+음악이면 amix 더킹, 음악만이면 단독 볼륨', () => {
    const both = filterOf(
      buildAssembleArgs(spec({ narrationAudio: 'vo.mp3', music: 'bgm.mp3' }), 'out.mp4'),
    );
    expect(both).toContain('amix=inputs=2');
    expect(both).toContain('volume=0.22');

    const musicOnly = filterOf(buildAssembleArgs(spec({ music: 'bgm.mp3' }), 'out.mp4'));
    expect(musicOnly).toContain('volume=0.9');
    expect(musicOnly).not.toContain('amix');
  });

  it('오디오가 영상보다 짧아도 -shortest 가 영상을 자르지 않게 apad 가 붙는다 (POC 실측 결함 회귀)', () => {
    for (const s of [
      spec({ narrationAudio: 'vo.mp3' }),
      spec({ music: 'bgm.mp3' }),
      spec({ narrationAudio: 'vo.mp3', music: 'bgm.mp3' }),
    ]) {
      const f = filterOf(buildAssembleArgs(s, 'out.mp4'));
      expect(f).toMatch(/apad\[aout\]/);
    }
  });

  it('오디오가 없으면 -shortest·오디오 맵이 없다', () => {
    const args = buildAssembleArgs(spec(), 'out.mp4');
    expect(args).not.toContain('-shortest');
    expect(args.filter((a) => a === '-map')).toHaveLength(1);
  });

  it('오디오 입력 인덱스가 클립 수 뒤로 정확히 배치된다', () => {
    const f = filterOf(
      buildAssembleArgs(spec({ narrationAudio: 'vo.mp3', music: 'bgm.mp3' }), 'out.mp4'),
    );
    expect(f).toContain('[2:a]volume=1.0[an]');
    expect(f).toContain('[3:a]volume=0.22[am]');
  });
});

describe('cuesFromBeats', () => {
  it('누적 시각으로 타임라인을 만들고 빈 자막은 건너뛴다', () => {
    const cues = cuesFromBeats([
      { caption: 'A', durationSec: 3 },
      { caption: '  ', durationSec: 2 },
      { caption: 'B', durationSec: 4 },
    ]);
    expect(cues).toEqual([
      { text: 'A', startSec: 0, endSec: 3 },
      { text: 'B', startSec: 5, endSec: 9 },
    ]);
  });
});

describe('escapeDrawtext', () => {
  it('콜론·따옴표·퍼센트·쉼표를 이스케이프', () => {
    expect(escapeDrawtext("a:b'c%d,e")).toBe("a\\:b\\'c\\%d\\,e");
  });
});
