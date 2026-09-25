import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateHiggsfieldScene,higgsfieldPlan,downloadHiggsfield} from '../studio-higgsfield.mjs';
const id='11111111-1111-4111-8111-111111111111';
const scene={id:'scene-1',kind:'image',prompt:'Original calm illustration',duration:8};
const job=()=>({brief:{aspect:'9:16'}});
const completed={id,status:'completed',result_url:'https://d8j0ntlcm91z4.cloudfront.net/result.png'};
const download=async()=>new Response(Buffer.from('image fixture'),{headers:{'content-type':'image/png'}});
async function temporary(fn){const dir=await mkdtemp(join(tmpdir(),'higgsfield-test-'));try{await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
test('image and video preserve format and standard quality with supported durations',()=>{
 assert.equal(higgsfieldPlan(scene,'9:16').resolution,'2k');
 const plan=higgsfieldPlan({...scene,kind:'video',duration:2},'16:9');assert.equal(plan.duration,4);assert.equal(plan.resolution,'1080p');assert.equal(plan.model,'seedance_2_0');
 assert.equal(higgsfieldPlan({...scene,kind:'video',duration:30},'9:16').duration,15);
});
test('cost and durable intent precede generation; an accepted ID survives download failure and retry',()=>temporary(async work=>{
 const project=job(),events=[];let creates=0;
 const run=async args=>{events.push(args[1]);if(args[1]==='cost')return {credits:2};if(args[1]==='create'){creates++;assert.equal(project.mediaJobs[scene.id].state,'submitting');return [id];}return completed;};
 const checkpoint=async delta=>{assert.ok(delta.mediaJobs);events.push('checkpoint');};
 await assert.rejects(generateHiggsfieldScene(project,scene,{},work,checkpoint,{run,fetcher:async()=>new Response('',{status:503})}),/다운로드/);
 assert.deepEqual(events.slice(0,4),['cost','checkpoint','create','checkpoint']);
 const result=await generateHiggsfieldScene(project,scene,{},work,checkpoint,{run,fetcher:download});
 assert.equal(creates,1);assert.equal(result.providerJobId,id);assert.equal(result.type,'image/png');
 // A lost remote checkpoint can recover from the local receipt without another charge.
 const recovered=job();await generateHiggsfieldScene(recovered,scene,{},work,checkpoint,{run,fetcher:download});assert.equal(creates,1);
}));
test('lost submission response is blocked on retry, even with a new runtime directory',()=>temporary(async work=>{
 const project=job();let creates=0;
 const run=async args=>{if(args[1]==='cost')return {credits:2};creates++;throw Error('connection lost');};
 await assert.rejects(generateHiggsfieldScene(project,scene,{},work,async()=>{},{run}),/connection lost/);
 await temporary(async fresh=>{await assert.rejects(generateHiggsfieldScene(project,scene,{},fresh,async()=>{},{run}),/접수 여부/);});assert.equal(creates,1);
}));
test('failed intent persistence never sends a paid request',()=>temporary(async work=>{
 const calls=[];await assert.rejects(generateHiggsfieldScene(job(),scene,{},work,async()=>{throw Error('offline');},{run:async args=>{calls.push(args[1]);return {credits:2};}}));assert.deepEqual(calls,['cost']);
}));
test('polling timeout resumes the same accepted request and explicit failure becomes retryable',()=>temporary(async work=>{
 const project=job();let clock=0,creates=0,phase='processing';
 const run=async args=>{if(args[1]==='cost')return {credits:2};if(args[1]==='create'){creates++;return [{id}];}return phase==='completed'?completed:{id,status:phase};};
 await assert.rejects(generateHiggsfieldScene(project,scene,{},work,async()=>{},{run,now:()=>clock,sleep:async()=>{clock+=21*60000;}}),/아직/);
 phase='failed';await assert.rejects(generateHiggsfieldScene(project,scene,{},work,async()=>{},{run}),/완료하지/);assert.equal(creates,1);
 phase='completed';await generateHiggsfieldScene(project,scene,{},work,async()=>{},{run,fetcher:download});assert.equal(creates,2);
}));
test('download rejects unsafe URLs, redirects, HTML, empty and oversized results',async()=>{
 for(const url of ['http://d8j0ntlcm91z4.cloudfront.net/a','https://127.0.0.1/a','https://evil.test/a','https://user:pass@higgsfield.ai/a'])await assert.rejects(downloadHiggsfield(url,'image',download));
 const url=completed.result_url;
 await assert.rejects(downloadHiggsfield(url,'image',async()=>new Response('',{status:302,headers:{location:'http://127.0.0.1'}})));
 await assert.rejects(downloadHiggsfield(url,'image',async()=>new Response('<html>',{headers:{'content-type':'text/html'}})));
 await assert.rejects(downloadHiggsfield(url,'image',async()=>new Response('',{headers:{'content-type':'image/png'}})));
 await assert.rejects(downloadHiggsfield(url,'image',async()=>new Response('x',{headers:{'content-type':'image/png','content-length':String(51*1024*1024)}})));
});
