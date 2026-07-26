/**
 * CLI 진입점 — YouTube 롱폼 업로드.
 *
 * 사용:
 *   npm run cli -- auth                         # 1회 브라우저 인증 → 리프레시 토큰 저장(대화형)
 *   npm run cli -- channels                      # 인증 검증(내 채널 목록)
 *   npm run cli -- upload --video mix.mp4 --title "…" [--description "…"|--desc-file f] \
 *        [--tags a,b] [--category 10] [--privacy private|unlisted|public] \
 *        [--thumbnail thumb.jpg] [--chapters "…"|--chapters-file f] [--made-for-kids]
 *
 * 환경변수:
 *   YOUTUBE_CLIENT_SECRET  = Google Cloud OAuth 데스크톱 클라이언트 client_secret.json 경로 (필수)
 *   YOUTUBE_TOKEN_PATH     = 리프레시 토큰 저장 경로 (기본 ~/.cak-youtube-tokens.json)
 *
 * 출력: stdout=데이터(JSON), stderr=로그/프롬프트. 종료코드 0/1/75(일시적).
 */
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline';
import type { ParseArgsConfig } from 'node:util';
import type { YoutubeUploadJob, YoutubeUploadResult } from '@cak/contracts';
import { buildDescription } from '../core/description.js';
import { buildVideoRequestBody } from '../core/video-resource.js';
import {
  createOAuthClient,
  loadTokens,
  authUrl,
  exchangeCode,
  listChannels,
  uploadVideo,
  setThumbnail,
  type OAuthClient,
} from '../adapters/youtube.js';
import { youtubePrivacySchema } from '../adapters/schemas.js';
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

function clientSecretPath(): string {
  const p = process.env.YOUTUBE_CLIENT_SECRET;
  if (p === undefined || p.length === 0) {
    throw new UsageError('YOUTUBE_CLIENT_SECRET 환경변수 필요 (client_secret.json 경로)');
  }
  return p;
}
function tokenPath(): string {
  return process.env.YOUTUBE_TOKEN_PATH ?? resolve(homedir(), '.cak-youtube-tokens.json');
}

/** 인증된 OAuth 클라이언트(토큰 없으면 안내). */
function authedClient(): OAuthClient {
  const client = createOAuthClient(clientSecretPath());
  if (!loadTokens(client, tokenPath())) {
    throw new UsageError(`인증 토큰이 없습니다 — 먼저 \`cli -- auth\` 로 1회 인증하세요 (${tokenPath()})`);
  }
  return client;
}

/** 파일 또는 문자열 값(--x 또는 --x-file). */
function strOrFile(o: Opts, key: string): string | undefined {
  const direct = optStr(o, key);
  if (direct !== undefined) return direct;
  const file = optStr(o, `${key}-file`);
  if (file !== undefined) return readFileSync(resolvePath(file), 'utf8');
  return undefined;
}

/** 일시적 에러(네트워크·429·5xx)면 exit 75, 아니면 재던짐. */
function exitTransientOrThrow(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: unknown }).code;
  const status = typeof code === 'number' ? code : Number(code);
  const transient =
    (Number.isFinite(status) && (status === 429 || (status >= 500 && status < 600))) ||
    /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network/i.test(msg);
  if (transient) {
    console.log(JSON.stringify({ ok: false, problems: [msg] }));
    process.exit(75);
  }
  throw e;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case 'auth': {
      const client = createOAuthClient(clientSecretPath());
      const url = authUrl(client);
      console.error('\n🔐 아래 URL을 브라우저에서 열고 채널을 승인하세요:\n');
      console.error(url);
      console.error('\n승인 후 리다이렉트된 localhost URL의 code 파라미터 값을 붙여넣으세요.');
      console.error('(예: http://localhost/?code=XXXX → XXXX)\n');
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      const code = await new Promise<string>((res) => {
        rl.question('Authorization code: ', (a) => {
          rl.close();
          res(a.trim());
        });
      });
      await exchangeCode(client, code, tokenPath());
      const channels = await listChannels(client);
      out({ ok: true, tokenPath: tokenPath(), channels });
      break;
    }

    case 'channels': {
      const channels = await listChannels(authedClient());
      out({ ok: true, channels });
      break;
    }

    case 'upload': {
      const o = parse(rest, {
        video: STR, title: STR, description: STR, 'description-file': STR,
        tags: STR, category: STR, privacy: STR, thumbnail: STR,
        chapters: STR, 'chapters-file': STR, 'made-for-kids': BOOL,
      });
      const privacyRaw = optStr(o, 'privacy') ?? 'private';
      const privacy = youtubePrivacySchema.safeParse(privacyRaw);
      if (!privacy.success) throw new UsageError('--privacy 무효 — 허용: private|unlisted|public');

      const job: YoutubeUploadJob = {
        video: resolvePath(reqStr(o, 'video')),
        title: reqStr(o, 'title'),
        description: strOrFile(o, 'description') ?? '',
        privacyStatus: privacy.data,
        madeForKids: flag(o, 'made-for-kids'),
      };
      const tags = optStr(o, 'tags');
      const category = optStr(o, 'category');
      const thumbnail = optStr(o, 'thumbnail');
      const chapters = strOrFile(o, 'chapters');
      if (tags !== undefined) job.tags = tags.split(',').map((s) => s.trim()).filter(Boolean);
      if (category !== undefined) job.categoryId = category;
      if (thumbnail !== undefined) job.thumbnail = resolvePath(thumbnail);
      if (chapters !== undefined) job.chapters = chapters;

      const client = authedClient();
      const description = buildDescription(job.description, job.chapters);
      const requestBody = buildVideoRequestBody(job, description);

      const result: YoutubeUploadResult = { ok: false };
      try {
        log.info('upload_start', { title: job.title, privacy: job.privacyStatus });
        const videoId = await uploadVideo(client, requestBody, job.video);
        result.ok = true;
        result.videoId = videoId;
        result.url = `https://youtu.be/${videoId}`;
        if (job.thumbnail !== undefined) {
          try {
            await setThumbnail(client, videoId, job.thumbnail);
            result.thumbnailSet = true;
          } catch (te) {
            // 업로드는 성공, 썸네일만 실패 → 투명화(전체 실패로 만들지 않음)
            result.thumbnailSet = false;
            result.failures = [`썸네일 세팅 실패: ${te instanceof Error ? te.message : String(te)}`];
          }
        }
        out(result);
      } catch (e) {
        exitTransientOrThrow(e);
      }
      break;
    }

    default:
      console.error('명령: auth | channels | upload');
      process.exit(1);
  }
}

const STR = { type: 'string' } as const;
const BOOL = { type: 'boolean' } as const;

main().catch((err) => {
  if (err instanceof UsageError) {
    console.log(JSON.stringify({ ok: false, problems: [err.message] }));
    process.exit(1);
  }
  log.error('cli_error', { message: err instanceof Error ? err.message : String(err) });
  console.log(JSON.stringify({ ok: false, problems: [err instanceof Error ? err.message : String(err)] }));
  process.exit(1);
});
