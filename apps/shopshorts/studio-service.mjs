// Dedicated studio service: no shared Codex home or unrelated publishing queues.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { accountBroker } from './studio-account-worker.mjs';
import { withoutCredentials } from '../credential-broker/runtime-env.mjs';
import { cloudHiggsfieldRunner } from './studio-higgsfield-auth.mjs';
import { executeStudioTask } from './studio-runner.mjs';
import { startStudioWorker } from './studio-worker.mjs';

export async function startStudioService({env=process.env,call=accountBroker(env),start=startStudioWorker,log=console.error}={}) {
  const {values}=await call('/runner/secrets',{});
  const cloud=values.SHOPSHORTS_CLOUD_URL?.replace(/\/$/,'');
  if(!cloud || new URL(cloud).protocol!=='https:' || !values.SHOPSHORTS_TOKEN)throw Error('제작 서비스 연결 설정이 없습니다.');
  const {record}=await call('/runner/vault',{operation:'read',name:'higgsfield'});
  const runtimeEnv={...withoutCredentials(env),...values,CAK_CLOUD_SECRETS_ACTIVE:'1'};
  if(record)runtimeEnv.SHOPSHORTS_MEDIA_PROVIDER='higgsfield';
  const runHiggsfield=cloudHiggsfieldRunner(call,runtimeEnv);
  const worker=start({env:runtimeEnv,execute:(job,env,io,checkpoint)=>executeStudioTask(job,env,io,checkpoint,{runHiggsfield}),cloud,token:values.SHOPSHORTS_TOKEN,workDir:env.SHOPSHORTS_WORK_DIR || resolve(import.meta.dirname,'data/work'),keepAlive:true});
  worker.tick().catch(()=>log('[studio-service] 연결 재시도 대기. 인증 값은 기록하지 않습니다.'));
  return worker;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  startStudioService().then(worker=>{
    let closing=false;
    for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{
      if(closing)return;closing=true;
      try{await worker.stop();process.exitCode=0;}catch{process.exitCode=1;}
    });
  }).catch(()=>{console.error('[studio-service] 시작 실패. Cloudflare 연결 및 실행기 키를 확인하세요.');process.exitCode=1;});
}
