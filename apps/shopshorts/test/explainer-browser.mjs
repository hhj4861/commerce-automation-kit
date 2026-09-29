// Local fixture only: actual application/API, simulated providers, no paid calls.
import {createServer} from 'node:http';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {studioApi} from '../lib/studio-api.js';
import {llmAccountApi} from '../lib/llm-account-api.js';
import {scenarioBrief} from '../lib/studio-scenario.js';
import {executeStudioTask,command} from '../studio-runner.mjs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startStudioWorker} from '../studio-worker.mjs';
const port=5231,origin=`http://127.0.0.1:${port}`,root=resolve(import.meta.dirname,'../public');
const media=new Map(),work=await mkdtemp(join(tmpdir(),'explainer-browser-'));
const items=new Map(),recommendations=new Map(),scenarios=new Map();let latest=null;
const store={execution:'fixture',capabilities:async()=>({workerAt:new Date().toISOString()}),list:async()=>structuredClone([...items.values()]),get:async id=>structuredClone(items.get(id)),create:async p=>{if(items.has(p.id))throw Error('duplicate');items.set(p.id,structuredClone(p));},cas:async(p,revision)=>{if(items.get(p.id)?.revision!==revision)return false;items.set(p.id,structuredClone(p));return true;},readAsset:async key=>new Response(media.get(key),{headers:{'content-type':key.endsWith('.mp3')?'audio/mpeg':'video/mp4'}})};
const call=async(owner,operation,input)=>{
 if(operation==='status')return {connected:true,available:true,scenarioAvailable:true,provider:'codex',job:latest};
 if(operation==='recommend'){
  const id=crypto.randomUUID(),job={id,kind:'recommend',input:input.brief,state:'running',createdAt:Date.now()};recommendations.set(id,job);latest=job;
  setTimeout(()=>{Object.assign(job,{state:'done',result:{intent:'keywords',category:input.brief.category,checkedAt:new Date().toISOString(),suggestions:['감정 알아차리기','결정 피로','주의 회복'].map((keyword,i)=>({keyword:input.brief.category==='심리학'?keyword:`${input.brief.category} 탐구 ${i+1}`,topic:`${input.brief.category}으로 살펴보는 일상의 작은 변화 ${i+1}`,direction:'차분한 설명과 구체적인 일상 예시',reason:'로컬 검증용 검색 결과입니다. 실제 트렌드로 사용하지 마세요.'})),sources:[{title:'로컬 검증용 출처',url:'https://example.org/research'}]}});},600);return {job};
 }
 if(operation==='recommendation')return {recommendation:recommendations.get(input.id)};
 if(operation==='scenario'){
  const job={id:input.id,projectId:input.projectId,state:'running'};scenarios.set(input.id,job);
  void (async()=>{try{
   let count=0;
   job.result=await scenarioBrief(input.brief,{}, {onProgress:async phase=>{job.phase=phase;await new Promise(r=>setTimeout(r,600));},generate:async()=>{
    if(count++===0)return {searched:true,value:{sources:[{id:'source-1',title:'테스트용 자료 · 실검색 아님',url:'https://example.org/architecture'}],facts:[{claim:'로컬 검증용 사실 데이터입니다.',sourceIds:['source-1']}],limitations:['이 자료는 실제 영상에 사용하지 마세요.']}};
    const animation={title:'움직임을 설계하기',diagram:'pendulum',layout:'contrast',takeaway:'원리를 눈으로 살펴보기',elements:[{icon:'building',label:'건물',motion:'shake'},{icon:'damper',label:'댐퍼',motion:'pulse'}]};
    return {value:{title:input.brief.topic,scenes:[{id:'scene-1',kind:'video',duration:input.brief.duration/2,narration:'어떻게 움직일까요?',prompt:'건물과 매달린 질량의 도해',animation},{id:'scene-2',kind:'video',duration:input.brief.duration/2,narration:'원리를 살펴보세요. 이해해 봅시다.',prompt:'움직임과 저항을 설명하는 도해',animation}],storyArc:{hook:{sceneId:'scene-1',line:'어떻게 움직일까요?'},payoff:{sceneId:'scene-2',line:'원리를 살펴보세요.'},ending:{sceneId:'scene-2',line:'이해해 봅시다.'}}}};
   }});job.state='done';
  }catch(e){job.state='failed';job.error=e.message;}})();return {job};
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
   const routes=['/studio/dashboard','/','/studio/automatic','/automatic','/contents','/trends','/blog','/performance','/affiliate-links','/settings','/notifications'];
   const file=resolve(root,routes.includes(path)?'index.html':path==='/studio'?'studio.html':path.slice(1));if(!file.startsWith(root+sep))throw Error('path');
   response=new Response(await readFile(file),{headers:{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream'}});
  }
  if(req.method==='POST')console.log(JSON.stringify({path,status:response.status,projects:items.size}));
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){console.error(error.message);res.writeHead(500);res.end('fixture error');}
});
await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
const worker=startStudioWorker({env,cloud:origin,token:env.SHOPSHORTS_TOKEN,workDir:work,keepAlive:true,execute:async(job,ignored,io,checkpoint)=>executeStudioTask(job,{ELEVENLABS_API_KEY:'fixture'}, {workDir:work,writeAsset:async(k,d,type)=>{media.set(k,d);},readAsset:async k=>media.get(k)},checkpoint,{runCli:async(_,args)=>command('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=440:duration=1.5','-c:a','libmp3lame',args[args.indexOf('--out')+1]],{}),fetcher:()=>{throw Error('External provider disabled in fixture');}})});
console.log(JSON.stringify({origin,simulatedProviders:true,productionChanged:false}));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await worker.stop();server.close();await rm(work,{recursive:true,force:true});});
