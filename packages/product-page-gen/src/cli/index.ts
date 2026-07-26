/**
 * product-page-gen CLI — 스킬(.claude/skills/product-page)이 호출하는 결정적 명령들.
 *
 * 종료코드: 0 성공 · 1 오류(잘못된 인자·스키마 불일치·IO) · 2 게이트 차단(lint block / 무결성 위반 / 마진 미달 / 인화성).
 * 출력은 항상 JSON 한 덩어리(stdout) — 실패도 silent drop 없이 구조화해 내보낸다.
 *
 * 명령:
 *   validate  --brief <path>
 *   lint      --doc <path> | --text <str> [--locale ja|ko] [--where label]
 *   logistics --name <상품명> [--weight <g>] [--dims WxHxT(cm)] [--grade gold|silver|green]
 *   margin    --sale-jpy N --wholesale-krw N --rate N --qxpress-jpy N
 *             [--scenario normal|megawari] [--domestic-ship N] [--no-vat-refund]
 *             [--ad-pct N] [--fx-pct N] [--threshold N]
 *   render    --brief <path> --doc <path> --out <dir>
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { productPageBriefSchema, productPageDocSchema } from '../adapters/schemas.js';
import { lintDoc, lintText, buildReport } from '../core/lint.js';
import { checkLogistics, type Dims, type QxGrade } from '../core/logistics.js';
import { computeMargin } from '../core/margin.js';
import { integrityErrors, renderHtml, renderText } from '../core/render.js';
import type { MarginInput, PageLocale } from '@cak/contracts';

interface Args {
  cmd: string;
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): Args {
  const [cmd = '', ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i];
    if (tok === undefined || !tok.startsWith('--')) continue;
    const eq = tok.indexOf('=');
    if (eq > 2) {
      flags[tok.slice(2, eq)] = tok.slice(eq + 1);
      continue;
    }
    const key = tok.slice(2);
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return { cmd, flags };
}

function str(flags: Args['flags'], key: string): string | undefined {
  const v = flags[key];
  return typeof v === 'string' ? v : undefined;
}

function num(flags: Args['flags'], key: string): number | undefined {
  if (flags[key] === true) throw new Error(`--${key} 값이 없음 (--${key}=값 형태도 가능)`);
  const v = str(flags, key);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`--${key} 는 숫자여야 함: ${v}`);
  return n;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * zod 추론 타입은 옵션 필드를 `field?: T | undefined` 로 넓히지만 계약은
 * exactOptionalPropertyTypes 아래 `field?: T` 다. 입력이 JSON.parse 산물이라
 * undefined 값 프로퍼티는 실존할 수 없으므로 이 좁힘 캐스트는 안전하다.
 */
function asContract<T>(v: unknown): T {
  return v as T;
}

function oneOf<T extends string>(flags: Args['flags'], key: string, allowed: readonly T[]): T | undefined {
  const v = str(flags, key);
  if (v === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(v)) {
    throw new Error(`--${key} 는 ${allowed.join('|')} 중 하나여야 함: ${v}`);
  }
  return v as T;
}

function out(obj: unknown): void {
  console.log(JSON.stringify(obj, null, 2));
}

