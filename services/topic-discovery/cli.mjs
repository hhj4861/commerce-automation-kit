import {parseArgs,promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {discoveryRuntimeEnv} from './runtime-config.mjs';
import {createDiscoveryClient} from './client.mjs';
import {createCodexGenerator,codexEnvironment} from '../../apps/shopshorts/studio-codex.mjs';
import {generateClaude,claudeEnvironment} from '../../apps/shopshorts/studio-account-claude.mjs';
const exec=promisify(execFile);
try {
  const {values}=parseArgs({options:{'request-id':{type:'string'},provider:{type:'string',default:'codex'},model:{type:'string',default:'provider-default'}}});
  if(!values['request-id']||!['codex','claude'].includes(values.provider))throw Error('request-id and valid provider required');
  let raw='';for await(const chunk of process.stdin){raw+=chunk;if(Buffer.byteLength(raw)>262144)throw Error('input_too_large');}
  const input={...JSON.parse(raw),runtime:{provider:values.provider,model:values.model}};
  const assertConnection=async()=>{
    if(values.provider==='codex')await exec('codex',['login','status'],{timeout:15000,maxBuffer:10000,env:values.provider==='codex'?codexEnvironment(process.env):claudeEnvironment(process.env)});
    else {const {stdout}=await exec('claude',['auth','status','--json'],{timeout:15000,maxBuffer:10000,env:values.provider==='codex'?codexEnvironment(process.env):claudeEnvironment(process.env)});if(JSON.parse(stdout).loggedIn!==true)throw Error('connection_unavailable');}
  };
  const generate=values.provider==='codex'?createCodexGenerator():generateClaude(process.env);
  const env=await discoveryRuntimeEnv({...process.env,DISCOVERY_ENABLED:'1'},process.env.DISCOVERY_PLATFORM||'cli');
  const client=createDiscoveryClient({baseUrl:env.DISCOVERY_URL,apiKey:env.DISCOVERY_API_KEY,subject:env.DISCOVERY_SUBJECT,allowLocalhost:env.DISCOVERY_ALLOW_LOCALHOST==='1'});
  const result=await client.discover(input,{idempotencyKey:values['request-id'],assertConnection,generate:async(prompt,{signal})=>(await generate(prompt,{signal,draftOnly:true,model:values.model==='provider-default'?undefined:values.model})).value});
  process.stdout.write(JSON.stringify(result)+'\n');
  if(result.state!=='complete'||!result.candidates.some(c=>c.decision==='accepted'))process.exitCode=2;
} catch(e){process.stderr.write(JSON.stringify({error:typeof e.code==='string'&&/^[a-z_]+$/.test(e.code)?e.code:'discovery_failed'})+'\n');process.exitCode=1;}
