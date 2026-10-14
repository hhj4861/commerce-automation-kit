import test from 'node:test';
import assert from 'node:assert/strict';
import {scenarioBrief} from '../lib/studio-scenario.js';
import {accountFailureCode,accountFailureMessage,codexFailure} from '../lib/llm-account-errors.js';
import {mockReview} from './helpers/editorial-review.mjs';

const brief={category:'심리학',topic:'같은 질문에 날카롭게 답하는 이유',format:'short',duration:24};
const scenes=['오늘은 왜 날카롭게 답했을까요?','지친 상태에서는 잠시 숨을 고르세요.','내 상태를 먼저 살피고 다시 대화해 보세요.'].map((narration,i)=>({id:`scene-${i+1}`,narration,prompt:'같은 인물이 숨을 고르고 다시 대화하는 장면',duration:8,kind:'image'}));
const good={title:'대답하기 전 잠깐',scenes,storyArc:Object.fromEntries(['hook','payoff','ending'].map((k,i)=>[k,{sceneId:scenes[i].id,line:scenes[i].narration}]))};
const badLength={...good,scenes:scenes.map(s=>({...s,duration:1}))};

test('repairs invalid generated duration before independent review and preserves target',async()=>{
 let drafts=0,reviews=0;const phases=[];
 const result=await scenarioBrief(brief,{}, {onProgress:async p=>phases.push(p),generate:async prompt=>{
   const review=mockReview(prompt);if(review){if(prompt.startsWith('대본 독립 검토 '))reviews++;return review;}
   drafts++;if(drafts===2){assert.match(prompt,/SCENARIO_FORMAT_INVALID/);assert.match(prompt,/목표 24초/);assert.match(prompt,/scenes\[\]\.duration/);assert.match(prompt,/sum must match target 24 seconds/);}
   return {value:drafts===1?badLength:good};
 }});
 assert.equal(drafts,2);assert.equal(reviews,1);assert.equal(result.scenes.reduce((n,s)=>n+s.duration,0),24);
 assert.deepEqual(phases,['scenario','revision','review']);
});

test('repeated malformed output stops with an allowlisted reason for both providers',async()=>{
 for(const malformed of [badLength,{}, {scenes:[null]}, {scenes:[42]}]){
  let calls=0;
  await assert.rejects(scenarioBrief(brief,{}, {generate:async()=>{calls++;return {value:malformed};}}),e=>{
   assert.equal(accountFailureCode(e),'SCENARIO_FORMAT_INVALID');
   for(const provider of ['codex','claude'])assert.match(accountFailureMessage(provider,e),/장면 형식 또는 목표 길이/);
   return true;
  });
  assert.equal(calls,2);
 }
});

test('repairs a story arc that does not quote the actual narration',async()=>{
 let drafts=0;
 const result=await scenarioBrief(brief,{}, {generate:async prompt=>mockReview(prompt)||{value:++drafts===1?{...good,storyArc:{}}:good}});
 assert.equal(drafts,2);assert.equal(result.title,good.title);
});

test('format repair and depth repair share one budget, never accepting a failed review',async()=>{
 let drafts=0,reviews=0;
 await assert.rejects(scenarioBrief(brief,{}, {generate:async prompt=>{
  const review=mockReview(prompt,['mechanism']);if(review){if(prompt.startsWith('대본 독립 검토 '))reviews++;return review;}
  return {value:++drafts===1?badLength:good};
 }}),{code:'SCENARIO_DEPTH_INVALID'});
 assert.equal(drafts,2);assert.equal(reviews,1);
});

test('provider and progress failures are not mislabeled or retried as content errors',async()=>{
 for(const failure of [codexFailure('CODEX_AUTH_FAILED'),new Error('runtime fixture')]){
  let calls=0;
  await assert.rejects(scenarioBrief(brief,{}, {generate:async()=>{calls++;throw failure;}}),e=>e===failure);
  assert.equal(calls,1);
 }
 const failure=Object.assign(new Error('broker fixture'),{status:502});let calls=0;
 await assert.rejects(scenarioBrief(brief,{}, {onProgress:async()=>{throw failure;},generate:async()=>{calls++;return {value:good};}}),e=>e===failure);
 assert.equal(calls,0);
});


