import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {recommendBrief} from '../lib/studio-recommendations.js';
const brief={category:'건축학',format:'short',duration:60,focus:'topic',topic:'국내 건축물',direction:'그림 중심'};
const env={DISCOVERY_ENABLED:'1',DISCOVERY_WORKFLOW:'research-v2',DISCOVERY_URL:'https://discovery.example',DISCOVERY_API_KEY:'k'.repeat(40)};
const c={id:'candidate-1',title:'돌아가는 다리의 비밀',entity:'회전교',location:'한국',question:'다리는 왜 돌아갈까?',expectedAnswer:'들어올릴 것이다',answer:'선박 통과를 위한 회전',whyItMatters:'통행을 함께 유지',direction:'회전 전후를 보여준다',keyword:'회전교',openingVisual:'다리가 돌아간다',evidenceIds:['source-1'],decision:'accepted'};
test('studio maps only accepted common-server candidates to recommendations',async()=>{
 let generation=0,checks=0,stage=0;
 const data=await recommendBrief({...brief,reviewMode:'native-llm-v1'},env,{subject:'a'.repeat(64),requestId:'studio-job-001',provider:'codex',history:[],assertConnection:async()=>{checks++;},
  generate:async(_prompt,options)=>{assert.equal(options.draftOnly,true);generation++;return {value:{candidates:[c]}};},
  fetch:async(url,init)=>{
   const value=JSON.parse(init.body);
   if(url.endsWith('/v1/discover')){assert.equal(value.workflow,'research-v2');assert.equal(value.reviewMode,undefined);assert.equal(value.profile,'content');assert.equal(value.category,'건축학');assert.equal(value.brief.split('\n')[0],brief.topic);assert.ok(value.brief.includes('\n'+brief.direction+'\n'));}
   if(url.endsWith('/complete')&&stage===0){stage++;return Response.json({requestId:'request',state:'awaiting_generation',usage:{generationClaims:1},candidates:[],evidence:[],action:{id:'draft-action',stage:'draft',runtime:{model:'provider-default',provider:'codex'},prompt:'Draft'}});}
   return Response.json(url.endsWith('/complete')?{requestId:'request',state:'complete',rubricVersion:'discovery-v1',candidates:[c,{...c,id:'held',decision:'held'}],evidence:[{id:'source-1',url:'https://operator.example/bridge',title:'운영기관'}]}:{requestId:'request',state:url.endsWith('/claim')?'generating':'awaiting_generation',usage:{generationClaims:stage+(url.endsWith('/claim')?1:0)},candidates:[],evidence:[],action:{id:stage?'draft-action':'research-action',stage:stage?'draft':'research',runtime:{model:'provider-default',provider:'codex'},prompt:'Draft'}});
  }});
 assert.equal(generation,2);assert.equal(checks,7);assert.equal(data.suggestions.length,1);
 assert.equal(data.suggestions[0].caseStudy.entity,'회전교');assert.equal(data.verification.held,1);
});
test('enabled service failures never run the legacy recommendation fallback',async()=>{
 let generation=0;
 await assert.rejects(recommendBrief(brief,env,{subject:'a'.repeat(64),requestId:'studio-job-002',provider:'codex',assertConnection:async()=>{},generate:async()=>{generation++;},fetch:async()=>Response.json({error:'search_unavailable'},{status:503})}),/공통 주제 검증/);
 assert.equal(generation,0);
});


test('verification diagnostics survive the account worker boundary without exposing upstream text',async()=>{
 const {accountFailureCode,accountFailureMessage}=await import('../lib/llm-account-errors.js');
 for(const [reason,code] of [['no_grounded_candidates','DISCOVERY_NO_ACCEPTED_CANDIDATES'],['search_evidence_missing','DISCOVERY_NO_ACCEPTED_CANDIDATES'],['skipped_by_budget','DISCOVERY_BUDGET_LIMIT'],['discovery_in_progress','DISCOVERY_IN_PROGRESS'],['private_upstream_detail','DISCOVERY_UNAVAILABLE']]){
  await assert.rejects(recommendBrief(brief,env,{subject:'a'.repeat(64),requestId:'studio-job-003',provider:'codex',assertConnection:async()=>{},fetch:async()=>Response.json({error:reason},{status:503})}),e=>{
   assert.equal(accountFailureCode(e),code);
   for(const provider of ['codex','claude']){assert.equal(accountFailureMessage(provider,e),e.message);assert.doesNotMatch(e.message,/private_upstream_detail|계정을 다시 연결/);}
   return true;
  });
 }
 assert.match(accountFailureMessage('codex',{code:'DISCOVERY_NO_ACCEPTED_CANDIDATES'}),/관심사를 더 구체화/);
});


