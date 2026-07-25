/**
 * CLI 진입점 — 쇼케이스 사이트 관리 명령. 조합 단계에서는 core/adapters 를 라이브러리로 import 한다.
 *
 * 사용 (공통: --site <사이트 디렉토리>):
 *   npm run cli -w @cak/showcase-site -- validate  --site apps/firstframe          # 검증(미디어 존재 포함)
 *   npm run cli -w @cak/showcase-site -- gen       --site apps/firstframe          # works.json → works.js
 *   npm run cli -w @cak/showcase-site -- list      --site apps/firstframe          # 엔트리 요약
 *   npm run cli -w @cak/showcase-site -- add       --site apps/firstframe --entry new-entry.json
 *   npm run cli -w @cak/showcase-site -- remove    --site apps/firstframe --id olipop
 *   npm run cli -w @cak/showcase-site -- add-media --site apps/firstframe --slug jindo2 --src https://... [--poster-at 1.0]
 *   npm run cli -w @cak/showcase-site -- build     --site apps/firstframe          # gen 포함 → dist 조립
 *   npm run cli -w @cak/showcase-site -- deploy    --site apps/firstframe          # Cloudflare Pages 배포
 *   npm run cli -w @cak/showcase-site -- sync      --site apps/firstframe          # validate→gen→build→deploy
 *
 * 출력 규약: stdout = 결과 JSON 전용, stderr = 로그.
 * 종료코드: 0 정상 / 1 검증·사용법 실패 / 75 일시적 실패(배포 실패 등 — 재시도 가치 있음).
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { ShowcaseEntry, ShowcaseWorksFile } from '@cak/contracts';
import { formatIssues, insertEntry, removeEntry, validateWorks, WorksParseError } from '../core/works.js';
import { generateWorksJs } from '../core/generate.js';
import { showcaseReservedEntrySchema, showcaseWorkEntrySchema } from '../adapters/schemas.js';
import {
  loadSite,
  mediaExistsChecker,
  readWorks,
  resolveInputPath,
  resolveSiteDir,
  worksJsPath,
  writeWorks,
  writeWorksJs,
  type Site,
} from '../adapters/site.js';
import { addMedia } from '../adapters/media.js';
import { buildDist, deploy } from '../adapters/deploy.js';
import { createLogger } from '../obs/logger.js';

const log = createLogger();

const USAGE =
  '명령: validate | gen | list | add | remove | add-media | build | deploy | sync (공통 --site <dir>)';

function out(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function requireSite(siteArg: string | undefined): Site {
  if (!siteArg) {
    console.error(`--site <사이트 디렉토리> 인자가 필요합니다. ${USAGE}`);
    process.exit(1);
  }
  return loadSite(resolveSiteDir(siteArg));
}

/** works.json 읽기 → works.js 생성·저장. 반환: 엔트리 수 */
function runGen(site: Site, file?: ShowcaseWorksFile): number {
  const works = file ?? readWorks(site);
  writeWorksJs(site, generateWorksJs(works));
  log.info('gen.done', { worksJs: worksJsPath(site), entries: works.entries.length });
  return works.entries.length;
}

/** validate 1회 실행 — 미디어 존재까지 검사 */
function runValidate(site: Site): { ok: boolean; problems: string[]; warnings: string[] } {
  try {
    const works = readWorks(site);
    return validateWorks(works, { mediaExists: mediaExistsChecker(site) });
  } catch (e) {
    if (e instanceof WorksParseError) return { ok: false, problems: e.problems, warnings: [] };
    throw e;
  }
}

