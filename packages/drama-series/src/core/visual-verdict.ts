import { z } from 'zod';
import type { DramaVisualEvidence, DramaVisualRequest, DramaVisualResponse, DramaVisualReport } from '@cak/contracts';
import type { GateContext } from './gates/types.js';
import { parseSeries, parseEpisode } from './model.js';
import { previousCutOf } from './continuation.js';
import { contentSha, releaseContentDigest } from './release-source.js';

export class VisualVerdictError extends Error {}
const sha = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const text = z.string().trim().min(1).max(4000);
const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const file = z.object({sha256:sha, bytes:z.number().int().positive().max(256*1024*1024)}).strict();
const frame = file.extend({id:identifier, ordinal:z.number().int().nonnegative(), file:z.string().regex(/^frame-\d+\.png$/), pixelSha256:sha});
// File names are never used as paths before exact ordinal validation.
const evidenceSchema = z.object({
  clip:file, frameCount:z.number().int().min(1).max(100_000),
  frames:z.array(frame.strict()).min(1).max(3),
}).strict();
const responseSchema = z.object({
  schemaVersion:z.literal(1), requestId:identifier, requestDigest:sha,
  reviewer:text, reviewedAt:z.string().datetime({offset:true}),
  answers:z.array(z.object({questionId:identifier, verdict:z.enum(['pass','fail','unknown']), reason:text, frameIds:z.array(identifier).max(3)}).strict()).min(1).max(500),
}).strict();

/** Unique ordinals; middle rounds down. A one-frame clip has one evidence image. */
export function sampleOrdinals(frameCount:number): number[] {
  if (!Number.isInteger(frameCount) || frameCount<1 || frameCount>100_000) throw new VisualVerdictError('잘못된 프레임 수');
  return [...new Set([0, Math.floor((frameCount-1)/2), frameCount-1])];
}
export function parseVisualEvidence(raw:unknown):DramaVisualEvidence {
  const parsed=evidenceSchema.safeParse(raw);
  if(!parsed.success) throw new VisualVerdictError('시각 증거 형식 오류');
  const value=parsed.data, ordinals=sampleOrdinals(value.frameCount);
  if(value.frames.length!==ordinals.length || value.frames.some((f,i)=>f.ordinal!==ordinals[i] || f.id!==`f${f.ordinal}` || f.file!==`frame-${f.ordinal}.png`))
    throw new VisualVerdictError('프레임 ordinal·이름·순서 불일치');
  return value;
}
export function makeVisualRequest(ctx:GateContext, cutId:string, jobId:string, requestId:string, rawEvidence:unknown):DramaVisualRequest {
  identifier.parse(jobId); identifier.parse(requestId);
  ctx={...ctx,series:parseSeries(ctx.series),episode:parseEpisode(ctx.episode),...(ctx.prev?{prev:{episode:parseEpisode(ctx.prev.episode)}}:{})};
  if(ctx.series.id!==ctx.episode.seriesId)throw new VisualVerdictError('시리즈 불일치');
  const matches=ctx.episode.cuts.filter(c=>c.id===cutId), cut=matches[0];
  if(matches.length!==1 || !cut)throw new VisualVerdictError('컷 없음 또는 중복');
  const previous=previousCutOf(ctx,ctx.episode.cuts.indexOf(cut));
  const evidence=parseVisualEvidence(rawEvidence), frameIds=evidence.frames.map(f=>f.id);
  const questions:DramaVisualRequest['questions']=[{id:'action',category:'action',text:`이 샘플 프레임에서 다음 행동이 확인되는가? ${cut.action}\n화면 설명: ${cut.visualEn}\n중간 동작을 확인할 수 없으면 unknown.`,frameIds}];
  cut.cast.forEach((entry,i)=>{
    const characters=ctx.series.characters.filter(c=>c.id===entry.characterId), character=characters[0];
    const looks=character?.looks.filter(l=>l.id===entry.lookId)??[], look=looks[0];
    if(characters.length!==1 || looks.length!==1 || !character || !look)throw new VisualVerdictError('인물·외형 참조 없음 또는 중복');
    questions.push({id:`cast-${i}`,category:'cast',text:`샘플에서 ${character.name} (${character.id})에 해당하는 다음 외형·의상이 보이는가? ${look.description}\n참조 이미지나 신원 일치를 판정하는 질문은 아님. 확인 불가능하면 unknown.`,frameIds});
  });
  const locations=ctx.series.locations.filter(l=>l.id===cut.locationId), location=locations[0];
  if(locations.length!==1 || !location)throw new VisualVerdictError('장소 참조 없음 또는 중복');
  questions.push({id:'background',category:'background',text:`샘플 배경이 다음 장소 설명과 모순 없는가? ${location.anchorText}\n장소 소품 목록(모든 소품의 화면 등장을 요구하지 않음): ${JSON.stringify(location.props)}\n컷 종료 소품 상태: ${JSON.stringify(cut.propState??{})}\n확인 불가능하면 unknown.`,frameIds:[evidence.frames.at(-1)!.id]});
  const body={schemaVersion:1 as const,kind:'drama-sampled-visual-request' as const,authorized:false as const,policy:'ordinal-first-middle-last-v1' as const,requestId,jobId,
    target:{seriesId:ctx.series.id,episodeNo:ctx.episode.no,cutId},
    contextDigest:contentSha({content:releaseContentDigest(ctx.series,ctx.episode),genre:ctx.genre,previous:previous?{...previous,lines:previous.lines.map(({verification:_,...l})=>l)}:null}),evidence,questions};
  return {...body,requestDigest:contentSha(body)};
}

/** Pure protocol check only. Public adapter re-decodes files before calling this. */
export function evaluateVisualResponse(expected:DramaVisualRequest, rawRequest:unknown, rawResponse:unknown):DramaVisualReport {
  if(contentSha(rawRequest)!==contentSha(expected))throw new VisualVerdictError('요청이 현재 문맥·job·파일·질문과 다름');
  const parsed=responseSchema.safeParse(rawResponse);
  if(!parsed.success)throw new VisualVerdictError('응답 형식 오류');
  const response:DramaVisualResponse=parsed.data;
  if(response.requestId!==expected.requestId || response.requestDigest!==expected.requestDigest)throw new VisualVerdictError('응답 요청 지문 불일치');
  if(response.answers.length!==expected.questions.length || new Set(response.answers.map(a=>a.questionId)).size!==expected.questions.length)
    throw new VisualVerdictError('응답 질문 누락·중복·추가');
  for(const a of response.answers){
    const q=expected.questions.find(q=>q.id===a.questionId);
    if(!q || new Set(a.frameIds).size!==a.frameIds.length || a.frameIds.some(id=>!q.frameIds.includes(id)) || (a.verdict!=='unknown' && !a.frameIds.length))
      throw new VisualVerdictError('해당 질문의 근거 프레임 필요');
  }
  const verdict=response.answers.some(a=>a.verdict==='fail')?'fail':response.answers.some(a=>a.verdict==='unknown')?'unknown':'pass';
  return {schemaVersion:1,kind:'drama-sampled-visual-report',authorized:false,scope:'sampled-visual-description',requestId:expected.requestId,requestDigest:expected.requestDigest,responseDigest:contentSha(response),verdict,reviewer:response.reviewer,reviewedAt:response.reviewedAt,answers:response.answers,
    blockers:['샘플 프레임만 판정: 전체 비트·참조 이미지·컷 연결·대사 미검증','실행 상태·출시 승인 미구현 — 생성/조립 권한 없음']};
}
