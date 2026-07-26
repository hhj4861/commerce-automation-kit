/**
 * CLI 진입점 — 롱폼 음악 믹스 영상 조립(전부 로컬 ffmpeg, 무료).
 *
 * 사용:
 *   npm run cli -- chapters --tracks tracks.json
 *   npm run cli -- assemble --tracks tracks.json --out mix.mp4 \
 *        [--visualizer --title "GYM HYPE MIX" --subtitle "Phonk · Trap · DnB"] \
 *        [--visual bg.jpg]   # 이미지 배경(비주얼라이저 대신)
 *   npm run cli -- thumbnail --image athlete.jpg --title "GYM HYPE" [--subtitle "..."] --out thumb.jpg
 *
 * tracks.json: [{"file":"a.mp3","title":"Phonk"}, ...] 또는 {"tracks":[...]}
 * 출력 규약: stdout = 데이터(JSON), stderr = 로그. 종료코드 0/1.
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { ParseArgsConfig } from 'node:util';
import type { LongformTrack } from '@cak/contracts';
import { buildChapters, formatYouTubeChapters, totalDuration, formatTimestamp } from '../core/tracklist.js';
import {
  buildConcatAudioArgs,
  buildImageAssembleArgs,
  buildVideoLoopArgs,
  buildVisualizerArgs,
  buildThumbnailArgs,
  buildAestheticThumbnailArgs,
  concatListLine,
  letterspace,
  type VisualizerOpts,
  type ThumbnailOpts,
  type AestheticThumbnailOpts,
} from '../core/assembleargs.js';
import { probeDuration, runFfmpegOrThrow } from '../adapters/ffmpeg.js';
import { parseTracks } from '../adapters/schemas.js';
import { searchPhotos, searchVideos, downloadTo, type Orientation } from '../adapters/pexels.js';
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

/** tracks.json 읽고 각 트랙 길이를 프로브해 LongformTrack[] 완성. */
async function loadTracks(o: Opts): Promise<LongformTrack[]> {
  const p = resolvePath(reqStr(o, 'tracks'));
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    throw new UsageError(`tracks 파일을 읽을 수 없거나 JSON 이 아님: ${p}`);
  }
  const inputs = parseTracks(json);
  const tracks: LongformTrack[] = [];
  for (const t of inputs) {
    const file = resolvePath(t.file);
    const durationSec = t.durationSec ?? (await probeDuration(file));
    tracks.push({ file, title: t.title, durationSec });
  }
  return tracks;
}

