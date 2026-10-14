import {ANSWER_CHECKS,ANSWER_VERSION} from '../../lib/research-answer.js';
// Transport fixture only; not evidence that these old scripts have editorial merit.
import {DEPTH_CHECKS,DEPTH_VERSION} from '../../lib/explanation-depth.js';
export function mockReview(prompt, failed=[]) {
 if(prompt.startsWith('조사 답변 독립 검토 '))return mockAnswerReview(prompt);
 if(!prompt.startsWith('대본 독립 검토 ')) return null;
 const input=JSON.parse(prompt.split('검토 입력 JSON:\n')[1]);
 const scene=input.draft.scenes[0];
 return {value:{version:DEPTH_VERSION,digest:input.digest,checks:Object.fromEntries(DEPTH_CHECKS.map(key=>{
  const field=key==='visuals'?'prompt':'narration';
  return [key,{pass:!failed.includes(key),reason:failed.includes(key)?'구체적 변환 단계가 빠져 설명이 이어지지 않는다.':'Transport fixture: reviewer verdict supplied by test.',evidence:[{sceneId:scene.id,field,quote:scene[field]}]}];
 }))}};
}

// Synthetic transport verdict; no claim that the fixture's research is sufficient.
export function mockAnswerReview(prompt,failed=[]){
 if(!prompt.startsWith('조사 답변 독립 검토 '))return null;
 const input=JSON.parse(prompt.split('조사 검토 입력 JSON:\n')[1]);
 return {value:{version:ANSWER_VERSION,digest:input.digest,answer:failed.length?'':'시험용 인과 답변입니다.',checks:Object.fromEntries(ANSWER_CHECKS.map(k=>[k,{pass:!failed.includes(k),reason:failed.includes(k)?'돌출 위치가 만드는 차이에 대한 근거가 없습니다.':'Transport fixture only.',evidence:[{factIndex:0,quote:input.input.research.facts[0].claim}]}]))}};
}
