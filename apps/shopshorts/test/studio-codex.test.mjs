import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { existsSync } from 'node:fs';
import { codexArgs, codexEnvironment, disabledMcpArgs, parseCodexEvents, createCodexGenerator } from '../studio-codex.mjs';

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
  assert.throws(()=>parseCodexEvents(events()+'\n'+JSON.stringify({type:'turn.failed'})),/완료되지/);
  assert.throws(()=>parseCodexEvents('not json'));
  assert.throws(()=>parseCodexEvents(JSON.stringify({type:'turn.completed'})),/형식/);
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
    const rejection=assert.rejects(result,e=>e.status===(timeout?504:499));
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
