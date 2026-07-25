/**
 * works.json 순수 로직 — 파싱·검증·엔트리 삽입/삭제. I/O 없음.
 *
 * 원칙:
 *  - works.json 이 단일 진실 소스. 이 모듈은 파일 내용(문자열/객체)만 다룬다.
 *  - silent drop 금지: 검증 문제는 problems/warnings 배열로 전부 나열한다.
 *  - 파싱 실패 메시지는 `entries[i].필드경로: 사유` 로 특정한다.
 *  - insert/remove 는 입력을 변경하지 않고 새 파일 객체를 반환한다(불변).
 *
 * 참고: zod 스키마는 adapters/schemas.ts 가 소유한다(스키마 단일 소스).
 *       스키마 자체는 I/O 가 없으므로 core 에서 import 해도 순수성이 깨지지 않는다.
 */
import type { ShowcaseEntry, ShowcaseWorkEntry, ShowcaseWorksFile } from '@cak/contracts';
import type { z } from 'zod';
import { showcaseReservedEntrySchema, showcaseWorkEntrySchema } from '../adapters/schemas.js';

/** 파싱/검증 실패 — 문제 목록을 담아 표면화한다 */
export class WorksParseError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`works.json 파싱 실패 (${problems.length}건):\n` + problems.map((p) => `  - ${p}`).join('\n'));
    this.name = 'WorksParseError';
    this.problems = problems;
  }
}

