// Real UI modules + HTTP + encrypted vault + worker; provider failures are fixtures.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import Database from 'better-sqlite3';
import {chromium} from 'playwright';
import {accountAction,accountRunner} from '../../credential-broker/llm-accounts.mjs';
import {writeVault} from '../../credential-broker/vault.mjs';
import {startAccountWorker} from '../studio-account-worker.mjs';
const output=process.env.QUOTA_QA_OUTPUT;
if(!output)throw Error('QUOTA_QA_OUTPUT must point to the approved artifact directory');
await mkdir(output,{recursive:true});
const db=new Database(':memory:');db.exec('CREATE TABLE credential_vault(name TEXT PRIMARY KEY, revision INTEGER,payload TEXT,updated_at TEXT)');
const env={
 VAULT_KEY:{get:async()=>Buffer.alloc(32,7).toString('base64')},
 DB:{prepare(sql){return {bind(...args){return {
  first:async()=>db.prepare(sql).get(...args),
  all:async()=>({results:db.prepare(sql).all(...args)}),
  run:async()=>({meta:{changes:db.prepare(sql).run(...args).changes}}),
 };}};}},
};
const owner='a'.repeat(64),brief={category:'심리학',format:'short',duration:32,focus:'topic',topic:'보존할 기획',direction:''};
let code='CODEX_QUOTA_EXHAUSTED',calls=0;
const worker=startAccountWorker({intervalMs:50,log:()=>{},call:(_,input)=>accountRunner(env,input),execute:async()=>{calls++;throw Object.assign(Error('private diagnostic'),{code});}});
const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/llm-connection.css"></head><body><button data-ai-account>AI</button><section data-ai-onboarding></section><label>기획 <textarea id="topic">보존할 기획</textarea></label><button id="generate">생성 오류 확인</button><script type="module">
import {notifyAccountJobFailure} from '/llm-connection.js';import '/ai-account.js';
document.querySelector('#generate').onclick=async()=>{await fetch('/fixture/generate',{method:'POST'});let previous=null;while(true){await new Promise(r=>setTimeout(r,50));const state=await (await fetch('/api/studio/llm/status')).json();notifyAccountJobFailure(previous,state.job);previous=state.job;if(state.job?.state==='failed')break;}};
</script></body></html>`;
const root=resolve(import.meta.dirname,'../public');
const server=createServer(async(req,res)=>{try{
 let result;
 if(req.url==='/')result=new Response(html,{headers:{'content-type':'text/html'}});
 else if(req.url==='/api/studio/llm/status')result=Response.json(await accountAction(env,owner,'status'));
 else if(req.url==='/fixture/generate'&&req.method==='POST')result=Response.json(await accountAction(env,owner,'recommend',{brief}));
 else if(['/ai-account.js','/llm-connection.js','/llm-connection.css'].includes(req.url))result=new Response(await readFile(root+req.url),{headers:{'content-type':req.url.endsWith('.js')?'text/javascript':'text/css'}});
 else result=new Response(null,{status:404});
 res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
 }catch{res.writeHead(500);res.end('fixture error');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const [provider,reason] of [['codex','QUOTA_EXHAUSTED'],['claude','QUOTA_EXHAUSTED'],['codex','RATE_LIMITED']]){
  db.prepare('DELETE FROM credential_vault WHERE name=?').run(`llm/account/${owner}`);
  await writeVault(env,`llm/account/${owner}`,{provider,account:'fixture',credential:{fixture:true}},0);
  code=`${provider.toUpperCase()}_${reason}`;
  const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button',{name:provider==='codex'?'Codex · 연결됨':'Claude · 연결됨',exact:true}).waitFor();
  await page.locator('#generate').click();
  if(reason==='QUOTA_EXHAUSTED'){
   await page.locator('[data-ai-error]').filter({hasText:'연결을 자동 해제'}).waitFor();
   assert.equal(await page.locator('[data-ai-account]').innerText(),'AI 계정 연결');
   await page.locator('[data-ai-account]').click();
   await page.getByRole('button',{name:'Codex 연결',exact:true}).waitFor();
   await page.getByRole('button',{name:'Claude 연결',exact:true}).waitFor();
   assert.match(await page.locator('.llm-dialog').innerText(),/한도는 초기화되지/);
   await page.screenshot({path:resolve(output,`${provider}-quota.png`)});
  }else{
   let view;
   for(let attempt=0;attempt<100;attempt++){
    view=await(await page.request.get(`http://127.0.0.1:${server.address().port}/api/studio/llm/status`)).json();
    if(view.job?.state==='failed')break;
    await new Promise(r=>setTimeout(r,50));
   }
   assert.equal(view.job?.state,'failed');assert.equal(view.connected,true);assert.match(view.job.error,/일시적으로 제한/);
   assert.equal(await page.locator('[data-ai-account]').innerText(),'Codex · 연결됨');
  }
  assert.equal(await page.locator('#topic').inputValue(),'보존할 기획');assert.deepEqual(errors,[]);await page.close();
 }
 assert.equal(calls,3);console.log('PASS: Codex/Claude quota auto-disconnect + reconnect dialog + temporary 429 keeps connection + input preserved; real UI/HTTP/vault/worker, fixture providers.');
}finally{await browser?.close();await worker.stop();await new Promise(r=>server.close(r));db.close();}
