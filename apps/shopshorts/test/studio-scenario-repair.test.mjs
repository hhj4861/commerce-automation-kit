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
   const review=mockReview(prompt);if(review){reviews++;return review;}
   drafts++;if(drafts===2){assert.match(prompt,/SCENARIO_FORMAT_INVALID/);assert.match(prompt,/목표 24초/);}
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
  const review=mockReview(prompt,['mechanism']);if(review){reviews++;return review;}
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
