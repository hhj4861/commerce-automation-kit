import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parseEpisode, parseSeries } from '../src/core/model.js';
import { loadGenre } from '../src/core/genre.js';
import type { GateContext } from '../src/core/gates/types.js';
import { previousCutOf, continuationFindings, contextBinding, isContextLineCleared } from '../src/core/continuation.js';
import { runEpisodeGates } from '../src/core/gates/registry.js';
import { buildQuestions, judgeState, applyVerdicts } from '../src/core/judge-gates.js';
import { parseJevResponse } from '../src/adapters/judge/jev.js';
import { buildPlan } from '../src/core/plan.js';
import { toSeedanceClip } from '../src/adapters/video/seedance-2-5.js';
import { assembleEpisode } from '../src/adapters/assemble.js';
import { lineHash } from '../src/core/line-hash.js';
import { fingerprintOf, topicFingerprint } from '../src/core/fingerprint.js';
import { toReport } from '../src/core/report.js';

const fx = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
function context(linked = true): GateContext {
  const series = parseSeries(fx('series'));
  const prev = parseEpisode(fx('episode'));
  const episode = parseEpisode(fx('episode'));
  if (linked) {
    episode.no = 2;
    episode.continuesFromEpisode = { no: 1, cutId: 'c4' };
    episode.cuts = [structuredClone(prev.cuts[3]!)];
    episode.cuts[0]!.transitionIn = 'cut';
  }
  return { series, episode, genre: loadGenre(series.genreId), ...(linked ? { prev: { episode: prev } } : {}) };
}
const video = { resolution: '480p' as const, draft: true, aspectRatio: '16:9' as const };
const plan = (ctx: GateContext, reports = runEpisodeGates(ctx)) => buildPlan({ ctx, reports, video, budgetCredits: 200, now: 'now' });
const messages = (v: unknown) => JSON.stringify(v);

function reviewed(ctx: GateContext) {
  const qs = buildQuestions('dialogue', ctx);
  const expected = qs.map(q => ({ id:q.id, type:q.type }));
  const verdicts = parseJevResponse({ answers: Object.fromEntries(qs.map(q => [q.id, { type:'choice', choice:'pass', confidence:1, probabilities:{pass:1,fail:0} }])) }, expected);
  return applyVerdicts('dialogue', ctx, expected, verdicts, 'synthetic-test', '2026-10-11T00:00:00Z', contextBinding(ctx));
}

