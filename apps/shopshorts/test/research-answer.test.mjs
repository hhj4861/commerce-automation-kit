import test from 'node:test';
import assert from 'node:assert/strict';
import {researchTopic,validateResearch} from '../lib/explainer-production.js';
import {answerInput} from '../lib/research-answer.js';
import {scenarioBrief,scenarioResult} from '../lib/studio-scenario.js';
import {accountFailureCode,accountFailureMessage,codexFailure} from '../lib/llm-account-errors.js';
import {mockAnswerReview,mockReview} from './helpers/editorial-review.mjs';
const brief={category:'건축학',topic:'시험 구조는 왜 성벽 밖으로 나왔을까?',format:'short',duration:24,workflow:'explainer-v1'};
// Synthetic causal fixture; not evidence about Suwon or any actual fortress.
const purpose={sources:[{id:'source-1',title:'시험용 구조 설명',url:'https://example.org/test-only'}],facts:[{claim:'돌출 공간은 감시와 공격을 위한 공간이다.',sourceIds:['source-1']}],limitations:['돌출하지 않았을 때와의 차이를 확인하지 못했다.']};
const supported={...purpose,facts:[{claim:'시험 모형에서는 벽 안쪽 관찰점에서 벽 바로 옆 표적이 가려지고, 바깥 관찰점에서는 같은 표적이 보인다.',sourceIds:['source-1']}],limitations:['실제 시설에 대한 근거가 아닌 시험 데이터다.']};
const scenes=['시험 구조는 왜 밖으로 나왔을까요?','안에서는 가려진 같은 표적이 밖으로 옮기면 보입니다.','같은 표적이 보이는 차이를 확인했습니다. 실제 시설의 근거는 아닙니다.'].map((narration,i)=>({id:`scene-${i+1}`,narration,prompt:'같은 시험 모형의 관찰점과 가려진 표적 비교',duration:8,kind:'image'}));
const draft={title:'시험 구조의 관찰점',scenes,storyArc:Object.fromEntries(['hook','payoff','ending'].map((k,i)=>[k,{sceneId:scenes[i].id,line:scenes[i].narration}]))};

test('one targeted supplementary search precedes drafting; reviewed answer survives web/CLI result transport',async()=>{
 let searches=0,readiness=0,drafts=0;const phases=[];
 const controller=new AbortController(),model='test-model';
 const result=await scenarioBrief(brief,{SHOPSHORTS_CODEX_MODEL:model},{signal:controller.signal,onProgress:p=>phases.push(p),generate:async(p,o)=>{
  assert.equal(o.signal,controller.signal);assert.equal(o.model,model);
  if(p.startsWith('조사 답변 독립 검토 ')){readiness++;assert.equal(o.draftOnly,true);return mockAnswerReview(p,searches===1?['why','mechanism','payoff']:[]);}
  if(p.startsWith('선택된 영상')){
   searches++;assert.notEqual(o.draftOnly,true);assert.ok(p.includes(brief.topic));
   if(searches===2){assert.match(p,/추가 조사 1회/);assert.match(p,/돌출 위치가 만드는 차이에 대한 근거가 없습니다/);assert.match(p,/같은 주제·질문을 유지/);}
   return {searched:true,value:searches===1?purpose:supported};
  }
  const review=mockReview(p);if(review)return review;
  drafts++;assert.equal(searches,2);assert.equal(readiness,2);assert.equal(o.draftOnly,true);assert.match(p,/answerPlan/);assert.match(p,/같은 표적이 보인다/);return {value:draft};
 }});
 assert.equal(drafts,1);assert.deepEqual(phases,['research','scenario','review']);
 assert.equal(result.research.answerPlan.question,brief.topic);assert.equal(result.research.answerPlan.passed,true);
 assert.deepEqual(scenarioResult(result,brief).research,result.research);
 assert.throws(()=>scenarioResult(result,{...brief,topic:'다른 질문'}),{code:'SCENARIO_RESEARCH_INVALID'});
});

test('purpose-only rejection stops before any draft, not after two expensive scene attempts',async()=>{
 let searches=0,reviews=0;
 await assert.rejects(scenarioBrief(brief,{}, {generate:async p=>{
  const review=mockAnswerReview(p,['mechanism']);if(review){reviews++;return review;}
  assert.ok(p.startsWith('선택된 영상'));searches++;return {searched:true,value:purpose};
 }}),e=>{
  assert.equal(accountFailureCode(e),'SCENARIO_RESEARCH_INCOMPLETE');
  for(const provider of ['codex','claude'])assert.match(accountFailureMessage(provider,e),/작동 과정/);
  return true;
 });
 assert.equal(searches,2);assert.equal(reviews,2);
});

