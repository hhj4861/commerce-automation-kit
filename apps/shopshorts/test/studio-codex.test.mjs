import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { existsSync } from 'node:fs';
import { codexArgs, codexEnvironment, disabledMcpArgs, parseCodexEvents, createCodexGenerator } from '../studio-codex.mjs';
import { accountFailureCode, accountFailureMessage, classifyCodexFailure } from '../lib/llm-account-errors.js';
import { openAccountServer } from '../studio-account-codex.mjs';

const events=(search=true)=>[
  ...(search?[{type:'item.completed',item:{type:'web_search',query:'psychology'}}]:[]),
  {type:'item.completed',item:{type:'agent_message',text:JSON.stringify({suggestions:[]})}},
  {type:'turn.completed'},
].map(event=>JSON.stringify(event)).join('\n');
function fixture() {
  let child,options,args,prompt;
  return {
    spawn(bin,argv,opts) {
      assert.equal(bin,'codex');options=opts;args=argv;
      child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();
      child.stdin=new Writable({write(chunk,encoding,done){prompt=String(chunk);done();}});
      child.kill=()=>{setImmediate(()=>child.emit('close',null));return true;};
      return child;
    },
    async ready(){while(!child) await new Promise(r=>setImmediate(r));},
    finish(output=events(),code=0){child.stdout.write(output);child.emit('close',code);},
    diagnostic(text){child.stderr.write(text);},
    failSpawn(code){child.emit('error',Object.assign(new Error('private spawn detail'),{code}));child.emit('close',-1);},
    get options(){return options;},get args(){return args;},get prompt(){return prompt;},
  };
}
test('CLI keeps subscription auth local with read-only execution and no API-key inheritance',()=>{
  assert.deepEqual(codexEnvironment({HOME:'/home/test',PATH:'/bin',CODEX_HOME:'/config',GEMINI_API_KEY:'secret',OPENAI_API_KEY:'secret',CODEX_API_KEY:'secret',CODEX_THREAD_ID:'parent'}),{HOME:'/home/test',PATH:'/bin',CODEX_HOME:'/config'});
  const args=codexArgs();
  for(const option of ['read-only','forced_login_method="chatgpt"','web_search="live"','features.shell_tool=false','--ephemeral']) assert.ok(args.includes(option));
  assert.ok(!args.some(arg=>arg.includes('bypass')||arg.includes('ignore')));
  assert.throws(()=>codexArgs('model; touch file'));
});
test('requires completed turn, uses actual search events, and rejects malformed final JSON',()=>{
  assert.equal(parseCodexEvents(events()).searched,true);
  assert.equal(parseCodexEvents(events(false)).searched,false);
  assert.throws(()=>parseCodexEvents(events()+'\n'+JSON.stringify({type:'turn.failed'})),e=>e.code==='CODEX_REQUEST_FAILED');
  assert.throws(()=>parseCodexEvents('not json'));
  assert.throws(()=>parseCodexEvents(JSON.stringify({type:'turn.completed'})),e=>e.code==='CODEX_OUTPUT_INVALID');
});

test('Codex failures retain actionable categories without exposing credential-bearing diagnostics',async()=>{
 const cases=[['invalid_grant refresh_token_reused','CODEX_AUTH_FAILED'],['usage_limit_reached 429','CODEX_RATE_LIMITED'],['stream disconnected: error sending request','CODEX_NETWORK_FAILED'],['unexpected argument --old-option','CODEX_RUNTIME_FAILED'],['request timed out','CODEX_TIMEOUT'],['unrecognized provider failure','CODEX_REQUEST_FAILED']];
 for(const [diagnostic,code] of cases){
  const f=fixture(),generate=createCodexGenerator({prepare:async()=>[],spawnProcess:f.spawn});
  const pending=generate('prompt');await f.ready();
  f.diagnostic(diagnostic+' access_token=private-secret https://auth.example/?code=private-secret');f.finish('',1);
  await assert.rejects(pending,error=>{
   assert.equal(accountFailureCode(error),code);
   assert.doesNotMatch(accountFailureMessage('codex',error),/private-secret|auth\.example/);
   if(code!=='CODEX_AUTH_FAILED')assert.doesNotMatch(error.message,/다시 연결/);
   return true;
  });
 }
 assert.equal(classifyCodexFailure(''), 'CODEX_REQUEST_FAILED');
});

