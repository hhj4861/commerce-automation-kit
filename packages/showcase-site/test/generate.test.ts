/**
 * core/generate.ts — works.js 생성물 검증 (헤더·전역 할당·JSON 라운드트립).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWorks } from '../src/core/works.js';
import { generateWorksJs } from '../src/core/generate.js';

const fixtureText = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/works.json'),
  'utf8',
);

describe('generateWorksJs', () => {
  const file = parseWorks(fixtureText);
  const js = generateWorksJs(file);

  it('한국어 AUTO-GENERATED 헤더 주석을 포함한다', () => {
    expect(js).toContain('AUTO-GENERATED');
    expect(js).toContain('직접 편집 금지');
    expect(js.startsWith('/*')).toBe(true);
  });

  it('window.FF_WORKS 할당을 포함한다 (showcase.html 로드 계약)', () => {
    expect(js).toContain('window.FF_WORKS =');
    expect(js.trimEnd().endsWith(';')).toBe(true);
  });

  it('payload 는 JSON 으로 라운드트립된다', () => {
    const start = js.indexOf('window.FF_WORKS =') + 'window.FF_WORKS ='.length;
    const end = js.lastIndexOf(';');
    const payload = js.slice(start, end).trim();
    const parsed = JSON.parse(payload) as unknown[];
    expect(parsed).toEqual(file.entries);
    expect(parsed).toHaveLength(4);
  });
});
