import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { loadAssembleStyles } from '../src/cli/assemble-style.js';
import { assembleEpisode, type AssembleEpisodeInput } from '../src/adapters/assemble.js';
import { hasAudio, probeDuration, runFfmpeg } from '../src/adapters/ffmpeg.js';
import { parseEpisode } from '../src/core/model.js';

vi.mock('../src/adapters/ffmpeg.js', () => ({
  FfmpegError: class extends Error {},
  hasAudio: vi.fn(() => true), probeDuration: vi.fn(() => 5), runFfmpeg: vi.fn(),
}));
const pkg = fileURLToPath(new URL('..', import.meta.url));
const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
const font = fileURLToPath(new URL('../assets/fonts/Pretendard-SemiBold.otf', import.meta.url));
const roles = ['title', 'kicker', 'subtitle', 'caption', 'label'] as const;
const dirs: string[] = [];
afterEach(() => {
  vi.clearAllMocks();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'drama-fonts-한글 작업-'));
  dirs.push(dir);
  return dir;
}
function input(dir: string): AssembleEpisodeInput {
  const episode = parseEpisode(JSON.parse(readFileSync(join(pkg, 'test/fixtures/episode.json'), 'utf8')));
  const clip = join(dir, 'clip.mp4'); writeFileSync(clip, 'stub');
  return { episode, clipFiles: Object.fromEntries(episode.cuts.map(c => [c.id, clip])),
    fontFile: font, out: join(dir, 'output', 'episode.mp4'), workDir: join(dir, 'work'),
    title: '제목', kicker: '머리말', aiLabel: 'AI 생성' };
}
describe('CLI style 파일 경로', () => {
  it.each(roles)('%s 상대 폰트를 공백·한글이 있는 style 폴더 기준으로 해석한다', role => {
    const dir = workspace(), styleFile = join(dir, '스타일.json');
    writeFileSync(styleFile, JSON.stringify({ [role]: { fontFile: '../글꼴 폴더/폰트.otf', color: 'white', scale: 0.85 } }));
    expect(loadAssembleStyles(styleFile)).toEqual({ [role]: {
      fontFile: join(dirname(dir), '글꼴 폴더/폰트.otf'), color: 'white', scale: 0.85,
    } });
  });
  it('절대경로와 fontFile이 없는 스타일을 그대로 보존한다', () => {
    const styleFile = join(workspace(), 'style.json');
    const styles = { title: { fontFile: '/한글 폴더/../원본.otf' }, subtitle: { color: 'yellow' } };
    writeFileSync(styleFile, JSON.stringify(styles));
    expect(loadAssembleStyles(styleFile)).toEqual(styles);
  });
  it('저장소 파일럿 style의 모든 폰트가 일반 파일이다', () => {
    const styles = loadAssembleStyles(fileURLToPath(new URL('../../../docs/videos/20261006-regression-pilot/shorts-style.json', import.meta.url)));
    expect(Object.keys(styles).sort()).toEqual(['caption', 'kicker', 'subtitle', 'title']);
    for (const style of Object.values(styles)) expect(statSync(style.fontFile!).isFile()).toBe(true);
  });
});
describe('조립 폰트 사전 검사', () => {
  it.each(['default', ...roles])('%s 누락 시 ffmpeg/ffprobe 호출과 출력 생성을 막는다', role => {
    const dir = workspace(), args = input(dir), missing = join(dir, '없는 폰트.otf');
    if (role === 'default') args.fontFile = missing;
    else args.styles = { [role]: { fontFile: missing } };
    expect(() => assembleEpisode(args)).toThrow(`폰트 파일 없음 또는 일반 파일 아님: ${role} — ${missing}`);
    expect(hasAudio).not.toHaveBeenCalled(); expect(probeDuration).not.toHaveBeenCalled();
    expect(runFfmpeg).not.toHaveBeenCalled();
    expect(existsSync(args.workDir)).toBe(false); expect(existsSync(dirname(args.out))).toBe(false);
  });
  it('폰트 경로가 디렉터리여도 외부 호출과 쓰기 전에 거부한다', () => {
    const dir = workspace(), args = input(dir); args.styles = { title: { fontFile: dir } };
    expect(() => assembleEpisode(args)).toThrow(`title — ${dir}`);
    expect(hasAudio).not.toHaveBeenCalled(); expect(probeDuration).not.toHaveBeenCalled();
    expect(runFfmpeg).not.toHaveBeenCalled(); expect(existsSync(args.workDir)).toBe(false);
    expect(existsSync(dirname(args.out))).toBe(false);
  });
  it('일반 파일인 번들 폰트와 기본 폰트 상속은 조립까지 전달한다', () => {
    const args = input(workspace()); args.styles = { title: { fontFile: font }, subtitle: { color: 'white' } };
    assembleEpisode(args);
    expect(runFfmpeg).toHaveBeenCalledOnce();
    expect(vi.mocked(runFfmpeg).mock.calls[0]![0].join(' ')).toContain(`fontfile='${font}'`);
  });
  it.each(['default', 'caption'])('CLI %s 폰트 누락은 종료 1과 JSON 오류를 반환하고 외부 실행을 막는다', role => {
    const dir = workspace(), styleFile = join(dir, 'style.json'), marker = join(dir, 'called');
    const bin = join(dir, 'bin'); mkdirSync(bin);
    for (const name of ['ffmpeg', 'ffprobe']) writeFileSync(join(bin, name),
      `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'called');\nprocess.exit(1);\n`, { mode: 0o700 });
    const missing = join(dir, '없는 폰트.otf');
    writeFileSync(styleFile, JSON.stringify({ caption: { fontFile: role === 'caption' ? './없는 폰트.otf' : font } }));
    const result = spawnSync(process.execPath, ['--import', tsx, join(pkg, 'src/cli/index.ts'), 'assemble',
      '--series', join(pkg, 'test/fixtures/series.json'), '--episode', join(pkg, 'test/fixtures/episode.json'),
      '--cuts', 'c1', '--clips', dir, '--gates', join(dir, 'gates'), '--out', join(dir, 'out/ep.mp4'),
      '--work', join(dir, 'work'), '--font', role === 'default' ? missing : font, '--style', styleFile],
      { cwd: dir, encoding: 'utf8', timeout: 15000, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
    expect(result.error).toBeUndefined(); expect(result.status).toBe(1);
    expect(result.stdout, result.stderr).not.toBe('');
    expect(JSON.parse(result.stdout)).toEqual({ ok: false, error: `폰트 파일 없음 또는 일반 파일 아님: ${role} — ${missing}` });
    expect(result.stderr).toContain(missing); expect(existsSync(marker)).toBe(false);
    expect(existsSync(join(dir, 'out'))).toBe(false); expect(existsSync(join(dir, 'work'))).toBe(false);
  });
});