/** 엔트리 JSON 파일 → ShowcaseEntry (reserved/일반 구분 검증, 실패는 필드 특정) */
function parseEntryFile(entryPath: string): ShowcaseEntry {
  const abs = resolveInputPath(entryPath);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(abs, 'utf8'));
  } catch (e) {
    throw new Error(`엔트리 파일 읽기/파싱 실패 (${abs}): ${e instanceof Error ? e.message : String(e)}`);
  }
  const isReserved = typeof raw === 'object' && raw !== null && (raw as Record<string, unknown>).reserved === true;
  const parsed = isReserved ? showcaseReservedEntrySchema.safeParse(raw) : showcaseWorkEntrySchema.safeParse(raw);
  if (!parsed.success) {
    const problems = formatIssues('entry', parsed.error.issues);
    throw new Error(`엔트리 검증 실패 (${abs}):\n` + problems.map((p) => `  - ${p}`).join('\n'));
  }
  return parsed.data as ShowcaseEntry;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      site: { type: 'string' },
      entry: { type: 'string' },
      id: { type: 'string' },
      slug: { type: 'string' },
      src: { type: 'string' },
      'poster-at': { type: 'string' },
    },
    allowPositionals: true,
  });
  const cmd = positionals[0];

  switch (cmd) {
    case 'validate': {
      const site = requireSite(values.site);
      const result = runValidate(site);
      out(result);
      if (!result.ok) process.exit(1);
      break;
    }

    case 'gen': {
      const site = requireSite(values.site);
      const entries = runGen(site);
      out({ ok: true, worksJs: worksJsPath(site), entries });
      break;
    }

    case 'list': {
      const site = requireSite(values.site);
      const works = readWorks(site);
      out(
        works.entries.map((e) =>
          'reserved' in e
            ? { id: e.id, reserved: true }
            : { id: e.id, brand: e.brand, clips: e.clips.length },
        ),
      );
      break;
    }

    case 'add': {
      const site = requireSite(values.site);
      if (!values.entry) {
        console.error('사용법: add --site <dir> --entry <entry.json 경로>');
        process.exit(1);
      }
      const entry = parseEntryFile(values.entry);
      const next = insertEntry(readWorks(site), entry);
      const check = validateWorks(next, { mediaExists: mediaExistsChecker(site) });
      if (!check.ok) {
        // 저장 전 차단 — 문제를 전부 보여주고 works.json 은 건드리지 않는다
        out({ ok: false, id: entry.id, problems: check.problems, warnings: check.warnings });
        process.exit(1);
      }
      writeWorks(site, next);
      const entries = runGen(site, next);
      out({ ok: true, id: entry.id, entries, warnings: check.warnings });
      break;
    }

    case 'remove': {
      const site = requireSite(values.site);
      if (!values.id) {
        console.error('사용법: remove --site <dir> --id <엔트리 id>');
        process.exit(1);
      }
      const next = removeEntry(readWorks(site), values.id);
      writeWorks(site, next);
      const entries = runGen(site, next);
      out({ ok: true, removed: values.id, entries });
      break;
    }

    case 'add-media': {
      const site = requireSite(values.site);
      if (!values.slug || !values.src) {
        console.error('사용법: add-media --site <dir> --slug <slug> --src <url|경로> [--poster-at 1.0]');
        process.exit(1);
      }
      const posterAtRaw = values['poster-at'];
      const posterAtSec = posterAtRaw === undefined ? 1.0 : Number(posterAtRaw);
      if (!Number.isFinite(posterAtSec)) {
        console.error(`--poster-at 값이 숫자가 아닙니다: ${posterAtRaw}`);
        process.exit(1);
      }
      const result = await addMedia(site, { slug: values.slug, src: values.src, posterAtSec });
      out({ ok: true, ...result });
      break;
    }

    case 'build': {
      const site = requireSite(values.site);
      const entries = runGen(site);
      const stats = buildDist(site);
      out({ ok: true, entries, ...stats });
      break;
    }

    case 'deploy': {
      const site = requireSite(values.site);
      const report = await deploy(site);
      out(report);
      // 토큰 없음 = 설정 문제(1), 그 외 실패 = 일시적일 수 있음(75)
      if (!report.ok) process.exit(report.log.startsWith('토큰 없음') ? 1 : 75);
      break;
    }

    case 'sync': {
      const site = requireSite(values.site);
      const validate = runValidate(site);
      if (!validate.ok) {
        out({ stage: 'validate', ...validate }); // validate.ok === false 포함
        process.exit(1);
      }
      const entries = runGen(site);
      const build = buildDist(site);
      const report = await deploy(site);
      out({ ok: report.ok, validate, entries, build, deploy: report });
      if (!report.ok) process.exit(report.log.startsWith('토큰 없음') ? 1 : 75);
      break;
    }

    default:
      console.error(USAGE);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
