// Explicit workerd integration check: MINIFLARE_ENTRY points to an installed Miniflare module.
// Uses synthetic credentials and an outbound fixture; never calls HF or production storage.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

if(!process.env.MINIFLARE_ENTRY)throw Error('Set MINIFLARE_ENTRY to the installed Miniflare entry module');
const {Miniflare,convertV4MiniflareOptions}=await import(pathToFileURL(resolve(process.env.MINIFLARE_ENTRY)).href);
const source=await readFile(new URL('../public/kandinsky-api.js',import.meta.url),'utf8');
const host='https://kandinskylab-kandinsky-6-0-pro-distill-5s.hf.space';
const media=`${host}/gradio_api/file=/tmp/test.mp4`,calls=[];
let redirectStatus=0;
const workerSource=`import {KandinskyClient} from './client.mjs';
export default {async fetch(request){
  try {
    const client=new KandinskyClient({token:'hf_SyntheticRuntime12345',fetchImpl:fetch});
    const account=await client.checkFreeAccount();
    if(new URL(request.url).pathname==='/account')return Response.json(account);
    const eventId=await client.submit({prompt:'고양이',seed:42});
    const result=await client.wait(eventId),video=await client.download(result.url);
    return Response.json({account,eventId,prompt:result.prompt,bytes:video.size});
  } catch(e){return Response.json({error:e.message}, {status:502});}
}}`;
const options={compatibilityDate:'2026-07-01',modulesRoot:'/',modules:[
  {type:'ESModule',path:'/entry.mjs',contents:workerSource},
  {type:'ESModule',path:'/client.mjs',contents:source},
],outboundService:async request=>{
  calls.push({url:request.url,method:request.method});
  assert.equal(request.headers.get('authorization'),'Bearer hf_SyntheticRuntime12345');
  if(redirectStatus)return new Response('private upstream body',{status:redirectStatus,headers:{location:'https://untrusted.test/credential'}});
  if(request.url==='https://huggingface.co/api/whoami-v2')return Response.json({type:'user',isPro:false,canPay:false,orgs:[],name:'fixture-free'});
  if(request.url===`${host}/gradio_api/info`)return Response.json({named_endpoints:{'/generate':{parameters:['prompt','use_beautifier','seed','image'].map(parameter_name=>({parameter_name})),returns:[{},{},{},{}]}}});
  if(request.url===`${host}/gradio_api/call/generate`){assert.equal(request.method,'POST');assert.deepEqual(await request.json(),{data:['고양이',false,42,null]});return Response.json({event_id:'test123'});}
  if(request.url===`${host}/gradio_api/call/generate/test123`)return new Response(`event: complete\ndata: ${JSON.stringify([{video:{url:media}},'고양이 결과','',''])}\n\n`,{headers:{'content-type':'text/event-stream'}});
  if(request.url===media)return new Response(new Uint8Array([0,0,0,12,102,116,121,112,109,112,52,50]));
  throw Error('Unexpected outbound request');
}};
const mf=new Miniflare(convertV4MiniflareOptions?convertV4MiniflareOptions(options):options);
try {
  const response=await mf.dispatchFetch('http://local.test/generate'),body=await response.json();
  assert.equal(response.status,200,JSON.stringify(body));
  assert.deepEqual(body,{account:{anonymous:false,name:'fixture-free'},eventId:'test123',prompt:'고양이 결과',bytes:12});
  assert.equal(calls.filter(c=>c.method==='POST').length,1);
  console.log('PASS workerd: account validation → schema → one POST → SSE → MP4');
  for(const status of [301,302,303,307,308]){
    redirectStatus=status;calls.length=0;
    const response=await mf.dispatchFetch('http://local.test/account'),body=await response.json();
    assert.equal(response.status,502);assert.match(body.error,/자동 이동하지 않습니다/);
    assert(!JSON.stringify(body).includes('private upstream'));assert(!JSON.stringify(body).includes('untrusted'));
    assert.equal(calls.length,1);
  }
  console.log('PASS workerd: 5 redirect statuses blocked without forwarding credentials');
} finally {await mf.dispose();}
