import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {KandinskyClient, HOST, validateInput, videoUrl} from '../public/kandinsky-api.js';
import {navigationLinks} from '../public/studio-navigation.js';
const schema = {named_endpoints:{'/generate':{parameters:['prompt','use_beautifier','seed','image'].map(parameter_name=>({parameter_name})),returns:[{},{},{},{}]}}};
const url = `${HOST}/gradio_api/file=/tmp/gradio/abc/video.mp4`;
const json = value => Response.json(value);
const events = text => new Response(new ReadableStream({start(controller) {
  const bytes = new TextEncoder().encode(text);
  for(let i=0;i<bytes.length;i+=7)controller.enqueue(bytes.slice(i,i+7)); controller.close();
}}));
test('input validation rejects empty, oversized, fractional and negative seed', () => {
  for(const input of [{prompt:' ',seed:1},{prompt:'x'.repeat(4001),seed:1},{prompt:'x',seed:1.5},{prompt:'x',seed:-1},{prompt:'x',seed:''}]) assert.throws(()=>validateInput(input));
  assert.deepEqual(validateInput({prompt:' 장면 ',seed:'42'}),{prompt:'장면',seed:42,beautify:false});
});
test('official API request, image upload, receipt and chunked UTF8 SSE result', async () => {
  const calls=[];let intent=false;
  const c=new KandinskyClient({fetchImpl:async(u,o)=>{
    calls.push([u,o]);assert.equal(o.credentials,'omit');assert.equal(o.redirect,'manual');
    if(u.endsWith('/info'))return json(schema);
    if(u.endsWith('/upload')) {assert(o.body instanceof FormData);return json(['/tmp/upload/cat.png']);}
    if(u.endsWith('/call/generate')) {assert(intent);assert.deepEqual(JSON.parse(o.body).data,['고양이',false,42,{path:'/tmp/upload/cat.png',meta:{_type:'gradio.FileData'}}]);return json({event_id:'abc123'});}
    return events(`event: heartbeat\r\ndata: null\r\n\r\nevent: complete\r\ndata: ${JSON.stringify([{video:{url}},'고양이 설명','<script>bad()</script>','private timings'])}\r\n\r\n`);
  }});
  const id=await c.submit({prompt:'고양이',seed:42},new File(['png'],'cat.png',{type:'image/png'}),()=>intent=true);
  let progress=0;
  assert.deepEqual(await c.wait(id,()=>progress++),{url,prompt:'고양이 설명'});assert.equal(progress,1);assert.equal(calls.length,4);
});
test('only verified non-billable personal accounts can submit; no provider secrets returned', async () => {
  for(const user of [{type:'user',isPro:true,canPay:true,orgs:[]},{type:'user',isPro:false,canPay:false,orgs:[{canPay:true}]},{type:'user',isPro:false,orgs:[]},{type:'org',isPro:false,canPay:false,orgs:[]}]){
    let calls=0;const c=new KandinskyClient({token:'hf_12345678901',fetchImpl:async()=>{calls++;return json(user);}});
    await assert.rejects(()=>c.submit({prompt:'x',seed:1}),/무료 계정/);assert.equal(calls,1);
  }
  const c=new KandinskyClient({token:'hf_12345678901',fetchImpl:async(u,o)=>{assert.equal(u,'https://huggingface.co/api/whoami-v2');assert.equal(o.headers.get('authorization'),'Bearer hf_12345678901');return json({type:'user',isPro:false,canPay:false,orgs:[],name:'free'});}});
  assert.deepEqual(await c.checkFreeAccount(),{anonymous:false,name:'free'});
});
test('injected native fetch is invoked without a client receiver', async () => {
  const c=new KandinskyClient({fetchImpl:async function(){assert.equal(this,undefined);return json({ok:true});}});
  assert.deepEqual(await (await c.request(`${HOST}/gradio_api/info`)).json(),{ok:true});
});
test('redirect responses are closed without following or exposing their body/location', async () => {
  for(const status of [301,302,303,307,308]) {
    let calls=0,cancelled=false;
    const c=new KandinskyClient({token:'hf_12345678901',fetchImpl:async(u,init)=>{
      calls++;assert.equal(init.redirect,'manual');
      return new Response(new ReadableStream({cancel(){cancelled=true;}}),{status,headers:{location:'https://untrusted.test/private'}});
    }});
    await assert.rejects(()=>c.checkFreeAccount(),error=>/자동 이동하지 않습니다/.test(error.message)&&!error.message.includes('untrusted'));
    assert.equal(calls,1);assert.equal(cancelled,true);
  }
  const c=new KandinskyClient({fetchImpl:async()=>({status:0,type:'opaqueredirect'})});
  await assert.rejects(()=>c.checkSchema(),/자동 이동하지 않습니다/);
});
test('schema drift blocks upload and generation', async () => {
  let calls=0;const c=new KandinskyClient({fetchImpl:async()=>{calls++;return json({named_endpoints:{}});}});
  await assert.rejects(()=>c.submit({prompt:'x',seed:0}),/입력 규격/);assert.equal(calls,1);
});
test('quota error and uncertain POST are never retried', async () => {
  let calls=0,intent=0;
  const c=new KandinskyClient({fetchImpl:async u=>{calls++;if(u.endsWith('/info'))return json(schema);return new Response('GPU quota exceeded',{status:429});}});
  await assert.rejects(()=>c.submit({prompt:'x',seed:0},null,()=>intent++),/무료 GPU 한도/);assert.equal(calls,2);assert.equal(intent,1);
  c.fetch=async u=>{if(u.endsWith('/info'))return json(schema);throw new TypeError('connection lost');};
  await assert.rejects(()=>c.submit({prompt:'x',seed:0},null,()=>intent++),/connection lost/);assert.equal(intent,2);
});
test('SSE errors, disconnection, untrusted URLs and invalid event ids fail explicitly', async () => {
  for(const body of ['event: error\ndata: "quota exceeded"\n\n','event: heartbeat\ndata: null\n\n']){
    const c=new KandinskyClient({fetchImpl:async()=>events(body)});await assert.rejects(()=>c.wait('abc'));
  }
  for(const u of ['https://evil.test/video.mp4',`${HOST}/other`,`${HOST}.evil.test/gradio_api/file=x`,'javascript:alert(1)'])assert.throws(()=>videoUrl(u));
  const c=new KandinskyClient({fetchImpl:()=>{throw new Error('must not fetch');}});await assert.rejects(()=>c.wait('../other'),/접수 번호/);
});
test('downloads only official MP4 and rejects HTML responses', async () => {
  const c=new KandinskyClient({fetchImpl:async()=>new Response(new Uint8Array([0,0,0,12,102,116,121,112,109,112,52,50]))});
  assert.equal((await c.download(url)).type,'video/mp4');
  c.fetch=async()=>new Response('<html>expired</html>');await assert.rejects(()=>c.download(url),/MP4 영상/);
});
test('oversized/unsupported image rejected without uploading', async () => {
  const c=new KandinskyClient({fetchImpl:()=>{throw new Error('unexpected request');}});
  await assert.rejects(()=>c.upload(new File(['x'],'x.svg',{type:'image/svg+xml'})),/10MB/);
});
test('new route appears once in shared menu; sidebar current page follows route', () => {
  const nav=navigationLinks('/kandinsky');assert.equal((nav.match(/href="\/kandinsky"/g)||[]).length,1);assert.match(nav,/href="\/kandinsky" aria-current="page"/);
  const root=new URL('../',import.meta.url);
  for(const page of ['index.html','studio.html'])assert.match(readFileSync(new URL('public/'+page,root),'utf8'),/href="\/kandinsky"/);
  assert.match(readFileSync(new URL('server.mjs',root),'utf8'),/'\/kandinsky':\['kandinsky.html'/);
});
