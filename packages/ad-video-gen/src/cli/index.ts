/**
 * CLI 진입점 — 원자를 독립 실행/검증하기 위한 얇은 껍데기.
 * 조합 단계(ad-video 스킬)에서는 core/adapters 함수를 라이브러리로 import 한다.
 *
 * 사용:
 *   npm run cli -- check-concept --concept concept.json        # 3중 게이트 → {ok,problems,warnings}
 *   npm run cli -- build-prompt --concept concept.json [--extra-style "..."] [--aspect 16:9|9:16|1:1]
 *   npm run cli -- lint-prompt --text "..." | --file prompt.txt
 *   npm run cli -- estimate --model seedance_2_0 --resolution 1080p --duration 15
 *   npm run cli -- tier --tier standard
 *   npm run cli -- probe --in spot.mp4
 *   npm run cli -- poster --in spot.mp4 --at 13.5 --out poster.jpg
 *   npm run cli -- grid --in spot.mp4 --out grid.png [--count 4] [--interval 4]
 *   npm run cli -- title --in spot.mp4 --out titled.mp4 --text "KOREA JINDO" --fade-at 26.5 [--font path]
 *   npm run cli -- concat --out full.mp4 --in a.mp4 --in b.mp4
 *   npm run cli -- splice --base b.mp4 --insert i.mp4 --out o.mp4 --cut-at 9.5 --resume-at 10 [--base-dur 30]
 *   npm run cli -- mix-vo --video v.mp4 --vo vo.wav --out mixed.mp4 [--bg-vol 0.32] [--delay-ms 900]
 *   npm run cli -- download --url https://... --out clip.mp4
 *
 * 출력 규약: stdout = 데이터(JSON), stderr = 로그.
 * 종료 코드: 0 정상 / 1 검증·사용법 실패 / 75 일시적 실패(네트워크 등).
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { ParseArgsConfig } from 'node:util';
import type { AdVideoAspectRatio } from '@cak/contracts';
import { checkConcept } from '../core/concept.js';
import { buildSpotPrompt, lintPrompt } from '../core/prompt.js';
import { estimateCredits, pickTierDefaults } from '../core/cost.js';
import {
  buildConcatArgs,
  buildGridArgs,
  buildMixVoArgs,
  buildPosterArgs,
  buildSpliceArgs,
  buildTitleArgs,
  type MixVoOpts,
  type SpliceOpts,
  type TitleOpts,
} from '../core/ffargs.js';
import { probe, runFf } from '../adapters/ffmpeg.js';
import { downloadTo } from '../adapters/download.js';
import {
  adVideoModelSchema,
  adVideoResolutionSchema,
  adVideoTierSchema,
  parseAdConcept,
} from '../adapters/schemas.js';
import { createLogger } from '../obs/logger.js';

const log = createLogger();

/** 검증 실패 — exit 1 + {ok:false, problems} */
class UsageError extends Error {}

/** 상대 경로는 INIT_CWD(워크스페이스 실행 시 사용자 위치) 기준으로 해석 */
function resolvePath(p: string): string {
  if (isAbsolute(p)) return p;
  return resolve(process.env.INIT_CWD ?? process.cwd(), p);
}

type Opts = Record<string, string | boolean | string[] | undefined>;

function parse(rest: string[], options: ParseArgsConfig['options']): Opts {
  const { values } = parseArgs({ args: rest, options, allowPositionals: false });
  return values as Opts;
}

function reqStr(o: Opts, key: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v.length === 0) throw new UsageError(`--${key} 필수`);
  return v;
}

