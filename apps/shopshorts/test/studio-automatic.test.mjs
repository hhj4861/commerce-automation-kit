import {architectureValue} from './architecture-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {studioApi} from '../lib/studio-api.js';
import {continueAutomatic} from '../lib/studio-automatic.js';
import {createProject,changeProject} from '../lib/studio.js';
import {recommendationInput,recommendBrief,parseRecommendations} from '../lib/studio-recommendations.js';
import {automaticStatus} from '../public/automatic-creation.js';
const input={intent:'keywords',category:'심리학',format:'short',duration:24,focus:'topic',topic:'',direction:''};
const recommendationId='11111111-1111-1111-1111-111111111111';
const result={intent:'keywords',checkedAt:'2026-09-27T00:00:00Z',suggestions:['감정 알아차리기','결정 피로','주의 회복'].map(keyword=>({keyword,topic:keyword+'의 일상 속 원리',direction:'차분한 설명',reason:'최근 연구의 질문을 일상의 예시로 설명'})),sources:[{url:'https://example.org/research',title:'연구 자료'}]};
const scenes=[{id:'scene-1',kind:'image',narration:'피곤한 날에는 익숙한 질문도 부담스러울 수 있어요.',prompt:'책상 앞에서 쉬는 부모',duration:12},{id:'scene-2',kind:'image',narration:'잠시 멈추고 내 감정을 먼저 알아차려 보세요.',prompt:'창가에서 숨을 고르는 부모',duration:12}];
function fixture({unavailable=false,savedInput=input,savedResult=result}={}){
 const items=new Map();let scenarioCalls=0,recommendationCalls=0;
 const store={list:async()=>structuredClone([...items.values()]),get:async id=>structuredClone(items.get(id)),create:async p=>{if(items.has(p.id))throw Error('duplicate');items.set(p.id,structuredClone(p));},cas:async(p,revision)=>{if(items.get(p.id)?.revision!==revision)return false;items.set(p.id,structuredClone(p));return true;}};
 const call=async(owner,operation,body)=>{
  assert.match(owner,/^[a-f0-9]{64}$/);assert.notEqual(owner,'browser-owner');
  if(operation==='recommendation'){recommendationCalls++;return {recommendation:{id:recommendationId,input:savedInput,state:'done',result:savedResult}};}
  if(operation==='status')return {connected:true,available:!unavailable,scenarioAvailable:true};
  if(operation==='scenario'){scenarioCalls++;return {job:{id:body.id,state:'queued'}};}
  if(operation==='scenario-status')return {job:null};
  return {};
 };
 const request=async(path,body,{token=true,origin='https://studio.test',localWorker=false}={})=>{
  const response=await studioApi(new Request('https://studio.test/api/studio'+path,{method:body?'POST':'GET',headers:{origin,'content-type':'application/json',...(token?{cookie:'ss=fixture-token'}:{})},...(body?{body:JSON.stringify(body)}:{})}),{SHOPSHORTS_TOKEN:'fixture-token'},store,{scenarioAccounts:call,localWorker});
  return {status:response.status,...await response.json()};
 };
 return {items,store,request,calls:()=>({scenarioCalls,recommendationCalls})};
}
test('all manual categories support keyword research with real search evidence and explicit keyword fields',async()=>{
 for(const category of ['심리학','건축학','상품광고','막장드라마','역사','과학','직접 입력']){
  const value=await recommendBrief({...input,category,topic:category==='직접 입력'?'정원':''},{},{generate:async prompt=>{assert.match(prompt,/keyword 필드/);assert.ok(prompt.includes(category));return {searched:true,value:category==='건축학'?architectureValue():result};}});
  assert.equal(value.intent,'keywords');assert.equal(value.suggestions[0].keyword,category==='건축학'?'영도대교':'감정 알아차리기');
 }
 assert.throws(()=>parseRecommendations(result,false,'keywords'),/검색 근거/);
 assert.throws(()=>parseRecommendations({...result,suggestions:result.suggestions.map(s=>({...s,keyword:undefined}))},true,'keywords'));
 assert.throws(()=>parseRecommendations({...result,suggestions:result.suggestions.map(s=>({...s,keyword:'같은 키워드'}))},true,'keywords'));
 assert.throws(()=>recommendationInput({...input,intent:'unknown'}));
});
test('automatic project uses owner-scoped saved result, starts scenario and deduplicates concurrent requests',async()=>{
 const f=fixture();const payload={recommendationId,index:1,owner:'browser-owner',category:'malicious',topic:'forged'};
 const responses=await Promise.all([f.request('/automatic',payload),f.request('/automatic',payload)]);
 assert.deepEqual(responses.map(r=>r.status),[201,201]);assert.equal(f.items.size,1);assert.equal(f.calls().scenarioCalls,1);
 const p=await f.store.get(responses[0].project.id);assert.equal(p.brief.category,'심리학');assert.equal(p.brief.topic,result.suggestions[1].topic);assert.equal(p.automation.keyword,'결정 피로');assert.equal(p.task.action,'scenario');assert.equal(p.approved,false);
 const retried=await f.request('/automatic',payload);assert.equal(retried.project.id,p.id);assert.equal(f.calls().scenarioCalls,1);
});
test('automatic start validates origin, login and selected keyword and saves recoverable project on offline runner',async()=>{
 const f=fixture();const body={recommendationId,index:0};
 assert.equal((await f.request('/automatic',body,{token:false})).status,401);
 assert.equal((await f.request('/automatic',body,{origin:'https://evil.test'})).status,403);
 assert.equal((await f.request('/automatic',{...body,index:9})).status,400);assert.equal(f.items.size,0);
 const offline=fixture({unavailable:true});const response=await offline.request('/automatic',body);assert.equal(response.status,201);assert.match(response.error,/오프라인/);assert.equal(offline.items.size,1);assert.equal(response.project.task,null);
});
test('worker completes media and queues render atomically; browser cannot complete; final publish remains reviewed',async()=>{
 const f=fixture();let p={...createProject({...input,topic:"감정 알아차리기"}),scenes,automation:{version:1,keyword:'감정'},approved:false};await f.store.create(p);
 assert.equal((await f.request(`/${p.id}/media`,{revision:0})).status,400);
 let response=await f.request(`/${p.id}/media`,{revision:0,approved:true});p=response.project;assert.equal(p.task.action,'media');
 p=(await f.request(`/${p.id}/claim`,{revision:p.revision},{localWorker:true})).project;
 const body={revision:p.revision,taskId:p.task.id,result:{assets:Object.fromEntries(scenes.map(s=>[s.id,{key:`studio/${p.id}/${s.id}.png`,kind:'image'}]))}};
 assert.equal((await f.request(`/${p.id}/complete`,body)).status,403);
 p=(await f.request(`/${p.id}/complete`,body,{localWorker:true})).project;
 assert.equal(p.task.action,'render');assert.equal(p.task.state,'queued');assert.equal(p.edit.clips.length,2);assert.equal(p.edit.captions.length,2);assert.notEqual(p.edit.voice,'none');assert.equal(p.upload,null);
 assert.equal((await f.request(`/${p.id}/complete`,body,{localWorker:true})).status,409);
 p=(await f.request(`/${p.id}/claim`,{revision:p.revision},{localWorker:true})).project;
 p=(await f.request(`/${p.id}/complete`,{revision:p.revision,taskId:p.task.id,result:{render:{key:`studio/${p.id}/final.mp4`}}},{localWorker:true})).project;
 assert.equal(p.task.state,'done');assert.equal(automaticStatus(p),'발행 검수');assert.equal(p.upload,null);
 assert.equal((await f.request(`/${p.id}/publish`,{revision:p.revision,platforms:['youtube'],privacy:'private',title:p.title})).status,400);
 const publication=await f.request(`/${p.id}/publish`,{revision:p.revision,reviewed:true,platforms:['youtube'],privacy:'private',title:p.title});assert.equal(publication.project.task.action,'publish');
});
test('manual projects do not auto-render, incomplete media never claims completion and custom edits are preserved',()=>{
 const p={...createProject({...input,topic:'감정 알아차리기'}),scenes,approved:true,assets:{},task:{action:'media',state:'done'}};
 assert.equal(continueAutomatic(p),p);
 assert.throws(()=>continueAutomatic({...p,automation:{version:1}}),/완료되지 않은/);
 const complete={...p,automation:{version:1},assets:Object.fromEntries(scenes.map(s=>[s.id,{key:s.id}]))};
 const first=continueAutomatic(complete);first.edit.voice='none';const resumed=continueAutomatic({...complete,edit:first.edit});assert.equal(resumed.edit.voice,'none');
});