test('research searches once; drafting, repair and review use that fixed evidence',async()=>{
 const research={sources:[{id:'source-1',title:'제공 근거',url:'https://example.com/research'}],facts:[{claim:'지친 상태에서 대화 반응을 먼저 알아차린다.',sourceIds:['source-1']}],limitations:['진단이나 치료 효과로 단정하지 않는다.']};
 const signal=new AbortController().signal,model='fixture-model';
 let calls=0,drafts=0,reviews=0;
 const result=await scenarioBrief({...brief,workflow:'explainer-v1'},{SHOPSHORTS_CODEX_MODEL:model},{signal,generate:async(prompt,options)=>{
  calls++;assert.equal(options.signal,signal);assert.equal(options.model,model);
  if(calls===1){assert.notEqual(options.draftOnly,true);return {searched:true,value:research};}
  assert.equal(options.draftOnly,true);
  const review=mockReview(prompt);if(review){if(prompt.startsWith('대본 독립 검토 '))reviews++;return review;}
  assert.match(prompt,/자료 조사는 이미 완료/);assert.match(prompt,/source-1/);
  drafts++;return {value:drafts===1?badLength:good};
 }});
 assert.equal(calls,5);assert.equal(drafts,2);assert.equal(reviews,1);
 assert.deepEqual(result.research.facts,research.facts);
});

const webtoon={artPrompt:'같은 건축물이 움직이는 독창적인 그림',answer:'같은 대상의 이동과 결과를 비교한다.',layers:[{id:'building',label:'건물',meaning:'이동하는 대상',shape:'rect',color:'#88bbcc',from:[20,50],to:[70,50],size:[20,20],start:0,end:.8,motion:'move'}]};
const webtoonGood={...good,scenes:scenes.map((s,i)=>({...s,kind:'video',duration:i===0?6:9,webtoon:structuredClone(webtoon)}))};
const research={sources:[{id:'source-1',title:'검증용 근거',url:'https://example.com/research'}],facts:[{claim:'이동 전후 같은 대상의 위치를 비교한다.',sourceIds:['source-1']}],limitations:['실제 시공 구조가 아닌 개념도다.']};

test('webtoon field and numeric scene index reach the one repair without echoing invalid values in the hint',async()=>{
 for(const [mutate,path,rule] of [
  [v=>{v.scenes[1].webtoon.layers[0].end=0;},'scenes[1].webtoon.layers[0].end','number in 0.1..1, greater than start'],
  [v=>{v.scenes[1].webtoon.layers[0].color='private-invalid-value';},'scenes[1].webtoon.layers[0].color','#RRGGBB'],
  [v=>{v.scenes[1].webtoon.layers[0]=null;},'scenes[1].webtoon.layers[0].id','layer object required'],
  [v=>{v.scenes[0].duration=7;},'scenes[0].duration','opening must be exactly 6 seconds'],
  [v=>{v.scenes[1].kind='image';},'scenes[1].kind','video required for webtoon/hybrid'],
 ]){
  const malformed=structuredClone(webtoonGood);mutate(malformed);
  let calls=0,drafts=0,reviews=0;
  const result=await scenarioBrief({...brief,productionStyle:'webtoon'}, {}, {generate:async prompt=>{
   if(++calls===1)return {searched:true,value:research};
   const review=mockReview(prompt);if(review){if(prompt.startsWith('대본 독립 검토 '))reviews++;return review;}
   drafts++;
   assert.ok(!prompt.includes('"kind":"image"},{"id":"scene-2"'));
   if(drafts===2){const hint=JSON.parse(prompt.split('실패한 필드와 제약: ')[1].split('. 목표 길이')[0]);assert.deepEqual(hint,{path,rule});assert.ok(!JSON.stringify(hint).includes('private-invalid-value'));}
   return {value:drafts===1?malformed:webtoonGood};
  }});
  assert.equal(drafts,2);assert.equal(reviews,1);assert.equal(result.scenes.length,3);
 }
});

