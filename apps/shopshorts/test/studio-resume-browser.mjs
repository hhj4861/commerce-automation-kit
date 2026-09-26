// Isolated UI fixture: production files and API, in-memory projects, no credentials or paid calls.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createProject} from '../lib/studio.js';
import {studioApi} from '../lib/studio-api.js';
const origin='http://127.0.0.1:5207', publicRoot=resolve(import.meta.dirname,'../public');
const make=(title,category,updatedAt)=>({...createProject({category,topic:title,format:'short',duration:24}),title,updatedAt});
const editing=make('하루를 바꾸는 작은 쉼','심리학','2026-09-26T04:00:00Z');
editing.approved=true;editing.scenes=[{id:'scene-1',narration:'잠깐 멈추고, 내 마음을 알아차려요.',prompt:'푸른 창가',duration:24,kind:'image'}];
editing.assets={'scene-1':{kind:'image',key:'preview',type:'image/svg+xml'}};
const failed=make('빛이 머무는 작은 집','건축학','2026-09-25T03:00:00Z');failed.task={id:crypto.randomUUID(),action:'media',state:'failed',error:'테스트용 생성 실패'};
const scenario=make('선택지가 많으면 왜 결정이 어려울까','심리학','2026-09-24T04:00:00Z');
const done=make('완성한 이야기','역사','2026-09-27T04:00:00Z');done.upload={state:'done'};
const projects=[editing,failed,scenario,done];
const store={execution:'local',capabilities:async()=>({}),list:async()=>projects,get:async id=>projects.find(p=>p.id===id),readAsset:async()=>new Response('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640"><rect width="360" height="640" fill="#587e86"/><rect x="45" y="90" width="270" height="340" fill="#bdcfca"/><path d="M180 90v340M45 260h270" stroke="#587e86" stroke-width="10"/><path d="M0 500h360v140H0" fill="#364e4c"/></svg>',{headers:{'content-type':'image/svg+xml'}})};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin),path=url.pathname;let result;
  if(path==='/auth/status')result=Response.json({authenticated:true,user:{name:'로컬 검증'}});
  else if(path.startsWith('/api/studio/llm/')||path==='/api/notifications')result=Response.json({items:[],unreadCount:0,connected:false});
  else if(path.startsWith('/api/studio'))result=await studioApi(new Request(url,{headers:req.headers}),{},store);
  else if(path.startsWith('/api/'))result=Response.json({jobs:[],items:[],keywords:[],signals:[]});
  else{
   const file=resolve(publicRoot,path==='/studio'?'studio.html':path==='/'?'index.html':path.slice(1));
   if(!file.startsWith(publicRoot+sep))throw Error('invalid path');
   result=new Response(await readFile(file),{headers:{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream'}});
  }
  res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
 }catch{res.writeHead(500);res.end('fixture error');}
});
await new Promise(resolve=>server.listen(5207,'127.0.0.1',resolve));
console.log(JSON.stringify({url:origin,editingId:editing.id,productionChanged:false}));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());
