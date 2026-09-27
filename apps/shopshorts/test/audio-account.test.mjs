import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudioAccountReader,sanitizeAudioAccount} from '../lib/audio-account.js';
import {voiceAccountInfo,MUSIC_SOURCES} from '../public/audio-resources.js';
test('read-only subscription lookup is cached and exposes only usage fields',async()=>{
 let calls=0,now=Date.now();
 const read=createAudioAccountReader({ELEVENLABS_API_KEY:'secret'},async(url,options)=>{
  calls++;assert.equal(url,'https://api.elevenlabs.io/v1/user/subscription');assert.equal(options.method,undefined);assert.equal(options.headers['xi-api-key'],'secret');
  return Response.json({tier:'creator',character_count:40,character_limit:100,open_invoices:[{sensitive:true}],api_key:'do-not-expose'});
 },()=>now);
 const [a,b]=await Promise.all([read(),read()]);assert.deepEqual(a,b);assert.equal(calls,1);assert.equal(a.remaining,60);
 assert.deepEqual(Object.keys(a).sort(),['checkedAt','limit','remaining','state','tier','used']);
 await read();assert.equal(calls,1);now+=300001;await read();assert.equal(calls,2);
 assert.match(voiceAccountInfo({audioAccount:a},now).note,/60/);
 assert.match(voiceAccountInfo({audioAccount:a},now+600001).title,/更新|갱신/);
});
test('missing keys, API errors and malformed responses never claim free access',async()=>{
 const missing=await createAudioAccountReader({},()=>{throw Error('should not fetch');})();assert.equal(missing.state,'disconnected');
 for(const response of [new Response('secret upstream error',{status:403}),Response.json({tier:'free'}),Response.json({tier:'free',character_count:-1,character_limit:100})]){
  const result=await createAudioAccountReader({ELEVENLABS_API_KEY:'key'},async()=>response)();assert.equal(result.state,'unavailable');assert.equal(result.remaining,undefined);
 }
 const failed=await createAudioAccountReader({ELEVENLABS_API_KEY:'key'},async()=>{throw Error('secret');})();assert.equal(failed.state,'unavailable');
});
test('heartbeat sanitizer drops secrets, forged remainder and arbitrary fields',()=>{
 const a=sanitizeAudioAccount({state:'ready',checkedAt:new Date().toISOString(),tier:'free',used:110,limit:100,remaining:999,apiKey:'secret'});
 assert.equal(a.remaining,0);assert.equal(a.apiKey,undefined);assert.match(voiceAccountInfo({audioAccount:a}).note,/상업 이용이 지원되지/);
 assert.equal(sanitizeAudioAccount({state:'ready',tier:'<script>',used:'0',limit:null}).tier,'unknown');
 assert.equal(sanitizeAudioAccount({state:'ready',used:'0',limit:null}).remaining,null);
 assert.ok(MUSIC_SOURCES.every(s=>s.url.startsWith('https://')&&s.terms.startsWith('https://')));
});
