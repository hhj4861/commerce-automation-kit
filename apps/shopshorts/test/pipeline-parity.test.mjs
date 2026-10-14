import {mockReview} from './helpers/editorial-review.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createProject,changeProject} from '../lib/studio.js';
import {PIPELINE_VERSION,sharedPipeline,requireFinalReview} from '../lib/production-pipeline.js';
import {studioApi} from '../lib/studio-api.js';
import {runHybridCli} from '../studio-hybrid-cli.mjs';
import {productionPreflight} from '../studio-preflight.mjs';
import {narrationFailure,generateNarration} from '../studio-narration.mjs';
import {validAlignment} from '../studio-alignment.mjs';
import {cinematicEdit} from '../lib/cinematic-production.js';
const brief={category:'과학',topic:'데이터는 어떻게 이동할까?',format:'short',duration:30,productionStyle:'cinematic',workflow:'explainer-v1',voiceId:'RU7aSi6lT4uQBXMLgDxK',narrationSpeed:1.1};
const text='같은 자료를 전달합니다.';
function project(){const p=createProject(brief);p.scenes=[{id:'scene-1',narration:text,prompt:'자료가 서버 사이를 이동하는 장면',duration:3,kind:'video'}];p.approved=true;return p;}
const alignment={version:'whisper-words-v1',text,coverage:1,phrases:[{text,start:.2,end:2.5}]};
function voiced(){const p=project();p.assets['narration-scene-1']={key:'studio/voice.mp3',purpose:'narration',kind:'audio',voice:brief.voiceId,narrationSpeed:1.1,text,duration:2.7,alignment};return p;}
test('web and terminal factories persist the same version and inputs; legacy stays unversioned',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'pipeline-'));t.after(()=>rm(dir,{recursive:true,force:true}));const input=join(dir,'brief.json'),file=join(dir,'project.json');await writeFile(input,JSON.stringify(brief));
 await runHybridCli(['--project',file,'--action','create','--brief',input]);const local=JSON.parse(await readFile(file));let web;
 const r=await studioApi(new Request('https://test/api/studio',{method:'POST',headers:{origin:'https://test','content-type':'application/json'},body:JSON.stringify(brief)}),{}, {create:async p=>web=p});
 assert.equal(r.status,201);assert.equal(local.pipelineVersion,PIPELINE_VERSION);assert.deepEqual(local.brief,web.brief);assert.deepEqual(local.scenes,web.scenes);assert.equal(sharedPipeline({...web,pipelineVersion:undefined}),false);
 await assert.rejects(runHybridCli(['--project',file,'--action','create','--brief',input]),/EEXIST/);
});
test('cached measured speech needs no provider connection; TLS failures are actionable and redact secrets',async()=>{
 const p=voiced();p.task={action:'narration'};let calls=0;await productionPreflight(p,{}, {command:async()=>'',fetcher:async()=>{calls++;}});assert.equal(calls,0);
 const e=Object.assign(Error('fetch failed'),{cause:{code:'UNABLE_TO_VERIFY_LEAF_SIGNATURE',message:'private-data'}});
 assert.match(narrationFailure(e),/인증서/);assert.doesNotMatch(narrationFailure(e),/private-data/);
 delete p.assets['narration-scene-1'];await assert.rejects(productionPreflight(p,{ELEVENLABS_API_KEY:'never-log'}, {command:async()=>'',fetcher:async()=>{throw e;}}),/인증서/);
});
test('aligned captions use measured times and reject stale or absent alignment without affecting legacy',()=>{
 const p=voiced(),e=cinematicEdit(p),c=e.captions.find(c=>c.source==='script');assert.equal(c.startFrame,6);assert.equal(c.endFrame,75);
 delete p.assets['narration-scene-1'].alignment;assert.throws(()=>cinematicEdit(p),/정렬/);delete p.pipelineVersion;assert.doesNotThrow(()=>cinematicEdit(p));
 assert.throws(()=>sharedPipeline({...p,pipelineVersion:'future-v9'}),/버전/);
 assert.equal(validAlignment({...alignment,coverage:Infinity},text,2.7),false);
 assert.equal(validAlignment(alignment,text,2.7,['다른 분할']),false);
 assert.equal(validAlignment(alignment,text,2.7),true);assert.equal(validAlignment(alignment,'다른 대사',2.7),false);
});
test('alignment failure persists paid audio before failure; retry reuses it without resynthesis',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'narration-retry-'));t.after(()=>rm(dir,{recursive:true,force:true}));const p=project();p.edit={voice:brief.voiceId,clips:[{id:'clip',sceneId:'scene-1',inFrame:0,outFrame:90}],version:2,fps:30,captions:[],music:null,musicVolume:.1};
 const data=Buffer.from('fixture-audio'),store=new Map();let paid=0,alignCalls=0;
 const io={writeAsset:async(k,b)=>store.set(k,b),readAsset:async k=>store.get(k)};
 const tools={runCli:async(w,args)=>{paid++;await writeFile(args[args.indexOf('--out')+1],data);},command:async(bin,args)=>{
  if(bin==='ffprobe')return '2.7';if(bin==='ffmpeg'){await writeFile(args.at(-1),data);return '';}
  alignCalls++;if(alignCalls===1)throw Error('alignment interrupted');await writeFile(args[args.indexOf('--output')+1],JSON.stringify(alignment));return '';
 }};
 const checkpoint=async result=>Object.assign(p,result);
 await assert.rejects(generateNarration(p,dir,{ELEVENLABS_API_KEY:'fixture'},io,checkpoint,tools),/interrupted/);assert.equal(paid,1);assert.ok(p.assets['narration-scene-1']);
 await generateNarration(p,dir,{},io,checkpoint,tools);assert.equal(paid,1);assert.equal(alignCalls,2);assert.ok(p.assets['narration-scene-1'].alignment);
});
test('new pipeline publishing requires matching QA hash; legacy publication contract remains',()=>{
 const p=project();p.render={key:'final',sha256:'a'};assert.throws(()=>requireFinalReview(p),/검사/);
 p.render.verification={version:PIPELINE_VERSION,passed:true,sha256:'b'};assert.throws(()=>requireFinalReview(p));p.render.verification.sha256='a';assert.doesNotThrow(()=>requireFinalReview(p));
 delete p.pipelineVersion;delete p.render.verification;assert.doesNotThrow(()=>requireFinalReview(p));
});

