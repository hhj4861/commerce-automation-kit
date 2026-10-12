import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createProject} from '../lib/studio.js';
import {studioApi} from '../lib/studio-api.js';
import {executeStudioTask,command} from '../studio-runner.mjs';
import {runHybridCli} from '../studio-hybrid-cli.mjs';
import {cinematicEdit} from '../lib/cinematic-production.js';
import {verifyFinalVideo} from '../studio-final-qa.mjs';
import {localStudioStore} from '../studio-local.mjs';
// Synthetic tones/video are technical fixtures, never a claim of real Kyle/LLM quality.
test('actual CLI and web worker assemble identical decoded media and persist the same mandatory QA', {timeout:120000},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'pipeline-e2e-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const p=createProject({category:'과학',topic:'자료의 이동',format:'short',duration:16,productionStyle:'cinematic',workflow:'explainer-v1',voiceId:'RU7aSi6lT4uQBXMLgDxK',narrationSpeed:1});
 const narration='같은 자료를 전달합니다.';p.scenes=[{id:'scene-1',narration,prompt:'One packet moving to its destination.',duration:3,kind:'video'}];p.approved=true;
 const video=join(dir,'source.mp4'),audio=join(dir,'voice.mp3');
 await command('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=size=160x284:rate=30','-t','3','-c:v','libx264',video],{});
 await command('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=2','-c:a','libmp3lame',audio],{});
 const duration=Number(await command('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',audio],{}));
 p.assets['scene-1']={key:`studio/${p.id}/source.mp4`,type:'video/mp4',kind:'video',source:'owned'};
 p.assets['narration-scene-1']={key:`studio/${p.id}/voice.mp3`,kind:'audio',purpose:'narration',voice:p.brief.voiceId,text:narration,narrationSpeed:1,duration,alignment:{version:'whisper-words-v1',text:narration,coverage:1,phrases:[{text:narration,start:0,end:duration}]}};
 p.edit=cinematicEdit(p);
 const store=localStudioStore(join(dir,'web'),{});await store.create(p);for(const [key,file]of[[p.assets['scene-1'].key,video],[p.assets['narration-scene-1'].key,audio]])await store.writeAsset(key,await readFile(file),key.endsWith('mp4')?'video/mp4':'audio/mpeg');
 const call=async(action,project,body={},worker=false)=>{
  const r=await studioApi(new Request(`http://local/api/studio/${p.id}/${action}`,{method:'POST',headers:{origin:'http://local','content-type':'application/json'},body:JSON.stringify({revision:project.revision,taskId:project.task?.id,...body})}),{},store,{localWorker:worker});
  const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data.project;
 };
 let web=await call('render',p);web=await call('claim',web,{},true);
 const rendered=await executeStudioTask(web,{},store,async()=>{});web=await call('complete',web,{result:rendered},true);
 assert.equal(web.task.state,'done');assert.equal(web.render.verification.passed,true);assert.equal(web.upload,null);
 const assets=join(dir,'cli-assets'),work=join(dir,'cli-work'),file=join(dir,'cli.json');await writeFile(file,JSON.stringify(p));
 for(const [key,input]of[[p.assets['scene-1'].key,video],[p.assets['narration-scene-1'].key,audio]]){const dest=join(assets,key);await mkdir(dirname(dest),{recursive:true});await copyFile(input,dest);}
 const cli=await runHybridCli(['--project',file,'--action','render','--assets',assets,'--work',work]);
 const local=JSON.parse(await readFile(file));assert.equal(local.render.verification.passed,true);assert.deepEqual(local.render.verification.production,web.render.verification.production);
 const webFinal=join(dir,'web-final.mp4');await writeFile(webFinal,await store.readAsset(web.render.key,new Request('http://local')).then(r=>r.arrayBuffer()).then(Buffer.from));
 const fingerprint=path=>command('ffmpeg',['-v','error','-i',path,'-map','0','-f','framemd5','-'],{});
 assert.equal(await fingerprint(cli.video),await fingerprint(webFinal));
 // Audible background alone cannot establish semantic voice identity; human review remains explicit.
 assert.equal(web.render.verification.visualReview,'human-required');assert.equal(web.render.verification.speech.length,1);
 const broken=join(dir,'black.mp4');await command('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=black:size=1080x1920:rate=30','-f','lavfi','-i','anullsrc=r=44100:cl=stereo','-t',String(web.render.duration),'-c:v','libx264','-c:a','aac',broken],{});
 await assert.rejects(verifyFinalVideo(broken,p,dir),/검은 화면/);
 const silent=join(dir,'silent.mp4');await command('ffmpeg',['-v','error','-y','-i',webFinal,'-af','volume=0','-c:v','copy',silent],{});await assert.rejects(verifyFinalVideo(silent,p,dir),/음성이 없거나/);
 const clipped=structuredClone(p);clipped.edit.clips[0].outFrame=15;await assert.rejects(verifyFinalVideo(webFinal,clipped,dir),/길이/);
});