test('structured turn errors win over generic stderr and missing executable is distinct',async()=>{
 const f=fixture(),generate=createCodexGenerator({prepare:async()=>[],spawnProcess:f.spawn});
 const pending=generate('prompt');await f.ready();f.diagnostic('generic failure');
 f.finish(JSON.stringify({type:'turn.failed',error:{message:'usage_limit_reached private-token'}}),1);
 await assert.rejects(pending,error=>error.code==='CODEX_RATE_LIMITED'&&!error.message.includes('private-token'));
 const missing=fixture(),run=createCodexGenerator({prepare:async()=>[],spawnProcess:missing.spawn});
 const absent=run('prompt');await missing.ready();missing.failSpawn('ENOENT');
 await assert.rejects(absent,error=>error.code==='CODEX_NOT_INSTALLED'&&error.status===503);
});

test('account-server login errors are classified and closed without exposing RPC secrets',async()=>{
 for(const [message,code] of [['invalid_grant private-secret','CODEX_AUTH_FAILED'],['connection reset private-secret','CODEX_NETWORK_FAILED'],['unknown private-secret','CODEX_REQUEST_FAILED']]){
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();
  child.kill=()=>{setImmediate(()=>child.emit('close',0));return true;};
  child.stdin=new Writable({write(chunk,encoding,done){
   const request=JSON.parse(String(chunk));
   if(request.id!==undefined)setImmediate(()=>child.stdout.write(JSON.stringify(request.method==='initialize'?{id:request.id,result:{}}:{id:request.id,error:{message}})+'\n'));
   done();
  }});
  const server=await openAccountServer({CODEX_HOME:'/fixture'},{spawnProcess:()=>child});
  try{await assert.rejects(server.call('account/read',{refreshToken:true}),error=>error.code===code&&!error.message.includes('private-secret'));}
  finally{await server.close();}
 }
});
test('stdin carries untrusted input as data, concurrent requests fail, temporary directory is removed',async()=>{
  const f=fixture(),generate=createCodexGenerator({prepare:async()=>[],spawnProcess:f.spawn});
  const result=generate('$(touch nope)');await f.ready();
  assert.equal(f.prompt,'$(touch nope)');assert.equal(f.options.shell,false);assert.equal(f.args.at(-1),'-');
  assert.ok(existsSync(f.options.cwd));
  await assert.rejects(generate('second'),e=>e.status===429);
  f.finish();assert.equal((await result).searched,true);assert.equal(existsSync(f.options.cwd),false);
});
test('abort and timeout terminate child before releasing single-request guard',async()=>{
  for(const timeout of [false,true]) {
    const f=fixture(),generate=createCodexGenerator({prepare:async()=>[],spawnProcess:f.spawn,timeoutMs:timeout?30:10000}),controller=new AbortController();
    const result=generate('prompt',{signal:controller.signal});
    const rejection=assert.rejects(result,e=>e.status===(timeout?504:499)&&(!timeout||e.code==='CODEX_TIMEOUT'));
    await f.ready();if(!timeout) controller.abort();await rejection;
    assert.equal(existsSync(f.options.cwd),false);
  }
});
test('nonzero process output is not returned to the browser',async()=>{
  const f=fixture(),generate=createCodexGenerator({prepare:async()=>[],spawnProcess:f.spawn});
  const result=generate('prompt');await f.ready();f.finish('secret token',1);
  await assert.rejects(result,e=>e.status===502&&!e.message.includes('secret'));
});

test('MCP restrictions explicitly disable both configured and plugin servers',()=>{
 const args=disabledMcpArgs([{name:'local',transport:{type:'stdio'}},{name:'remote',transport:{type:'streamable_http'}}]);
 assert.ok(args.includes('mcp_servers.local.enabled=false'));
 assert.ok(args.includes('mcp_servers.remote.enabled=false'));
 assert.throws(()=>disabledMcpArgs([{name:'bad.name'}]));
});


test('shared discovery draft disables native web search in actual spawn arguments',async()=>{
 const f=fixture(),generate=createCodexGenerator({prepare:async()=>[],spawnProcess:f.spawn});
 const pending=generate('server evidence only',{draftOnly:true});await f.ready();
 assert.ok(f.args.includes('web_search="disabled"'));assert.ok(!f.args.includes('web_search="live"'));
 f.finish(events(false));assert.equal((await pending).searched,false);
});
