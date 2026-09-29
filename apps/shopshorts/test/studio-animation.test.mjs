import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createProject,changeProject,validateScenes} from '../lib/studio.js';
import {animationPlan} from '../lib/animation-plan.js';
import {scenarioBrief,scenarioResult} from '../lib/studio-scenario.js';
import {recommendationInput} from '../lib/studio-recommendations.js';
import {startAutomatic} from '../lib/studio-automatic.js';
import {animationSvg,renderAnimationScene} from '../studio-animation.mjs';
import {executeStudioTask,command,sceneFfmpegArgs} from '../studio-runner.mjs';

export const plan={title:'불편함을 피하는 순간',layout:'sequence',elements:[{icon:'book',label:'해야 할 일',motion:'enter'},{icon:'cloud',label:'불편한 감정',motion:'shake'},{icon:'phone',label:'잠깐의 회피',motion:'pulse'}]};
const brief={category:'심리학',topic:'왜 미루게 될까?',direction:'차분한 설명',format:'short',duration:16,productionStyle:'animation'};
const scene={id:'scene-1',kind:'video',duration:8,narration:'해야 할 일을 앞두고 불편함을 느낄 때가 있어요.',prompt:'책에서 구름, 전화기로 이어지는 감정 회피의 비유',animation:plan};

test('animation choice persists through brief and recommendations; old briefs stay unchanged',()=>{
 assert.equal(createProject(brief).brief.productionStyle,'animation');
 assert.equal(recommendationInput({...brief,focus:'topic'}).productionStyle,'animation');
 assert.throws(()=>createProject({...brief,productionStyle:'invalid'}));
 const {productionStyle,...legacy}=brief;assert.equal(createProject(legacy).brief.productionStyle,undefined);
});
test('LLM must return meaningful bounded animation data, never executable markup',async()=>{
 let prompt='';
 const scenes=[scene,{...scene,id:'scene-2',narration:'잠시 피한 뒤에도 일은 남아 있어요. 작은 행동부터 시작해 보세요.'}];
 const result=await scenarioBrief(brief,{}, {provider:'claude',generate:async p=>{prompt=p;return {value:{title:'미루기의 순간',scenes,storyArc:{hook:{sceneId:'scene-1',line:scene.narration},payoff:{sceneId:'scene-2',line:'잠시 피한 뒤에도 일은 남아 있어요.'},ending:{sceneId:'scene-2',line:'작은 행동부터 시작해 보세요.'}}}};}});
 assert.match(prompt,/코드로 렌더링/);assert.deepEqual(result.scenes[0].animation,plan);
 assert.throws(()=>scenarioResult({title:'실패',scenes:scenes.map(({animation,...s})=>s)},brief),/동작 구성/);
 assert.throws(()=>animationPlan({...plan,elements:[{icon:'<script>',motion:'enter',label:'a'},plan.elements[0]]}));
 assert.throws(()=>animationPlan({...plan,elements:Array(5).fill(plan.elements[0])}));
 const svg=animationSvg({...scene,animation:{...plan,title:'<script>alert(1)</script>'}},'16:9',2);
 assert.ok(svg.includes('&lt;script&gt;'));assert.ok(!svg.includes('<script>'));
 assert.equal(animationSvg(scene,'9:16',2),animationSvg(scene,'9:16',2));
 assert.notEqual(animationSvg(scene,'9:16',1),animationSvg(scene,'9:16',2));
});
test('changes invalidate generated clips and animation cannot silently become a still image',()=>{
 const job={...createProject(brief),scenes:[scene],assets:{'scene-1':{source:'ai',kind:'video',key:'old'}},approved:true};
 for(const patch of [{duration:9},{animation:{...plan,title:'新しい意味'}},{narration:'違う意味の台詞'}]){
  assert.equal(changeProject(job,'scenes',{scenes:[{...scene,...patch}]}).assets['scene-1'],undefined);
 }
 assert.throws(()=>changeProject(job,'scenes',{scenes:[{...scene,kind:'image'}]}));
 assert.deepEqual(validateScenes([scene])[0].animation,plan);
 const args=sceneFfmpegArgs('a','b',scene,{durations:{'scene-1':8}},'9:16',null,0,false,null,[],false,true);
 assert.ok(!args.includes('-stream_loop'));assert.match(args[args.indexOf('-vf')+1],/tpad/);
});
test('automatic choice comes from owner saved recommendation, not forged browser arguments',async()=>{
 let project;
 const saved={state:'done',input:{...brief,focus:'topic',intent:'keywords'},result:{intent:'keywords',sources:[{title:'source',url:'https://example.org'}],suggestions:[0,1,2].map(i=>({keyword:'keyword '+i,topic:'topic '+i,direction:'explain',reason:'reason'}))}};
 const store={get:async()=>project,create:async p=>{project=p;}};
 await startAutomatic(new Request('https://studio.test/api/studio/automatic',{headers:{cookie:'ss=fixture'}}),{SHOPSHORTS_TOKEN:'fixture'},store,{recommendationId:crypto.randomUUID(),index:0,productionStyle:'cinematic'},async(owner,op)=>op==='recommendation'?{recommendation:saved}:{connected:false});
 assert.equal(project.brief.productionStyle,'animation');assert.equal(project.approved,false);
});
test('real renderer outputs playable moving MP4 and worker bypasses image/video providers', {timeout:120000},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'animation-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const short={...scene,duration:1};
 const job={...createProject(brief),scenes:[short],task:{id:'animation-fixture',action:'media'}};
 // Full worker route (including existing content lint), no paid provider calls.
 const stored=new Map(),deltas=[];
 const io={workDir:dir,writeAsset:async(k,data,type)=>stored.set(k,{data,type})};
 const result=await executeStudioTask(job,{SHOPSHORTS_MEDIA_PROVIDER:'higgsfield'},io,async delta=>deltas.push(delta),{fetcher:()=>{throw Error('must not call provider');},runHiggsfield:()=>{throw Error('must not call Higgsfield');}});
 assert.equal(result.assets['scene-1'].provider,'animation-svg');assert.equal(deltas.length,1);
 const file=join(dir,'actual.mp4');await writeFile(file,stored.get(result.assets['scene-1'].key).data);
 const probe=JSON.parse(await command('ffprobe',['-v','error','-show_streams','-of','json',file],{}));
 assert.equal(probe.streams[0].codec_name,'h264');assert.equal(probe.streams[0].nb_frames,'30');assert.equal(probe.streams[0].width,1080);
 const hashes=await command('ffmpeg',['-v','error','-i',file,'-f','framemd5','-'],{});
 assert.ok(new Set(hashes.split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split(',').at(-1))).size>15);
 const resumed=await executeStudioTask({...job,assets:result.assets},{},io,async()=>{throw Error('completed scenes must not render again');});
 assert.deepEqual(resumed.assets,result.assets);
 await mkdir(join(dir,'landscape'));
 const wide=await renderAnimationScene({...job,brief:{...brief,aspect:'16:9'}},short,join(dir,'landscape'),{}, {width:640});
 assert.ok(wide.data.length>1000);
});
