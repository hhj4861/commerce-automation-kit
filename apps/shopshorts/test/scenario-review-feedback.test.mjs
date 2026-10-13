import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewDepth,reviewPrompt,depthFailure} from '../lib/explanation-depth.js';
import {accountFailureMessage,accountFailureCode,codexFailure} from '../lib/llm-account-errors.js';
import {mockReview} from './helpers/editorial-review.mjs';
const brief={category:'과학',topic:'유리의 연결',format:'short',duration:24};
const scenario={title:'유리의 연결',scenes:[{id:'scene-1',narration:'유리는 절연체지만 금속 배선으로 칩을 연결합니다.',prompt:'유리 단면과 금속 배선을 같은 대상의 전후로 보여준다.',kind:'video',duration:24}]};

test('malformed review repairs the same draft once and still rejects weak content',async()=>{
 const good=mockReview(await reviewPrompt(brief,scenario),['mechanism']);
 let calls=0;
 const result=await reviewDepth(brief,scenario,{generate:async prompt=>{
  calls++;
  if(calls===1)return {value:{checks:{},digest:'wrong'}};
  assert.match(prompt,/대본은 변경하지/);assert.match(prompt,new RegExp(good.value.digest));
  return good;
 }});
 assert.equal(calls,2);assert.equal(result.passed,false);
 assert.deepEqual(depthFailure(result).failedChecks,['mechanism']);
 for(const provider of ['codex','claude']){
  const message=accountFailureMessage(provider,depthFailure(result));
  assert.match(message,/작동 과정/);assert.doesNotMatch(message,/인증|키|로그인/);
 }
});

test('valid negative review is not retried to force a passing verdict',async()=>{
 const negative=mockReview(await reviewPrompt(brief,scenario),['why','payoff']);let calls=0;
 const result=await reviewDepth(brief,scenario,{generate:async()=>{calls++;return negative;}});
 assert.equal(calls,1);assert.equal(result.passed,false);
});

test('two malformed reports are distinguished from editorial rejection',async()=>{
 let calls=0;
 await assert.rejects(reviewDepth(brief,scenario,{generate:async()=>{calls++;return {value:{}};}}),error=>{
  assert.equal(accountFailureCode(error),'SCENARIO_REVIEW_INVALID');
  for(const provider of ['codex','claude'])assert.match(accountFailureMessage(provider,error),/인용·형식/);
  return true;
 });
 assert.equal(calls,2);
});

test('provider errors are never retried as malformed reviews',async()=>{
 const error=codexFailure('CODEX_AUTH_FAILED');let calls=0;
 await assert.rejects(reviewDepth(brief,scenario,{generate:async()=>{calls++;throw error;}}),e=>e===error);
 assert.equal(calls,1);
});

test('only fixed check labels cross the public error boundary',()=>{
 const error=Object.assign(depthFailure(),{failedChecks:['mechanism','secret=do-not-expose','mechanism'],message:'secret=do-not-expose'});
 const message=accountFailureMessage('codex',error);
 assert.match(message,/작동 과정/);assert.doesNotMatch(message,/secret/);
 assert.equal(message.match(/작동 과정/g).length,1);
});