export function run(argv: string[]): number {
  const { cmd, flags } = parseArgs(argv);

  switch (cmd) {
    case 'validate': {
      const briefPath = str(flags, 'brief');
      if (!briefPath) throw new Error('--brief <path> 필요');
      const parsed = productPageBriefSchema.safeParse(readJson(briefPath));
      if (!parsed.success) {
        out({ ok: false, errors: parsed.error.issues });
        return 2;
      }
      out({ ok: true, id: parsed.data.id });
      return 0;
    }

    case 'lint': {
      const docPath = str(flags, 'doc');
      const text = str(flags, 'text');
      if (docPath) {
        const doc = asContract<import('@cak/contracts').ProductPageDoc>(productPageDocSchema.parse(readJson(docPath)));
        const report = lintDoc(doc);
        out(report);
        return report.gatePassed ? 0 : 2;
      }
      if (text) {
        const locale = oneOf(flags, 'locale', ['ja', 'ko'] as const) as PageLocale | undefined;
        const findings = lintText(text, locale, str(flags, 'where') ?? 'text');
        const report = buildReport(findings);
        out(report);
        return report.gatePassed ? 0 : 2;
      }
      throw new Error('--doc <path> 또는 --text <str> 필요');
    }

    case 'logistics': {
      const name = str(flags, 'name');
      if (!name) throw new Error('--name <상품명> 필요');
      let dims: Dims | undefined;
      const dimsRaw = str(flags, 'dims');
      if (dimsRaw) {
        const m = dimsRaw.split('x').map(Number);
        if (m.length !== 3 || m.some((v) => Number.isNaN(v) || v <= 0)) throw new Error('--dims WxHxT (cm, 예: 15x8x3)');
        dims = { wCm: m[0]!, hCm: m[1]!, tCm: m[2]! };
      }
      const check = checkLogistics({
        name,
        ...(num(flags, 'weight') !== undefined ? { weightG: num(flags, 'weight')! } : {}),
        ...(dims ? { dims } : {}),
        ...(oneOf(flags, 'grade', ['gold', 'silver', 'green'] as const) ? { grade: oneOf(flags, 'grade', ['gold', 'silver', 'green'] as const) as QxGrade } : {}),
      });
      out(check);
      return check.flammable ? 2 : 0;
    }

    case 'margin': {
      const input: MarginInput = {
        salePriceJpy: req(num(flags, 'sale-jpy'), 'sale-jpy'),
        wholesaleKrw: req(num(flags, 'wholesale-krw'), 'wholesale-krw'),
        jpyToKrw: req(num(flags, 'rate'), 'rate'),
        scenario: oneOf(flags, 'scenario', ['normal', 'megawari'] as const) ?? 'normal',
        qxpressJpy: req(num(flags, 'qxpress-jpy'), 'qxpress-jpy'),
        domesticShipKrw: num(flags, 'domestic-ship') ?? 0,
        vatRefund: flags['no-vat-refund'] !== true,
        ...(num(flags, 'ad-pct') !== undefined ? { adRatePct: num(flags, 'ad-pct')! } : {}),
        ...(num(flags, 'fx-pct') !== undefined ? { fxSpreadPct: num(flags, 'fx-pct')! } : {}),
        ...(num(flags, 'threshold') !== undefined ? { passThresholdPct: num(flags, 'threshold')! } : {}),
      };
      const result = computeMargin(input);
      out(result);
      return result.pass ? 0 : 2;
    }

    case 'render': {
      const briefPath = str(flags, 'brief');
      const docPath = str(flags, 'doc');
      const outDir = str(flags, 'out');
      if (!briefPath || !docPath || !outDir) throw new Error('--brief --doc --out 모두 필요');
      const brief = asContract<import('@cak/contracts').ProductPageBrief>(productPageBriefSchema.parse(readJson(briefPath)));
      const doc = asContract<import('@cak/contracts').ProductPageDoc>(productPageDocSchema.parse(readJson(docPath)));

      // 무결성 위반은 게이트 차단(2)으로 — throw(1) 가 아니라 구조화된 거부 (2026-07-26 리뷰).
      const integrity = integrityErrors(brief, doc);
      if (integrity.length > 0) {
        out({ ok: false, reason: '무결성 위반 — brief/doc 정합 수정 후 재시도', errors: integrity });
        return 2;
      }

      // 하드 게이트: doc 전체 + 최종 HTML 에 노출되는 brief 텍스트(상품명=img alt, 전성분)까지 lint.
      const findings = [
        ...lintDoc(doc).findings,
        ...lintText(brief.productName, doc.locale, 'brief.productName'),
        ...(brief.ingredients.length > 0 ? lintText(brief.ingredients.join(', '), doc.locale, 'brief.ingredients') : []),
      ];
      const report = buildReport(findings);
      if (!report.gatePassed) {
        out({ ok: false, reason: 'lint block 존재 — 표현 수정 후 재시도', report });
        return 2;
      }

      const { html, warnings } = renderHtml(brief, doc);
      const text = renderText(brief, doc);
      mkdirSync(outDir, { recursive: true });
      const htmlPath = join(outDir, 'body.html');
      const textPath = join(outDir, 'body.txt');
      const lintPath = join(outDir, 'lint-report.json');
      writeFileSync(htmlPath, html, 'utf8');
      writeFileSync(textPath, text, 'utf8');
      writeFileSync(lintPath, JSON.stringify(report, null, 2), 'utf8');
      out({
        ok: true,
        format: 'qoo10-html',
        htmlPath,
        textPath,
        lintReportPath: lintPath,
        warnings,
        conditionalFindings: report.conditionalCount,
        note: '사람 승인 게이트 통과 전 J\'QSM 등록 금지 (금지선 #8)',
      });
      return 0;
    }

    default:
      throw new Error(`알 수 없는 명령: ${cmd || '(없음)'} — validate|lint|logistics|margin|render`);
  }
}

function req(v: number | undefined, name: string): number {
  if (v === undefined) throw new Error(`--${name} 필요`);
  return v;
}

const isDirect = process.argv[1]?.endsWith('cli/index.ts') || process.argv[1]?.endsWith('cli/index.js');
if (isDirect) {
  try {
    process.exit(run(process.argv.slice(2)));
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    process.exit(1);
  }
}
