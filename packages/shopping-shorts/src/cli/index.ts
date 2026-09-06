/**
 * CLI 진입점 — 원자를 독립 실행/검증하기 위한 얇은 껍데기.
 * 조합 단계(apps/shopshorts 대시보드·스킬)에서는 이 CLI 를 호출하거나 core 를 import 한다.
 *
 * 사용:
 *   npm run cli -- lint --job job.json
 *   npm run cli -- disclosure --text "..." [--append]
 *   npm run cli -- estimate --job job.json --model kling3_0-pro [--no-tts]
 *   npm run cli -- assemble --job job.json --clips a.mp4,b.mp4 --out short.mp4 \
 *       [--narration vo.mp3] [--music bgm.mp3] [--font /path.ttc]
 *
 * 출력 규약: stdout = 데이터(JSON), stderr = 로그.
 * 종료 코드: 0 정상 / 1 검증 실패·사용법 오류(assemble 은 lint block 시 렌더 거부).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { ParseArgsConfig } from 'node:util';
import type { ShoppingShortsAssembleSpec } from '@cak/contracts';
import { lintScript } from '../core/lint.js';
import { rankScripts } from '../core/score.js';
import { hasDisclosure, overlaySpecFor, withDisclosure } from '../core/disclosure.js';
import { estimateShort } from '../core/estimate.js';
import { buildAssembleArgs, buildSyncedAssembleArgs, chunkTimings, cuesFromBeats, splitSubtitleChunks, type SyncedSegment } from '../core/ffargs.js';
import { probe, probeAudioDuration, runFfmpegOrThrow } from '../adapters/ffmpeg.js';
import { jobFileSchema, toJob } from '../adapters/schemas.js';
import type { ShoppingShortsBrief, ShortsScript } from '@cak/contracts';
import { createLogger } from '../obs/logger.js';

const log = createLogger();

class UsageError extends Error {}

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
function flag(o: Opts, key: string): boolean {
  return o[key] === true;
}
function out(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function loadJob(path: string): { brief: ShoppingShortsBrief; script: ShortsScript } {
  const raw = readFileSync(resolvePath(path), 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UsageError(`잡 파일이 JSON 이 아님: ${path}`);
  }
  const checked = jobFileSchema.safeParse(parsed);
  if (!checked.success) {
    throw new UsageError(
      `잡 파일 스키마 불일치: ${checked.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  return toJob(checked.data);
}

const STR = { type: 'string' } as const;
const BOOL = { type: 'boolean' } as const;

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case 'lint': {
      const o = parse(rest, { job: STR });
      const job = loadJob(reqStr(o, 'job'));
      const report = lintScript(job.brief, job.script);
      out(report);
      if (!report.ok) process.exitCode = 1;
      break;
    }

    case 'disclosure': {
      const o = parse(rest, { text: STR, append: BOOL });
      const text = reqStr(o, 'text');
      if (flag(o, 'append')) {
        out({ text: withDisclosure(text) });
      } else {
        out({ hasDisclosure: hasDisclosure(text) });
      }
      break;
    }

    case 'score': {
      // 생성 전 효율 참고 점수 — 후보 잡 여러 개를 총점순으로. block 없음, 사람 선택 보조.
      const o = parse(rest, { jobs: STR });
      const paths = reqStr(o, 'jobs')
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x.length > 0);
      if (paths.length === 0) throw new UsageError('--jobs a.json[,b.json,...] 필요');
      const ranked = rankScripts(paths.map((pth) => loadJob(pth)));
      out({
        ok: true,
        advisory: '참고 점수 — 자동 선정 금지, 최종 선택은 사람(CLAUDE.md)',
        ranked: ranked.map((r) => ({
          briefId: r.script.briefId,
          hookType: r.script.hookType,
          title: r.script.title,
          total: r.total,
          dimensions: r.dimensions,
          notes: r.notes,
        })),
      });
      break;
    }

    case 'estimate': {
      const o = parse(rest, { job: STR, model: STR, 'no-tts': BOOL });
      const job = loadJob(reqStr(o, 'job'));
      const durations = job.script.beats.map((b) => b.durationSec);
      out(estimateShort(durations, optStr(o, 'model') ?? 'kling3_0-pro', !flag(o, 'no-tts')));
      break;
    }

    case 'assemble': {
      const o = parse(rest, {
        job: STR,
        clips: STR,
        out: STR,
        narration: STR,
        'narration-dir': STR,
        music: STR,
        font: STR,
      });
      const job = loadJob(reqStr(o, 'job'));

      // 게이트: lint block 이 있으면 렌더를 거부한다(우회 경로 없음).
      const report = lintScript(job.brief, job.script);
      if (!report.ok) {
        out({ ok: false, refused: 'lint-block', report });
        process.exitCode = 1;
        return;
      }

      const clips = reqStr(o, 'clips')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(resolvePath);
      if (clips.length !== job.script.beats.length) {
        throw new UsageError(
          `클립 수(${clips.length})와 비트 수(${job.script.beats.length})가 다름 — 비트 순서대로 지정`,
        );
      }

      const outPath = resolvePath(reqStr(o, 'out'));
      const narration = optStr(o, 'narration');
      const narrationDir = optStr(o, 'narration-dir');
      const music = optStr(o, 'music');

      // ---- 동기 모드 (Vrew 스타일): 비트별 내레이션에 영상·자막을 맞춘다 ----
      if (narrationDir !== undefined) {
        const voDir = resolvePath(narrationDir);
        const manifest = JSON.parse(readFileSync(join(voDir, 'narration.json'), 'utf8')) as {
          clips: { file: string; text: string }[];
        };
        if (manifest.clips.length !== job.script.beats.length) {
          throw new UsageError(`내레이션 ${manifest.clips.length}개 ≠ 비트 ${job.script.beats.length}개`);
        }
        const capDir = join(dirname(outPath), 'captions');
        mkdirSync(capDir, { recursive: true });
        const pad = 0.35;
        const segments: SyncedSegment[] = [];
        for (let i = 0; i < clips.length; i++) {
          const clipInfo = await probe(clips[i]!);
          const narFile = manifest.clips[i]!.file;
          const narProbe = await probeAudioDuration(narFile);
          // 자막 = 내레이션을 구절(한 줄) 단위로 분할, 내레이션 진행에 글자수 비례 배분
          const chunks = splitSubtitleChunks(job.script.beats[i]!.narration);
          const timings = chunkTimings(chunks, narProbe + pad);
          const subtitles = chunks.map((c, k) => {
            const file = join(capDir, `cap-${i}-${k}.txt`);
            writeFileSync(file, c, 'utf8');
            return { file, startSec: timings[k]!.startSec, endSec: timings[k]!.endSec };
          });
          segments.push({
            clip: clips[i]!,
            clipDurationSec: clipInfo.durationSec,
            narrationFile: narFile,
            narrationDurationSec: narProbe,
            subtitles,
          });
        }
        const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
        const defaultVrewFont = join(pkgRoot, 'assets', 'NanumPenScript-Regular.ttf');
        const args = buildSyncedAssembleArgs(segments, outPath, {
          width: 1080,
          height: 1920,
          // 제휴 링크 또는 sponsored(유료 의뢰·자체 판매)면 "(광고)" 번인 — 판단은 overlaySpecFor 한 곳.
          disclosureOverlay: overlaySpecFor(job.brief).overlay,
          disclosureText: overlaySpecFor(job.brief).text,
          narrationPadSec: pad,
          ...(music !== undefined ? { music: resolvePath(music) } : {}),
          fontFile: optStr(o, 'font') ?? defaultVrewFont,
        });
        log.info('assemble.synced.start', { segments: segments.length, out: outPath });
        await runFfmpegOrThrow(args);
        const probed = await probe(outPath);
        out({ ok: true, mode: 'synced', out: outPath, probe: probed, lintWarnings: report.findings });
        break;
      }

      const spec: ShoppingShortsAssembleSpec = {
        clips,
        captions: cuesFromBeats(job.script.beats),
        width: 1080,
        height: 1920,
        // 제휴 링크 또는 sponsored 면 영상 내 고지 오버레이 강제(overlaySpecFor 단일 판단).
        disclosureOverlay: overlaySpecFor(job.brief).overlay,
        ...(narration !== undefined ? { narrationAudio: resolvePath(narration) } : {}),
        ...(music !== undefined ? { music: resolvePath(music) } : {}),
      };
      const font = optStr(o, 'font');
      const args = buildAssembleArgs(spec, outPath, font !== undefined ? { fontFile: font } : {});
      log.info('assemble.start', { clips: clips.length, out: outPath });
      await runFfmpegOrThrow(args);
      const probed = await probe(outPath);
      out({ ok: true, out: outPath, probe: probed, lintWarnings: report.findings });
      break;
    }

    case 'probe': {
      const o = parse(rest, { in: STR });
      out(await probe(resolvePath(reqStr(o, 'in'))));
      break;
    }

    default:
      throw new UsageError('명령: lint | disclosure | score | estimate | assemble | probe');
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof UsageError) {
    out({ ok: false, problems: [message] });
  } else {
    log.error('cli.error', { message });
    out({ ok: false, error: message });
  }
  process.exitCode = 1;
});
