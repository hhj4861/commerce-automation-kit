// Local, in-memory integration preview. External provider responses are fixtures.
// METADATA_PREVIEW_VIDEO points to a local MP4; no video is sent to an external API.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {studioApi} from '../lib/studio-api.js';
import {createProject} from '../lib/studio.js';
import {executeStudioTask} from '../studio-runner.mjs';
const bytes=await readFile(process.env.METADATA_PREVIEW_VIDEO);
const project=createProject({category:'건축학',topic:'삿포로돔 · 테스트 영상',format:'short',duration:40});
project.approved=true;project.render={key:`studio/${project.id}/final.mp4`,duration:40,type:'video/mp4'};
const items=new Map([[project.id,project]]),assets=new Map([[project.render.key,bytes]]);
const store={execution:'local',capabilities:async()=>({metadata:true,workerAt:new Date().toISOString()}),list:async()=>[...items.values()],get:async id=>structuredClone(items.get(id)),create:async p=>items.set(p.id,structuredClone(p)),cas:async(p,r)=>{if(items.get(p.id).revision!==r)return false;items.set(p.id,structuredClone(p));return true;},writeAsset:async(k,v)=>assets.set(k,Buffer.from(v)),readAsset:async(k)=>new Response(assets.get(k),{headers:{'content-type':'video/mp4'}})};
const analysis={category:'건축학',subject:'삿포로돔의 호버링 스테이지',summary:'공기압이 하중을 분담하고 바퀴가 천연잔디 스테이지를 옮기는 원리를 설명하는 영상입니다.',language:'ko',facts:['공기와 바퀴가 하중을 나눠 받습니다.'],uncertainties:[],queries:['삿포로돔 공기압','삿포로돔 천연잔디'],observations:[{at:0,visual:'돔 경기장 전경',subtitle:'8,300톤을 공기로 띄운다?'},{at:20,visual:'공기가 받침대 아래로 들어가는 도식',speech:'공기와 바퀴가 나누어 받습니다.'},{at:38,visual:'돔 밖으로 나온 천연잔디'}]};
let aiCalls=0, workerActive=false;
async function fixtureFetch(url){
  const u=new URL(url);
  if(u.hostname==='generativelanguage.googleapis.com'){
    const value=++aiCalls%2===1?analysis:{references:[{id:'abcdefghijk',relevance:'동일 소재를 설명하는 테스트 표본입니다.',pattern:'무게를 앞에 배치한 제목, 이유를 설명한 본문, 시설명 해시태그를 사용합니다.'}],suggestions:['호기심형','검색형','스토리형'].map((type,i)=>({type,title:['8,300톤 축구장을 공기로 띄운다고?','삿포로돔의 원리｜공기로 옮기는 천연잔디','햇빛을 찾아 밖으로 나가는 축구장'][i],description:'천연잔디에는 햇빛이 필요합니다.\n\n삿포로돔은 공기압으로 잔디 스테이지를 받치고 바퀴로 천천히 옮깁니다. 영상 속 단면으로 그 원리를 확인해 보세요.',hashtags:['#삿포로돔','#건축공학','#공기압','#천연잔디','#경기장설계','#기계공학','#지식쇼츠','#Shorts'],reason:'첫 장면의 숫자와 실제 작동 원리를 연결한 추천입니다.',referenceIds:['abcdefghijk']})),limitations:['이 미리보기의 AI 응답과 참고 영상은 기능 검증용 자료입니다.']};
    return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(value)}]}}]});
  }
  if(u.pathname.endsWith('/search'))return Response.json({items:[{id:{videoId:'abcdefghijk'}}]});
  return Response.json({items:[{id:'abcdefghijk',snippet:{title:'움직이는 경기장의 비밀 · 테스트 표본',description:'공개 설명 확인용 테스트 자료입니다. #건축 #삿포로돔',channelTitle:'테스트 채널',publishedAt:new Date(Date.now()-7*86400000).toISOString()},contentDetails:{duration:'PT42S'},statistics:{viewCount:'12000'}}]});
}
async function worker(){
  if(workerActive)return;const queued=[...items.values()].find(p=>p.task?.state==='queued');if(!queued)return;workerActive=true;
  let job=structuredClone(queued);const update=async(action,body={})=>{const response=await studioApi(new Request(`http://localhost/api/studio/${job.id}/${action}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,revision:job.revision,taskId:job.task.id})}),{},store,{localWorker:true});const data=await response.json();if(!response.ok)throw Error(data.error);job=data.project;};
  try {await update('claim');const result=await executeStudioTask(job,{GEMINI_API_KEY:'fixture',YOUTUBE_API_KEY:'fixture'},{readAsset:async key=>assets.get(key)},result=>update('checkpoint',{result}),{fetcher:fixtureFetch});await update('complete',{result});}
  catch(e){await update('failure',{error:e.message});}finally{workerActive=false;}
}
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,`http://${req.headers.host}`);
    if(url.pathname.startsWith('/api/studio')){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const response=await studioApi(new Request(url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:Buffer.concat(chunks)})}),{},store);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    const name=url.pathname==='/metadata'?'metadata.html':url.pathname.slice(1);
    if(!/^[\w.-]+$/.test(name))throw Error('not found');
    const content=await readFile(resolve(import.meta.dirname,'../public',name));
    res.writeHead(200,{'content-type':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'});res.end(content);
  }catch{res.writeHead(404);res.end();}
});
server.listen(Number(process.env.PORT||5189),'127.0.0.1',()=>console.log(`Preview: http://127.0.0.1:${server.address().port}/metadata?id=${project.id}`));
setInterval(()=>worker().catch(e=>console.error(e.message)),1000).unref();
