import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEpisode } from '../src/core/model.js';
import { buildAssembleArgs, cuesFromEpisode, escapeFilterValue } from '../src/core/assemble-args.js';
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
