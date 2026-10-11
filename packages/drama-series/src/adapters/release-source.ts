import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { constants, openSync, closeSync, readSync, writeSync, fstatSync, mkdirSync, readFileSync, writeFileSync, chmodSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DramaEpisode, DramaReleaseSource, DramaSeries } from '@cak/contracts';
import type { GateContext } from '../core/gates/types.js';
import { parseEpisode, parseSeries } from '../core/model.js';
import { bindContinuationEvidence, contentSha, parseReleaseSource, parseSourceApproval, releaseContentDigest, ReleaseSourceError } from '../core/release-source.js';

const MAX_BYTES = 256 * 1024 * 1024;
const TIMEOUT = 30_000;
/** Descriptors and copies are read from one opened, non-symlink regular file. */
function inspectFile(path: string, copyTo?: string): { sha256: string; bytes: number } {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let output: number | undefined;
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size <= 0 || before.size > MAX_BYTES) throw new ReleaseSourceError('입력 파일은 1바이트~256MiB 일반 파일이어야 함');
    if (copyTo) output = openSync(copyTo, 'wx', 0o600);
    const hash = createHash('sha256'), chunk = Buffer.alloc(64 * 1024);
    let bytes = 0, n: number;
    while ((n = readSync(fd, chunk, 0, chunk.length, null)) > 0) {
      bytes += n;
      if (bytes > MAX_BYTES) throw new ReleaseSourceError('입력 파일 크기 제한 초과');
      hash.update(chunk.subarray(0, n));
      if (output !== undefined) {
        let written = 0;
        while (written < n) written += writeSync(output, chunk, written, n - written);
      }
    }
    const after = fstatSync(fd), pathNow = lstatSync(path);
    if (before.size !== bytes || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || before.ino !== pathNow.ino || before.dev !== pathNow.dev || pathNow.isSymbolicLink())
      throw new ReleaseSourceError('검사 중 입력 파일 변경');
    return { sha256: 'sha256:' + hash.digest('hex'), bytes };
  } finally { if (output !== undefined) closeSync(output); closeSync(fd); }
}
function media(command: 'ffmpeg' | 'ffprobe', args: string[]): string {
  const r = spawnSync(command, args, { encoding:'utf8', timeout:TIMEOUT, maxBuffer:4 * 1024 * 1024 });
  if (r.error || r.signal || r.status !== 0) throw new ReleaseSourceError(`${command} 전체 디코딩/검사 실패 (${r.error?.message ?? r.signal ?? r.status}): ${r.stderr?.slice(-400) ?? ''}`);
  return r.stdout;
}
const videoInput = (clip: string) => ['-protocol_whitelist','file,pipe','-f','mov','-i',clip];
function probe(clip: string): void {
  const info = JSON.parse(media('ffprobe', ['-v','error',...videoInput(clip),'-select_streams','v:0','-show_entries','stream=width,height:format=duration','-of','json']));
  const s = info.streams?.[0], duration = Number(info.format?.duration);
  if (!s || !Number.isInteger(s.width) || !Number.isInteger(s.height) || s.width < 1 || s.height < 1 || s.width > 4096 || s.height > 4096 || !Number.isFinite(duration) || duration <= 0 || duration > 120)
    throw new ReleaseSourceError('클립 범위 초과: 영상 스트림·최대4096px·120초 필요');
}
function pixelFrames(input: string[]): string[] {
  // Check image dimensions before full PNG decoding as well as video dimensions.
  const info = JSON.parse(media('ffprobe', ['-v','error',...input,'-select_streams','v:0','-show_entries','stream=width,height','-of','json']));
  const stream = info.streams?.[0];
  if (!stream || !Number.isInteger(stream.width) || !Number.isInteger(stream.height) || stream.width < 1 || stream.height < 1 || stream.width > 4096 || stream.height > 4096)
    throw new ReleaseSourceError('프레임 크기 범위 초과');
  const text = media('ffmpeg', ['-v','error','-nostdin','-xerror',...input,'-map','0:v:0','-an','-sn','-dn','-vf','format=rgb24','-fps_mode','passthrough','-threads','1','-c:v','rawvideo','-f','framehash','-hash','sha256','pipe:1']);
  const dimensions = /^#dimensions\s+0:\s+(\d+)x(\d+)$/m.exec(text);
  if (!dimensions) throw new ReleaseSourceError('디코딩 프레임 크기 누락');
  const rows = text.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  if (!rows.length || rows.length > 100_000) throw new ReleaseSourceError('디코딩된 프레임 없음 또는 한도 초과');
  return rows.map(row => {
    const cells = row.split(',').map(x => x.trim());
    if (cells.length !== 6 || cells[0] !== '0' || !/^[0-9a-f]{64}$/.test(cells[5]!)) throw new ReleaseSourceError('프레임 해시 형식 오류');
    return contentSha({ width:Number(dimensions[1]), height:Number(dimensions[2]), rgb24Sha256:cells[5] });
  });
}
const imageInput = (path: string) => ['-protocol_whitelist','file,pipe','-f','png_pipe','-i',path];
function same(a: unknown, b: unknown): boolean { return contentSha(a) === contentSha(b); }

