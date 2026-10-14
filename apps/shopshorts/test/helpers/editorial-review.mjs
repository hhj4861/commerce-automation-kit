// Transport fixture only; not evidence that these old scripts have editorial merit.
import {DEPTH_CHECKS,DEPTH_VERSION} from '../../lib/explanation-depth.js';
export function mockReview(prompt, failed=[]) {
 if(!prompt.startsWith('대본 독립 검토 ')) return null;
 const input=JSON.parse(prompt.split('검토 입력 JSON:\n')[1]);
 const scene=input.draft.scenes[0];
 return {value:{version:DEPTH_VERSION,digest:input.digest,checks:Object.fromEntries(DEPTH_CHECKS.map(key=>{
  const field=key==='visuals'?'prompt':'narration';
  return [key,{pass:!failed.includes(key),reason:failed.includes(key)?'구체적 변환 단계가 빠져 설명이 이어지지 않는다.':'Transport fixture: reviewer verdict supplied by test.',evidence:[{sceneId:scene.id,field,quote:scene[field]}]}];
 }))}};
}
