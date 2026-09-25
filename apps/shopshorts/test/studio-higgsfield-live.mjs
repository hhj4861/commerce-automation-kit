// Explicit, paid smoke test. Never picked up by *.test.mjs. Uses one reviewed scene;
// only its local copy is changed. Reopening the same output directory reuses results.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {accountBroker} from '../studio-account-worker.mjs';
import {localStudioStore,startLocalStudio} from '../studio-local.mjs';
import {studioApi} from '../lib/studio-api.js';
import {higgsfieldCommand} from '../studio-higgsfield-auth.mjs';
import {higgsfieldPlan} from '../studio-higgsfield.mjs';

if(!process.argv.includes('--live-one-image'))throw Error('실생성 검증은 --live-one-image 명시가 필요합니다(2크레딧 견적 확인 후 실행).');
const sourceId=process.env.HIGGSFIELD_TEST_PROJECT;
if(!/^[a-f0-9-]{36}$/.test(sourceId||'') || !process.env.HIGGSFIELD_WORKSPACE_ID || !process.env.HIGGSFIELD_CREDENTIALS_PATH)throw Error('검증 프로젝트·작업 공간·인증 파일을 명시하세요.');
const {values}=await accountBroker(process.env)('/runner/secrets',{});
const response=await fetch(`${values.SHOPSHORTS_CLOUD_URL}/api/studio/${sourceId}`,{headers:{cookie:`ss=${values.SHOPSHORTS_TOKEN}`}});
if(!response.ok)throw Error('검증 원본을 읽지 못했습니다.');
const {project:source}=await response.json();
if(!source.approved || !source.scenes?.length)throw Error('검수 승인된 장면만 검증할 수 있습니다.');
const first={...source.scenes[0],kind:'image'},plan=higgsfieldPlan(first,source.brief.aspect);
const env={...process.env,SHOPSHORTS_MEDIA_PROVIDER:'higgsfield',HIGGSFIELD_NO_UPDATE_CHECK:'1',HIGGSFIELD_DISABLE_TELEMETRY:'1'};
const estimate=await higgsfieldCommand(['generate','cost',plan.model,'--prompt',plan.prompt,'--aspect_ratio',plan.aspect,'--resolution',plan.resolution],env);
if(estimate.credits!==2)throw Error('검증 비용이 2크레딧과 달라 중단했습니다.');
const dataDir=resolve(import.meta.dirname,'../../..','docs/out/higgsfield-live');
const store=localStudioStore(dataDir,env,items=>{
 const p=items[0];console.log(JSON.stringify({state:p?.task?.state||'idle',ready:Object.keys(p?.assets||{}).length,total:p?.scenes?.length,error:p?.task?.error||null}));
});
let project=(await store.list())[0];
if(!project){
 project={...source,id:crypto.randomUUID(),revision:0,title:'[Higgsfield 검증] '+source.title,scenes:[first],assets:{},mediaJobs:{},task:null,edit:null,render:null,upload:null};
 await store.create(project);
}
const worker=startLocalStudio(store,env);await worker.recover();
const publicRoot=resolve(import.meta.dirname,'../public'),origin='http://127.0.0.1:5201';
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,origin).pathname;let result;
  if(path==='/auth/status')result=Response.json({authenticated:true});
  else if(path.startsWith('/api/studio')){
   if(path.includes('/llm/'))result=Response.json({items:[],unreadCount:0,connected:false});
   else{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    result=await studioApi(new Request(new URL(req.url,origin),{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})}),{},store);
   }
  }else if(path.startsWith('/api/'))result=Response.json({}, {status:404});
  else{
   const file=resolve(publicRoot,path==='/studio'?'studio.html':path.slice(1));
   if(!file.startsWith(publicRoot+sep))throw Error('not found');
   result=new Response(await readFile(file),{headers:{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream'}});
  }
  res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
 }catch{res.writeHead(500);res.end('test server error');}
});
await new Promise(r=>server.listen(5201,'127.0.0.1',r));
console.log(JSON.stringify({url:`${origin}/studio?id=${project.id}`,creditsPerImage:estimate.credits,productionChanged:false}));
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{worker.stop();server.close();});
