import { beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEpisode, parseSeries } from '../src/core/model.js';
import { prepareReleaseSource, verifyReleaseSource } from '../src/adapters/release-source.js';
import { contentSha } from '../src/core/release-source.js';

const pkg=fileURLToPath(new URL('..',import.meta.url));
const series=parseSeries(JSON.parse(readFileSync(new URL('./fixtures/series.json',import.meta.url),'utf8')));
const prev=parseEpisode(JSON.parse(readFileSync(new URL('./fixtures/episode.json',import.meta.url),'utf8')));
let root:string, clip:string, firstFrame:string;
const sha=(path:string)=>'sha256:'+createHash('sha256').update(readFileSync(path)).digest('hex');
function ffmpeg(args:string[]) {
  const r=spawnSync('ffmpeg',['-v','error','-nostdin','-n',...args],{encoding:'utf8',timeout:30_000});
  if(r.error||r.status!==0) throw new Error(String(r.error??r.stderr));
}
function cli(args:string[]) {
  const r=spawnSync(process.execPath,['--import','tsx','src/cli/index.ts',...args],{cwd:pkg,encoding:'utf8',timeout:30_000});
  if(r.error||r.signal||!r.stdout.trim())throw new Error(String(r.error??r.signal??r.stderr));
  return {code:r.status,json:JSON.parse(r.stdout)};
}
function workspace() {
  const dir=mkdtempSync(join(root,'case-')),p=(name:string)=>join(dir,name);
  writeFileSync(p('series.json'),JSON.stringify(series));writeFileSync(p('prev.json'),JSON.stringify(prev));
  const episode={...structuredClone(prev),no:2,continuesFromEpisode:{no:1,cutId:'c4'},cuts:[{...structuredClone(prev.cuts[3]),transitionIn:'cut'}]};
  writeFileSync(p('ep.json'),JSON.stringify(episode));
  return {p,base:['--series',p('series.json'),'--episode',p('ep.json'),'--prev-episode',p('prev.json')]};
}
beforeAll(()=>{
  root=mkdtempSync(join(tmpdir(),'release-source-'));clip=join(root,'input.mp4');firstFrame=join(root,'first.png');
  // Four visibly distinct frames; the final frame is not an approximation from -sseof.
  ffmpeg(['-f','lavfi','-i','testsrc2=s=160x90:r=4:d=1','-c:v','libx264','-pix_fmt','yuv420p',clip]);
  ffmpeg(['-i',clip,'-frames:v','1','-vf','format=rgb24','-threads','1',firstFrame]);
},30_000);