test('automatic projects stay in automatic library filters and continuation links',async()=>{
 const {collectContent,filterContent}=await import('../public/content-library.js');
 const p={...createProject({...input,topic:'감정'}),automation:{version:1}};
 const items=collectContent({projects:[p]});assert.equal(filterContent(items,{mode:'auto'}).length,1);assert.equal(filterContent(items,{mode:'manual'}).length,0);assert.equal(items[0].href,`/studio/automatic?project=${p.id}`);
});

test('real local server serves automatic route and every browser module dependency behind login', {timeout:20000},async t=>{
 const {spawn}=await import('node:child_process');const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {once}=await import('node:events');
 const dir=await mkdtemp(join(tmpdir(),'cak-auto-static-'));let child;
 t.after(async()=>{if(child&&child.exitCode===null){const exit=once(child,'exit');child.kill();await exit;}await rm(dir,{recursive:true,force:true});});
 child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,SHOPSHORTS_PORT:'0',SHOPSHORTS_DATA_DIR:dir,SHOPSHORTS_STUDIO_RUNNER:'off',SHOPSHORTS_TOKEN:'fixture-static-only',SHOPSHORTS_NOTIFICATION_QUEUE:'local'},stdio:['ignore','pipe','pipe']});
 let output='',errors='';child.stderr.on('data',chunk=>errors+=chunk);
 const base=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>reject(Error(`Server ${code}: ${errors}`)));child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match)resolve(match[0]);});});
 assert.equal((await fetch(base+'/automatic',{redirect:'manual'})).status,302);
 for(const path of ['/studio/automatic','/automatic','/automatic-creation.js','/automatic-creation.css','/architecture-case.js','/content-library.js','/workspace.css','/ai-account.js','/llm-connection.js']){
  const response=await fetch(base+path,{headers:{cookie:'ss=fixture-static-only'}});assert.equal(response.status,200,path);assert.match(response.headers.get('content-type'),path.endsWith('.js')?/javascript/:path.endsWith('.css')?/css/:/html/);
 }
});

