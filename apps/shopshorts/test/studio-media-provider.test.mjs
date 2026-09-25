import test from 'node:test';
import assert from 'node:assert/strict';
import {googleMediaRequest} from '../studio-runner.mjs';

test('media authentication failures are actionable and never include provider body or secret',async()=>{
 for(const status of [401,403]) {
  await assert.rejects(googleMediaRequest('models/test',{}, {GEMINI_API_KEY:'private-fixture'}, async()=>new Response('private-fixture',{status})),error=>{
   assert.match(error.message,/미디어 생성 인증/);assert.match(error.message,/관리자/);assert.doesNotMatch(error.message,/private-fixture/);return true;
  });
 }
 let called=false;
 await assert.rejects(googleMediaRequest('models/test',{}, {},async()=>{called=true;}),/설정되지/);
 assert.equal(called,false);
});
test('limits are distinct from authentication; valid calls preserve the provider request and output',async()=>{
 await assert.rejects(googleMediaRequest('models/test',{}, {GEMINI_API_KEY:'fixture'},async()=>new Response('',{status:429})),/한도/);
 const output=await googleMediaRequest('models/test',{contents:[]},{GEMINI_API_KEY:'fixture'},async(url,options)=>{
  assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/test');
  assert.equal(options.headers['x-goog-api-key'],'fixture');assert.equal(options.method,'POST');
  return Response.json({candidates:[]});
 });
 assert.deepEqual(output,{candidates:[]});
});
