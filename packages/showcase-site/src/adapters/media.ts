/**
 * 미디어 등록 어댑터 — 영상 다운로드/복사 → 규격 확인(ffprobe) → 포스터 추출(ffmpeg).
 *
 * 규약:
 *  - src 가 http(s) URL 이면 fetch 스트리밍 다운로드, 로컬 경로면 복사 → <media>/<slug>.mp4
 *  - ffprobe 로 {width, height, durationSec} 를 zod 검증으로 확인한다(캐스팅 금지).
 *  - ffmpeg 로 poster-<slug>.jpg 를 posterAtSec 지점에서 추출한다.
 *  - ffmpeg/ffprobe spawn 은 이 파일 안의 소형 runFf 헬퍼(타임아웃 240s) —
 *    원자 간 import 금지 원칙이라 자체 구현한다.
 */
import { spawn } from 'node:child_process';
import { copyFileSync, createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { posix } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ffprobeOutputSchema } from './schemas.js';
import { formatIssues, ID_PATTERN } from '../core/works.js';
import { resolveInputPath, type Site } from './site.js';
import { createLogger } from '../obs/logger.js';

const log = createLogger();

export interface MediaProbe {
  width: number;
  height: number;
  durationSec: number;
}

export interface AddMediaResult {
  /** 사이트 루트 기준 상대경로 (works.json 에 그대로 넣는 값) */
  video: string;
  poster: string;
  probe: MediaProbe;
}

const FF_TIMEOUT_MS = 240_000;

/** ffmpeg/ffprobe 실행 소형 헬퍼 — 타임아웃 240s, 실패는 stderr 꼬리를 담아 에러로 */
function runFf(bin: string, args: string[], timeoutMs = FF_TIMEOUT_MS): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (d: Buffer) => {
      out += d.toString('utf8');
    });
    child.stderr.on('data', (d: Buffer) => {
      err += d.toString('utf8');
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`${bin} 실행 실패: ${e.message} — ffmpeg/ffprobe 설치가 필요합니다`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new Error(`${bin} 타임아웃(${timeoutMs}ms) — 강제 종료됨`));
      else if (code === 0) resolvePromise({ stdout: out, stderr: err });
      else reject(new Error(`${bin} 종료코드 ${code}: ${err.slice(-800)}`));
    });
  });
}

/** https URL 을 스트리밍으로 파일에 내려받는다 (메모리에 전체 적재하지 않음) */
async function downloadToFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`다운로드 실패 (${res.status} ${res.statusText}): ${url}`);
  if (!res.body) throw new Error(`다운로드 실패: 응답 본문 없음 — ${url}`);
  const body = Readable.fromWeb(res.body as unknown as import('node:stream/web').ReadableStream<Uint8Array>);
  await pipeline(body, createWriteStream(destPath));
}

/** ffprobe 로 규격 확인 — 출력을 zod 로 검증해 {width,height,durationSec} 로 요약 */
export async function probeVideo(videoPath: string): Promise<MediaProbe> {
  const { stdout } = await runFf('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-show_entries', 'format=duration',
    '-of', 'json',
    videoPath,
  ]);
  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    throw new Error(`ffprobe 출력이 JSON 이 아닙니다: ${stdout.slice(0, 200)}`);
  }
  const parsed = ffprobeOutputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`ffprobe 출력 검증 실패:\n` + formatIssues('ffprobe', parsed.error.issues).map((p) => `  - ${p}`).join('\n'));
  }
  const stream = parsed.data.streams[0];
  if (!stream) throw new Error('ffprobe: 비디오 스트림 없음');
  const durationSec = Number(parsed.data.format.duration);
  if (!Number.isFinite(durationSec)) throw new Error(`ffprobe: duration 수치화 실패 — "${parsed.data.format.duration}"`);
  return { width: stream.width, height: stream.height, durationSec };
}

export interface AddMediaOptions {
  slug: string;
  /** https URL 또는 로컬 경로(상대경로는 INIT_CWD 기준) */
  src: string;
  /** 포스터 추출 지점(초). 기본 1.0 */
  posterAtSec?: number;
}

/**
 * 미디어 등록: 다운로드/복사 → ffprobe 규격 확인 → ffmpeg 포스터 추출.
 * 반환 경로는 사이트 루트 기준 상대경로 — works.json 에 그대로 사용한다.
 */
export async function addMedia(site: Site, opts: AddMediaOptions): Promise<AddMediaResult> {
  const { slug, src } = opts;
  const posterAtSec = opts.posterAtSec ?? 1.0;
  if (!ID_PATTERN.test(slug)) {
    throw new Error(`slug 형식 위반: "${slug}" — 영문 소문자·숫자·하이픈만 허용`);
  }
  if (!(posterAtSec >= 0)) {
    throw new Error(`--poster-at 은 0 이상의 초여야 합니다: ${posterAtSec}`);
  }

  const mediaDir = resolve(site.dir, site.config.paths.media);
  mkdirSync(mediaDir, { recursive: true });

  const videoRel = posix.join(site.config.paths.media, `${slug}.mp4`);
  const posterRel = posix.join(site.config.paths.media, `poster-${slug}.jpg`);
  const videoAbs = resolve(site.dir, videoRel);
  const posterAbs = resolve(site.dir, posterRel);

  if (/^https?:\/\//i.test(src)) {
    log.info('media.download', { slug, src });
    await downloadToFile(src, videoAbs);
  } else {
    const from = resolveInputPath(src);
    if (!existsSync(from)) throw new Error(`원본 파일 없음: ${from}`);
    log.info('media.copy', { slug, from });
    copyFileSync(from, videoAbs);
  }

  const probe = await probeVideo(videoAbs);
  log.info('media.probe', { slug, ...probe });
  if (posterAtSec > probe.durationSec) {
    throw new Error(`--poster-at ${posterAtSec}s 가 영상 길이(${probe.durationSec}s)를 넘습니다`);
  }

  await runFf('ffmpeg', [
    '-y',
    '-ss', String(posterAtSec),
    '-i', videoAbs,
    '-frames:v', '1',
    '-q:v', '2',
    posterAbs,
  ]);
  log.info('media.poster', { slug, poster: posterRel });

  return { video: videoRel, poster: posterRel, probe };
}