test('local worker matches cloud continuation and local storage rejects duplicate project IDs',async t=>{
 const {startLocalStudio,localStudioStore}=await import('../studio-local.mjs');const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'cak-auto-local-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=localStudioStore(dir,{});let p={...createProject({...input,topic:'감정'}),scenes,automation:{version:1}};p=changeProject(p,'media',{approved:true});await store.create(p);await assert.rejects(store.create(p),/이미 생성/);
 const worker=startLocalStudio(store,{},async job=>job.task.action==='media'?{assets:Object.fromEntries(scenes.map(s=>[s.id,{key:`studio/${p.id}/${s.id}.png`,kind:'image'}]))}:{render:{key:`studio/${p.id}/final.mp4`}});t.after(()=>worker.stop());
 await worker.tick();p=await store.get(p.id);assert.equal(p.task.action,'render');assert.equal(p.task.state,'queued');
 await worker.tick();p=await store.get(p.id);assert.equal(p.task.state,'done');assert.equal(p.upload,null);assert.equal(automaticStatus(p),'발행 검수');
});

test('automatic selection preserves the saved architecture case and ignores browser case injection',async()=>{
 const savedResult={...architectureValue(),intent:'keywords',checkedAt:new Date().toISOString()};
 const f=fixture({savedInput:{...input,category:'건축학'},savedResult});
 const response=await f.request('/automatic',{recommendationId,index:1,caseStudy:{entity:'forged'},topic:'forged'});
 assert.equal(response.status,201);assert.deepEqual(response.project.automation.caseStudy,savedResult.suggestions[1].caseStudy);
 assert.equal(response.project.brief.topic,savedResult.suggestions[1].topic);assert.equal(response.project.brief.direction,savedResult.suggestions[1].direction);
});
