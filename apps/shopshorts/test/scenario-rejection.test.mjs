import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './llm-accounts.test.mjs';
import {accountAction,accountRunner} from '../../credential-broker/llm-accounts.mjs';
import {readVault,writeVault} from '../../credential-broker/vault.mjs';
import {scenarioBrief,scenarioResult} from '../lib/studio-scenario.js';
import {reviewPrompt,validateDepthReview} from '../lib/explanation-depth.js';
import {rejectedScenario,readScenarioRejection} from '../lib/scenario-rejection.js';
import {validateBrief,createProject} from '../lib/studio.js';
import {llmAccountApi,llmOwner} from '../lib/llm-account-api.js';
import {signSession} from '../lib/google-auth.js';
import {startAccountWorker} from '../studio-account-worker.mjs';
import {syncScenario} from '../lib/studio-scenario-account.js';
import {rejectionMarkup} from '../public/scenario-rejection.js';
import {mockReview} from './helpers/editorial-review.mjs';
const brief=validateBrief({category:'심리학',topic:'대화하기 전',format:'short',duration:24});
const raw={title:'한 번 더 생각하기',scenes:['왜 날카롭게 말했을까요?','지쳤을 때 잠깐 숨을 고르세요.','내 마음을 살핀 뒤 다시 이야기해요.'].map((narration,i)=>({id:`scene-${i+1}`,narration,prompt:'같은 사람이 숨을 고르고 다시 대화한다.',duration:8,kind:'image'}))};
const generated={...raw,storyArc:Object.fromEntries(['hook','payoff','ending'].map((k,i)=>[k,{sceneId:raw.scenes[i].id,line:raw.scenes[i].narration}]))};
const draft=scenarioResult(raw,brief);
async function rejection(){const review=await validateDepthReview(mockReview(await reviewPrompt(brief,draft),['mechanism','example']).value,brief,draft);return rejectedScenario(brief,draft,review);}
const waitFor=async check=>{for(let i=0;i<150;i++){if(await check())return;await new Promise(r=>setTimeout(r,10));}throw Error('Condition not reached');};

test('real scenario orchestration retains only validated rejected content and still throws',async()=>{
 let calls=0;
 await assert.rejects(scenarioBrief(brief,{}, {generate:async prompt=>{calls++;return mockReview(prompt,['mechanism','example'])||{value:generated};}}),asyncError=>{
  assert.equal(asyncError.code,'SCENARIO_DEPTH_INVALID');
  assert.equal(asyncError.rejection.review.passed,false);assert.deepEqual(asyncError.rejection.draft,draft);
  assert.match(asyncError.rejection.review.checks.mechanism.reason,/변환 단계/);return true;
 });
 assert.equal(calls,4);
 const evidence=await rejection();const forged=structuredClone(evidence);forged.draft.scenes[0].narration='different';
 assert.equal(await readScenarioRejection(forged),null);
 const unsafe={...evidence,credential:'do-not-return',stdout:'do-not-return'};
 assert.doesNotMatch(JSON.stringify(await readScenarioRejection(unsafe)),/do-not-return/);
 const passed=mockReview(await reviewPrompt(brief,draft)).value;
 await assert.rejects(rejectedScenario(brief,draft,passed),/Only rejected/);
});

