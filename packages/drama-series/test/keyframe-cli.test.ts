import { beforeAll, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { keyframeContext, keyframeApproval } from './keyframe-fixture.js';
import { prepareKeyframeEvidence, approveKeyframeEvidence, checkKeyframeApproval, writeKeyframeRequest } from '../src/adapters/keyframe-evidence.js';
import { contentSha } from '../src/core/release-source.js';

let root:string,png:string,other:string,portrait:string;
const json=(path:string,data:unknown)=>writeFileSync(path,JSON.stringify(data,null,2));
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
function cli(args:string[]) {return spawnSync(process.execPath,['--import','tsx','src/cli/index.ts',...args],{encoding:'utf8',timeout:20000});}
function asyncCli(args:string[]):Promise<number|null> {return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--import','tsx','src/cli/index.ts',...args],{stdio:'ignore'});
  child.on('error',reject);child.on('close',resolve);
});}
beforeAll(()=>{
  root=mkdtempSync(join(tmpdir(),'keyframe-cli-'));png=join(root,'image.png');other=join(root,'other.png');portrait=join(root,'portrait.png');
  for(const [path,size,color] of [[png,'160x90','red'],[other,'160x90','blue'],[portrait,'90x160','red']]){
    const p=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i',`color=c=${color}:s=${size}`,'-frames:v','1',path!],{encoding:'utf8',timeout:15000});
    expect(p.status,p.stderr).toBe(0);
  }
});
function env() {
  const dir=mkdtempSync(join(root,'case-')),ctx=keyframeContext();
  ctx.episode.cuts[0]!.lines=[{speaker:'seoyun',text:'안녕.',kind:'dialogue',verification:{status:'unverified'}}];ctx.episode.cuts[0]!.beats![0]!.lines=[0];
  const series=join(dir,'series.json'),episode=join(dir,'episode.json');json(series,ctx.series);json(episode,ctx.episode);
  const args=['--series',series,'--episode',episode,'--cut','c1'];
  return {dir,ctx,series,episode,args};
}
function approved() {
  const e=env(),source=join(e.dir,'source'),out=join(e.dir,'approved');
  const evidence=prepareKeyframeEvidence(e.ctx,'c1','test-job',png,source);
  approveKeyframeEvidence(e.ctx,'c1','test-job',source,keyframeApproval(evidence),out);
  return {...e,source,out,evidence};
}
it('real CLI builds, snapshots, records supplied approval and checks current files without changing episode',()=>{
  const e=env(),request=join(e.dir,'request.json'),source=join(e.dir,'source'),out=join(e.dir,'approved'),approval=join(e.dir,'human.json');
  const episodeBefore=readFileSync(e.episode);
  let r=cli(['keyframe-build',...e.args,'--aspect','16:9','--out',request]);expect(r.status,r.stderr).toBe(0);expect(read(request).authorized).toBe(false);
  r=cli(['keyframe-source',...e.args,'--asset','test-job','--file',png,'--out',source]);expect(r.status,r.stderr).toBe(0);
  const ev=read(join(source,'evidence.json'));expect(ev.image).toMatchObject({width:160,height:90});
  json(approval,keyframeApproval(ev));
  r=cli(['keyframe-approve',...e.args,'--asset','test-job','--source',source,'--approval',approval,'--out',out]);expect(r.status,r.stderr).toBe(0);
  expect(readdirSync(out).sort()).toEqual(['approval.json','binding.json','evidence.json','image.png','request.json']);
  r=cli(['keyframe-check',...e.args,'--asset','test-job','--source',out]);expect(r.status,r.stderr).toBe(0);expect(JSON.parse(r.stdout)).toMatchObject({ok:true,authorized:false});
  expect(readFileSync(e.episode)).toEqual(episodeBefore);expect(readFileSync(join(out,'image.png'))).toEqual(readFileSync(png));expect(existsSync(join(source,'binding.json'))).toBe(false);
  e.ctx.episode.cuts[0]!.lines[0]!.text='반가워요.';json(e.episode,e.ctx.episode);
  r=cli(['keyframe-check',...e.args,'--asset','test-job','--source',out]);expect(r.status,r.stderr).toBe(0);
  e.ctx.episode.cuts[0]!.visualEn+=' Rain.';json(e.episode,e.ctx.episode);
  r=cli(['keyframe-check',...e.args,'--asset','test-job','--source',out]);expect(r.status).toBe(1);
},30000);
it('rejects changed or missing actual PNG even if a remote asset ID is unchanged',()=>{
  const e=approved(),file=join(e.out,'image.png');chmodSync(file,0o600);writeFileSync(file,readFileSync(other));
  expect(()=>checkKeyframeApproval(e.ctx,'c1','test-job',e.out)).toThrow(/불일치/);
  unlinkSync(file);expect(()=>checkKeyframeApproval(e.ctx,'c1','test-job',e.out)).toThrow();
});
it('does not allow a substituted PNG with recomputed evidence to reuse old approval',()=>{
  const e=approved(),file=join(e.out,'image.png'),manifest=join(e.out,'evidence.json');
  const fresh=prepareKeyframeEvidence(e.ctx,'c1','test-job',other,join(e.dir,'substitute'));
  chmodSync(file,0o600);writeFileSync(file,readFileSync(other));chmodSync(manifest,0o600);json(manifest,fresh);
  expect(()=>checkKeyframeApproval(e.ctx,'c1','test-job',e.out)).toThrow(/승인 대상/);
});
it.each(['request.json','approval.json','binding.json'])('rejects modified %s',name=>{
  const e=approved(),file=join(e.out,name),data=read(file);chmodSync(file,0o600);
  if(name==='request.json')data.prompt+=' extra instruction';else if(name==='approval.json')data.userQuote+=' changed';else data.authorized=true;
  json(file,data);expect(()=>checkKeyframeApproval(e.ctx,'c1','test-job',e.out)).toThrow(/불일치|변경/);
});
it('rejects unapproved evidence, wrong cut, wrong asset and symlink bundle',()=>{
  const e=approved();expect(()=>checkKeyframeApproval(e.ctx,'c1','test-job',e.source)).toThrow();
  expect(()=>checkKeyframeApproval(e.ctx,'c1','other-job',e.out)).toThrow(/자산/);
  expect(()=>checkKeyframeApproval(e.ctx,'no-cut','test-job',e.out)).toThrow(/컷 없음/);
  const link=join(e.dir,'link');symlinkSync(e.out,link);expect(()=>checkKeyframeApproval(e.ctx,'c1','test-job',link)).toThrow(/심볼릭/);
});
it('rejects invalid, portrait, multiple-frame PNGs, symlink and directory inputs; no completion marker',()=>{
  const e=env(),invalid=join(e.dir,'invalid.png'),multi=join(e.dir,'multi.png'),link=join(e.dir,'link.png');
  writeFileSync(invalid,'not PNG');writeFileSync(multi,Buffer.concat([readFileSync(png),readFileSync(other)]));symlinkSync(png,link);
  for(const [i,input] of [invalid,portrait,multi,link,e.dir].entries()){
    const out=join(e.dir,`bad-${i}`);expect(()=>prepareKeyframeEvidence(e.ctx,'c1','test-job',input,out)).toThrow();expect(existsSync(join(out,'evidence.json'))).toBe(false);
  }
});
it('refuses FIFO image without blocking and rejects duplicate approval keys before output',()=>{
  const e=approved(),fifo=join(e.dir,'fifo.png');expect(spawnSync('mkfifo',[fifo]).status).toBe(0);
  const r=cli(['keyframe-source',...e.args,'--asset','test-job','--file',fifo,'--out',join(e.dir,'fifo-out')]);expect(r.error).toBeUndefined();expect(r.status).toBe(1);
  const a=join(e.dir,'duplicate.json'),approval=keyframeApproval(e.evidence);writeFileSync(a,JSON.stringify(approval).replace('{','{"decision":"approve-keyframe",'));
  const out=join(e.dir,'bad-approval'),res=cli(['keyframe-approve',...e.args,'--asset','test-job','--source',e.source,'--approval',a,'--out',out]);
  expect(res.status).toBe(1);expect(existsSync(out)).toBe(false);
});
it('concurrent output creation has one winner and cannot overwrite prior evidence',async()=>{
  const e=env(),out=join(e.dir,'request.json'),args=['keyframe-build',...e.args,'--out',out];
  expect((await Promise.all([asyncCli(args),asyncCli(args)])).sort()).toEqual([0,1]);
  const before=readFileSync(out);expect(cli(args).status).toBe(1);expect(readFileSync(out)).toEqual(before);
  const source=join(e.dir,'source');const data=prepareKeyframeEvidence(e.ctx,'c1','test-job',png,source);
  expect(()=>prepareKeyframeEvidence(e.ctx,'c1','test-job',other,source)).toThrow();expect(contentSha(read(join(source,'evidence.json')))).toBe(contentSha(data));
},20000);

it('rejects escaped request expansion beyond reader limit before creating output',()=>{
  const e=env();e.ctx.series.styleEn='"'.repeat(400000);
  expect(Buffer.byteLength(JSON.stringify(e.ctx.series))).toBeLessThan(1048576);
  const request=join(e.dir,'too-large.json'),source=join(e.dir,'too-large-source');
  expect(()=>writeKeyframeRequest(e.ctx,'c1','16:9',request)).toThrow(/1MiB/);
  expect(existsSync(request)).toBe(false);
  expect(()=>prepareKeyframeEvidence(e.ctx,'c1','test-job',png,source)).toThrow(/1MiB/);
  expect(existsSync(source)).toBe(false);
});
