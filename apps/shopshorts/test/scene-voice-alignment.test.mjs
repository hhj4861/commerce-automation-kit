import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createProject,changeProject,VOICES} from '../lib/studio.js';
import {scenarioBrief,scenarioResult} from '../lib/studio-scenario.js';
import {syncScenario} from '../lib/studio-scenario-account.js';
import {normalizeEdit} from '../public/editor-model.js';
import {VOICE_PROFILES,recommendedVoice} from '../public/voice-recommendation.js';
import {sceneMediaPrompt} from '../lib/scene-media-prompt.js';
import {higgsfieldPlan} from '../studio-higgsfield.mjs';
import {executeStudioTask} from '../studio-runner.mjs';

function project(){
 const p=createProject({category:'심리학',topic:'결정을 잠시 미루는 순간',direction:'차분한 설명',format:'short',duration:24});
 p.scenes=[1,2,3].map(i=>({id:`scene-${i}`,narration:`선택지 ${i}를 종이에 적어 비교해 보세요.`,prompt:'책상에서 종이 두 장을 비교하는 사람, 따뜻한 일러스트',duration:8,kind:'image'}));
 return p;
}
const picked={voiceId:'sf8Bpb1IU97NI9BHSMRf',reason:'선택을 어려워하는 시청자에게 부드럽게 말을 건네는 내용이에요.'};

test('voice catalog uses only supported IDs; legacy projects get transparent defaults',()=>{
 assert.deepEqual(VOICE_PROFILES.map(v=>v.id).sort(),VOICES.map(v=>v.id).sort());
 const p=project();assert.equal(recommendedVoice(p).method,'default');assert.notEqual(normalizeEdit(p).voice,'none');
 for(const [direction,id] of [['내레이션 없음','none'],['차분한 남성 목소리','BbsagRO6ohd8MKPS2Ob0'],['부드럽게 공감','sf8Bpb1IU97NI9BHSMRf'],['밝고 경쾌하게','n2fbxG88jqAoaVPUy3IG']]){
  p.brief.direction=direction;assert.equal(normalizeEdit(p).voice,id);
 }
});

for(const provider of ['codex','claude'])test(`${provider} recommendation survives generation, account sync, edit save and reload`,async()=>{
 const p=project(),value={title:'선택을 적어보는 시간',scenes:p.scenes,voiceRecommendation:picked,
  storyArc:Object.fromEntries(['hook','payoff','ending'].map((k,i)=>[k,{sceneId:p.scenes[i].id,line:p.scenes[i].narration}]))};
 const result=await scenarioBrief(p.brief,{}, {provider,generate:async prompt=>{
  assert.ok(prompt.includes(picked.voiceId));assert.match(prompt,/voiceRecommendation/);return {value};
 }});
 p.task={runner:'llm-account',state:'running',action:'scenario',id:'task',accountOwner:'owner',deadline:Date.now()+10000};
 let stored,acks=0;
 const next=await syncScenario({cas:async p=>{stored=structuredClone(p);return true;}},p,async(_owner,operation)=>{
  if(operation==='scenario-ack'){acks++;return {};}
  return {job:{state:'done',id:'task',projectId:p.id,result}};
 });
 assert.equal(acks,1);assert.equal(stored.voiceRecommendation.voiceId,picked.voiceId);
 assert.equal(recommendedVoice(next).method,'llm');
 const edit=normalizeEdit(next);assert.equal(edit.voice,picked.voiceId);
 const saved=changeProject(next,'edit',edit);
 assert.equal(normalizeEdit(JSON.parse(JSON.stringify(saved))).voice,picked.voiceId);
});

test('invalid or stale LLM voice metadata never overwrites explicit voice or narration-off',()=>{
 const p=project();
 for(const recommendation of [{voiceId:'unknown',reason:'x'},{...picked,reason:'x'.repeat(241)},null]){
  const result=scenarioResult({title:'선택',scenes:p.scenes,voiceRecommendation:recommendation},p.brief);
  assert.equal(result.voiceRecommendation,undefined);
 }
 Object.assign(p,scenarioResult({title:'선택',scenes:p.scenes,voiceRecommendation:picked},p.brief));
 p.scenes[0].narration='먼저 기준을 하나 적어보세요.';
 assert.equal(recommendedVoice(p).method,'default');
 for(const voice of ['none',VOICES[1].id]){
  p.edit={...normalizeEdit({...p,edit:null}),voice};
  assert.equal(normalizeEdit(p).voice,voice);
  const edited=changeProject(p,'scenes',{scenes:p.scenes});
  assert.equal(normalizeEdit(edited).voice,voice);
 }
});

