import test from 'node:test';
import assert from 'node:assert/strict';
import {executionStatus,renderExecutionStatus,resumeStep} from '../public/studio-status.js';
const now=Date.now(),config={execution:'cloud-worker',capabilities:{workerAt:null},scenarioRuntime:{connected:true,available:true,scenarioAvailable:true}};
const state=(task,extra={})=>({config,step:2,project:{task,scenes:[],assets:{}},...extra});
test('reopening a generated, unapproved scenario shows its script and completion message',()=>{
 const project={scenes:[{id:'scene-1'}],assets:{},approved:false,task:{action:'scenario',state:'done'}};
 const step=resumeStep(project);
 assert.equal(step,2);
 assert.equal(executionStatus({project,step,config}).kind,'done');
 assert.equal(resumeStep({...project,scenes:[],task:null}),2);
 assert.equal(resumeStep({...project,approved:true}),3);
 assert.equal(resumeStep({...project,approved:true,assets:{'scene-1':{}}}),4);
 assert.equal(resumeStep({...project,render:{}}),5);
 assert.equal(resumeStep({...project,upload:{}}),5);
});
test('reopening ongoing or failed work stays on the task even with previous output',()=>{
 for(const [action,step] of [['scenario',2],['media',3],['render',4],['publish',5]]) {
  for(const taskState of ['queued','running','failed']) {
   const project={scenes:[{id:'scene-1'}],assets:{'scene-1':{}},approved:true,render:{},task:{action,state:taskState}};
   assert.equal(resumeStep(project),step,`${action} ${taskState}`);
  }
 }
});
test('only a running task animates; queued and disconnected states clearly say not started',()=>{
 for(const [task,expected] of [[{action:'scenario',state:'queued'},'queued'],[{action:'scenario',state:'running'},'running'],[{action:'media',state:'queued'},'waiting']]) {
  const status=executionStatus(state(task),now);assert.equal(status.kind,expected);
  const html=renderExecutionStatus(status);assert.equal((html.match(/<section/g)||[]).length,1);
  if(expected!=='running')assert.doesNotMatch(status.detail,/계속 진행/);
 }
});
test('scenario uses account runtime independently of media worker and failure wins over offline warning',()=>{
 assert.equal(executionStatus(state({action:'scenario',state:'running'})).kind,'running');
 const failure=executionStatus(state({action:'scenario',state:'failed',error:'인증 실패 <script>'}));
 assert.equal(failure.kind,'failed');assert.equal(failure.action,'retry');assert.doesNotMatch(renderExecutionStatus(failure),/<script>/);
 assert.equal(executionStatus(state(null)),null);
});
test('unknown connection never pretends work is running; completion does not require live worker',()=>{
 assert.equal(executionStatus(state({action:'scenario',state:'running'},{connectionUnknown:true})).kind,'unknown');
 assert.equal(executionStatus(state({action:'media',state:'done'},{step:3})).kind,'done');
 const offline={...config,scenarioRuntime:{connected:true,available:false}};
 const status=executionStatus(state({action:'scenario',state:'running'},{config:offline}));
 assert.equal(status.kind,'waiting');assert.match(status.detail,/마지막 상태/);
});
