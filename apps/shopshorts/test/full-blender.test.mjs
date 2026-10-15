import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createAuthoredProject} from '../lib/authored-project.js';
import {createProject,validateScenes,validateEdit} from '../lib/studio.js';
import {hybridPlan} from '../public/hybrid-plan.js';
import {hybridPlanMarkup} from '../public/hybrid-plan-ui.js';
import {webtoonGuide,webtoonScenes} from '../lib/webtoon-plan.js';
import {architectureGuide} from '../public/architecture-quality.js';
import {checkWebtoonReview,prepareWebtoon} from '../studio-webtoon.mjs';
import {studioApi} from '../lib/studio-api.js';
import {cinematicEdit} from '../lib/cinematic-production.js';
import {productionPreflight} from '../studio-preflight.mjs';
import {FPS} from '../public/editor-model.js';
const make=()=>createAuthoredProject('gateshead-tilting-v1'),exec=promisify(execFile);
test('web and CLI create identical reviewed full-3D drafts without approval, rendering or budget',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'full-blender-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,'project.json');await exec(process.execPath,['apps/shopshorts/studio-recipe-cli.mjs','--action','create','--recipe','gateshead-tilting-v1','--project',path]);
 const cli=JSON.parse(await readFile(path,'utf8'));let web;
 const res=await studioApi(new Request('https://studio.test/api/studio/recipes',{method:'POST',headers:{origin:'https://studio.test','content-type':'application/json'},body:JSON.stringify({id:'gateshead-tilting-v1'})}),{}, {create:async p=>web=p});
 assert.equal(res.status,201);assert.deepEqual(web.brief,cli.brief);assert.deepEqual(web.scenes,cli.scenes);assert.deepEqual(web.depthReview,cli.depthReview);
 assert.equal(web.approved,false);assert.equal(web.task,null);assert.deepEqual(web.assets,{});assert.equal(web.brief.maxCredits,undefined);assert.equal(web.brief.mediaProvider,'blender');await checkWebtoonReview(web);
});
test('opening and every body scene render locally with zero paid media calls, even with Higgsfield credentials configured',async()=>{
 const p=make();p.task={action:'media'};let paid=0,ready=0;const rendered=[],checkpoints=[];
 const fail=async()=>{paid++;throw Error('paid provider must not be called');};
 const engine=await prepareWebtoon(p,{SHOPSHORTS_MEDIA_PROVIDER:'higgsfield'},'/unused',{},async x=>checkpoints.push(x),{run:fail,generate:fail,fetcher:fail,render:fail,hybridReady:fail,blenderReady:async()=>{ready++;return true;},renderHybrid:async(j,s,w,e,route)=>{assert.equal(route,'3d');rendered.push(s.id);return {data:Buffer.from('test fixture'),type:'video/mp4',provider:'authored-blender'};}});
 for(const s of p.scenes)await engine.scene(s,s.duration);
 assert.equal(paid,0);assert.equal(ready,1);assert.deepEqual(rendered,p.scenes.map(s=>s.id));assert.equal(checkpoints[0].productionPlan.cost.status,'local-render');assert.equal(checkpoints[0].productionPlan.cost.credits,0);
 const plan=hybridPlan(p);assert.equal(plan.cost.artworkScenes,0);assert.equal(plan.cost.videoScenes,0);assert.equal(plan.scenes[0].renderer,'3d');
 assert.match(hybridPlanMarkup(p),/Higgsfield 0크레딧/);assert.doesNotMatch(hybridPlanMarkup(p),/NaN|undefined|상한/);
});
test('invalid full-3D routes and stale reviews fail before any provider/runtime call',async()=>{
 for(const mutate of [p=>p.depthReview=null,p=>p.brief.direction+=' changed',p=>p.scenes[0].hybrid={renderer:'webtoon'},p=>p.scenes[0].hybrid.authored.shot='../../outside',p=>p.scenes[0].hybrid.authored.path='/private/code.py']){
  const p=make();p.task={action:'media'};mutate(p);let calls=0;
  await assert.rejects(prepareWebtoon(p,{},'/unused',{},async()=>{},{run:async()=>calls++,blenderReady:async()=>calls++}));assert.equal(calls,0);
 }
 assert.throws(()=>createProject({...make().brief,category:'심리학'}),/건축학/);
 assert.deepEqual(validateScenes(make().scenes),make().scenes);
});
test('full-3D guide and first-scene validation do not force a paid six-second opening',()=>{
 const p=make(),scenes=structuredClone(p.scenes);scenes[0].duration=3;
 assert.doesNotThrow(()=>webtoonScenes(scenes,p.brief));assert.throws(()=>webtoonScenes(scenes,{productionStyle:'hybrid'}));
 assert.match(webtoonGuide(p.brief),/첫 장면부터 마지막까지 Blender/);assert.doesNotMatch(architectureGuide(p.brief),/도입 Higgsfield|실제 외형은 웹툰 원화/);
});
test('measured narration retains every caption and a complete closing hold',()=>{
 const p=make();delete p.pipelineVersion;
 for(const [i,s]of p.scenes.entries())p.assets['narration-'+s.id]={key:s.id,kind:'audio',purpose:'narration',voice:p.brief.voiceId,text:s.narration,narrationSpeed:1.1,duration:i===0?5.5:s.duration};
 const e=validateEdit(cinematicEdit(p),p);
 for(const clip of e.clips){const s=p.scenes.find(s=>s.id===clip.sceneId),a=p.assets['narration-'+s.id];assert.ok(clip.outFrame/FPS>=a.duration+.3);const captions=e.captions.filter(c=>c.clipId===clip.id&&c.source==='script'&&c.id!=='authored-concept-label');assert.equal(captions.map(c=>c.text).join('').replace(/\s/g,''),s.narration.replace(/\s/g,''));}
 assert.ok(e.clips[0].outFrame/FPS<6);assert.ok(e.clips.at(-1).outFrame/FPS-p.assets['narration-return'].duration>=1.5);assert.ok(e.captions.some(c=>c.id==='authored-concept-label'));assert.ok(e.captions.some(c=>c.presentation==='modern-header-v1'));
});
test('web worker still checks voice connectivity before generation; TLS failure is not treated as successful speech',async()=>{
 const p=make();p.task={action:'media'};let requests=0;
 await assert.rejects(productionPreflight(p,{ELEVENLABS_API_KEY:'test-only'},{command:async()=>'',blenderReady:async()=>true,fetcher:async()=>{requests++;throw Object.assign(Error('TLS'),{cause:{code:'UNABLE_TO_VERIFY_LEAF_SIGNATURE'}});}}));assert.equal(requests,1);
});

