import test from 'node:test';
import assert from 'node:assert/strict';
import {startStudioService} from '../studio-service.mjs';
import {startStudioWorker} from '../studio-worker.mjs';
test('dedicated service uses central secrets and stays alive without developer OAuth',async()=>{
 let options,ticks=0;const worker={tick:async()=>{ticks++;},stop:async()=>{}};
 const result=await startStudioService({env:{GEMINI_API_KEY:'stale',CODEX_HOME:'/private-user',PATH:'/bin'},call:async path=>{
  if(path==='/runner/vault')return {record:null};
  assert.equal(path,'/runner/secrets');return {values:{SHOPSHORTS_CLOUD_URL:'https://studio.test/',SHOPSHORTS_TOKEN:'fixture'}};
 },start:value=>{options=value;return worker;}});
 assert.equal(result,worker);assert.equal(ticks,1);assert.equal(options.keepAlive,true);
 assert.equal(options.env.GEMINI_API_KEY,undefined);assert.equal(options.env.CODEX_HOME,undefined);assert.equal(options.cloud,'https://studio.test');
});
test('missing service credentials do not start a worker',async()=>{
 let started=false;await assert.rejects(startStudioService({call:async()=>({values:{}}),start:()=>{started=true;}}));assert.equal(started,false);
});
test('central Higgsfield connection selects subscription media and overrides inherited provider settings',async()=>{
 let options;const worker={tick:async()=>{},stop:async()=>{}};
 await startStudioService({env:{HIGGSFIELD_API_URL:'https://untrusted.test',SHOPSHORTS_MEDIA_PROVIDER:'google'},call:async path=>path==='/runner/secrets'?{values:{SHOPSHORTS_CLOUD_URL:'https://studio.test',SHOPSHORTS_TOKEN:'fixture',GEMINI_API_KEY:'legacy'}}:{record:{revision:1,value:{workspaceId:'fixture',credentials:{access_token:'fixture'}}}},start:value=>{options=value;return worker;}});
 assert.equal(options.env.SHOPSHORTS_MEDIA_PROVIDER,'higgsfield');assert.equal(options.env.HIGGSFIELD_API_URL,undefined);assert.equal(typeof options.execute,'function');
});
test('worker does not claim account scenarios and gracefully drains current media job',async()=>{
 let release,started;const began=new Promise(r=>{started=r;}),gate=new Promise(r=>{release=r;});const calls=[];
 const job={id:'media-job',revision:1,task:{id:'task',state:'queued',action:'render'}};
 const worker=startStudioWorker({env:{},cloud:'https://studio.test',token:'fixture',execute:async()=>{started();await gate;return {render:{key:'test'}};},fetcher:async(url,options)=>{
  const path=new URL(url).pathname;calls.push(path);
  if(path==='/api/studio/worker')return Response.json({});
  if(path==='/api/studio')return Response.json({projects:[{id:'account-job',task:{state:'queued',runner:'llm-account'}},job]});
  if(path.endsWith('/claim'))job.task.state='running';
  if(path.endsWith('/complete'))job.task.state='done';
  job.revision++;return Response.json({project:job});
 }});
 const first=worker.tick();await began;assert.equal(worker.tick(),first);
 let stopped=false;const stop=worker.stop().then(()=>{stopped=true;});await Promise.resolve();assert.equal(stopped,false);
 release();await stop;assert.equal(job.task.state,'done');assert.ok(!calls.some(p=>p.includes('account-job')));
 const length=calls.length;await worker.tick();assert.equal(calls.length,length);
});

test('idle production service stays alive and handles graceful shutdown in a separate process',async()=>{
 const {spawn}=await import('node:child_process');const {once}=await import('node:events');
 const service=new URL('../studio-service.mjs',import.meta.url).href,workerModule=new URL('../studio-worker.mjs',import.meta.url).href;
 const child=spawn(process.execPath,['--input-type=module','-e',`
  import {startStudioService} from ${JSON.stringify(service)};
  import {startStudioWorker} from ${JSON.stringify(workerModule)};
  const worker=await startStudioService({call:async()=>({values:{SHOPSHORTS_CLOUD_URL:'https://fixture.test',SHOPSHORTS_TOKEN:'fixture'}}),start:options=>startStudioWorker({...options,fetcher:async()=>Response.json({projects:[]})})});
  process.once('SIGTERM',async()=>{await worker.stop();process.exitCode=0;});
  console.log('ready');
 `],{stdio:['ignore','pipe','pipe']});
 const exit=once(child,'close');
 try{
  await once(child.stdout,'data');await new Promise(r=>setTimeout(r,250));assert.equal(child.exitCode,null);
  child.kill('SIGTERM');const [code]=await exit;assert.equal(code,0);
 }finally{if(child.exitCode===null)child.kill('SIGKILL');}
});
