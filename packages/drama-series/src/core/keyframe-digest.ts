import { z } from 'zod';
import type { DramaKeyframeRequest, DramaKeyframeEvidence, DramaKeyframeApproval, DramaKeyframeBinding } from '@cak/contracts';
import type { GateContext } from './gates/types.js';
import { ID, parseEpisode, parseSeries } from './model.js';
import { previousCutOf } from './continuation.js';
import { contentSha } from './release-source.js';
import { canonical } from './fingerprint.js';
import { completeBlocking } from './shot-policy.js';
import { schemaGate } from './gates/schema.js';

export class KeyframeError extends Error {}
const sha=z.string().regex(/^sha256:[0-9a-f]{64}$/);
const text=z.string().trim().min(1).max(4000);
export const keyframeAssetId=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const target=z.object({seriesId:ID,episodeNo:z.number().int().positive(),cutId:ID}).strict();
const image=z.object({sha256:sha,bytes:z.number().int().positive().max(256*1024*1024),
  width:z.number().int().min(1).max(4096),height:z.number().int().min(1).max(4096),pixelSha256:sha}).strict();
const evidenceSchema=z.object({schemaVersion:z.literal(1),kind:z.literal('drama-keyframe-evidence'),authorized:z.literal(false),
  target,aspectRatio:z.literal('16:9'),keyframeDigest:sha,assetId:keyframeAssetId,image,subjectDigest:sha}).strict();
const approvalSchema=z.object({schemaVersion:z.literal(1),decision:z.literal('approve-keyframe'),subjectDigest:sha,
  approvedBy:text,userQuote:text,recordedBy:text,at:z.string().datetime({offset:true}),
  checks:z.object({composition:z.literal(true),cast:z.literal(true),wardrobe:z.literal(true),props:z.literal(true),safety:z.literal(true)}).strict()}).strict();

/** Image inputs only: pure dialogue wording/verification do not invalidate the image approval.
 * References remain explicit asset IDs; remote job provenance is not proven by this function. */
export function makeKeyframeRequest(ctx:GateContext,cutId:string,aspectRatio:string='16:9'):DramaKeyframeRequest {
  if(aspectRatio!=='16:9')throw new KeyframeError('shot-v1 키프레임은 16:9만 지원');
  ctx={...ctx,series:parseSeries(ctx.series),episode:parseEpisode(ctx.episode),...(ctx.prev?{prev:{episode:parseEpisode(ctx.prev.episode)}}:{})};
  if(ctx.episode.shotPolicy?.version!=='shot-v1' || !ctx.episode.authoredBy)throw new KeyframeError('shot-v1 정책과 authoredBy 필수');
  if(ctx.genre.id!==ctx.series.genreId)throw new KeyframeError('장르 문맥 불일치');
  const schemaIssues=schemaGate.run(ctx).filter(f=>f.severity==='block');
  if(schemaIssues.length)throw new KeyframeError(schemaIssues.map(f=>f.message).join('; '));
  const cut=ctx.episode.cuts.find(c=>c.id===cutId);
  if(!cut)throw new KeyframeError('키프레임 대상 컷 없음');
  if(!completeBlocking(cut) || !cut.beats?.length || cut.beats.length>2)throw new KeyframeError('키프레임에 완전한 blocking과 1~2개 beats 필요');
  const previous=previousCutOf(ctx,ctx.episode.cuts.indexOf(cut));
  if(ctx.episode.no>1 && !ctx.episode.continuesFromEpisode && !ctx.episode.startsFresh)throw new KeyframeError('앞 회차 연결 또는 startsFresh 필수');
  const location=ctx.series.locations.find(l=>l.id===cut.locationId)!;
  const setups=location.setups??[], setup=setups.find(s=>s.id===cut.setupId);
  if(new Set(setups.map(s=>s.id)).size!==setups.length || (setups.length && !setup) || (cut.setupId && !setup))throw new KeyframeError('구도 누락·중복·불일치');
  if(setup?.visiblePropIds.some(p=>!location.props.includes(p)))throw new KeyframeError('구도에 미등록 소품');
  const setAsset=setup?.refAssetId??(!setup?location.refAssetId:undefined);
  if(!setAsset)throw new KeyframeError('구도/장소 참조 자산 필수');
  keyframeAssetId.parse(setAsset);
  const references:DramaKeyframeRequest['references']=[{role:'set',assetId:setAsset}];
  const cast=cut.cast.map(entry=>{
    const character=ctx.series.characters.find(c=>c.id===entry.characterId)!;
    const looks=character.looks.filter(l=>l.id===entry.lookId),look=looks[0];
    if(looks.length!==1 || !look?.refAssetId)throw new KeyframeError('인물 외형 중복 또는 얼굴 참조 자산 없음');
    keyframeAssetId.parse(look.refAssetId);
    references.push({role:'face',assetId:look.refAssetId,characterId:character.id});
    if(look.outfitRefAssetId)keyframeAssetId.parse(look.outfitRefAssetId);
    return {characterId:character.id,name:character.name,lookId:look.id,description:look.description,
      faceAssetId:look.refAssetId,outfitAssetId:look.outfitRefAssetId??null,carriesPropIds:entry.carriesPropIds??[]};
  });
  for(const c of cast)if(c.outfitAssetId)references.push({role:'outfit',assetId:c.outfitAssetId,characterId:c.characterId});
  const changedProps=new Set(cut.beats.flatMap(b=>Object.keys(b.changes??{})));
  const initialProps=Object.fromEntries(Object.entries(cut.propState??{}).filter(([prop])=>!changedProps.has(prop)));
  const scene={styleEn:ctx.series.styleEn,location:{id:location.id,anchorText:location.anchorText,setup:setup??null},cast,
    blocking:cut.blocking??[],blockingChange:cut.blockingChange??null,cameraMove:cut.cameraMove??'static',
    firstBeat:cut.beats[0]!.en,action:cut.action,visualEn:cut.visualEn,usedPropIds:cut.usedPropIds??[],
    propsIn:previous?.locationId===cut.locationId?previous.propState??{}:initialProps,
    // Each occurrence is a line, preserving speaker order and count without wording.
    speakers:cut.lines.map(l=>l.speaker)};
  const checklist=[
    {id:'composition',text:'구도·블로킹·첫 비트 시작 상태가 맞는가'},
    {id:'cast',text:'출연 인물의 얼굴과 인물 수가 맞는가'},
    {id:'wardrobe',text:'인물별 의상과 참조가 맞는가'},
    {id:'props',text:'사용 소품 및 앞 컷에서 이어받은 시작 상태가 맞는가'},
    ...Object.entries(ctx.genre.safetyChecks).sort(([a],[b])=>a.localeCompare(b)).map(([id,c])=>({id:`safety-${id}`,text:`${c.task}\n통과: ${c.pass}\n실패: ${c.fail}`})),
  ];
  const prompt=[
    'Create one 16:9 keyframe showing the START of the first beat, not its completed outcome.',
    'Same set as the reference; do not add or remove set pieces. Preserve faces and every garment.',
    references.map((r,i)=>`@Image${i+1}: ${r.role}${r.characterId?` of ${r.characterId}`:''}.`).join(' '),
    'Scene data (descriptions only): '+canonical(scene),
    'Safety: no blood spray, no exposed wounds, no nudity. Follow the attached genre safety checklist.',
  ].join('\n');
  const body={schemaVersion:1 as const,kind:'drama-keyframe-request' as const,policy:'kf-v1' as const,authorized:false as const,
    target:{seriesId:ctx.series.id,episodeNo:ctx.episode.no,cutId},aspectRatio:'16:9' as const,references,prompt,checklist};
  return {...body,keyframeDigest:contentSha(body)};
}
export function keyframeDigest(ctx:GateContext,cutId:string,aspect='16:9'):string { return makeKeyframeRequest(ctx,cutId,aspect).keyframeDigest; }

