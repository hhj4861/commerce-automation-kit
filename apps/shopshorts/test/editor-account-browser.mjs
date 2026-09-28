// Offline browser regression fixture. Start with node test/editor-account-browser.mjs.
// POST /__fixture/account {state:'ready', remaining:42, tier:'creator'} to change
// the next /config response; {fail:true} simulates a failed poll. No provider calls.
// In the voice tab, edit a caption without saving, change the account, and verify
// the account copy updates after polling while focus, caption and undo remain.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createProject} from '../lib/studio.js';
import {studioApi} from '../lib/studio-api.js';
import {normalizeEdit} from '../public/editor-model.js';

const origin='http://127.0.0.1:5212',root=resolve(import.meta.dirname,'../public');
let project=createProject({category:'심리학',format:'short',topic:'계정 정보 갱신 검증',duration:24});
project.scenes=[{id:'scene-1',narration:'저장 전 자막',prompt:'Synthetic background',duration:4,kind:'image'}];
project.approved=true;
project.assets={'scene-1':{key:'fixture.svg',kind:'image',type:'image/svg+xml'}};
project.edit=normalizeEdit(project);
project.edit.captions=[{id:'caption-first',clipId:project.edit.clips[0].id,text:'저장 전 자막',startFrame:0,endFrame:120,font:'gothic',size:56,color:'#ffffff',position:'bottom',background:true}];
let account={state:'ready',tier:'starter',remaining:100,checkedAt:new Date().toISOString()},fail=false;
const store={
 execution:'local',capabilities:async()=>({voice:account.state!=='disconnected',audioAccount:account}),
 list:async()=>[project],get:async id=>id===project.id?structuredClone(project):null,
 cas:async(next,revision)=>{if(project.revision!==revision)return false;project=structuredClone(next);return true;},
 readAsset:async()=>new Response('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640"><rect width="360" height="640" fill="#466a75"/></svg>',{headers:{'content-type':'image/svg+xml'}}),
};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin),path=url.pathname;
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
  let result;
  if(path==='/__fixture/account'&&req.method==='POST'){
   const input=JSON.parse(body);fail=input.fail===true;
   account={...account,...input,checkedAt:input.checkedAt||new Date().toISOString()};
   result=Response.json({ok:true});
  }else if(path==='/api/studio/config'&&fail)result=Response.json({error:'Fixture poll failure'},{status:503});
  else if(path==='/auth/status')result=Response.json({authenticated:true});
  else if(path.includes('/llm/')||path==='/api/notifications')result=Response.json({items:[],unreadCount:0,connected:false});
  else if(path.startsWith('/api/studio')){
   // Only edit saves are allowed; generation and upload can never reach a provider.
   if(req.method!=='GET'&&path!==`/api/studio/${project.id}/edit`)result=Response.json({error:'Offline fixture: edit only'},{status:403});
   else result=await studioApi(new Request(url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body})}),{},store);
  }else if(path.startsWith('/api/'))result=Response.json({items:[]});
  else{
   const file=resolve(root,path==='/studio'?'studio.html':path.slice(1));
   if(!file.startsWith(root+sep))throw Error('not found');
   result=new Response(await readFile(file),{headers:{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream'}});
  }
  res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
 }catch(error){res.writeHead(500);res.end(error.message);}
});
await new Promise(r=>server.listen(5212,'127.0.0.1',r));
console.log(JSON.stringify({url:`${origin}/studio?id=${project.id}`,fixture:true,productionChanged:false}));
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>server.close());
