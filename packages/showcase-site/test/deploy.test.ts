/**
 * adapters/deploy.ts — 토큰 우선순위·wrangler 인자·dist 조립. 실제 wrangler/네트워크 실행 없음.
 * (deploy 는 토큰 부재 경로만 검증 — 토큰이 없으면 spawn 자체가 일어나지 않는다)
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ShowcaseSiteConfig } from '@cak/contracts';
import { loadSite } from '../src/adapters/site.js';
import { buildDist, buildWranglerArgs, deploy, resolveToken } from '../src/adapters/deploy.js';

const VALID_CONFIG: ShowcaseSiteConfig = {
  name: 'tmp-site',
  deploy: { provider: 'cloudflare-pages', projectName: 'tmp-proj', branch: 'main' },
  paths: { html: 'showcase.html', worksJson: 'works.json', worksJs: 'works.js', media: 'media', dist: 'dist' },
};

const cleanups: string[] = [];
const savedToken = process.env.CLOUDFLARE_API_TOKEN;

function makeTmpSite(): string {
  const dir = mkdtempSync(join(tmpdir(), 'showcase-deploy-'));
  cleanups.push(dir);
  writeFileSync(join(dir, 'site.config.json'), JSON.stringify(VALID_CONFIG, null, 2));
  writeFileSync(join(dir, 'works.json'), '{"entries": []}');
  writeFileSync(join(dir, 'works.js'), 'window.FF_WORKS = [];\n');
  writeFileSync(join(dir, 'showcase.html'), '<title>tmp</title>');
  mkdirSync(join(dir, 'media'), { recursive: true });
  writeFileSync(join(dir, 'media', 'a.mp4'), 'fake-video-bytes');
  return dir;
}

beforeEach(() => {
  delete process.env.CLOUDFLARE_API_TOKEN;
});

afterEach(() => {
  for (const dir of cleanups.splice(0)) rmSync(dir, { recursive: true, force: true });
  if (savedToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
  else process.env.CLOUDFLARE_API_TOKEN = savedToken;
});

describe('resolveToken 우선순위', () => {
  it('env CLOUDFLARE_API_TOKEN 이 .cf-token 파일보다 우선한다', () => {
    const site = loadSite(makeTmpSite());
    writeFileSync(join(site.dir, '.cf-token'), 'file-token\n');
    process.env.CLOUDFLARE_API_TOKEN = 'env-token';
    expect(resolveToken(site)).toBe('env-token');
  });

  it('env 가 없으면 .cf-token 파일 값을 trim 해서 쓴다', () => {
    const site = loadSite(makeTmpSite());
    writeFileSync(join(site.dir, '.cf-token'), '  file-token  \n');
    expect(resolveToken(site)).toBe('file-token');
  });

  it('둘 다 없으면 null', () => {
    const site = loadSite(makeTmpSite());
    expect(resolveToken(site)).toBeNull();
  });
});

describe('buildWranglerArgs', () => {
  it('npx 인자를 규약대로 만든다', () => {
    expect(buildWranglerArgs(VALID_CONFIG, '/tmp/site/dist')).toEqual([
      '--yes', 'wrangler', 'pages', 'deploy', '/tmp/site/dist',
      '--project-name', 'tmp-proj', '--branch', 'main', '--commit-dirty=true',
    ]);
  });
});

describe('buildDist', () => {
  it('index.html·works.js·media·vercel.json 을 조립하고 파일 수·바이트를 보고한다', () => {
    const site = loadSite(makeTmpSite());
    const result = buildDist(site);
    const dist = join(site.dir, 'dist');
    expect(existsSync(join(dist, 'index.html'))).toBe(true);
    expect(existsSync(join(dist, 'works.js'))).toBe(true);
    expect(existsSync(join(dist, 'media', 'a.mp4'))).toBe(true);
    expect(JSON.parse(readFileSync(join(dist, 'vercel.json'), 'utf8'))).toEqual({
      cleanUrls: true,
      trailingSlash: false,
    });
    expect(result.files).toBe(4); // index.html + works.js + media/a.mp4 + vercel.json
    expect(result.bytes).toBeGreaterThan(0);
  });

  it('사이트에 vercel.json 이 있으면 그것을 복사한다', () => {
    const site = loadSite(makeTmpSite());
    writeFileSync(join(site.dir, 'vercel.json'), '{"cleanUrls": false}');
    buildDist(site);
    expect(readFileSync(join(site.dir, 'dist', 'vercel.json'), 'utf8')).toBe('{"cleanUrls": false}');
  });

  it('기존 dist 를 비우고 다시 조립한다 (이전 빌드 잔여물 제거)', () => {
    const site = loadSite(makeTmpSite());
    mkdirSync(join(site.dir, 'dist'), { recursive: true });
    writeFileSync(join(site.dir, 'dist', 'stale.txt'), 'old');
    buildDist(site);
    expect(existsSync(join(site.dir, 'dist', 'stale.txt'))).toBe(false);
  });
});

describe('deploy (토큰 부재 경로)', () => {
  it('토큰이 없으면 throw 하지 않고 ok:false 보고서를 반환한다', async () => {
    const site = loadSite(makeTmpSite());
    const report = await deploy(site);
    expect(report.ok).toBe(false);
    expect(report.provider).toBe('cloudflare-pages');
    expect(report.projectName).toBe('tmp-proj');
    expect(report.log).toContain('토큰 없음');
    expect(report.url).toBeUndefined();
  });
});
