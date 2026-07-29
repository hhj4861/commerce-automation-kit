import { describe, expect, it } from 'vitest';
import type { ShoppingShortsAssembleSpec } from '@cak/contracts';
import { buildAssembleArgs, buildSyncedAssembleArgs, cuesFromBeats, escapeDrawtext, segmentLengthSec, type SyncedSegment } from '../src/core/ffargs.js';

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

describe('동기 조립 — 세그먼트 길이(무음 공백 제거)', () => {
  const seg = (over: Partial<SyncedSegment> = {}): SyncedSegment => ({
    clip: 'c.mp4',
    clipDurationSec: 5.04,
    narrationFile: 'n.mp3',
    narrationDurationSec: 3.8,
    ...over,
  });

  it('내레이션이 있으면 클립이 길어도 내레이션+패딩으로 맞춘다(공백 제거)', () => {
    expect(segmentLengthSec(seg())).toBeCloseTo(3.8 + 0.35, 5);
  });

  it('내레이션이 클립보다 길면 내레이션+패딩(기존 TTS 중복 방지 유지)', () => {
    expect(segmentLengthSec(seg({ narrationDurationSec: 7 }))).toBeCloseTo(7.35, 5);
  });

  it('내레이션이 없으면 클립 길이 그대로', () => {
    const s = seg();
    delete s.narrationFile;
    delete s.narrationDurationSec;
    expect(segmentLengthSec(s)).toBeCloseTo(5.04, 5);
  });

  it('클립이 세그먼트보다 길면 trim, 짧으면 tpad 홀드가 필터에 들어간다', () => {
    const f = filterOf(
      buildSyncedAssembleArgs(
        [seg(), seg({ narrationDurationSec: 7 })],
        'out.mp4',
        { width: 1080, height: 1920, disclosureOverlay: false, endHoldSec: 0 },
      ),
    );
    expect(f).toContain('[0:v]');
    expect(f).toMatch(/\[0:v\][^;]*trim=duration=4\.150/);
    expect(f).not.toMatch(/\[0:v\][^;]*tpad/);
    expect(f).toMatch(/\[1:v\][^;]*tpad=stop_mode=clone:stop_duration=2\.310/);
    expect(f).not.toMatch(/\[1:v\][^;]*trim=duration/);
  });

  it('마지막 세그먼트만 endHoldSec 여운이 붙는다(기본 0.6)', () => {
    const f = filterOf(
      buildSyncedAssembleArgs([seg(), seg()], 'out.mp4', {
        width: 1080, height: 1920, disclosureOverlay: false,
      }),
    );
    // 첫 세그먼트 = 4.15s trim, 마지막 = 4.15+0.6 = 4.75s trim
    expect(f).toMatch(/\[0:v\][^;]*trim=duration=4\.150/);
    expect(f).toMatch(/\[1:v\][^;]*trim=duration=4\.750/);
  });

  it('내레이션 adelay 오프셋이 새 세그먼트 길이 기준으로 계산된다', () => {
    const f = filterOf(
      buildSyncedAssembleArgs([seg(), seg()], 'out.mp4', {
        width: 1080, height: 1920, disclosureOverlay: false, endHoldSec: 0,
      }),
    );
    expect(f).toContain('adelay=0|0');
    expect(f).toContain('adelay=4150|4150'); // 두 번째 내레이션 = 첫 세그먼트 끝(4.15s)
  });
});

describe('동기 조립 — 자막 아웃라인(글자 깨짐 방지)', () => {
  it('borderw 대신 8방향 검정 오프셋 + 흰 본문으로 그린다', () => {
    const f = filterOf(
      buildSyncedAssembleArgs(
        [{
          clip: 'c.mp4', clipDurationSec: 5, narrationFile: 'n.mp3', narrationDurationSec: 4,
          subtitles: [{ file: 'cap.txt', startSec: 0, endSec: 4 }],
        }],
        'out.mp4',
        { width: 1080, height: 1920, disclosureOverlay: false },
      ),
    );
    const black = (f.match(/fontcolor=black/g) ?? []).length;
    const white = (f.match(/textfile=cap\.txt[^;]*fontcolor=white/g) ?? []).length;
    expect(black).toBe(8);
    expect(white).toBe(1);
    expect(f).not.toContain('borderw'); // stroker 미사용(잎·얇 속공간 뭉개짐 방지)
  });
});
