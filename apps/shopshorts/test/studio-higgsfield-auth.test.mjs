import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cloudHiggsfieldRunner} from '../studio-higgsfield-auth.mjs';
import {importHiggsfield} from '../higgsfield-auth-import.mjs';
const id='11111111-1111-4111-8111-111111111111';
async function temporary(fn){const root=await mkdtemp(join(tmpdir(),'higgsfield-auth-test-'));try{await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
test('official CLI receives isolated auth, refreshed tokens persist with CAS even after command failure',()=>temporary(async root=>{
 let record={revision:1,value:{workspaceId:id,credentials:{access_token:'fixture',refresh_token:'original'}}},writes=0;
 const run=cloudHiggsfieldRunner(async(path,input)=>{
  assert.equal(path,'/runner/vault');assert.equal(input.name,'higgsfield');
  if(input.operation==='read')return {record:structuredClone(record)};
  assert.equal(input.revision,record.revision);record={revision:record.revision+1,value:input.value};writes++;return {revision:record.revision};
 },{PATH:'/bin',HIGGSFIELD_API_URL:'https://untrusted.test',HIGGSFIELD_CREDENTIALS_PATH:'/private-home'},{root,command:async(args,env)=>{
  assert.equal(env.HIGGSFIELD_API_URL,undefined);assert.notEqual(env.HIGGSFIELD_CREDENTIALS_PATH,'/private-home');
  assert.equal(env.HIGGSFIELD_WORKSPACE_ID,id);assert.equal((await stat(env.HIGGSFIELD_CREDENTIALS_PATH)).mode&0o777,0o600);
  assert.equal((await stat(root)).mode&0o777,0o700);
  const credentials=JSON.parse(await readFile(env.HIGGSFIELD_CREDENTIALS_PATH,'utf8'));credentials.refresh_token='rotated';await writeFile(env.HIGGSFIELD_CREDENTIALS_PATH,JSON.stringify(credentials));
  if(args[0]==='fail')throw Error('provider failure');return {credits:2};
 }});
 await assert.rejects(run(['fail']),/provider failure/);assert.equal(record.value.credentials.refresh_token,'rotated');assert.equal(writes,1);assert.deepEqual(await readdir(root),[]);
 assert.deepEqual(await run(['cost']),{credits:2});assert.equal(writes,1);
}));
test('failed refresh persistence retains recovery file and stops later commands',()=>temporary(async root=>{
 let calls=0;
 const run=cloudHiggsfieldRunner(async(path,input)=>{
  if(input.operation==='write')throw Error('CAS conflict');return {record:{revision:1,value:{workspaceId:id,credentials:{access_token:'fixture'}}}};
 },{}, {root,command:async(args,env)=>{calls++;await writeFile(env.HIGGSFIELD_CREDENTIALS_PATH,JSON.stringify({access_token:'new'}));return {};}});
 await assert.rejects(run(['cost']),/저장하지/);assert.equal((await readdir(root)).length,1);
 await assert.rejects(run(['cost']),/저장을 확인/);assert.equal(calls,1);
}));
test('missing cloud connection never falls back to developer credentials',async()=>{
 let executed=false;const run=cloudHiggsfieldRunner(async()=>({record:null}),{}, {command:async()=>{executed=true;}});
 await assert.rejects(run(['cost']),/연결되지/);assert.equal(executed,false);
});
test('import validates owner and stores only to encrypted vault, never replaces existing auth',()=>temporary(async root=>{
 const file=join(root,'credentials.json');await writeFile(file,JSON.stringify({access_token:'fixture',refresh_token:'fixture-refresh'}));let record=null;
 const options={file,workspaceId:id,env:{},command:async()=>[{id,user_role:'owner',plan_type:'plus',credits:50}],call:async(path,input)=>{
  if(input.operation==='read')return {record};assert.equal(input.revision,record?.revision||0);record={revision:(record?.revision||0)+1,value:input.value};return {revision:record.revision};
 }};
 assert.deepEqual(await importHiggsfield(options),{saved:true,plan:'plus',credits:50});
 await assert.rejects(importHiggsfield(options),/이미 연결/);
 assert.equal((await importHiggsfield({...options,replace:true})).saved,true);assert.equal(record.revision,2);
 await assert.rejects(importHiggsfield({...options,command:async()=>[{id,user_role:'member'}]}),/본인 소유/);
}));
