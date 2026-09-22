import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createProject} from '../lib/studio.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let project=createProject({category:'심리학',topic:'아이에게 날카롭게 말한 순간 돌아보기',format:'short',duration:24});
project.task={id:crypto.randomUUID(),action:'scenario',state:'queued',runner:'llm-account'};
let config={execution:'cloud-worker',capabilities:{workerAt:null},scenarioRuntime:{connected:true,available:false,scenarioAvailable:true}};
let configFailure=false,posts=0;
const server=createServer(async(req,res)=>{
 try{
  let body,type='application/json',status=200;const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/api/studio/config'){body=configFailure?{error:'offline'}:config;status=configFailure?503:200;}
  else if(path==='/auth/status')body={};
  else if(path==='/api/notifications'){body={};status=404;}
  else if(path==='/api/studio/llm/notifications')body={items:[],unreadCount:0};
  else if(path==='/api/studio/llm/status')body={connected:true,available:true,scenarioAvailable:true,provider:'codex'};
  else if(path===`/api/studio/${project.id}`)body={project};
  else if(path===`/api/studio/${project.id}/scenario`){posts++;project={...project,revision:project.revision+1,task:{...project.task,state:'queued'}};body={project};}
  else {const file=path==='/studio'?'studio.html':path.slice(1);if(!/^[a-zA-Z0-9.-]+$/.test(file))throw Error('not found');type=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html';body=await readFile(resolve(import.meta.dirname,'../public',file));}
  res.writeHead(status,{'content-type':type});res.end(Buffer.isBuffer(body)?body:JSON.stringify(body));
 }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1365,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/studio?id=${project.id}`);
 const status=page.locator('[data-execution-state]');
 await page.locator('[data-execution-state=waiting]').waitFor();assert.match(await status.innerText(),/아직 시작하지/);assert.equal(await status.count(),1);
 assert.equal(await page.locator('#generate').count(),0);assert.doesNotMatch(await page.locator('body').innerText(),/Gemini|서버에서 계속 처리/);
 await page.screenshot({path:'/private/tmp/cak-studio-waiting.png',fullPage:true});
 config.scenarioRuntime.available=true;await page.locator('[data-execution-action=refresh]').click();
 await page.locator('[data-execution-state=queued]').waitFor();assert.match(await status.innerText(),/아직 생성 전/);
 project={...project,revision:project.revision+1,task:{...project.task,state:'running'}};
 await page.locator('[data-execution-state=running]').waitFor({timeout:10000});assert.equal(await status.count(),1);
 configFailure=true;await page.locator('[data-execution-state=unknown]').waitFor({timeout:10000});
 configFailure=false;project={...project,revision:project.revision+1,task:{...project.task,state:'failed',error:'인증을 확인하지 못했어요.'}};
 await page.locator('[data-execution-state=failed]').waitFor({timeout:10000});assert.equal(await status.count(),1);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'/private/tmp/cak-studio-failed-mobile.png',fullPage:true});
 await page.locator('[data-execution-action=retry]').click();await page.locator('[data-execution-state=queued]').waitFor();assert.equal(posts,1);
 project={...project,revision:project.revision+1,task:{...project.task,state:'done'},scenes:[{id:'scene-1',narration:'내 마음을 먼저 돌아봐요.',prompt:'부모와 아이',duration:24,kind:'image'}]};
 await page.locator('[data-execution-state=done]').waitFor({timeout:10000});assert.equal(await page.locator('[data-scene]').count(),1);
 assert.equal(errors.length,0);console.log(JSON.stringify({passed:true,checks:9,api:'fixture',states:['offline','queued','running','unknown','failed','retry','done'],singleNotice:true,mobile:true}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
