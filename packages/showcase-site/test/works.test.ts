/**
 * core/works.ts — 파싱·검증·삽입/삭제 순수 로직 테스트.
 * fixtures/works.json 은 apps/firstframe 실데이터 복사본.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ShowcaseWorksFile, ShowcaseWorkEntry } from '@cak/contracts';
import { parseWorks, validateWorks, insertEntry, removeEntry, WorksParseError } from '../src/core/works.js';

const fixturePath = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/works.json');
const fixtureText = readFileSync(fixturePath, 'utf8');

function loadFixture(): ShowcaseWorksFile {
  return parseWorks(fixtureText);
}

/** 최소 유효 일반 엔트리 생성 헬퍼 */
function makeEntry(id: string): ShowcaseWorkEntry {
  const text = {
    cat: 'C', meta: 'M', runtime: '0:15', h3: 'H', p: 'P', chips: ['a'], how: 'HOW', sub: 'S',
  };
  return {
    id,
    brand: id.toUpperCase(),
    cover: `media/poster-${id}.jpg`,
    en: { ...text },
    ko: { ...text },
    clips: [
      {
        poster: `media/poster-${id}.jpg`,
        src: `media/${id}.mp4`,
        en: { label: 'L', cap: 'C' },
        ko: { label: 'ㄹ', cap: 'ㅋ' },
      },
    ],
  };
}

describe('parseWorks', () => {
  it('firstframe 실데이터를 파싱한다 (4엔트리, 마지막은 reserved)', () => {
    const file = loadFixture();
    expect(file.entries).toHaveLength(4);
    expect(file.entries.map((e) => e.id)).toEqual(['olipop', 'allbirds', 'jindo', '__reserved__']);
    const last = file.entries[3];
    expect(last && 'reserved' in last && last.reserved).toBe(true);
  });

  it('JSON 문법 오류는 WorksParseError 로 표면화한다', () => {
    expect(() => parseWorks('{ not json')).toThrowError(WorksParseError);
  });

  it('entries 배열이 없으면 실패한다', () => {
    expect(() => parseWorks('{"foo": 1}')).toThrowError(/entries 배열/);
  });

  it('필드 누락은 어떤 엔트리의 어떤 필드인지 특정한다', () => {
    const raw = JSON.parse(fixtureText) as { entries: Record<string, unknown>[] };
    const first = raw.entries[0] as { en: Record<string, unknown> };
    delete first.en.h3; // olipop 의 en.h3 제거
    let caught: unknown;
    try {
      parseWorks(JSON.stringify(raw));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(WorksParseError);
    const problems = (caught as WorksParseError).problems;
    expect(problems.some((p) => p.includes('entries[0]') && p.includes('h3'))).toBe(true);
  });

  it('여러 엔트리의 문제를 전부 모아 보고한다 (silent drop 금지)', () => {
    const raw = JSON.parse(fixtureText) as { entries: Record<string, unknown>[] };
    delete (raw.entries[0] as Record<string, unknown>).brand;
    delete (raw.entries[1] as Record<string, unknown>).cover;
    let caught: unknown;
    try {
      parseWorks(JSON.stringify(raw));
    } catch (e) {
      caught = e;
    }
    const problems = (caught as WorksParseError).problems;
    expect(problems.some((p) => p.includes('entries[0].brand'))).toBe(true);
    expect(problems.some((p) => p.includes('entries[1].cover'))).toBe(true);
  });
});

describe('validateWorks', () => {
  it('실데이터 + 미디어 전부 존재 → ok, 경고 없음', () => {
    const result = validateWorks(loadFixture(), { mediaExists: () => true });
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('id 중복을 잡는다', () => {
    const file = loadFixture();
    const dup = insertEntry({ entries: [] }, makeEntry('olipop'));
    const merged: ShowcaseWorksFile = { entries: [...file.entries, ...dup.entries] };
    const result = validateWorks(merged);
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.includes('id "olipop" 중복'))).toBe(true);
  });

  it('id 형식(소문자·숫자·하이픈) 위반을 잡는다 — reserved 는 예외', () => {
    const bad = makeEntry('olipop');
    bad.id = 'Bad_ID';
    const result = validateWorks({ entries: [bad] });
    expect(result.problems.some((p) => p.includes('형식 위반'))).toBe(true);
    // reserved 엔트리의 __reserved__ 는 형식 검사 대상이 아니다 (firstframe 실데이터 호환)
    const withReserved = validateWorks(loadFixture(), { mediaExists: () => true });
    expect(withReserved.ok).toBe(true);
  });

  it('일반 엔트리의 ko 누락을 잡는다', () => {
    const entry = makeEntry('x1') as unknown as Record<string, unknown>;
    delete entry.ko;
    const result = validateWorks({ entries: [entry] } as unknown as ShowcaseWorksFile);
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.includes('ko 텍스트 블록 누락'))).toBe(true);
  });

  it('clips 비었음을 잡는다', () => {
    const entry = makeEntry('x2');
    entry.clips = [];
    const result = validateWorks({ entries: [entry] });
    expect(result.problems.some((p) => p.includes('clips 가 비어 있음'))).toBe(true);
  });

  it('clip 의 en/ko 누락을 잡는다', () => {
    const entry = makeEntry('x3');
    const clip = entry.clips[0] as unknown as Record<string, unknown>;
    delete clip.en;
    const result = validateWorks({ entries: [entry] });
    expect(result.problems.some((p) => p.includes('clips[0]') && p.includes('en 누락'))).toBe(true);
  });

  it('mediaExists 제공 시 없는 파일을 전부 나열한다', () => {
    const entry = makeEntry('x4');
    entry.prev = 'media/x4-prev.mp4';
    const result = validateWorks({ entries: [entry] }, { mediaExists: () => false });
    // cover + prev + clips[0].poster + clips[0].src = 4건 전부
    const mediaProblems = result.problems.filter((p) => p.includes('파일 없음'));
    expect(mediaProblems).toHaveLength(4);
    expect(mediaProblems.some((p) => p.includes('cover'))).toBe(true);
    expect(mediaProblems.some((p) => p.includes('prev'))).toBe(true);
    expect(mediaProblems.some((p) => p.includes('clips[0].poster'))).toBe(true);
    expect(mediaProblems.some((p) => p.includes('clips[0].src'))).toBe(true);
  });

  it('reserved 엔트리가 없으면 경고한다', () => {
    const result = validateWorks({ entries: [makeEntry('solo')] }, { mediaExists: () => true });
    expect(result.ok).toBe(true); // 경고는 ok 를 깨지 않는다
    expect(result.warnings.some((w) => w.includes('reserved 엔트리가 없습니다'))).toBe(true);
  });

  it('reserved 가 마지막이 아니면 경고한다', () => {
    const file: ShowcaseWorksFile = {
      entries: [{ id: '__reserved__', reserved: true }, makeEntry('after')],
    };
    const result = validateWorks(file, { mediaExists: () => true });
    expect(result.warnings.some((w) => w.includes('마지막이 아닙니다'))).toBe(true);
  });
});

