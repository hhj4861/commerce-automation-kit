import {mockReview} from './helpers/editorial-review.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createProject, validateBrief, validateScenes, validateEdit, changeProject} from '../lib/studio.js';
import {scenarioBrief, scenarioResult} from '../lib/studio-scenario.js';
import {cinematicEdit, captionPhrases} from '../lib/cinematic-production.js';
import {continueAutomatic} from '../lib/studio-automatic.js';
import {sceneMediaPrompt} from '../lib/scene-media-prompt.js';
import {cameraPath} from '../public/cinematic-motion.js';
import {mediaProgress} from '../public/studio-media.js';
import {normalizeEdit, frameCount} from '../public/editor-model.js';
import {narrationId} from '../public/narration-audio.js';
import {command, executeStudioTask} from '../studio-runner.mjs';
import {localStudioStore} from '../studio-local.mjs';

const brief={category:'과학',topic:'빛을 관찰하는 방법',format:'long',duration:16,productionStyle:'cinematic'};
const scenes=[
 {id:'scene-1',kind:'image',duration:8,narration:'같은 빛인데 왜 다르게 보일까요?',prompt:'창가의 흰 종이를 가까이 관찰한다.',shot:'detail',camera:'push-in'},
 {id:'scene-2',kind:'video',duration:8,narration:'빛이 오는 방향을 바꿔요. 종이를 돌려 직접 살펴보세요.',prompt:'종이를 천천히 돌려 빛과 그림자를 비교한다.',shot:'medium',camera:'locked'},
];
function fixture(){
 const p={...createProject(brief),scenes:structuredClone(scenes),visualStyle:'따뜻한 창빛과 남색 그림자. 같은 흰 종이와 나무 책상.',automation:{version:1},approved:true,task:{id:'fixture',action:'media',state:'done'}};
 p.assets=Object.fromEntries(scenes.map(s=>[s.id,{kind:s.kind,key:`studio/${p.id}/${s.id}`} ]));
 const voice=normalizeEdit(p).voice;
 for(const s of p.scenes)p.assets[narrationId(s.id)]={key:`studio/${p.id}/${s.id}.mp3`,kind:'audio',purpose:'narration',voice,text:s.narration,duration:9};
 return p;
}

test('cinematic scenario metadata survives validation and is required only on the new profile',async()=>{
 const value={title:'같은 종이, 다른 빛',scenes,visualStyle:'따뜻한 창빛과 남색 그림자',storyArc:{hook:{sceneId:'scene-1',line:scenes[0].narration},payoff:{sceneId:'scene-2',line:'빛이 오는 방향을 바꿔요.'},ending:{sceneId:'scene-2',line:'종이를 돌려 직접 살펴보세요.'}}};
 const result=await scenarioBrief(brief,{}, {generate:async prompt=>{if(mockReview(prompt))return mockReview(prompt);assert.match(prompt,/visualStyle/);assert.match(prompt,/4~8초/);return {value};}});
 assert.equal(result.visualStyle,value.visualStyle);assert.equal(result.scenes[0].camera,'push-in');
 assert.throws(()=>scenarioResult({...value,visualStyle:undefined},brief),/공통 연출/);
 assert.throws(()=>scenarioResult({...value,scenes:scenes.map(s=>({...s,camera:undefined}))},brief),/공통 연출/);
 assert.doesNotThrow(()=>scenarioResult({...value,visualStyle:undefined},{...brief,productionStyle:undefined}));
 assert.throws(()=>validateBrief({...brief,productionStyle:'unknown'}));
 assert.throws(()=>validateScenes([{...scenes[0],camera:"push-in;movie=secret"}]));
 const p=fixture();assert.match(sceneMediaPrompt(p,p.scenes[1]),/따뜻한 창빛/);assert.match(sceneMediaPrompt(p,p.scenes[1]),/previousScene/);
});

test('measured narration sets cut length; captions are short, bounded and preserved by edit serialization',()=>{
 const p=fixture(),next=continueAutomatic(p);
 assert.equal(next.task.action,'render');assert.equal(next.edit.clips[0].outFrame,276);
 assert.equal(frameCount(next.edit),552);assert.equal(p.edit,null);
 for(const c of next.edit.captions){assert.ok(c.endFrame<=270);assert.ok(c.endFrame>c.startFrame);assert.ok(c.text.split('\n').length<=2);assert.ok(c.text.split('\n').every(line=>Array.from(line).length<=32));}
 assert.deepEqual(validateEdit(next.edit,next),next.edit);
 const custom=structuredClone(next.edit);custom.clips[0].outFrame=300;custom.voice='none';custom.captions=[];
 assert.deepEqual(continueAutomatic({...p,edit:custom}).edit,custom);
 for(const missing of [undefined,{duration:NaN},{duration:31}]){
   const bad=fixture();const id=narrationId('scene-1');if(missing)Object.assign(bad.assets[id],missing);else delete bad.assets[id];
   assert.throws(()=>continueAutomatic(bad),/음성/);
 }
 const stale=fixture();stale.assets[narrationId('scene-1')].text='이전 대본';assert.throws(()=>cinematicEdit(stale),/음성/);
});

