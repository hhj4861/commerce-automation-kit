// Real local API, browser, worker and MP4 rendering. Script fixture is synthetic;
// no subscription/API generation, narration billing or publishing is performed.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {chromium} from 'playwright';
import {localStudioStore,startLocalStudio} from '../studio-local.mjs';
import {studioApi} from '../lib/studio-api.js';
import {normalizeEdit} from '../public/editor-model.js';
import {command} from '../studio-runner.mjs';

const dir=await mkdtemp(join(tmpdir(),'animation-e2e-')),store=localStudioStore(dir,{});
const publicRoot=resolve(import.meta.dirname,'../public'),worker=startLocalStudio(store,{});
let origin,browser;
const errors=[];
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin),path=url.pathname;let result;
  if(path==='/favicon.ico')result=new Response(null,{status:204});
  else if(path==='/auth/status')result=Response.json({authenticated:true,user:{name:'애니메이션 검증'}});
  else if(path.startsWith('/api/studio/llm/')||path==='/api/notifications')result=Response.json({items:[],unreadCount:0,connected:false});
  else if(path.startsWith('/api/studio')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const request=new Request(url,{method:req.method,headers:req.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});
   result=await studioApi(request,{},store);
  }else if(path.startsWith('/api/'))result=Response.json({jobs:[],items:[]});
  else{
   const file=resolve(publicRoot,path==='/studio'?'studio.html':path==='/studio/automatic'?'index.html':path==='/'?'index.html':path.slice(1));
   if(!file.startsWith(publicRoot+sep))throw Error('invalid path');
   result=new Response(await readFile(file),{headers:{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream'}});
  }
  res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
 }catch(e){errors.push(e.message);res.writeHead(500);res.end('fixture failure');}
});
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||undefined});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/studio?new=1');
 await page.locator('#productionStyle').selectOption('animation');await page.locator('#topic').fill('미루기와 불편한 감정 · 로컬 검증용');
 await page.screenshot({path:join(dir,'planning.png'),fullPage:true});
 await page.locator('#create').click();await page.waitForURL(/id=/);
 const id=new URL(page.url()).searchParams.get('id');let project=await store.get(id);
 assert.equal(project.brief.productionStyle,'animation');
 const animation={title:'불편함을 피하는 순간',layout:'sequence',elements:[{icon:'book',label:'해야 할 일',motion:'enter'},{icon:'cloud',label:'불편한 감정',motion:'shake'},{icon:'phone',label:'잠깐의 회피',motion:'pulse'}]};
 const scenes=[{id:'scene-1',kind:'video',duration:3,narration:'불편한 마음이 들면 잠시 다른 곳을 보게 돼요.',prompt:'해야 할 일, 불편함, 회피의 관계를 설명하는 도식',animation},{id:'scene-2',kind:'video',duration:3,narration:'작은 행동 하나로 다시 시작해 보세요.',prompt:'작은 행동에서 시작하는 변화',animation:{title:'작은 행동부터 시작하기',layout:'sequence',elements:[{icon:'person',label:'잠시 멈추기',motion:'float'},{icon:'book',label:'한 쪽 펼치기',motion:'enter'},{icon:'star',label:'작은 시작',motion:'pulse'}]}}];
 const post=async(action,body)=>{const p=await store.get(id);const response=await page.request.post(`${origin}/api/studio/${id}/${action}`,{headers:{origin},data:{revision:p.revision,...body}});assert.equal(response.status(),200,await response.text());return response.json();};
 await post('scenes',{scenes});await page.reload();
 await page.locator('[data-animation-title]').first().fill('미루기의 순간');
 await page.locator('[data-animation-label="0"]').first().fill('오늘 해야 할 일');
 await page.locator('#next').click();
 project=await store.get(id);assert.equal(project.scenes[0].animation.title,'미루기의 순간');assert.equal(project.scenes[0].animation.elements[0].label,'오늘 해야 할 일');
 assert.equal(await page.locator('[data-kind]').first().isDisabled(),true);
 assert.ok((await page.locator('#stage').innerText()).includes('Higgsfield 크레딧 없이'));
 await page.locator('#approve').check();await page.locator('#generateMedia').click();
 await page.waitForFunction(()=>document.querySelectorAll('.media-view video').length===2,{},{timeout:90000});
 await page.screenshot({path:join(dir,'generated.png'),fullPage:true});
 const video=page.locator('.media-view video').first();await video.evaluate(v=>v.play());await page.waitForTimeout(400);assert.ok(await video.evaluate(v=>v.currentTime>0));
 project=await store.get(id);assert.equal(project.assets['scene-1'].provider,'animation-svg');
 const edit=normalizeEdit(project);edit.voice='none';
 edit.captions=[{id:'caption-1',clipId:edit.clips[0].id,text:'작은 행동부터 시작해 보세요',startFrame:0,endFrame:90,font:'gothic',size:48,color:'#ffffff',position:'bottom',background:true}];
 await post('edit',edit);await post('render',{});
 const deadline=Date.now()+90000;
 do{await new Promise(r=>setTimeout(r,500));project=await store.get(id);if(project.task.state==='failed')throw Error(project.task.error);}while(!project.render&&Date.now()<deadline);
 assert.ok(project.render);assert.equal(project.upload,null);
 const final=join(dir,'animation-sample.mp4');await writeFile(final,await store.readAsset(project.render.key));
 const probe=JSON.parse(await command('ffprobe',['-v','error','-show_streams','-show_format','-of','json',final],{}));
 assert.equal(probe.streams[0].width,1080);assert.equal(probe.streams[0].height,1920);assert.ok(Math.abs(Number(probe.format.duration)-6)<.1);
 await command('ffmpeg',['-y','-v','error','-ss','2','-i',final,'-frames:v','1',join(dir,'frame.png')],{});
 await page.goto(origin+'/studio/automatic');await page.locator('[name="productionStyle"]').waitFor({state:'attached'});
 if(!await page.locator('[data-auto-planner]').evaluate(e=>e.open))await page.locator('[data-auto-planner] > summary').click();
 await page.locator('[name="productionStyle"]').selectOption('animation');assert.equal(await page.locator('[name="productionStyle"]').inputValue(),'animation');
 await page.goto(origin+`/studio?id=${id}`);assert.ok(await page.locator('.final-preview video').count());
 await page.setViewportSize({width:390,height:844});await page.goto(origin+'/studio?new=1');await page.locator('#productionStyle').waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:join(dir,'mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,dir,final,checks:['manual choice saved','animation labels editable','provider bypass','real media playback','final render + captions','automatic selector','mobile layout','no publish']},null,2));
}finally{worker.stop();await browser?.close();await new Promise(r=>server.close(r));}