describe('immutable previous-episode media evidence', {timeout:60_000},()=>{
  it('prepares a copy and actual final frame; checks approval and persisted binding through CLI',()=>{
    const w=workspace();
    const made=cli(['release-source','--series',w.p('series.json'),'--episode',w.p('prev.json'),'--cut','c4','--clip',clip,'--out',w.p('bundle')]);
    expect(made.code).toBe(0);expect(made.json.authorized).toBe(false);
    const source=made.json.source;
    expect(source.clip.sha256).toBe(sha(clip));expect(source.frame.frameCount).toBe(4);
    expect(sha(w.p('bundle/last-frame.png'))).not.toBe(sha(firstFrame));
    const last= w.p('expected-last.png');
    ffmpeg(['-i',clip,'-vf','select=eq(n\\,3),format=rgb24','-fps_mode','passthrough','-frames:v','1','-threads','1',last]);
    expect(sha(last)).toBe(source.frame.sha256);
    const approval={schemaVersion:1,decision:'approve-continuation-source',subjectDigest:source.subjectDigest,approvedBy:'synthetic-user',userQuote:'시험용 마지막 프레임 확인',recordedBy:'test-session',at:'2026-10-11T00:00:00Z'};
    writeFileSync(w.p('approval.json'),JSON.stringify(approval));
    const args=['continuation-check',...w.base,'--source',w.p('bundle'),'--approval',w.p('approval.json')];
    const checked=cli([...args,'--out',w.p('binding.json')]);
    expect(checked.code).toBe(0);expect(checked.json.authorized).toBe(false);expect(checked.json.blockers).not.toEqual([]);
    expect(cli([...args,'--binding',w.p('binding.json')]).code).toBe(0);
    expect(cli([...args,'--out',w.p('binding.json')]).code).toBe(1);
    const e=JSON.parse(readFileSync(w.p('ep.json'),'utf8'));e.cuts[0].action='다음 회차 행동 변경';writeFileSync(w.p('ep.json'),JSON.stringify(e));
    const stale=cli([...args,'--binding',w.p('binding.json')]);expect(stale.code).toBe(1);expect(stale.json.problem).toContain('현재 문맥');
    const blocked=cli(['plan',...w.base,'--gates',w.p('none'),'--budget','200','--draft','--out',w.p('plan.json')]);
    expect(blocked.code).toBe(1);expect(JSON.stringify(blocked.json)).toContain('회차 연결 생성 차단');
  });
  it('rejects changed clip bytes even when size is identical',()=>{
    const w=workspace();prepareReleaseSource(series,prev,'c4',clip,w.p('bundle'));
    const target=w.p('bundle/clip.mp4'), data=readFileSync(target);data[data.length-1]^=1;chmodSync(target,0o600);writeFileSync(target,data);
    expect(()=>verifyReleaseSource(w.p('bundle'))).toThrow(/실제 바이트/);
  });
  it('rejects a forged first-frame PNG even after its file hash and manifest digest are updated',()=>{
    const w=workspace(),source=prepareReleaseSource(series,prev,'c4',clip,w.p('bundle'));
    const target=w.p('bundle/last-frame.png');chmodSync(target,0o600);copyFileSync(firstFrame,target);
    source.frame.sha256=sha(target);source.frame.bytes=readFileSync(target).length;
    const {subjectDigest:_,...body}=source;source.subjectDigest=contentSha(body);
    chmodSync(w.p('bundle/source.json'),0o600);writeFileSync(w.p('bundle/source.json'),JSON.stringify(source));
    expect(()=>verifyReleaseSource(w.p('bundle'))).toThrow(/실제 마지막 프레임/);
  });
  it('never overwrites an existing output, and incomplete output has no usable manifest',()=>{
    const w=workspace();mkdirSync(w.p('existing'));writeFileSync(w.p('existing/keep'),'preserve');
    expect(()=>prepareReleaseSource(series,prev,'c4',clip,w.p('existing'))).toThrow();expect(readFileSync(w.p('existing/keep'),'utf8')).toBe('preserve');
    writeFileSync(w.p('bad.mp4'),'invalid media');
    expect(()=>prepareReleaseSource(series,prev,'c4',w.p('bad.mp4'),w.p('incomplete'))).toThrow();
    expect(existsSync(w.p('incomplete/source.json'))).toBe(false);
    expect(()=>verifyReleaseSource(w.p('incomplete'))).toThrow();
  });
  it('rejects symlink inputs and snapshot file substitutions',()=>{
    const w=workspace();symlinkSync(clip,w.p('link.mp4'));
    expect(()=>prepareReleaseSource(series,prev,'c4',w.p('link.mp4'),w.p('linked'))).toThrow();
    prepareReleaseSource(series,prev,'c4',clip,w.p('bundle'));
    symlinkSync(w.p('bundle'),w.p('bundle-link'));
    expect(()=>verifyReleaseSource(w.p('bundle-link'))).toThrow(/디렉터리/);
  });
  it('uses video stream zero with non-zero timestamps and preserves the last decoded frame',()=>{
    const w=workspace();
    ffmpeg(['-f','lavfi','-i','testsrc2=s=160x90:r=4:d=1','-f','lavfi','-i','color=c=red:s=160x90:r=4:d=1','-map','0:v','-map','1:v','-vf','setpts=PTS+5/TB','-fps_mode','passthrough','-c:v','libx264',w.p('multi.mp4')]);
    const source=prepareReleaseSource(series,prev,'c4',w.p('multi.mp4'),w.p('bundle'));
    expect(source.frame.frameCount).toBe(4);expect(verifyReleaseSource(w.p('bundle')).subjectDigest).toBe(source.subjectDigest);
  });
});


it('keeps VFR frame count and applies rotation consistently to the final frame',()=>{
  const w=workspace();
  ffmpeg(['-i',clip,'-vf','setpts=N*N/(4*TB)','-fps_mode','passthrough','-c:v','libx264',w.p('vfr.mp4')]);
  ffmpeg(['-display_rotation:v:0','90','-i',w.p('vfr.mp4'),'-c','copy',w.p('rotated.mp4')]);
  const metadata=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream_side_data=rotation','-of','json',w.p('rotated.mp4')],{encoding:'utf8'});
  expect(JSON.parse(metadata.stdout).streams[0].side_data_list[0].rotation).toBe(90);
  const source=prepareReleaseSource(series,prev,'c4',w.p('rotated.mp4'),w.p('bundle'));
  expect(source.frame.frameCount).toBe(4);
  expect(verifyReleaseSource(w.p('bundle')).subjectDigest).toBe(source.subjectDigest);
  const dimensions=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',w.p('bundle/last-frame.png')],{encoding:'utf8'});
  expect(JSON.parse(dimensions.stdout).streams[0]).toMatchObject({width:90,height:160});
},60_000);

it('allows exactly one concurrent creator and preserves its complete bundle',async()=>{
  const w=workspace();
  const args=['--import','tsx','src/cli/index.ts','release-source','--series',w.p('series.json'),'--episode',w.p('prev.json'),'--cut','c4','--clip',clip,'--out',w.p('bundle')];
  const start=()=>new Promise<number|null>((resolve,reject)=>{
    const child=spawn(process.execPath,args,{cwd:pkg,stdio:'ignore',timeout:30_000});
    child.once('error',reject);child.once('close',code=>resolve(code));
  });
  expect((await Promise.all([start(),start()])).sort()).toEqual([0,1]);
  expect(verifyReleaseSource(w.p('bundle')).clip.sha256).toBe(sha(clip));
},60_000);
