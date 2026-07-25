/**
 * adapters/schemas.ts — zod 스키마 단위 검증 (site.config / entry union / ffprobe).
 */
import { describe, it, expect } from 'vitest';
import {
  showcaseSiteConfigSchema,
  showcaseEntrySchema,
  showcaseReservedEntrySchema,
  ffprobeOutputSchema,
} from '../src/adapters/schemas.js';

const validConfig = {
  name: 'firstframe',
  deploy: { provider: 'cloudflare-pages', projectName: 'firstframe-showcase', branch: 'main' },
  paths: { html: 'showcase.html', worksJson: 'works.json', worksJs: 'works.js', media: 'media', dist: 'dist' },
};

describe('showcaseSiteConfigSchema', () => {
  it('firstframe 형태의 정상 config 를 통과시킨다', () => {
    const parsed = showcaseSiteConfigSchema.safeParse(validConfig);
    expect(parsed.success).toBe(true);
  });

  it('불량 provider 를 거부한다 (cloudflare-pages 만 허용)', () => {
    const bad = { ...validConfig, deploy: { ...validConfig.deploy, provider: 'vercel' } };
    const parsed = showcaseSiteConfigSchema.safeParse(bad);
    expect(parsed.success).toBe(false);
  });

  it('paths 누락을 거부한다', () => {
    const { html: _html, ...rest } = validConfig.paths;
    const parsed = showcaseSiteConfigSchema.safeParse({ ...validConfig, paths: rest });
    expect(parsed.success).toBe(false);
  });
});

describe('showcaseEntrySchema (union)', () => {
  it('reserved 엔트리를 통과시킨다 (텍스트 요건 미적용)', () => {
    expect(showcaseReservedEntrySchema.safeParse({ id: '__reserved__', reserved: true }).success).toBe(true);
    expect(showcaseEntrySchema.safeParse({ id: '__reserved__', reserved: true }).success).toBe(true);
  });

  it('reserved: false 는 reserved 스키마에서 거부된다', () => {
    expect(showcaseReservedEntrySchema.safeParse({ id: 'x', reserved: false }).success).toBe(false);
  });

  it('일반 엔트리는 en/ko/clips 없이는 거부된다', () => {
    expect(showcaseEntrySchema.safeParse({ id: 'plain', brand: 'B', cover: 'c.jpg' }).success).toBe(false);
  });
});

describe('ffprobeOutputSchema', () => {
  it('정상 출력에서 width/height/duration 을 강제한다', () => {
    const ok = ffprobeOutputSchema.safeParse({
      streams: [{ width: 1920, height: 1080 }],
      format: { duration: '15.023000' },
    });
    expect(ok.success).toBe(true);
  });

  it('비디오 스트림이 없으면 거부한다', () => {
    const bad = ffprobeOutputSchema.safeParse({ streams: [], format: { duration: '1.0' } });
    expect(bad.success).toBe(false);
  });
});
