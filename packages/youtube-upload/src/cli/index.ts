/**
 * CLI 진입점 — YouTube 롱폼 업로드.
 *
 * 사용:
 *   npm run cli -- auth                         # 1회 브라우저 인증 → 리프레시 토큰 저장(대화형)
 *   npm run cli -- channels                      # 인증 검증(내 채널 목록)
 *   npm run cli -- upload --video mix.mp4 --title "…" [--description "…"|--description-file f] \
 *        [--tags a,b] [--category 10] [--privacy private|unlisted|public] \
 *        [--thumbnail thumb.jpg] [--chapters "…"|--chapters-file f] [--made-for-kids]
 *   npm run cli -- comment --video-id ID --text "…"|--text-file f   # 링크 댓글(고지 검증, force-ssl 필요)
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
import { validateCommentText } from '../core/comment.js';
import {
  createOAuthClient,
  loadTokens,
  authUrl,
  exchangeCode,
  listChannels,
  uploadVideo,
  updateVideoMeta,
  setPrivacy,
  setThumbnail,
  insertComment,
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
      const o = parse(rest, { code: STR });
      const client = createOAuthClient(clientSecretPath());
      // --code 제공 시(또는 비대화형에서 받은 코드) 바로 교환
      const codeArg = optStr(o, 'code');
      if (codeArg !== undefined) {
        await exchangeCode(client, codeArg, tokenPath());
        const channels = await listChannels(client);
        out({ ok: true, tokenPath: tokenPath(), channels });
        break;
      }
      const url = authUrl(client);
      if (!process.stdin.isTTY) {
        // 비대화형: URL 만 내주고, 승인 후 `auth --code <코드>` 로 교환
        out({ ok: true, action: 'authorize', authUrl: url, next: 'auth --code <붙여넣은 code>' });
        break;
      }
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
        tags: STR, hashtags: STR, category: STR, privacy: STR, thumbnail: STR,
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
      const hashtags = optStr(o, 'hashtags');
      const category = optStr(o, 'category');
      const thumbnail = optStr(o, 'thumbnail');
      const chapters = strOrFile(o, 'chapters');
      if (tags !== undefined) job.tags = tags.split(',').map((s) => s.trim()).filter(Boolean);
      if (hashtags !== undefined) job.hashtags = hashtags.split(',').map((s) => s.trim()).filter(Boolean);
      if (category !== undefined) job.categoryId = category;
      if (thumbnail !== undefined) job.thumbnail = resolvePath(thumbnail);
      if (chapters !== undefined) job.chapters = chapters;

      const client = authedClient();
      const description = buildDescription(job.description, job.chapters, job.hashtags);
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

    case 'update-meta': {
      // 재업로드 없이 기존 영상의 제목·설명(챕터·해시태그)·태그 수정. --category 필수(videos.update 요구).
      const o = parse(rest, {
        'video-id': STR, title: STR, description: STR, 'description-file': STR,
        tags: STR, hashtags: STR, category: STR, chapters: STR, 'chapters-file': STR,
      });
      const videoId = reqStr(o, 'video-id');
      const category = reqStr(o, 'category');
      const baseDesc = strOrFile(o, 'description') ?? '';
      const chapters = strOrFile(o, 'chapters');
      const hashtags = optStr(o, 'hashtags');
      const tags = optStr(o, 'tags');
      const description = buildDescription(baseDesc, chapters, hashtags ? hashtags.split(',').map((s) => s.trim()).filter(Boolean) : undefined);
      const snippet: { title: string; description: string; categoryId: string; tags?: string[] } = {
        title: reqStr(o, 'title'),
        description,
        categoryId: category,
      };
      if (tags !== undefined) snippet.tags = tags.split(',').map((s) => s.trim()).filter(Boolean);
      try {
        await updateVideoMeta(authedClient(), videoId, snippet);
        out({ ok: true, videoId, url: `https://youtu.be/${videoId}` });
      } catch (e) {
        exitTransientOrThrow(e);
      }
      break;
    }

    case 'set-privacy': {
      const o = parse(rest, { 'video-id': STR, privacy: STR });
      const videoId = reqStr(o, 'video-id');
      const priv = youtubePrivacySchema.safeParse(reqStr(o, 'privacy'));
      if (!priv.success) throw new UsageError('--privacy 무효 — private|unlisted|public');
      try {
        await setPrivacy(authedClient(), videoId, priv.data);
        out({ ok: true, videoId, privacy: priv.data, url: `https://youtu.be/${videoId}` });
      } catch (e) {
        exitTransientOrThrow(e);
      }
      break;
    }

    case 'comment': {
      // 쇼츠는 설명란이 접혀 보여서 파트너스 링크는 댓글로 단다(달고 나서 고정은 스튜디오에서 수동).
      // 제휴 링크 포함 시 대가성 고지 없으면 거부. 고정(pin)은 Data API 미지원 — TODO(D1) 아님, 스펙 부재.
      const o = parse(rest, { 'video-id': STR, text: STR, 'text-file': STR });
      const videoId = reqStr(o, 'video-id');
      const text = strOrFile(o, 'text');
      if (text === undefined) throw new UsageError('--text 또는 --text-file 필수');
      const problems = validateCommentText(text);
      if (problems.length > 0) {
        out({ ok: false, videoId, problems });
        process.exit(1);
      }
      try {
        const commentId = await insertComment(authedClient(), videoId, text);
        out({ ok: true, videoId, commentId, url: `https://youtu.be/${videoId}` });
      } catch (e) {
        const status = (e as { code?: unknown }).code;
        if (status === 403 || status === '403') {
          out({
            ok: false,
            videoId,
            problems: [
              '403 — 토큰에 youtube.force-ssl 스코프가 없을 가능성이 큼. ' +
                '`cli -- auth` 로 재인증 1회 필요(채널 선택 화면은 브랜드 계정명 표시: BetterrShop=「모두의 상품」).',
            ],
          });
          process.exit(1);
        }
        exitTransientOrThrow(e);
      }
      break;
    }

    default:
      console.error('명령: auth | channels | upload | update-meta | set-privacy | comment');
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
