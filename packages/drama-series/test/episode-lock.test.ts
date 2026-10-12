import { expect, it } from 'vitest';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { keyframeContext } from './keyframe-fixture.js';
import { acquireEpisodeLock, changeEpisodeOwner, episodeLockStatus, withEpisodeOwner, assertUnprotectedOutput } from '../src/adapters/episode-lock.js';
const owner={agent:'codex' as const,session:'writer-A'},other={agent:'codex' as const,session:'writer-B'};
function env() {
  const dir=mkdtempSync(join(tmpdir(),'episode-lock-')),file=join(dir,'ep.json'),ctx=keyframeContext();writeFileSync(file,JSON.stringify(ctx.episode));
  const result=acquireEpisodeLock(file,owner,0),guard={owner,lockId:result.lock.lockId,revision:result.lock.revision,episodeSha:result.episodeSha};
  return {dir,file,ctx,guard};
}
it('serializes edits with owner identity, ownership epoch and episode-byte CAS',()=>{
  const e=env(),before=readFileSync(e.file);
  expect(()=>withEpisodeOwner(e.file,{...e.guard,owner:other},()=>{})).toThrow(/소유/);
  expect(()=>withEpisodeOwner(e.file,{...e.guard,lockId:'00000000-0000-4000-8000-000000000000'},()=>{})).toThrow(/revision/);
  expect(()=>withEpisodeOwner(e.file,{...e.guard,revision:0},()=>{})).toThrow(/revision/);
  expect(readFileSync(e.file)).toEqual(before);
  withEpisodeOwner(e.file,e.guard,tx=>{tx.episode.title='수정';tx.write(tx.episode);});
  expect(episodeLockStatus(e.file).lock?.revision).toBe(e.guard.revision);
  expect(()=>withEpisodeOwner(e.file,e.guard,()=>{})).toThrow(/SHA CAS/);
  expect(JSON.parse(readFileSync(e.file,'utf8')).title).toBe('수정');
});
it('keeps a tombstone on release and rejects old epochs after reacquire/handoff',()=>{
  const e=env();expect(()=>acquireEpisodeLock(e.file,other,1)).toThrow(/다른/);
  const hand=changeEpisodeOwner(e.file,e.guard,other,'독립 세션 인계');expect(hand.lock.revision).toBe(2);
  expect(()=>withEpisodeOwner(e.file,e.guard,()=>{})).toThrow(/소유/);
  const b={...e.guard,owner:other,revision:2};const released=changeEpisodeOwner(e.file,b,null,'완료');
  expect(released.lock.owner).toBeNull();expect(existsSync(e.file+'.lock.json')).toBe(true);
  expect(()=>acquireEpisodeLock(e.file,owner,0)).toThrow(/revision/);
  const next=acquireEpisodeLock(e.file,owner,3);expect(next.lock.revision).toBe(4);
  expect(()=>withEpisodeOwner(e.file,e.guard,()=>{})).toThrow(/revision/);
});
it('cannot downgrade policy/change target, and failed update preserves original bytes',()=>{
  const e=env(),original=readFileSync(e.file);
  expect(()=>withEpisodeOwner(e.file,e.guard,tx=>{delete tx.episode.shotPolicy;tx.write(tx.episode);})).toThrow(/정책/);
  expect(()=>withEpisodeOwner(e.file,e.guard,tx=>{tx.episode.no++;tx.write(tx.episode);})).toThrow(/대상/);
  expect(()=>withEpisodeOwner(e.file,e.guard,tx=>{tx.episode.title='x'.repeat(1048576);tx.write(tx.episode);})).toThrow(/1MiB/);
  expect(readFileSync(e.file)).toEqual(original);expect(existsSync(e.file+'.writer')).toBe(false);
});
it('rejects nested writers, stale writer artifacts and deferred writes',()=>{
  const e=env();let deferred:(()=>void)|undefined;
  withEpisodeOwner(e.file,e.guard,tx=>{expect(()=>episodeLockStatus(e.file)).toThrow(/writer/);deferred=()=>tx.write(tx.episode);});
  expect(()=>deferred!()).toThrow(/종료/);
  mkdirSync(e.file+'.writer');expect(()=>withEpisodeOwner(e.file,e.guard,()=>{})).toThrow(/자동 회수/);expect(existsSync(e.file+'.writer')).toBe(true);
});
it('normalizes parent aliases, and refuses episode hardlinks/symlinks and lock symlinks',()=>{
  const e=env(),alias=e.dir+'-alias';symlinkSync(e.dir,alias);
  expect(episodeLockStatus(join(alias,'ep.json')).lock?.lockId).toBe(e.guard.lockId);
  expect(()=>acquireEpisodeLock(join(alias,'ep.json'),other,1)).toThrow(/다른/);
  const sym=join(e.dir,'sym.json');symlinkSync(e.file,sym);expect(()=>episodeLockStatus(sym)).toThrow(/링크/);
  const hard=join(e.dir,'hard.json');linkSync(e.file,hard);expect(()=>episodeLockStatus(hard)).toThrow(/링크/);
});
it('generic output guards refuse protected targets, metadata, aliases and shot-v1 without a lock',()=>{
  const e=env();for(const p of [e.file,e.file+'.lock.json',join(e.file+'.writer','holder.json')])expect(()=>assertUnprotectedOutput(p)).toThrow();
  const standalone=join(e.dir,'unlocked.json');writeFileSync(standalone,JSON.stringify(e.ctx.episode));expect(()=>assertUnprotectedOutput(standalone)).toThrow(/shot-v1/);
  const sym=join(e.dir,'symlink.json');symlinkSync(e.file,sym);expect(()=>assertUnprotectedOutput(sym)).toThrow(/링크/);
  expect(()=>assertUnprotectedOutput(join(e.dir,'fresh.json'))).not.toThrow();
});
it('detects out-of-band writes during callback instead of overwriting them',()=>{
  const e=env();expect(()=>withEpisodeOwner(e.file,e.guard,tx=>{writeFileSync(e.file,JSON.stringify({...tx.episode,title:'외부 변경'}));tx.write(tx.episode);})).toThrow(/CAS/);
  expect(JSON.parse(readFileSync(e.file,'utf8')).title).toBe('외부 변경');
});

it('protects metadata case aliases and writer-directory symlink ancestors',()=>{
  const e=env();expect(()=>assertUnprotectedOutput(e.file+'.LOCK.JSON')).toThrow(/보호/);
  mkdirSync(e.file+'.writer');const alias=e.dir+'-writer-alias';symlinkSync(e.file+'.writer',alias);
  expect(()=>assertUnprotectedOutput(join(alias,'holder.json'))).toThrow(/보호/);
});