test('terminal scenario uses shared research and review, retains evidence and requires fresh human approval',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'pipeline-scenario-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=join(dir,'project.json');await writeFile(file,JSON.stringify(createProject(brief)));
 const scenes=['왜 기다릴까요?','자료가 도착하면 계산합니다.','그래서 연결도 중요합니다.'].map((narration,i)=>({id:'scene-'+(i+1),narration,prompt:'One packet follows a visible path to the same server.',duration:10,kind:'video',shot:['wide','detail','medium'][i],camera:'locked',visualDirection:{focus:'패킷 '+i,before:'출발 전 '+i,action:'서버로 이동 '+i,after:'도착 '+i,continuity:'같은 서버와 파란 자료',material:'무광 표면',lighting:'밝은 측면광',representation:'conceptual',treatment:'process',...(i===0?{hookText:'계산은 왜 기다릴까?'}:{})}}));
 const value={title:'자료의 이동',scenes,visualStyle:'밝은 배경과 파란 서버',storyArc:Object.fromEntries(['hook','payoff','ending'].map((key,i)=>[key,{sceneId:scenes[i].id,line:scenes[i].narration}]))};
 let count=0;const phases=[];
 const scenarioGenerate=async prompt=>{
  phases.push(JSON.parse(await readFile(file)).task.phase);count++;
  const review=mockReview(prompt);if(review)return review;
  if(count===1)return {searched:true,value:{sources:[{id:'source-1',title:'검증용 공식 자료',url:'https://example.org/primary'}],facts:[{claim:'연산에는 데이터가 필요하다.',sourceIds:['source-1']}],limitations:['검증용 자료']}};
  assert.match(prompt,/연산에는 데이터가 필요하다/);return {value};
 };
 await runHybridCli(['--project',file,'--action','scenario','--assets',join(dir,'assets'),'--work',join(dir,'work')],{}, {scenarioGenerate});
 const saved=JSON.parse(await readFile(file));assert.deepEqual(phases,['research','scenario','review']);assert.equal(saved.task.state,'done');assert.equal(saved.approved,false);assert.equal(saved.assets&&Object.keys(saved.assets).length,0);assert.equal(saved.research.sources[0].id,'source-1');
});