/** New directory only; source.json is written last. Failed partial bundles are never reusable. */
export function prepareReleaseSource(series: DramaSeries, episode: DramaEpisode, cutId: string, clip: string, directory: string): DramaReleaseSource {
  series = parseSeries(series); episode = parseEpisode(episode);
  if (series.id !== episode.seriesId || episode.cuts.at(-1)?.id !== cutId || episode.cuts.filter(c=>c.id===cutId).length !== 1)
    throw new ReleaseSourceError('같은 시리즈의 마지막 컷만 앞 회차 증거로 준비 가능');
  const root = resolve(directory);
  mkdirSync(root, { mode:0o700 }); // No recursive creation and no shared output cleanup.
  const snapshot = join(root,'clip.mp4'), frame = join(root,'last-frame.png');
  const clipInfo = inspectFile(clip, snapshot);
  chmodSync(snapshot, 0o400);
  probe(snapshot);
  const frames = pixelFrames(videoInput(snapshot));
  media('ffmpeg', ['-v','error','-nostdin','-xerror','-n',...videoInput(snapshot),'-map','0:v:0','-an','-sn','-dn','-vf',`format=rgb24,select=eq(n\\,${frames.length-1})`,'-fps_mode','passthrough','-frames:v','1','-threads','1','-c:v','png',frame]);
  const png = pixelFrames(imageInput(frame));
  if (png.length !== 1 || png[0] !== frames.at(-1)) throw new ReleaseSourceError('마지막 디코딩 프레임과 PNG 불일치');
  const frameInfo = inspectFile(frame);
  if (!same(clipInfo, inspectFile(snapshot))) throw new ReleaseSourceError('추출 중 클립 변경');
  const body = { schemaVersion:1 as const,kind:'drama-release-source' as const,authorized:false as const,seriesId:series.id,episodeNo:episode.no,cutId,contentDigest:releaseContentDigest(series,episode),clip:clipInfo,frame:{...frameInfo,pixelSha256:png[0]!,frameCount:frames.length,extraction:'video-0-rgb24-last-v1' as const} };
  const manifest = parseReleaseSource({ ...body, subjectDigest:contentSha(body) });
  chmodSync(frame,0o400);
  writeFileSync(join(root,'source.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o400});
  return manifest;
}

/** Re-decodes the fixed snapshot on every consumption; a hand-edited manifest is insufficient. */
export function verifyReleaseSource(directory: string): DramaReleaseSource {
  const root = resolve(directory);
  if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) throw new ReleaseSourceError('증거 디렉터리 형식 오류');
  const manifestPath = join(root,'source.json'), clip = join(root,'clip.mp4'), frame = join(root,'last-frame.png');
  const manifestInfo = inspectFile(manifestPath);
  if (manifestInfo.bytes > 16_384) throw new ReleaseSourceError('증거 메타데이터 크기 초과');
  const source = parseReleaseSource(JSON.parse(readFileSync(manifestPath,'utf8')));
  if (!same(source.clip,inspectFile(clip)) || !same({sha256:source.frame.sha256,bytes:source.frame.bytes},inspectFile(frame))) throw new ReleaseSourceError('클립/프레임 실제 바이트와 증거 불일치');
  probe(clip);
  const frames = pixelFrames(videoInput(clip)), png = pixelFrames(imageInput(frame));
  if (frames.length !== source.frame.frameCount || frames.at(-1) !== source.frame.pixelSha256 || png.length !== 1 || png[0] !== frames.at(-1)) throw new ReleaseSourceError('실제 마지막 프레임과 증거 불일치');
  if (!same(source.clip,inspectFile(clip)) || !same({sha256:source.frame.sha256,bytes:source.frame.bytes},inspectFile(frame)) || !same(manifestInfo,inspectFile(manifestPath))) throw new ReleaseSourceError('검증 중 증거 파일 변경');
  return source;
}
export function checkContinuationSource(ctx: GateContext, directory: string, rawApproval: unknown) {
  const source = verifyReleaseSource(directory);
  const binding = bindContinuationEvidence(ctx,source,parseSourceApproval(rawApproval));
  return { ok:true as const,authorized:false as const,binding,blockers:['전체 컷 판정·실행 상태·출시 관문 미구현 — 생성/조립 권한 없음'] };
}
