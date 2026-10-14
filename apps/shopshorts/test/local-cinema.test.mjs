import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {comfyOrigin,compileWorkflow,generateLocalScene,assertLocalTask} from '../studio-comfy.mjs';
import {localCinemaOptions,localCinemaMarkup} from '../public/local-cinema.js';
import {createProject,changeProject} from '../lib/studio.js';
import {executeStudioTask} from '../studio-runner.mjs';
const scene={id:'scene-1',kind:'video',prompt:'An original garden in daylight',narration:'정원을 둘러봅니다.',duration:4};
const template=()=>({version:1,outputNode:'4',profile:{width:768,height:512,fps:24,maxDuration:8},prompt:{
 '1':{class_type:'CLIPTextEncode',inputs:{text:'{{prompt}}'}},
 '2':{class_type:'EmptyLTXVLatentVideo',inputs:{width:'{{width}}',height:'{{height}}',length:'{{frames}}',batch_size:1}},
 '3':{class_type:'KSampler',inputs:{seed:'{{seed}}',fps:'{{fps}}'}},
 '4':{class_type:'SaveVideo',inputs:{video:['3',0],filename_prefix:'shopshorts',format:'mp4'}}}});
function project(){let p=createProject({category:'직접 입력',topic:'정원',format:'short',duration:24,productionStyle:'cinematic'});return changeProject(changeProject(p,'scenes',{scenes:[scene]}),'local-cinema',{enabled:true,options:{camera:'orbit',seed:7}});}
async function fixture(){const root=await mkdtemp(join(tmpdir(),'local-cinema-')),file=join(root,'workflow.json');await writeFile(file,JSON.stringify(template()));let posts=0,polls=0,mode='done';const id='12345678-1234-1234-1234-123456789abc';const job=project();job.task={action:'media'};const fetcher=async(url,options)=>{
 assert.equal(new URL(url).hostname,'127.0.0.1');assert.equal(options.redirect,'error');
 if(url.endsWith('/object_info'))return Response.json(Object.fromEntries(Object.values(template().prompt).map(n=>[n.class_type,{input:{required:{}}}])));
 if(url.endsWith('/prompt')){posts++;if(mode==='lost')throw Error('connection lost');return Response.json({prompt_id:id,node_errors:{}});}
 if(url.includes('/history/')){polls++;return Response.json(mode==='pending'?{}:{[id]:{status:{completed:true,status_str:'success'},outputs:{'4':{images:[{filename:mode==='badpath'?'../bad.mp4':'result.mp4',type:'output',subfolder:''}]}}}});}
 if(url.includes('/view?'))return new Response(Buffer.from([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]));
 throw Error('unexpected '+url);
 };return {job,root,env:{SHOPSHORTS_COMFY_VIDEO_WORKFLOW:file},fetcher,posts:()=>posts,polls:()=>polls,setMode:v=>mode=v};}
