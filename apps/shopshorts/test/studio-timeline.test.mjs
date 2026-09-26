import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createProject,changeProject,validateEdit} from '../lib/studio.js';
import {normalizeEdit,moveClip,reorderClip,splitClip,copyClip,pasteClip,clipAt,frameCount,clipSpans,trimClip} from '../public/editor-model.js';
import {musicClips,splitMusic,musicGain,createMusicPlayback} from '../public/music-timeline.js';
import {localStudioStore} from '../studio-local.mjs';
import {executeStudioTask,command} from '../studio-runner.mjs';

function fixture(){
 const p=createProject({category:'건축학',topic:'시간과 공간',format:'short',duration:16});
 p.scenes=[1,2].map(i=>({id:`scene-${i}`,narration:'공간을 살펴봐요.',prompt:'An original room',duration:1,kind:'image'}));
 p.approved=true;p.assets={'scene-1':{kind:'image'},'scene-2':{kind:'image'},music:{kind:'audio'},speech:{kind:'audio',purpose:'narration'}};
 p.edit=normalizeEdit(p);p.edit.voice='none';return p;
}
const audio=(extra={})=>({id:'bgm',assetId:'music',startFrame:30,inFrame:15,outFrame:75,volume:.5,fadeInFrames:15,fadeOutFrames:15,...extra});

test('explicit positions preserve gaps, split source offsets and insert with ripple; reorder closes gaps',()=>{
 let e=moveClip(fixture().edit,'clip-2',90);assert.equal(frameCount(e),120);assert.equal(clipAt(e,30),null);assert.equal(clipAt(e,90).clip.id,'clip-2');
 e=splitClip(e,'clip-2',10,'part');assert.deepEqual(clipSpans(e).map(s=>[s.start,s.end]),[[0,30],[90,100],[100,120]]);
 e=pasteClip(e,copyClip(e,'part'),'clip-1','copy');assert.deepEqual(clipSpans(e).map(s=>[s.start,s.end]),[[0,30],[30,50],[110,120],[120,140]]);
 const reordered=reorderClip(e,'part',0);assert.equal(frameCount(reordered),80);assert.deepEqual(reordered.clips.map(c=>c.id),['part','clip-1','copy','clip-2']);
 assert.throws(()=>moveClip(e,'part',10),/겹칩니다/);
});

test('timeline serialization accepts independent music positions and rejects invalid intervals',()=>{
 const p=fixture(),e=moveClip(p.edit,'clip-2',60);e.musicClips=[audio()];
 assert.deepEqual(validateEdit(e,p),e);assert.equal(frameCount(e),90);
 const invalid=[n=>n.clips[1].startFrame=10,n=>n.clips[1].startFrame=.5,n=>n.clips[1].startFrame=null,n=>n.musicClips=null,n=>n.musicClips[0]=null,n=>n.musicClips[0].id=null,n=>delete n.musicClips[0].id,n=>n.musicClips[0].startFrame=-1,n=>n.musicClips[0].outFrame=15,n=>n.musicClips[0].volume=NaN,n=>n.musicClips[0].volume=2,n=>n.musicClips[0].fadeInFrames=61,n=>n.musicClips[0].assetId='speech',n=>n.musicClips[0].assetId='scene-1',n=>n.musicClips[0].id='../bad',n=>n.musicClips.push({...n.musicClips[0]}),n=>n.musicClips[0].startFrame=5400];
 for(const mutate of invalid){const n=structuredClone(e);mutate(n);assert.throws(()=>validateEdit(n,p));}
 const saved=changeProject(p,'edit',e);assert.deepEqual(normalizeEdit(saved),e);
});

test('legacy full-length music stays compatible; explicit deletion never revives it',()=>{
 const e=fixture().edit;e.music='music';e.musicVolume=.2;
 assert.deepEqual(musicClips(e).map(c=>[c.startFrame,c.outFrame,c.volume]),[[0,60,.2]]);
 e.musicClips=[];assert.deepEqual(musicClips(e),[]);
});

test('audio split keeps source continuity and outer fades, gains are zero outside the clip',()=>{
 const e=fixture().edit;e.musicClips=[audio()];const split=splitMusic(e,'bgm',60,'right');
 assert.deepEqual(split.musicClips.map(c=>[c.startFrame,c.inFrame,c.outFrame,c.fadeInFrames,c.fadeOutFrames]),[[30,15,45,15,0],[60,45,75,0,15]]);
 assert.deepEqual([29,30,45,60,75,89,90].map(f=>Number(musicGain(audio(),f).toFixed(3))),[0,0,.5,.5,.5,.033,0]);
 for(const f of [30,90,30.5])assert.throws(()=>splitMusic(e,'bgm',f,'bad'));
});

