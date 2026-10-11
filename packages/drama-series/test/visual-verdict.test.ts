import { beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DramaVisualRequest } from '@cak/contracts';
import { parseEpisode, parseSeries } from '../src/core/model.js';
import { loadGenre } from '../src/core/genre.js';
import { contentSha } from '../src/core/release-source.js';
import { evaluateVisualResponse, makeVisualRequest, sampleOrdinals } from '../src/core/visual-verdict.js';
import { prepareVisualVerdict, applyVisualVerdict } from '../src/adapters/visual-verdict.js';
import { parseStrictJson } from '../src/core/strict-json.js';
import { inspectFile, readStrictJsonFile } from '../src/adapters/media-evidence.js';

const pkg=fileURLToPath(new URL('..',import.meta.url));
const fixture=(n:string)=>JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`,import.meta.url),'utf8'));
function context(){ const series=parseSeries(fixture('series'));return {series,episode:parseEpisode(fixture('episode')),genre:loadGenre(series.genreId)}; }
const descriptor={sha256:'sha256:'+'a'.repeat(64),bytes:100};
const evidence={clip:descriptor,frameCount:4,frames:[0,1,3].map(n=>({...descriptor,id:`f${n}`,ordinal:n,file:`frame-${n}.png`,pixelSha256:descriptor.sha256}))};
const request=()=>makeVisualRequest(context(),'c4','job-1','request-1',evidence);
const response=(r:DramaVisualRequest)=>({schemaVersion:1,requestId:r.requestId,requestDigest:r.requestDigest,reviewer:'independent-test-session',reviewedAt:'2026-10-11T00:00:00Z',answers:r.questions.map(q=>({questionId:q.id,verdict:'pass',reason:'합성 테스트 응답',frameIds:[q.frameIds[0]!]}))});

describe('sampled visual protocol',()=>{
  it('uses unique first/middle/last ordinals, including one/two frames',()=>{
    expect(sampleOrdinals(1)).toEqual([0]);expect(sampleOrdinals(2)).toEqual([0,1]);expect(sampleOrdinals(4)).toEqual([0,1,3]);
    expect(()=>sampleOrdinals(0)).toThrow();
  });
  it('generates every cast/look question and a last-frame background question; never authorizes',()=>{
    const r=request(),c=context().episode.cuts[3]!;
    expect(r.questions.length).toBe(c.cast.length+2);expect(r.questions.at(-1)?.frameIds).toEqual(['f3']);
    const result=evaluateVisualResponse(r,r,response(r));
    expect(result.verdict).toBe('pass');expect(result.authorized).toBe(false);expect(result.blockers.length).toBeGreaterThan(0);
  });
  it.each(['missing','duplicate','extra','wrong-frame','empty-frame','duplicate-frame','bad-reviewer','bad-date','bad-verdict','bad-reason','old-request'])('rejects %s responses',kind=>{
    const r=request(),a=response(r);
    if(kind==='missing')a.answers.pop();
    if(kind==='duplicate')a.answers[1]=a.answers[0]!;
    if(kind==='extra')a.answers.push({...a.answers[0]!,questionId:'invented'});
    if(kind==='wrong-frame')a.answers.at(-1)!.frameIds=['f0'];
    if(kind==='empty-frame')a.answers[0]!.frameIds=[];
    if(kind==='duplicate-frame')a.answers[0]!.frameIds=['f0','f0'];
    if(kind==='bad-reviewer')a.reviewer=' ';
    if(kind==='bad-date')a.reviewedAt='yesterday';
    if(kind==='bad-verdict')a.answers[0]!.verdict='yes';
    if(kind==='bad-reason')a.answers[0]!.reason='';
    if(kind==='old-request')a.requestDigest='sha256:'+'b'.repeat(64);
    expect(()=>evaluateVisualResponse(r,r,a)).toThrow();
  });
  it('keeps unknown separate from pass, including evidence-free unknown; fail dominates',()=>{
    const r=request(),a=response(r);a.answers[0]!.verdict='unknown';a.answers[0]!.frameIds=[];
    expect(evaluateVisualResponse(r,r,a).verdict).toBe('unknown');
    a.answers[1]!.verdict='fail';expect(evaluateVisualResponse(r,r,a).verdict).toBe('fail');
  });
  it('recomputes questions instead of accepting an edited request and matching response digest',()=>{
    const r=request(),altered=structuredClone(r);altered.questions=[];const {requestDigest:_,...body}=altered;altered.requestDigest=contentSha(body);
    expect(()=>evaluateVisualResponse(r,altered,response(altered))).toThrow(/현재 문맥/);
  });
  it.each(['job','script','look','genre','pixels'])('binds %s into the request digest',kind=>{
    const r=request(),ctx=context(),ev=structuredClone(evidence);
    if(kind==='script')ctx.episode.cuts[3]!.action+=' changed';
    if(kind==='look')ctx.series.characters[0]!.looks[0]!.description+=' changed';
    if(kind==='genre')(ctx.genre as unknown as Record<string,unknown>).revision='changed';
    if(kind==='pixels')ev.frames[0]!.pixelSha256='sha256:'+'b'.repeat(64);
    const current=makeVisualRequest(ctx,'c4',kind==='job'?'job-2':'job-1','request-1',ev);
    expect(current.requestDigest).not.toBe(r.requestDigest);expect(()=>evaluateVisualResponse(current,r,response(r))).toThrow();
  });
  it('binds previous episode content even with equal cut IDs; approvals alone do not change content',()=>{
    const ctx=context(),prev=structuredClone(ctx.episode);ctx.episode={...ctx.episode,no:2,continuesFromEpisode:{no:1,cutId:'c4'},cuts:[ctx.episode.cuts[3]!]};
    const linked={...ctx,prev:{episode:prev}};
    const a=makeVisualRequest(linked,'c4','job-1','r1',evidence);
    prev.cuts[3]!.lines[0]!.verification={status:'human-approved'};
    expect(makeVisualRequest(linked,'c4','job-1','r1',evidence).requestDigest).toBe(a.requestDigest);
    prev.cuts[3]!.action+=' changed';expect(makeVisualRequest(linked,'c4','job-1','r1',evidence).requestDigest).not.toBe(a.requestDigest);
  });
});

let root:string,clip:string;
function ffmpeg(args:string[]){const r=spawnSync('ffmpeg',['-v','error','-nostdin','-n',...args],{encoding:'utf8',timeout:30_000});if(r.status!==0)throw new Error(r.stderr);}
function caseDir(){return mkdtempSync(join(root,'case-'));}
function cli(args:string[]){const r=spawnSync(process.execPath,['--import','tsx','src/cli/index.ts',...args],{cwd:pkg,encoding:'utf8',timeout:30_000});return {code:r.status,json:JSON.parse(r.stdout)};}
beforeAll(()=>{
  root=mkdtempSync(join(tmpdir(),'visual-verdict-'));clip=join(root,'input.mp4');
  ffmpeg(['-f','lavfi','-i','testsrc2=s=96x64:r=4:d=1','-c:v','libx264',clip]);
});
describe('actual clip and PNG evidence',{timeout:60_000},()=>{
  it('builds and applies through CLI, records unknown as nonzero, preserves existing report',()=>{
    const dir=caseDir(),ctx=context();for(const [key,value] of Object.entries({series:ctx.series,episode:ctx.episode}))writeFileSync(join(dir,key+'.json'),JSON.stringify(value));
    const args=['--series',join(dir,'series.json'),'--episode',join(dir,'episode.json'),'--cut','c4','--job','job-1'];
    const build=cli(['visual-verdict-build',...args,'--clip',clip,'--out',join(dir,'bundle')]);
    expect(build.code).toBe(0);expect(build.json.authorized).toBe(false);
    const r=build.json.request as DramaVisualRequest,a=response(r),reply=join(dir,'response.json'),out=join(dir,'report.json');writeFileSync(reply,JSON.stringify(a));
    const apply=['visual-verdict-apply',...args,'--source',join(dir,'bundle'),'--response',reply];
    const result=cli([...apply,'--out',out]);expect(result.code).toBe(0);expect(result.json.report.verdict).toBe('pass');expect(result.json.report.authorized).toBe(false);
    const saved=readFileSync(out);expect(cli([...apply,'--out',out]).code).toBe(1);expect(readFileSync(out)).toEqual(saved);
    a.answers[0]!.verdict='unknown';a.answers[0]!.frameIds=[];writeFileSync(reply,JSON.stringify(a));expect(cli(apply).code).toBe(1);
    expect(cli(['visual-verdict-build',...args,'--clip',clip,'--out',join(dir,'bundle')]).code).toBe(1);
  });
  it('direct adapter rejects changed job/context and altered request with current response IDs',()=>{
    const dir=join(caseDir(),'bundle'),ctx=context(),r=prepareVisualVerdict(ctx,'c4','job-1',clip,dir);
    expect(()=>applyVisualVerdict(ctx,'c4','job-2',dir,response(r))).toThrow();
    ctx.episode.cuts[0]!.action+=' changed';expect(()=>applyVisualVerdict(ctx,'c4','job-1',dir,response(r))).toThrow();
    const altered={...r,questions:r.questions.slice(1)},p=join(dir,'request.json');chmodSync(p,0o600);writeFileSync(p,JSON.stringify(altered));
    expect(()=>applyVisualVerdict(context(),'c4','job-1',dir,response(altered))).toThrow();
  });
  it('rejects same-size byte edits, symlinks and incomplete bundles',()=>{
    const base=caseDir(),dir=join(base,'bundle'),ctx=context(),r=prepareVisualVerdict(ctx,'c4','job-1',clip,dir);
    const p=join(dir,'clip.mp4'),bytes=readFileSync(p);bytes[bytes.length-1]^=1;chmodSync(p,0o600);writeFileSync(p,bytes);
    expect(()=>applyVisualVerdict(ctx,'c4','job-1',dir,response(r))).toThrow(/클립 바이트/);
    symlinkSync(clip,join(base,'link.mp4'));expect(()=>prepareVisualVerdict(ctx,'c4','job-1',join(base,'link.mp4'),join(base,'linked'))).toThrow();
    expect(existsSync(join(base,'linked','request.json'))).toBe(false);
    symlinkSync(dir,join(base,'dirlink'));expect(()=>applyVisualVerdict(ctx,'c4','job-1',join(base,'dirlink'),response(r))).toThrow(/디렉터리/);
  });
  it('rejects an incorrect ordinal PNG even when its descriptor and request digest are rewritten',()=>{
    const dir=join(caseDir(),'bundle'),ctx=context(),r=prepareVisualVerdict(ctx,'c4','job-1',clip,dir),f=r.evidence.frames.at(-1)!;
    const target=join(dir,f.file);chmodSync(target,0o600);copyFileSync(join(dir,r.evidence.frames[0]!.file),target);
    Object.assign(f,inspectFile(target),{pixelSha256:r.evidence.frames[0]!.pixelSha256});
    const updated=makeVisualRequest(ctx,'c4','job-1',r.requestId,r.evidence),p=join(dir,'request.json');chmodSync(p,0o600);writeFileSync(p,JSON.stringify(updated));
    expect(()=>applyVisualVerdict(ctx,'c4','job-1',dir,response(updated))).toThrow(/ordinal/);
  });
  it.each([1,2])('prepares and rechecks %i-frame clips without duplicate evidence',n=>{
    const base=caseDir(),input=join(base,'short.mp4');ffmpeg(['-i',clip,'-frames:v',String(n),'-c:v','libx264',input]);
    const ctx=context(),r=prepareVisualVerdict(ctx,'c1','job-short',input,join(base,'bundle'));
    expect(r.evidence.frames.length).toBe(n);expect(applyVisualVerdict(ctx,'c1','job-short',join(base,'bundle'),response(r)).verdict).toBe('pass');
  });
  it('retains exact VFR ordinals after actual display rotation',()=>{
    const base=caseDir(),vfr=join(base,'vfr.mp4'),rotated=join(base,'rotated.mp4');
    ffmpeg(['-i',clip,'-vf','setpts=N*N/(4*TB)','-fps_mode','passthrough','-c:v','libx264',vfr]);
    ffmpeg(['-display_rotation:v:0','90','-i',vfr,'-c','copy',rotated]);
    const ctx=context(),r=prepareVisualVerdict(ctx,'c1','rotated-job',rotated,join(base,'bundle'));
    expect(r.evidence.frameCount).toBe(4);expect(r.evidence.frames.map(f=>f.ordinal)).toEqual([0,1,3]);
    expect(applyVisualVerdict(ctx,'c1','rotated-job',join(base,'bundle'),response(r)).verdict).toBe('pass');
    const dimensions=spawnSync('ffprobe',['-v','error','-show_entries','stream=width,height','-of','json',join(base,'bundle',r.evidence.frames[0]!.file)],{encoding:'utf8'});
    expect(JSON.parse(dimensions.stdout).streams[0]).toMatchObject({width:64,height:96});
  });
});


describe('strict JSON and nonblocking input',()=>{
  it.each(['{"verdict":"fail","verdict":"pass"}', '{"a":{"x":1,"\\u0078":2}}', '[{"a":1,"a":2}]', '1e999', '['.repeat(102)+'0'+']'.repeat(102)])('rejects ambiguous/nonfinite/deep JSON %s',raw=>{
    expect(()=>parseStrictJson(raw)).toThrow();
  });
  it('preserves valid nested data, escaped strings and keys in separate objects',()=>{
    const value={quoted:'a"b\\c',list:[{x:1},{x:2}],empty:{},bool:true,nil:null,number:-2.5e10};
    expect(parseStrictJson(JSON.stringify(value))).toEqual(value);
  });
  it('rejects duplicate verdict keys through CLI and duplicate request keys through direct adapter',()=>{
    const base=caseDir(),ctx=context(),dir=join(base,'bundle'),r=prepareVisualVerdict(ctx,'c4','job-1',clip,dir);
    writeFileSync(join(base,'series.json'),JSON.stringify(ctx.series));writeFileSync(join(base,'episode.json'),JSON.stringify(ctx.episode));
    writeFileSync(join(base,'reply.json'),JSON.stringify(response(r)).replace('"verdict":"pass"','"verdict":"fail","verdict":"pass"'));
    const result=cli(['visual-verdict-apply','--series',join(base,'series.json'),'--episode',join(base,'episode.json'),'--cut','c4','--job','job-1','--source',dir,'--response',join(base,'reply.json')]);
    expect(result.code).toBe(1);expect(result.json.error).toContain('중복 키');
    const requestPath=join(dir,'request.json');chmodSync(requestPath,0o600);
    writeFileSync(requestPath,JSON.stringify(r).replace('"jobId":"job-1"','"jobId":"other","jobId":"job-1"'));
    expect(()=>applyVisualVerdict(ctx,'c4','job-1',dir,response(r))).toThrow(/중복 키/);
  });
  it('rejects FIFO media and JSON paths promptly rather than waiting for a writer',()=>{
    const base=caseDir(),fifo=join(base,'fifo');expect(spawnSync('mkfifo',[fifo]).status).toBe(0);
    // Child timeout keeps this regression safe even against the old blocking code.
    const script=`import {inspectFile,readStrictJsonFile} from './src/adapters/media-evidence.ts';for(const f of [inspectFile,readStrictJsonFile]){try{f(process.argv[1]);process.exit(2)}catch{}}`;
    const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',script,fifo],{cwd:pkg,encoding:'utf8',timeout:3000});
    expect(result.signal).toBe(null);expect(result.status).toBe(0);
  });
  it('enforces JSON byte bounds, UTF-8 and regular file requirements before parsing',()=>{
    const base=caseDir();writeFileSync(join(base,'huge'),Buffer.alloc(1_048_577,32));
    expect(()=>readStrictJsonFile(join(base,'huge'))).toThrow(/1MiB/);
    writeFileSync(join(base,'bad'),Buffer.from([0xff]));expect(()=>readStrictJsonFile(join(base,'bad'))).toThrow();
    expect(()=>readStrictJsonFile(base)).toThrow(/일반 파일/);
  });
});
