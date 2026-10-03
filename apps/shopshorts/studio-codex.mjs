import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fail } from './lib/studio.js';
import { codexFailure, classifyCodexFailure } from './lib/llm-account-errors.js';
const execFileAsync=promisify(execFile);

// Let the official CLI manage its existing ChatGPT credentials and refresh flow.
// Never read auth.json or send a subscription token to the browser/API providers.
export function codexEnvironment(env = process.env) {
  return Object.fromEntries(['HOME','PATH','CODEX_HOME','TMPDIR','LANG','LC_ALL','SSL_CERT_FILE','NODE_EXTRA_CA_CERTS']
    .filter(key => env[key]).map(key => [key, env[key]]));
}

export function codexArgs(model, {draftOnly=false}={}) {
  if (model && !/^[a-zA-Z0-9._-]+$/.test(model)) fail('Codex 추천 모델 설정을 확인하세요.',503);
  return ['exec','--skip-git-repo-check','--ephemeral','--sandbox','read-only','--json','--color','never',
    '-c','approval_policy="never"','-c','forced_login_method="chatgpt"','-c','model_provider="openai"',
    '-c',draftOnly?'web_search="disabled"':'web_search="live"','-c','features.shell_tool=false','-c','features.apps=false',
    '-c','features.multi_agent=false','-c','features.computer_use=false','-c','features.browser_use=false',
    '-c','features.image_generation=false', ...(model ? ['--model',model] : []), '-'];
}

export function disabledMcpArgs(servers) {
  return servers.flatMap(server=>{
    if(!/^[a-zA-Z0-9_-]+$/.test(server.name)) fail('Codex MCP 이름에 지원하지 않는 문자가 있습니다.',503);
    const key=`mcp_servers.${server.name}`;
    // Explicit disabled entries also shadow plugin servers. An empty table would merge.
    const transport=server.transport?.type==='stdio'?'command="false"':'url="http://127.0.0.1:1"';
    return ['-c',`${key}.enabled=false`,'-c',`${key}.${transport}`];
  });
}

async function restrictMcp({cwd,signal,env}) {
  const list=async overrides=>{
    const {stdout}=await execFileAsync('codex',['mcp','list','--json',...overrides],{cwd,env:codexEnvironment(env),signal,timeout:15000,maxBuffer:1024*1024});
    return JSON.parse(stdout);
  };
  try {
    const args=disabledMcpArgs(await list([]));
    if((await list(args)).some(server=>server.enabled)) fail('추천 실행의 외부 도구 제한을 확인할 수 없습니다.',503);
    return args;
  } catch (error) {
    throw codexFailure(error.code === 'ENOENT' ? 'CODEX_NOT_INSTALLED' : 'CODEX_RUNTIME_FAILED',503);
  }
}

export function parseCodexEvents(output) {
  let completed=false, searched=false, answer='', failureCode=null;
  for (const line of output.split('\n').filter(Boolean)) {
    let event;
    try { event=JSON.parse(line); } catch { throw codexFailure('CODEX_OUTPUT_INVALID'); }
    if (event.type==='turn.failed' || event.type==='error') {
      const code=classifyCodexFailure(JSON.stringify(event.error ?? event.message ?? ''));
      if (!failureCode || code!=='CODEX_REQUEST_FAILED') failureCode=code;
    }
    if (event.type==='turn.completed') completed=true;
    if (event.type==='item.completed' && event.item?.type==='web_search' && event.item.status!=='failed') searched=true;
    if (event.type==='item.completed' && event.item?.type==='agent_message') answer=event.item.text;
  }
  if (failureCode || !completed) throw codexFailure(failureCode || 'CODEX_REQUEST_FAILED');
  let value;
  try { value=JSON.parse(answer.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,'')); }
  catch { throw codexFailure('CODEX_OUTPUT_INVALID'); }
  return {value,searched};
}

export function createCodexGenerator({spawnProcess=spawn, prepare=restrictMcp, timeoutMs=180000, env=process.env}={}) {
  let running=false;
  return async (prompt,{signal,model,draftOnly=false}={}) => {
    if (running) fail('다른 Codex 추천을 생성 중입니다. 잠시 후 다시 시도하세요.',429);
    const args=codexArgs(model,{draftOnly});
    if (signal?.aborted) fail('추천 요청이 취소되었습니다.',499);
    running=true;
    let cwd;
    try {
      cwd=await mkdtemp(join(tmpdir(),'shopshorts-codex-'));
      const restrictions=await prepare({cwd,signal,env});
      args.splice(args.length-1,0,...restrictions);
      if(signal?.aborted) fail('추천 요청이 취소되었습니다.',499);
      return await new Promise((resolve,reject) => {
        const child=spawnProcess('codex',args,{cwd,env:codexEnvironment(env),stdio:['pipe','pipe','pipe'],shell:false});
        child.stdout.setEncoding('utf8');
        let output='', diagnostic='', size=0, failure, killTimer;
        const stop=(message,status,code) => {
          if (failure) return;
          failure=Object.assign(new Error(message),{status,...(code?{code}:{})});
          child.kill('SIGTERM');
          killTimer=setTimeout(()=>child.kill('SIGKILL'),1500);
          killTimer.unref();
        };
        const abort=()=>stop('추천 요청이 취소되었습니다.',499);
        const timer=setTimeout(()=>stop(codexFailure('CODEX_TIMEOUT').message,504,'CODEX_TIMEOUT'),timeoutMs);
        signal?.addEventListener('abort',abort,{once:true});
        if(signal?.aborted) abort();
        child.stdout.on('data',chunk=>{
          size+=chunk.length;
          if(size>2*1024*1024) stop('Codex 추천 응답이 너무 큽니다.',502);
          else output+=chunk.toString();
        });
        // Keep only a bounded in-memory tail; return allowlisted codes, never CLI output.
        child.stderr.setEncoding('utf8');
        child.stderr.on('data',chunk=>{diagnostic=(diagnostic+chunk).slice(-16384);});
        child.stdin.on('error',()=>{});
        child.once('error',error=>{failure=codexFailure(error.code==='ENOENT'?'CODEX_NOT_INSTALLED':'CODEX_RUNTIME_FAILED',503);});
        child.once('close',code=>{
          clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',abort);
          if(failure) return reject(failure);
          if(code!==0) {
            let failureCode=classifyCodexFailure(diagnostic);
            try { parseCodexEvents(output); } catch(error) {
              if (error.code && !['CODEX_REQUEST_FAILED','CODEX_OUTPUT_INVALID'].includes(error.code)) failureCode=error.code;
            }
            return reject(codexFailure(failureCode));
          }
          try {resolve(parseCodexEvents(output));} catch(error) {reject(error);}
        });
        child.stdin.end(prompt);
      });
    } finally {
      try { if(cwd) await rm(cwd,{recursive:true,force:true}); }
      finally { running=false; }
    }
  };
}

export const generateCodexRecommendation=createCodexGenerator();
