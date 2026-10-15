// Local real Next + Flutter release, synthetic accounts and deterministic AI only.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const dir = process.env.HANMADI_E2E_ARTIFACTS;
if (!dir) throw Error('Set HANMADI_E2E_ARTIFACTS to the task artifact directory.');
await mkdir(dir,{recursive:true});
const dataFile=resolve(dir,`synthetic-state-${Date.now()}.json`);await writeFile(dataFile,'{}',{flag:'wx'});
const phrase={text:'こんにちは。',reading:'콘니치와',meaning:'안녕하세요.'};
const mock=createServer(async(req,res)=>{
 const chunks=[];for await(const c of req)chunks.push(c);const b=JSON.parse(Buffer.concat(chunks).toString()||'{}');
 const schema=b.response_format?.json_schema?.name;let result=phrase;
 if(schema==='hanmadi_translation')result={translated:phrase.text,reading:phrase.reading,practice:phrase};
 if(schema==='hanmadi_learner_turn')result={phrase,reusable:true};
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}));
});mock.listen(0,'127.0.0.1');await once(mock,'listening');
const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
const base=`http://127.0.0.1:${port}`,upstream=`http://127.0.0.1:${mock.address().port}/v1`;
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,NODE_ENV:'development',HANMADI_LOCAL_DATA_FILE:dataFile,AUTH_SECRET:'synthetic-e2e-secret-at-least-32-characters',HANMADI_NATIVE_CLIENT_ENABLED:'true',HANMADI_DEPLOYMENT:'app',HANMADI_GOOGLE_CLIENT_ID:'',UPSTASH_REDIS_REST_URL:'',UPSTASH_REDIS_REST_TOKEN:'',KV_REST_API_URL:'',KV_REST_API_TOKEN:'',CONVERSATION_PROVIDER:'litellm',LITELLM_BASE_URL:upstream,LITELLM_API_KEY:'synthetic-only',LITELLM_MODEL:'gemini-fixture',AI_ACCOUNTS_URL:'',AI_ACCOUNTS_KEY:'',DIFY_BASE_URL:'',DIFY_API_KEY:''},stdio:['ignore','pipe','pipe']});
let logs='',browser,page;app.stdout.on('data',b=>{logs+=b});app.stderr.on('data',b=>{logs+=b});
try{
 for(let i=0;i<180;i++){try{if((await fetch(base+'/api/study/account')).status===401)break}catch{}if(i===179)throw Error('server not ready');await new Promise(r=>setTimeout(r,500));}
 let cookie='';
 async function api(path,body,auth,expected=200){
  const res=await fetch(base+path,{method:body?'POST':'GET',headers:{...(auth?{Authorization:`Bearer ${auth}`} : cookie?{cookie}:{}),...(body?{'Content-Type':'application/json',...(!auth?{Origin:base}:{})}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await res.json();assert.equal(res.status,expected,JSON.stringify(data));const set=res.headers.getSetCookie();if(set.length)cookie=set.map(c=>c.split(';')[0]).join('; ');return data;
 }
 const user='flutter_'+Date.now();await api('/api/study/account',{action:'signup',name:user,password:'synthetic-password-only-123'});
 await api('/api/study',{action:'assess',language:'ja',answers:[0,0,0],confidence:1,minutes:5});
 const catalog=await api('/api/study/catalog?language=ja');assert(catalog.units.length>=32);assert.equal(catalog.units[0].phrases.length,10);assert.equal(catalog.wordPacks.length,3);
 const verifier=randomBytes(32).toString('base64url'),state=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
 const a=await api('/api/study/client-auth',{action:'authorize',challenge,state});const code=new URL(a.callback).searchParams.get('code');
 const token=(await api('/api/study/client-auth',{action:'exchange',code,verifier,state})).token;
 assert.equal((await api('/api/study',undefined,token)).identity.name,user);
 const song=(await api('/api/study/practice-music',undefined,token)).songs.find(s=>s.language==='ja');
 await api('/api/study/practice-music',{action:'practice',trackId:song.id,revision:song.revision,index:0},token);
 await api('/api/study/practice-music',{action:'save-word',trackId:song.id,revision:song.revision,index:0},token);
 assert.equal((await api('/api/study')).state.expressions.length,1,'native save is visible to browser');
 await api('/api/study/client-auth',{action:'logout'},token);await api('/api/study',undefined,token,401);
 const missing=await fetch(base+'/api/study',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({action:'settings',autoSave:true})});assert.equal(missing.status,403);
 browser=await chromium.launch({headless:true,...(process.env.HANMADI_E2E_BROWSER_CHANNEL ? {channel:process.env.HANMADI_E2E_BROWSER_CHANNEL} : {})});const context=await browser.newContext({viewport:{width:390,height:844}});
 page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/study/app-login');await page.getByLabel('아이디',{exact:true}).fill(user);await page.getByLabel('비밀번호',{exact:true}).fill('synthetic-password-only-123');await page.getByRole('button',{name:'로그인',exact:true}).click();
 await page.waitForURL(url=>url.pathname==='/app'||url.pathname==='/app/');await page.getByText(/오늘도, 한마디 가까이/).waitFor({timeout:60000});
 await page.screenshot({animations:'disabled',caret:'hide',timeout:60000,path:resolve(dir,'mobile-study.png')});
 await page.getByRole('button',{name:/어떤 상황을 연습할까요.*선택/}).click();
 await page.getByRole('menuitem').first().waitFor();await page.waitForTimeout(220);await page.screenshot({animations:'disabled',caret:'hide',timeout:60000,path:resolve(dir,'mobile-scene-picker.png')});
 const menu=page.getByRole('menu');const menuBox=await menu.boundingBox();assert(menuBox && menuBox.height<=300 && menuBox.width<=340,'picker stays bounded');
 await page.getByRole('menuitem').first().focus();await page.keyboard.press('Escape');await page.getByRole('menuitem').first().waitFor({state:'hidden'});
 await page.getByRole('button',{name:/학습 언어 선택/}).click();await page.getByRole('menuitem').first().waitFor();await page.waitForTimeout(220);await page.screenshot({animations:'disabled',caret:'hide',timeout:60000,path:resolve(dir,'mobile-language-picker.png')});await page.mouse.click(5,400);await page.getByRole('menuitem').first().waitFor({state:'hidden'});
 await page.getByRole('button',{name:'학습 설정'}).click();await page.getByRole('button',{name:/연습 레벨 선택/}).click();await page.getByRole('menuitem').first().waitFor();await page.waitForTimeout(220);await page.screenshot({animations:'disabled',caret:'hide',timeout:60000,path:resolve(dir,'mobile-level-picker.png')});await page.getByRole('menuitem').first().click();await page.getByRole('menuitem').first().waitFor({state:'hidden'});await page.mouse.click(5,100);
 await page.getByRole('button',{name:'단어',exact:true}).click();await page.getByText(/아는 단어가, 쓰는 단어로/).waitFor();await page.screenshot({animations:'disabled',caret:'hide',timeout:60000,path:resolve(dir,'mobile-words.png')});
 await page.getByRole('button',{name:'음악',exact:true}).click();await page.getByRole('button',{name:'이어서 연습하기',exact:true}).first().click();
 await page.getByRole('button',{name:'스터디로',exact:true}).waitFor();await page.screenshot({animations:'disabled',caret:'hide',timeout:60000,path:resolve(dir,'mobile-music.png')});
 await page.getByRole('button',{name:'스터디로',exact:true}).click();await page.getByRole('tab',{name:/AI 대화/}).click();
 const input=page.locator('textarea[data-semantics-role="text-field"]');
 await page.waitForTimeout(400); // Flutter branch transition may replace the semantic editor.
 await input.focus();await page.waitForFunction(()=>document.activeElement===document.querySelector('textarea[data-semantics-role="text-field"]'));
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await input.fill('こんにちは');await page.waitForTimeout(100);
 assert.equal(await input.inputValue(),'こんにちは');
 await page.getByRole('button',{name:/메시지 보내기/}).click();await page.getByRole('textbox',{name:/안녕하세요[.]/}).waitFor({timeout:30000});
 await page.screenshot({animations:'disabled',caret:'hide',timeout:60000,path:resolve(dir,'mobile-chat.png')});await page.getByRole('tab',{name:/번역/}).click();await page.screenshot({animations:'disabled',caret:'hide',timeout:60000,path:resolve(dir,'mobile-translation.png')});
 await page.waitForTimeout(400);const translationInput=page.locator('textarea[data-semantics-role="text-field"]');await translationInput.focus();await page.waitForFunction(()=>document.activeElement===document.querySelector('textarea[data-semantics-role="text-field"]'));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await translationInput.fill('안녕하세요');await page.waitForTimeout(100);
 await page.getByRole('button',{name:'번역하기',exact:true}).click();await page.getByRole('textbox',{name:/이렇게 전해 보세요/}).waitFor({timeout:30000});
 await page.getByRole('tab',{name:/보관함/}).click();await page.getByText(/다시 꺼내 쓰는 나의 말/).waitFor();await page.screenshot({animations:'disabled',caret:'hide',timeout:60000,path:resolve(dir,'mobile-library.png')});
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('tablist').waitFor({state:'hidden'});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({animations:'disabled',caret:'hide',timeout:60000,path:resolve(dir,'desktop-library.png')});assert.deepEqual(errors,[]);
 await writeFile(resolve(dir,'result.json'),JSON.stringify({pass:true,ai:'local fixture only',production:false,checks:['PKCE','shared storage','revocation','Origin','catalog','bounded pickers','focused Escape','outside dismiss','level selection','words','music return','chat','translation','library']},null,2));
 console.log('PASS real API auth/save/revoke/Origin and Flutter music return/chat/translation/library');
}catch(e){ if(page){await page.screenshot({animations:'disabled',caret:'hide',timeout:60000,path:resolve(dir,'failure.png')}).catch(()=>{});await writeFile(resolve(dir,'failure-dom.txt'),await page.locator('body').ariaSnapshot().catch(()=>''));await writeFile(resolve(dir,'failure.html'),await page.content());}throw e;
}finally{
 await browser?.close();app.kill('SIGTERM');await new Promise(r=>{if(app.exitCode!==null)r();else{app.once('exit',r);setTimeout(r,5000)}});await new Promise(r=>mock.close(r));await writeFile(resolve(dir,'server.log'),logs);
}