test('maximum planning text survives transport without duplicate JSON escaping',async()=>{
 for(const char of ['가','a','"','\\','\u0001']){
  const input={...brief,topic:char.repeat(1000),direction:char.repeat(2000),productionStyle:'animation',workflow:'explainer-v1'};
  let observed=false;
  await assert.rejects(recommendBrief(input,env,{subject:'a'.repeat(64),requestId:'studio-limit-001',provider:'codex',assertConnection:async()=>{},fetch:async(_url,init)=>{
   const value=JSON.parse(init.body);observed=true;
   assert.ok(value.brief.length<=6000);
   assert.ok(value.brief.startsWith(input.topic+'\n'));
   assert.ok(value.brief.includes('\n제작 요청사항:\n'+input.direction+'\n'));
   const preferences=JSON.parse(value.brief.split('\n제작 설정:\n')[1]);
   assert.equal(preferences.productionStyle,'animation');assert.equal(preferences.workflow,'explainer-v1');
   assert.equal(preferences.topic,undefined);assert.equal(preferences.direction,undefined);
   return Response.json({error:'search_evidence_missing'},{status:503});
  }}),e=>e.code==='DISCOVERY_NO_ACCEPTED_CANDIDATES');
  assert.equal(observed,true);
 }
});


test('invalid native-review configuration fails before network or generation',async()=>{
 for(const config of [
  {DISCOVERY_REVIEW_MODE:'typo'},
  {DISCOVERY_REVIEW_MODE:'native-llm-v1',DISCOVERY_WORKFLOW:undefined},
  {DISCOVERY_REVIEW_MODE:'native-llm-v1',DISCOVERY_WORKFLOW:'research-v1'},
 ]){
  let calls=0;
  await assert.rejects(recommendBrief(brief,{...env,...config},{subject:'a'.repeat(64),requestId:'invalid-review-mode',provider:'codex',
   assertConnection:async()=>{calls++;},generate:async()=>{calls++;},fetch:async()=>{calls++;}}),{code:'DISCOVERY_UNAVAILABLE'});
  assert.equal(calls,0);
 }
});

