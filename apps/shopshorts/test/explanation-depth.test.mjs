import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewInput,reviewPrompt,validateDepthReview,depthGuide,depthFailure} from '../lib/explanation-depth.js';
import {scenarioBrief,scenarioResult} from '../lib/studio-scenario.js';
import {accountFailureCode,accountFailureMessage} from '../lib/llm-account-errors.js';
import {mockReview} from './helpers/editorial-review.mjs';
const brief={category:'과학',topic:'전기 신호를 어떻게 빛으로 바꿀까?',format:'short',duration:30};
const draft={title:'전기에서 빛으로',scenes:[
 {id:'s1',duration:8,kind:'video',narration:'전기가 빛이 되는 걸까요?',prompt:'웹툰: 전선에서 빛이 바로 나오지 않는 대비, 질문 자막 공간'},
 {id:'s2',duration:14,kind:'video',narration:'변조기로 정보를 빛에 싣습니다. 여러 파장으로 보내면 효율적입니다.',prompt:'빛이 밝아지는 변조기와 파장 그림'},
 {id:'s3',duration:8,kind:'video',narration:'빛으로 연결하면 함께 일할 수 있습니다.',prompt:'서버들이 빛으로 연결된 그림'},
],storyArc:{hook:{sceneId:'s1',line:'전기가 빛이 되는 걸까요?'},payoff:{sceneId:'s2',line:'변조기로 정보를 빛에 싣습니다.'},ending:{sceneId:'s3',line:'빛으로 연결하면 함께 일할 수 있습니다.'}}};
const verdict=async(d=draft,b=brief,failed=[])=>mockReview(await reviewPrompt(b,d),failed).value;

