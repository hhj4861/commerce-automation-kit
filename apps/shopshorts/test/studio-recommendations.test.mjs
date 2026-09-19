import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendBrief,parseRecommendations,recommendationInput} from '../lib/studio-recommendations.js';
import {studioApi} from '../lib/studio-api.js';

const input={category:'심리학',format:'short',duration:32,focus:'topic',topic:'',direction:'차분한 설명'};
const now=new Date('2026-09-19T00:00:00Z');
const value=()=>({suggestions:Array.from({length:3},(_,i)=>({topic:`주제 ${i+1}`,direction:'따뜻한 분위기',reason:'최근 관심사에서 착안한 기획'})),sources:[{url:'https://example.org/research',title:'자료'},{url:'javascript:alert(1)',title:'unsafe'}]});
test('recommendation inputs retain category/format/focus and reject missing custom topic',()=>{
 assert.deepEqual(recommendationInput(input),input);
 for(const patch of [{category:'unknown'},{category:'직접 입력'},{focus:'direction'},{focus:'all'},{duration:601},{duration:1},{topic:1},{direction:'x'.repeat(2001)}])assert.throws(()=>recommendationInput({...input,...patch}));
 assert.equal(recommendationInput({...input,category:'직접 입력',topic:'정원 건축'}).topic,'정원 건축');
});
test('Codex receives recent 30-day research context and returns three explicit suggestions',async()=>{
 let calls=0;
 const data=await recommendBrief(input,{SHOPSHORTS_CODEX_MODEL:'configured-model'}, {now,generate:async(prompt,options)=>{
  calls++;assert.match(prompt,/2026-08-20/);assert.match(prompt,/2026-09-19/);assert.match(prompt,/심리학/);assert.match(prompt,/차분한 설명/);
  assert.equal(options.model,'configured-model');return {value:value(),searched:true};
 }});
 assert.equal(calls,1);assert.equal(data.provider,'codex');assert.equal(data.suggestions.length,3);assert.deepEqual(data.sources,[{title:'자료',url:'https://example.org/research'}]);assert.equal(data.checkedAt,now.toISOString());
});
test('no actual search, missing sources and malformed suggestions cannot pose as trends',()=>{
 assert.throws(()=>parseRecommendations(value(),false),/검색 근거/);
 assert.throws(()=>parseRecommendations({...value(),sources:[]},true),/검색 출처/);
 for(const suggestions of [[],[{}, {}, {}]])assert.throws(()=>parseRecommendations({...value(),suggestions},true));
 assert.throws(()=>parseRecommendations(null,true));
});
test('cloud without local Codex bridge fails explicitly, no Gemini fallback',async()=>{
 await assert.rejects(recommendBrief(input,{GEMINI_API_KEY:'not-used'}),e=>e.status===503&&e.message.includes('로컬 제작 서버'));
});
test('recommendation endpoint requires same origin and never changes a project',async()=>{
 let calls=0;const generate=async()=>{calls++;return {value:value(),searched:true};};
 const request=origin=>new Request('https://studio.test/api/studio/recommendations',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(input)});
 assert.equal((await studioApi(request('https://evil.test'),{},{},{recommendationGenerate:generate})).status,403);assert.equal(calls,0);
 const r=await studioApi(request('https://studio.test'),{},{},{recommendationGenerate:generate});assert.equal(r.status,200);assert.equal((await r.json()).suggestions.length,3);assert.equal(calls,1);
 assert.equal((await studioApi(request('https://studio.test'),{},{})).status,503);
});