for(const provider of ['codex','claude'])for(const revoke of [false,true])test(`studio native review over real HTTP: ${provider}${revoke?' revoked before review':' replay'}`,async()=>{
 const root=await mkdtemp(join(process.env.DISCOVERY_TEST_DIR || tmpdir(),'studio-review-http-'));
 const code="from server import make_server\nfrom service import Discovery,Store\nfrom test_service import SOURCE\nfrom test_native_review import low_result\nimport sys\ns=make_server(('127.0.0.1',0),Discovery(Store(sys.argv[1]),lambda q:[{**SOURCE,'title':'회전교 공식 설명'}],low_result),{'shopshorts':'k'*40})\nprint(s.server_port,flush=True)\ns.serve_forever()";
 const child=spawn('python3',['-u','-c',code,join(root,'state.sqlite')],{cwd:fileURLToPath(new URL('../../../services/topic-discovery/',import.meta.url)),env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:['ignore','pipe','pipe']});
 const closed=once(child,'close');let errors='';child.stderr.on('data',d=>errors+=d);
 try {
  const port=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('fixture timeout')),10000);
   child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',()=>{clearTimeout(timer);reject(Error('fixture exit '+errors));});
   child.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});
  });
  const runtime={provider,model:'selected-'+provider};
  const configured={...env,DISCOVERY_URL:'http://127.0.0.1:'+port,DISCOVERY_ALLOW_LOCALHOST:'1',DISCOVERY_REVIEW_MODE:'native-llm-v1',
   [provider==='codex'?'SHOPSHORTS_CODEX_MODEL':'SHOPSHORTS_CLAUDE_MODEL']:runtime.model};
  let generations=0,checks=0,claims=0,completions=0;const stages=[];
  const options={provider,subject:'a'.repeat(64),requestId:'studio-native-review-001',now:new Date('2026-10-05T00:00:00Z'),history:[],
   assertConnection:async bound=>{assert.deepEqual(bound,runtime);checks++;if(revoke&&checks===8)throw Object.assign(Error('Revoked'),{code:provider==='codex'?'CODEX_AUTH_FAILED':'CLAUDE_AUTH_FAILED'});},
   fetch:async(url,init)=>{
    if(url.endsWith('/v1/discover')){const request=JSON.parse(init.body);assert.equal(request.reviewMode,'native-llm-v1');assert.deepEqual(request.runtime,runtime);}
    if(url.endsWith('/claim'))claims++;
    if(url.endsWith('/complete'))completions++;
    const response=await fetch(url,init);const body=await response.clone().json();if(body.action)stages.push(body.action.stage);return response;
   },
   generate:async(prompt,options)=>{
    assert.equal(options.draftOnly,true);assert.equal(options.model,runtime.model);generations++;
    if(generations===1)return {value:{leads:[{entity:'회전교',question:'회전하는 이유는?',keyword:'원리',evidenceIds:['source-1']}]}};
    if(generations===2)return {value:{candidates:[{...c,decision:undefined,id:undefined,leadId:'lead-1',evidenceIds:['lead-1-source-1']}]}};
    const ctx=JSON.parse(prompt.slice(prompt.lastIndexOf('\n')+1));
    return {value:{reviews:ctx.items.map(item=>({candidateId:item.candidateId,checks:Object.fromEntries(item.requiredChecks.map(name=>[name,
     {choice:'pass',issue:'none',rationale:'Protocol fixture, not live quality.',citations:[{evidenceId:item.evidence[0].id,quote:item.evidence[0].excerpt}]}]))}))}};
   }};
  if(revoke){
   await assert.rejects(recommendBrief(brief,configured,options),{code:provider==='codex'?'CODEX_AUTH_FAILED':'CLAUDE_AUTH_FAILED'});
   assert.equal(generations,2);assert.equal(claims,2);assert.equal(completions,2);assert.ok(stages.includes('review'));
  }else{
   const result=await recommendBrief(brief,configured,options);
   assert.equal(result.verification.rubricVersion,'discovery-v2.6');assert.equal(result.verification.requiresHumanReview,true);assert.equal(result.verification.factChecked,false);
   assert.equal(result.suggestions.length,1);assert.equal(result.suggestions[0].topic,c.title);
   assert.deepEqual([...new Set(stages)],['research','draft','review']);assert.equal(generations,3);assert.equal(checks,10);
   assert.deepEqual(await recommendBrief(brief,configured,options),result);assert.equal(generations,3);assert.equal(claims,3);assert.equal(completions,3);
  }
 }finally{child.kill('SIGTERM');await closed;await rm(root,{recursive:true,force:true});}
});

// Production returns HTTP 200 + held here, not an upstream transport failure.
for (const provider of ['codex','claude']) test(`ungrounded research explains the hold without generation or retry: ${provider}`,async()=>{
 const {accountFailureCode,accountFailureMessage}=await import('../lib/llm-account-errors.js');
 let network=0,generation=0;
 await assert.rejects(recommendBrief(brief,{...env,DISCOVERY_REVIEW_MODE:'native-llm-v1'},{
  subject:'a'.repeat(64),requestId:'research-hold-001',provider,history:[],assertConnection:async()=>{},
  generate:async()=>{generation++;throw Error('must not generate');},
  fetch:async()=>{network++;return Response.json({requestId:'held-request',state:'held',rubricVersion:'discovery-v2.6',candidates:[],evidence:[],action:null,
   reasonCodes:['unsubstantiated_research_entity'],usage:{generationClaims:1,jevCalls:0,searchCalls:1}});},
 }),error=>{
  assert.equal(accountFailureCode(error),'DISCOVERY_RESEARCH_UNGROUNDED');
  assert.equal(accountFailureMessage(provider,error),error.message);
  assert.match(error.message,/대상명을 인용된 검색 자료에서 확인하지 못해 추천을 보류/);
  assert.doesNotMatch(error.message,/unsubstantiated|운영자|계정을 다시 연결/);
  return true;
 });
 assert.equal(network,1);assert.equal(generation,0);
});
