import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEpisode } from '../src/core/model.js';
import { buildAssembleArgs, cuesFromEpisode, escapeFilterValue, prependColdOpen } from '../src/core/assemble-args.js';
import { assembleEpisode } from '../src/adapters/assemble.js';
import { ffmpegAvailable, hasAudio, probeDuration, runFfmpeg } from '../src/adapters/ffmpeg.js';

const fx = (name: string): any => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const FONT = '/System/Library/Fonts/AppleSDGothicNeo.ttc';

describe('assemble args', () => {
  it('escapes filter values', () => {
    expect(escapeFilterValue("/a:b/it's")).toBe("/a\\:b/it\\'s");
  });
  it('places caption on top and spreads lines inside their cut window', () => {
    const cues = cuesFromEpisode(parseEpisode(fx('episode.json')), [10, 10, 10, 6]);
    expect(cues).toHaveLength(6);
    expect(cues[0]).toMatchObject({ position: 'top', text: '새벽 2시, 경기 남부 물류센터' });
    expect(cues[1]).toMatchObject({ startSec: 10.2, endSec: 14.9, position: 'bottom' });
    expect(cues[2]).toMatchObject({ startSec: 15.2, endSec: 19.9 });
  });
  it('builds a concat graph with flash fade, loudnorm and AI label', () => {
    const args = buildAssembleArgs({
      clips: [{ file: 'a.mp4', durationSec: 4, transitionIn: 'cut' }, { file: 'b.mp4', durationSec: 4, transitionIn: 'flash' }],
      cues: [{ startSec: 0.2, endSec: 3.9, textFile: '/w/cue-0.txt', position: 'bottom' }],
      aiLabelFile: '/w/ai.txt', fontFile: FONT, out: 'o.mp4', width: 1280, height: 720, fps: 24,
    });
    const graph = args[args.indexOf('-filter_complex') + 1]!;
    expect(graph).toContain('concat=n=2:v=1:a=1[vc][ac]');
    expect(graph).toContain('fade=t=in:st=0:d=0.4:color=white[v1]');
    expect(graph).toContain("enable='lt(t,2)'");
    expect(graph).toContain('loudnorm=I=-14');
    expect(graph.match(/drawtext=/g)!.length).toBe(graph.match(/expansion=none/g)!.length);
    expect(args.at(-1)).toBe('o.mp4');
  });
  it('builds a vertical blur-fill layout with a pinned title and subtitles outside the picture band', () => {
    const args = buildAssembleArgs({
      clips: [{ file: 'a.mp4', durationSec: 4, transitionIn: 'cut' }],
      cues: [
        { startSec: 0.2, endSec: 3.9, textFile: '/w/cue-0.txt', position: 'bottom' },
        { startSec: 0.2, endSec: 2.9, textFile: '/w/cue-1.txt', position: 'top' },
      ],
      aiLabelFile: null, titleFile: '/w/title.txt', layout: 'blur-fill', fontFile: FONT, out: 'o.mp4', width: 1080, height: 1920, fps: 24,
    });
    const graph = args[args.indexOf('-filter_complex') + 1]!;
    expect(graph).toContain('boxblur');
    expect(graph).toContain('overlay=(W-w)/2:(H-h)/2');
    expect(graph).toContain("textfile='/w/title.txt'");
    // 가로 1080 의 16:9 화면 띠는 세로 656~1264 — 자막은 그 아래, 캡션은 그 위
    expect(graph).toMatch(/cue-0\.txt'[^\[]*:y=13\d\d/);
    expect(graph).toMatch(/cue-1\.txt'[^\[]*:y=[45]\d\d:/);
    // 세로 화면 글자 크기는 가로폭 기준(한 줄 20자가 1080 안에 들어가야 함)
    expect(graph).toContain('fontsize=54');
  });
  it('shrinks a long cue so it fits the frame width', () => {
    const args = buildAssembleArgs({
      clips: [{ file: 'a.mp4', durationSec: 4, transitionIn: 'cut' }],
      cues: [{ startSec: 0.2, endSec: 2.9, textFile: '/w/cue-0.txt', position: 'top', chars: 27 }],
      aiLabelFile: null, layout: 'blur-fill', fontFile: FONT, out: 'o.mp4', width: 1080, height: 1920, fps: 24,
    });
    const graph = args[args.indexOf('-filter_complex') + 1]!;
    const size = Number(/cue-0\.txt':fontsize=(\d+)/.exec(graph)![1]);
    expect(size * 27).toBeLessThanOrEqual(1080 * 0.92);
  });
  it('applies per-role text styles (title font/colour, subtitle font, caption box, kicker above title)', () => {
    const args = buildAssembleArgs({
      clips: [{ file: 'a.mp4', durationSec: 4, transitionIn: 'cut' }],
      cues: [
        { startSec: 0.2, endSec: 3.9, textFile: '/w/cue-0.txt', position: 'bottom' },
        { startSec: 0.2, endSec: 2.9, textFile: '/w/cue-1.txt', position: 'top' },
      ],
      aiLabelFile: null, titleFile: '/w/title.txt', kickerFile: '/w/kicker.txt', layout: 'blur-fill', fontFile: FONT, out: 'o.mp4', width: 1080, height: 1920, fps: 24,
      styles: {
        title: { fontFile: '/f/BlackHanSans.ttf', color: '#FFE14D', borderW: 8, shadow: true },
        kicker: { fontFile: '/f/Pretendard-SemiBold.otf', color: 'white' },
        subtitle: { fontFile: '/f/Pretendard-ExtraBold.otf', borderW: 6 },
        caption: { fontFile: '/f/Pretendard-SemiBold.otf', box: { color: 'black@0.55', pad: 14 } },
      },
    });
    const graph = args[args.indexOf('-filter_complex') + 1]!;
    const seg = (file: string) => graph.split(';').find((x) => x.includes(file))!;
    expect(seg('title.txt')).toContain("fontfile='/f/BlackHanSans.ttf'");
    expect(seg('title.txt')).toContain('fontcolor=#FFE14D');
    expect(seg('title.txt')).toContain('borderw=8');
    expect(seg('title.txt')).toContain('shadowx=');
    expect(seg('cue-0.txt')).toContain("fontfile='/f/Pretendard-ExtraBold.otf'");
    expect(seg('cue-0.txt')).toContain('borderw=6');
    expect(seg('cue-1.txt')).toContain('box=1:boxcolor=black@0.55:boxborderw=14');
    const y = (file: string) => Number(/:y=(\d+)/.exec(seg(file))![1]);
    expect(y('kicker.txt')).toBeLessThan(y('title.txt'));
  });
  it('trims a clip input for a cold open', () => {
    const args = buildAssembleArgs({
      clips: [{ file: 'c7.mp4', durationSec: 2, transitionIn: 'cut', trimStartSec: 3.5 }, { file: 'c1.mp4', durationSec: 10, transitionIn: 'flash' }],
      cues: [], aiLabelFile: null, fontFile: FONT, out: 'o.mp4', width: 1280, height: 720, fps: 24,
    });
    const i = args.indexOf('c7.mp4');
    expect(args.slice(i - 5, i + 1)).toEqual(['-ss', '3.5', '-t', '2', '-i', 'c7.mp4']);
    expect(args.slice(args.indexOf('c1.mp4') - 1, args.indexOf('c1.mp4') + 1)).toEqual(['-i', 'c1.mp4']);
  });
  it('shifts episode cues after a cold open and adds its caption', () => {
    const bottom = { startSec: 0.2, endSec: 4.9, text: '민재 씨', position: 'bottom' as const };
    // 첫 컷 장면 자막이 있으면 콜드 오픈 자막과 합쳐 한 줄로(같은 자리에 겹치지 않게)
    const merged = prependColdOpen([{ startSec: 0.2, endSec: 2.9, text: '새벽 2시 20분', position: 'top' }, bottom], 2, '10분 전');
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ text: '10분 전 · 새벽 2시 20분', position: 'top', startSec: 2.2, endSec: 4.9 });
    expect(merged[1]).toMatchObject({ text: '민재 씨', startSec: 2.2, endSec: 6.9 });
    const alone = prependColdOpen([bottom], 2, '10분 전');
    expect(alone[0]).toMatchObject({ text: '10분 전', position: 'top', startSec: 2.1, endSec: 4.6 });
  });
  it('refuses an empty clip list', () => {
    expect(() => buildAssembleArgs({ clips: [], cues: [], aiLabelFile: null, fontFile: FONT, out: 'o.mp4', width: 1, height: 1, fps: 24 })).toThrow();
  });
});

describe.skipIf(!ffmpegAvailable() || !existsSync(FONT))('assemble with real ffmpeg', () => {
  it('joins two generated clips into one video with audio', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drama-assemble-'));
    for (const id of ['a', 'b'])
      runFfmpeg(['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-shortest', '-c:v', 'libx264', '-c:a', 'aac', join(dir, `${id}.mp4`)]);
    const episode = parseEpisode({
      seriesId: 't', no: 1, title: 't',
      cuts: [
        { id: 'a', locationId: 'x', durationSec: 4, cast: [], action: '테스트 장면', visualEn: 'test visual text', lines: [{ speaker: 's', text: '안녕하세요', kind: 'dialogue', verification: { status: 'verified' } }] },
        { id: 'b', locationId: 'x', durationSec: 4, cast: [], action: '테스트 장면', visualEn: 'test visual text', transitionIn: 'flash', caption: '2화에서 계속', lines: [] },
      ],
    });
    const r = assembleEpisode({ episode, clipFiles: { a: join(dir, 'a.mp4'), b: join(dir, 'b.mp4') }, out: join(dir, 'out', 'ep.mp4'), fontFile: FONT, workDir: join(dir, 'work'), aiLabel: 'AI로 생성된 영상입니다', width: 640, height: 360 });
    expect(r.durationSec).toBeGreaterThan(7.7);
    expect(r.durationSec).toBeLessThan(8.3);
    expect(r.cues).toBe(2);
    expect(hasAudio(r.out)).toBe(true);
    expect(probeDuration(r.out)).toBeCloseTo(r.durationSec, 1);
  });
  it('refuses a missing clip instead of skipping it', () => {
    const episode = parseEpisode({ seriesId: 't', no: 1, title: 't', cuts: [{ id: 'z', locationId: 'x', durationSec: 4, cast: [], action: '테스트 장면', visualEn: 'test visual text', lines: [] }] });
    expect(() => assembleEpisode({ episode, clipFiles: {}, out: '/tmp/never.mp4', fontFile: FONT, workDir: '/tmp/never', aiLabel: null })).toThrow(/클립 파일 없음: z/);
  });
});