const STR = { type: 'string' } as const;
const BOOL = { type: 'boolean' } as const;

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case 'chapters': {
      const o = parse(rest, { tracks: STR });
      const tracks = await loadTracks(o);
      const chapters = buildChapters(tracks);
      out({
        total: formatTimestamp(totalDuration(tracks)),
        totalSec: Math.round(totalDuration(tracks)),
        count: tracks.length,
        youtube: formatYouTubeChapters(chapters),
        chapters,
      });
      break;
    }

    case 'assemble': {
      const o = parse(rest, {
        tracks: STR, out: STR, visualizer: BOOL, visual: STR, 'visual-kind': STR,
        title: STR, subtitle: STR, width: STR, height: STR,
      });
      const outPath = resolvePath(reqStr(o, 'out'));
      const tracks = await loadTracks(o);
      const visual = optStr(o, 'visual');
      const useVisualizer = flag(o, 'visualizer') || visual === undefined;

      // 1) 오디오 이어붙임 → 임시 파일
      const listFile = `${outPath}.concat.txt`;
      const tmpAudio = `${outPath}.mix.m4a`;
      writeFileSync(listFile, tracks.map((t) => concatListLine(t.file)).join('\n') + '\n');
      try {
        log.info('concat_audio', { tracks: tracks.length, out: tmpAudio });
        await runFfmpegOrThrow(buildConcatAudioArgs(listFile, tmpAudio));

        // 2) 비주얼 입힘
        if (useVisualizer) {
          const vopts: VisualizerOpts = {};
          const title = optStr(o, 'title');
          const subtitle = optStr(o, 'subtitle');
          if (title !== undefined) vopts.title = title;
          if (subtitle !== undefined) vopts.subtitle = subtitle;
          log.info('render_visualizer', { out: outPath });
          await runFfmpegOrThrow(buildVisualizerArgs(tmpAudio, outPath, vopts));
        } else if (visual !== undefined && optStr(o, 'visual-kind') === 'video') {
          log.info('render_video_loop', { visual, out: outPath });
          await runFfmpegOrThrow(buildVideoLoopArgs(resolvePath(visual), tmpAudio, outPath, {}));
        } else {
          log.info('render_image_loop', { visual, out: outPath });
          await runFfmpegOrThrow(buildImageAssembleArgs(resolvePath(visual!), tmpAudio, outPath, {}));
        }
      } finally {
        for (const f of [listFile, tmpAudio]) {
          try {
            unlinkSync(f);
          } catch {
            /* 임시파일 정리 실패는 무해 */
          }
        }
      }

      const chapters = buildChapters(tracks);
      const mode = useVisualizer
        ? 'visualizer'
        : visual !== undefined && optStr(o, 'visual-kind') === 'video'
          ? 'video'
          : 'image';
      out({
        ok: true,
        out: outPath,
        mode,
        total: formatTimestamp(totalDuration(tracks)),
        youtube: formatYouTubeChapters(chapters),
      });
      break;
    }

    case 'thumbnail': {
      const o = parse(rest, {
        image: STR, out: STR, title: STR, subtitle: STR,
        aesthetic: BOOL, tag: STR, 'no-letterspace': BOOL,
      });
      const outPath = resolvePath(reqStr(o, 'out'));
      const image = resolvePath(reqStr(o, 'image'));
      if (flag(o, 'aesthetic')) {
        // 감성(플레이리스트) 모드 — 기본 letterspace(라틴). 한글은 --no-letterspace.
        const ls = (s: string): string => (flag(o, 'no-letterspace') ? s : letterspace(s));
        const aopts: AestheticThumbnailOpts = { title: ls(reqStr(o, 'title')) };
        const tag = optStr(o, 'tag');
        const subtitle = optStr(o, 'subtitle');
        if (tag !== undefined) aopts.tag = tag;
        if (subtitle !== undefined) aopts.subtitle = ls(subtitle);
        await runFfmpegOrThrow(buildAestheticThumbnailArgs(image, outPath, aopts));
      } else {
        const opts: ThumbnailOpts = { title: reqStr(o, 'title') };
        const subtitle = optStr(o, 'subtitle');
        if (subtitle !== undefined) opts.subtitle = subtitle;
        await runFfmpegOrThrow(buildThumbnailArgs(image, outPath, opts));
      }
      out({ ok: true, out: outPath });
      break;
    }

    case 'fetch-image': {
      const o = parse(rest, { query: STR, out: STR, orientation: STR, index: STR });
      const apiKey = process.env.PEXELS_API_KEY;
      if (!apiKey) throw new UsageError('PEXELS_API_KEY 환경변수 필요 (.env)');
      const orientation = optStr(o, 'orientation');
      const photos = await searchPhotos(apiKey, reqStr(o, 'query'), {
        perPage: 15,
        ...(orientation !== undefined ? { orientation: orientation as Orientation } : {}),
      });
      if (photos.length === 0) throw new Error('Pexels 사진 검색 결과 없음');
      const idxRaw = Number(optStr(o, 'index') ?? '0');
      const idx = Math.min(photos.length - 1, Number.isFinite(idxRaw) ? Math.max(0, idxRaw) : 0);
      const chosen = photos[idx]!;
      const outPath = resolvePath(reqStr(o, 'out'));
      const bytes = await downloadTo(chosen.original, outPath);
      out({ ok: true, out: outPath, bytes, alt: chosen.alt, credit: chosen.credit });
      break;
    }

    case 'fetch-video': {
      const o = parse(rest, { query: STR, out: STR, orientation: STR, index: STR });
      const apiKey = process.env.PEXELS_API_KEY;
      if (!apiKey) throw new UsageError('PEXELS_API_KEY 환경변수 필요 (.env)');
      const orientation = optStr(o, 'orientation');
      const videos = await searchVideos(apiKey, reqStr(o, 'query'), {
        perPage: 15,
        ...(orientation !== undefined ? { orientation: orientation as Orientation } : {}),
      });
      if (videos.length === 0) throw new Error('Pexels 영상 검색 결과 없음');
      const idxRaw = Number(optStr(o, 'index') ?? '0');
      const idx = Math.min(videos.length - 1, Number.isFinite(idxRaw) ? Math.max(0, idxRaw) : 0);
      const chosen = videos[idx]!;
      const outPath = resolvePath(reqStr(o, 'out'));
      const bytes = await downloadTo(chosen.file, outPath);
      out({ ok: true, out: outPath, bytes, durationSec: chosen.durationSec, credit: chosen.credit });
      break;
    }

    default:
      console.error('명령: chapters | assemble | thumbnail | fetch-image | fetch-video');
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