test('failed evidence survives worker, project ACK, later job and disconnect, with owner/project isolation',async t=>{
 const {env,db}=fixture();t.after(()=>db.close());
 Object.assign(env,{SHOPSHORTS_SESSION_SECRET:'s'.repeat(40),SHOPSHORTS_GOOGLE_ALLOW_SIGNUPS:'1'});
 const cookie=await signSession({type:'user',sub:'owner-a',email:'a@example.test',exp:Date.now()+60000},env);
 const headers={cookie:`ss_google=${cookie}`};
 const owner=await llmOwner(new Request('https://studio.test',{headers}),env),other='b'.repeat(64);
 const project=createProject(brief);delete project.brief.visualQuality;
 const id=crypto.randomUUID(),name=`llm/account/${owner}`;
 await writeVault(env,name,{provider:'codex',credential:{fixture:true}},0);
 await accountRunner(env,{operation:'poll',scenario:true});
 await accountAction(env,owner,'scenario',{id,projectId:project.id,brief});
 let logs='';
 const worker=startAccountWorker({intervalMs:100000,call:(_path,input)=>accountRunner(env,input),log:x=>{logs+=x;},execute:()=>scenarioBrief(brief,{}, {generate:async prompt=>mockReview(prompt,['mechanism','example'])||{value:generated}})});
 try{await waitFor(async()=> (await readVault(env,name)).value.job.state==='failed');}finally{await worker.stop();}
 const input={id,projectId:project.id};const before=await accountAction(env,owner,'scenario-status',input);
 assert.ok(before.job.rejection);assert.equal(before.job.state,'failed');assert.equal(before.job.result,undefined);
 assert.doesNotMatch(logs,/한 번 더|변환 단계/);
 assert.doesNotMatch(JSON.stringify(await accountAction(env,owner,'status')),/한 번 더|변환 단계/);
 const queued={...project,task:{id,action:'scenario',runner:'llm-account',accountOwner:owner,state:'running',deadline:Date.now()+60000}};
 let saved;const store={cas:async next=>{saved=next;return true;}};
 const result=await syncScenario(store,queued,(o,op,data)=>accountAction(env,o,op,data));
 assert.equal(result.task.state,'failed');assert.equal(result.scenes.length,0);assert.equal(result.approved,false);
 assert.doesNotMatch(JSON.stringify(saved),/한 번 더|변환 단계/);
 const afterAck=await accountAction(env,owner,'scenario-status',input);
 assert.deepEqual(afterAck.job.rejection,before.job.rejection);
 await accountAction(env,owner,'scenario-ack',input);
 await accountAction(env,owner,'recommend',{brief:{...brief,focus:'topic'}});
 await accountAction(env,owner,'disconnect');
 assert.deepEqual((await accountAction(env,owner,'scenario-status',input)).job.rejection,before.job.rejection);
 assert.equal((await accountAction(env,other,'scenario-status',input)).job,null);
 assert.equal((await accountAction(env,owner,'scenario-status',{...input,projectId:crypto.randomUUID()})).job,null);
 assert.doesNotMatch(db.prepare('SELECT payload FROM credential_vault WHERE name=?').get(`llm/scenario/${owner}/${id}`).payload,/한 번 더|변환 단계/);
 const request=new Request(`https://studio.test/api/studio/llm/scenario-review?id=${id}&projectId=${project.id}`,{headers});
 const call=(o,op,data)=>accountAction(env,o,op,data);
 const response=await llmAccountApi(request,env,call);
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.deepEqual((await response.json()).rejection,before.job.rejection);
 const otherCookie=await signSession({type:'user',sub:'owner-b',email:'b@example.test',exp:Date.now()+60000},env);
 const otherResponse=await llmAccountApi(new Request(request.url,{headers:{cookie:`ss_google=${otherCookie}`}}),env,call);
 assert.equal((await otherResponse.json()).rejection,null);
 assert.equal((await llmAccountApi(new Request(request.url),env,call)).status,401);
 assert.equal((await llmAccountApi(new Request(request.url,{headers:{...headers,origin:'https://evil.test'}}),env,call)).status,403);
 assert.equal((await llmAccountApi(new Request(request.url.replace(id,'invalid'),{headers}),env,call)).status,400);
});

test('rejection screen quotes the scenes and reasons as text, not executable HTML',async()=>{
 const value=await rejection();value.review.checks.mechanism.reason='<img src=x onerror=alert(1)>';
 value.draft.scenes[0].narration='<script>bad()</script>';
 const html=rejectionMarkup(value);
 assert.match(html,/작동 과정/);assert.match(html,/검토받은 대본 전체/);assert.match(html,/1번 장면/);
 assert.match(html,/&lt;img/);assert.match(html,/&lt;script/);assert.doesNotMatch(html,/<img|<script/);
 assert.doesNotMatch(html,/data-auto-action|data-approve/);
 assert.match(rejectionMarkup(null),/보관되지/);
});
