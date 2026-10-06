// Local-only UI/API fixture. No credentials or paid providers; real studioApi validation/storage.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {studioApi} from '../lib/studio-api.js';
import {createProject} from '../lib/studio.js';
const port=Number(process.env.HYBRID_QA_PORT||5488),origin=`http://127.0.0.1:${port}`,root=resolve(import.meta.dirname,'../public');
const p=createProject({category:'과학',topic:'칩은 어떻게 연결될까?',format:'short',duration:18,productionStyle:'hybrid',maxCredits:60});
const plan={artPrompt:'칩과 기판 웹툰',answer:'접점이 연결된다',layers:[{id:'chip',label:'칩',meaning:'기판으로 다가가는 칩',shape:'rect',color:'#d9ba7f',from:[50,20],to:[50,50],size:[40,20],start:.2,end:.8,motion:'move'}]};
p.scenes=['scene','scene','cutaway','process'].map((t,i)=>({id:`scene-${i+1}`,kind:'video',duration:i?4:6,narration:'칩과 기판의 연결을 살펴봅니다.',prompt:'같은 칩이 기판에 가까워진다.',webtoon:plan,visualDirection:{focus:'칩',before:'떨어진 칩',action:'가까워진다',after:'연결된 칩',continuity:'같은 칩',material:'잉크 선',lighting:'앰버 조명',representation:'conceptual',treatment:t,hookText:'어떻게 연결될까?'},shot:i?'close':'wide',camera:'push-in',hybrid:{renderer:'auto',focus:'chip',depth:8}}));
p.automation={version:2};const items=new Map([[p.id,p]]);
const store={execution:'fixture',capabilities:async()=>({hybrid:true,webtoon:true,motion:true,workerAt:new Date().toISOString()}),list:async()=>structuredClone([...items.values()]),get:async id=>structuredClone(items.get(id)),create:async p=>items.set(p.id,structuredClone(p)),cas:async(p,r)=>{if(items.get(p.id)?.revision!==r)return false;items.set(p.id,structuredClone(p));return true;}};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin),chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);let response;
  if(url.pathname==='/auth/status')response=Response.json({authenticated:true,user:{name:'혼합 제작 로컬 검증'}});
  else if(url.pathname.startsWith('/api/studio'))response=await studioApi(new Request(url,{method:req.method,headers:{...req.headers,cookie:'ss=local-hybrid-fixture'},...(body.length?{body}:{})}),{SHOPSHORTS_TOKEN:'local-hybrid-fixture'},store);
  else if(url.pathname.startsWith('/api/'))response=Response.json({items:[],jobs:[],requests:[],dates:[],unreadCount:0});
  else if(url.pathname==='/favicon.ico')response=new Response(null,{status:204});
  else {const path=url.pathname;const file=resolve(root,path==='/studio'?'studio.html':['/','/studio/dashboard','/studio/automatic'].includes(path)?'index.html':path.slice(1));if(!file.startsWith(root+sep))throw Error('path');response=new Response(await readFile(file),{headers:{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.ttf')?'font/ttf':'text/html'}});}
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){res.writeHead(500);res.end(e.message);}
});
server.listen(port,'127.0.0.1',()=>console.log(origin+'/studio?id='+p.id+'\n'+origin+'/studio/dashboard?mode=auto'));
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>server.close(()=>process.exit(0)));
