import test from 'node:test';
import assert from 'node:assert/strict';
import {connectLlm} from '../public/llm-connection.js';
import {mountAiAccount,AI_ACCOUNT_PANEL} from '../public/ai-account.js';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function element(){return {hidden:true,disabled:false,textContent:'',dataset:{},addEventListener(type,fn){this[type]=fn;}};}
function fixture(initial={connected:false,available:true},options={}){
 const entries=[element(),element()],parts=Object.fromEntries(['title','description','note','connect','continue','retry','later','error'].map(k=>[k,element()]));
 const panel={hidden:true,classList:{add(){}},setAttribute(){},querySelector:s=>parts[s.slice(9,-1)]},events={},calls=[],navigations=[];
 let response=initial,connectCalls=0;
 const document={querySelectorAll:()=>entries,querySelector:()=>panel};
 const window={addEventListener(type,fn){events[type]=fn;},location:{assign:p=>navigations.push(p)}};
 const fetcher=async(path,init)=>{calls.push({path,init});if(response instanceof Error)throw response;return {ok:response!==401,status:response===401?401:200,json:async()=>response};};
 const control=mountAiAccount({document,window,fetcher,connect:async opts=>{connectCalls++;assert.deepEqual(opts,{manage:true});if(options.connectError)throw Error('offline');response={connected:true,available:true,provider:'codex'};return true;}});
 return {entries,parts,panel,events,calls,navigations,control,set:value=>response=value,get connectCalls(){return connectCalls;}};
}
test('arrival only reads status; deferring never blocks editing and connection remains available',async()=>{
 const f=fixture();await settle();assert.equal(f.panel.hidden,false);assert.equal(f.connectCalls,0);assert.ok(f.calls.every(c=>c.path==='/api/studio/llm/status'&&!c.init.method));
 f.parts.later.click();assert.equal(f.panel.hidden,true);await f.entries[1].click();assert.equal(f.connectCalls,1);assert.equal(f.entries[0].textContent,'Codex · 연결됨');assert.equal(f.panel.hidden,false);assert.equal(f.parts.continue.hidden,false);
});
test('connected Claude is shown on desktop and mobile without prompting',async()=>{
 const f=fixture({connected:true,available:true,provider:'claude'});await settle();assert.equal(f.panel.hidden,true);assert.ok(f.entries.every(e=>e.textContent==='Claude · 연결됨'));assert.equal(f.connectCalls,0);
});
test('status failure is not disconnection and a retry recovers',async()=>{
 const f=fixture(new Error('offline'));await settle();assert.equal(f.entries[0].textContent,'AI · 확인 필요');assert.equal(f.parts.connect.hidden,true);assert.equal(f.parts.retry.hidden,false);
 f.set({connected:true,available:true,provider:'claude'});await f.parts.retry.click();assert.equal(f.panel.hidden,true);assert.equal(f.entries[0].textContent,'Claude · 연결됨');
});
test('expired Google session returns to login without authorization',async()=>{
 const f=fixture(401);await settle();assert.deepEqual(f.navigations,['/login']);assert.equal(f.connectCalls,0);
});
test('offline worker preserves account and does not ask for reconnection',async()=>{
 const f=fixture({connected:true,available:false,provider:'codex'});await settle();assert.equal(f.panel.hidden,false);assert.equal(f.entries[0].textContent,'Codex · 일시 중단');assert.match(f.parts.description.textContent,/다시 연결하지 않아도/);
});
test('connection completion and page restore refresh both entries',async()=>{
 const f=fixture();await settle();f.parts.later.click();f.set({connected:true,available:true,provider:'claude'});f.events['llm-account-change']();await settle();assert.equal(f.entries[0].textContent,'Claude · 연결됨');assert.equal(f.connectCalls,0);
 f.set({connected:false,available:true});f.events.pageshow();await settle();assert.equal(f.panel.hidden,false);
});
test('dialog failure stays visible even when status lookup succeeds',async()=>{
 const f=fixture(undefined,{connectError:true});await settle();await f.entries[0].click();assert.equal(f.parts.error.hidden,false);assert.match(f.parts.error.textContent,/화면을 열지 못/);
});
test('pending authorization has a resume action and is not called connected',async()=>{
 const f=fixture({connected:false,available:true,job:{kind:'connect',state:'running'}});await settle();assert.equal(f.entries[0].textContent,'AI · 연결 중');assert.equal(f.parts.connect.textContent,'인증 이어하기');
});
test('empty onboarding slot has a reusable safe template and a studio CTA',()=>{
 assert.ok(AI_ACCOUNT_PANEL.includes('href="/studio"'));
 for(const name of ['title','description','note','connect','continue','retry','later','error'])assert.ok(AI_ACCOUNT_PANEL.includes('data-ai-'+name));
 assert.ok(!AI_ACCOUNT_PANEL.includes('onclick='));
});

test('concurrent connection entry uses one status request and notifies on completion',async t=>{
 const previousFetch=globalThis.fetch,previousWindow=globalThis.window;
 t.after(()=>{globalThis.fetch=previousFetch;if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;});
 let finish,calls=0,notifications=0;
 globalThis.fetch=async()=>{calls++;await new Promise(resolve=>finish=resolve);return {ok:true,status:200,json:async()=>({connected:true,available:true})};};
 globalThis.window={dispatchEvent:event=>{assert.equal(event.type,'llm-account-change');notifications++;}};
 const first=connectLlm(),second=connectLlm();assert.equal(first,second);assert.equal(calls,1);finish();assert.equal(await first,true);assert.equal(notifications,1);
});
