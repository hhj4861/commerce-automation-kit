import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { localStudioStore, startLocalStudio } from '../studio-local.mjs';
import { createProject, changeProject } from '../lib/studio.js';
import { executeStudioTask, command } from '../studio-runner.mjs';

test('local persistence supports CAS, partial media and byte-range streaming',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-store-'));
 try{const store=localStudioStore(dir,{}),p=createProject({category:'건축학',topic:'작은 집',format:'long',duration:120});await store.create(p);assert.equal(await store.cas({...p,revision:1},0),true);assert.equal(await store.cas({...p,revision:2},0),false);await store.writeAsset(`studio/${p.id}/test.mp4`,Buffer.from('0123456789'),'video/mp4');const response=await store.readAsset(`studio/${p.id}/test.mp4`,new Request('http://local',{headers:{range:'bytes=2-5'}}));assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),'bytes 2-5/10');assert.equal(await response.text(),'2345');assert.equal((await store.readAsset(`studio/${p.id}/test.mp4`,new Request('http://local',{headers:{range:'bytes=-3'}}))).status,206);await assert.rejects(store.readAsset('../secret'));}finally{await rm(dir,{recursive:true,force:true});}
});
test('local runner claims once, persists checkpoints and restart makes interrupted work explicit',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-queue-'));const store=localStudioStore(dir,{});let calls=0;
 const runner=startLocalStudio(store,{},async(job,env,io,checkpoint)=>{calls++;await checkpoint({title:'checkpoint'});return{title:'done'};});runner.stop();
 try{const p=changeProject(createProject({category:'심리학',topic:'일상',format:'short',duration:24}),'scenario',{confirm:true});await store.create(p);await Promise.all([runner.tick(),runner.tick()]);assert.equal(calls,1);assert.equal((await store.get(p.id)).task.state,'done');const fresh=await store.get(p.id);await store.cas({...fresh,revision:fresh.revision+1,task:{...fresh.task,state:'running'}},fresh.revision);await runner.recover();assert.equal((await store.get(p.id)).task.state,'failed');}finally{await rm(dir,{recursive:true,force:true});}
});
test('real ffmpeg assembles ordered mixed image/video plus BGM into landscape final', {timeout:60000}, async()=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-render-'));const store=localStudioStore(dir,{});
 try{
  const image=join(dir,'image.png'),video=join(dir,'video.mp4'),music=join(dir,'tone.wav');
  await command('ffmpeg',['-y','-loglevel','error','-f','lavfi','-i','color=c=blue:s=160x90','-frames:v','1',image],{});
  await command('ffmpeg',['-y','-loglevel','error','-f','lavfi','-i','color=c=red:s=160x90:r=30','-t','1','-c:v','libx264',video],{});
  await command('ffmpeg',['-y','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=1',music],{});
  let p=createProject({category:'건축학',topic:'작은 집',format:'long',duration:16});
  p=changeProject(p,'scenes',{scenes:[{id:'scene-1',narration:'집을 살펴봐요.',prompt:'An original blue house.',duration:1,kind:'image'},{id:'scene-2',narration:'공간을 나눠요.',prompt:'An original red room.',duration:1,kind:'video'}]});p.approved=true;
  for(const [id,file,kind,type] of [['scene-1',image,'image','image/png'],['scene-2',video,'video','video/mp4'],['music',music,'audio','audio/wav']]){const key=`studio/${p.id}/${id}`;await store.writeAsset(key,await readFile(file),type);p.assets[id]={key,kind,type};}
  p=changeProject(p,'edit',{order:['scene-2','scene-1'],durations:{'scene-1':1,'scene-2':1},voice:'none',music:'music',musicVolume:.1});p=changeProject(p,'render',{});p.task.state='running';
  const result=await executeStudioTask(p,{},store,async()=>{});assert.equal(result.render.duration,2);
  const final=join(dir,'studio-work',p.id,'final.mp4');
  const probe=JSON.parse(await command('ffprobe',['-v','error','-show_streams','-show_format','-of','json',final],{}));
  const v=probe.streams.find(s=>s.codec_type==='video');assert.equal(v.width,1920);assert.equal(v.height,1080);assert.ok(probe.streams.some(s=>s.codec_type==='audio'));assert.ok(Math.abs(Number(probe.format.duration)-2)<.2);
  const pixels=await command('ffmpeg',['-v','error','-i',final,'-frames:v','1','-vf','scale=1:1','-f','rawvideo','-pix_fmt','rgb24','-'],{});
  assert.ok(pixels.length>0);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('image generation checkpoints assets and publish records intent before mocked upload',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-provider-')), store=localStudioStore(dir,{});
 try{
  let p=createProject({category:'건축학',topic:'작은 집',format:'long',duration:16});
  p=changeProject(p,'scenes',{scenes:[{id:'scene-1',narration:'공간을 나눠 보세요.',prompt:'An original small blue house.',duration:8,kind:'image'}]});
  p=changeProject(p,'media',{approved:true});p.task.state='running';
  let checkpoints=[];
  const media=await executeStudioTask(p,{GEMINI_API_KEY:'fixture'},store,async delta=>checkpoints.push(delta),{fetcher:async()=>Response.json({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:Buffer.from('fixture-image').toString('base64')}}]}}]})});
  assert.equal(checkpoints.length,1);assert.equal(media.assets['scene-1'].source,'ai');
  p.assets=media.assets;p.task.state='done';p.edit={order:['scene-1'],durations:{'scene-1':8},voice:'none',music:null,musicVolume:0};
  const key=`studio/${p.id}/final.mp4`;await store.writeAsset(key,Buffer.from('mock-only'),'video/mp4');p.render={key};
  p=changeProject(p,'publish',{reviewed:true,platforms:['youtube'],privacy:'private',title:'작은 집',description:'공간 이야기'});p.task.state='running';checkpoints=[];
  await assert.rejects(executeStudioTask(p,{},store,async delta=>checkpoints.push(delta)),/계정을 먼저/);assert.equal(checkpoints.length,0);
  const result=await executeStudioTask(p,{YOUTUBE_CLIENT_SECRET:'fixture'},store,async delta=>checkpoints.push(delta),{runCli:async(workspace,args)=>{assert.equal(checkpoints[0].upload.state,'submitting');assert.ok(args.includes('--synthetic-media'));assert.equal(args[args.indexOf('--privacy')+1],'private');return{ok:true,videoId:'test-id'};}});
  assert.equal(result.upload.state,'done');assert.equal(result.upload.results[0].url,'https://www.youtube.com/watch?v=test-id');
 }finally{await rm(dir,{recursive:true,force:true});}
});