/** 일반 엔트리 id 형식: 영문 소문자·숫자·하이픈 (reserved 엔트리는 내부 마커라 예외) */
export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** zod 이슈를 "어떤 엔트리의 어떤 필드"인지 특정되는 문자열로 변환 */
export function formatIssues(prefix: string, issues: z.ZodIssue[]): string[] {
  return issues.map((issue) => {
    const path = issue.path.map((seg) => (typeof seg === 'number' ? `[${seg}]` : `.${seg}`)).join('');
    return `${prefix}${path}: ${issue.message}`;
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * works.json 텍스트 → ShowcaseWorksFile.
 * 엔트리별로 reserved/일반을 구분해 검증하고, 실패는 전부 모아 WorksParseError 로 던진다.
 */
export function parseWorks(jsonText: string): ShowcaseWorksFile {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (e) {
    throw new WorksParseError([`JSON 문법 오류: ${e instanceof Error ? e.message : String(e)}`]);
  }

  if (!isRecord(raw) || !Array.isArray(raw.entries)) {
    throw new WorksParseError(['루트에 entries 배열이 필요합니다 (형태: { "entries": [...] })']);
  }

  const problems: string[] = [];
  const entries: ShowcaseEntry[] = [];
  raw.entries.forEach((item, i) => {
    // reserved: true 가 있으면 예약 슬롯 스키마, 아니면 일반 엔트리 스키마로 검증
    const isReserved = isRecord(item) && item.reserved === true;
    const result = isReserved ? showcaseReservedEntrySchema.safeParse(item) : showcaseWorkEntrySchema.safeParse(item);
    if (result.success) {
      entries.push(result.data as ShowcaseEntry);
    } else {
      problems.push(...formatIssues(`entries[${i}]`, result.error.issues));
    }
  });

  if (problems.length > 0) throw new WorksParseError(problems);
  return { entries };
}

export interface ValidateWorksOptions {
  /** 사이트 루트 기준 상대경로의 미디어 파일 존재 여부 (adapters/site.ts 의 mediaExistsChecker 주입) */
  mediaExists?: (relPath: string) => boolean;
}

export interface ValidateWorksResult {
  ok: boolean;
  problems: string[];
  warnings: string[];
}

/**
 * 비즈니스 규칙 검증 — 스키마 통과 후에도 걸러야 할 것들.
 * problems: id 중복/형식, en·ko 누락, clips 비었음, clip 의 en/ko 누락,
 *           (mediaExists 제공 시) cover·prev·clips 의 poster·src 파일 부재 — 전부 나열.
 * warnings: reserved 엔트리 없음 / reserved 가 마지막이 아님.
 */
export function validateWorks(file: ShowcaseWorksFile, opts: ValidateWorksOptions = {}): ValidateWorksResult {
  const problems: string[] = [];
  const warnings: string[] = [];
  const seenIds = new Map<string, number>();
  let reservedCount = 0;
  let lastReservedIndex = -1;
  let lastNormalIndex = -1;

  file.entries.forEach((entry, i) => {
    // 타입은 계약을 따르지만, 프로그램적으로 만든 파일도 방어적으로 런타임 재확인한다.
    const e = entry as Partial<ShowcaseWorkEntry> & { reserved?: boolean };
    const label = `entries[${i}]`;

    if (typeof e.id !== 'string' || e.id.length === 0) {
      problems.push(`${label}: id 누락`);
    } else {
      const firstAt = seenIds.get(e.id);
      if (firstAt !== undefined) problems.push(`${label}: id "${e.id}" 중복 (entries[${firstAt}] 와 동일)`);
      else seenIds.set(e.id, i);
    }

    if (e.reserved === true) {
      reservedCount += 1;
      lastReservedIndex = i;
      return; // 예약 슬롯은 텍스트/미디어 요건 미적용
    }
    lastNormalIndex = i;

    if (typeof e.id === 'string' && e.id.length > 0 && !ID_PATTERN.test(e.id)) {
      problems.push(`${label}: id "${e.id}" 형식 위반 — 영문 소문자·숫자·하이픈만 허용`);
    }
    if (!isRecord(e.en)) problems.push(`${label} (id=${e.id ?? '?'}): en 텍스트 블록 누락`);
    if (!isRecord(e.ko)) problems.push(`${label} (id=${e.id ?? '?'}): ko 텍스트 블록 누락`);

    if (!Array.isArray(e.clips) || e.clips.length === 0) {
      problems.push(`${label} (id=${e.id ?? '?'}): clips 가 비어 있음 — 컷이 1개 이상 필요`);
    } else {
      e.clips.forEach((clip, ci) => {
        const c = clip as unknown as Record<string, unknown>;
        if (!isRecord(c.en)) problems.push(`${label}.clips[${ci}]: en 누락`);
        if (!isRecord(c.ko)) problems.push(`${label}.clips[${ci}]: ko 누락`);
      });
    }

    // 미디어 파일 존재 검사 — 제공된 경우에만, 누락은 전부 나열
    const mediaExists = opts.mediaExists;
    if (mediaExists) {
      const check = (field: string, relPath: unknown): void => {
        if (typeof relPath !== 'string' || relPath.length === 0) return; // 경로 자체 누락은 스키마가 잡는다
        if (!mediaExists(relPath)) problems.push(`${label} (id=${e.id ?? '?'}): ${field} 파일 없음 — ${relPath}`);
      };
      check('cover', e.cover);
      if (e.prev !== undefined) check('prev', e.prev);
      if (Array.isArray(e.clips)) {
        e.clips.forEach((clip, ci) => {
          const c = clip as unknown as Record<string, unknown>;
          check(`clips[${ci}].poster`, c.poster);
          check(`clips[${ci}].src`, c.src);
        });
      }
    }
  });

  if (reservedCount === 0) {
    warnings.push('reserved 엔트리가 없습니다 — "다음 캠페인" 예약 슬롯을 마지막에 두는 것을 권장');
  } else if (lastNormalIndex > lastReservedIndex) {
    warnings.push('reserved 엔트리가 마지막이 아닙니다 — 예약 슬롯은 목록 끝에 두는 것을 권장');
  }

  return { ok: problems.length === 0, problems, warnings };
}

function entryIds(file: ShowcaseWorksFile): Set<string> {
  return new Set(file.entries.map((e) => e.id));
}

function firstReservedIndex(file: ShowcaseWorksFile): number {
  return file.entries.findIndex((e) => 'reserved' in e && e.reserved === true);
}

/**
 * 새 엔트리 삽입 — 첫 reserved 엔트리 **앞**에 넣는다(없으면 맨 끝).
 * id 중복이면 에러. 입력 파일은 변경하지 않는다.
 */
export function insertEntry(file: ShowcaseWorksFile, entry: ShowcaseEntry): ShowcaseWorksFile {
  if (entryIds(file).has(entry.id)) {
    throw new Error(`엔트리 삽입 실패: id "${entry.id}" 가 이미 존재합니다`);
  }
  const at = firstReservedIndex(file);
  const entries = [...file.entries];
  if (at >= 0) entries.splice(at, 0, entry);
  else entries.push(entry);
  return { entries };
}

/** 엔트리 삭제 — 해당 id 가 없으면 에러. 입력 파일은 변경하지 않는다. */
export function removeEntry(file: ShowcaseWorksFile, id: string): ShowcaseWorksFile {
  const at = file.entries.findIndex((e) => e.id === id);
  if (at < 0) {
    throw new Error(`엔트리 삭제 실패: id "${id}" 를 찾을 수 없습니다`);
  }
  return { entries: file.entries.filter((_, i) => i !== at) };
}
