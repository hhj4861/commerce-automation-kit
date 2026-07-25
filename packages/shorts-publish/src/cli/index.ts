/**
 * CLI 진입점 — 원자를 독립 실행/검증하기 위한 얇은 껍데기.
 * 조합 단계(오케스트레이터/스킬)에서는 core/adapters 함수를 라이브러리로 import 한다.
 *
 * 사용:
 *   npm run cli -- render --in ad.mp4 --out short.mp4 --mode blur-brand \
 *       --brand "KOREA JINDO" [--tagline "충성심의 대명사, 진돗개"] [--no-fadeout]
 *   npm run cli -- describe-upload --video short.mp4 --title "..." \
 *       --platforms youtube,instagram,tiktok [--user NAME] [--desc "..."] [--tags a,b]
 *   npm run cli -- publish --in ad.mp4 --out short.mp4 --mode blur-brand --brand "KOREA JINDO" \
 *       --title "..." --platforms youtube,instagram,tiktok [--desc][--tags][--dry-run]
 *   npm run cli -- poll --request-id <id>
 *
 * 출력 규약: stdout = 데이터(JSON), stderr = 로그.
 * 종료 코드: 0 정상 / 1 검증·사용법·업로드 실패 / 75 일시적 실패(네트워크).
 * 자격증명: 환경변수 UPLOAD_POST_API_KEY, UPLOAD_POST_USER (또는 --user).
 */