test('local endpoint rejects remote, auth, path and non-http addresses',()=>{assert.equal(comfyOrigin({}),'http://127.0.0.1:8188');for(const url of ['https://127.0.0.1','http://localhost:8188','http://example.com','http://127.0.0.1/api','http://a:b@127.0.0.1'])assert.throws(()=>comfyOrigin({SHOPSHORTS_COMFY_URL:url}));});
test('preset binding preserves orientation and LTX frame constraints; rejects API nodes',()=>{const p=compileWorkflow(template(),scene,'9:16',{camera:'orbit',seed:7});assert.equal(p.width,512);assert.equal(p.height,768);assert.equal((p.frames-1)%8,0);assert.match(p.prompt['1'].inputs.text,/orbit/);assert.equal(p.prompt['3'].inputs.seed,7);const t=template();t.prompt['3'].class_type='PaidVideoAPI';assert.throws(()=>compileWorkflow(t,scene,'9:16',{}));assert.throws(()=>compileWorkflow(template(),{...scene,duration:10},'9:16',{}));assert.throws(()=>localCinemaOptions({seed:-1}));});
test('explicit mode invalidates AI assets and approval, preserves owned files, sets silent edit',()=>{const p=project();p.assets={'scene-1':{source:'ai'},owned:{source:'owned'}};p.approved=true;p.render={key:'old'};const next=changeProject(p,'local-cinema',{enabled:true,options:{seed:8}});assert.equal(next.assets['scene-1'],undefined);assert.ok(next.assets.owned);assert.equal(next.approved,false);assert.equal(next.render,null);assert.equal(next.voicePreference,'none');assert.match(localCinemaMarkup(next),/사용 중/);for(const action of ['narration','metadata'])assert.throws(()=>changeProject(next,action,{}));assert.throws(()=>changeProject(next,'edit',{voice:'paid'}));});
test('duration change invalidates generated local clip',()=>{const p=project();p.assets={'scene-1':{source:'ai'}};assert.equal(changeProject(p,'scenes',{scenes:[{...scene,duration:5}]}).assets['scene-1'],undefined);});
test('worker rejects paid tasks before preflight or any network even with API keys',async()=>{for(const action of ['metadata','narration','render']){const p=project();p.task={action};if(action==='render')p.edit={voice:'paid'};let calls=0;await assert.rejects(executeStudioTask(p,{GEMINI_API_KEY:'fixture',ELEVENLABS_API_KEY:'fixture'},{},()=>{},{fetcher:()=>{calls++;},preflight:()=>{calls++;}}),/무료/);assert.equal(calls,0);}const p=project();delete p.voicePreference;p.task={action:'media'};assert.throws(()=>assertLocalTask(p));});
test('resume accepted job from disk after checkpoint loss without another submission',async()=>{const f=await fixture();let checks=0;await assert.rejects(generateLocalScene(f.job,scene,f.env,f.root,async()=>{if(++checks===2)throw Error('checkpoint lost');},{fetcher:f.fetcher}),/checkpoint lost/);delete f.job.mediaJobs;const result=await generateLocalScene(f.job,scene,f.env,f.root,async()=>{},{fetcher:f.fetcher});assert.equal(f.posts(),1);assert.equal(result.provider,'comfyui-local');assert.equal(result.generation.apiCost,0);assert.equal(result.generation.qualityVerified,false);});
test('unknown submission and failed intent checkpoint never trigger automatic resubmit',async()=>{const f=await fixture();f.setMode('lost');await assert.rejects(generateLocalScene(f.job,scene,f.env,f.root,async()=>{},{fetcher:f.fetcher}),/connection lost/);await assert.rejects(generateLocalScene(f.job,scene,f.env,f.root,async()=>{},{fetcher:f.fetcher}),/불확실/);assert.equal(f.posts(),1);const g=await fixture();await assert.rejects(generateLocalScene(g.job,scene,g.env,g.root,async()=>{throw Error('disk');},{fetcher:g.fetcher}));assert.equal(g.posts(),0);});
test('poll timeout resumes existing ID; unsafe output paths are rejected',async()=>{const f=await fixture();f.setMode('pending');let time=0;await assert.rejects(generateLocalScene(f.job,scene,f.env,f.root,async()=>{},{fetcher:f.fetcher,now:()=>time++,timeoutMs:3,sleep:async()=>{}}),/진행 중/);f.setMode('badpath');await assert.rejects(generateLocalScene(f.job,scene,f.env,f.root,async()=>{},{fetcher:f.fetcher}),/출력 파일/);assert.equal(f.posts(),1);});

test('media runner uses only local provider despite configured paid keys and persists asset',async()=>{
 const f=await fixture();let lint=0,writes=0;const checkpoints=[];
 const result=await executeStudioTask(f.job,{...f.env,GEMINI_API_KEY:'fixture',ELEVENLABS_API_KEY:'fixture',SHOPSHORTS_MEDIA_PROVIDER:'higgsfield'},{workDir:f.root,writeAsset:async(key,data,type)=>{writes++;assert.equal(type,'video/mp4');assert.ok(data.length);}},async patch=>checkpoints.push(patch),{fetcher:f.fetcher,runLintCli:async(name)=>{assert.equal(name,'@cak/shopping-shorts');lint++;return {ok:true};},preflight:async job=>assert.equal(job.voicePreference,'none'),runHiggsfield:()=>{throw Error('paid fallback');}});
 assert.equal(lint,1);assert.equal(writes,1);assert.equal(f.posts(),1);assert.equal(result.assets['scene-1'].provider,'comfyui-local');assert.ok(checkpoints.some(p=>p.mediaJobs));assert.ok(checkpoints.some(p=>p.assets));
});
test('missing workflow stops local media without paid fallback',async()=>{
 const f=await fixture();let calls=0;
 await assert.rejects(executeStudioTask(f.job,{GEMINI_API_KEY:'fixture',SHOPSHORTS_MEDIA_PROVIDER:'higgsfield'},{workDir:f.root},async()=>{},{fetcher:async()=>{calls++;},runLintCli:async()=>({ok:true}),preflight:async()=>{},runHiggsfield:()=>{calls++;}}),/워크플로가 연결되지/);assert.equal(calls,0);
});

test('missing native model input fails before queue submission',async()=>{
 const f=await fixture();let posts=0;
 await assert.rejects(generateLocalScene(f.job,scene,f.env,f.root,async()=>{},{fetcher:async(url)=>{if(url.endsWith('/prompt'))posts++;return Response.json({'CLIPTextEncode':{input:{required:{clip:['CLIP']}}}});}}),/필수 입력/);assert.equal(posts,0);
});
test('local mode cannot silently override motion templates',()=>{
 const p=project();p.scenes[0].motion={template:'test'};
 assert.throws(()=>changeProject(p,'local-cinema',{enabled:true}),/모션/);
 p.task={action:'media'};assert.throws(()=>assertLocalTask(p),/모션/);
});
