import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {hybridPlan,hybridScene,sceneRoute} from '../public/hybrid-plan.js';
import {hybridSvg} from '../public/hybrid-graphics.js';
import {hybridComposition} from '../studio-hybrid-render.mjs';
const layers=[{id:'base',label:'기판',meaning:'부품을 연결하는 바닥',shape:'rect',color:'#79c4bd',from:[50,65],to:[50,65],size:[82,12],start:0,end:.2,motion:'reveal'}, {id:'chip',label:'칩',meaning:'아래 부품으로 접근하는 칩',shape:'rect',color:'#d6a669',from:[50,20],to:[50,48],size:[45,16],start:.2,end:.8,motion:'move'}];
export const scene={id:'scene-2',kind:'video',duration:4,narration:'위의 칩을 아래 접점에 연결합니다.',prompt:'동일한 칩과 기판 사이 간격이 줄어든다.',visualDirection:{focus:'칩과 기판',treatment:'cutaway'},webtoon:{artPrompt:'독창적인 칩 단면 웹툰',answer:'접점이 가까워져 연결된다.',layers},hybrid:{renderer:'auto',focus:'chip',depth:8}};
test('shared routing preserves opening, selects semantic purpose and reports unknown cost honestly',()=>{
 const scenes=['scene','scene','cutaway','process','comparison'].map((t,i)=>({...structuredClone(scene),id:`scene-${i+1}`,visualDirection:{...scene.visualDirection,treatment:t}}));
 const p={brief:{productionStyle:'hybrid',maxCredits:54},scenes,assets:{'scene-1':{key:'owned'}}};
 const plan=hybridPlan(p);assert.deepEqual(plan.scenes.map(s=>s.renderer),['higgsfield','webtoon','3d','motion','motion']);
 assert.equal(plan.cost.credits,null);assert.equal(plan.cost.videoScenes,0);assert.equal(plan.cost.artworkScenes,1);assert.equal(plan.scenes[0].reused,true);
 assert.equal(hybridPlan({...p,brief:{productionStyle:'webtoon'}}),null);
});
test('invalid or unsupported geometry fails instead of silently selecting another paid service',()=>{
 for(const v of [{renderer:'javascript'},{renderer:'3d',depth:Infinity},{renderer:'motion',focus:'missing'}])assert.throws(()=>hybridScene(v,scene));
 assert.throws(()=>sceneRoute({...scene,hybrid:undefined,visualDirection:{}},1));
 assert.throws(()=>sceneRoute({...scene,webtoon:{...scene.webtoon,layers:[{...layers[1],shape:'ellipse'}]}},1));
 assert.equal(sceneRoute({...scene,hybrid:{renderer:'webtoon',focus:'chip',depth:8}},1).renderer,'webtoon');
});
test('temporal movement, final hold and 3D geometry differ; labels cannot inject markup',()=>{
 const s={...scene,webtoon:{...scene.webtoon,layers:layers.map(l=>({...l,label:'<script>x</script>'}))}};
 const a=hybridSvg(s,'16:9',0,'3d'),b=hybridSvg(s,'16:9',3.5,'3d');assert.notEqual(a,b);assert.match(b,/polygon/);assert.ok(!b.includes('<script>'));assert.match(b,/&lt;script&gt;/);
 assert.equal(hybridSvg(scene,'16:9',3.6),hybridSvg(scene,'16:9',4));
 assert.notEqual(hybridSvg(scene,'9:16',2),hybridSvg(scene,'16:9',2));
});
test('trusted HTML compilation contains escaped data and valid inline JS, rejects path traversal',async()=>{
 const html=await hybridComposition({...scene,prompt:'</script><script>fetch("evil")</script>'},'16:9','motion');
 assert.ok(!html.includes('</script><script>fetch'));
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(m[1].trim())new vm.Script(m[1]);
 await assert.rejects(hybridComposition({...scene,id:'../escape'},'16:9','motion'));
 await assert.rejects(hybridComposition({...scene,duration:Infinity},'16:9','motion'));
});

