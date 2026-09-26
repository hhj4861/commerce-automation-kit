import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,changeProject,validateEdit} from '../lib/studio.js';
import {normalizeEdit,removeSelection,removeAudioAsset,scriptCaption,deduplicateCaptions} from '../public/editor-model.js';
import {musicClips} from '../public/music-timeline.js';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {localStudioStore} from '../studio-local.mjs';
import {studioApi} from '../lib/studio-api.js';
import {executeStudioTask,command} from '../studio-runner.mjs';
function fixture(){
 const p=createProject({category:'심리학',topic:'쉼',format:'short',duration:16});
 p.scenes=[{id:'scene-1',duration:2,kind:'image',narration:'잠시 쉬어요.',prompt:'A quiet room'}];
 p.assets={'scene-1':{kind:'image'},song:{kind:'audio'},speech:{kind:'audio',purpose:'narration'}};
 p.edit=normalizeEdit(p);p.edit.voice='n2fbxG88jqAoaVPUy3IG';p.edit.music='song';
 p.edit=scriptCaption(p.edit,'clip-1','잠시 쉬어요.','text-1').edit;return p;
}
test('selected caption, audio and voice removal preserves the last video and original edit',()=>{
 const p=fixture(),e=p.edit;
 let next=removeSelection(e,{captionId:'text-1',clipId:'clip-1'});assert.equal(next.captions.length,0);assert.equal(next.clips.length,1);
 next=removeSelection(e,{audioId:'music-legacy',clipId:'clip-1'});assert.deepEqual(musicClips(next),[]);assert.equal(next.clips.length,1);
 next=removeSelection(e,{voice:true,clipId:'clip-1'});assert.equal(next.voice,'none');assert.equal(next.clips.length,1);assert.equal(next.captions.length,1);
 assert.throws(()=>removeSelection(e,{clipId:'clip-1'}),/하나 이상/);assert.equal(e.captions.length,1);assert.notEqual(e.voice,'none');
});
test('library removal survives save/reload, preserves source assets and clears legacy music',()=>{
 const p=fixture(),e=removeAudioAsset(p.edit,'song');
 assert.equal(e.music,null);assert.deepEqual(e.musicClips,[]);assert.deepEqual(e.hiddenAudioAssets,['song']);
 const saved=changeProject(p,'edit',e);assert.deepEqual(normalizeEdit(saved),e);assert.equal(saved.assets.song.kind,'audio');
 assert.deepEqual(removeAudioAsset(e,'song').hiddenAudioAssets,['song']);
 for(const hiddenAudioAssets of [null,['scene-1'],['speech'],['missing'],[{}]])assert.throws(()=>validateEdit({...e,hiddenAudioAssets},p));
});
test('script captions are idempotent across persistence, collapse legacy repeats and retain custom captions',()=>{
 const p=fixture();p.edit.captions.push({...p.edit.captions[0],id:'text-duplicate'});
 const manual={...p.edit.captions[0],id:'text-manual',text:'직접 쓴 제목'};delete manual.source;p.edit.captions.push(manual);
 let e=scriptCaption(p.edit,'clip-1','잠시 쉬어요.','unused').edit;
 assert.equal(e.captions.length,2);e=validateEdit(e,p);
 const repeated=scriptCaption(e,'clip-1','잠시 쉬어요.','another');assert.deepEqual(repeated.edit,e);assert.equal(repeated.captionId,'text-1');
 const changed=scriptCaption(e,'clip-1','새 대본','third').edit;assert.equal(changed.captions.length,2);assert.equal(changed.captions[0].text,manual.text);assert.equal(changed.captions[1].text,'새 대본');
 assert.throws(()=>scriptCaption(e,'clip-1','x'.repeat(501),'long'),/500/);
});
test('duplicate cleanup removes identical overlays only, preserving deliberate timing and styling',()=>{
 const e=fixture().edit,c=e.captions[0];
 e.captions.push({...c,id:'duplicate'},{...c,id:'style',color:'#ff0000'},{...c,id:'time',startFrame:10});
 const next=deduplicateCaptions(e);assert.deepEqual(next.captions.map(c=>c.id),['text-1','style','time']);assert.equal(e.captions.length,4);
});

test('API save/reload and real render keep repeated script caption single; deletion removes overlay', {timeout:60000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'editor-caption-render-')),store=localStudioStore(dir,{});
 try{
  let p=fixture();p.edit.voice='none';p.edit.music=null;p.approved=true;
  const source=join(dir,'source.png'),key=`studio/${p.id}/source.png`;
  await command('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=blue:s=160x90','-frames:v','1',source],{});
  await store.writeAsset(key,await readFile(source),'image/png');p.assets['scene-1']={key,kind:'image'};await store.create(p);
  const frames=[];
  for(const [index,edit] of [p.edit,scriptCaption(p.edit,'clip-1','잠시 쉬어요.','duplicate').edit,removeSelection(p.edit,{captionId:'text-1'})].entries()){
   const saved=await studioApi(new Request(`http://localhost/api/studio/${p.id}/edit`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...edit,revision:p.revision})}),{},store);
   assert.equal(saved.status,200);p=(await saved.json()).project;
   const loaded=await studioApi(new Request(`http://localhost/api/studio/${p.id}`),{},store);p=(await loaded.json()).project;
   assert.equal(p.edit.captions.length,index===2?0:1);
   const job=changeProject(p,'render',{});job.task.state='running';await executeStudioTask(job,{},store,async()=>{});
   const frame=join(dir,`frame-${index}.rgb`);
   await command('ffmpeg',['-y','-v','error','-i',join(dir,'studio-work',p.id,'final.mp4'),'-frames:v','1','-vf','scale=270:480','-f','rawvideo','-pix_fmt','rgb24',frame],{});
   frames.push(await readFile(frame));
  }
  assert.deepEqual(frames[0],frames[1]);assert.notDeepEqual(frames[0],frames[2]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
