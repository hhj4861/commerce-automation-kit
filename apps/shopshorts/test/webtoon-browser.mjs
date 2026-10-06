// Isolated browser fixture: real local studio API for drafts, no paid workers.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,sep,join} from 'node:path';
import {localStudioStore} from '../studio-local.mjs';
import {studioApi} from '../lib/studio-api.js';
import {recommendationInput} from '../lib/studio-recommendations.js';
const dir=process.env.WEBTOON_QA_DIR;if(!dir)throw Error('WEBTOON_QA_DIR required');
await mkdir(dir,{recursive:true});const store=localStudioStore(join(dir,'browser-store'),{});
const root=resolve(import.meta.dirname,'../public'),origin='http://127.0.0.1:5238';let saved;
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin),path=url.pathname;let response;
  if(path==='/favicon.ico')response=new Response(null,{status:204});
  else if(path==='/auth/status')response=Response.json({authenticated:true,user:{name:'로컬 검증'}});
  else if(path==='/api/studio/llm/status')response=Response.json({connected:true,available:true,scenarioAvailable:true,provider:'codex'});
  else if(path==='/api/studio/recommendations'&&req.method==='POST'){
   let body='';for await(const b of req)body+=b;
   saved={id:'00000000-0000-4000-8000-000000000001',state:'queued',input:recommendationInput(JSON.parse(body))};
   await writeFile(join(dir,'browser-submitted.json'),JSON.stringify(saved,null,2));response=Response.json({job:saved});
  }else if(path==='/api/studio/llm/recommendation')response=Response.json({recommendation:saved});
  else if(path.startsWith('/api/studio/llm/')||path==='/api/notifications')response=Response.json({items:[],unreadCount:0,connected:true,available:true});
  else if(path.startsWith('/api/studio')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   response=await studioApi(new Request(url,{method:req.method,headers:req.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})}),{},store);
  }else if(path.startsWith('/api/'))response=Response.json({jobs:[],items:[],requests:[],keywords:[],signals:[]});
  else{
   const name=path==='/studio'?'studio.html':path==='/'||path==='/studio/dashboard'?'index.html':path.slice(1),file=resolve(root,name);
   if(!file.startsWith(root+sep))throw Error('path');
   response=new Response(await readFile(file),{headers:{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream'}});
  }
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){console.error(e.message);res.writeHead(500);res.end('Local fixture failure');}
});
await new Promise(r=>server.listen(5238,'127.0.0.1',r));console.log(origin);
for(const s of ['SIGINT','SIGTERM'])process.once(s,()=>server.close());
