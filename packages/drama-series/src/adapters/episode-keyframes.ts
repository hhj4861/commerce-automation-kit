import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import type { DramaEpisodeKeyframes } from '@cak/contracts';
import { ID, parseEpisode, parseSeries } from '../core/model.js';
import { loadGenre } from '../core/genre.js';
import { contentSha } from '../core/release-source.js';
import { assertContinuation } from '../core/continuation.js';
import { checkKeyframeApproval } from './keyframe-evidence.js';
import { inspectFile, readStrictJsonFile } from './media-evidence.js';
import { assertUnprotectedOutput, atomicEpisodeJson, withEpisodeOwner, type EpisodeGuard } from './episode-lock.js';
import type { GateContext } from '../core/gates/types.js';
const manifestSchema=z.object({schemaVersion:z.literal(1),entries:z.array(z.object({cutId:ID,assetId:z.string().min(1),source:z.string().min(1)}).strict()).min(1).max(1000)}).strict();
export interface EpisodeKeyframesInput {episodePath:string;seriesPath:string;prevPath?:string|undefined;manifestPath:string;guard:EpisodeGuard}
/** Full content binding is separate from per-image approval: dialogue changes require re-aggregation, not image reapproval. */
function contextDigest(ctx:GateContext) {
  const strip=(e:GateContext['episode'])=>({...e,cuts:e.cuts.map(c=>({...c,lines:c.lines.map(({verification:_,...l})=>l)}))});
  return contentSha({series:ctx.series,episode:strip(ctx.episode),previous:ctx.prev?strip(ctx.prev.episode):null,genre:ctx.genre});
}
function collect<T>(input:EpisodeKeyframesInput,done:(report:DramaEpisodeKeyframes)=>T):T {
  return withEpisodeOwner(input.episodePath,input.guard,({episode,state})=>{
    const hashes=new Map<string,string>();
    const capture=(p:string)=>{const path=resolve(p);const sha=inspectFile(path).sha256;hashes.set(path,sha);return path;};
    const series=parseSeries(readStrictJsonFile(capture(input.seriesPath)));
    const ctx:GateContext={series,episode,genre:loadGenre(series.genreId),...(input.prevPath?{prev:{episode:parseEpisode(readStrictJsonFile(capture(input.prevPath)))}}:{})};
    assertContinuation(ctx);
    const manifest=manifestSchema.parse(readStrictJsonFile(capture(input.manifestPath)));
    if(episode.shotPolicy?.version!=='shot-v1' || new Set(episode.cuts.map(c=>c.id)).size!==episode.cuts.length
      || manifest.entries.length!==episode.cuts.length || new Set(manifest.entries.map(e=>e.cutId)).size!==manifest.entries.length
      || manifest.entries.some(e=>!episode.cuts.some(c=>c.id===e.cutId)))throw new Error('모든 컷의 키프레임 증거를 정확히 한 번씩 제공해야 함');
    const entries=episode.cuts.map(c=>{
      const e=manifest.entries.find(e=>e.cutId===c.id)!;
      const source=resolve(dirname(resolve(input.manifestPath)),e.source);
      for(const name of ['image.png','request.json','evidence.json','approval.json','binding.json'])capture(resolve(source,name));
      return {...e,source};
    });
    const cuts=entries.map(e=>checkKeyframeApproval(ctx,e.cutId,e.assetId,e.source).binding);
    const body={schemaVersion:1 as const,kind:'drama-episode-keyframes' as const,authorized:false as const,
      target:{seriesId:series.id,episodeNo:episode.no},contextDigest:contextDigest(ctx),
      lock:{lockId:state.lockId,revision:state.revision,owner:state.owner!},cuts};
    // Rehash every input, including earlier cuts, after the complete decode pass.
    for(const [path,sha] of hashes)if(inspectFile(path).sha256!==sha)throw new Error('전체 컷 검사 중 입력 파일 변경');
    if(contentSha(loadGenre(series.genreId))!==contentSha(ctx.genre))throw new Error('전체 컷 검사 중 장르 변경');
    return done({...body,digest:contentSha(body)});
  });
}
export function buildEpisodeKeyframes(input:EpisodeKeyframesInput,output:string) {
  assertUnprotectedOutput(output);
  return collect(input,report=>{atomicEpisodeJson(resolve(output),report,true);return report;});
}
export function checkEpisodeKeyframes(input:EpisodeKeyframesInput,reportFile:string) {
  const before=inspectFile(reportFile).sha256,raw=readStrictJsonFile(reportFile);
  return collect(input,expected=>{
    if(contentSha(raw)!==contentSha(expected) || inspectFile(reportFile).sha256!==before)throw new Error('회차 키프레임 결합 불일치 — 현재 문맥으로 다시 묶기');
    return {ok:true,authorized:false,report:expected,blockers:['컷별 승인 기록의 결합이며 승인자 신원·전체 회차 미리보기/실행/출시 승인이 아님']};
  });
}
