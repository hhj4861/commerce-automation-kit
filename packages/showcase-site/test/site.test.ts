/**
 * adapters/site.ts — 사이트 로드·works I/O·경로 규약. 실제 사이트 대신 임시 디렉토리 사용.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadSite,
  mediaExistsChecker,
  readWorks,
  resolveSiteDir,
  writeWorks,
  writeWorksJs,
} from '../src/adapters/site.js';

const fixtureWorks = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/works.json'),
  'utf8',
);

const VALID_CONFIG = {
  name: 'tmp-site',
  deploy: { provider: 'cloudflare-pages', projectName: 'tmp-proj', branch: 'main' },
  paths: { html: 'showcase.html', worksJson: 'works.json', worksJs: 'works.js', media: 'media', dist: 'dist' },
};

const cleanups: string[] = [];
const savedInitCwd = process.env.INIT_CWD;

function makeTmpSite(config: unknown = VALID_CONFIG): string {
  const dir = mkdtempSync(join(tmpdir(), 'showcase-site-'));
  cleanups.push(dir);
  writeFileSync(join(dir, 'site.config.json'), JSON.stringify(config, null, 2));
  writeFileSync(join(dir, 'works.json'), fixtureWorks);
  writeFileSync(join(dir, 'showcase.html'), '<title>tmp</title>');
  mkdirSync(join(dir, 'media'), { recursive: true });
  writeFileSync(join(dir, 'media', 'a.mp4'), 'fake-video');
  return dir;
}

afterEach(() => {
  for (const dir of cleanups.splice(0)) rmSync(dir, { recursive: true, force: true });
  if (savedInitCwd === undefined) delete process.env.INIT_CWD;
  else process.env.INIT_CWD = savedInitCwd;
});

describe('resolveSiteDir', () => {
  it('절대경로 + site.config.json 존재 → 그대로 통과', () => {
    const dir = makeTmpSite();
    expect(resolveSiteDir(dir)).toBe(dir);
  });

  it('site.config.json 이 없으면 에러', () => {
    const dir = mkdtempSync(join(tmpdir(), 'showcase-nosite-'));
    cleanups.push(dir);
    expect(() => resolveSiteDir(dir)).toThrowError(/site\.config\.json/);
  });

  it('상대경로는 INIT_CWD 기준으로 resolve 한다', () => {
    const dir = makeTmpSite();
    process.env.INIT_CWD = dirname(dir);
    expect(resolveSiteDir(basename(dir))).toBe(dir);
  });
});

describe('loadSite', () => {
  it('정상 config 를 로드한다', () => {
    const dir = makeTmpSite();
    const site = loadSite(dir);
    expect(site.dir).toBe(dir);
    expect(site.config.deploy.projectName).toBe('tmp-proj');
  });

  it('불량 provider 는 zod 검증 실패로 에러', () => {
    const dir = makeTmpSite({ ...VALID_CONFIG, deploy: { ...VALID_CONFIG.deploy, provider: 'vercel' } });
    expect(() => loadSite(dir)).toThrowError(/site\.config\.json 검증 실패/);
  });
});

describe('works I/O', () => {
  it('readWorks/writeWorks 라운드트립 — tmp 파일을 남기지 않는다(원자적 쓰기)', () => {
    const site = loadSite(makeTmpSite());
    const file = readWorks(site);
    expect(file.entries).toHaveLength(4);

    const next = { entries: file.entries.slice(0, 2) };
    writeWorks(site, next);
    expect(readWorks(site).entries.map((e) => e.id)).toEqual(['olipop', 'allbirds']);
    expect(readdirSync(site.dir).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });

  it('writeWorksJs 는 config.paths.worksJs 에 텍스트를 쓴다', () => {
    const site = loadSite(makeTmpSite());
    writeWorksJs(site, 'window.FF_WORKS = [];\n');
    expect(readFileSync(join(site.dir, 'works.js'), 'utf8')).toContain('window.FF_WORKS');
  });
});

describe('mediaExistsChecker', () => {
  it('사이트 루트 기준 상대경로로 존재/부재를 판별한다', () => {
    const site = loadSite(makeTmpSite());
    const exists = mediaExistsChecker(site);
    expect(exists('media/a.mp4')).toBe(true);
    expect(exists('media/ghost.mp4')).toBe(false);
  });
});