test('repeated webtoon failure retains a safe diagnostic but not raw input in public errors',async()=>{
 const malformed=structuredClone(webtoonGood);malformed.scenes[1].webtoon.layers[0].color='private-invalid-value';
 let calls=0;
 await assert.rejects(scenarioBrief({...brief,productionStyle:'webtoon'},{},{generate:async prompt=>{calls++;return mockReview(prompt)||(calls===1?{searched:true,value:research}:{value:malformed});}}),e=>{
  assert.deepEqual(e.validationIssue,{path:'scenes[1].webtoon.layers[0].color',rule:'#RRGGBB'});
  assert.equal(e.code,'SCENARIO_FORMAT_INVALID');assert.ok(!e.message.includes('private-invalid-value'));assert.match(accountFailureMessage('codex',e),/2번 장면의 대상 색상/);
  for(const provider of ['codex','claude'])assert.ok(!accountFailureMessage(provider,e).includes('private-invalid-value'));
  return true;
 });
 assert.equal(calls,4);
});

test('format diagnostics reject untrusted path and rule text at the public boundary',()=>{
 for(const path of ['private-token','scenes[1].private-token','webtoon.layers[private-token].color','scenes[123456].webtoon.layers.color']){
  const message=accountFailureMessage('codex',{code:'SCENARIO_FORMAT_INVALID',validationIssue:{path,rule:'private-token'}});
  assert.ok(!message.includes('private-token'));assert.ok(!message.includes('확인 항목'));
 }
});

const hybridGood={...webtoonGood,scenes:webtoonGood.scenes.map(s=>({...s,hybrid:{renderer:'motion',focus:'building',depth:8}}))};
const hybridBrief={...brief,category:'건축학',productionStyle:'hybrid',architectureQuality:'architecture-cycles-v1'};
test('basic and hybrid/architecture violations give the exact field to one repair before review',async()=>{
 const cases=[
  [v=>{v.scenes[1].narration='';},'scenes[1].narration','nonempty text, max 1200 characters','대사'],
  [v=>{v.scenes[1].prompt='private'.repeat(300);},'scenes[1].prompt','nonempty text, max 2000 characters','화면 설명'],
  [v=>{v.scenes[1].duration=31;},'scenes[1].duration','number in 1..30','장면 길이'],
  [v=>{v.scenes[1].hybrid.focus='private';},'scenes[1].hybrid.focus','must reference an id in this scene webtoon.layers','확대할 대상'],
  [v=>{v.scenes[1].hybrid.depth=25;},'scenes[1].hybrid.depth','number in 1..24','구조도 깊이'],
  [v=>{v.scenes[1].hybrid.parts=[{layerId:'building',material:'private'}];},'scenes[1].hybrid.parts[0].material','glass, metal, fabric or concrete','건축 부품 재질'],
  [v=>{v.scenes[1].hybrid.renderer='3d';},'scenes[1].hybrid.parts','provide one part with layerId and allowed material for every webtoon layer','건축 부품 구성'],
 ];
 for(const [mutate,path,rule,label] of cases){
  const malformed=structuredClone(hybridGood);mutate(malformed);
  for(const repairSucceeds of [true,false]){
   let calls=0,drafts=0,reviews=0;
   const promise=scenarioBrief(hybridBrief,{}, {generate:async prompt=>{
    if(++calls===1)return {searched:true,value:research};
    const review=mockReview(prompt);if(review){if(prompt.startsWith('대본 독립 검토 '))reviews++;return review;}
    drafts++;
    if(drafts===2){const hint=JSON.parse(prompt.split('실패한 필드와 제약: ')[1].split('. 목표 길이')[0]);assert.deepEqual(hint,{path,rule});}
    return {value:repairSucceeds&&drafts===2?hybridGood:malformed};
   }});
   if(repairSucceeds){const result=await promise;assert.equal(result.scenes.length,3);assert.equal(reviews,1);}
   else{await assert.rejects(promise,e=>{
    assert.equal(e.code,'SCENARIO_FORMAT_INVALID');assert.deepEqual(e.validationIssue,{path,rule});
    for(const provider of ['codex','claude']){const message=accountFailureMessage(provider,e);assert.ok(message.includes(`2번 장면의 ${label}`));assert.ok(!message.includes('private'));}
    return true;
   });assert.equal(reviews,0);}
   assert.equal(drafts,2);
  }
 }
});
