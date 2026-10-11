import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseEpisode, parseSeries } from '../src/core/model.js';
import { loadGenre } from '../src/core/genre.js';
import type { GateContext } from '../src/core/gates/types.js';
import { bindContinuationEvidence, contentSha, parseReleaseSource, parseSourceApproval, releaseContentDigest } from '../src/core/release-source.js';
const fx=(name:string)=>JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`,import.meta.url),'utf8'));
function setup() {
  const series=parseSeries(fx('series')),prev=parseEpisode(fx('episode'));
  const episode={...structuredClone(prev),no:2,continuesFromEpisode:{no:1,cutId:'c4'},cuts:[structuredClone(prev.cuts[3]!)]};
  const ctx:GateContext={series,episode,prev:{episode:prev},genre:loadGenre(series.genreId)};
  const file={sha256:'sha256:'+'a'.repeat(64),bytes:1024};
  const body={schemaVersion:1,kind:'drama-release-source',authorized:false,seriesId:series.id,episodeNo:1,cutId:'c4',contentDigest:releaseContentDigest(series,prev),clip:file,frame:{...file,pixelSha256:file.sha256,frameCount:3,extraction:'video-0-rgb24-last-v1'}};
  const source=parseReleaseSource({...body,subjectDigest:contentSha(body)});
  const approval=parseSourceApproval({schemaVersion:1,decision:'approve-continuation-source',subjectDigest:source.subjectDigest,approvedBy:'synthetic-user',userQuote:'이 합성 시험 입력을 승인합니다.',recordedBy:'test-session',at:'2026-10-11T00:00:00Z'});
  return {ctx,source,approval};
}
describe('source evidence binding (no execute authorization)',()=>{
  it('binds current context and supplied approval to the selected previous cut',()=>{
    const {ctx,source,approval}=setup();
    const result=bindContinuationEvidence(ctx,source,approval);
    expect(result.authorized).toBe(false);
    expect(result.target).toEqual({seriesId:'night-shift',episodeNo:2,cutId:'c4'});
    expect(result.source.episodeNo).toBe(1);
    expect(result.bindingDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    const copy=structuredClone(ctx);copy.episode.cuts[0]!.action='현재 대본 변경';
    expect(bindContinuationEvidence(copy,source,approval).bindingDigest).not.toBe(result.bindingDigest);
  });
  it('rejects approval for another snapshot and stale previous script',()=>{
    const {ctx,source,approval}=setup();
    expect(()=>bindContinuationEvidence(ctx,source,{...approval,subjectDigest:'sha256:'+'b'.repeat(64)})).toThrow(/승인 기록/);
    ctx.prev!.episode.cuts[3]!.lines[0]!.text='바뀐 대사';
    expect(()=>bindContinuationEvidence(ctx,source,approval)).toThrow(/대본 또는 시리즈 변경/);
  });
  it.each(['approvedBy','userQuote','recordedBy','at'])('requires %s in supplied human decision',key=>{
    const {approval}=setup();expect(()=>parseSourceApproval({...approval,[key]:''})).toThrow(/승인 기록/);
  });
  it('refuses unknown fields and forged authorization/digests',()=>{
    const {source}=setup();
    expect(()=>parseReleaseSource({...source,authorized:true})).toThrow(/형식/);
    expect(()=>parseReleaseSource({...source,extra:'pass'})).toThrow(/형식/);
    expect(()=>parseReleaseSource({...source,clip:{...source.clip,bytes:2}})).toThrow(/지문/);
  });
  it('verification metadata does not masquerade as script content changes',()=>{
    const {ctx,source}=setup();ctx.prev!.episode.cuts[3]!.lines[0]!.verification={status:'human-approved',approvedBy:'test'};
    expect(releaseContentDigest(ctx.series,ctx.prev!.episode)).toBe(source.contentDigest);
    ctx.series.styleEn+='different';expect(releaseContentDigest(ctx.series,ctx.prev!.episode)).not.toBe(source.contentDigest);
  });
  it('rejects a correctly hashed source for another episode or cut',()=>{
    const {ctx,source,approval}=setup();
    for(const change of [{episodeNo:2},{cutId:'c2'},{seriesId:'other'}]){
      const {subjectDigest:_,...body}={...source,...change};
      const altered=parseReleaseSource({...body,subjectDigest:contentSha(body)});
      expect(()=>bindContinuationEvidence(ctx,altered,{...approval,subjectDigest:altered.subjectDigest})).toThrow(/시리즈·회차·컷 불일치/);
    }
  });
});