test('old arc-valid shallow draft is rejected after two failed editorial reviews, never returned for media',async()=>{
 let calls=0;
 await assert.rejects(scenarioBrief(brief,{}, {generate:async prompt=>{calls++;return mockReview(prompt,['mechanism','example','focus'])||{value:draft};}}),{code:'SCENARIO_DEPTH_INVALID'});
 assert.equal(calls,4);
 assert.doesNotThrow(()=>scenarioResult(draft,brief),'saved drafts stay readable without a review');
});
test('review findings cause one repair, and repaired draft must pass a new review with its own hash',async()=>{
 let calls=0,reviews=0;const digests=[];const input=structuredClone(brief);
 const fixed=structuredClone(draft);fixed.scenes[1].narration='예를 들어 보낼 정보를 켜짐과 꺼짐으로 정했다고 해볼게요. 전기 신호가 변조기를 조절하면 원래 있던 빛의 밝기가 달라집니다. 받는 쪽은 이 변화를 전기 신호로 읽어요. 실제 변조 방식은 더 다양합니다.';
 const result=await scenarioBrief(input,{}, {generate:async prompt=>{
  calls++;if(mockReview(prompt)){reviews++;const r=mockReview(prompt,reviews===1?['mechanism','example']:[]);digests.push(r.value.digest);return r;}
  if(calls===3){assert.match(prompt,/구체적 변환 단계/);assert.match(prompt,/부수 주제를 줄여/);return {value:{...fixed,storyArc:{...draft.storyArc,payoff:{sceneId:'s2',line:'원래 있던 빛의 밝기가 달라집니다.'}}}};}
  return {value:draft};
 }});
 assert.equal(calls,4);assert.equal(result.scenes[1].narration,fixed.scenes[1].narration);assert.notEqual(digests[0],digests[1]);assert.deepEqual(input,brief);
});
test('missing, forged, prompt-only and stale evidence cannot pass',async()=>{
 const valid=await verdict();
 for(const mutate of [r=>delete r.checks.example,r=>r.checks.why.evidence=[],r=>r.checks.mechanism.evidence[0].quote='대본에 없는 실제 설명',r=>r.checks.example.evidence[0].sceneId='missing',r=>r.checks.why.evidence=[{sceneId:'s1',field:'prompt',quote:draft.scenes[0].prompt}],r=>r.digest='old']){
  const r=structuredClone(valid);mutate(r);await assert.rejects(validateDepthReview(r,brief,draft),{code:'SCENARIO_DEPTH_INVALID'});
 }
 for(const changed of [{...draft,title:'다른 약속'},{...draft,scenes:draft.scenes.slice().reverse()},{...draft,scenes:draft.scenes.map((s,i)=>i?s:{...s,prompt:'새 화면'})}])await assert.rejects(validateDepthReview(valid,brief,changed));
 await assert.rejects(validateDepthReview(valid,{...brief,duration:45},draft));
 const reordered={scenes:draft.scenes,title:draft.title};assert.equal((await reviewInput(brief,draft)).digest,(await reviewInput(brief,reordered)).digest);
});
test('malformed review fails closed without retrying blindly or accepting writer self-approval',async()=>{
 let calls=0;
 await assert.rejects(scenarioBrief(brief,{}, {generate:async()=>{calls++;return {value:{...draft,passed:true}};}}),{code:'SCENARIO_DEPTH_INVALID'});assert.equal(calls,2);
 const controller=new AbortController();controller.abort();
 await assert.rejects(scenarioBrief(brief,{}, {signal:controller.signal,generate:async()=>assert.fail('aborted')}),{name:'AbortError'});
});
test('review shares model and abort signal, reports content failure without credential blame',async()=>{
 for(const provider of ['codex','claude']){
  const controller=new AbortController();let calls=0;
  await scenarioBrief(brief,{SHOPSHORTS_CODEX_MODEL:'c',SHOPSHORTS_CLAUDE_MODEL:'a'},{provider,signal:controller.signal,generate:async(p,o)=>{calls++;assert.equal(o.model,provider==='codex'?'c':'a');assert.equal(o.signal,controller.signal);return mockReview(p)||{value:draft};}});assert.equal(calls,2);
  assert.equal(accountFailureCode(depthFailure()),'SCENARIO_DEPTH_INVALID');assert.doesNotMatch(accountFailureMessage(provider,depthFailure()),/로그인|인증|계정/);
 }
});
test('rubric protects comprehension, complete endings, user timing and genre; targets are not algorithm guarantees',()=>{
 const short=depthGuide(brief),long=depthGuide({...brief,format:'long'});
 assert.match(short,/한 질문·한 메커니즘·한 구체적 사례·완결된 답/);assert.match(short,/문장 하나씩 뽑아 연결하지/);assert.match(short,/30~45초/);assert.match(short,/사용자의 목표 시간은 유지/);assert.match(short,/1~2초/);assert.match(short,/합격선이나 확산 보장으로 주장하지/);assert.match(short,/드라마·광고 요청은 존중/);assert.match(long,/소주제마다 왜·과정·예시·한계/);assert.doesNotMatch(long,/8~10분/);
});

test('manual CLI blocks failed and stale reviews before the next production command',async t=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');
 const exec=promisify(execFile),dir=await mkdtemp(join(tmpdir(),'script-review-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const projectPath=join(dir,'project.json'),reportPath=join(dir,'review.json');
 await writeFile(projectPath,JSON.stringify({...draft,brief}));
 const cli=new URL('../studio-script-review.mjs',import.meta.url).pathname;
 const {stdout}=await exec(process.execPath,[cli,'--project',projectPath,'--prompt']);
 assert.match(stdout,/대본 독립 검토/);
 await writeFile(reportPath,JSON.stringify(mockReview(stdout).value));
 const args=[cli,'--project',projectPath,'--review',reportPath];
 assert.equal(JSON.parse((await exec(process.execPath,args)).stdout).passed,true);
 await writeFile(reportPath,JSON.stringify(mockReview(stdout,['mechanism']).value));
 await assert.rejects(exec(process.execPath,args),e=>e.code===1&&e.stderr.includes('설명이 부족'));
 await writeFile(reportPath,JSON.stringify(mockReview(stdout).value));
 await writeFile(projectPath,JSON.stringify({...draft,brief:{...brief,topic:'바뀐 질문'}}));
 await assert.rejects(exec(process.execPath,args),e=>e.code===1);
});
