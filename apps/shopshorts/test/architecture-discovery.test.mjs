import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendBrief,parseRecommendations,previousRecommendations} from '../lib/studio-recommendations.js';
import {architectureDiscoveryGuide,repeatsArchitecture} from '../lib/architecture-discovery.js';
import {accountFailureMessage} from '../lib/llm-account-errors.js';
import {architectureCaseMarkup} from '../public/architecture-case.js';
import {architectureValue} from './architecture-fixture.mjs';
import {studioApi} from '../lib/studio-api.js';
const input={category:'건축학',format:'short',duration:60,focus:'topic',topic:'국내에서 실제로 볼 수 있는 곳',direction:''};

test('both providers and automatic keywords request sourced real cases and preserve structured results',async()=>{
 for(const provider of ['codex','claude'])for(const intent of [undefined,'keywords']){
  const result=await recommendBrief({...input,...(intent?{intent}:{})},{SHOPSHORTS_CODEX_MODEL:'c',SHOPSHORTS_CLAUDE_MODEL:'a'},{provider,generate:async(prompt,options)=>{
   assert.match(prompt,/실제 사례 발견 →/);assert.match(prompt,/추가적인 행사·뉴스 검색을 멈추고/);assert.doesNotMatch(prompt,/최근 30일\([^\n]+반드시 확인/);assert.match(prompt,/국내 실제 장소만/);assert.match(prompt,/오래된 사례도/);assert.match(prompt,/1차 출처/);assert.match(prompt,/첫 3초/);assert.match(prompt,/대상 \+ 핵심 원리/);
   assert.doesNotMatch(prompt,/Falkirk|Kailasa|ICEHOTEL/);assert.equal(options.model,provider==='codex'?'c':'a');
   return {searched:true,value:architectureValue()};
  }});
  assert.equal(result.suggestions[0].caseStudy.entity,'영도대교');assert.equal(result.suggestions[0].caseStudy.sourceUrls[0],result.sources[0].url);
  if(intent)assert.equal(result.suggestions[0].keyword,'영도대교');
 }
});
test('missing case, missing source binding and unsafe source fail closed after one repair attempt',async()=>{
 for(const change of [v=>delete v.suggestions[0].caseStudy,v=>v.suggestions[0].caseStudy.sourceUrls=['https://unlisted.test'],v=>v.suggestions[0].caseStudy.sourceUrls=['javascript:alert(1)'],v=>v.suggestions[0].caseStudy.surprise='',v=>v.suggestions[0].caseStudy.entity='x'.repeat(161)]){
  let calls=0;await assert.rejects(recommendBrief(input,{}, {generate:async()=>{calls++;const value=architectureValue();change(value);return {searched:true,value};}}),e=>e.code==='RECOMMENDATION_CASE_INVALID');assert.equal(calls,2);
 }
 for(const provider of ['codex','claude'])assert.match(accountFailureMessage(provider,{code:'RECOMMENDATION_CASE_INVALID',message:'secret'}),/실제 건축 사례/);
});
test('invalid case can be repaired, while cancellation prevents a second generation',async()=>{
 let calls=0;const result=await recommendBrief(input,{}, {generate:async prompt=>{calls++;const value=architectureValue();if(calls===1)delete value.suggestions[0].caseStudy;else assert.match(prompt,/근거가 부족/);return {searched:true,value};}});
 assert.equal(calls,2);assert.equal(result.suggestions.length,3);
 const controller=new AbortController();calls=0;
 await assert.rejects(recommendBrief(input,{}, {signal:controller.signal,generate:async()=>{calls++;controller.abort();const value=architectureValue();delete value.suggestions[0].caseStudy;return {searched:true,value};}}),{name:'AbortError'});assert.equal(calls,1);
});
test('renaming a prior case still causes retry and bounded history never exposes extra fields',async()=>{
 const old=architectureValue();old.suggestions=old.suggestions.slice(0,1);old.suggestions[0].caseStudy.token='private-case-token';
 const history=[{state:'done',input,result:old}];let calls=0;
 const result=await recommendBrief(input,{}, {history,generate:async prompt=>{
  calls++;assert.doesNotMatch(prompt,/private-case-token/);const value=architectureValue();value.suggestions[0].topic='다른 제목을 썼어요';
  if(calls===2){assert.match(prompt,/직전 응답/);value.suggestions[0].caseStudy.entity='새로운 실제 시설';value.suggestions[0].caseStudy.mechanism='새로운 원리';}
  return {searched:true,value};
 }});
 assert.equal(calls,2);assert.equal(result.suggestions[0].caseStudy.entity,'새로운 실제 시설');
 assert.deepEqual(Object.keys(previousRecommendations(history,input)[0].caseStudy).sort(),['entity','location','mechanism']);
 const v=architectureValue();assert.ok(repeatsArchitecture(v.suggestions,[{topic:'부산 영도대교가 들어 올려지는 이유',direction:'과거 추천'}]));
 v.suggestions[1].caseStudy.mechanism=v.suggestions[0].caseStudy.mechanism;assert.ok(repeatsArchitecture(v.suggestions,[]));
});
test('non-architecture and direction requests retain their existing contract; old saved results still load',async()=>{
 assert.equal(architectureDiscoveryGuide({...input,category:'심리학'}),'');assert.equal(architectureDiscoveryGuide({...input,focus:'direction'}),'');
 const value=architectureValue();for(const s of value.suggestions)delete s.caseStudy;
 assert.equal(parseRecommendations(value,true,'keywords').suggestions.length,3);
 const result=await recommendBrief({...input,focus:'direction',topic:'영도대교'}, {}, {generate:async prompt=>{assert.doesNotMatch(prompt,/건축 사례 발견 기준/);return {searched:true,value};}});assert.equal(result.suggestions.length,3);
});
test('manual API returns real-case payload, cards escape model text and leave legacy results alone',async()=>{
 const request=new Request('https://studio.test/api/studio/recommendations',{method:'POST',headers:{origin:'https://studio.test','content-type':'application/json'},body:JSON.stringify(input)});
 const response=await studioApi(request,{}, {},{recommendationGenerate:async()=>({searched:true,value:architectureValue()})});assert.equal(response.status,200);
 const data=await response.json();assert.match(architectureCaseMarkup(data.suggestions[0]),/실제 사례.*영도대교/);
 const item=data.suggestions[0];item.caseStudy.surprise='<img src=x onerror=alert(1)>';assert.doesNotMatch(architectureCaseMarkup(item),/<img/);assert.match(architectureCaseMarkup(item),/&lt;img/);assert.equal(architectureCaseMarkup({topic:'old'}),'');
});
