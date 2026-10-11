import { readFileSync } from 'node:fs';
import { parseEpisode, parseSeries } from '../src/core/model.js';
import { loadGenre } from '../src/core/genre.js';
import type { GateContext } from '../src/core/gates/types.js';
import { makeKeyframeRequest } from '../src/core/keyframe-digest.js';
import { contentSha } from '../src/core/release-source.js';
import type { DramaKeyframeApproval, DramaKeyframeEvidence } from '@cak/contracts';
const fx=(name:string)=>JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`,import.meta.url),'utf8'));
export function keyframeContext():GateContext {
  const series=parseSeries(fx('series')),episode=parseEpisode(fx('episode'));
  episode.shotPolicy={version:'shot-v1',strict:true};episode.authoredBy='codex';episode.cuts=[episode.cuts[0]!];
  series.locations[0]!.setups=[{id:'wide',name:'통로',cameraEn:'static wide shot',refAssetId:'img-set',visiblePropIds:['박스','빈 박스 더미']}];
  Object.assign(episode.cuts[0]!,{setupId:'wide',blocking:[{characterId:'seoyun',side:'center'}],beats:[{en:'Lift the box',lines:[]}],usedPropIds:['박스']});
  return {series,episode,genre:loadGenre(series.genreId)};
}
/** Protocol-only synthetic fields. Media tests separately create/decode real PNGs. */
export function syntheticKeyframeEvidence(ctx=keyframeContext()):DramaKeyframeEvidence {
  const req=makeKeyframeRequest(ctx,'c1');
  const body={schemaVersion:1 as const,kind:'drama-keyframe-evidence' as const,authorized:false as const,target:req.target,
    keyframeDigest:req.keyframeDigest,aspectRatio:'16:9' as const,assetId:'test-job',
    image:{sha256:'sha256:'+'a'.repeat(64),bytes:100,width:160,height:90,pixelSha256:'sha256:'+'b'.repeat(64)}};
  return {...body,subjectDigest:contentSha(body)};
}
export function keyframeApproval(e:DramaKeyframeEvidence):DramaKeyframeApproval {
  return {schemaVersion:1,decision:'approve-keyframe',subjectDigest:e.subjectDigest,approvedBy:'synthetic-user',userQuote:'시험 전용: 이미지와 검수 항목 확인',recordedBy:'codex:test-session',at:'2026-10-11T00:00:00Z',checks:{composition:true,cast:true,wardrobe:true,props:true,safety:true}};
}
