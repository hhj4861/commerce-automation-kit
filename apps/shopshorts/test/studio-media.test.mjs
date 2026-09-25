import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaProgress,mediaSceneStatus,renderMediaProgress,renderMediaPlaceholder} from '../public/studio-media.js';
const scenes=[{id:'s1',kind:'image'},{id:'s2',kind:'video'},{id:'s3',kind:'image'}];
const now=Date.now();
const state=(task,assets={},extra={})=>({project:{scenes,assets,task:task?{action:'media',...task}:null},config:{execution:'cloud-worker',capabilities:{workerAt:new Date(now).toISOString()}},...extra});
test('submission is immediately visible; queue and running do not claim completion',()=>{
 for(const [input,kind] of [[state(null,{}, {requestingMedia:true}),'submitting'],[state({state:'queued'}),'queued'],[state({state:'running'}),'running']]){
  const status=mediaProgress(input,now);assert.equal(status.kind,kind);assert.equal(status.ready,0);
  const html=renderMediaProgress(status);assert.match(html,/role="progressbar"/);assert.match(html,/aria-valuenow="0"/);
  assert.equal(html.includes('media-progress-activity'),kind!=='queued');
 }
});
test('only persisted scene assets advance progress, current and waiting cards are distinct',()=>{
 const status=mediaProgress(state({state:'running'},{s1:{kind:'image'},music:{kind:'audio'}}),now);
 assert.equal(status.ready,1);assert.equal(status.firstMissing,'s2');
 assert.equal(mediaSceneStatus(status,scenes[0],{}).kind,'ready');
 assert.equal(mediaSceneStatus(status,scenes[1]).kind,'running');
 assert.equal(mediaSceneStatus(status,scenes[2]).label,'차례 대기');
 assert.match(renderMediaProgress(status),/aria-valuenow="1"/);
});
test('failed authentication stays visible beside results and preserves completed scenes',()=>{
 const status=mediaProgress(state({state:'failed',error:'Google 생성 API 실패(401). 키·모델 사용 권한·잔액을 확인하세요.'},{s1:{}}),now);
 assert.equal(status.kind,'failed');assert.equal(status.ready,1);assert.match(status.detail,/인증/);
 assert.match(renderMediaProgress(status),/role="alert"/);assert.doesNotMatch(renderMediaProgress(status),/media-progress-activity/);
 assert.match(renderMediaPlaceholder(status,scenes[1]),/생성 중단/);
 assert.doesNotMatch(renderMediaPlaceholder(status,scenes[1]),/아직 생성한 미디어가 없습니다/);
});
test('network/request errors are persistent, escaped and never fabricated as completion',()=>{
 const status=mediaProgress(state(null,{}, {mediaRequestError:'실패 <script>'}),now);
 assert.equal(status.kind,'failed');assert.match(renderMediaProgress(status),/&lt;script&gt;/);assert.doesNotMatch(renderMediaProgress(status),/<script>/);
 assert.equal(mediaProgress(state({state:'running'},{},{connectionUnknown:true}),now).kind,'unknown');
 const offline=state({state:'running'});offline.config.capabilities.workerAt=null;
 assert.equal(mediaProgress(offline,now).kind,'waiting');
});
test('missing output after task termination is incomplete, not success',()=>{
 assert.equal(mediaProgress(state({state:'done'}),now).kind,'incomplete');
 assert.equal(mediaProgress(state({state:'done'},{s1:{},s2:{},s3:{}}),now).kind,'done');
 assert.equal(mediaProgress(state({state:'running'},{s1:{},s2:{},s3:{}}),now).kind,'running');
 assert.equal(mediaProgress(state(null),now).kind,'idle');
});
