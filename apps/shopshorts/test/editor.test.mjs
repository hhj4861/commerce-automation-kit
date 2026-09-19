import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEdit, frameCount, clipAt, splitClip, copyClip, pasteClip, removeClip, trimClip} from '../public/editor-model.js';
import {createProject, changeProject, validateEdit} from '../lib/studio.js';
import {captionFilter} from '../studio-runner.mjs';

function project() {
 const p=createProject({category:'건축학',topic:'공간',format:'short',duration:16});
 p.scenes=[{id:'scene-1',duration:2,kind:'image',narration:'공간',prompt:'A room'},{id:'scene-2',duration:3,kind:'video',narration:'구조',prompt:'A house'}];
 p.approved=true;p.assets={'scene-1':{kind:'image'},music:{kind:'audio'}};
 return p;
}
const caption=(clipId)=>({id:'text-1',clipId,text:'자막: 100% %{n}',startFrame:10,endFrame:50,font:'gothic',size:56,color:'#ffffff',position:'bottom',background:true});
test('legacy edits retain order/duration/music and normalize without mutating originals',()=>{
 const p=project();p.edit={order:['scene-2','scene-1'],durations:{'scene-1':1.5,'scene-2':2},voice:'none',music:'music',musicVolume:.2};
 const e=normalizeEdit(p);assert.deepEqual(e.clips.map(c=>[c.sceneId,c.outFrame]),[['scene-2',60],['scene-1',45]]);assert.equal(frameCount(e),105);assert.equal(e.music,'music');
 assert.equal(clipAt(e,59).local,59);assert.equal(clipAt(e,60).clip.sceneId,'scene-1');assert.equal(clipAt(e,105),null);
 p.edit=e;normalizeEdit(p).clips[0].inFrame=3;assert.equal(e.clips[0].inFrame,0);
});
test('split preserves exact source frames and rebases captions across the cut',()=>{
 const e=normalizeEdit(project());e.captions=[caption('clip-1')];
 const next=splitClip(e,'clip-1',30,'split');assert.equal(frameCount(next),150);assert.deepEqual(next.clips.slice(0,2).map(c=>[c.inFrame,c.outFrame]),[[0,30],[30,60]]);
 assert.deepEqual(next.captions.map(c=>[c.clipId,c.startFrame,c.endFrame]),[['clip-1',10,30],['split',0,20]]);
 assert.deepEqual(e.captions,[caption('clip-1')]);for(const f of [0,60,1.5,NaN])assert.throws(()=>splitClip(e,'clip-1',f,'bad'));
});
test('copy/paste duplicates clip and captions with new IDs; cut/delete removes linked captions',()=>{
 const e=normalizeEdit(project());e.captions=[caption('clip-1')];const data=copyClip(e,'clip-1');
 const cut=removeClip(e,'clip-1');assert.equal(cut.captions.length,0);
 const pasted=pasteClip(cut,data,'clip-2','copy');assert.deepEqual(pasted.clips.map(c=>c.id),['clip-2','copy']);assert.equal(pasted.captions[0].clipId,'copy');assert.notEqual(pasted.captions[0].id,'text-1');assert.equal(pasted.captions[0].text,e.captions[0].text);
 assert.deepEqual(validateEdit(pasted,project()),pasted);
});
test('trimming clips captions to the surviving source interval',()=>{
 const e=normalizeEdit(project());e.captions=[caption('clip-1')];
 const n=trimClip(e,'clip-1',20,40);assert.deepEqual([n.captions[0].startFrame,n.captions[0].endFrame],[0,20]);assert.equal(frameCount(n),110);
 assert.equal(trimClip(e,'clip-1',50,60).captions.length,0);for(const [a,b] of [[5,5],[-1,2],[0,901],[.5,2]])assert.throws(()=>trimClip(e,'clip-1',a,b));
});
test('timeline API rejects malformed ranges, identities, fonts and captions',()=>{
 const p=project(),e=normalizeEdit(p);e.captions=[caption('clip-1')];assert.deepEqual(validateEdit(e,p),e);
 const invalid=[n=>n.clips=[],n=>n.fps=24,n=>n.clips[0].inFrame=.1,n=>n.clips[0].outFrame=0,n=>n.clips[0].outFrame=901,n=>n.clips[0].sceneId='missing',n=>n.clips[0].id='../file',n=>n.clips[1].id=n.clips[0].id,n=>n.music='scene-1',n=>n.musicVolume=NaN,n=>n.voice='bad',n=>n.captions[0].font='../font.ttf',n=>n.captions[0].endFrame=61,n=>n.captions[0].text='',n=>n.captions[0].text='\u0000',n=>n.captions[0].color='red:evil=1',n=>n.captions[0].size=121,n=>n.captions[0].clipId='missing',n=>n.captions.push({...n.captions[0]})];
 for(const mutate of invalid){const n=structuredClone(e);mutate(n);assert.throws(()=>validateEdit(n,p));}
 const huge=structuredClone(e);huge.clips=Array.from({length:7},(_,i)=>({id:`clip-${i}`,sceneId:'scene-1',inFrame:0,outFrame:900}));assert.throws(()=>validateEdit(huge,p),/최대 길이/);
});
test('render accepts a subset, invalidates stale renders, and requires every referenced asset',()=>{
 const p=project();p.render={key:'old'};let e=normalizeEdit(p);e=removeClip(e,'clip-2');
 const edited=changeProject(p,'edit',e);assert.equal(edited.render,null);assert.equal(changeProject(edited,'render',{}).task.state,'queued');
 assert.throws(()=>changeProject({...edited,approved:false},'render',{}));assert.throws(()=>changeProject({...edited,assets:{}},'render',{}));
});
test('caption text is not interpolated into ffmpeg filter and font is allowlisted',()=>{
 const c=caption('clip-1'),filter=captionFilter(c,'/tmp/caption.txt');assert.ok(filter.includes('expansion=none'));assert.ok(filter.includes('gte(n,10)*lt(n,50)'));assert.ok(!filter.includes(c.text));assert.throws(()=>captionFilter({...c,font:'../x'},'/tmp/caption.txt'));
});
