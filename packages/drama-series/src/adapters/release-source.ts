import { inspectFile, media, probe, pixelFrames, videoInput, imageInput } from './media-evidence.js';
import { mkdirSync, readFileSync, writeFileSync, chmodSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DramaEpisode, DramaReleaseSource, DramaSeries } from '@cak/contracts';
import type { GateContext } from '../core/gates/types.js';
import { parseEpisode, parseSeries } from '../core/model.js';
import { bindContinuationEvidence, contentSha, parseReleaseSource, parseSourceApproval, releaseContentDigest, ReleaseSourceError } from '../core/release-source.js';

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
