// Local fixture only: actual application/API, simulated providers, no paid calls.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {studioApi} from '../lib/studio-api.js';
import {llmAccountApi} from '../lib/llm-account-api.js';
import {startStudioWorker} from '../studio-worker.mjs';
const port=5223,origin=`http://127.0.0.1:${port}`,root=resolve(import.meta.dirname,'../public');
const items=new Map(),recommendations=new Map(),scenarios=new Map();let latest=null;
const store={execution:'fixture',capabilities:async()=>({workerAt:new Date().toISOString()}),list:async()=>structuredClone([...items.values()]),get:async id=>structuredClone(items.get(id)),create:async p=>{if(items.has(p.id))throw Error('duplicate');items.set(p.id,structuredClone(p));},cas:async(p,revision)=>{if(items.get(p.id)?.revision!==revision)return false;items.set(p.id,structuredClone(p));return true;},readAsset:async()=>new Response(null,{status:204})};
const call=async(owner,operation,input)=>{
 if(operation==='status')return {connected:true,available:true,scenarioAvailable:true,provider:'codex',job:latest};
 if(operation==='recommend'){
  const id=crypto.randomUUID(),job={id,kind:'recommend',input:input.brief,state:'running',createdAt:Date.now()};recommendations.set(id,job);latest=job;
  setTimeout(()=>{Object.assign(job,{state:'done',result:{intent:'keywords',category:input.brief.category,checkedAt:new Date().toISOString(),suggestions:['감정 알아차리기','결정 피로','주의 회복'].map((keyword,i)=>({keyword:input.brief.category==='심리학'?keyword:`${input.brief.category} 탐구 ${i+1}`,topic:`${input.brief.category}으로 살펴보는 일상의 작은 변화 ${i+1}`,direction:'차분한 설명과 구체적인 일상 예시',reason:'로컬 검증용 검색 결과입니다. 실제 트렌드로 사용하지 마세요.'})),sources:[{title:'로컬 검증용 출처',url:'https://example.org/research'}]}});},7000);return {job};
 }
 if(operation==='recommendation')return {recommendation:recommendations.get(input.id)};
 if(operation==='scenario'){
  const job={id:input.id,projectId:input.projectId,state:'running'};scenarios.set(input.id,job);
  setTimeout(()=>{job.state='done';job.result={title:input.brief.topic,scenes:[{id:'scene-1',kind:'image',narration:'하루가 유난히 길게 느껴지는 날이 있나요?',prompt:'창가에서 잠시 쉬는 사람',duration:20},{id:'scene-2',kind:'image',narration:'새로운 생각을 배우기 전에 내 마음부터 살펴보세요.',prompt:'노트에 마음을 적는 모습',duration:20},{id:'scene-3',kind:'image',narration:'오늘은 잠시 멈추고 가장 작은 변화를 시작해 봅시다.',prompt:'산책을 시작하는 발걸음',duration:20}]};},7000);return {job};
 }
 if(operation==='scenario-status')return {job:scenarios.get(input.id)};
 return {items:[],unreadCount:0};
};
const env={SHOPSHORTS_TOKEN:'local-fixture-only'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin),path=url.pathname,chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks).toString();let response;
  const request=new Request(url,{method:req.method,headers:{...req.headers,cookie:'ss=local-fixture-only'},...(body?{body}:{})});
  if(path==='/favicon.ico')response=new Response(null,{status:204});
  else if(path==='/auth/status')response=Response.json({authenticated:true,user:{name:'자동 제작 로컬 검증'}});
  else if(path==='/api/studio/worker')response=Response.json({ok:true});
  else if(path.startsWith('/api/studio'))response=await llmAccountApi(request,env,call)||await studioApi(request,env,store,{scenarioAccounts:call});
  else if(path==='/api/jobs')response=Response.json({jobs:[]});
  else if(path==='/api/hot-keywords')response=Response.json({items:[],requests:[]});
  else if(path.startsWith('/api/'))response=Response.json({items:[],requests:[],dates:[],unreadCount:0});
  else{
   const routes=['/','/studio/automatic','/automatic','/contents','/trends','/blog','/performance','/affiliate-links','/settings','/notifications'];
   const file=resolve(root,routes.includes(path)?'index.html':path==='/studio'?'studio.html':path.slice(1));if(!file.startsWith(root+sep))throw Error('path');
   response=new Response(await readFile(file),{headers:{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream'}});
  }
  if(req.method==='POST')console.log(JSON.stringify({path,status:response.status,projects:items.size}));
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){console.error(error.message);res.writeHead(500);res.end('fixture error');}
});
await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
const worker=startStudioWorker({env,cloud:origin,token:env.SHOPSHORTS_TOKEN,workDir:'/tmp',keepAlive:true,execute:async job=>{
 await new Promise(r=>setTimeout(r,3000));
 if(job.task.action==='media')return {assets:Object.fromEntries(job.scenes.map(s=>[s.id,{key:`studio/${job.id}/${s.id}.png`,kind:'image'}]))};
 if(job.task.action==='render')return {render:{key:`studio/${job.id}/final.mp4`,type:'video/mp4'}};
 if(job.task.action==='publish')return {upload:{state:'done'}};
 throw Error('unsupported fixture action');
}});
console.log(JSON.stringify({origin,simulatedProviders:true,productionChanged:false}));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await worker.stop();server.close();});
