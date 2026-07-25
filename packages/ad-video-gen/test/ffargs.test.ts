/**
 * ffmpeg 인자 빌더 테스트 — spawn 없이 순수 함수만. 실측 패턴의 핵심 토큰 고정.
 */
import { describe, it, expect } from 'vitest';
import {
  buildConcatArgs,
  buildDrawtextFilter,
  buildGridArgs,
  buildMixVoArgs,
  buildPosterArgs,
  buildProbeArgs,
  buildSpliceArgs,
  buildSpliceFilter,
  buildTitleArgs,
  DEFAULT_FONT_FILE,
} from '../src/core/ffargs.js';

describe('buildProbeArgs', () => {
  it('스트림 width/height/duration 을 JSON 으로 요청', () => {
    expect(buildProbeArgs('in.mp4')).toEqual([
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,duration',
      '-of', 'json',
      'in.mp4',
    ]);
  });
});

describe('buildPosterArgs', () => {
  it('-ss 지점에서 1프레임 q:v 3', () => {
    expect(buildPosterArgs('in.mp4', 13.5, 'p.jpg')).toEqual([
      '-y', '-ss', '13.5', '-i', 'in.mp4', '-frames:v', '1', '-q:v', '3', 'p.jpg',
    ]);
  });
});

describe('buildGridArgs', () => {
  it('기본 4장 → 2x2 타일, fps 기반 select', () => {
    const args = buildGridArgs('in.mp4', 'g.png');
    const vf = args[args.indexOf('-vf') + 1]!;
    expect(vf).toContain('fps=1/4');
    expect(vf).toContain('tile=2x2');
    expect(vf).toContain('scale=480:-1');
    expect(args).toContain('-frames:v');
  });

  it('count=9 → 3x3', () => {
    const args = buildGridArgs('in.mp4', 'g.png', { count: 9, intervalSec: 2 });
    const vf = args[args.indexOf('-vf') + 1]!;
    expect(vf).toContain('tile=3x3');
    expect(vf).toContain('fps=1/2');
  });
});

describe('buildTitleArgs / buildDrawtextFilter', () => {
  it('drawtext 페이드인 alpha 식이 실측 패턴 그대로다', () => {
    const f = buildDrawtextFilter({ text: 'KOREA JINDO', fadeInAt: 26.5 });
    expect(f).toContain("alpha='if(lt(t,26.5),0,if(lt(t,27.5),t-26.5,1))'");
    expect(f).toContain('fontcolor=white');
    expect(f).toContain('shadowcolor=black@0.35');
    expect(f).toContain('fontsize=88');
    expect(f).toContain('y=h-190');
    expect(f).toContain(`fontfile=${DEFAULT_FONT_FILE}`);
  });

  it('fontFile/fontSize/yOffset 재정의 가능', () => {
    const f = buildDrawtextFilter({ text: 'T', fadeInAt: 1, fontFile: '/x/f.ttf', fontSize: 40, yOffset: 100 });
    expect(f).toContain('fontfile=/x/f.ttf');
    expect(f).toContain('fontsize=40');
    expect(f).toContain('y=h-100');
  });

  it('title 인자는 재인코딩(crf 18) + 오디오 copy', () => {
    const args = buildTitleArgs('in.mp4', 'out.mp4', { text: 'T', fadeInAt: 2 });
    expect(args).toContain('-vf');
    expect(args.join(' ')).toContain('-c:v libx264 -crf 18 -preset medium -c:a copy');
  });
});

describe('buildConcatArgs', () => {
  it('concat demuxer + libx264 crf18 + aac 192k', () => {
    const args = buildConcatArgs('list.txt', 'out.mp4');
    expect(args.join(' ')).toBe(
      '-y -f concat -safe 0 -i list.txt -c:v libx264 -crf 18 -preset medium -c:a aac -b:a 192k out.mp4',
    );
  });
});

describe('buildSpliceFilter / buildSpliceArgs', () => {
  it('base[0..cut]+insert+base[resume..끝] 을 concat=n=3 으로 잇는다', () => {
    const f = buildSpliceFilter({ baseDur: 30, cutAt: 9.5, resumeAt: 10 });
    expect(f).toContain('[0:v]trim=0:9.5,setpts=PTS-STARTPTS[v0]');
    expect(f).toContain('[0:a]atrim=0:9.5,asetpts=PTS-STARTPTS[a0]');
    expect(f).toContain('[1:v]setpts=PTS-STARTPTS[v1]');
    expect(f).toContain('[0:v]trim=10:30,setpts=PTS-STARTPTS[v2]');
    expect(f).toContain('[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[v][a]');
  });

  it('baseDur 생략 시 open-ended trim', () => {
    const f = buildSpliceFilter({ cutAt: 5, resumeAt: 6 });
    expect(f).toContain('trim=start=6');
    expect(f).toContain('atrim=start=6');
  });

  it('완성 인자: 두 입력 + filter_complex + [v][a] 매핑', () => {
    const args = buildSpliceArgs('base.mp4', 'ins.mp4', 'out.mp4', { cutAt: 9.5, resumeAt: 10, baseDur: 30 });
    expect(args.slice(0, 5)).toEqual(['-y', '-i', 'base.mp4', '-i', 'ins.mp4']);
    expect(args).toContain('-filter_complex');
    const joined = args.join(' ');
    expect(joined).toContain('-map [v] -map [a]');
    expect(joined).toContain('-c:v libx264 -crf 18');
  });

  it('title 옵션이 있으면 [v]에 drawtext 를 얹고 [vt] 로 매핑', () => {
    const args = buildSpliceArgs('b.mp4', 'i.mp4', 'o.mp4', {
      cutAt: 2, resumeAt: 3, title: { text: 'KOREA JINDO', fadeInAt: 26.5 },
    });
    const filter = args[args.indexOf('-filter_complex') + 1]!;
    expect(filter).toContain(';[v]drawtext=');
    expect(filter).toContain('[vt]');
    expect(args.join(' ')).toContain('-map [vt] -map [a]');
  });
});

describe('buildMixVoArgs', () => {
  it('amix 실측 패턴: bg volume + adelay|양채널 + duration=first', () => {
    const args = buildMixVoArgs('v.mp4', 'vo.wav', 'out.mp4');
    const filter = args[args.indexOf('-filter_complex') + 1]!;
    expect(filter).toBe(
      '[0:a]volume=0.32[bg];[1:a]adelay=900|900,volume=1.5[vo];[bg][vo]amix=inputs=2:duration=first:dropout_transition=2[a]',
    );
    const joined = args.join(' ');
    expect(joined).toContain('-map 0:v -map [a]');
    expect(joined).toContain('-c:v copy -c:a aac -b:a 192k');
  });

  it('볼륨·딜레이 재정의 가능', () => {
    const args = buildMixVoArgs('v.mp4', 'vo.wav', 'o.mp4', { bgVol: 0.2, voVol: 2, delayMs: 500 });
    const filter = args[args.indexOf('-filter_complex') + 1]!;
    expect(filter).toContain('volume=0.2[bg]');
    expect(filter).toContain('adelay=500|500,volume=2[vo]');
  });
});
