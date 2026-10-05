import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fortuneProject,fortuneEdit} from '../lib/fortune.js';
import {executeStudioTask,command} from '../studio-runner.mjs';
test('fortune renders six story panels with Korean captions to real MP4 and excludes its reference sheet',{timeout:120000},async t=>{
 const work=await mkdtemp(join(tmpdir(),'fortune-render-'));t.after(()=>rm(work,{recursive:true,force:true}));
 const p=await fortuneProject({profile:{name:'민준',age:15,gender:'남성',hair:'검정 짧은 머리',clothes:'교복',life:'auto',setting:'auto'},date:'2026-10-04',output:'motion',fortune:{theme:'focus',source:'example'}},'test-owner');p.approved=true;
 const png=join(work,'panel.png');await command('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=white:s=360x640','-frames:v','1',png],{});const data=await readFile(png),files=new Map();
 for(const s of p.scenes){p.assets[s.id]={key:s.id,kind:'image',type:'image/png'};files.set(s.id,data)}
 p.edit=fortuneEdit(p);p.task={id:'render-fixture',action:'render',state:'running'};
 const readKeys=[];const result=await executeStudioTask(p,{}, {workDir:work,readAsset:async key=>{readKeys.push(key);return files.get(key)},writeAsset:async(key,data)=>files.set(key,data)},async()=>{});
 assert.ok(!readKeys.includes(p.fortune.referenceSceneId));assert.equal(result.render.duration,36);assert.ok(files.get(result.render.key).length>1000);const final=join(work,'output.mp4');await writeFile(final,files.get(result.render.key));
 const probe=JSON.parse(await command('ffprobe',['-v','error','-show_entries','stream=codec_type,width,height:format=duration','-of','json',final],{}));const video=probe.streams.find(s=>s.codec_type==='video');assert.equal(video.width,1080);assert.equal(video.height,1920);assert.ok(Math.abs(Number(probe.format.duration)-36)<.2);
});
