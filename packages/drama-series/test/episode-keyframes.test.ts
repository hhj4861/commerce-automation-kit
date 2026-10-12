import { beforeAll, expect, it, vi } from 'vitest';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { keyframeContext, keyframeApproval } from './keyframe-fixture.js';
import * as frames from '../src/adapters/keyframe-evidence.js';
import { acquireEpisodeLock, changeEpisodeOwner, episodeLockStatus, withEpisodeOwner } from '../src/adapters/episode-lock.js';
import { buildEpisodeKeyframes, checkEpisodeKeyframes } from '../src/adapters/episode-keyframes.js';
let root:string,png:string;
beforeAll(()=>{root=mkdtempSync(join(tmpdir(),'ep-kf-'));png=join(root,'image.png');expect(spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=red:s=160x90','-frames:v','1',png]).status).toBe(0);});
const json=(path:string,data:unknown)=>writeFileSync(path,JSON.stringify(data));
function env() {
  const dir=mkdtempSync(join(root,'case-')),ctx=keyframeContext();
  ctx.episode.cuts[0]!.lines=[{speaker:'seoyun',text:'안녕',kind:'dialogue',verification:{status:'unverified'}}];ctx.episode.cuts[0]!.beats![0]!.lines=[0];
  ctx.episode.cuts.push({...structuredClone(ctx.episode.cuts[0]!),id:'c2'});
  const episodePath=join(dir,'episode.json'),seriesPath=join(dir,'series.json'),manifestPath=join(dir,'manifest.json');json(episodePath,ctx.episode);json(seriesPath,ctx.series);
  const entries=ctx.episode.cuts.map(c=>{const s=join(dir,c.id+'-source'),approved=join(dir,c.id+'-approved'),ev=frames.prepareKeyframeEvidence(ctx,c.id,c.id+'-asset',png,s);
    frames.approveKeyframeEvidence(ctx,c.id,c.id+'-asset',s,keyframeApproval(ev),approved);return {cutId:c.id,assetId:c.id+'-asset',source:c.id+'-approved'};});
  json(manifestPath,{schemaVersion:1,entries:entries.slice().reverse()});
  const owner={agent:'codex' as const,session:'A'},lock=acquireEpisodeLock(episodePath,owner,0);
  const input={episodePath,seriesPath,manifestPath,guard:{owner,lockId:lock.lock.lockId,revision:1,episodeSha:lock.episodeSha}};
  return {dir,ctx,entries,input,out:join(dir,'all-approved.json')};
}
it('binds all actual approved cuts in script order and rechecks them',()=>{
  const e=env(),r=buildEpisodeKeyframes(e.input,e.out);expect(r.authorized).toBe(false);expect(r.cuts.map(c=>c.target.cutId)).toEqual(['c1','c2']);
  expect(checkEpisodeKeyframes(e.input,e.out).ok).toBe(true);expect(()=>buildEpisodeKeyframes(e.input,e.out)).toThrow();
});
it.each(['missing','duplicate','extra'])('rejects %s cut manifests without producing a report',kind=>{
  const e=env(),entries=e.entries.slice();if(kind==='missing')entries.pop();if(kind==='duplicate')entries[1]=entries[0]!;if(kind==='extra')entries.push({...entries[0]!,cutId:'c3'});
  json(e.input.manifestPath,{schemaVersion:1,entries});expect(()=>buildEpisodeKeyframes(e.input,e.out)).toThrow(/정확히/);expect(existsSync(e.out)).toBe(false);
});
it('dialogue edit keeps individual image approval but invalidates the episode aggregate',()=>{
  const e=env();buildEpisodeKeyframes(e.input,e.out);
  withEpisodeOwner(e.input.episodePath,e.input.guard,tx=>{tx.episode.cuts[0]!.lines[0]!.text='반가워요';tx.write(tx.episode);});
  e.input.guard.episodeSha=episodeLockStatus(e.input.episodePath).episodeSha;
  expect(()=>checkEpisodeKeyframes(e.input,e.out)).toThrow(/다시 묶기/);
  expect(buildEpisodeKeyframes(e.input,join(e.dir,'new-report.json')).cuts).toHaveLength(2);
});
it('ownership handoff invalidates a prior aggregate while retaining per-image evidence',()=>{
  const e=env();buildEpisodeKeyframes(e.input,e.out);const owner={agent:'codex' as const,session:'B'};
  changeEpisodeOwner(e.input.episodePath,e.input.guard,owner,'인계');e.input.guard={...e.input.guard,owner,revision:2};
  expect(()=>checkEpisodeKeyframes(e.input,e.out)).toThrow(/다시 묶기/);expect(buildEpisodeKeyframes(e.input,join(e.dir,'new-report.json')).lock.revision).toBe(2);
});
it('rejects a first-cut image changed while the later cut is checked',()=>{
  const e=env(),original=frames.checkKeyframeApproval;
  const spy=vi.spyOn(frames,'checkKeyframeApproval').mockImplementation((...args)=>{const result=original(...args);if(args[1]==='c2'){
    const file=join(e.dir,'c1-approved','image.png');chmodSync(file,0o600);writeFileSync(file,Buffer.concat([readFileSync(file),Buffer.from('changed')]));}return result;});
  try {expect(()=>buildEpisodeKeyframes(e.input,e.out)).toThrow(/입력 파일 변경/);expect(existsSync(e.out)).toBe(false);} finally {spy.mockRestore();}
});
it('rejects a series changed during decode and protects an episode as report destination',()=>{
  const e=env(),original=frames.checkKeyframeApproval;
  const spy=vi.spyOn(frames,'checkKeyframeApproval').mockImplementation((...args)=>{const result=original(...args);if(args[1]==='c2')json(e.input.seriesPath,{...e.ctx.series,styleEn:'different'});return result;});
  try {expect(()=>buildEpisodeKeyframes(e.input,e.out)).toThrow(/입력 파일 변경/);} finally {spy.mockRestore();}
  expect(()=>buildEpisodeKeyframes(e.input,e.input.episodePath)).toThrow(/보호/);
});

it('CLI aggregates then verifies all approved cut bundles using explicit ownership CAS',()=>{
  const e=env(),g=e.input.guard;
  const args=['--episode',e.input.episodePath,'--series',e.input.seriesPath,'--keyframes',e.input.manifestPath,
    '--agent',g.owner.agent,'--session',g.owner.session,'--lock-id',g.lockId,'--lock-revision',String(g.revision),'--episode-sha',g.episodeSha];
  const run=(command:string,tail:string[])=>spawnSync(process.execPath,['--import','tsx','src/cli/index.ts',command,...args,...tail],{encoding:'utf8',timeout:15000});
  const built=run('episode-keyframes-build',['--out',e.out]);expect(built.status,built.stderr).toBe(0);expect(JSON.parse(built.stdout).authorized).toBe(false);
  const checked=run('episode-keyframes-check',['--report',e.out]);expect(checked.status,checked.stderr).toBe(0);expect(JSON.parse(checked.stdout)).toMatchObject({ok:true,authorized:false});
});
