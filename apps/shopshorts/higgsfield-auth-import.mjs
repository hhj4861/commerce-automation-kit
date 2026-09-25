// Run only after the broker release allowing the `higgsfield` vault record is deployed.
// Credentials never appear in argv, stdout, source, or Cloudflare plaintext storage.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { accountBroker } from './studio-account-worker.mjs';
import { higgsfieldCommand } from './studio-higgsfield-auth.mjs';
import { withoutCredentials } from '../credential-broker/runtime-env.mjs';

export async function importHiggsfield({file,workspaceId,replace=false,env=process.env,call=accountBroker(env),command=higgsfieldCommand}){
  if(!file || !/^[a-f0-9-]{36}$/.test(workspaceId||''))throw Error('인증 파일 경로와 작업 공간 ID가 필요합니다.');
  const cliEnv={...withoutCredentials(env),HIGGSFIELD_CREDENTIALS_PATH:resolve(file),HIGGSFIELD_WORKSPACE_ID:workspaceId,HIGGSFIELD_NO_UPDATE_CHECK:'1',HIGGSFIELD_DISABLE_TELEMETRY:'1'};
  const workspaces=await command(['workspace','list'],cliEnv);
  const workspace=workspaces.find(w=>w.id===workspaceId);
  if(!workspace || workspace.user_role!=='owner')throw Error('본인 소유 Higgsfield 작업 공간을 확인해 주세요.');
  // Read after the CLI call so a refreshed token, if any, is what we import.
  const credentials=JSON.parse(await readFile(file,'utf8'));
  if(!credentials.access_token || !credentials.refresh_token)throw Error('Higgsfield OAuth 로그인을 먼저 완료하세요.');
  const {record}=await call('/runner/vault',{operation:'read',name:'higgsfield'});
  if(record&&!replace)throw Error('이미 연결된 Higgsfield 계정이 있습니다. 실행기를 정상 종료한 뒤 --replace로 갱신해 주세요.');
  await call('/runner/vault',{operation:'write',name:'higgsfield',revision:record?.revision||0,value:{credentials,workspaceId}});
  const {record:saved}=await call('/runner/vault',{operation:'read',name:'higgsfield'});
  if(saved?.value?.credentials?.refresh_token!==credentials.refresh_token || saved.value.workspaceId!==workspaceId)throw Error('인증 저장 검증에 실패했습니다.');
  return {saved:true,plan:workspace.plan_type,credits:workspace.credits};
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1];
  importHiggsfield({file:args.includes('--file')?value('--file'):null,workspaceId:args.includes('--workspace')?value('--workspace'):null,replace:args.includes('--replace')})
    .then(result=>console.log(JSON.stringify(result)))
    .catch(()=>{console.error('Higgsfield 인증 이전 실패. 로그인·브로커 배포·기존 연결을 확인하세요. 인증 값은 기록하지 않습니다.');process.exitCode=1;});
}
