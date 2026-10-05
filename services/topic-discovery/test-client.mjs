import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDiscoveryClient} from './client.mjs';
const input={profile:'content',category:'건축학',brief:'실제 회전교의 원리',runtime:{provider:'codex',model:'test-model'}};
const candidate={title:'다리는 왜 돌아갈까?',entity:'회전교',location:'한국',question:'왜 회전할까?',expectedAnswer:'들어올린다',answer:'배가 지나갈 통로를 연다',whyItMatters:'통행과 물류',direction:'회전 전후 비교',keyword:'회전교',openingVisual:'회전하는 다리',evidenceIds:['source-1']};
for(const {workflow,dropReply,rubric,reviewMode,dropReview} of [{},{workflow:'research-v2'},{workflow:'research-v2',dropReply:true},{workflow:'research-v2',rubric:'discovery-v2.3'},{workflow:'research-v2',reviewMode:'native-llm-v1'},{workflow:'research-v2',reviewMode:'native-llm-v1',dropReview:true}])test('real HTTP JavaScript client → Python server → shared review → persistent replay '+(workflow||'v1')+(dropReply?' lost-reply':'')+(rubric?' '+rubric:'')+(reviewMode?' native review':'')+(dropReview?' lost review reply':''),async()=>{
 const request={...input,...(workflow?{workflow}:{}),...(reviewMode?{reviewMode}:{})};
 const root=await mkdtemp(join(process.env.DISCOVERY_TEST_DIR,'node-http-'));
 const code="from server import make_server\nfrom service import Discovery,Store\nfrom test_service import SOURCE,pass_result\nfrom test_native_review import low_result\nimport sys\ns=make_server(('127.0.0.1',0),Discovery(Store(sys.argv[1]),lambda q:[{**SOURCE,'title':'회전교 공식 설명'}],low_result if sys.argv[3]=='1' else pass_result,research_version=sys.argv[2]),{'shopshorts':'k'*40})\nprint(s.server_port,flush=True)\ns.serve_forever()";
 const child=spawn('python3',['-u','-c',code,join(root,'state.sqlite'),rubric||'discovery-v2.2',reviewMode?'1':'0'],{cwd:fileURLToPath(new URL('.',import.meta.url)),env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:['ignore','pipe','pipe']});
 const closed=once(child,'close');let errors='';child.stderr.on('data',d=>errors+=d);
 try {
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('fixture timeout')),10000);child.once('error',reject);child.once('exit',()=>reject(Error('fixture exit '+errors)));child.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});});
  let dropped=false,completions=0;
  const client=createDiscoveryClient({baseUrl:'http://127.0.0.1:'+port,apiKey:'k'.repeat(40),subject:'a'.repeat(64),allowLocalhost:true,fetch:async(url,init)=>{const r=await fetch(url,init);if(url.endsWith('/complete'))completions++;if(!dropped&&url.endsWith('/complete')&&(dropReply||dropReview&&completions===3)){dropped=true;await r.text();throw Error('lost response');}return r;}});
  let generated=0,checks=0;
  const options={idempotencyKey:'node-http-test',assertConnection:async()=>{checks++;},generate:async(prompt)=>{generated++;if(reviewMode&&generated===3){const ctx=JSON.parse(prompt.slice(prompt.lastIndexOf('\n')+1));return {reviews:ctx.items.map(item=>({candidateId:item.candidateId,checks:Object.fromEntries(item.requiredChecks.map(name=>[name,{choice:'pass',issue:'none',rationale:'Protocol fixture only',citations:[{evidenceId:item.evidence[0].id,quote:item.evidence[0].excerpt}]}]))}))};}return workflow&&generated===1?{leads:[{entity:'회전교',question:'회전하는 이유는?',keyword:'원리',evidenceIds:['source-1']}]}:{candidates:[{...candidate,...(workflow?{leadId:'lead-1',evidenceIds:['lead-1-source-1']}:{})}]};}};
  if(dropReply||dropReview)await assert.rejects(client.discover(request,options),e=>e.code==='discovery_unavailable');
  const result=await client.discover(request,options);
  assert.equal(result.candidates[0].decision,'accepted');assert.equal(checks,dropReview?11:reviewMode?10:dropReply?8:workflow?7:4);
  assert.equal(result.factChecked,false);assert.equal(result.rubricVersion,workflow?(reviewMode?'discovery-v2.6':rubric||'discovery-v2.2'):'discovery-v1.2');
  assert.equal((await client.discover(request,options)).requestId,result.requestId);assert.equal(generated,reviewMode?3:workflow?2:1);
  if(reviewMode){assert.equal(result.usage.generationClaims,3);assert.equal(result.candidates[0].jevDecision,'held');}
  const wrong=createDiscoveryClient({baseUrl:'http://127.0.0.1:'+port,apiKey:'k'.repeat(40),subject:'b'.repeat(64),allowLocalhost:true});
  await assert.rejects(wrong.get(result.requestId),e=>e.code==='request_not_found');
 } finally {child.kill('SIGTERM');await closed;await rm(root,{recursive:true,force:true});}
});
test('connection revocation before completion prevents submission',async()=>{
 let checks=0,completed=0;
 const action={id:'action',prompt:'Draft',runtime:{model:'test-model',provider:'codex'}};
 const client=createDiscoveryClient({baseUrl:'https://server.example/discovery',apiKey:'k'.repeat(40),subject:'a'.repeat(64),fetch:async(url)=>{
  if(url.endsWith('/complete'))completed++;
  return Response.json({requestId:'id',state:url.endsWith('/claim')?'generating':'awaiting_generation',candidates:[],evidence:[],action});
 }});
 await assert.rejects(client.discover(input,{idempotencyKey:'test-key-001',generate:async()=>({candidates:[candidate]}),assertConnection:async()=>{if(++checks===4)throw Error('revoked');}}),/revoked/);
 assert.equal(completed,0);
});
test('refuses insecure remote endpoints and missing identity',()=>{
 assert.throws(()=>createDiscoveryClient({baseUrl:'http://remote.example',apiKey:'k'.repeat(40),subject:'a'.repeat(64)}));
 assert.throws(()=>createDiscoveryClient({baseUrl:'https://server.example',apiKey:'k'.repeat(40),subject:'browser-user'}));
});

test('v2 revocation before second claim stops generation and submission',async()=>{
 let checks=0,claims=0,completions=0,generations=0;
 const action=stage=>({id:stage,prompt:'Draft',stage,runtime:input.runtime});
 const client=createDiscoveryClient({baseUrl:'https://server.example',apiKey:'k'.repeat(40),subject:'a'.repeat(64),fetch:async(url)=>{
  if(url.endsWith('/claim'))claims++;
  if(url.endsWith('/complete'))completions++;
  return Response.json({requestId:'id',state:url.endsWith('/claim')?'generating':'awaiting_generation',usage:{generationClaims:claims},candidates:[],evidence:[],action:action(completions?'draft':'research')});
 }});
 await assert.rejects(client.discover({...input,workflow:'research-v2'},{idempotencyKey:'revoke-v2',generate:async()=>{generations++;return {leads:[]};},assertConnection:async()=>{if(++checks===5)throw Error('revoked');}}),/revoked/);
 assert.equal(claims,1);assert.equal(completions,1);assert.equal(generations,1);
});
