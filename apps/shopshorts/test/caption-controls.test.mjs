import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {FONTS,normalizeEdit,splitClip} from '../public/editor-model.js';
import {CAPTION_STYLES,applyCaptionStyle,deleteCaption,pasteCaption,captionExtras} from '../public/caption-style.js';
import {createProject,changeProject,validateEdit,VOICES} from '../lib/studio.js';
import {captionFilter,command} from '../studio-runner.mjs';
import {narrationFailure} from '../studio-narration.mjs';
function fixture(){
 const p=createProject({category:'심리학',topic:'작은 쉼',format:'short',duration:16});
 p.scenes=[{id:'scene-1',duration:4,kind:'image',narration:'잠시 쉬어가요.',prompt:'A calm room'}];p.approved=true;p.edit=normalizeEdit(p);
 p.edit.captions=[{id:'caption-one',clipId:'clip-1',text:'한글: 100% %{n}',startFrame:0,endFrame:120,font:'gothic',size:56,color:'#ffffff',position:'bottom',background:true}];return p;
}
test('caption delete, cut and paste preserve the last video and clamp text timing to its destination',()=>{
 const p=fixture(),e=p.edit,c=structuredClone(e.captions[0]),cut=deleteCaption(e,c.id);
 assert.equal(cut.clips.length,1);assert.equal(cut.captions.length,0);assert.equal(e.captions.length,1);
 const next=pasteCaption(cut,c,'clip-1',110,'caption-copy');assert.deepEqual([next.captions[0].startFrame,next.captions[0].endFrame],[110,120]);
 assert.deepEqual(validateEdit(next,p),next);assert.equal(next.clips.length,1);
});
test('all presets and custom coordinates survive save/reload, split and duplicate without changing text or timings',()=>{
 for(const preset of CAPTION_STYLES){const p=fixture(),c=p.edit.captions[0];p.edit.captions[0]={...applyCaptionStyle(c,preset.id),x:23,y:74};
  const saved=changeProject(p,'edit',p.edit),loaded=normalizeEdit(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(loaded,p.edit);assert.equal(loaded.captions[0].text,c.text);
  const split=splitClip(loaded,'clip-1',60,'second');assert.equal(split.captions.length,2);
  for(const t of split.captions){assert.equal(t.x,23);assert.equal(t.y,74);assert.equal(t.font,preset.font);}
  const copy=pasteCaption(loaded,loaded.captions[0],'clip-1',0,'copy');assert.equal(copy.captions[1].outlineWidth,preset.outlineWidth);
 }
});
test('optional caption fields retain legacy projects and reject malformed or injected styles',()=>{
 const p=fixture();assert.deepEqual(validateEdit(p.edit,p),p.edit);
 for(const values of [{x:-1},{y:101},{x:NaN},{y:'50'},{outlineWidth:9},{backgroundOpacity:2},{backgroundColor:"red:box=0"},{outlineColor:null}])assert.throws(()=>captionExtras(values));
 for(const voice of VOICES){const e={...p.edit,voice:voice.id};assert.equal(validateEdit(e,p).voice,voice.id);}
});
test('voice failures explain actionable causes without leaking provider data',()=>{
 for(const [raw,expected] of [['quota_exceeded secret-token','사용량'],['voice_not_found secret-token','다른 목소리'],['429 secret-token','잠시 후'],['401 secret-token','인증'],['arbitrary secret-token','선택은 유지']]){
  const message=narrationFailure(Error(raw));assert.ok(message.includes(expected));assert.ok(!message.includes('secret-token'));
 }
});
test('real FFmpeg renders every bundled Korean font and preset; custom text moves to the requested corner',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'caption-render-'));
 try{
  const text=join(dir,'text.txt');await writeFile(text,'자막 위치');
  for(const [i,font] of FONTS.entries()){
   const c={...applyCaptionStyle(fixture().edit.captions[0],CAPTION_STYLES[i%CAPTION_STYLES.length].id),font:font.id,size:32,startFrame:0,endFrame:1,x:0,y:0};
   const out=join(dir,`font-${i}.rgb`);
   await command('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=black:s=320x240', '-vf',captionFilter(c,text),'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo',out],{});
   const pixels=await readFile(out);assert.equal(pixels.length,320*240*3);assert.ok(pixels.some(n=>n>100),font.id);
  }
  const c={...fixture().edit.captions[0],background:false,outlineWidth:0,size:32,startFrame:0,endFrame:1};
  async function bounds(x,y){const out=join(dir,`pos-${x}.rgb`);await command('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=black:s=320x240','-vf',captionFilter({...c,x,y},text),'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo',out],{});const bytes=await readFile(out),xs=[],ys=[];for(let i=0;i<bytes.length;i+=3)if(bytes[i]>100){xs.push((i/3)%320);ys.push(Math.floor(i/3/320));}return {left:Math.min(...xs),top:Math.min(...ys),right:Math.max(...xs),bottom:Math.max(...ys)};}
  const a=await bounds(0,0),b=await bounds(100,100);assert.ok(a.left<10&&a.top<10);assert.ok(b.right>309&&b.bottom>229);assert.ok(b.left>a.left&&b.top>a.top);
 }finally{await rm(dir,{recursive:true,force:true});}
});
