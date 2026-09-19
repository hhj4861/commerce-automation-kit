import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendBrief,parseRecommendations,recommendationInput} from '../lib/studio-recommendations.js';
import {studioApi} from '../lib/studio-api.js';

const input={category:'심리학',format:'short',duration:32,focus:'topic',topic:'',direction:'차분한 설명'};
const now=new Date('2026-09-19T00:00:00Z');
const candidate=()=>({finishReason:'STOP',content:{parts:[{text:JSON.stringify({suggestions:Array.from({length:3},(_,i)=>({topic:`주제 ${i+1}`,direction:'따뜻한 분위기',reason:'최근 관심사에서 착안한 기획'}))})}]},groundingMetadata:{webSearchQueries:['심리학 최근 관심사'],groundingChunks:[{web:{uri:'https://example.org/research',title:'자료'}},{web:{uri:'javascript:alert(1)',title:'unsafe'}}],searchEntryPoint:{renderedContent:'<div>Google 검색</div>'}}});
test('recommendation inputs retain category/format/focus and reject missing custom topic',()=>{
 assert.deepEqual(recommendationInput(input),input);
 for(const patch of [{category:'unknown'},{category:'직접 입력'},{focus:'direction'},{focus:'all'},{duration:601},{duration:1},{topic:1},{direction:'x'.repeat(2001)}])assert.throws(()=>recommendationInput({...input,...patch}));
 assert.equal(recommendationInput({...input,category:'직접 입력',topic:'정원 건축'}).topic,'정원 건축');
});
test('official search is restricted to recent 30 days and paid generation is one explicit request',async()=>{
 let calls=0;
 const data=await recommendBrief(input,{GEMINI_API_KEY:'fixture'}, {now,fetcher:async(url,options)=>{
  calls++;assert.match(url,/models\/gemini-2.5-flash:generateContent$/);assert.equal(options.headers['x-goog-api-key'],'fixture');
  const body=JSON.parse(options.body);assert.deepEqual(body.tools,[{googleSearch:{timeRangeFilter:{startTime:'2026-08-20T00:00:00.000Z',endTime:now.toISOString()}}}]);
  assert.match(body.contents[0].parts[0].text,/심리학/);assert.match(body.contents[0].parts[0].text,/차분한 설명/);assert.equal(body.generationConfig.responseMimeType,undefined);
  return Response.json({candidates:[candidate()]});
 }});
 assert.equal(calls,1);assert.equal(data.suggestions.length,3);assert.deepEqual(data.sources,[{title:'자료',url:'https://example.org/research'}]);assert.equal(data.checkedAt,now.toISOString());
});
test('ungrounded output, malformed JSON and incomplete suggestions fail rather than posing as trends',()=>{
 const noSearch=candidate();delete noSearch.groundingMetadata;assert.throws(()=>parseRecommendations(noSearch),/검색 근거/);
 const noQueries=candidate();noQueries.groundingMetadata.webSearchQueries=[];assert.throws(()=>parseRecommendations(noQueries),/검색 근거/);
 for(const text of ['not JSON','{"suggestions":[]}','{"suggestions":[{}, {}, {}]}']){const c=candidate();c.content.parts[0].text=text;assert.throws(()=>parseRecommendations(c));}
 const fenced=candidate();fenced.content.parts[0].text='```json\n'+fenced.content.parts[0].text+'\n```';assert.equal(parseRecommendations(fenced).suggestions.length,3);
});
test('missing key, provider failure, timeout and blocked response remain explicit without secrets',async()=>{
 let calls=0;await assert.rejects(recommendBrief(input,{}, {fetcher:()=>{calls++;}}),/GEMINI_API_KEY/);assert.equal(calls,0);
 await assert.rejects(recommendBrief(input,{GEMINI_API_KEY:'secret'},{fetcher:async()=>new Response('secret',{status:429})}),e=>e.status===429&&!e.message.includes('secret'));
 await assert.rejects(recommendBrief(input,{GEMINI_API_KEY:'secret'},{fetcher:async()=>{throw Error('secret');}}),e=>e.status===504&&!e.message.includes('secret'));
 await assert.rejects(recommendBrief(input,{GEMINI_API_KEY:'secret'},{fetcher:async()=>Response.json({candidates:[{...candidate(),finishReason:'MAX_TOKENS'}]})}),/완료되지/);
});
test('recommendation endpoint requires same origin and never creates or changes a project',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return Response.json({candidates:[candidate()]});};
 const request=origin=>new Request('https://studio.test/api/studio/recommendations',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(input)});
 const env={GEMINI_API_KEY:'fixture'},store={};
 assert.equal((await studioApi(request('https://evil.test'),env,store,{recommendationFetch:fetcher})).status,403);assert.equal(calls,0);
 const r=await studioApi(request('https://studio.test'),env,store,{recommendationFetch:fetcher});assert.equal(r.status,200);assert.equal((await r.json()).suggestions.length,3);assert.equal(calls,1);
});
