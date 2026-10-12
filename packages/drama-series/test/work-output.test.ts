import { afterEach, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { keyframeContext } from './keyframe-fixture.js';
import { acquireEpisodeLock } from '../src/adapters/episode-lock.js';
import { transcribe } from '../src/adapters/transcribe/whisper.js';
import { assembleEpisode } from '../src/adapters/assemble.js';
import { runFfmpeg } from '../src/adapters/ffmpeg.js';

vi.mock('../src/adapters/ffmpeg.js', () => ({
  FfmpegError: class extends Error {},
  hasAudio: vi.fn(() => true), probeDuration: vi.fn(() => 5), runFfmpeg: vi.fn(),
}));
const dirs: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'work-output-'));
  dirs.push(dir);
  const bin = join(dir, 'bin'), marker = join(dir, 'called.json');
  mkdirSync(bin);
  // 실제 모델 대신 동일한 출력 이름을 쓰는 로컬 stub만 실행한다.
  writeFileSync(join(bin, 'whisper'), `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const args = process.argv.slice(2), work = args[args.indexOf('--output_dir') + 1];
fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({work}));
const mode = process.env.DRAMA_WHISPER_TEST_MODE;
if (mode === 'fail') process.exit(7);
fs.writeFileSync(path.join(work, path.basename(args[0], path.extname(args[0])) + '.json'), mode === 'invalid' ? '{}' : JSON.stringify({text:' 합성 시험 '}));
`, { mode: 0o700 });
  vi.stubEnv('PATH', `${bin}:${process.env.PATH}`);
  return { dir, marker };
}

it.each(['episode', 'sidecar', 'NFD episode', 'NFD sidecar'])('verify-clip: %s 충돌은 외부 호출 전에 거부하고 바이트를 보존한다', kind => {
  const { dir, marker } = setup(), ctx = keyframeContext();
  const folder = join(dir, '한글 작업'); mkdirSync(folder);
  const episode = join(folder, '회차.json'), series = join(dir, 'series.json');
  writeFileSync(episode, JSON.stringify(ctx.episode)); writeFileSync(series, JSON.stringify(ctx.series));
  acquireEpisodeLock(episode, { agent: 'codex', session: 'A' }, 0);
  const original = readFileSync(episode), lock = readFileSync(episode + '.lock.json');
  let work = folder, media = join(dir, kind.includes('sidecar') ? '회차.json.lock.wav' : '회차.wav');
  if (kind.startsWith('NFD')) { work = work.normalize('NFD'); media = media.normalize('NFD'); }
  // macOS에서는 실제 NFD 별칭, 정규화를 구분하는 FS에서는 동일 파일의 symlink 별칭.
  if (!existsSync(work)) symlinkSync(folder, work);
  const target = join(work, basename(media, extname(media)) + '.json');
  if (!existsSync(target)) symlinkSync(kind.includes('sidecar') ? episode + '.lock.json' : episode, target);
  const targetBefore = readFileSync(target);
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli/index.ts', 'verify-clip', '--series', series, '--episode', episode, '--cut', 'c1', '--gates', join(dir, 'gates'), '--media', media, '--work', work], { encoding: 'utf8', timeout: 15000 });
  expect(result.error).toBeUndefined(); expect(result.signal).toBeNull();
  expect({ status: result.status, called: existsSync(marker), episode: readFileSync(episode).equals(original), lock: readFileSync(episode + '.lock.json').equals(lock), target: readFileSync(target).equals(targetBefore) })
    .toEqual({ status: 1, called: false, episode: true, lock: true, target: true });
  expect(result.stdout).toMatch(/보호|shot-v1|링크/);
  expect(existsSync(join(dir, 'gates'))).toBe(false);
});

it.each(['ok', 'fail', 'invalid'])('Whisper %s 결과도 개별 임시 디렉터리를 정리한다', mode => {
  const { dir, marker } = setup(), work = join(dir, 'work'); mkdirSync(work);
  const sentinel = join(work, 'clip.json'); writeFileSync(sentinel, '기존 출력 보존');
  vi.stubEnv('DRAMA_WHISPER_TEST_MODE', mode);
  if (mode === 'ok') expect(transcribe(join(dir, 'clip.wav'), work)).toBe('합성 시험');
  else expect(() => transcribe(join(dir, 'clip.wav'), work)).toThrow();
  const outputDir = JSON.parse(readFileSync(marker, 'utf8')).work;
  expect(outputDir).not.toBe(work); expect(existsSync(outputDir)).toBe(false);
  expect(readFileSync(sentinel, 'utf8')).toBe('기존 출력 보존');
  expect(readdirSync(work)).toEqual(['clip.json']);
});

it.each(['cue-0.txt', 'ai-label.txt', 'title.txt', 'kicker.txt'])('assemble 파생 %s는 잠긴 회차를 덮지 않는다', name => {
  const { dir } = setup(), ctx = keyframeContext(), target = join(dir, name);
  writeFileSync(target, JSON.stringify(ctx.episode)); acquireEpisodeLock(target, { agent: 'codex', session: 'A' }, 0);
  const before = readFileSync(target), lock = readFileSync(target + '.lock.json');
  delete ctx.episode.shotPolicy;
  ctx.episode.cuts[0]!.caption = '시험';
  const clip = join(dir, 'clip.mp4'); writeFileSync(clip, 'stub');
  // ffmpeg는 mock이므로 일반 파일 stub을 폰트에도 쓰고 출력 보호까지 도달시킨다.
  expect(() => assembleEpisode({ episode: ctx.episode, clipFiles: { c1: clip }, out: join(dir, 'out.mp4'), fontFile: clip, workDir: dir, aiLabel: '시험', title: '시험', kicker: '시험' })).toThrow(/보호|shot-v1/);
  expect(runFfmpeg).not.toHaveBeenCalled();
  expect(readFileSync(target)).toEqual(before); expect(readFileSync(target + '.lock.json')).toEqual(lock);
});
