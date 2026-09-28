// Local visual verification only. Original test patterns and synthetic tones;
// no credentials, paid generation, uploads or reference-video media are used.
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {localStudioStore} from '../studio-local.mjs';
import {createProject,validateEdit} from '../lib/studio.js';
import {cinematicEdit} from '../lib/cinematic-production.js';
import {normalizeEdit} from '../public/editor-model.js';
import {command,executeStudioTask} from '../studio-runner.mjs';
import {studioApi} from '../lib/studio-api.js';

const dir=await mkdtemp(join(tmpdir(),'cinematic-browser-')),store=localStudioStore(dir,{});
const project=createProject({category:'과학',topic:'시네마틱 엔진 · 기술 검증용 패턴',format:'long',duration:16,productionStyle:'cinematic'});
project.scenes=[
 {id:'scene-1',kind:'image',duration:8,narration:'빛을 바라보는 방향이 달라지면, 같은 종이도 다른 모습으로 보여요.',prompt:'Original geometric light study',shot:'detail',camera:'push-in'},
 {id:'scene-2',kind:'video',duration:8,narration:'종이를 천천히 돌려 보세요. 그림자가 움직이는 방향을 관찰해 볼까요?',prompt:'Original moving test pattern',shot:'medium',camera:'locked'},
];
project.approved=true;project.automation={version:1};
const voice=normalizeEdit(project).voice;
for(const s of project.scenes){
 const file=join(dir,s.id+(s.kind==='image'?'.png':'.mp4'));
 await command('ffmpeg',['-y','-v','error','-f','lavfi','-i','testsrc2=s=640x360:r=30',...(s.kind==='image'?['-frames:v','1']:['-t','2','-c:v','libx264']),file],{});
 const key=`studio/${project.id}/${s.id}`;await store.writeAsset(key,await readFile(file),s.kind==='image'?'image/png':'video/mp4');project.assets[s.id]={key,kind:s.kind};
 const audio=join(dir,s.id+'.mp3'),audioKey=`studio/${project.id}/${s.id}.mp3`;
 await command('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=440:duration=7.5','-af','volume=0.1',audio],{});
 await store.writeAsset(audioKey,await readFile(audio),'audio/mpeg');project.assets[`narration-${s.id}`]={key:audioKey,kind:'audio',purpose:'narration',voice,text:s.narration,duration:7.5};
}
project.edit=validateEdit(cinematicEdit(project),project);project.task={id:'fixture-render',action:'render',state:'running'};
Object.assign(project,await executeStudioTask(project,{},store,async()=>{}));project.task.state='done';await store.create(project);
const port=process.env.CINEMATIC_TEST_PORT||'5219';
const origin=`http://127.0.0.1:${port}`,publicRoot=resolve(import.meta.dirname,'../public');
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin),path=url.pathname;let result;
  if(path==='/auth/status')result=Response.json({authenticated:true,user:{name:'기술 검증용 프로젝트'}});
  else if(path.startsWith('/api/studio/llm/')||path==='/api/notifications')result=Response.json({items:[],unreadCount:0,connected:false});
  else if(path.startsWith('/api/studio')){
   // This read-only fixture cannot create work or upload anything.
   result=req.method!=='GET'?Response.json({error:'읽기 전용 검증 화면입니다.'},{status:405}):await studioApi(new Request(url,{headers:req.headers}),{},store);
  }else if(path.startsWith('/api/'))result=Response.json({jobs:[],items:[],keywords:[],signals:[]});
  else{
   const file=resolve(publicRoot,path==='/studio'?'studio.html':path==='/'?'index.html':path.slice(1));
   if(!file.startsWith(publicRoot+sep))throw Error('invalid path');
   result=new Response(await readFile(file),{headers:{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream'}});
  }
  res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
 }catch{res.writeHead(500);res.end('fixture error');}
});
await new Promise(resolve=>server.listen(Number(port),'127.0.0.1',resolve));
console.log(JSON.stringify({fixture:true,url:`${origin}/studio?id=${project.id}`,render:join(dir,'studio-work',project.id,'final.mp4')}));
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>server.close(async()=>{await rm(dir,{recursive:true,force:true});}));