test('media context includes only the scene captions and changes with spoken meaning',()=>{
 const p=project();p.edit=normalizeEdit(p);p.edit.captions=[{clipId:'clip-1',text:'기준을 비교하기'},{clipId:'clip-2',text:'다른 장면만의 자막'}];
 const scene=p.scenes[0],before=sceneMediaPrompt(p,scene);
 assert.ok(before.includes(scene.narration));assert.ok(before.includes(scene.prompt));assert.ok(before.includes(p.brief.topic));
 assert.match(before,/기준을 비교하기/);assert.doesNotMatch(before,/다른 장면만의 자막/);
 const old=higgsfieldPlan(scene,p.brief.aspect,p);
 scene.narration='모든 선택을 잠시 내려놓으세요.';
 assert.notEqual(higgsfieldPlan(scene,p.brief.aspect,p).prompt,old.prompt);
 p.edit.captions[0].text='잠시 쉬어가기';assert.match(sceneMediaPrompt(p,scene),/잠시 쉬어가기/);
});

test('narration edits invalidate generated media while preserving uploaded media and unrelated scenes',()=>{
 const p=project();for(const s of p.scenes)p.assets[s.id]={source:s.id==='scene-2'?'upload':'ai',key:s.id};
 const next=changeProject(p,'scenes',{scenes:p.scenes.map((s,i)=>({...s,narration:i<2?'종이를 내려놓고 쉬어가요.':s.narration}))});
 assert.equal(next.assets['scene-1'],undefined);assert.ok(next.assets['scene-2']);assert.ok(next.assets['scene-3']);
 assert.ok(p.assets['scene-1']);
});

test('one-scene remake retains editing and other media, requires approval and uses a new durable generation version',()=>{
 const p=project();p.edit=normalizeEdit(p);p.assets={'scene-1':{key:'old'},'scene-2':{key:'keep'}};
 p.mediaJobs={'scene-1':{id:'accepted'},'scene-2':{id:'keep'}};
 assert.throws(()=>changeProject(p,'media',{sceneId:'scene-1'}));
 assert.throws(()=>changeProject(p,'media',{sceneId:'missing',approved:true}));
 const unfinished=structuredClone(p);delete unfinished.assets['scene-1'];
 assert.throws(()=>changeProject(unfinished,'media',{sceneId:'scene-1',approved:true}),/미완료/);
 assert.equal(unfinished.mediaJobs['scene-1'].id,'accepted');
 const next=changeProject(p,'media',{sceneId:'scene-1',approved:true});
 assert.equal(next.assets['scene-1'],undefined);assert.ok(next.assets['scene-2']);
 assert.deepEqual(next.edit,p.edit);assert.deepEqual(next.task.sceneIds,['scene-1']);
 assert.equal(next.mediaJobs['scene-1'],undefined);assert.ok(next.mediaJobs['scene-2']);
 assert.notEqual(higgsfieldPlan(p.scenes[0],p.brief.aspect,p).generation,higgsfieldPlan(next.scenes[0],next.brief.aspect,next).generation);
 next.task.state='failed';assert.equal(changeProject(next,'media',{approved:true}).mediaVersions['scene-1'],next.mediaVersions['scene-1']);
});

for(const kind of ['image','video'])test(`Google ${kind} receives aligned prompt; a selected remake does not generate other missing scenes`,async()=>{
 const dir=await mkdtemp(join(tmpdir(),'scene-alignment-'));
 try{
  let p=project();p.scenes[0].kind=kind;p.assets['scene-1']={key:'previous'};p=changeProject(p,'media',{approved:true,sceneId:'scene-1'});
  let creations=0;
  const fetcher=async(url,options)=>{
   if(String(url).endsWith('/result.mp4'))return new Response('video-fixture');
   creations++;const body=JSON.parse(options.body),prompt=kind==='image'?body.contents[0].parts[0].text:body.instances[0].prompt;
   assert.ok(prompt.includes(p.scenes[0].narration));assert.ok(prompt.includes(p.brief.topic));
   return kind==='image'?Response.json({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:Buffer.from('image-fixture').toString('base64')}}]}}]}):Response.json({name:'operations/test',done:true,response:{generateVideoResponse:{generatedSamples:[{video:{uri:'https://generativelanguage.googleapis.com/result.mp4'}}]}}});
  };
  const result=await executeStudioTask(p,{GEMINI_API_KEY:'fixture'},{workDir:dir,writeAsset:async()=>{}},async()=>{},{fetcher});
  assert.equal(creations,1);assert.deepEqual(Object.keys(result.assets),['scene-1']);
 }finally{await rm(dir,{recursive:true,force:true});}
});