import {renderAuthoredScene} from '../studio-authored-render.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
test('registered adapter preserves legacy Sapporo timeline and validates both renderer receipts',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'blender-adapter-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 for(const id of ['sapporo-hovering-v1','gateshead-tilting-v1']){
  const p=createAuthoredProject(id),s=p.scenes[id==='sapporo-hovering-v1'?1:0];let called=false;
  const result=await renderAuthoredScene(p,s,dir,{}, {execute:async(bin,args)=>{
   called=true;const get=k=>args[args.indexOf(k)+1],out=get('--out'),tl=JSON.parse(await readFile(get('--timeline'),'utf8'));
   if(id==='sapporo-hovering-v1'){assert.equal(tl.beats[0].id,'hook');assert.equal(tl.beats[1].id,s.id);assert.equal(get('--samples'),'48');}
   else{assert.equal(tl.beats.length,1);assert.equal(tl.beats[0].id,s.id);assert.ok(!args.includes('--samples'));}
   const bytes=Buffer.from('fixture'),sourceHash=createHash('sha256').update(await readFile(get('--python'))).digest('hex');
   await writeFile(join(out,s.id+'.mp4'),bytes);await writeFile(join(out,'render-manifest.json'),JSON.stringify({sourceHash,samples:48,percent:100,shots:[{id:s.id,frames:Math.round(s.duration*24),sha256:createHash('sha256').update(bytes).digest('hex')}]}));
  }});assert.ok(called);assert.equal(result.provider,'authored-blender');assert.equal(result.qualityProfile,id);
 }
});

import {scenarioResult} from '../lib/studio-scenario.js';
test('new user topics validate as data-only Blender structures through the common scenario route',()=>{
 const p=createProject({category:'건축학',topic:'차양이 유리창을 가리는 과정',format:'short',duration:16,productionStyle:'blender'});
 const scenes=[4,12].map((duration,i)=>({id:'shade-'+i,duration,kind:'video',narration:'차양이 유리창 앞을 가리며 빛이 들어오는 면적을 줄입니다.',prompt:'같은 차양이 창 앞을 지나가며 빛이 가려진다.',shot:i?'detail':'wide',camera:'push-in',visualDirection:{focus:'차양 '+i,before:'열린 차양',action:'차양 이동',after:'유리를 가린 차양',continuity:'같은 유리와 차양',material:'콘크리트와 유리',lighting:'따뜻한 주광',representation:'conceptual',treatment:'cutaway',hookText:'건물의 피부가 움직인다?'},webtoon:{artPrompt:'유리와 차양의 공간 관계',answer:'차양이 빛을 가린다.',layers:[{id:'shade',label:'차양',meaning:'빛을 가리는 부품',shape:'rect',color:'#ddaa88',from:[20,50],to:[60,50],size:[30,40],start:.1,end:.8,motion:'move'}]},hybrid:{renderer:'3d',focus:'shade',depth:8,parts:[{layerId:'shade',material:'concrete'}]}}));
 const result=scenarioResult({title:'움직이는 차양',scenes,visualStyle:'밝은 대상과 어두운 배경',research:{sources:[{id:'source-1',title:'전송 검증용 자료',url:'https://example.org/test'}],facts:[{claim:'검증용 데이터',sourceIds:['source-1']}],limitations:['실제 연구 결과가 아닌 테스트 데이터']}},p.brief);
 assert.deepEqual(hybridPlan({...p,...result}).scenes.map(s=>s.renderer),['3d','3d']);assert.equal(result.scenes[0].duration,4);
 const invalid=structuredClone(scenes);invalid[0].hybrid.parts=[];assert.throws(()=>scenarioResult({title:'차양',scenes:invalid},p.brief),/재질/);
});
