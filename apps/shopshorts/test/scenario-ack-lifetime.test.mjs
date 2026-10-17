import test from 'node:test';
import assert from 'node:assert/strict';
import { syncScenario } from '../lib/studio-scenario-account.js';

function fixture(state = 'done') {
  let project = { id: '10000000-0000-4000-8000-000000000001', revision: 4, task: {
    id: '20000000-0000-4000-8000-000000000001', action: 'scenario', runner: 'llm-account',
    accountOwner: 'owner', state, ...(state === 'failed' ? { reviewAvailable: false } : {}),
  } };
  return { get project() { return structuredClone(project); }, store: {
    get: async () => structuredClone(project),
    cas: async (next, revision) => { if (project.revision !== revision) return false; project = structuredClone(next); return true; },
  } };
}

test('completed projects acknowledge once across repeated list reads and new request contexts', async () => {
  const rows = Array.from({length: 7}, () => fixture()); let calls = 0;
  for (let tick = 0; tick < 10; tick++) {
    for (const row of rows) await syncScenario(row.store, row.project, async () => { calls++; return {ok: true}; });
  }
  assert.equal(calls, 7, 'terminal scenario ACK must stop after persisted success');
});

test('transport and broker errors remain retryable; success persists for failed tasks too', async () => {
  const row=fixture('failed');let calls=0;
  const call=async()=>{calls++;if(calls===1)throw Error('offline');return calls===2?{error:'busy'}:{ok:true};};
  for(let i=0;i<2;i++) {await syncScenario(row.store,row.project,call);assert.notEqual(row.project.task.brokerAcknowledged,true);}
  const done=await syncScenario(row.store,row.project,call);
  assert.equal(done.task.brokerAcknowledged,true);
  await syncScenario(row.store,row.project,call);assert.equal(calls,3);
});

test('ambiguous ACK responses are retried; already removed jobs stop polling', async()=>{
  const row=fixture();let calls=0;
  const call=async()=>{calls++;return calls===1?{}:{job:null};};
  await syncScenario(row.store,row.project,call);assert.notEqual(row.project.task.brokerAcknowledged,true);
  await syncScenario(row.store,row.project,call);assert.equal(row.project.task.brokerAcknowledged,true);
  await syncScenario(row.store,row.project,call);assert.equal(calls,2);
});

test('lost acknowledgement CAS cannot overwrite a newer task', async()=>{
  const row=fixture(),old=row.project;let calls=0;
  const newer={...old,revision:old.revision+1,task:{...old.task,id:'new-task',state:'queued',deadline:Date.now()+60000}};
  const result=await syncScenario(row.store,old,async()=>{calls++;await row.store.cas(newer,old.revision);return {ok:true};});
  assert.equal(result.task.id,'new-task');assert.equal(row.project.task.id,'new-task');
  assert.notEqual(row.project.task.brokerAcknowledged,true);assert.equal(calls,1);
});

test('running tasks keep reading fresh status and never acknowledge unfinished work', async()=>{
  const row=fixture('running');let calls=0;
  for(let i=0;i<3;i++)await syncScenario(row.store,row.project,async(_owner,op)=>{
    assert.equal(op,'scenario-status');calls++;return {job:{id:row.project.task.id,projectId:row.project.id,state:'running'}};
  });
  assert.equal(calls,3);assert.notEqual(row.project.task.brokerAcknowledged,true);
});

test('parallel old readers safely converge without ongoing repeat acknowledgements', async()=>{
  const row=fixture(),old=row.project;let calls=0;
  const call=async()=>{calls++;await Promise.resolve();return {ok:true};};
  await Promise.all([syncScenario(row.store,old,call),syncScenario(row.store,old,call)]);
  assert.equal(row.project.task.brokerAcknowledged,true);
  const before=calls;await syncScenario(row.store,row.project,call);assert.equal(calls,before);
});
