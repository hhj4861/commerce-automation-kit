import {mockReview} from './helpers/editorial-review.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createProject,validateBrief} from '../lib/studio.js';
import {scenarioBrief,scenarioResult} from '../lib/studio-scenario.js';
import {validateResearch,productionOptions} from '../lib/explainer-production.js';
import {recommendationInput} from '../lib/studio-recommendations.js';
import {continueAutomatic} from '../lib/studio-automatic.js';
import {executeStudioTask,command} from '../studio-runner.mjs';
import {normalizeEdit} from '../public/editor-model.js';
import {narrationAsset,narrationReady} from '../public/narration-audio.js';
import {automaticStatus} from '../public/automatic-creation.js';
import {sceneMediaPrompt} from '../lib/scene-media-prompt.js';
import {animationPlan} from '../lib/animation-plan.js';
import {animationSvg} from '../studio-animation.mjs';
import {Resvg} from '@resvg/resvg-js';
const brief={category:'건축학',topic:'초고층의 진동을 줄이는 원리',format:'short',duration:16,direction:'원리를 쉽게',workflow:'explainer-v1',productionStyle:'animation',voiceId:'n2fbxG88jqAoaVPUy3IG',narrationSpeed:1.15,captionPosition:'middle'};
const research={sources:[{id:'source-1',title:'공식 건축 자료',url:'https://www.taipei-101.com.tw/ko/observatory/feature'}],facts:[{claim:'매달린 질량과 댐퍼로 진동을 줄인다.',sourceIds:['source-1']}],limitations:['도해의 진폭은 실제 측정값이 아니다.']};
const plan={title:'움직여서 덜 흔들리게',layout:'contrast',diagram:'pendulum',takeaway:'상대운동에 저항하는 댐퍼',elements:[{icon:'building',label:'건물',motion:'shake'},{icon:'damper',label:'댐퍼',motion:'pulse'}]};
const scenes=[{id:'s1',duration:8,kind:'video',narration:'왜 움직일까요?',prompt:'매달린 질량의 원리 설명',animation:{...plan,diagram:'objects',presentation:'illustrated',staging:'reaction',elements:[{icon:'person',label:'사람',motion:'talk'},{icon:'robot',label:'도움',motion:'wave'}]}},{id:'s2',duration:8,kind:'video',narration:'움직이며 줄입니다. 원리를 이해해 보세요.',prompt:'진동 에너지 감소 도해',animation:plan}];
const generated={title:'움직임의 원리',scenes,storyArc:{hook:{sceneId:'s1',line:'왜 움직일까요?'},payoff:{sceneId:'s2',line:'움직이며 줄입니다.'},ending:{sceneId:'s2',line:'원리를 이해해 보세요.'}}};
test('production choices persist and reject unsupported rates, providers and voices',()=>{
 const b=validateBrief(brief);assert.equal(b.mediaProvider,'animation');assert.equal(recommendationInput({...brief,focus:'topic'}).voiceId,brief.voiceId);
 assert.equal(validateBrief({...brief,productionStyle:'cinematic',mediaProvider:'forged'}).mediaProvider,'higgsfield');
 assert.equal(productionOptions({...brief,format:'long',narrationSpeed:undefined}).narrationSpeed,1);
 for(const patch of [{workflow:'other'},{voiceId:'secret'},{narrationSpeed:2},{captionPosition:'unsafe'}])assert.throws(()=>validateBrief({...brief,...patch}));
});
test('selected topic is researched before script, evidence is retained, missing search fails closed',async()=>{
 const phases=[];let calls=0;
 const result=await scenarioBrief(brief,{}, {onProgress:phase=>phases.push(phase),generate:async prompt=>{
  calls++;if(mockReview(prompt))return mockReview(prompt);if(calls===1){assert.match(prompt,/내장 웹 검색/);assert.match(prompt,/초고층/);return {searched:true,value:research};}
  assert.match(prompt,/source-1/);assert.match(prompt,/실제 측정값/);return {value:generated};
 }});
 assert.deepEqual(phases,['research','scenario']);assert.equal(calls,3);assert.deepEqual(result.research.facts,research.facts);
 assert.deepEqual(scenarioResult(result,brief).research,result.research);
 assert.equal(result.scenes[0].animation.presentation,'illustrated');
 assert.equal(result.scenes[1].animation.presentation,'diagram');
 const omitted={...generated,scenes:generated.scenes.map(s=>({...s,animation:{...plan,diagram:'objects'}})),research};
 assert.equal(scenarioResult(omitted,brief).scenes[0].animation.presentation,'illustrated');
 await assert.rejects(scenarioBrief(brief,{}, {generate:async()=>({searched:false,value:research})}),{code:'SCENARIO_RESEARCH_INVALID'});
 assert.throws(()=>validateResearch({...research,facts:[{claim:'출처 없는 주장',sourceIds:['source-9']}]}));
 assert.throws(()=>validateResearch({...research,sources:[{id:'source-1',title:'bad',url:'javascript:alert(1)'}]}));
});
test('bounded mechanism diagrams animate and escape labels without executable generated code',()=>{
 for(const diagram of ['pendulum','section','orbit']){
  const scene={...scenes[0],animation:{...plan,diagram}};
  assert.notEqual(animationSvg(scene,'9:16',1),animationSvg(scene,'9:16',2));
  for(const aspect of ['9:16','16:9'])assert.ok(new Resvg(animationSvg(scene,aspect,2)).render().asPng().length>1000);
 }
 assert.throws(()=>animationPlan({...plan,diagram:'eval'}));
 const svg=animationSvg({...scenes[0],animation:{...plan,takeaway:'<script>bad</script>'}},'9:16',2);assert.ok(!svg.includes('<script>'));assert.match(svg,/&lt;script&gt;/);
});
test('real automatic render measures 1.15x speech, fits animation/captions, resumes without paid calls', {timeout:120000},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'explainer-e2e-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 let calls=0;const assets=new Map(),checkpoints=[];
 const io={workDir:dir,writeAsset:async(k,d)=>assets.set(k,d),readAsset:async k=>{assert.ok(assets.has(k));return assets.get(k);}};
 const runCli=async(_,args)=>{calls++;await command('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=440:duration=1.5','-c:a','libmp3lame',args[args.indexOf('--out')+1]],{});};
 let job={...createProject(brief),voicePreference:brief.voiceId,scenes:[{...scenes[0],duration:8}],approved:true,automation:{version:2},task:{id:'media-test',action:'media',state:'running'}};
 const result=await executeStudioTask(job,{ELEVENLABS_API_KEY:'fixture'},io,async d=>checkpoints.push(structuredClone(d)),{runCli,fetcher:()=>assert.fail('no external media call'),runHiggsfield:()=>assert.fail('animation must bypass Higgsfield')});
 assert.equal(calls,1);assert.ok(checkpoints[0].assets['narration-s1']);assert.equal(result.assets.s1.provider,'animation-svg');
 job={...job,assets:result.assets,task:{...job.task,state:'done'}};
 const audio=narrationAsset(job,job.scenes[0],brief.voiceId);assert.equal(audio.narrationSpeed,1.15);assert.ok(audio.duration<1.4&&audio.duration>1.2);
 assert.equal(narrationReady({...job,brief:{...brief,narrationSpeed:1}},normalizeEdit(job)),false);
 const resumed=await executeStudioTask({...job,task:{...job.task,state:'running'}},{},io,async()=>{}, {runCli:()=>assert.fail('no regeneration')});assert.deepEqual(resumed.assets,job.assets);
 job=continueAutomatic(job);assert.equal(job.task.action,'render');assert.equal(job.edit.captions[0].position,'middle');assert.equal(job.edit.voice,brief.voiceId);
 const duration=job.edit.clips[0].outFrame/30;assert.ok(duration>=audio.duration+.3&&duration<audio.duration+.335);assert.ok(duration<8);
 const final=await executeStudioTask(job,{},io,async()=>{});const file=join(dir,'final.mp4');await writeFile(file,assets.get(final.render.key));
 const probe=JSON.parse(await command('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{}));assert.equal(probe.streams[0].width,1080);assert.equal(probe.streams[0].height,1920);assert.ok(probe.streams.some(s=>s.codec_type==='audio'));assert.ok(Math.abs(Number(probe.format.duration)-duration)<.05);
 await command('ffmpeg',['-v','error','-xerror','-i',file,'-f','null','-'],{});assert.equal(calls,1);
});
test('explicit cinematic selection routes to Higgsfield even without provider env default', {timeout:30000},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'explainer-higgs-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const p=createProject({...brief,productionStyle:'cinematic'}),id='11111111-1111-1111-1111-111111111111',ops=[];
 const png=new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="gold"/></svg>').render().asPng();
 const job={...p,approved:true,scenes:[{id:'s1',duration:4,kind:'image',narration:'구조를 살펴보세요.',prompt:'Original architecture'}],task:{id:'test',action:'media'}};
 const result=await executeStudioTask(job,{}, {workDir:dir,writeAsset:async()=>{}},async()=>{}, {runHiggsfield:async args=>{ops.push(args[1]);return args[1]==='cost'?{credits:2}:args[1]==='create'?{id}:{id,status:'completed',result_url:'https://media.higgsfield.ai/fixture.png'};},fetcher:async url=>{assert.equal(url.hostname,'media.higgsfield.ai');return new Response(png,{headers:{'content-type':'image/png'}});}});
 assert.deepEqual(ops,['cost','create','get']);assert.equal(result.assets.s1.provider,'higgsfield');
});
test('progress reports actual research, voice and media work',()=>{
 const p={brief,scenes,assets:{},task:{action:'scenario',state:'running',phase:'research'}};assert.match(automaticStatus(p),/자료 확인/);p.task.phase='scenario';assert.match(automaticStatus(p),/대본 작성/);p.task.action='media';assert.equal(automaticStatus(p),'음성 생성 0 / 2');p.assets={a:{purpose:'narration'},b:{purpose:'narration'}};assert.equal(automaticStatus(p),'장면 생성 0 / 2');
});

test('new cinematic shots retain shared style without repeating the preceding shot description',()=>{
 const first={...scenes[0],prompt:'PREVIOUS_PISTON_DETAIL'},second={...scenes[1],prompt:'CURRENT_QUIET_ROOM'};
 const p={brief:{...brief,productionStyle:'cinematic'},scenes:[first,second],visualStyle:'consistent amber and green'};
 const prompt=sceneMediaPrompt(p,second);assert.match(prompt,/CURRENT_QUIET_ROOM/);assert.match(prompt,/consistent amber and green/);assert.ok(!prompt.includes('PREVIOUS_PISTON_DETAIL'));
});
