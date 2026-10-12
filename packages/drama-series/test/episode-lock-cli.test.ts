import { expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { keyframeContext } from './keyframe-fixture.js';
const json=(path:string,data:unknown)=>writeFileSync(path,JSON.stringify(data));
function cli(args:string[]) {const r=spawnSync(process.execPath,['--import','tsx','src/cli/index.ts',...args],{encoding:'utf8',timeout:15000});
  if(r.error || r.signal || !r.stdout.trim())throw new Error(String(r.error??r.signal??r.stderr));return {status:r.status,json:JSON.parse(r.stdout)};}
function asyncCli(args:string[]):Promise<number|null> {return new Promise((resolve,reject)=>{const p=spawn(process.execPath,['--import','tsx','src/cli/index.ts',...args],{stdio:'ignore'});p.on('error',reject);p.on('close',resolve);});}
function env(lock=true) {
  const dir=mkdtempSync(join(tmpdir(),'ep-lock-cli-')),ctx=keyframeContext(),file=join(dir,'episode.json'),series=join(dir,'series.json');
  ctx.episode.cuts[0]!.lines=[{speaker:'seoyun',text:'안녕',kind:'dialogue',verification:{status:'unverified'}}];ctx.episode.cuts[0]!.beats![0]!.lines=[0];
  json(file,ctx.episode);json(series,ctx.series);
  const base=['--episode',file,'--series',series],acquire=['episode-lock','--episode',file,'--agent','codex','--session','A'];
  const state=lock?cli(acquire).json:null;
  const guard=state?['--agent','codex','--session','A','--lock-id',state.lock.lockId,'--lock-revision','1','--episode-sha',state.episodeSha]:[];
  return {dir,ctx,file,series,base,acquire,state,guard};
}
function judge(e:ReturnType<typeof env>) {
  const request=join(e.dir,'request.json'),response=join(e.dir,'response.json');
  expect(cli(['judge-build','--kind','dialogue',...e.base,'--out',request]).status).toBe(0);
  const q=JSON.parse(readFileSync(request,'utf8')).questions;
  json(response,{answers:Object.fromEntries(Object.keys(q).map(id=>[id,{type:'choice',choice:'pass',confidence:0.99,probabilities:{pass:0.99,fail:0.01}}]))});
  return ['judge-apply','--kind','dialogue',...e.base,'--request',request,'--response',response,'--gates',join(e.dir,'gates')];
}
it('CLI ownership, line approval and edit enforce current hash and handoff epoch',()=>{
  const e=env(),approve=['approve-line',...e.base,'--cut','c1','--line','0','--by','synthetic-user','--note','test only'];
  const before=readFileSync(e.file);expect(cli(approve).status).not.toBe(0);expect(readFileSync(e.file)).toEqual(before);
  expect(cli([...approve,...e.guard]).status).toBe(0);expect(cli([...approve,...e.guard]).status).toBe(1);
  const state=cli(['episode-lock-status','--episode',e.file]).json,guard=e.guard.slice();guard[guard.length-1]=state.episodeSha;
  expect(cli(['episode-handoff','--episode',e.file,...guard,'--to-agent','codex','--to-session','B','--note','인계']).status).toBe(0);
  const input=join(e.dir,'edited.json');json(input,{...e.ctx.episode,title:'새 제목'});
  expect(cli(['episode-edit','--episode',e.file,'--input',input,...guard]).status).toBe(1);
  guard[3]='B';guard[7]='2';expect(cli(['episode-edit','--episode',e.file,'--input',input,...guard]).status).toBe(0);
  expect(JSON.parse(readFileSync(e.file,'utf8')).title).toBe('새 제목');
},20000);
it('judge-apply requires ownership; successful report cannot remain after failed CAS',()=>{
  const e=env(),args=judge(e),before=readFileSync(e.file);
  expect(cli(args).status).not.toBe(0);expect(existsSync(join(e.dir,'gates'))).toBe(false);expect(readFileSync(e.file)).toEqual(before);
  const stale=e.guard.slice();stale[stale.length-1]='sha256:'+'0'.repeat(64);
  expect(cli([...args,...stale]).status).toBe(1);expect(existsSync(join(e.dir,'gates'))).toBe(false);
  expect(cli([...args,...e.guard,'--episode-out',join(e.dir,'copy.json')]).status).not.toBe(0);
  expect(cli([...args,...e.guard]).status).toBe(0);expect(JSON.parse(readFileSync(e.file,'utf8')).cuts[0].lines[0].verification.status).toBe('verified');
},20000);
it('general --out and symlink paths cannot overwrite a locked episode or ownership sidecar',()=>{
  const e=env(),before=readFileSync(e.file),lock=readFileSync(e.file+'.lock.json'),alias=join(e.dir,'alias.json');symlinkSync(e.file,alias);
  for(const output of [e.file,alias,e.file+'.lock.json',e.file+'.LOCK.JSON'])expect(cli(['judge-build','--kind','dialogue',...e.base,'--out',output]).status).not.toBe(0);
  expect(cli(['plan',...e.base,'--gates',join(e.dir,'gates'),'--budget','100','--out',e.file]).status).not.toBe(0);
  expect(readFileSync(e.file)).toEqual(before);expect(readFileSync(e.file+'.lock.json')).toEqual(lock);
});
it('two concurrent acquisitions have one owner; two edits with one SHA have one winner',async()=>{
  const e=env(false),b=e.acquire.slice();b[b.length-1]='B';expect((await Promise.all([asyncCli(e.acquire),asyncCli(b)])).sort()).toEqual([0,1]);
  const state=cli(['episode-lock-status','--episode',e.file]).json;
  const guard=['--agent',state.lock.owner.agent,'--session',state.lock.owner.session,'--lock-id',state.lock.lockId,'--lock-revision','1','--episode-sha',state.episodeSha];
  const a=join(e.dir,'a.json'),c=join(e.dir,'b.json');json(a,{...e.ctx.episode,title:'A'});json(c,{...e.ctx.episode,title:'B'});
  expect((await Promise.all([asyncCli(['episode-edit','--episode',e.file,'--input',a,...guard]),asyncCli(['episode-edit','--episode',e.file,'--input',c,...guard])])).sort()).toEqual([0,1]);
  expect(['A','B']).toContain(JSON.parse(readFileSync(e.file,'utf8')).title);
},20000);
it.each(['before','after'])('SIGKILL %s atomic edit retains valid JSON and blocks takeover',async position=>{
  const e=env(),guard={owner:{agent:'codex',session:'A'},lockId:e.state.lock.lockId,revision:1,episodeSha:e.state.episodeSha};
  const source=`import {withEpisodeOwner} from './src/adapters/episode-lock.ts';withEpisodeOwner(process.argv[1],JSON.parse(process.argv[2]),tx=>{if(process.argv[3]==='after'){tx.episode.title='committed';tx.write(tx.episode);}process.stdout.write('held');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,60000);});`;
  const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',source,e.file,JSON.stringify(guard),position],{stdio:['ignore','pipe','pipe']});
  const timer=setTimeout(()=>child.kill('SIGKILL'),10000);
  try {await once(child.stdout!,'data');const exited=once(child,'exit');child.kill('SIGKILL');await exited;} finally {clearTimeout(timer);child.kill('SIGKILL');}
  expect(JSON.parse(readFileSync(e.file,'utf8')).title).toBe(position==='after'?'committed':e.ctx.episode.title);
  expect(existsSync(e.file+'.writer')).toBe(true);expect(cli(['episode-lock-status','--episode',e.file]).status).toBe(1);
},15000);
