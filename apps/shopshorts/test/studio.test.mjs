import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, changeProject, validateScenes, validateEdit } from '../lib/studio.js';
import { studioApi } from '../lib/studio-api.js';
import { executeStudioTask, sceneFfmpegArgs } from '../studio-runner.mjs';
const brief = {category:'심리학',topic:'미루는 습관',format:'short',duration:24};
const scenes = [{id:'scene-1',narration:'지금 시작해 봐요.',prompt:'An original colorful desk illustration.',duration:8,kind:'image'}, {id:'scene-2',narration:'작게 나눠 보세요.',prompt:'A notebook with a small task.',duration:8,kind:'video'}];
const edit = {order:['scene-2','scene-1'],durations:{'scene-1':8,'scene-2':8},voice:'none',music:null,musicVolume:.15};
function ready(){let p=createProject(brief);p=changeProject(p,'scenes',{scenes});p.approved=true;p.assets={'scene-1':{kind:'image',key:'a'},'scene-2':{kind:'video',key:'b'}};p=changeProject(p,'edit',edit);return p;}
test('manual projects keep format, category and controlled lengths',()=>{assert.equal(createProject(brief).brief.aspect,'9:16');assert.equal(createProject({...brief,format:'long',duration:600}).brief.aspect,'16:9');for(const input of [{...brief,duration:181},{...brief,category:'unknown'},{...brief,format:'square'}])assert.throws(()=>createProject(input));});
test('media and publishing require independent human gates and valid render',()=>{const p=createProject(brief);assert.throws(()=>changeProject(p,'media',{approved:true}));assert.throws(()=>changeProject(ready(),'publish',{reviewed:true,platforms:['youtube'],privacy:'private',title:'test'}));const r=ready();r.render={key:'final'};assert.throws(()=>changeProject(r,'publish',{reviewed:false}));const queued=changeProject(r,'publish',{reviewed:true,platforms:['youtube'],privacy:'private',title:'test'});assert.equal(queued.task.state,'queued');assert.throws(()=>changeProject(queued,'scenes',{scenes}));});
test('changing narration invalidates approval/render; changing prompts invalidates relevant assets',()=>{const p=ready();p.render={key:'final'};const updated=changeProject(p,'scenes',{scenes:scenes.map((s,i)=>i===0?{...s,prompt:'New original prompt'}:s)});assert.equal(updated.approved,false);assert.equal(updated.render,null);assert.equal(updated.assets['scene-1'],undefined);assert.ok(updated.assets['scene-2']);});
test('reorder, duration and voice edits invalidate final render without losing approval',()=>{const p=ready();p.render={key:'final'};const updated=changeProject(p,'edit',{...edit,order:['scene-1','scene-2']});assert.equal(updated.render,null);assert.equal(updated.approved,true);assert.throws(()=>validateEdit({...edit,order:['scene-1','scene-1']},p));assert.throws(()=>validateEdit({...edit,music:'not-owned'},p));assert.throws(()=>validateEdit({...edit,voice:'unconfigured'},p));assert.throws(()=>validateScenes([...scenes,scenes[0]]));});
test('longform blocks unsupported destinations; posted projects cannot be altered',()=>{const p=ready();p.brief.format='long';p.render={key:'final'};assert.throws(()=>changeProject(p,'publish',{reviewed:true,platforms:['instagram'],privacy:'public',title:'test'}));p.upload={state:'submitted'};assert.throws(()=>changeProject(p,'render',{}));});
test('media runner refuses legacy scenario jobs without calling Gemini',async()=>{let calls=0;await assert.rejects(executeStudioTask({...createProject(brief),task:{action:'scenario'}},{GEMINI_API_KEY:'test'}, {workDir:'/tmp'},()=>{},{fetcher:async()=>{calls++;}}),/Codex/);assert.equal(calls,0);});
test('ffmpeg preserves requested format, ordering inputs and refuses clipped narration',()=>{const args=sceneFfmpegArgs('a.png','b.mp4',scenes[0],edit,'16:9',null,0,true);assert.ok(args.includes('-loop'));assert.match(args[args.indexOf('-vf')+1],/scale=1920:1080/);assert.match(args[args.indexOf('-vf')+1],/광고/);assert.throws(()=>sceneFfmpegArgs('a','b',scenes[0],edit,'9:16','vo.mp3',10,false),/장면 길이/);});
function memoryStore(){const map=new Map();return{execution:'test',list:async()=>[...map.values()],get:async id=>structuredClone(map.get(id)),create:async p=>map.set(p.id,p),cas:async(p,r)=>{if(map.get(p.id).revision!==r)return false;map.set(p.id,p);return true;},capabilities:async()=>({}),writeAsset:async()=>{},readAsset:async()=>new Response('asset')};}
test('API rejects forged completion, CSRF and stale edits; only worker can claim/finish',async()=>{const store=memoryStore(),p=createProject(brief);await store.create(p);const env={SHOPSHORTS_TOKEN:'worker-secret'};
 const request=(action,body,headers={})=>studioApi(new Request(`https://studio.test/api/studio/${p.id}/${action}`,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}),env,store);
 assert.equal((await request('scenario',{revision:0,confirm:true},{origin:'https://evil.test'})).status,403);
 assert.equal((await request('scenario',{revision:0,confirm:true})).status,503);
 await store.cas({...changeProject(p,'scenario',{confirm:true}),revision:1},0);
 assert.equal((await request('scenes',{revision:0,scenes})).status,409);
 assert.equal((await request('claim',{revision:1})).status,403);
 const claimed=await(await request('claim',{revision:1},{authorization:'Bearer worker-secret'})).json();
 assert.equal(claimed.project.task.state,'running');
 assert.equal((await request('complete',{revision:2,taskId:claimed.project.task.id,result:{scenes}},{authorization:'Bearer wrong'})).status,403);
 assert.equal((await request('complete',{revision:2,taskId:claimed.project.task.id,result:{render:{key:'forged'}}},{authorization:'Bearer worker-secret'})).status,400);
 assert.equal((await request('complete',{revision:2,taskId:claimed.project.task.id,result:{scenes,title:'A'}},{authorization:'Bearer worker-secret'})).status,200);
});
test('media upload rejects non-owned, HTML and mismatched scene assets',async()=>{const store=memoryStore(),p=ready();await store.create(p);for(const query of ['kind=image&scene=scene-1','kind=image&scene=scene-1&rights=confirmed']){const r=await studioApi(new Request(`https://studio.test/api/studio/${p.id}/assets?${query}`,{method:'POST',headers:{'content-type':'text/html'},body:'<script>x</script>'}),{},store);assert.equal(r.status,400);}});

test('only current media worker can persist paid Higgsfield receipts across retries',async()=>{
 const store=memoryStore(),p=changeProject(ready(),'media',{approved:true});p.task.state='running';await store.create(p);
 const result={mediaJobs:{'scene-1':{provider:'higgsfield',id:'provider-id',fingerprint:'hash',state:'accepted'}}};
 const request=(token,taskId=p.task.id)=>studioApi(new Request(`https://studio.test/api/studio/${p.id}/checkpoint`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({revision:0,taskId,result})}),{SHOPSHORTS_TOKEN:'worker-secret'},store);
 assert.equal((await request('wrong')).status,403);assert.equal((await request('worker-secret','stale')).status,409);
 assert.equal((await request('worker-secret')).status,200);assert.deepEqual((await store.get(p.id)).mediaJobs,result.mediaJobs);
});
