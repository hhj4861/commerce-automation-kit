// Real authenticated Shopshorts HTTP + Chromium. Only the external HF API is a fixture.
// PLAYWRIGHT_ENTRY: installed playwright index.mjs. KANDINSKY_TEST_DIR: isolated artifacts/temp.
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdir, readFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {HOST} from '../public/kandinsky-api.js';
const {chromium}=await import(process.env.PLAYWRIGHT_ENTRY || 'playwright');
const out=process.env.KANDINSKY_TEST_DIR;
if(!out)throw new Error('KANDINSKY_TEST_DIR must be an isolated artifact directory');
await mkdir(join(out,'browser-data'),{recursive:true});
execFileSync('ffmpeg',['-y','-f','lavfi','-i','color=c=0x277e64:s=320x180:r=24','-t','1','-c:v','libx264','-pix_fmt','yuv420p',join(out,'fixture.mp4')],{stdio:'ignore'});
const mp4=await readFile(join(out,'fixture.mp4'));
const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,SHOPSHORTS_PORT:'0',SHOPSHORTS_DATA_DIR:join(out,'browser-data'),SHOPSHORTS_STUDIO_RUNNER:'off',SHOPSHORTS_TOKEN:'kandinsky-browser-fixture'},stdio:['ignore','pipe','pipe']});
let browser;
try {
 const base=await new Promise((resolve,reject)=>{let output='',errors='';const timeout=setTimeout(()=>reject(new Error('start timeout '+errors)),15000);child.stderr.on('data',v=>errors+=v);child.on('exit',()=>{clearTimeout(timeout);reject(new Error(errors));});child.stdout.on('data',v=>{output+=v;const m=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timeout);resolve(m[0]);}});});
 assert.equal((await fetch(base+'/kandinsky',{redirect:'manual'})).status,302);
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 await context.addCookies([{name:'ss',value:'kandinsky-browser-fixture',url:base}]);
 let mode='complete',posts=0,uploads=0;
 const schema={named_endpoints:{'/generate':{parameters:['prompt','use_beautifier','seed','image'].map(parameter_name=>({parameter_name})),returns:[{},{},{},{}]}}};
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.origin===base)return route.continue();
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':base,'access-control-allow-headers':'authorization,content-type'}});
  const fulfill=(body,contentType='application/json')=>route.fulfill({status:200,body,contentType,headers:{'access-control-allow-origin':base}});
  if(u.href==='https://huggingface.co/api/whoami-v2')return fulfill(JSON.stringify({type:'user',isPro:false,canPay:false,orgs:[],name:'fixture-free'}));
  if(u.origin===HOST){
   if(u.pathname.endsWith('/info'))return fulfill(JSON.stringify(schema));
   if(u.pathname.endsWith('/upload')){uploads++;return fulfill(JSON.stringify(['/tmp/frame.png']));}
   if(u.pathname.endsWith('/call/generate')){posts++;if(mode==='uncertain')return route.abort();return fulfill(JSON.stringify({event_id:'fixture-'+posts}));}
   if(u.pathname.includes('/call/generate/')){
    if(mode==='quota')return fulfill('event: error\ndata: "GPU quota exceeded"\n\n','text/event-stream');
    if(mode==='disconnect')return fulfill('event: heartbeat\ndata: null\n\n','text/event-stream');
    return fulfill(`event: complete\ndata: ${JSON.stringify([{video:{url:HOST+'/gradio_api/file=/tmp/video.mp4'}},'테스트 결과 <img src=x onerror=alert(1)>','<script>bad()</script>','ignored'])}\n\n`,'text/event-stream');
   }
   if(u.pathname.startsWith('/gradio_api/file='))return fulfill(mp4,'video/mp4');
  }
  return route.abort();
 });
 const page=await context.newPage(),pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
 page.on('dialog',dialog=>dialog.accept());
 await page.goto(base+'/kandinsky');await page.waitForSelector('.sidebar a[href="/kandinsky"][aria-current="page"]');
 await page.screenshot({path:join(out,'desktop.png'),fullPage:true});
 await page.locator('#example').click();
 await page.locator('#connection-settings summary').click();await page.locator('#hf-token').fill('hf_12345678901');
 await page.locator('#image').setInputFiles({name:'frame.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
 await page.locator('#generate').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('생성 완료') || !document.querySelector('#error').hidden).then(async()=>assert.match(await page.locator('#status').textContent(),/생성 완료/)).catch(async e=>{console.error({status:await page.locator('#status').textContent(),error:await page.locator('#error').textContent(),posts,uploads,pageErrors});throw e;});
 assert.equal(posts,1);assert.equal(uploads,1);
 await page.waitForFunction(()=>document.querySelector('#result-video').videoWidth===320);
 assert.equal(await page.locator('#used-prompt-text img').count(),0);
 assert(!(await page.evaluate(()=>JSON.stringify({...sessionStorage,...localStorage}))).includes('hf_12345678901'));
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#download').click()]);await download.saveAs(join(out,'download.mp4'));
 assert.deepEqual(await readFile(join(out,'download.mp4')),mp4);
 await page.waitForFunction(()=>!document.querySelector('#download').disabled);
 await page.reload();assert.equal(await page.locator('#hf-token').inputValue(),'');await page.waitForSelector('#result-video');assert.equal(posts,1);
 await page.locator('#new').click();mode='disconnect';await page.locator('#example').click();await page.locator('#generate').click();
 await page.waitForSelector('#resume:visible');assert.equal(posts,2);
 await page.reload();mode='complete';await page.locator('#resume').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('생성 완료'));assert.equal(posts,2);
 await page.locator('#new').click();mode='quota';await page.locator('#example').click();await page.locator('#generate').click();
 await page.waitForFunction(()=>document.querySelector('#error').textContent.includes('무료 GPU 한도'));assert.equal(posts,3);
 await page.locator('#new').click();mode='uncertain';await page.locator('#generate').click();await page.waitForSelector('#new:visible');await page.reload();
 assert(await page.locator('#generate').isDisabled());assert.equal(posts,4);assert(await page.locator('#resume').isHidden());
 await page.locator('#new').click();await page.setViewportSize({width:390,height:844});
 await page.locator('.workspace-mobile-menu summary').click();
 assert(await page.locator('.workspace-mobile-menu a[href="/kandinsky"]').isVisible());
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 await page.screenshot({path:join(out,'mobile.png'),fullPage:true});
 assert.deepEqual(pageErrors,[]);
 console.log('PASS: auth + menu + image + generation + video playback + download + token non-persistence + reload + GET-only recovery + quota + uncertain POST + mobile overflow (fixture HF API; no external generation)');
} finally {
 await browser?.close();if(child.exitCode===null){const done=once(child,'exit');child.kill();await done;}
}