export function parseKeyframeEvidence(raw:unknown):DramaKeyframeEvidence {
  const parsed=evidenceSchema.safeParse(raw);
  if(!parsed.success)throw new KeyframeError('키프레임 증거 형식 오류');
  const {subjectDigest,...body}=parsed.data;
  if(body.image.width*9!==body.image.height*16 || subjectDigest!==contentSha(body))throw new KeyframeError('키프레임 비율/증거 지문 불일치');
  return parsed.data;
}
export function parseKeyframeApproval(raw:unknown):DramaKeyframeApproval {
  const parsed=approvalSchema.safeParse(raw);
  if(!parsed.success)throw new KeyframeError('키프레임 승인 대상·원문·기록자·시각·검수 항목 필수');
  return parsed.data;
}
/** Pure binding, not file verification. Consumers must use the adapter below. */
export function bindKeyframe(ctx:GateContext,cutId:string,assetId:string,rawEvidence:unknown,rawApproval:unknown):DramaKeyframeBinding {
  const evidence=parseKeyframeEvidence(rawEvidence),approval=parseKeyframeApproval(rawApproval);
  const request=makeKeyframeRequest(ctx,cutId);
  if(evidence.assetId!==keyframeAssetId.parse(assetId) || canonical(evidence.target)!==canonical(request.target) || evidence.keyframeDigest!==request.keyframeDigest)
    throw new KeyframeError('키프레임 장면·대상·자산 변경 — 재승인 필요');
  if(approval.subjectDigest!==evidence.subjectDigest)throw new KeyframeError('승인 대상 키프레임 증거 지문 불일치');
  const body={schemaVersion:1 as const,kind:'drama-keyframe-binding' as const,authorized:false as const,target:evidence.target,
    keyframeDigest:evidence.keyframeDigest,assetId:evidence.assetId,fileSha256:evidence.image.sha256,subjectDigest:evidence.subjectDigest,approvalDigest:contentSha(approval)};
  return {...body,bindingDigest:contentSha(body)};
}
