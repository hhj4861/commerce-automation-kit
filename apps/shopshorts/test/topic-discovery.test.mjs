import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendBrief} from '../lib/studio-recommendations.js';
const brief={category:'건축학',format:'short',duration:60,focus:'topic',topic:'국내 건축물',direction:'그림 중심'};
const env={DISCOVERY_ENABLED:'1',DISCOVERY_URL:'https://discovery.example',DISCOVERY_API_KEY:'k'.repeat(40)};
const c={id:'candidate-1',title:'돌아가는 다리의 비밀',entity:'회전교',location:'한국',question:'다리는 왜 돌아갈까?',expectedAnswer:'들어올릴 것이다',answer:'선박 통과를 위한 회전',whyItMatters:'통행을 함께 유지',direction:'회전 전후를 보여준다',keyword:'회전교',openingVisual:'다리가 돌아간다',evidenceIds:['source-1'],decision:'accepted'};
test('studio maps only accepted common-server candidates to recommendations',async()=>{
 let generation=0,checks=0;
 const data=await recommendBrief(brief,env,{subject:'a'.repeat(64),requestId:'studio-job-001',provider:'codex',history:[],assertConnection:async()=>{checks++;},
  generate:async(_prompt,options)=>{assert.equal(options.draftOnly,true);generation++;return {value:{candidates:[c]}};},
  fetch:async(url,init)=>{
   const value=JSON.parse(init.body);
   if(url.endsWith('/v1/discover')){assert.equal(value.profile,'content');assert.equal(value.category,'건축학');assert.equal(value.brief.split('\n')[0],brief.topic);assert.ok(value.brief.includes('\n'+brief.direction+'\n'));}
   return Response.json(url.endsWith('/complete')?{requestId:'request',state:'complete',rubricVersion:'discovery-v1',candidates:[c,{...c,id:'held',decision:'held'}],evidence:[{id:'source-1',url:'https://operator.example/bridge',title:'운영기관'}]}:{requestId:'request',state:url.endsWith('/claim')?'generating':'awaiting_generation',candidates:[],evidence:[],action:{id:'action',runtime:{model:'provider-default',provider:'codex'},prompt:'Draft'}});
  }});
 assert.equal(generation,1);assert.equal(checks,3);assert.equal(data.suggestions.length,1);
 assert.equal(data.suggestions[0].caseStudy.entity,'회전교');assert.equal(data.verification.held,1);
});
test('enabled service failures never run the legacy recommendation fallback',async()=>{
 let generation=0;
 await assert.rejects(recommendBrief(brief,env,{subject:'a'.repeat(64),requestId:'studio-job-002',provider:'codex',assertConnection:async()=>{},generate:async()=>{generation++;},fetch:async()=>Response.json({error:'search_unavailable'},{status:503})}),/공통 주제 검증/);
 assert.equal(generation,0);
});


test('verification diagnostics survive the account worker boundary without exposing upstream text',async()=>{
 const {accountFailureCode,accountFailureMessage}=await import('../lib/llm-account-errors.js');
 for(const [reason,code] of [['no_grounded_candidates','DISCOVERY_NO_ACCEPTED_CANDIDATES'],['search_evidence_missing','DISCOVERY_NO_ACCEPTED_CANDIDATES'],['skipped_by_budget','DISCOVERY_BUDGET_LIMIT'],['discovery_in_progress','DISCOVERY_IN_PROGRESS'],['private_upstream_detail','DISCOVERY_UNAVAILABLE']]){
  await assert.rejects(recommendBrief(brief,env,{subject:'a'.repeat(64),requestId:'studio-job-003',provider:'codex',assertConnection:async()=>{},fetch:async()=>Response.json({error:reason},{status:503})}),e=>{
   assert.equal(accountFailureCode(e),code);
   for(const provider of ['codex','claude']){assert.equal(accountFailureMessage(provider,e),e.message);assert.doesNotMatch(e.message,/private_upstream_detail|계정을 다시 연결/);}
   return true;
  });
 }
 assert.match(accountFailureMessage('codex',{code:'DISCOVERY_NO_ACCEPTED_CANDIDATES'}),/관심사를 더 구체화/);
});


test('maximum planning text survives transport without duplicate JSON escaping',async()=>{
 for(const char of ['가','a','"','\\','\u0001']){
  const input={...brief,topic:char.repeat(1000),direction:char.repeat(2000),productionStyle:'animation',workflow:'explainer-v1'};
  let observed=false;
  await assert.rejects(recommendBrief(input,env,{subject:'a'.repeat(64),requestId:'studio-limit-001',provider:'codex',assertConnection:async()=>{},fetch:async(_url,init)=>{
   const value=JSON.parse(init.body);observed=true;
   assert.ok(value.brief.length<=6000);
   assert.ok(value.brief.startsWith(input.topic+'\n'));
   assert.ok(value.brief.includes('\n제작 요청사항:\n'+input.direction+'\n'));
   const preferences=JSON.parse(value.brief.split('\n제작 설정:\n')[1]);
   assert.equal(preferences.productionStyle,'animation');assert.equal(preferences.workflow,'explainer-v1');
   assert.equal(preferences.topic,undefined);assert.equal(preferences.direction,undefined);
   return Response.json({error:'search_evidence_missing'},{status:503});
  }}),e=>e.code==='DISCOVERY_NO_ACCEPTED_CANDIDATES');
  assert.equal(observed,true);
 }
});
