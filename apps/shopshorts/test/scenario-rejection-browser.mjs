// Local browser fixture: actual UI + owner-scoped API + encrypted vault; no LLM/media calls.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import Database from 'better-sqlite3';
import {accountAction} from '../../credential-broker/llm-accounts.mjs';
import {writeVault} from '../../credential-broker/vault.mjs';
import {studioApi} from '../lib/studio-api.js';
import {llmAccountApi,llmOwner} from '../lib/llm-account-api.js';
import {createProject,validateBrief} from '../lib/studio.js';
import {rejectedScenario} from '../lib/scenario-rejection.js';
import {reviewPrompt} from '../lib/explanation-depth.js';
import {mockReview} from './helpers/editorial-review.mjs';
const origin='http://127.0.0.1:5227',root=resolve(import.meta.dirname,'../public'),db=new Database(':memory:');
db.exec('CREATE TABLE credential_vault (name TEXT PRIMARY KEY, revision INTEGER, payload TEXT, updated_at TEXT)');
const env={SHOPSHORTS_TOKEN:'local-rejection-fixture',VAULT_KEY:{get:async()=>Buffer.alloc(32,15).toString('base64')},DB:{prepare(sql){return{bind(...args){return{first:async()=>db.prepare(sql).get(...args),all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:{changes:db.prepare(sql).run(...args).changes}})};}};}}};
const brief=validateBrief({category:'건축학',topic:'수원 서북공심돈의 돌출부는 무엇을 보여줄까?',format:'short',duration:24});
const draft={title:brief.topic,scenes:['성벽 바로 옆은 위에서 잘 보일까요?','돌출된 건물의 측면에서 성벽 밑을 바라봅니다.','돌출부는 벽 가까이의 빈 시야를 줄여 줍니다.'].map((narration,i)=>({id:`scene-${i+1}`,narration,prompt:'같은 성벽과 돌출부를 단면으로 보여주고 관측 방향을 움직인다.',duration:8,kind:'image'}))};
const raw=mockReview(await reviewPrompt(brief,draft),['mechanism','example']).value;
raw.checks.mechanism.reason='돌출되기 전과 후의 시야를 같은 위치에서 비교해야, 가려진 곳이 어떻게 보이는지 이해할 수 있습니다.';
raw.checks.example.reason='한 사람이 성벽 아래로 이동하는 예를 따라가며, 관측자가 볼 수 있는 구간의 변화를 보여 주세요.';
const evidence=await rejectedScenario(brief,draft,raw),owner=await llmOwner(new Request(origin,{headers:{cookie:'ss=local-rejection-fixture'}}),env);
const p=createProject(brief);p.automation={keyword:'서북공심돈'};p.task={id:crypto.randomUUID(),action:'scenario',state:'failed',reviewAvailable:true,runner:'llm-account',accountOwner:owner,error:'대본 검토에서 작동 과정과 구체적 예시를 보완해야 합니다.'};
await writeVault(env,`llm/account/${owner}`,{job:{id:p.task.id,projectId:p.id,kind:'scenario',state:'failed',rejection:evidence}},0);
const formatFailure=structuredClone(p);formatFailure.id=crypto.randomUUID();formatFailure.title='장면 형식 실패 · 검토 자료 없음';formatFailure.task={...formatFailure.task,id:crypto.randomUUID(),reviewAvailable:false,error:'대본의 장면 형식 또는 목표 길이를 맞추지 못했어요. 확인 항목: 2번 장면의 건축 부품 재질.'};
const store={execution:'fixture',capabilities:async()=>({}),list:async()=>structuredClone([p,formatFailure]),get:async id=>structuredClone([p,formatFailure].find(item=>item.id===id)||null)};
const call=(owner,operation,input)=>accountAction(env,owner,operation,input);
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin),chunks=[];for await(const part of req)chunks.push(part);const body=Buffer.concat(chunks).toString();
 const request=new Request(url,{method:req.method,headers:{...req.headers,cookie:'ss=local-rejection-fixture'},...(body?{body}:{})});let response;
 if(url.pathname==='/auth/status')response=Response.json({authenticated:true,user:{name:'검토 화면 검증'}});
 else if(url.pathname.startsWith('/api/studio'))response=await llmAccountApi(request,env,call)||await studioApi(request,env,store,{scenarioAccounts:call});
 else if(url.pathname.startsWith('/api/'))response=Response.json({items:[],jobs:[],requests:[],unreadCount:0});
 else if(url.pathname==='/favicon.ico')response=new Response(null,{status:204});
 else{const file=resolve(root,['/','/studio/automatic'].includes(url.pathname)?'index.html':url.pathname.slice(1));if(!file.startsWith(root+sep))throw Error('path');response=new Response(await readFile(file),{headers:{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'}});}
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){res.writeHead(500);res.end('fixture error');console.error(error.message);}});
await new Promise(r=>server.listen(5227,'127.0.0.1',r));console.log(`${origin}/studio/automatic?project=${p.id}`);console.log(`${origin}/studio/automatic?project=${formatFailure.id}`);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>{db.close();process.exit(0);}));
