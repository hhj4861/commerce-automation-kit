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
test('real HTTP JavaScript client → Python server → shared review → persistent replay',async()=>{
 const root=await mkdtemp(join(process.env.DISCOVERY_TEST_DIR,'node-http-'));
 const code="from server import make_server\nfrom service import Discovery,Store\nfrom test_service import SOURCE,pass_result\nimport sys\ns=make_server(('127.0.0.1',0),Discovery(Store(sys.argv[1]),lambda q:[SOURCE],pass_result),{'shopshorts':'k'*40})\nprint(s.server_port,flush=True)\ns.serve_forever()";
 const child=spawn('python3',['-u','-c',code,join(root,'state.sqlite')],{cwd:fileURLToPath(new URL('.',import.meta.url)),env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:['ignore','pipe','pipe']});
 const closed=once(child,'close');let errors='';child.stderr.on('data',d=>errors+=d);
 try {
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('fixture timeout')),10000);child.once('error',reject);child.once('exit',()=>reject(Error('fixture exit '+errors)));child.stdout.once('data',d=>{clearTimeout(timer);resolve(String(d).trim());});});
  const client=createDiscoveryClient({baseUrl:'http://127.0.0.1:'+port,apiKey:'k'.repeat(40),subject:'a'.repeat(64),allowLocalhost:true});
  let generated=0,checks=0;
  const options={idempotencyKey:'node-http-test',assertConnection:async()=>{checks++;},generate:async()=>{generated++;return {candidates:[candidate]};}};
  const result=await client.discover(input,options);
  assert.equal(result.candidates[0].decision,'accepted');assert.equal(checks,3);
  assert.equal(result.factChecked,false);assert.equal(result.rubricVersion,'discovery-v1.1');
  assert.equal((await client.discover(input,options)).requestId,result.requestId);assert.equal(generated,1);
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
 await assert.rejects(client.discover(input,{idempotencyKey:'test-key-001',generate:async()=>({candidates:[candidate]}),assertConnection:async()=>{if(++checks===3)throw Error('revoked');}}),/revoked/);
 assert.equal(completed,0);
});
test('refuses insecure remote endpoints and missing identity',()=>{
 assert.throws(()=>createDiscoveryClient({baseUrl:'http://remote.example',apiKey:'k'.repeat(40),subject:'a'.repeat(64)}));
 assert.throws(()=>createDiscoveryClient({baseUrl:'https://server.example',apiKey:'k'.repeat(40),subject:'browser-user'}));
});