describe('insertEntry', () => {
  it('첫 reserved 엔트리 앞에 삽입한다', () => {
    const next = insertEntry(loadFixture(), makeEntry('new-ad'));
    expect(next.entries.map((e) => e.id)).toEqual(['olipop', 'allbirds', 'jindo', 'new-ad', '__reserved__']);
  });

  it('reserved 가 없으면 맨 끝에 붙인다', () => {
    const base: ShowcaseWorksFile = { entries: [makeEntry('a')] };
    const next = insertEntry(base, makeEntry('b'));
    expect(next.entries.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('id 중복이면 에러', () => {
    expect(() => insertEntry(loadFixture(), makeEntry('olipop'))).toThrowError(/이미 존재/);
  });

  it('입력 파일을 변경하지 않는다 (불변)', () => {
    const base = loadFixture();
    insertEntry(base, makeEntry('immutable-check'));
    expect(base.entries).toHaveLength(4);
  });
});

describe('removeEntry', () => {
  it('id 로 엔트리를 제거한다', () => {
    const next = removeEntry(loadFixture(), 'allbirds');
    expect(next.entries.map((e) => e.id)).toEqual(['olipop', 'jindo', '__reserved__']);
  });

  it('없는 id 면 에러', () => {
    expect(() => removeEntry(loadFixture(), 'ghost')).toThrowError(/찾을 수 없습니다/);
  });
});
