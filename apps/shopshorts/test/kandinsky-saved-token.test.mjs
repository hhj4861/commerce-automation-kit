import test from 'node:test';
import assert from 'node:assert/strict';
import {kandinskyApi} from '../lib/kandinsky-service.js';
import {huggingFaceAccount} from '../../credential-broker/huggingface.mjs';
import {readVault} from '../../credential-broker/vault.mjs';
import {handleRequest} from '../../credential-broker/index.mjs';
import {HOST} from '../public/kandinsky-api.js';
import {llmOwner} from '../lib/llm-account-api.js';
import {signSession} from '../lib/google-auth.js';
import {onRequest as cloudApi} from '../functions/api/[[path]].js';

import {fixture} from './fixtures/kandinsky.mjs';

test('save validates free account; ciphertext only; reload returns masked status, never token',async()=>{
  const f=fixture();const r=await f.save();assert.equal(r.status,200);assert.match(await r.text(),/fixture-free/);
  assert(!JSON.stringify([...f.rows]).includes(f.token));
  const status=await f.api('account');assert.equal(status.headers.get('cache-control'),'private, no-store');assert.doesNotMatch(await status.text(),/hf_|payload|revision/);
  const owner=await llmOwner(f.request('account'),f.env);assert.equal((await readVault(f.env,`huggingface/${owner}`)).value.token,f.token);
  assert.equal((await f.call('a'.repeat(64),'status')).configured,false);
  await f.api('account','DELETE');assert.equal((await(await f.api('account')).json()).configured,false);
});
test('authentication, CSRF and unrecognized routes cannot read or mutate tokens',async()=>{
  const f=fixture();
  assert.equal((await f.api('account','GET',null,{cookie:''})).status,401);
  assert.equal((await f.api('account','DELETE',null,{origin:'https://evil.test'})).status,403);
  assert.equal((await f.api('credential')).status,404);
  assert.equal(f.calls.length,0);
});
test('paid or invalid token never persists, oversized account payload is bounded',async()=>{
  const f=fixture();f.setMode('paid');assert.equal((await f.save()).status,502);assert.equal(f.rows.size,0);
  assert.equal((await f.api('account','PUT',{token:'bad'},{'content-type':'application/json'})).status,400);
  assert.equal((await f.api('account','PUT',{token:'x'.repeat(5000)},{'content-type':'application/json'})).status,413);
});
test('saved token drives submit, SSE completion, authenticated media and GET-only reload',async()=>{
  const f=fixture();await f.save();const submitted=await f.generate();assert.equal(submitted.status,202);const {job}=await submitted.json();
  assert.equal((await f.api('account','DELETE')).status,409);
  assert.equal((await f.generate()).status,409);
  const result=await f.api(`result?id=${job.id}`);assert.match(await result.text(),/"complete":true/);
  const status=await(await f.api('account')).json();assert.equal(status.job.phase,'complete');assert(!JSON.stringify(status).includes(HOST));
  assert.equal((await f.api(`media?id=${job.id}`)).status,200);
  assert.match(await(await f.api(`result?id=${job.id}`)).text(),/complete/);
  assert.equal(f.calls.filter(x=>x.url.endsWith('/call/generate')).length,1);
  assert.equal((await f.api('media?id=other')).status,404);
  assert.equal((await f.api(`media?id=${job.id}`,'GET',null,{range:'bytes=0-1,2-3'})).status,416);
  await f.api('clear','POST',{id:job.id},{'content-type':'application/json'});
  assert.equal((await f.api('account','DELETE')).status,200);
});
test('lost POST response remains uncertain, blocks resubmit and credential replacement',async()=>{
  const f=fixture();await f.save();f.setMode('uncertain');assert.equal((await f.generate()).status,502);
  const {job}=await(await f.api('account')).json();assert.equal(job.phase,'uncertain');
  assert.equal((await f.generate()).status,409);assert.equal((await f.save()).status,409);
  assert.equal(f.calls.filter(x=>x.url.endsWith('/call/generate')).length,1);
  assert.equal((await f.api(`result?id=${job.id}`)).status,409);
});
test('certificate failure is diagnosed before generation, quota errors remain sanitized',async()=>{
  const f=fixture();await f.save();f.setMode('tls');const failed=await f.generate();assert.match(await failed.text(),/인증서/);
  assert(!f.calls.some(x=>x.url.endsWith('/call/generate')));
  let {job}=await(await f.api('account')).json();assert.equal(job.phase,'failed');await f.api('clear','POST',{id:job.id},{'content-type':'application/json'});
  f.setMode('quota');({job}=await(await f.generate()).json());assert.match(await(await f.api(`result?id=${job.id}`)).text(),/무료 GPU 한도/);
});
test('concurrent reservations allow one POST only; stale operations never overwrite new job',async()=>{
  const f=fixture();await f.save();const results=await Promise.all([f.generate(),f.generate()]);assert.deepEqual(results.map(r=>r.status).sort(),[202,409]);
  assert.equal(f.calls.filter(x=>x.url.endsWith('/call/generate')).length,1);
  const owner=await llmOwner(f.request('account'),f.env);const {job}=await f.call(owner,'status');
  await f.call(owner,'clear',{id:job.id});await assert.rejects(f.call(owner,'update',{id:job.id,expected:'submitted',phase:'complete'}),{status:409});
});
test('signed runner route is required; no anonymous credential access',async()=>{
  const f=fixture(),url='https://broker.test/runner/huggingface';
  const make=token=>new Request(url,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer test'}:{})},body:JSON.stringify({owner:'a'.repeat(64),operation:'status'})});
  assert.equal((await handleRequest(make(false),f.env)).status,401);
  assert.equal((await handleRequest(make(true),f.env,{runner:async()=>{throw Error('invalid');}})).status,403);
  assert.equal((await handleRequest(make(true),f.env,{runner:async()=>({})})).status,200);
});

test('Google users are isolated even with forged owner; Pages routing preserves the authenticated identity',async()=>{
  const f=fixture();f.env.SHOPSHORTS_SESSION_SECRET='test-session-secret'.repeat(3);f.env.SHOPSHORTS_GOOGLE_ALLOW_SIGNUPS='1';
  const cookies=await Promise.all(['alice','bob'].map(sub=>signSession({type:'user',sub,email:sub+'@test.invalid',exp:Date.now()+60000},f.env)));
  const owner=await llmOwner(f.request('account','GET',null,{cookie:`ss_google=${cookies[0]}`}),f.env);
  await f.call(owner,'save',{token:f.token,name:'alice'});
  const state=await f.call(owner,'credential');await f.call(owner,'reserve',{id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',revision:state.revision});
  const env={...f.env,CREDENTIALS:{huggingFaceAccount:f.call}};
  const alice=await cloudApi({request:f.request('account','GET',null,{cookie:`ss_google=${cookies[0]}`}),env});
  assert.equal((await alice.json()).configured,true);
  const bob=await cloudApi({request:f.request('account?owner='+owner,'GET',null,{cookie:`ss_google=${cookies[1]}`}),env});
  assert.equal((await bob.json()).configured,false);
  const media=await cloudApi({request:f.request('media?id=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','GET',null,{cookie:`ss_google=${cookies[1]}`}),env});
  assert.equal(media.status,428);assert.equal(f.calls.length,0);
});
test('failed durable intent never reaches provider POST; invalid image never reserves a job',async()=>{
  const f=fixture();await f.save();const form=new FormData();form.set('prompt','cat');form.set('seed','42');form.set('image',new File(['<svg/>'],'x.svg',{type:'image/svg+xml'}));
  assert.equal((await f.api('generate','POST',form)).status,400);assert.equal((await f.call(await llmOwner(f.request('account'),f.env),'status')).job,null);
  form.delete('image');
  const failing=(owner,op,input)=>{if(op==='update')throw Error('private database detail: '+f.token);return f.call(owner,op,input);};
  const failure=await kandinskyApi(f.request('generate','POST',form),f.env,failing,{fetcher:f.fetcher});
  assert.equal(failure.status,502);assert.doesNotMatch(await failure.text(),/private database|hf_/);
  assert(!f.calls.some(x=>x.url.endsWith('/call/generate')));
});
test('media type/size and arbitrary URLs are not trusted',async()=>{
  const f=fixture();await f.save();const {job}=await(await f.generate()).json();await(await f.api(`result?id=${job.id}`)).text();
  const run=fetcher=>kandinskyApi(f.request(`media?id=${job.id}`),f.env,f.call,{fetcher});
  assert.equal((await run(async()=>new Response('large',{headers:{'content-length':String(61*1024*1024)}}))).status,413);
  const invalid=await run(async()=>new Response('<html>not an mp4</html>'));await assert.rejects(invalid.arrayBuffer(),/invalid MP4/);
  assert.equal((await f.api('media?id=https://evil.test')).status,404);
});
