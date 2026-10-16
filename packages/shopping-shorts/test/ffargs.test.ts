import { describe, expect, it } from 'vitest';
import type { ShoppingShortsAssembleSpec } from '@cak/contracts';
import { audioPadCapSec, audioPadTail, buildAssembleArgs, buildSyncedAssembleArgs, cuesFromBeats, escapeDrawtext, segmentLengthSec, type SyncedSegment } from '../src/core/ffargs.js';

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
      expect(f).toMatch(/asetpts=N\/SR\/TB,apad(=whole_dur=\d+\.\d{3})?\[aout\]/);
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

/** 필터 그래프에서 [aout] 을 만드는 마지막 사슬. */
function audioTailOf(f: string): string {
  const chains = f.split(';').filter((c) => c.endsWith('[aout]'));
  expect(chains).toHaveLength(1);
  return chains[0]!;
}

/** 상한 없는 apad(옵션 없는 apad 필터 토큰) — 무한 패딩. 파일 경로 속 글자 "apad" 는 제외. */
const UNBOUNDED_APAD = /(?:^|[,;\]])apad(?:$|[,;[])/;

describe('오디오 끝 패딩 — 무한 apad + -shortest 의 ENOSPC(exit 228) 방지', () => {
  it('audioPadCapSec = 영상 기준 길이 + 1 s + 조각 수/15 s', () => {
    expect(audioPadCapSec(17.65, 5)).toBeCloseTo(18.98333, 5);
    expect(audioPadCapSec(3, 2)).toBeCloseTo(4.13333, 5);
  });

  it('audioPadTail: 상한이 있으면 pts 재매김 + whole_dur(밀리초 3자리), 없으면 pts 재매김 + apad', () => {
    expect(audioPadTail(18.983333)).toBe('asetpts=N/SR/TB,apad=whole_dur=18.983');
    expect(audioPadTail()).toBe('asetpts=N/SR/TB,apad');
  });

  it('audioPadTail: 상한이 유한한 양수가 아니면 던진다', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => audioPadTail(bad)).toThrow();
    }
  });

  it('legacy: padCapSec 를 주면 세 분기 모두 상한 패딩, 무한 apad 가 없다', () => {
    for (const s of [
      spec({ narrationAudio: 'vo.mp3' }),
      spec({ music: 'bgm.mp3' }),
      spec({ narrationAudio: 'vo.mp3', music: 'bgm.mp3' }),
    ]) {
      const f = filterOf(buildAssembleArgs(s, 'out.mp4', { padCapSec: audioPadCapSec(3, 2) }));
      expect(audioTailOf(f)).toMatch(/,asetpts=N\/SR\/TB,apad=whole_dur=4\.133\[aout\]$/);
      expect(f).not.toMatch(UNBOUNDED_APAD);
    }
  });

  it('legacy: padCapSec 가 없으면 pts 재매김 + 상한 없는 apad(이전 호출자 호환)', () => {
    const f = filterOf(buildAssembleArgs(spec({ narrationAudio: 'vo.mp3', music: 'bgm.mp3' }), 'out.mp4'));
    expect(audioTailOf(f)).toBe('[an][am]amix=inputs=2:duration=longest:dropout_transition=2,asetpts=N/SR/TB,apad[aout]');
    expect(f).toMatch(UNBOUNDED_APAD); // 양성 대조 — 검사식이 옵션 없는 apad 를 실제로 잡는다(not.toMatch 단언들의 근거)
  });

  it('legacy: 오디오가 없으면 패딩 사슬도 없다', () => {
    const f = filterOf(buildAssembleArgs(spec(), 'out.mp4', { padCapSec: 4 }));
    expect(f).not.toContain('apad');
    expect(f).not.toContain('asetpts');
  });

  it('legacy: 오디오가 없으면 padCapSec 를 보지 않는다(0·NaN 이어도 던지지 않음), 오디오가 있으면 그 값을 검사한다', () => {
    for (const bad of [0, -1, Number.NaN]) {
      const f = filterOf(buildAssembleArgs(spec(), 'out.mp4', { padCapSec: bad }));
      expect(f).not.toContain('apad');
      expect(() => buildAssembleArgs(spec({ narrationAudio: 'vo.mp3' }), 'out.mp4', { padCapSec: bad })).toThrow();
    }
  });

  const seg = (narrationDurationSec: number, clipDurationSec = 5.04): SyncedSegment => ({
    clip: 'c.mp4', clipDurationSec, narrationFile: 'n.mp3', narrationDurationSec,
  });
  const base = { width: 1080, height: 1920, disclosureOverlay: false };

  it('synced 트랙 1개: [na0] 뒤 상한 패딩 = 타임라인 total(3.8+0.35+0.6) + 1 + 1/15', () => {
    const f = filterOf(buildSyncedAssembleArgs([seg(3.8)], 'out.mp4', base));
    expect(audioTailOf(f)).toBe('[na0]asetpts=N/SR/TB,apad=whole_dur=5.817[aout]');
    expect(f).not.toMatch(UNBOUNDED_APAD);
  });

  it('synced 트랙 2개 이상: amix 뒤 상한 패딩, BGM atrim 값 = 영상 타임라인 total', () => {
    const f = filterOf(buildSyncedAssembleArgs([seg(3.8), seg(3.8)], 'out.mp4', { ...base, music: 'bgm.mp3' }));
    // total = 4.15 + (4.15 + 0.6) = 8.9 → 상한 8.9 + 1 + 2/15 = 10.033
    expect(f).toContain('atrim=0:8.900[mus]');
    expect(audioTailOf(f)).toBe(
      '[na0][na1][mus]amix=inputs=3:duration=longest:normalize=0,asetpts=N/SR/TB,apad=whole_dur=10.033[aout]',
    );
    expect(f).not.toMatch(UNBOUNDED_APAD);
    expect(buildSyncedAssembleArgs([seg(3.8), seg(3.8)], 'out.mp4', base)).toContain('-shortest');
  });

  it('synced: 상한이 영상 그래프의 세그먼트 길이 합(=영상 길이 기준)에서 나오고, 프레임 올림을 더한 영상 길이보다 길다', () => {
    const cases: SyncedSegment[][] = [
      [seg(0.9, 1.5), seg(0.85, 1.5)],
      [seg(2.6, 5), seg(3.4, 5), seg(3.8, 5), seg(3.1, 5), seg(2.4, 5)],
      [seg(7, 5.04), { clip: 'c.mp4', clipDurationSec: 2.27 }, seg(1.234, 9.99)],
      Array.from({ length: 30 }, (_, i) => seg(0.5 + (i % 7) * 0.37, 1 + (i % 5))),
    ];
    for (const segs of cases) {
      const f = filterOf(buildSyncedAssembleArgs(segs, 'out.mp4', base));
      // 영상 그래프가 쓰는 세그먼트 길이: trim 이면 그 값, 아니면 클립 길이 + tpad 홀드
      const lens = segs.map((s, i) => {
        const chain = f.split(';').find((c) => c.startsWith(`[${i}:v]`))!;
        const trim = /trim=duration=([\d.]+)/.exec(chain);
        const hold = /stop_duration=([\d.]+)/.exec(chain);
        return trim ? Number(trim[1]) : s.clipDurationSec + (hold ? Number(hold[1]) : 0);
      });
      const videoBase = lens.reduce((a, b) => a + b, 0);
      const cap = Number(/whole_dur=([\d.]+)\[aout\]/.exec(f)![1]);
      expect(cap).toBeCloseTo(audioPadCapSec(videoBase, segs.length), 2);
      // 세그먼트마다 fps 30 올림이 최대 1 프레임씩 붙어도(실측 17.65 → 17.733) 상한이 더 길다
      const worstVideo = lens.reduce((a, l) => a + (Math.ceil(l * 30) + 1) / 30, 0);
      expect(cap).toBeGreaterThan(worstVideo);
    }
  });
});
