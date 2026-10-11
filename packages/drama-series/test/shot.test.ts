import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseEpisode, parseSeries } from '../src/core/model.js';
import { loadGenre } from '../src/core/genre.js';
import { shotGate } from '../src/core/gates/shot.js';
import { runEpisodeGates } from '../src/core/gates/registry.js';
import { dialogueLintGate } from '../src/core/gates/dialogue-lint.js';
import { beatWindows, chainsFromV1, speechSeconds } from '../src/core/shot-policy.js';
import { fingerprintOf, topicFingerprint } from '../src/core/fingerprint.js';
import { lineHash } from '../src/core/line-hash.js';
import { buildPlan } from '../src/core/plan.js';
import { toReport } from '../src/core/report.js';
import { toSeedanceClip } from '../src/adapters/video/seedance-2-5.js';
import { assembleEpisode } from '../src/adapters/assemble.js';
import type { GateContext } from '../src/core/gates/types.js';
import type { DramaCut } from '@cak/contracts';
const fx=(name:string)=>JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`,import.meta.url),'utf8'));
function context(): GateContext {
  const series=parseSeries(fx('series')), episode=parseEpisode(fx('episode'));
  series.locations[0]!.setups=[{id:'wide',name:'통로 전경',cameraEn:'locked wide shot',visiblePropIds:['박스','빈 박스 더미']}];
  episode.cuts=[episode.cuts[0]!]; episode.shotPolicy={version:'shot-v1',strict:true}; episode.authoredBy='codex';
  const cut=episode.cuts[0]!;
  Object.assign(cut,{setupId:'wide',blocking:[{characterId:'seoyun',side:'center'}],
    beats:[{en:'She picks up the box.',lines:[0]}],usedPropIds:['박스'],
    lines:[{speaker:'seoyun',text:'안녕.',kind:'dialogue',verification:{status:'unverified'}}]});
  return {series:parseSeries(series),episode:parseEpisode(episode),genre:loadGenre(series.genreId)};
}
const findings=(c:GateContext)=>shotGate.run(c);
const blocks=(c:GateContext)=>findings(c).filter(f=>f.severity==='block').map(f=>f.message).join('\n');
function pair() {
  const c=context(), second=structuredClone(c.episode.cuts[0]!);
  second.id='c2'; second.continuesFromPrev=true; c.episode.cuts.push(second); return c;
}
const video={resolution:'480p' as const,draft:true,aspectRatio:'16:9' as const};
function plan(c:GateContext) {
  for(const cut of c.episode.cuts) for(const line of cut.lines) line.verification={status:'verified',lineHash:lineHash(cut,line)};
  const fp=fingerprintOf(c.series,c.episode);
  const reports=[...runEpisodeGates(c),...['props','scenario'].map(g=>toReport(g,'episode',[],fp)),toReport('topic-night-shift','topic',[],topicFingerprint(c.series.topic,c.series.genreId))];
  return buildPlan({ctx:c,reports,video,budgetCredits:200,now:'synthetic'});
}

describe('shot-v1 structural contract',()=>{
  it('retains the new fields and accepts a complete single-character cut',()=>{
    const c=context(); expect(c.episode.cuts[0]!.beats?.[0]!.lines).toEqual([0]); expect(blocks(c)).toBe('');
    const cut=c.episode.cuts[0]!;cut.cameraMove='push-in';cut.cast[0]!.carriesPropIds=['가방'];
    c.series.characters[0]!.looks[0]!.outfitRefAssetId='outfit';
    expect(parseEpisode(c.episode).cuts[0]).toMatchObject({cameraMove:'push-in',cast:[{carriesPropIds:['가방']}]});
    expect(parseSeries(c.series).characters[0]!.looks[0]!.outfitRefAssetId).toBe('outfit');
  });
  it.each([{version:'shot-v2',strict:true},{version:'shot-v1',strict:false},null,{}, {version:'shot-v1',strict:true,extra:true}])('rejects malformed/unknown policy rather than downgrading to legacy (%j)',policy=>{
    expect(()=>parseEpisode({...fx('episode'),shotPolicy:policy})).toThrow(/shotPolicy/);
  });
  it.each([0,-1,Infinity,NaN])('rejects invalid beat seconds %s',sec=>{
    const c=context();c.episode.cuts[0]!.beats![0]!.sec=sec;expect(()=>parseEpisode(c.episode)).toThrow(/sec/);
  });
  it('rejects unknown structured beat fields and malformed blocking',()=>{
    const c=context();expect(()=>parseEpisode({...c.episode,cuts:[{...c.episode.cuts[0],beats:[{en:'Hold',line:[0]}]}]})).toThrow();
    c.episode.cuts[0]!.blocking![0]!.side='top' as any;expect(()=>parseEpisode(c.episode)).toThrow(/side/);
  });
  it('requires author and explicit episode boundary for v1 episode 2+',()=>{
    const c=context();delete c.episode.authoredBy;c.episode.no=2;
    expect(blocks(c)).toMatch(/authoredBy/);expect(blocks(c)).toMatch(/startsFresh/);
    c.episode.authoredBy='codex';c.episode.startsFresh=true;expect(blocks(c)).toBe('');
  });
  it('preserves legacy fingerprints and makes shot findings informational only',()=>{
    const c={series:parseSeries(fx('series')),episode:parseEpisode(fx('episode')),genre:loadGenre('hidden-master-revenge')};
    expect(findings(c).length).toBeGreaterThan(0);expect(findings(c).every(f=>f.severity==='info')).toBe(true);
    const fp=fingerprintOf(c.series,c.episode),r=plan(c);expect(r.ok).toBe(true);expect(r.plan!.fingerprint).toBe(fp);
    expect(r.plan!.clips).toHaveLength(4);expect(r.plan!.clips[1]!.startFromCut).toBe('c1');
  });
  it('binds changed beat or blocking data to the content fingerprint',()=>{
    const c=context(),fp=fingerprintOf(c.series,c.episode);c.episode.cuts[0]!.beats![0]!.en+=' changed';
    expect(fingerprintOf(c.series,c.episode)).not.toBe(fp);
    const f2=fingerprintOf(c.series,c.episode);c.episode.cuts[0]!.blocking![0]!.side='left';expect(fingerprintOf(c.series,c.episode)).not.toBe(f2);
  });
});

describe('beat time budgets',()=>{
  it.each(['HELP','123456','아악!', '…', '😱'])('counts nonempty speech %s, including non-Korean/vocal text',text=>{
    expect(speechSeconds(text)).toBeGreaterThan(0);
  });
  it('normalizes NFD Korean before counting',()=>expect(speechSeconds('안녕'.normalize('NFD'))).toBe(speechSeconds('안녕')));
  it('allocates unspecified intervals by speech+action weight and preserves explicit seconds',()=>{
    const cut=context().episode.cuts[0]!;
    cut.beats=[{en:'Speak',lines:[0]},{en:'React'}];const w=beatWindows(cut);
    expect(w[0]!.endSec).toBeGreaterThan(5);expect(w[1]!.startSec).toBe(w[0]!.endSec);expect(w[1]!.endSec).toBeCloseTo(10);
    cut.beats[0]!.sec=4;const exact=beatWindows(cut);expect(exact[0]!.endSec).toBe(4);expect(exact[1]!.endSec).toBe(10);
  });
  it('blocks a cramped explicit beat even when total cut time is sufficient',()=>{
    const c=context();c.episode.cuts[0]!.beats=[{en:'Speak',sec:1,lines:[0]},{en:'Wait',sec:9}];
    expect(blocks(c)).toMatch(/비트 1 발화\+동작/);expect(blocks(c)).not.toMatch(/컷 10초 초과/);
  });
  it('blocks long English/numeric speech and reserves action time',()=>{
    const c=context();c.episode.cuts[0]!.lines[0]!.text='HELP HELP 12345678901234567890';expect(blocks(c)).toMatch(/발화\+동작/);
    c.episode.cuts[0]!.lines[0]!.text='가'.repeat(20);expect(blocks(c)).toMatch(/발화\+동작/);
  });
  it('blocks explicit overflow and zero remaining allocation',()=>{
    const c=context();c.episode.cuts[0]!.beats=[{en:'Speak',sec:11,lines:[0]}];expect(blocks(c)).toMatch(/sec 합/);
    c.episode.cuts[0]!.beats=[{en:'Speak',sec:10,lines:[0]},{en:'React'}];expect(blocks(c)).toMatch(/비트 2/);
  });
  it.each([undefined,[],[{en:'a'},{en:'b'},{en:'c'}]].map(beats=>({beats})))('requires 1~2 beats ($beats)',({beats})=>{
    const c=context();c.episode.cuts[0]!.beats=beats;expect(blocks(c)).toMatch(/1~2개/);
  });
  it.each([[1],[],[0,0],[-1],[0.5]].map(lines=>({lines})))('rejects missing/duplicate/out-of-range line mapping $lines',({lines})=>{
    const c=context();c.episode.cuts[0]!.beats![0]!.lines=lines;expect(blocks(c)).toMatch(/인덱스/);
  });
  it('rejects a reversed beat line order',()=>{
    const c=context(),cut=c.episode.cuts[0]!;cut.lines.push(structuredClone(cut.lines[0]!));cut.beats=[{en:'speak',lines:[1]},{en:'speak',lines:[0]}];
    expect(blocks(c)).toMatch(/대사 순서/);
  });
  it('reports duration/lines/cast limits and avoids duplicate line review',()=>{
    const c=context(),cut=c.episode.cuts[0]!;cut.durationSec=13;
    cut.lines=Array.from({length:4},()=>({speaker:'seoyun',text:'가',kind:'dialogue' as const,verification:{status:'unverified' as const}}));
    cut.cast=Array.from({length:4},(_,i)=>({characterId:'person-'+i,lookId:'base'}));
    expect(blocks(c)).toMatch(/컷 길이/);expect(blocks(c)).toMatch(/대사 3줄/);expect(blocks(c)).toMatch(/인물 3명/);
    expect(dialogueLintGate.run(c).some(f=>/컷당 대사/.test(f.message))).toBe(false);
    cut.durationSec=11;expect(findings(c).some(f=>f.severity==='review'&&/길이/.test(f.message))).toBe(true);
  });
});

describe('shot staging and prop state',()=>{
  it.each([undefined,[],[{characterId:'ghost',side:'left' as const}],[{characterId:'seoyun',side:'left' as const},{characterId:'seoyun',side:'right' as const}]].map(blocking=>({blocking})))('requires exact blocking even for one cast member ($blocking)',({blocking})=>{
    const c=context();c.episode.cuts[0]!.blocking=blocking;expect(blocks(c)).toMatch(/blocking/);
  });
  it('blocks duplicate cast even if blocking matches',()=>{
    const c=context();c.episode.cuts[0]!.cast.push(c.episode.cuts[0]!.cast[0]!);expect(blocks(c)).toMatch(/blocking/);
  });
  it('rejects missing/unknown/duplicate setups and undeclared visible props',()=>{
    const c=context(),cut=c.episode.cuts[0]!;delete cut.setupId;expect(blocks(c)).toMatch(/setupId/);
    cut.setupId='ghost';expect(blocks(c)).toMatch(/setupId/);
    cut.setupId='wide';c.series.locations[0]!.setups!.push(structuredClone(c.series.locations[0]!.setups![0]!));
    expect(blocks(c)).toMatch(/구도 id 중복/);
    c.series.locations[0]!.setups![0]!.visiblePropIds.push('미등록');expect(blocks(c)).toMatch(/미등록 소품/);
  });
  it('checks used props against visible, carried or predecessor state; prose is review only',()=>{
    const c=pair(),cut=c.episode.cuts[1]!;cut.usedPropIds=['빈 박스 더미','가방'];expect(blocks(c)).toMatch(/가방/);
    cut.cast[0]!.carriesPropIds=['가방'];expect(blocks(c)).toBe('');
    expect(findings(c).some(f=>f.cutId==='c2'&&f.severity==='review'&&/usedPropIds/.test(f.message))).toBe(true);
    cut.usedPropIds=['박스','빈 박스 더미','가방'];expect(blocks(c)).toBe('');
  });
  it('requires declared changes to match the final prop state, in order',()=>{
    const c=pair(),cut=c.episode.cuts[1]!;cut.usedPropIds=['박스','빈 박스 더미'];cut.propState!['빈 박스 더미']='무너짐';
    expect(blocks(c)).toMatch(/종료 propState/);
    cut.beats![0]!.changes={'빈 박스 더미':'무너짐'};expect(blocks(c)).toBe('');
    cut.beats!.push({en:'Rebuild boxes',changes:{'빈 박스 더미':'쌓여 있음'}});expect(blocks(c)).toMatch(/종료 propState/);
    cut.propState!['빈 박스 더미']='쌓여 있음';expect(blocks(c)).toBe('');
  });
  it('rejects unknown or unused changed props and dropped prior state',()=>{
    const c=pair(),cut=c.episode.cuts[1]!;cut.beats![0]!.changes={미등록:'변경',박스:'이동'};expect(blocks(c)).toMatch(/소품 변화/);
    cut.beats![0]!.changes={};cut.propState={};expect(blocks(c)).toMatch(/종료 propState/);
  });
  it('allows initial state without a predecessor and carried state without contradicting continuity',()=>{
    const c=context(),cut=c.episode.cuts[0]!;cut.cast[0]!.carriesPropIds=['가방'];cut.propState!['가방']='들고 있음';
    expect(runEpisodeGates(c).filter(r=>!r.ok)).toEqual([]);
  });
  it('uses explicit continuation with shared blocking compatibility and same setup',()=>{
    const c=pair(),[a,b]=c.episode.cuts as [DramaCut,DramaCut];expect(chainsFromV1(a,b)).toBe(true);
    b.blocking![0]!.side='left';expect(chainsFromV1(a,b)).toBe(false);expect(blocks(c)).toMatch(/continuesFromPrev/);
    b.blockingChange='move';expect(chainsFromV1(a,b)).toBe(true);
    b.setupId='other';expect(chainsFromV1(a,b)).toBe(false);
    b.setupId='wide';b.transitionIn='flash';expect(chainsFromV1(a,b)).toBe(false);
    expect(chainsFromV1(undefined,b)).toBe(false);
  });
  it('does not excuse left/right reversal with an edit transition',()=>{
    const c=pair(),[a,b]=c.episode.cuts as [DramaCut,DramaCut];
    for(const cut of [a,b]){cut.cast.push({characterId:'changsik',lookId:'base'});cut.blocking=[{characterId:'seoyun',side:'left'},{characterId:'changsik',side:'right'}];}
    b.blocking![0]!.side='right';b.blocking![1]!.side='left';b.transitionIn='flash';b.continuesFromPrev=false;
    expect(findings(c).some(f=>f.severity==='review'&&/좌우 반전/.test(f.message))).toBe(true);
    b.blockingChange='reverse';expect(findings(c).some(f=>/좌우 반전/.test(f.message))).toBe(false);
  });
  it('uses cross-episode final state and only permits legacy predecessor fallback explicitly',()=>{
    const c=context(),previous=structuredClone(c.episode);delete previous.shotPolicy;delete previous.cuts[0]!.setupId;delete previous.cuts[0]!.blocking;
    c.episode.no=2;c.episode.continuesFromEpisode={no:1,cutId:'c1'};c.prev={episode:previous};c.episode.cuts[0]!.continuesFromPrev=true;
    expect(blocks(c)).toBe('');expect(chainsFromV1(previous.cuts[0],c.episode.cuts[0]!)).toBe(false);
    c.episode.cuts[0]!.propState={};expect(blocks(c)).toMatch(/종료 propState/);
    previous.no=3;expect(blocks(c)).toMatch(/번호 불일치/);
  });
});

describe('shot-v1 never emits generation/assembly before release gates exist',()=>{
  it('blocks even with every current report and line verification passing',()=>{
    const c=context();expect(blocks(c)).toBe('');const r=plan(c);expect(r.ok).toBe(false);expect(r.plan).toBeNull();
    expect(r.reports.find(r=>r.gate==='backend')!.findings[0]!.message).toMatch(/shot-v1 생성 차단/);
    expect(()=>toSeedanceClip(c,c.episode.cuts[0]!,video)).toThrow(/shot-v1 생성 차단/);
    expect(()=>assembleEpisode({episode:c.episode,clipFiles:{},out:'unused',workDir:'unused',fontFile:'unused',aiLabel:null})).toThrow(/shot-v1 조립 차단/);
  });
  it('blocks CLI plan and assembly; stores failed plan evidence without a generation spec',()=>{
    const c=context(),dir=mkdtempSync(join(tmpdir(),'shot-cli-')),path=(f:string)=>join(dir,f);
    writeFileSync(path('series.json'),JSON.stringify(c.series));writeFileSync(path('episode.json'),JSON.stringify(c.episode));
    const base=['--series',path('series.json'),'--episode',path('episode.json')];
    const cli=(args:string[])=>spawnSync(process.execPath,['--import','tsx','src/cli/index.ts',...args],{cwd:fileURLToPath(new URL('..',import.meta.url)),encoding:'utf8',timeout:30_000});
    const validate=cli(['validate',...base,'--gates',path('gates')]);expect(validate.status,validate.stderr).toBe(0);
    const p=cli(['plan',...base,'--gates',path('gates'),'--budget','200','--draft','--out',path('plan.json')]);
    expect(p.status,p.stderr).toBe(1);expect(p.stdout).toMatch(/shot-v1 생성 차단/);const saved=JSON.parse(readFileSync(path('plan.json'),'utf8'));expect(saved.ok).toBe(false);expect(saved.clips).toBeUndefined();expect(JSON.parse(p.stdout).plan).toBeNull();
    const a=cli(['assemble',...base,'--clips',path('missing'),'--out',path('episode.mp4')]);
    expect(a.status,a.stderr).toBe(1);expect(a.stdout).toMatch(/shot-v1 조립 차단/);expect(existsSync(path('episode.mp4'))).toBe(false);
  });
});

it('join-check follows explicit shot policy, reports invalid chains, and preserves legacy cross-episode fallback',()=>{
  const c=pair(),dir=mkdtempSync(join(tmpdir(),'shot-join-cli-')),path=(f:string)=>join(dir,f);
  writeFileSync(path('series.json'),JSON.stringify(c.series));
  const run=(extra:string[]=[])=>{
    writeFileSync(path('episode.json'),JSON.stringify(c.episode));
    const r=spawnSync(process.execPath,['--import','tsx','src/cli/index.ts','join-check','--series',path('series.json'),'--episode',path('episode.json'),'--clips',path('empty'),...extra],
      {cwd:fileURLToPath(new URL('..',import.meta.url)),encoding:'utf8',timeout:30_000});
    if(r.error||!r.stdout.trim())throw new Error(String(r.error??r.stderr));
    return {code:r.status,body:JSON.parse(r.stdout)};
  };
  c.episode.cuts[1]!.continuesFromPrev=false;
  expect(run()).toMatchObject({code:0,body:{ok:true,joins:[]}});
  delete c.episode.cuts[1]!.continuesFromPrev;
  expect(run()).toMatchObject({code:0,body:{ok:true,joins:[]}});
  c.episode.cuts[1]!.continuesFromPrev=true;
  const connected=run();expect(connected.code).toBe(1);expect(connected.body.joins[0].finding.message).toBe('클립 파일 없음');
  c.episode.cuts[1]!.blocking![0]!.side='left';
  expect(run().body.joins[0].finding.message).toMatch(/shot-v1 연결 선언 불일치/);
  c.episode.cuts=[c.episode.cuts[0]!];c.episode.cuts[0]!.continuesFromPrev=true;
  expect(run()).toMatchObject({code:1,body:{ok:false}});
  const previous=structuredClone(c.episode);delete previous.shotPolicy;delete previous.cuts[0]!.setupId;delete previous.cuts[0]!.blocking;
  writeFileSync(path('previous.json'),JSON.stringify(previous));
  c.episode.no=2;c.episode.continuesFromEpisode={no:1,cutId:'c1'};
  expect(run(['--prev-episode',path('previous.json')]).body.joins[0].finding.message).toMatch(/--prev-clips 필수/);
});