test('sufficient evidence is reviewed once and author supplied ready flags are ignored',async()=>{
 let calls=0;
 const result=await researchTopic(brief,{generate:async p=>{
  calls++;return mockAnswerReview(p)||{searched:true,value:{...supported,answerPlan:{passed:true,answer:'untrusted author verdict'}}};
 }});
 assert.equal(calls,2);assert.equal(result.answerPlan.answer,'시험용 인과 답변입니다.');
 assert.deepEqual(validateResearch(result),{sources:result.sources,facts:result.facts,limitations:result.limitations,answerPlan:result.answerPlan});
 assert.deepEqual(validateResearch(purpose),purpose); // Saved legacy projects remain readable.
});

test('invented quotes, out-of-range indices, missing checks, forged booleans and stale digest are review errors',async()=>{
 for(const mutate of [v=>v.digest='0'.repeat(64),v=>v.version='other',v=>v.checks.mechanism.evidence[0].quote='invented',v=>v.checks.mechanism.evidence[0].factIndex=99,v=>v.checks.mechanism.pass='true',v=>delete v.checks.mechanism,v=>v.checks.mechanism.evidence=[],v=>v.answer='']){
  let calls=0;
  await assert.rejects(researchTopic(brief,{generate:async p=>{
   calls++;const review=mockAnswerReview(p);if(review){mutate(review.value);return review;}return {searched:true,value:supported};
  }}),{code:'SCENARIO_RESEARCH_REVIEW_INVALID'});
  assert.equal(calls,2);
 }
 const input=await answerInput(brief,supported);
 const changed=await answerInput({...brief,topic:'다른 질문'},supported);assert.notEqual(input.digest,changed.digest);
});

test('supplement must actually search and refer to valid sources',async()=>{
 for(const response of [{searched:false,value:supported},{searched:true,value:{...supported,facts:[{claim:'unbacked',sourceIds:['source-8']}]}}]){
  let searches=0;
  await assert.rejects(researchTopic(brief,{generate:async p=>mockAnswerReview(p,['mechanism'])||(++searches===1?{searched:true,value:purpose}:response)}),{code:'SCENARIO_RESEARCH_INVALID'});
  assert.equal(searches,2);
 }
});

test('provider/progress/abort failures retain identity without extra research retries',async()=>{
 for(const failAt of [1,2,3,4]){
  let calls=0;const error=codexFailure('CODEX_NETWORK_FAILED');
  await assert.rejects(researchTopic(brief,{generate:async p=>{if(++calls===failAt)throw error;return mockAnswerReview(p,['mechanism'])||{searched:true,value:purpose};}}),e=>e===error);
  assert.equal(calls,failAt);
 }
 const c=new AbortController();let calls=0;
 await assert.rejects(researchTopic(brief,{signal:c.signal,generate:async()=>{calls++;c.abort();return {searched:true,value:purpose};}}),{name:'AbortError'});assert.equal(calls,1);
 const failure=Error('progress failed');calls=0;
 await assert.rejects(scenarioBrief(brief,{}, {onProgress:()=>{throw failure;},generate:()=>{calls++;}}),e=>e===failure);assert.equal(calls,0);
});

test('independent script review can still reject an omitted answer after research passes',async()=>{
 let drafts=0;
 await assert.rejects(scenarioBrief(brief,{}, {generate:async p=>{
  const researchReview=mockAnswerReview(p);if(researchReview)return researchReview;
  if(p.startsWith('선택된 영상'))return {searched:true,value:supported};
  const review=mockReview(p,['mechanism']);if(review){assert.match(p,/자료에는 있어도 대사에 없으면 빠진 설명/);return review;}
  drafts++;return {value:draft};
 }}),{code:'SCENARIO_DEPTH_INVALID'});
 assert.equal(drafts,2); // Existing content repair budget is unchanged.
});

test('public research diagnostics never echo reviewer reasons or arbitrary fields',()=>{
 const error={code:'SCENARIO_RESEARCH_INCOMPLETE',message:'private-token',failedChecks:['private-token','mechanism'],reason:'private-token'};
 for(const provider of ['codex','claude']){assert.match(accountFailureMessage(provider,error),/작동 과정/);assert.doesNotMatch(accountFailureMessage(provider,error),/private-token/);assert.match(accountFailureMessage(provider,{code:'SCENARIO_RESEARCH_REVIEW_INVALID'}),/다른 오류/);}
});