describe('opt-in episode continuation', () => {
  it('keeps legacy predecessors and accepts startsFresh without inventing prior context', () => {
    const c = context(false);
    expect(previousCutOf(c, 0)).toBeUndefined();
    expect(previousCutOf(c, 1)).toBe(c.episode.cuts[0]);
    expect(contextBinding(c)).toEqual({});
    expect(judgeState(c)).not.toHaveProperty('previousEpisode');
    c.episode.startsFresh = true;
    expect(continuationFindings(c)).toEqual([]);
    expect(parseEpisode(c.episode).startsFresh).toBe(true);
  });
  it('resolves the previous final cut even when cut IDs repeat in each episode', () => {
    const c = context();
    expect(previousCutOf(c, 0)).toBe(c.prev!.episode.cuts[3]);
    expect(previousCutOf(c, 0)).not.toBe(c.episode.cuts[0]);
    expect(parseEpisode(c.episode).continuesFromEpisode).toEqual({ no:1, cutId:'c4' });
    expect(() => previousCutOf(c, -1)).toThrow(/index/);
  });
  it.each([
    ['missing previous input', (c:GateContext) => { delete c.prev; }, /prev-episode/],
    ['wrong series', (c:GateContext) => { c.prev!.episode.seriesId='other'; }, /불일치/],
    ['wrong number', (c:GateContext) => { c.prev!.episode.no=5; }, /불일치/],
    ['skipped episode', (c:GateContext) => { c.episode.no=3; }, /불일치/],
    ['missing cut', (c:GateContext) => { c.episode.continuesFromEpisode!.cutId='missing'; }, /지정 컷/],
    ['duplicate cut', (c:GateContext) => { c.prev!.episode.cuts.push(c.prev!.episode.cuts[3]!); }, /중복/],
    ['non-final cut', (c:GateContext) => { c.episode.continuesFromEpisode!.cutId='c2'; }, /마지막 컷/],
    ['different location', (c:GateContext) => { c.episode.cuts[0]!.locationId='aisle'; }, /장소/],
    ['conflicting declaration', (c:GateContext) => { c.episode.startsFresh=true; }, /동시 선언/],
    ['undeclared previous input', (c:GateContext) => { delete c.episode.continuesFromEpisode; }, /연결 선언/],
  ])('fails closed: %s', (_, mutate, error) => {
    const c=context(); mutate(c);
    expect(() => buildQuestions('dialogue', c)).toThrow(error);
    expect(runEpisodeGates(c).find(r => r.gate==='continuity')!.ok).toBe(false);
  });
  it('carries prop state across the boundary and blocks omission', () => {
    const c=context();
    c.series.locations.find(l=>l.id==='parking')!.props.push('휴대폰');
    c.prev!.episode.cuts[3]!.propState={휴대폰:'손에 있음'};
    expect(messages(runEpisodeGates(c))).toMatch(/앞 컷\(c4\) 소품 상태 미반영: 휴대폰/);
    c.episode.cuts[0]!.propState={휴대폰:'손에 있음'};
    expect(runEpisodeGates(c).find(r=>r.gate==='continuity')!.ok).toBe(true);
  });
  it('includes prior action and dialogue in line and scenario review context', () => {
    const c=context();
    const prior=c.prev!.episode.cuts[3]!;
    prior.action='전화를 끊기 전에 상대가 멈추라고 한다.';
    prior.lines[0]!.text='거기 그대로 있어.';
    const q=buildQuestions('dialogue',c)[0]!;
    expect(q.candidate.previousCut).toContain(prior.action);
    expect(q.candidate.previousCut).toContain(prior.lines[0]!.text);
    expect(judgeState(c)).toMatchObject({previousEpisode:{episodeNo:1,cut:{id:'c4',action:prior.action}}});
    expect(messages(judgeState(c))).not.toContain('verification');
  });
  it('binds reviews to full current/prior content, genre and topic checks, not verification metadata', () => {
    const c=context(), before=contextBinding(c);
    expect(before.reviewContextDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    for (const change of [
      (x:GateContext)=>{x.prev!.episode.cuts[3]!.lines[0]!.text='바뀐 대사';},
      (x:GateContext)=>{x.prev!.episode.cuts[3]!.propState={전화:'꺼짐'};},
      (x:GateContext)=>{x.prev!.episode.cuts[3]!.action='다른 행동';},
      (x:GateContext)=>{x.genre.promise+=' changed';},
      (x:GateContext)=>{x.episode.cuts[0]!.action+=' changed';},
      (x:GateContext)=>{x.series.topic.verifiedElements=[];},
    ]) { const copy=structuredClone(c);change(copy);expect(contextBinding(copy)).not.toEqual(before); }
    c.prev!.episode.cuts[3]!.lines[0]!.verification={status:'verified',judgeRef:'different'};
    c.episode.cuts[0]!.lines[0]!.verification={status:'human-approved',approvedBy:'test'};
    expect(contextBinding(c)).toEqual(before);
  });
  it('invalidates line clearance and gate reports when prior content changes', () => {
    const c=context(), applied=reviewed(c);
    expect(applied.report.ok).toBe(true);
    expect(applied.report.reviewContextDigest).toBe(contextBinding(c).reviewContextDigest);
    c.episode=applied.episode;
    expect(buildQuestions('dialogue',c)).toEqual([]);
    const old=runEpisodeGates(c);
    c.prev!.episode.cuts[3]!.lines[0]!.text='밖으로 나와.';
    expect(buildQuestions('dialogue',c)).toHaveLength(4);
    expect(messages(plan(c,old))).toContain('앞 회차/검토 문맥이 달라 재판정 필요');
    expect(messages(plan(c,old))).toContain('검증 이후 대사·장면이 바뀜');
  });
  it('does not accept legacy line hashes or gate fingerprints as linked context proof', () => {
    const c=context(), cut=c.episode.cuts[0]!, line=cut.lines[0]!;
    line.verification={status:'verified',lineHash:lineHash(cut,line)};
    expect(isContextLineCleared(c,cut,line)).toBe(false);
    const old=runEpisodeGates(c).map(({reviewContextDigest:_,...r})=>r);
    expect(messages(plan(c,old))).toContain('재판정 필요');
  });
  it('blocks linked generation and assembly even with all synthetic reviews passing', () => {
    const c=context();c.episode=reviewed(c).episode;
    const fp=fingerprintOf(c.series,c.episode);
    const reports=[...runEpisodeGates(c), ...['props','scenario'].map(g=>({...toReport(g,'episode',[],fp),...contextBinding(c)})),toReport('topic-night-shift','topic',[],topicFingerprint(c.series.topic,c.series.genreId))];
    const r=plan(c,reports);
    expect(r.reports.find(x=>x.gate==='required-gates')!.ok).toBe(true);
    expect(r.reports.find(x=>x.gate==='verified-lines')!.ok).toBe(true);
    expect(r.plan).toBeNull();
    expect(messages(r)).toContain('승인된 앞 회차 출시/프레임 결합 경로 미구현');
    expect(()=>toSeedanceClip(c,c.episode.cuts[0]!,video)).toThrow(/회차 연결 생성 차단/);
    expect(()=>assembleEpisode({episode:c.episode,clipFiles:{},out:'unused',fontFile:'unused',workDir:'unused',aiLabel:null})).toThrow(/회차 연결 조립 차단/);
  });
  it('centralizes direct predecessor indexing', () => {
    const root=new URL('../src/',import.meta.url);
    const scan=(dir:URL):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?scan(new URL(e.name+'/',dir)):[new URL(e.name,dir).pathname]);
    for (const path of scan(root).filter(p=>p.endsWith('.ts')&&!p.endsWith('/continuation.ts'))) expect(readFileSync(path,'utf8')).not.toMatch(/cuts\s*\[[^\]]*-\s*1\s*\]/);
  });
});

