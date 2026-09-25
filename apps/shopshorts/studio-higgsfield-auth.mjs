import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
const require=createRequire(import.meta.url);

export const HIGGSFIELD_VERSION = '1.1.26';
export function higgsfieldCommand(args, env) {
  return new Promise((resolve, reject) => {
    const entry = env.SHOPSHORTS_HIGGSFIELD_CLI || join(dirname(require.resolve('@higgsfield/cli/package.json')),'vendor',process.platform==='win32'?'hf.exe':'hf');
    const child = spawn(entry, [...args, '--json'], { env, stdio: ['ignore','pipe','pipe'] });
    let output='', stderr='', timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},180000);
    child.stdout.on('data',data=>{output=(output+data).slice(-4000000);});
    child.stderr.on('data',data=>{stderr=(stderr+data).slice(-4000);});
    child.once('error',()=>{clearTimeout(timer);reject(Error('Higgsfield 실행기를 시작하지 못했습니다. 관리자에게 설치 확인을 요청하세요.'));});
    child.once('close',code=>{
      clearTimeout(timer);
      if(timedOut)return reject(Error('Higgsfield 응답 시간이 초과됐습니다. 접수 상태를 확인한 뒤 다시 시도하세요.'));
      if(code!==0){
        const message=/401|expired|authenticated|auth login/i.test(stderr)?'Higgsfield 계정 연결이 만료됐습니다. 관리자에게 계정 재연결을 요청하세요.':/credit|balance|402/i.test(stderr)?'Higgsfield 구독 크레딧이 부족합니다. 잔액을 확인해 주세요.':'Higgsfield 요청에 실패했습니다. 연결 상태와 생성 내역을 확인해 주세요.';
        return reject(Error(message));
      }
      try{resolve(JSON.parse(output));}catch{reject(Error('Higgsfield 응답을 확인하지 못했습니다. 생성 내역을 확인해 주세요.'));}
    });
  });
}

// Every invocation starts from Cloudflare's encrypted record, never the developer's home.
// Official CLI refreshes OAuth; CAS prevents overwriting a newer login/refresh.
export function cloudHiggsfieldRunner(call, baseEnv, {command=higgsfieldCommand,root=tmpdir()}={}) {
  // Never let inherited provider endpoint overrides redirect the hydrated OAuth token.
  const cliEnv=Object.fromEntries(Object.entries(baseEnv).filter(([key])=>!key.startsWith('HIGGSFIELD_')));
  let serial=Promise.resolve(), blocked=false;
  return args=>{
    const execute=async()=>{
      if(blocked)throw Error('Higgsfield 인증 저장을 확인해야 합니다. 관리자에게 실행기 확인을 요청하세요.');
      const {record}=await call('/runner/vault',{operation:'read',name:'higgsfield'});
      if(!record?.value?.credentials?.access_token || !record.value.workspaceId)throw Error('Higgsfield 계정이 연결되지 않았습니다. 관리자에게 연결을 요청하세요.');
      const dir=await mkdtemp(join(root,'cak-higgsfield-'));
      const file=join(dir,'credentials.json'),config=join(dir,'config.json');
      const before=JSON.stringify(record.value.credentials);
      let persistFailed=false;
      try{
        await writeFile(file,before,{mode:0o600,flag:'wx'});
        await writeFile(config,'{}',{mode:0o600,flag:'wx'});
        try{
          return await command(args,{...cliEnv,HIGGSFIELD_CREDENTIALS_PATH:file,HIGGSFIELD_CONFIG_PATH:config,HIGGSFIELD_WORKSPACE_ID:record.value.workspaceId,HIGGSFIELD_NO_UPDATE_CHECK:'1',HIGGSFIELD_DISABLE_TELEMETRY:'1'});
        }finally{
          try{
            const credentials=JSON.parse(await readFile(file,'utf8'));
            if(!credentials.access_token)throw Error('invalid credential');
            if(JSON.stringify(credentials)!==before)await call('/runner/vault',{operation:'write',name:'higgsfield',revision:record.revision,value:{...record.value,credentials}});
          }catch{persistFailed=true;blocked=true;throw Error('Higgsfield 갱신 인증을 저장하지 못했습니다. 보호된 복구 파일을 유지했으니 관리자에게 실행기 확인을 요청하세요.');}
        }
      }finally{if(!persistFailed)await rm(dir,{recursive:true,force:true});}
    };
    const result=serial.then(execute);serial=result.catch(()=>{});return result;
  };
}
