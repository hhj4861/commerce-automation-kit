// Isolated UX fixture. Only in-memory test data; no credentials, external generation or publishing.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createProject} from '../lib/studio.js';
import {studioApi} from '../lib/studio-api.js';
const port=Number(process.env.SHOPSHORTS_UX_PORT || 5211),origin=`http://127.0.0.1:${port}`,root=resolve(import.meta.dirname,'../public');
const manual={...createProject({category:'심리학',format:'short',topic:'잠깐 쉬어도 괜찮아요',duration:24}),updatedAt:'2026-09-27T09:00:00Z',approved:true,scenes:[{id:'fixture-scene',kind:'image',duration:6,narration:'잠시 쉬어도 괜찮아요.',prompt:'테스트용 화면',caption:'잠시 쉬어도 괜찮아요.'}],assets:{'fixture-scene':{kind:'image',mimeType:'image/svg+xml'}}};
const done={...createProject({category:'건축학',format:'long',topic:'빛을 담은 작은 집',duration:120}),updatedAt:'2026-09-26T09:00:00Z',upload:{state:'done'}};
const automatic={...createProject({category:'심리학',format:'short',topic:'자동으로 찾은 대화의 힘',duration:24}),automation:{keyword:'부모와 대화'},scenes:[{id:'scene-1',kind:'image',duration:4,narration:'천천히 말해보세요.',prompt:'Warm illustration'}],updatedAt:'2026-09-28T09:00:00Z'};
const ready={...createProject({category:'건축학',format:'short',topic:'8,300톤 축구장 · 완성본 검수',duration:41}),render:{url:'fixture-only'},updatedAt:'2026-10-13T09:00:00Z'};
const failed={...createProject({category:'건축학',format:'short',topic:'긴 제목도 작업과 상태를 구분해서 볼 수 있는지 확인하는 시나리오 생성 테스트',duration:45}),task:{action:'scenario',state:'failed',error:'시간이 초과됐어요. 다시 시도해 주세요.'},automation:{keyword:'건축'},updatedAt:'2026-10-13T08:00:00Z'};
const projects=[ready,failed,manual,done,automatic],requests=[{slug:'desk-light',topic:'책상 조명 고르기',status:'pending',requestedAt:'2026-09-27T08:00:00Z'}];
const jobs=[{brief:{id:'auto-rack',productName:'접이식 건조대',keyword:'건조대',category:'리빙',affiliateUrl:''},script:{title:'작은 방의 빨래 공간',beats:[]},status:'draft',updatedAt:'2026-09-27T10:00:00Z'}];
let connected=false,failedSource='';
const store={execution:'local',capabilities:async()=>({}),list:async()=>projects,get:async id=>projects.find(p=>p.id===id),create:async p=>projects.unshift(p)};
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,origin),path=url.pathname;
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks).toString();
    let response;
    if(path==='/favicon.ico')response=new Response(null,{status:204});
    else if(path==='/__fixture/fail' && req.method==='POST'){failedSource=JSON.parse(body).source || '';response=Response.json({ok:true});}
    else if((path==='/api/studio'&&failedSource==='projects')||(path==='/api/jobs'&&failedSource==='jobs'))response=Response.json({error:'검증용 조회 실패'},{status:503});
    else if(path.endsWith('/assets/fixture-scene'))response=new Response('<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960"><rect width="540" height="960" fill="#d5e5e0"/><circle cx="270" cy="340" r="100" fill="#72968d"/><path d="M70 960V680Q270 420 470 680V960Z" fill="#43685e"/></svg>',{headers:{'content-type':'image/svg+xml'}});
    else if(path==='/auth/status')response=Response.json({authenticated:true,user:{name:'로컬 UX 검증'}});
    else if(path==='/api/studio/config')response=Response.json({execution:'cloud-worker',capabilities:{workerAt:null},scenarioRuntime:{available:true,scenarioAvailable:true,known:true,connected},categories:['건축학','심리학','과학'],voices:[],music:[],formats:['short','long']});
    else if(path==='/api/studio/llm/status')response=Response.json({connected,available:true,provider:connected?'codex':null,providers:['codex','claude']});
    else if(path==='/api/studio/llm/connect'){connected=true;response=Response.json({connected:true,available:true,provider:'codex'});}
    else if(path.startsWith('/api/studio/llm/')||path==='/api/notifications')response=Response.json({items:[],unreadCount:0});
    else if(path.startsWith('/api/studio')&&req.method!=='GET')response=Response.json({error:'읽기 전용 검증 환경입니다.'},{status:403});
    else if(path.startsWith('/api/studio'))response=await studioApi(new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})}),{},store);
    else if(path==='/api/jobs')response=Response.json({jobs});
    else if(path==='/api/hot-keywords')response=Response.json({items:[],requests});
    else if(path==='/api/draft-requests'&&req.method==='POST'){
      const input=JSON.parse(body),slug=input.topic.normalize('NFC').toLowerCase().replace(/[^a-z0-9가-힣]+/g,'-').replace(/^-+|-+$/g,'');
      if(requests.some(r=>r.slug===slug))response=Response.json({error:'이미 요청됨'},{status:409});
      else{requests.unshift({slug,topic:input.topic,status:'pending',requestedAt:new Date().toISOString()});response=Response.json({ok:true,slug},{status:201});}
    } else if(path.startsWith('/api/'))response=Response.json({items:[],requests:[],dates:[]});
    else {
      const routes=['/studio/dashboard', '/studio/dashboard/', '/studio/automatic','/studio/automatic/', '/','/contents','/trends','/blog','/performance','/affiliate-links','/settings','/notifications'];
      const file=resolve(root,routes.includes(path)?'index.html':path==='/studio'?'studio.html':path==='/metadata'?'metadata.html':path==='/kandinsky'?'kandinsky.html':path.slice(1));
      if(!file.startsWith(root+sep))throw Error('invalid path');
      response=new Response(await readFile(file),{headers:{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream'}});
    }
    if(req.method==='POST')console.log(JSON.stringify({method:req.method,path,status:response.status,projects:projects.length,requests:requests.length}));
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  } catch(error){console.error(error.message);res.writeHead(500);res.end('fixture error');}
});
await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
console.log(JSON.stringify({origin,manualId:manual.id,productionChanged:false}));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());
