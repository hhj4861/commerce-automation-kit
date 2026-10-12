import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import type { DramaEpisode, DramaEpisodeLock, DramaEpisodeOwner } from '@cak/contracts';
import { parseEpisode, ID } from '../core/model.js';
import { inspectFile, readStrictJsonFile } from './media-evidence.js';

export class EpisodeLockError extends Error {}
const ownerSchema=z.object({agent:z.enum(['claude','codex']),session:z.string().trim().min(1).max(256)}).strict();
const revisionSchema=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER-1);
const shaSchema=z.string().regex(/^sha256:[0-9a-f]{64}$/);
const stateSchema=z.object({schemaVersion:z.literal(1),kind:z.literal('drama-episode-lock'),lockId:z.string().uuid(),episodePath:z.string(),
  target:z.object({seriesId:ID,episodeNo:z.number().int().positive()}).strict(),revision:revisionSchema.refine(n=>n>0),owner:ownerSchema.nullable(),
  updatedAt:z.string().datetime(),lastChange:z.object({kind:z.enum(['acquire','handoff','release']),by:ownerSchema,note:z.string().trim().min(1).max(2000)}).strict()}).strict();
export interface EpisodeGuard { owner:DramaEpisodeOwner; lockId:string; revision:number; episodeSha:string }
const equalOwner=(a:DramaEpisodeOwner|null,b:DramaEpisodeOwner)=>a?.agent===b.agent && a.session===b.session;
function pathOf(path:string):string {
  const file=resolve(path),s=lstatSync(file);
  if(!s.isFile() || s.isSymbolicLink() || s.nlink!==1)throw new EpisodeLockError('회차는 링크 없는 일반 파일이어야 함');
  return realpathSync(file);
}
function snapshot(path:string) {
  const before=inspectFile(path),episode=parseEpisode(readStrictJsonFile(path));
  if(before.sha256!==inspectFile(path).sha256)throw new EpisodeLockError('회차 읽기 중 변경');
  return {episode,sha:before.sha256};
}
function stateAt(path:string):DramaEpisodeLock|null {
  try {lstatSync(path+'.lock.json');} catch(e) {if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}
  const s=stateSchema.parse(readStrictJsonFile(path+'.lock.json'));
  if(s.episodePath!==path)throw new EpisodeLockError('잠금의 회차 경로 불일치');
  return s;
}
function targetMatches(state:DramaEpisodeLock,episode:DramaEpisode) {
  if(state.target.seriesId!==episode.seriesId || state.target.episodeNo!==episode.no || episode.shotPolicy?.version!=='shot-v1')
    throw new EpisodeLockError('잠금 대상/shot-v1 정책 변경 금지');
}
/** Same-directory temporary -> atomic rename/link; no cross-file transaction. */
export function atomicEpisodeJson(path:string,value:unknown,fresh=false):void {
  const data=JSON.stringify(value,null,2)+'\n';
  if(Buffer.byteLength(data)>1048576)throw new EpisodeLockError('JSON 출력 1MiB 초과');
  const temp=join(dirname(path),`.episode-${randomUUID()}.tmp`),fd=openSync(temp,'wx',0o600);
  try {writeFileSync(fd,data);fsyncSync(fd);} finally {closeSync(fd);}
  try {if(fresh)linkSync(temp,path);else renameSync(temp,path);} finally {
    try {unlinkSync(temp);} catch(e) {if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  }
}
/** No lease or automatic stale-lock takeover. A killed writer leaves a visible block. */
function withWriter<T>(file:string,fn:()=>T):T {
  const dir=file+'.writer';
  try {mkdirSync(dir,{mode:0o700});} catch(e) {
    if((e as NodeJS.ErrnoException).code==='EEXIST')throw new EpisodeLockError('회차 writer 사용 중 또는 중단됨 — 자동 회수하지 않음');throw e;
  }
  try {writeFileSync(join(dir,'holder.json'),JSON.stringify({pid:process.pid,at:new Date().toISOString()}),{flag:'wx',mode:0o600});return fn();}
  finally {try {unlinkSync(join(dir,'holder.json'));} finally {rmdirSync(dir);}}
}
export function episodeLockStatus(input:string) {
  const path=pathOf(input);
  return withWriter(path,()=>{const s=snapshot(path),state=stateAt(path);if(state)targetMatches(state,s.episode);
    return {authorized:false as const,episodeSha:s.sha,lock:state};});
}
export function acquireEpisodeLock(input:string,rawOwner:DramaEpisodeOwner,expectedRevision:number) {
  const owner=ownerSchema.parse(rawOwner),expected=revisionSchema.parse(expectedRevision),path=pathOf(input);
  return withWriter(path,()=>{
    const {episode,sha}=snapshot(path),old=stateAt(path);
    if(episode.shotPolicy?.version!=='shot-v1' || !episode.authoredBy)throw new EpisodeLockError('편집 잠금에는 shot-v1/authoredBy 필요');
    if(old)targetMatches(old,episode);
    if((old?.revision??0)!==expected)throw new EpisodeLockError('오래된 잠금 revision');
    if(old?.owner) {if(!equalOwner(old.owner,owner))throw new EpisodeLockError('다른 agent/session 소유');return {authorized:false,episodeSha:sha,lock:old};}
    const next:DramaEpisodeLock={schemaVersion:1,kind:'drama-episode-lock',lockId:old?.lockId??randomUUID(),episodePath:path,
      target:{seriesId:episode.seriesId,episodeNo:episode.no},revision:expected+1,owner,updatedAt:new Date().toISOString(),lastChange:{kind:'acquire',by:owner,note:'explicit acquire'}};
    atomicEpisodeJson(path+'.lock.json',next,!old);return {authorized:false,episodeSha:sha,lock:next};
  });
}
export function withEpisodeOwner<T>(input:string,rawGuard:EpisodeGuard,fn:(ctx:{episode:DramaEpisode;sha:string;state:DramaEpisodeLock;write:(next:DramaEpisode)=>void})=>T):T {
  const guard={owner:ownerSchema.parse(rawGuard.owner),lockId:z.string().uuid().parse(rawGuard.lockId),revision:revisionSchema.parse(rawGuard.revision),episodeSha:shaSchema.parse(rawGuard.episodeSha)},path=pathOf(input);
  return withWriter(path,()=>{
    const state=stateAt(path),initial=snapshot(path);
    if(!state?.owner || !equalOwner(state.owner,guard.owner))throw new EpisodeLockError('회차 잠금 소유 agent/session 불일치 또는 잠금 없음');
    if(state.lockId!==guard.lockId || state.revision!==guard.revision)throw new EpisodeLockError('오래된 잠금 revision');
    if(initial.sha!==guard.episodeSha)throw new EpisodeLockError('회차 SHA CAS 불일치 — status 후 다시 읽기');
    targetMatches(state,initial.episode);
    let active=true,written=false,expectedSha=initial.sha;
    const assertCurrent=()=>{
      if(!active)throw new EpisodeLockError('편집 트랜잭션 종료됨');
      if(inspectFile(path).sha256!==expectedSha)throw new EpisodeLockError('회차 편집 중 CAS 변경');
      const current=stateAt(path);
      if(!current || current.lockId!==state.lockId || current.revision!==state.revision || !equalOwner(current.owner,guard.owner))throw new EpisodeLockError('편집 중 잠금 변경');
    };
    try {
      const value=fn({episode:initial.episode,sha:initial.sha,state,write(next){
        assertCurrent();if(written)throw new EpisodeLockError('한 작업에서 대본 쓰기는 한 번만');
        const parsed=parseEpisode(next);targetMatches(state,parsed);
        atomicEpisodeJson(path,parsed);written=true;expectedSha=inspectFile(path).sha256;
      }});
      if(value && typeof (value as {then?:unknown}).then==='function')throw new EpisodeLockError('동기 편집 함수만 허용');
      assertCurrent();return value;
    } finally {active=false;}
  });
}
export function changeEpisodeOwner(input:string,guard:EpisodeGuard,to:DramaEpisodeOwner|null,note:string) {
  const nextOwner=to===null?null:ownerSchema.parse(to),reason=z.string().trim().min(1).max(2000).parse(note);
  // Keep ownership mutation under the same writer primitive; no nested acquire.
  const path=pathOf(input),owner=ownerSchema.parse(guard.owner),lockId=z.string().uuid().parse(guard.lockId),rev=revisionSchema.parse(guard.revision),sha=shaSchema.parse(guard.episodeSha);
  return withWriter(path,()=>{
    const old=stateAt(path),current=snapshot(path);
    if(!old?.owner || !equalOwner(old.owner,owner))throw new EpisodeLockError('인계/해제는 현재 agent/session만 가능');
    if(old.lockId!==lockId || old.revision!==rev || current.sha!==sha)throw new EpisodeLockError('인계/해제 revision 또는 SHA CAS 불일치');
    targetMatches(old,current.episode);
    const next:DramaEpisodeLock={...old,revision:rev+1,owner:nextOwner,updatedAt:new Date().toISOString(),lastChange:{kind:nextOwner?'handoff':'release',by:owner,note:reason}};
    atomicEpisodeJson(path+'.lock.json',next);return {authorized:false,episodeSha:sha,lock:next};
  });
}

/** Generic CLI outputs cannot overwrite a locked/shot-v1 episode or lock metadata. */
export function assertUnprotectedOutput(input:string):void {
  const raw=resolve(input),tail=[basename(raw)];
  let parent=dirname(raw);
  while(!existsSync(parent)){tail.unshift(basename(parent));parent=dirname(parent);}
  const path=join(realpathSync(parent),...tail);
  if(/\.lock\.json$|\.writer(?:[/\\]|$)/i.test(path) || existsSync(path+'.lock.json') || existsSync(path+'.writer'))
    throw new EpisodeLockError('보호된 회차/잠금 경로를 일반 출력으로 덮을 수 없음');
  let stat;try {stat=lstatSync(path);} catch(e) {if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}
  if(stat.isSymbolicLink() || stat.nlink>1 && stat.isFile())throw new EpisodeLockError('출력 링크 경로 금지');
  if(stat.isFile()) {
    let value:unknown;try {value=readStrictJsonFile(path);} catch {return;}
    if((value as {shotPolicy?:{version?:unknown}})?.shotPolicy?.version==='shot-v1')throw new EpisodeLockError('shot-v1 대본은 소유자 편집 경로로만 변경');
  }
}
