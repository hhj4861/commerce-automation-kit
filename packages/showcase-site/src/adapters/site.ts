/**
 * 사이트 디렉토리 어댑터 — site.config.json 로드와 works.json/works.js 파일 I/O.
 *
 * 규약:
 *  - site.config.json 이 있는 디렉토리만 관리 대상 사이트다.
 *  - 경로 인자는 절대경로면 그대로, 상대경로면 INIT_CWD(없으면 cwd) 기준으로 resolve.
 *  - 쓰기는 원자적: 같은 디렉토리에 tmp 파일을 쓰고 rename (부분 쓰기로 인한 파손 방지).
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { ShowcaseSiteConfig, ShowcaseWorksFile } from '@cak/contracts';
import { showcaseSiteConfigSchema } from './schemas.js';
import { formatIssues, parseWorks } from '../core/works.js';

export interface Site {
  /** 사이트 루트 절대경로 */
  dir: string;
  config: ShowcaseSiteConfig;
}

/** CLI 경로 인자 규약: 절대경로 그대로, 상대경로는 INIT_CWD ?? cwd 기준 */
export function resolveInputPath(p: string): string {
  return isAbsolute(p) ? p : resolve(process.env.INIT_CWD ?? process.cwd(), p);
}

/** --site 인자 → 사이트 디렉토리 절대경로 (site.config.json 존재 확인) */
export function resolveSiteDir(siteArg: string): string {
  const dir = resolveInputPath(siteArg);
  if (!existsSync(join(dir, 'site.config.json'))) {
    throw new Error(`관리 대상 사이트가 아닙니다: ${dir} 에 site.config.json 이 없습니다`);
  }
  return dir;
}

/** site.config.json 을 읽어 zod 검증 후 Site 반환 */
export function loadSite(dir: string): Site {
  const configPath = join(dir, 'site.config.json');
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (e) {
    throw new Error(`site.config.json 읽기/파싱 실패 (${configPath}): ${e instanceof Error ? e.message : String(e)}`);
  }
  const parsed = showcaseSiteConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const problems = formatIssues('site.config.json', parsed.error.issues);
    throw new Error(`site.config.json 검증 실패:\n` + problems.map((p) => `  - ${p}`).join('\n'));
  }
  return { dir, config: parsed.data };
}

/** 원자적 쓰기: 같은 디렉토리에 tmp 를 쓰고 rename */
function writeAtomic(filePath: string, text: string): void {
  const tmp = join(dirname(filePath), `.${Date.now()}-${process.pid}.tmp`);
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, filePath);
}

export function worksJsonPath(site: Site): string {
  return resolve(site.dir, site.config.paths.worksJson);
}

export function worksJsPath(site: Site): string {
  return resolve(site.dir, site.config.paths.worksJs);
}

/** works.json 읽기 → 파싱 (실패 시 WorksParseError — 문제 목록 포함) */
export function readWorks(site: Site): ShowcaseWorksFile {
  return parseWorks(readFileSync(worksJsonPath(site), 'utf8'));
}

/** works.json 저장 (원자적) */
export function writeWorks(site: Site, file: ShowcaseWorksFile): void {
  writeAtomic(worksJsonPath(site), JSON.stringify(file, null, 2) + '\n');
}

/** works.js 저장 (원자적) — 내용은 core/generate.ts 가 만든다 */
export function writeWorksJs(site: Site, text: string): void {
  writeAtomic(worksJsPath(site), text);
}

/** 사이트 루트 기준 상대경로의 미디어 존재 검사기 (core/works.validateWorks 에 주입) */
export function mediaExistsChecker(site: Site): (relPath: string) => boolean {
  return (relPath: string) => existsSync(resolve(site.dir, relPath));
}
