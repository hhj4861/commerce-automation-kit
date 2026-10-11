import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthoredProject} from '../lib/authored-project.js';
import {RECIPE_ID,authoredSpec} from '../public/authored-recipes.js';
import {hybridPlan} from '../public/hybrid-plan.js';
import {validateScenes,validateEdit} from '../lib/studio.js';
import {studioApi} from '../lib/studio-api.js';
import {checkWebtoonReview,prepareWebtoon} from '../studio-webtoon.mjs';
import {cinematicEdit} from '../lib/cinematic-production.js';
import {openingCarry} from '../studio-authored-timeline.mjs';
import {clipSpans,FPS,frameCount} from '../public/editor-model.js';
import {captionArtwork} from '../public/video-typography.js';
const make=()=>createAuthoredProject(RECIPE_ID);
test('web endpoint creates the same reviewed plan as CLI factory, without approval or generation',async()=>{
 let saved;const response=await studioApi(new Request('https://studio.test/api/studio/recipes',{method:'POST',headers:{origin:'https://studio.test','content-type':'application/json'},body:JSON.stringify({id:RECIPE_ID})}),{}, {create:async p=>{saved=p;}});
 assert.equal(response.status,201);assert.equal(saved.approved,false);assert.equal(saved.task,null);assert.equal(saved.render,null);assert.deepEqual(saved.assets,{});assert.deepEqual(saved.scenes,make().scenes);assert.deepEqual(hybridPlan(saved),hybridPlan(make()));await checkWebtoonReview(saved);
 assert.equal(saved.brief.typography,'modern-v1');assert.equal(saved.brief.voiceId,'RU7aSi6lT4uQBXMLgDxK');assert.equal(saved.research.facts.length,2);
});
test('cross-origin and unknown executable recipe requests fail before creating a project',async()=>{
 let calls=0;const store={create:async()=>calls++};
 for(const [origin,id,status] of [['https://evil.test',RECIPE_ID,403],['https://studio.test','../../run.py',400]]){
  const r=await studioApi(new Request('https://studio.test/api/studio/recipes',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({id})}),{},store);assert.equal(r.status,status);
 }assert.equal(calls,0);
});
test('allowlist rejects custom code, altered scripts, missing or mismatched shot IDs',()=>{
 const p=make(),s=p.scenes[1];
 for(const spec of [{id:RECIPE_ID,shot:'../escape'}, {...s.hybrid.authored,path:'/tmp/code.py'}, {...s.hybrid.authored,source:'print(1)'}])assert.throws(()=>authoredSpec(spec,s));
 for(const patch of [{id:'load'},{narration:'임의의 다른 설명'},{prompt:'다른 건물을 보여줘'}])assert.throws(()=>validateScenes([{...s,...patch}]));
 assert.deepEqual(validateScenes(p.scenes),p.scenes);
 for(const brief of [{...p.brief,category:'심리학'},{...p.brief,aspect:'16:9'}])assert.throws(()=>hybridPlan({...p,brief}));
 assert.throws(()=>createAuthoredProject('unknown'));
});
test('missing or stale review stops before runtime, prices and rendering',async()=>{
 for(const change of [p=>p.depthReview=null,p=>p.brief.direction+=' changed']){
  const p=make();change(p);p.task={action:'media'};let calls=0;
  await assert.rejects(prepareWebtoon(p,{},'/unused',{},async()=>{},{blenderReady:async()=>calls++,run:async()=>calls++,renderHybrid:async()=>calls++}),/대본/);assert.equal(calls,0);
 }
});
test('owned opening has no additional provider cost and body still uses authored Blender',async()=>{
 const p=make();p.assets.hook={key:'owned-opening',source:'owned'};p.task={action:'media'};let paid=0,rendered=0;
 const plan=hybridPlan(p);assert.deepEqual(plan.scenes.map(s=>s.renderer),['higgsfield','3d','3d','3d','3d','3d']);
 const engine=await prepareWebtoon(p,{},'/unused',{},async()=>{},{blenderReady:async()=>true,run:async()=>{paid++;throw Error('Unexpected provider call');},renderHybrid:async(j,s,w,e,r)=>{assert.equal(r,'3d');assert.equal(s.hybrid.authored.id,RECIPE_ID);rendered++;return {data:Buffer.from('contract fixture'),type:'video/mp4'};}});
 await engine.scene(p.scenes[1],7);assert.equal(paid,0);assert.equal(rendered,1);
});
function withAudio(){const p=make();const durations=[3.14,6.67,7.14,8,7.06,6.68];for(const [i,s]of p.scenes.entries())p.assets['narration-'+s.id]={key:s.id,kind:'audio',purpose:'narration',voice:p.brief.voiceId,text:s.narration,narrationSpeed:1.1,duration:durations[i]};return p;}
test('measured timeline carries the six-second opening across speech and preserves complete captions and ending',()=>{
 const p=withAudio(),edit=validateEdit(cinematicEdit(p),p),spans=clipSpans(edit);
 assert.ok(spans[0].end/FPS<3.5);const carry=openingCarry(p,edit,edit.clips[1]);assert.equal(carry.offset,spans[1].start/FPS);assert.equal(carry.offset+carry.duration,6);
 assert.ok(frameCount(edit)/FPS<45);
 for(const clip of edit.clips){const scene=p.scenes.find(s=>s.id===clip.sceneId);const captions=edit.captions.filter(c=>c.clipId===clip.id&&c.source==='script'&&c.id!=='authored-concept-label');assert.equal(captions.map(c=>c.text).join('').replace(/\s/gu,''),scene.narration.replace(/\s/gu,''));for(const c of captions){assert.ok(c.startFrame>=0&&c.endFrame<=clip.outFrame);assert.ok(captionArtwork(c).height<=192);}}
 const last=edit.clips.at(-1);assert.ok(last.outFrame/FPS-p.assets['narration-ending'].duration>=1.5);assert.ok(edit.captions.find(c=>c.id==='authored-concept-label'));
 const header=edit.captions.find(c=>c.presentation==='modern-header-v1');assert.ok(header&&header.startFrame===0);
});
test('opening carry respects manual reorder, gaps, trims and unrelated projects',()=>{
 const p=withAudio(),e=cinematicEdit(p);assert.equal(openingCarry({...p,authoredRecipe:undefined},e,e.clips[1]),null);
 const reordered=structuredClone(e);reordered.clips.reverse();assert.equal(openingCarry(p,reordered,reordered.clips[1]),null);
 const trimmed=structuredClone(e);trimmed.clips[1].inFrame=30;assert.equal(openingCarry(p,trimmed,trimmed.clips[1]),null);
});

import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
test('CLI rejects a traversal project before reading/importing assets; create does not overwrite',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'authored-cli-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=join(dir,'project.json'),p=make();p.id='../../outside';await writeFile(file,JSON.stringify(p));
 await assert.rejects(exec(process.execPath,['apps/shopshorts/studio-recipe-cli.mjs','--project',file,'--action','import','--assets',dir,'--voice-dir',dir,'--opening','/does-not-exist']),/안전한 프로젝트 ID/);
 await assert.rejects(exec(process.execPath,['apps/shopshorts/studio-recipe-cli.mjs','--project',file,'--action','create']),/덮어쓰지/);assert.equal(JSON.parse(await readFile(file,'utf8')).id,p.id);
});