describe('linked request/response binding', () => {
  it('rejects an old core response with stale or missing request binding', () => {
    const c=context(), binding=contextBinding(c);
    const qs=buildQuestions('dialogue',c), expected=qs.map(q=>({id:q.id,type:q.type}));
    const raw={answers:Object.fromEntries(qs.map(q=>[q.id,{type:'choice',choice:'pass',confidence:1,probabilities:{pass:1,fail:0}}]))};
    const v=parseJevResponse(raw,expected);
    expect(()=>applyVerdicts('dialogue',c,expected,v,'old','now')).toThrow(/문맥/);
    c.prev!.episode.cuts[3]!.lines[0]!.text='이전 판정 이후 바뀜';
    expect(()=>applyVerdicts('dialogue',c,expected,v,'old','now',binding)).toThrow(/문맥/);
  });
  it('rejects old answers paired with a newly built request for changed prior dialogue', () => {
    const c=context(), qs=buildQuestions('dialogue',c);
    const raw={answers:Object.fromEntries(qs.map(q=>[q.id,{type:'choice',choice:'pass',confidence:1,probabilities:{pass:1,fail:0}}]))};
    c.prev!.episode.cuts[3]!.lines[0]!.text='전화를 끊지 마.';
    const fresh=buildQuestions('dialogue',c).map(q=>({id:q.id,type:q.type}));
    expect(()=>parseJevResponse(raw,fresh)).toThrow(/질문 누락/);
  });
});

it.each(['scenario','props'] as const)('keeps %s labels and safety checks intact with bound IDs', kind => {
  const c=context(), qs=buildQuestions(kind,c), expected=qs.map(q=>({id:q.id,type:q.type}));
  const answers=Object.fromEntries(qs.map(q=>[q.id,q.type==='score'
    ? {type:'score',score:3,confidence:1,probabilities:{0:0,1:0,2:0,3:1,4:0}}
    : {type:'choice',choice:'pass',confidence:1,probabilities:{pass:1,fail:0}}]));
  const result=applyVerdicts(kind,c,expected,parseJevResponse({answers},expected),'synthetic','now',contextBinding(c));
  expect(result.report.ok).toBe(true);
  expect(result.report.reviewContextDigest).toBe(contextBinding(c).reviewContextDigest);
  expect(JSON.stringify(result.report.findings)).not.toContain('__ctx_');
  if(kind==='scenario') {
    const safety=qs.find(q=>q.id.startsWith('scenario__safe__sexual-boundary'))!;
    answers[safety.id]={type:'choice',choice:'fail',confidence:1,probabilities:{pass:0,fail:1}};
    const failed=applyVerdicts(kind,c,expected,parseJevResponse({answers},expected),'synthetic','now',contextBinding(c));
    expect(failed.report.ok).toBe(false);
    expect(failed.report.findings.some(f=>f.message==='safe__sexual-boundary 확정 fail')).toBe(true);
  }
  expect(()=>applyVerdicts(kind,c,expected.slice(1),[], 'synthetic','now',contextBinding(c))).toThrow(/질문 목록/);
});