function optStr(o: Opts, key: string): string | undefined {
  const v = o[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function reqNum(o: Opts, key: string): number {
  const n = Number(reqStr(o, key));
  if (!Number.isFinite(n)) throw new UsageError(`--${key} 는 숫자여야 함`);
  return n;
}

function optNum(o: Opts, key: string): number | undefined {
  const v = optStr(o, key);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new UsageError(`--${key} 는 숫자여야 함`);
  return n;
}

function readConcept(o: Opts) {
  const p = resolvePath(reqStr(o, 'concept'));
  let raw: string;
  try {
    raw = readFileSync(p, 'utf8');
  } catch {
    throw new UsageError(`컨셉 파일을 읽을 수 없음: ${p}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new UsageError(`컨셉 파일이 JSON 이 아님: ${p}`);
  }
  return parseAdConcept(json);
}

function out(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/** ffmpeg 실행 커맨드 공통 마무리 — 비정상 종료면 stderr 마지막 줄 포함해 실패 */
async function runFfmpegOrFail(args: string[], outPath: string): Promise<void> {
  log.info('ffmpeg_run', { args });
  const res = await runFf('ffmpeg', args);
  if (res.code !== 0) {
    const last = res.stderr.split('\n').map((l) => l.trim()).filter(Boolean).at(-1) ?? '';
    throw new Error(`ffmpeg 실패(exit ${res.code}): ${last}`);
  }
  out({ ok: true, out: outPath });
}

const STR = { type: 'string' } as const;
const STR_MULTI = { type: 'string', multiple: true } as const;

const ASPECT_RATIOS: readonly AdVideoAspectRatio[] = ['16:9', '9:16', '1:1'];

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case 'check-concept': {
      const o = parse(rest, { concept: STR });
      const result = checkConcept(readConcept(o));
      out(result);
      if (!result.ok) process.exit(1);
      break;
    }
    case 'build-prompt': {
      const o = parse(rest, { concept: STR, 'extra-style': STR, aspect: STR });
      const concept = readConcept(o);
      const gate = checkConcept(concept);
      if (!gate.ok) {
        // 게이트 미통과 컨셉으로 프롬프트를 만들어 주지 않는다(생성 유도 방지).
        out({ ok: false, problems: gate.problems, warnings: gate.warnings });
        process.exit(1);
      }
      const extraStyle = optStr(o, 'extra-style');
      const aspectArg = optStr(o, 'aspect');
      if (aspectArg !== undefined && !ASPECT_RATIOS.includes(aspectArg as AdVideoAspectRatio)) {
        throw new UsageError(`--aspect 는 ${ASPECT_RATIOS.join(' | ')} 중 하나`);
      }
      const promptOpts: { extraStyle?: string; aspectRatio?: AdVideoAspectRatio } = {};
      if (extraStyle !== undefined) promptOpts.extraStyle = extraStyle;
      if (aspectArg !== undefined) promptOpts.aspectRatio = aspectArg as AdVideoAspectRatio;
      const prompt = buildSpotPrompt(concept, promptOpts);
      const { violations } = lintPrompt(prompt);
      const aspectRatio = aspectArg ?? concept.aspectRatio ?? '16:9';
      out({ ok: violations.length === 0, prompt, aspectRatio, violations, warnings: gate.warnings });
      if (violations.length > 0) process.exit(1);
      break;
    }
    case 'lint-prompt': {
      const o = parse(rest, { text: STR, file: STR });
      const text = optStr(o, 'text');
      const file = optStr(o, 'file');
      if (text === undefined && file === undefined) throw new UsageError('--text 또는 --file 필수');
      const prompt = text ?? readFileSync(resolvePath(file!), 'utf8');
      const { violations } = lintPrompt(prompt);
      out({ ok: violations.length === 0, violations });
      if (violations.length > 0) process.exit(1);
      break;
    }
    case 'estimate': {
      const o = parse(rest, { model: STR, resolution: STR, duration: STR });
      const model = adVideoModelSchema.safeParse(reqStr(o, 'model'));
      const resolution = adVideoResolutionSchema.safeParse(reqStr(o, 'resolution'));
      if (!model.success) throw new UsageError(`--model 무효 — 허용: seedance_2_0|seedance_2_0_fast|kling3_0|veo3_1|marketing_studio_video`);
      if (!resolution.success) throw new UsageError(`--resolution 무효 — 허용: 480p|720p|1080p|4k`);
      out(estimateCredits(model.data, resolution.data, reqNum(o, 'duration')));
      break;
    }
    case 'tier': {
      const o = parse(rest, { tier: STR });
      const tier = adVideoTierSchema.safeParse(reqStr(o, 'tier'));
      if (!tier.success) throw new UsageError('--tier 무효 — 허용: draft|standard|broadcast');
      const defaults = pickTierDefaults(tier.data);
      const estimate = estimateCredits(defaults.model, defaults.resolution, defaults.durationSec);
      out({ ...defaults, estimate });
      break;
    }
    case 'probe': {
      const o = parse(rest, { in: STR });
      out(await probe(resolvePath(reqStr(o, 'in'))));
      break;
    }
    case 'poster': {
      const o = parse(rest, { in: STR, at: STR, out: STR });
      const outPath = resolvePath(reqStr(o, 'out'));
      await runFfmpegOrFail(buildPosterArgs(resolvePath(reqStr(o, 'in')), reqNum(o, 'at'), outPath), outPath);
      break;
    }
    case 'grid': {
      const o = parse(rest, { in: STR, out: STR, count: STR, interval: STR });
      const outPath = resolvePath(reqStr(o, 'out'));
      const opts: { count?: number; intervalSec?: number } = {};
      const count = optNum(o, 'count');
      const interval = optNum(o, 'interval');
      if (count !== undefined) opts.count = count;
      if (interval !== undefined) opts.intervalSec = interval;
      await runFfmpegOrFail(buildGridArgs(resolvePath(reqStr(o, 'in')), outPath, opts), outPath);
      break;
    }
    case 'title': {
      const o = parse(rest, { in: STR, out: STR, text: STR, 'fade-at': STR, font: STR, 'font-size': STR, 'y-offset': STR });
      const outPath = resolvePath(reqStr(o, 'out'));
      const opts: TitleOpts = { text: reqStr(o, 'text'), fadeInAt: reqNum(o, 'fade-at') };
      const font = optStr(o, 'font');
      const fontSize = optNum(o, 'font-size');
      const yOffset = optNum(o, 'y-offset');
      if (font !== undefined) opts.fontFile = resolvePath(font);
      if (fontSize !== undefined) opts.fontSize = fontSize;
      if (yOffset !== undefined) opts.yOffset = yOffset;
      await runFfmpegOrFail(buildTitleArgs(resolvePath(reqStr(o, 'in')), outPath, opts), outPath);
      break;
    }
    case 'concat': {
      const o = parse(rest, { in: STR_MULTI, out: STR });
      const outPath = resolvePath(reqStr(o, 'out'));
      const ins = (Array.isArray(o.in) ? o.in : []).map(resolvePath);
      if (ins.length < 2) throw new UsageError('--in 을 2개 이상 지정 (이어붙일 순서대로)');
      // concat demuxer 용 리스트 파일 — 출력 옆에 임시 생성 후 정리
      const listFile = `${outPath}.concat.txt`;
      writeFileSync(listFile, ins.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
      try {
        await runFfmpegOrFail(buildConcatArgs(listFile, outPath), outPath);
      } finally {
        try {
          unlinkSync(listFile);
        } catch {
          /* 임시파일 정리 실패는 무해 */
        }
      }
      break;
    }
    case 'splice': {
      const o = parse(rest, {
        base: STR, insert: STR, out: STR, 'cut-at': STR, 'resume-at': STR, 'base-dur': STR,
        title: STR, 'fade-at': STR, font: STR,
      });
      const outPath = resolvePath(reqStr(o, 'out'));
      const opts: SpliceOpts = { cutAt: reqNum(o, 'cut-at'), resumeAt: reqNum(o, 'resume-at') };
      const baseDur = optNum(o, 'base-dur');
      if (baseDur !== undefined) opts.baseDur = baseDur;
      const titleText = optStr(o, 'title');
      if (titleText !== undefined) {
        const fadeAt = optNum(o, 'fade-at');
        if (fadeAt === undefined) throw new UsageError('--title 사용 시 --fade-at 필수');
        const title: TitleOpts = { text: titleText, fadeInAt: fadeAt };
        const font = optStr(o, 'font');
        if (font !== undefined) title.fontFile = resolvePath(font);
        opts.title = title;
      }
      await runFfmpegOrFail(
        buildSpliceArgs(resolvePath(reqStr(o, 'base')), resolvePath(reqStr(o, 'insert')), outPath, opts),
        outPath,
      );
      break;
    }
    case 'mix-vo': {
      const o = parse(rest, { video: STR, vo: STR, out: STR, 'bg-vol': STR, 'vo-vol': STR, 'delay-ms': STR });
      const outPath = resolvePath(reqStr(o, 'out'));
      const opts: MixVoOpts = {};
      const bgVol = optNum(o, 'bg-vol');
      const voVol = optNum(o, 'vo-vol');
      const delayMs = optNum(o, 'delay-ms');
      if (bgVol !== undefined) opts.bgVol = bgVol;
      if (voVol !== undefined) opts.voVol = voVol;
      if (delayMs !== undefined) opts.delayMs = delayMs;
      await runFfmpegOrFail(buildMixVoArgs(resolvePath(reqStr(o, 'video')), resolvePath(reqStr(o, 'vo')), outPath, opts), outPath);
      break;
    }
    case 'download': {
      const o = parse(rest, { url: STR, out: STR });
      try {
        out(await downloadTo(reqStr(o, 'url'), resolvePath(reqStr(o, 'out'))));
      } catch (e) {
        // 네트워크 순단·5xx 는 일시적 실패로 분류(exit 75) — 래퍼가 재시도 판단
        const msg = e instanceof Error ? e.message : String(e);
        if (/HTTP 5\d\d/.test(msg) || /fetch failed/i.test(msg)) {
          console.log(JSON.stringify({ ok: false, problems: [msg] }));
          process.exit(75);
        }
        throw e;
      }
      break;
    }
    default:
      console.error(
        '명령: check-concept | build-prompt | lint-prompt | estimate | tier | probe | poster | grid | title | concat | splice | mix-vo | download',
      );
      process.exit(1);
  }
}

main().catch((err) => {
  if (err instanceof UsageError) {
    console.log(JSON.stringify({ ok: false, problems: [err.message] }));
    process.exit(1);
  }
  log.error('cli_error', { message: err instanceof Error ? err.message : String(err) });
  console.log(JSON.stringify({ ok: false, problems: [err instanceof Error ? err.message : String(err)] }));
  process.exit(1);
});
