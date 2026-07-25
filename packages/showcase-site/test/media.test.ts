/**
 * adapters/media.ts — spawn(ffmpeg/ffprobe)·네트워크 없이 검증 가능한 입력 가드만 테스트.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSite } from '../src/adapters/site.js';
import { addMedia } from '../src/adapters/media.js';

const cleanups: string[] = [];

function makeTmpSite(): string {
  const dir = mkdtempSync(join(tmpdir(), 'showcase-media-'));
  cleanups.push(dir);
  writeFileSync(
    join(dir, 'site.config.json'),
    JSON.stringify({
      name: 'tmp',
      deploy: { provider: 'cloudflare-pages', projectName: 'p', branch: 'main' },
      paths: { html: 'showcase.html', worksJson: 'works.json', worksJs: 'works.js', media: 'media', dist: 'dist' },
    }),
  );
  return dir;
}

afterEach(() => {
  for (const dir of cleanups.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('addMedia 입력 가드 (spawn 전에 차단)', () => {
  it('slug 형식 위반은 즉시 에러 (소문자·숫자·하이픈만)', async () => {
    const site = loadSite(makeTmpSite());
    await expect(addMedia(site, { slug: 'Bad_Slug', src: 'https://example.com/a.mp4' })).rejects.toThrowError(
      /slug 형식 위반/,
    );
  });

  it('음수 --poster-at 은 즉시 에러', async () => {
    const site = loadSite(makeTmpSite());
    await expect(
      addMedia(site, { slug: 'good-slug', src: 'https://example.com/a.mp4', posterAtSec: -1 }),
    ).rejects.toThrowError(/poster-at/);
  });

  it('로컬 원본이 없으면 복사 전에 에러', async () => {
    const site = loadSite(makeTmpSite());
    await expect(
      addMedia(site, { slug: 'good-slug', src: join(site.dir, 'no-such-file.mp4') }),
    ).rejects.toThrowError(/원본 파일 없음/);
  });
});