import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createProject,changeProject} from '../lib/studio.js';
import {scenarioResult} from '../lib/studio-scenario.js';
import {reviewPrompt,validateDepthReview} from '../lib/explanation-depth.js';
import {mockReview} from './helpers/editorial-review.mjs';
import {prepareWebtoon,checkWebtoonReview} from '../studio-webtoon.mjs';
import {studioApi} from '../lib/studio-api.js';
export async function hybridFixture(){
 const p=createProject({category:'과학',topic:'칩의 연결을 설명하는 구조도',format:'short',duration:18,productionStyle:'hybrid',maxCredits:60});
 const full={...scene.visualDirection,before:'칩과 기판 사이 간격',action:'칩이 내려온다',after:'칩이 기판에 가깝다',continuity:'청록 기판과 앰버 칩',material:'잉크 선',lighting:'밝은 대상과 남색 배경',representation:'conceptual',hookText:'칩은 어떻게 연결될까?'};
 const scenes=['scene','scene','cutaway','process'].map((t,i)=>({...structuredClone(scene),id:`scene-${i+1}`,duration:i===0?6:4,shot:i===0?'wide':'detail',camera:'push-in',visualDirection:{...full,treatment:t,focus:'연결 과정 '+i}}));
 const result=scenarioResult({title:'칩의 연결',scenes,visualStyle:'남색 청록 앰버의 잉크 도해',research:{sources:[{id:'source-1',title:'시험용 출처',url:'https://example.com/fixture'}],facts:[{claim:'시험용 데이터다.',sourceIds:['source-1']}],limitations:['실제 과학 대본이 아닌 전송 검증 fixture']}},p.brief);
 Object.assign(p,result);p.depthReview=await validateDepthReview(mockReview(await reviewPrompt(p.brief,p)).value,p.brief,p);
 return p;
}
test('CLI/web share routes; edited choreography invalidates its media and previous review',async t=>{
 const p=await hybridFixture(),d=await mkdtemp(join(tmpdir(),'hybrid-cli-'));t.after(()=>rm(d,{recursive:true,force:true}));
 await writeFile(join(d,'project.json'),JSON.stringify(p));
 execFileSync(process.execPath,['apps/shopshorts/studio-visual-plan.mjs','--project',join(d,'project.json'),'--out',join(d,'plan.json')]);
 const cli=JSON.parse(await readFile(join(d,'plan.json'),'utf8'));assert.deepEqual(cli.hybridPlan,hybridPlan(p));assert.equal(p.brief.narrationSpeed,1.1);
 p.assets={'scene-2':{source:'ai'},'scene-3':{source:'ai'}};
 const changed=structuredClone(p.scenes);changed[2].hybrid.depth=12;
 const next=changeProject(p,'scenes',{scenes:changed});assert.ok(next.assets['scene-2']);assert.ok(!next.assets['scene-3']);
 await assert.rejects(checkWebtoonReview(next),/대본/);
});
test('mixed budget prices only required art and opening; failed local renderer resumes without paid regeneration',async t=>{
 const p=await hybridFixture(),dir=await mkdtemp(join(tmpdir(),'hybrid-budget-'));t.after(()=>rm(dir,{recursive:true,force:true}));p.task={action:'media'};
 const files=new Map(),io={readAsset:async k=>files.get(k),writeAsset:async(k,b)=>files.set(k,b)},calls=[],generated=[],rendered=[];
 const deps={hybridReady:()=>true,run:async a=>{calls.push(a);if(a[0]==='account')return {credits:1000};if(a[1]==='cost')return {credits:a[2]==='seedance_2_0'?54:2};throw Error('unexpected paid call');},generate:async(j,s)=>{generated.push(s.id);return {data:Buffer.from('fixture'),type:s.kind==='image'?'image/png':'video/mp4',provider:'fixture'};},render:async()=>({data:Buffer.from('fixture'),type:'video/mp4'}),renderHybrid:async(j,s,w,e,r)=>{rendered.push(r);if(r==='3d')throw Error('local render interrupted');return {data:Buffer.from('fixture'),type:'video/mp4'};}};
 const checkpoint=async delta=>Object.assign(p,delta);
 const pipeline=await prepareWebtoon(p,{},dir,io,checkpoint,deps);assert.equal(p.productionPlan.cost.credits,58);
 for(const s of p.scenes.slice(0,2)){await pipeline.scene(s,s.duration);p.assets=pipeline.merge({...p.assets,[s.id]:{source:'ai',key:s.id}});}
 await assert.rejects(pipeline.scene(p.scenes[2],4),/interrupted/);const count=generated.length;assert.equal(count,3);
 const resume=await prepareWebtoon(p,{},dir,io,checkpoint,{...deps,renderHybrid:async()=>({data:Buffer.from('ok'),type:'video/mp4'})});
 await resume.scene(p.scenes[2],4);assert.equal(generated.length,count);assert.equal(p.productionPlan.cost.additionalCredits,0);
 const low=await hybridFixture();low.brief.maxCredits=55;low.task={action:'media'};low.depthReview=await validateDepthReview(mockReview(await reviewPrompt(low.brief,low)).value,low.brief,low);
 await assert.rejects(prepareWebtoon(low,{},dir,io,async()=>{},deps),/초과/);assert.equal(generated.length,count);
 const missing=await hybridFixture();missing.task={action:'media'};
 await assert.rejects(prepareWebtoon(missing,{},dir,io,async()=>{},{...deps,hybridReady:()=>false}),/Node 22/);assert.equal(generated.length,count);
});