import { isAbsolute, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { ParseArgsConfig } from 'node:util';
import type { PublishTarget, ShortsMode } from '@cak/contracts';
import { buildShortsArgs, type ShortsRenderOpts } from '../core/ffargs.js';
import { describeUpload } from '../core/upload.js';
import { probe, runFfmpegOrThrow } from '../adapters/ffmpeg.js';
import { uploadShort, pollStatus } from '../adapters/upload-post.js';
import { shortsModeSchema, shortsPlatformSchema, youtubePrivacySchema } from '../adapters/schemas.js';
import { createLogger } from '../obs/logger.js';

const log = createLogger();

class UsageError extends Error {}

/** 상대 경로는 INIT_CWD(워크스페이스 실행 시 사용자 위치) 기준으로 해석. */
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

function parseMode(o: Opts): ShortsMode {
  const m = shortsModeSchema.safeParse(reqStr(o, 'mode'));
  if (!m.success) throw new UsageError('--mode 무효 — 허용: crop|blur|blur-brand|letterbox|heavy');
  return m.data;
}

function parsePlatforms(csv: string): PublishTarget['platforms'] {
  const parts = csv.split(',').map((s) => s.trim()).filter(Boolean);
  const platforms = parts.map((p) => {
    const r = shortsPlatformSchema.safeParse(p);
    if (!r.success) throw new UsageError(`--platforms 무효 값: ${p} (허용: youtube|instagram|tiktok)`);
    return r.data;
  });
  if (platforms.length === 0) throw new UsageError('--platforms 최소 1개 (예: youtube,instagram,tiktok)');
  return platforms;
}

/** render 옵션 조립(+ blur-brand 는 페이드아웃용 duration 프로브). */
async function buildRenderOpts(o: Opts, mode: ShortsMode): Promise<ShortsRenderOpts> {
  const opts: ShortsRenderOpts = {};
  const brand = optStr(o, 'brand');
  const tagline = optStr(o, 'tagline');
  const width = optNum(o, 'width');
  const height = optNum(o, 'height');
  const hook = optStr(o, 'hook');
  const caption = optStr(o, 'caption');
  if (brand !== undefined) opts.brand = brand;
  if (tagline !== undefined) opts.tagline = tagline;
  if (width !== undefined) opts.width = width;
  if (height !== undefined) opts.height = height;
  if (hook !== undefined) opts.hook = hook;
  if (caption !== undefined) opts.caption = caption;
  // 워드마크 있는 blur-brand 는 "끝 3초 양보" 페이드아웃을 위해 소스 길이가 필요.
  if (mode === 'blur-brand' && brand !== undefined && !flag(o, 'no-fadeout')) {
    const inPath = resolvePath(reqStr(o, 'in'));
    const p = await probe(inPath);
    opts.durationSec = p.durationSec;
  }
  return opts;
}

async function renderTo(o: Opts): Promise<string> {
  const mode = parseMode(o);
  const inPath = resolvePath(reqStr(o, 'in'));
  const outPath = resolvePath(reqStr(o, 'out'));
  const opts = await buildRenderOpts(o, mode);
  const args = buildShortsArgs(inPath, outPath, mode, opts);
  log.info('ffmpeg_render', { mode, in: inPath, out: outPath });
  await runFfmpegOrThrow(args);
  return outPath;
}

function buildTarget(o: Opts): PublishTarget {
  const target: PublishTarget = {
    platforms: parsePlatforms(reqStr(o, 'platforms')),
    title: reqStr(o, 'title'),
    aiDisclosed: !flag(o, 'no-ai-disclose'),
  };
  const desc = optStr(o, 'desc');
  const tags = optStr(o, 'tags');
  const ytp = optStr(o, 'yt-privacy');
  const ttp = optStr(o, 'tiktok-privacy');
  if (desc !== undefined) target.description = desc;
  if (tags !== undefined) target.tags = tags.split(',').map((s) => s.trim()).filter(Boolean);
  if (ytp !== undefined) {
    const r = youtubePrivacySchema.safeParse(ytp);
    if (!r.success) throw new UsageError('--yt-privacy 무효 — 허용: private|unlisted|public');
    target.youtubePrivacy = r.data;
  } else {
    target.youtubePrivacy = 'private'; // POC 안전 기본값
  }
  if (ttp !== undefined) target.tiktokPrivacy = ttp;
  return target;
}

const STR = { type: 'string' } as const;
const BOOL = { type: 'boolean' } as const;

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case 'render': {
      const o = parse(rest, {
        in: STR, out: STR, mode: STR, brand: STR, tagline: STR,
        width: STR, height: STR, hook: STR, caption: STR, 'no-fadeout': BOOL,
      });
      const outPath = await renderTo(o);
      out({ ok: true, out: outPath });
      break;
    }
    case 'describe-upload': {
      const o = parse(rest, {
        video: STR, user: STR, title: STR, platforms: STR, desc: STR, tags: STR,
        thumbnail: STR, 'yt-privacy': STR, 'tiktok-privacy': STR, 'no-ai-disclose': BOOL,
      });
      const user = optStr(o, 'user') ?? process.env.UPLOAD_POST_USER ?? '(미설정)';
      const video = resolvePath(reqStr(o, 'video'));
      const thumb = optStr(o, 'thumbnail');
      const desc = describeUpload(buildTarget(o), user, video, thumb ? resolvePath(thumb) : undefined);
      out(desc);
      break;
    }
    case 'publish': {
      const o = parse(rest, {
        in: STR, out: STR, mode: STR, brand: STR, tagline: STR, width: STR, height: STR,
        'no-fadeout': BOOL, hook: STR, caption: STR,
        user: STR, title: STR, platforms: STR, desc: STR, tags: STR, thumbnail: STR,
        'yt-privacy': STR, 'tiktok-privacy': STR, 'no-ai-disclose': BOOL, 'dry-run': BOOL,
      });
      const target = buildTarget(o); // 렌더 전에 업로드 인자부터 검증(빨리 실패)
      const outPath = await renderTo(o);
      const apiKey = process.env.UPLOAD_POST_API_KEY;
      const user = optStr(o, 'user') ?? process.env.UPLOAD_POST_USER;
      const thumb = optStr(o, 'thumbnail');
      const thumbPath = thumb ? resolvePath(thumb) : undefined;

      if (flag(o, 'dry-run') || !apiKey || !user) {
        const why = flag(o, 'dry-run') ? 'dry-run' : 'UPLOAD_POST_API_KEY/USER 미설정 → 전송 안 함';
        out({ ok: true, rendered: outPath, upload: 'skipped', why, request: describeUpload(target, user ?? '(미설정)', outPath, thumbPath) });
        break;
      }
      const result = await uploadShort({ apiKey, user, video: outPath, target, ...(thumbPath ? { thumbnail: thumbPath } : {}) });
      out({ rendered: outPath, ...result });
      if (result.status === 0) process.exit(75); // 네트워크 순단 = 일시적
      if (!result.ok) process.exit(1);
      break;
    }
    case 'poll': {
      const o = parse(rest, { 'request-id': STR });
      const apiKey = process.env.UPLOAD_POST_API_KEY;
      if (!apiKey) throw new UsageError('환경변수 UPLOAD_POST_API_KEY 필요');
      const st = await pollStatus(apiKey, reqStr(o, 'request-id'));
      out(st);
      if (st.status === 0) process.exit(75); // 네트워크 순단 = 일시적(publish 와 동일 매핑)
      if (!st.ok) process.exit(1);
      break;
    }
    default:
      console.error('명령: render | describe-upload | publish | poll');
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
