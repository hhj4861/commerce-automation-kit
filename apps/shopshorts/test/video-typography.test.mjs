import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createProject,validateEdit,validateBrief} from '../lib/studio.js';
import {normalizeEdit,scriptCaption} from '../public/editor-model.js';
import {applyCaptionStyle,captionExtras} from '../public/caption-style.js';
import {defaultCaption,captionArtwork,typographyLines} from '../public/video-typography.js';
import {cinematicEdit} from '../lib/cinematic-production.js';
import {renderCaptionArtwork} from '../studio-typography.mjs';
import {sceneFfmpegArgs,command} from '../studio-runner.mjs';
const project=format=>{
 const p=createProject({category:'과학',topic:'배가 들어와도 무게는 그대로?',format,duration:30});
 p.scenes=[{id:'scene-1',kind:'image',duration:4,prompt:'original drawing',narration:'배가 들어오면 같은 무게의 물이 밀려납니다.'}];return p;
};
test('new short and long projects persist modern headers; saved and legacy projects are not migrated',()=>{
 for(const format of ['short','long']){
  const p=project(format),e=normalizeEdit(p);
  assert.equal(e.captions[0].presentation,'modern-header-v1');
  assert.equal(e.captions[0].endFrame,105);
  assert.deepEqual(validateEdit(e,p),e);
  e.captions=[];assert.deepEqual(normalizeEdit({...p,edit:e}),e,'deleting header stays deleted');
  delete p.brief.typography;assert.deepEqual(normalizeEdit(p).captions,[]);
 }
 const long=project('long');assert.equal(scriptCaption(normalizeEdit(long),'clip-1','새 대본','body','16:9').edit.captions[1].size,52);
 const same=project('short');same.title=same.scenes[0].narration;assert.equal(scriptCaption(normalizeEdit(same),'clip-1',same.title,'body').edit.captions[0].presentation,'modern-header-v1');
 assert.throws(()=>validateBrief({...project('short').brief,typography:'<script>'}));
});
test('manual captions and generated narration use modern defaults and retain every word',()=>{
 const p=project('short'),edit=normalizeEdit(p);edit.voice='none';
 const n=scriptCaption(edit,'clip-1','직접 넣은 대본','script').edit;
 assert.equal(n.captions[1].font,'pretendard');assert.equal(n.captions[1].outlineWidth,0);
 n.captions[1].y=25;n.captions[1].color='#abcdef';
 assert.equal(scriptCaption(n,'clip-1','새 대본','unused').edit.captions[1].y,25);
 const generated=cinematicEdit({...p,edit});
 const short=project('short');short.brief.workflow='explainer-v1';short.brief.productionStyle='animation';short.scenes[0].duration=1;short.edit=normalizeEdit(short);short.edit.voice='none';assert.doesNotThrow(()=>validateEdit(cinematicEdit(short),short));
 assert.ok(generated.captions.filter(c=>c.source==='script').every(c=>c.presentation==='modern-v1'));
 assert.equal(generated.captions.filter(c=>c.source==='script').map(c=>c.text).join('').replace(/\s/g,''),p.scenes[0].narration.replace(/\s/g,''));
 assert.deepEqual(validateEdit(generated,p),generated);
 const legacy={...p,brief:{...p.brief},edit};delete legacy.brief.typography;
 assert.ok(cinematicEdit(legacy).captions.filter(c=>c.source==='script').every(c=>!c.presentation));
 const custom={...defaultCaption(),x:12,y:23};assert.equal(applyCaptionStyle(custom,'box').presentation,undefined);
 assert.throws(()=>captionExtras({presentation:'raw-svg'}));
});
test('SVG escapes content, bounds long lines, keeps text and draws the approved palette',()=>{
 const c={...defaultCaption(),text:'<script> & "test" 한글'};
 const art=captionArtwork(c);assert.ok(art.svg.includes('&lt;script&gt;'));assert.ok(!art.svg.includes('<script>'));
 assert.ok(art.svg.includes('rx="20"'));assert.ok(art.svg.includes('#0d161d'));
 assert.equal(typographyLines('가'.repeat(40),62,880).join(''),'가'.repeat(40));
 const h=captionArtwork({...c,presentation:'modern-header-v1',text:'배가 들어와도 무게는 그대로?',size:88});
 assert.ok(h.svg.includes('#92f4e4'));assert.ok(h.svg.includes('#6ee9db'));
});
test('real portrait and landscape FFmpeg overlays retain audio, timing and new artwork',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'modern-typography-'));
 try{
  for(const format of ['short','long']){
   const p=project(format),e=normalizeEdit(p),aspect=p.brief.aspect,[w,h]=format==='short'?[1080,1920]:[1920,1080];
   const source=join(dir,`${format}.png`),vo=join(dir,'voice.wav'),out=join(dir,`${format}.mov`);
   await command('ffmpeg',['-y','-v','error','-f','lavfi','-i',`color=c=0x496b79:s=${w}x${h}`,'-frames:v','1',source],{});
   await command('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=440:duration=4','-c:a','pcm_s16le',vo],{});
   const caption={...defaultCaption(aspect),text:'물의 무게가 배의 무게를 대신해요',startFrame:30,endFrame:90};
   const arts=await Promise.all([e.captions[0],caption].map((c,i)=>renderCaptionArtwork(c,aspect,join(dir,`${format}-${i}.png`))));
   await command('ffmpeg',sceneFfmpegArgs(source,out,p.scenes[0],e,aspect,vo,4,false,e.clips[0],[],false,false,arts),{});
   const probe=JSON.parse(await command('ffprobe',['-v','error','-show_streams','-of','json',out],{}));
   assert.equal(probe.streams[0].nb_frames,'120');assert.equal(probe.streams[1].codec_name,'pcm_s16le');
   const capture=async sec=>{const file=join(dir,`${format}-${sec}.rgb`);await command('ffmpeg',['-y','-v','error','-ss',String(sec),'-i',out,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo',file],{});return readFile(file);};
   const a=await capture(.3),b=await capture(1.5),c=await capture(3.8);
   const bright=(buf,y0,y1)=>{let n=0;for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){const i=(y*w+x)*3;if(buf[i]>200&&buf[i+1]>220&&buf[i+2]>210)n++;}return n;};
   assert.ok(bright(a,0,Math.round(h*.4))>1000,'header glyphs visible');
   assert.ok(bright(b,Math.round(h*.6),h)>1000,'caption visible at its time');
   assert.equal(bright(a,Math.round(h*.6),h),0,'caption hidden before start');
   assert.equal(bright(c,0,h),0,'both overlays disappear at end');
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