import {checkHybridRuntime} from '../studio-hybrid-render.mjs';
import {runHybridCli,localAssetPath} from '../studio-hybrid-cli.mjs';
test('async runtime failure precedes even quotes, and CLI shares approval and checkpoint persistence',async t=>{
 const p=await hybridFixture(),dir=await mkdtemp(join(tmpdir(),'hybrid-client-'));t.after(()=>rm(dir,{recursive:true,force:true}));p.task={action:'media'};
 let quoted=0;
 await assert.rejects(prepareWebtoon(p,{},dir,{},async()=>{},{hybridReady:async()=>false,run:async()=>{quoted++;}}),/Node 22/);assert.equal(quoted,0);
 await assert.rejects(checkHybridRuntime({SHOPSHORTS_MOTION_NODE:'/no-such-node'}));
 const path=join(dir,'project.json');await writeFile(path,JSON.stringify(p));
 const args=['--project',path,'--assets',join(dir,'assets'),'--work',join(dir,'work')];
 assert.deepEqual((await runHybridCli(args)).plan,hybridPlan(p));
 await assert.rejects(runHybridCli([...args,'--action','media']),/approve-script/);
 let executions=0;
 await assert.rejects(runHybridCli([...args,'--action','media','--approve-script'],{}, {execute:async(j,e,io,checkpoint)=>{executions++;await checkpoint({productionPlan:{version:'hybrid-v1',cost:{credits:58}}});throw Error('render interrupted');}}),/interrupted/);
 const saved=JSON.parse(await readFile(path,'utf8'));assert.equal(saved.productionPlan.cost.credits,58);assert.equal(saved.task.state,'failed');assert.equal(executions,1);
 await assert.rejects(readFile(path+'.lock'),/ENOENT/);
 for(const key of ['../outside','/outside','a/../../b','a\\b'])assert.throws(()=>localAssetPath(dir,key));
});

