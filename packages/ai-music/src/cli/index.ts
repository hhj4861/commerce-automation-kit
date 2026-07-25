/**
 * CLI 진입점 — 원자를 독립 실행/검증하기 위한 얇은 껍데기.
 *
 * 사용:
 *   npm run cli -- prompt --brief brief.json [--backend suno-manual|elevenlabs|suno-auto]
 *   npm run cli -- backends [--priority elevenlabs,suno-manual]
 *   npm run cli -- generate --brief brief.json --out track.mp3 \
 *        [--backend elevenlabs | --priority elevenlabs,suno-manual] [--el-model music_v2]
 *   npm run cli -- mix --video ad.mp4 --music track.mp3 --out scored.mp4 \
 *        [--music-vol 0.28] [--no-duck] [--lufs -14] [--fade-in 0.8] [--fade-out 2]
 *
 * 출력 규약: stdout = 데이터(JSON), stderr = 로그. 종료코드: 0 정상 / 1 실패 / 75 일시적(네트워크).
 * 자격증명: ELEVENLABS_API_KEY (elevenlabs 백엔드). suno 는 키 불필요(수동/예약).
 */
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { ParseArgsConfig } from 'node:util';
import type { MusicBackendId, MusicBrief } from '@cak/contracts';
import { briefToPrompt } from '../core/prompt.js';
import { buildMusicMixArgs } from '../core/mixargs.js';
import { normalizeNegativeFlags } from '../core/argv.js';
import { BACKENDS, DEFAULT_PRIORITY, resolveBackend } from '../core/backends.js';
import { probeMedia, runFfmpegOrThrow } from '../adapters/ffmpeg.js';
import { generateElevenLabs } from '../adapters/elevenlabs.js';
import { generateSuno } from '../adapters/suno.js';
import { musicBackendIdSchema, parseMusicBrief } from '../adapters/schemas.js';
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
function optNum(o: Opts, key: string): number | undefined {
  const v = optStr(o, key);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new UsageError(`--${key} 는 숫자여야 함`);
  return n;
}
function flag(o: Opts, key: string): boolean {
  return o[key] === true;
}
function out(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function readBrief(o: Opts): MusicBrief {
  const p = resolvePath(reqStr(o, 'brief'));
  let raw: string;
  try {
    raw = readFileSync(p, 'utf8');
  } catch {
    throw new UsageError(`브리프 파일을 읽을 수 없음: ${p}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new UsageError(`브리프 파일이 JSON 이 아님: ${p}`);
  }
  return parseMusicBrief(json);
}

function parsePriority(o: Opts): MusicBackendId[] {
  const csv = optStr(o, 'priority');
  if (csv === undefined) return DEFAULT_PRIORITY;
  const ids = csv.split(',').map((s) => s.trim()).filter(Boolean);
  return ids.map((id) => {
    const r = musicBackendIdSchema.safeParse(id);
    if (!r.success) throw new UsageError(`--priority 무효 값: ${id} (허용: suno-manual|suno-auto|elevenlabs)`);
    return r.data;
  });
}

const STR = { type: 'string' } as const;
const BOOL = { type: 'boolean' } as const;

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case 'prompt': {
      const o = parse(rest, { brief: STR, backend: STR });
      const backendRaw = optStr(o, 'backend') ?? 'suno-manual';
      const backend = musicBackendIdSchema.safeParse(backendRaw);
      if (!backend.success) throw new UsageError('--backend 무효 — 허용: suno-manual|suno-auto|elevenlabs');
      out(briefToPrompt(readBrief(o), backend.data));
      break;
    }

    case 'backends': {
      const o = parse(rest, { priority: STR });
      const priority = parsePriority(o);
      const resolved = resolveBackend(priority, (env) => Boolean(process.env[env]));
      out({
        registry: Object.values(BACKENDS),
        priority,
        chosen: resolved.chosen?.id ?? null,
        skipped: resolved.skipped,
      });
      break;
    }

    case 'generate': {
      const o = parse(rest, { brief: STR, out: STR, backend: STR, priority: STR, 'el-model': STR, format: STR });
      const brief = readBrief(o);
      // 단일 --backend 지정 시 그것만, 아니면 우선순위 해석
      let chosenId: MusicBackendId;
      let skipped: { id: MusicBackendId; reason: string }[] = [];
      const single = optStr(o, 'backend');
      if (single !== undefined) {
        const r = musicBackendIdSchema.safeParse(single);
        if (!r.success) throw new UsageError('--backend 무효 — 허용: suno-manual|suno-auto|elevenlabs');
        chosenId = r.data;
      } else {
        const resolved = resolveBackend(parsePriority(o), (env) => Boolean(process.env[env]));
        skipped = resolved.skipped;
        if (resolved.chosen === undefined) {
          // 아무 자동 백엔드도 못 씀 → suno-manual 프롬프트로 안내(실패 아님)
          out({ ok: false, chosen: null, skipped, guidance: briefToPrompt(brief, 'suno-manual') });
          process.exit(1);
        }
        chosenId = resolved.chosen.id;
      }

      if (chosenId === 'elevenlabs') {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) throw new UsageError('ELEVENLABS_API_KEY 환경변수 필요');
        const plan = briefToPrompt(brief, 'elevenlabs');
        const outPath = resolvePath(reqStr(o, 'out'));
        const modelRaw = optStr(o, 'el-model');
        const model = modelRaw === 'music_v1' || modelRaw === 'music_v2' ? modelRaw : 'music_v2';
        log.info('elevenlabs_generate', { lengthSec: plan.lengthSec, instrumental: plan.instrumental });
        try {
          const track = await generateElevenLabs({
            apiKey,
            prompt: plan.prompt,
            lengthSec: plan.lengthSec,
            instrumental: plan.instrumental,
            modelId: model,
            outPath,
            ...(optStr(o, 'format') !== undefined ? { outputFormat: optStr(o, 'format')! } : {}),
          });
          out({ ok: true, track, skipped });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // 네트워크 순단·레이트리밋(429)·상류 5xx 는 일시적(exit 75) — 형제 원자와 동일 분류
          if (/네트워크|fetch/.test(msg) || /HTTP (429|5\d\d)/.test(msg)) {
            console.log(JSON.stringify({ ok: false, problems: [msg] }));
            process.exit(75);
          }
          throw e;
        }
        break;
      }

      if (chosenId === 'suno-auto') {
        // 가드 스텁 — 명확한 안내와 함께 실패(비공식 우회 금지)
        await generateSuno();
        break; // 도달 불가
      }

      // suno-manual — 파일을 만들지 않고 프롬프트/단계 안내(사람 게이트)
      out({ ok: true, backend: 'suno-manual', mode: 'manual', plan: briefToPrompt(brief, 'suno-manual'), skipped });
      break;
    }

    case 'mix': {
      // 음수 값 플래그(--lufs -14 등)를 parseArgs 가 옵션으로 오인하지 않게 정규화
      const norm = normalizeNegativeFlags(rest, ['lufs', 'fade-in', 'fade-out', 'music-vol']);
      const o = parse(norm, {
        video: STR, music: STR, out: STR, 'music-vol': STR, 'no-duck': BOOL,
        lufs: STR, 'fade-in': STR, 'fade-out': STR,
      });
      const video = resolvePath(reqStr(o, 'video'));
      const music = resolvePath(reqStr(o, 'music'));
      const outPath = resolvePath(reqStr(o, 'out'));
      const info = await probeMedia(video);
      const mixOpts: Parameters<typeof buildMusicMixArgs>[3] = {
        durationSec: info.durationSec,
        hasVideoAudio: info.hasAudio,
        duckUnderVoice: !flag(o, 'no-duck'),
      };
      const mv = optNum(o, 'music-vol');
      const lufs = optNum(o, 'lufs');
      const fi = optNum(o, 'fade-in');
      const fo = optNum(o, 'fade-out');
      if (mv !== undefined) mixOpts.musicVol = mv;
      if (lufs !== undefined) mixOpts.targetLufs = lufs;
      if (fi !== undefined) mixOpts.fadeInSec = fi;
      if (fo !== undefined) mixOpts.fadeOutSec = fo;
      log.info('music_mix', { video, music, out: outPath, ...mixOpts });
      await runFfmpegOrThrow(buildMusicMixArgs(video, music, outPath, mixOpts));
      out({ ok: true, out: outPath, durationSec: info.durationSec, hadVideoAudio: info.hasAudio });
      break;
    }

    default:
      console.error('명령: prompt | backends | generate | mix');
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