test('wrapping preserves Korean, English and emoji content with no more than two safe lines',()=>{
 for(const text of ['작은 방이라도 빛의 방향에 따라 느낌이 달라져요. 창을 바라보며 비교해 볼까요?', 'x'.repeat(110)+' 😀 끝.', '한\n\n문장, 또 하나의 문장입니다!']) {
   const phrases=captionPhrases(text,18);
   assert.equal(phrases.join('').replace(/\s/gu,''),text.replace(/\s/gu,''));
   assert.ok(phrases.every(p=>p.split('\n').length<=2&&p.split('\n').every(l=>Array.from(l).length<=18)));
 }
});

test('camera paths remain bounded and media completion describes the audio preparation phase',()=>{
 for(const camera of ['locked','push-in','pull-out','pan-left','pan-right'])for(const f of [-1,0,30,1000]){
   const p=cameraPath(camera,f,60);assert.ok(p.zoom>=1&&p.zoom<=1.06);assert.ok(p.x>=0&&p.x<=1);
 }
 assert.equal(cameraPath('push-in',59,60).zoom,1.06);
 const project=fixture();project.task.state='running';
 const status=mediaProgress({project,config:{execution:'local'}});assert.equal(status.kind,'running');assert.match(status.title,/목소리와 자막/);
 const updated=changeProject({...project,task:null},'scenes',{scenes:project.scenes.map((s,i)=>i? s:{...s,shot:'wide'})});
 assert.equal(updated.assets['scene-1'],undefined);assert.ok(updated.assets['scene-2']);
});

test('real automatic pipeline caches measured speech, renders camera motion, holds short video and retains speech endings',{timeout:120000},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'cak-cinema-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=localStudioStore(dir,{});let p=fixture();
 p.scenes=p.scenes.map(s=>({...s,duration:2}));p.assets=Object.fromEntries(Object.entries(p.assets).filter(([key])=>!key.startsWith('narration-')));
 for(const s of p.scenes){
   const file=join(dir,s.id+(s.kind==='image'?'.png':'.mp4'));
   await command('ffmpeg',['-y','-v','error','-f','lavfi','-i','testsrc2=s=320x180:r=30',...(s.kind==='image'?['-frames:v','1']:['-t','0.5','-c:v','libx264']),file],{});
   await store.writeAsset(p.assets[s.id].key,await readFile(file),s.kind==='image'?'image/png':'video/mp4');
 }
 let generated=0;
 const runCli=async(workspace,args)=>{assert.equal(workspace,'@cak/tts-narration');generated++;await command('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=660:duration=2.6',args[args.indexOf('--out')+1]],{});return {};};
 const checkpoints=[];
 const assets=await executeStudioTask(p,{ELEVENLABS_API_KEY:'fixture-only'},store,async delta=>checkpoints.push(delta),{runCli});
 assert.equal(generated,2);assert.equal(checkpoints.length,2);Object.assign(p,assets);
 await executeStudioTask(p,{},store,async()=>{},{runCli});assert.equal(generated,2,'retry reuses both speech assets');
 const tooLong=structuredClone(p);tooLong.assets[narrationId('scene-1')].duration=31;
 await assert.rejects(executeStudioTask(tooLong,{},store,async()=>{},{runCli}),/대본을 나누거나 줄여/);
 p=continueAutomatic(p);const result=await executeStudioTask(p,{},store,async()=>{});
 const final=join(dir,'studio-work',p.id,'final.mp4');
 const probe=JSON.parse(await command('ffprobe',['-v','error','-show_streams','-of','json',final],{}));
 const video=probe.streams.find(s=>s.codec_type==='video');assert.equal(video.width,1920);assert.equal(video.height,1080);assert.equal(Number(video.nb_frames),frameCount(p.edit));assert.equal(result.render.duration,frameCount(p.edit)/30);
 const raw=join(dir,'frames.rgb');await command('ffmpeg',['-y','-v','error','-i',final,'-vf','fps=5,scale=96:54','-pix_fmt','rgb24','-f','rawvideo',raw],{});
 const pixels=await readFile(raw),size=96*54*3;
 const difference=(a,b)=>{let sum=0;const region=96*32*3;for(let i=0;i<region;i++)sum+=Math.abs(pixels[a*size+i]-pixels[b*size+i]);return sum/region; // Compare media above the timed subtitle, which deliberately disappears.
 };
 assert.ok(difference(0,8)>1,'image camera visibly moves');
 const last=Math.floor(pixels.length/size)-1;assert.ok(difference(last-1,last)<2,'short video holds its last frame instead of looping');
 const audio=join(dir,'speech.raw');await command('ffmpeg',['-y','-v','error','-i',final,'-vn','-ac','1','-ar','44100','-f','f32le',audio],{});
 const bytes=await readFile(audio),samples=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4);
 const rms=at=>{const slice=samples.subarray(Math.round(at*44100),Math.round((at+.05)*44100));return Math.sqrt(slice.reduce((sum,v)=>sum+v*v,0)/slice.length);};
 assert.ok(rms(2.45)>.03,'speech past the original two-second cut remains audible');
 assert.ok(rms(p.edit.clips[0].outFrame/30+2.45)>.03,'second speech ending also survives');
});