import {executeStudioTask,command} from '../studio-runner.mjs';
import {continueAutomatic} from '../lib/studio-automatic.js';
import {KYLE} from '../lib/webtoon-plan.js';
import {Resvg} from '@resvg/resvg-js';
test('real hybrid worker creates full motion/3D clips then mixes speech and subtitles', {skip:!process.env.HYBRID_RENDER_E2E,timeout:300000},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'hybrid-e2e-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const p=await hybridFixture();p.approved=true;p.task={id:'qa',action:'media',state:'running'};
 const opening=join(dir,'opening.mp4');await command('ffmpeg',['-y','-v','error','-f','lavfi','-i','testsrc2=size=360x640:rate=30','-t','6','-c:v','libx264','-pix_fmt','yuv420p',opening],{});
 const png=new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#246477"/></svg>').render().asPng();
 const files=new Map(),io={workDir:dir,readAsset:async key=>{assert.ok(files.has(key));return files.get(key);},writeAsset:async(key,data)=>files.set(key,data)};
 const jobs=new Map(),calls=[];
 const run=async a=>{calls.push(a);if(a[0]==='account')return {credits:1000};if(a[1]==='cost')return {credits:a[2]==='seedance_2_0'?54:2};if(a[1]==='create'){const id=`00000000-0000-4000-8000-${String(jobs.size+1).padStart(12,'0')}`;jobs.set(id,a[2]);return {id};}if(a[1]==='get')return {id:a[2],status:'completed',result_url:`https://fixture.higgsfield.ai/${jobs.get(a[2])}`};throw Error('unexpected provider operation');};
 const fetcher=async url=>new Response(String(url).includes('seedance')?await readFile(opening):png,{headers:{'content-type':String(url).includes('seedance')?'video/mp4':'image/png'}});
 const runCli=async(name,args,env)=>{assert.equal(name,'@cak/tts-narration');assert.equal(env.ELEVENLABS_VOICE_ID,KYLE);await command('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=240:sample_rate=44100','-t','3','-c:a','libmp3lame',args[args.indexOf('--out')+1]],{});return {};};
 const env={ELEVENLABS_API_KEY:'test',SHOPSHORTS_MEDIA_PROVIDER:'higgsfield',SHOPSHORTS_MOTION_NODE:process.env.SHOPSHORTS_MOTION_NODE};
 const checkpoint=async delta=>Object.assign(p,delta);
 Object.assign(p,await executeStudioTask(p,env,io,checkpoint,{runCli,runHiggsfield:run,fetcher}));
 assert.equal(p.assets['scene-2'].provider,'webtoon-hybrid');assert.equal(p.assets['scene-3'].provider,'hybrid-3d');assert.equal(p.assets['scene-4'].provider,'hybrid-motion');
 assert.equal(calls.filter(a=>a[1]==='create').length,3);assert.equal(p.productionPlan.cost.credits,58);
 p.task.state='done';const ready=continueAutomatic(p);assert.ok(ready.edit.captions.length);assert.equal(ready.edit.voice,KYLE);
 const rendered=await executeStudioTask(changeProject(ready,'render',{}),env,io,async()=>{}, {runCli});
 const target=process.env.HYBRID_E2E_OUTPUT||join(dir,'final.mp4');await writeFile(target,files.get(rendered.render.key));
 const info=JSON.parse(await command('ffprobe',['-v','error','-show_streams','-of','json',target],{}));assert.equal(info.streams[0].width,1080);assert.ok(info.streams.some(s=>s.codec_type==='audio'));
 await command('ffmpeg',['-v','error','-i',target,'-f','null','-'],{});
 const before=calls.length;await executeStudioTask({...p,task:{id:'resume',action:'media'}},env,io,checkpoint,{runCli,runHiggsfield:run,fetcher});assert.equal(calls.length,before);
});

test('only claimed worker checkpoints the mixed production quote through real API',async()=>{
 let p=changeProject(await hybridFixture(),'media',{approved:true});p.task={...p.task,state:'running',id:'fixture-task'};
 const store={get:async()=>structuredClone(p),cas:async(next,revision)=>{if(p.revision!==revision)return false;p=structuredClone(next);return true;}};
 const result={productionPlan:{...hybridPlan(p),cost:{status:'quoted',credits:58,additionalCredits:58}}};
 const request=token=>studioApi(new Request(`https://studio.test/api/studio/${p.id}/checkpoint`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({revision:p.revision,taskId:p.task.id,result})}),{SHOPSHORTS_TOKEN:'test-worker'},store);
 assert.equal((await request('wrong')).status,403);assert.equal((await request('test-worker')).status,200);assert.equal(p.productionPlan.cost.credits,58);
});