test('browser music seeks source offset, fades and silences gaps, stops pending loads',async()=>{
 const players=[],errors=[];
 const playback=createMusicPlayback(()=>{const a={paused:true,currentTime:0,duration:4,volume:1,play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;},removeAttribute(){},load(){}};players.push(a);return a;},id=>'/asset/'+id,e=>errors.push(e));
 playback.sync([audio()],29,true);assert.equal(players.length,0);
 playback.sync([audio()],45,true);assert.equal(players[0].currentTime,1);assert.equal(players[0].volume,.5);assert.equal(players[0].paused,false);
 playback.sync([audio()],89,true);assert.ok(players[0].volume<.04);
 playback.sync([audio()],90,true);assert.equal(players[0].paused,true);
 playback.sync([audio()],50,true);playback.stop();players[0].onloadedmetadata();assert.equal(players[0].paused,true);
 playback.destroy();assert.deepEqual(errors,[]);
});

test('real render has exact video gaps plus delayed, trimmed, fading and overlapping 48kHz music', {timeout:90000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-timeline-render-')),store=localStudioStore(dir,{});
 try{
  let p=fixture();
  for(const [i,color] of ['blue','red'].entries()){
   const id=`scene-${i+1}`,file=join(dir,id+'.png'),key=`studio/${p.id}/${id}`;
   await command('ffmpeg',['-y','-v','error','-f','lavfi','-i',`color=${color}:s=160x90`,'-frames:v','1',file],{});
   await store.writeAsset(key,await readFile(file),'image/png');p.assets[id]={key,kind:'image',type:'image/png'};
  }
  const file=join(dir,'tone.wav'),key=`studio/${p.id}/music`;
  await command('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2','-af','adelay=500:all=1',file],{});
  await store.writeAsset(key,await readFile(file),'audio/wav');p.assets.music={key,kind:'audio',type:'audio/wav'};
  let e=moveClip(p.edit,'clip-2',90);
  e.musicClips=[audio({outFrame:45}),audio({id:'second',startFrame:90,outFrame:45,fadeInFrames:0,fadeOutFrames:0}),audio({id:'overlap',startFrame:105,outFrame:45,fadeInFrames:0,fadeOutFrames:0}),audio({id:'tail',startFrame:149,outFrame:16,volume:0,fadeInFrames:0,fadeOutFrames:0})];
  p=changeProject(p,'edit',e);p=changeProject(p,'render',{});p.task.state='running';
  const result=await executeStudioTask(p,{},store,async()=>{});assert.equal(result.render.duration,5);
  const final=join(dir,'studio-work',p.id,'final.mp4'),raw=join(dir,'audio.raw');
  const probe=JSON.parse(await command('ffprobe',['-v','error','-show_streams','-of','json',final],{}));assert.equal(Number(probe.streams.find(s=>s.codec_type==='video').nb_frames),150);
  await command('ffmpeg',['-y','-v','error','-i',final,'-vn','-ac','1','-ar','44100','-f','f32le',raw],{});
  const bytes=await readFile(raw),samples=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4);
  function rms(time){const part=samples.subarray(Math.round(time*44100),Math.round((time+.06)*44100));return Math.sqrt(part.reduce((sum,x)=>sum+x*x,0)/part.length);}
  for(const t of [.3,.8,2.2,2.8,4.65])assert.ok(rms(t)<.002,`silence at ${t}: ${rms(t)}`);
  assert.ok(rms(1.4)>.02,'trim skips the source silence');assert.ok(rms(1.07)<rms(1.4)*.5,'fade in');assert.ok(rms(1.88)<rms(1.4)*.5,'fade out');assert.ok(rms(3.55)>.02,'overlap audible');
  for(const [f,color] of [[0,'blue'],[29,'blue'],[30,'black'],[89,'black'],[90,'red'],[119,'red'],[120,'black'],[149,'black']]){
   const pixel=join(dir,`pixel-${f}.raw`);await command('ffmpeg',['-y','-v','error','-i',final,'-vf',`select=eq(n\\,${f}),crop=100:100,scale=1:1`,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24',pixel],{});const b=await readFile(pixel);
   if(color==='black')assert.ok(b[0]<10&&b[1]<10&&b[2]<10,`black gap at frame ${f}`);else assert.ok(color==='blue'?b[2]>200:b[0]>200,`${color} at frame ${f}`);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
