import test from 'node:test';
import assert from 'node:assert/strict';
import {threeMonthPeriod, hashtags, benchmarkVideo, researchYouTube, parseMetadata, parseAnalysis} from '../lib/youtube-metadata.js';
import {generateVideoMetadata, probeMetadataVideo} from '../studio-metadata.mjs';
import {studioApi} from '../lib/studio-api.js';
import {createProject, changeProject} from '../lib/studio.js';
const now = new Date('2026-10-11T03:00:00Z'), period = threeMonthPeriod(now);
const media = {width:1080,height:1920,duration:40,hasAudio:true};
const analysis = {category:'건축학',subject:'삿포로돔',summary:'공기압과 바퀴로 천연잔디 스테이지를 움직입니다.',language:'ko',facts:['영상에서 하중 약 90%를 공기가 받친다고 설명합니다.'],uncertainties:[],queries:['삿포로돔 공기압','삿포로돔 잔디 이동'],observations:[{at:0,visual:'경기장 전경'},{at:20,visual:'공기압 도식',subtitle:'90%',speech:'바퀴와 공기가 나눠 받습니다.'},{at:38,visual:'이동한 잔디판'}]};
function video(id='abcdefghijk',overrides={}) {return {id,snippet:{title:'8,300톤 잔디판 #건축',description:'공기압을 설명합니다. #삿포로돔',channelTitle:'건축 채널',channelId:'channel',publishedAt:'2026-08-10T00:00:00Z',tags:['비공개처럼취급할키워드']},contentDetails:{duration:'PT40S'},statistics:{viewCount:'123456'},...overrides};}
function generated(ids=['abcdefghijk']) {return {references:ids.map(id=>({id,relevance:'동일한 이동식 잔디판을 다룹니다.',pattern:'무게를 앞세우고 설명 끝에 시설명 해시태그를 씁니다.'})),suggestions:['호기심형','검색형','스토리형'].map((type,i)=>({type,title:['8,300톤을 공기로 띄운다고?','삿포로돔의 이동 원리','햇빛을 찾아 나가는 잔디'][i],description:'영상에 나온 공기압과 바퀴의 역할을 알아봅니다.',hashtags:['#삿포로돔','건축 공학','#Shorts'],reason:'실제 영상의 핵심에 맞습니다.',referenceIds:ids})),limitations:[]};}
test('three calendar months clamp month ends and preserve time across years',()=>{
  assert.equal(period.start,'2026-07-11T03:00:00.000Z');
  assert.equal(threeMonthPeriod(new Date('2025-05-31T00:00:00Z')).start,'2025-02-28T00:00:00.000Z');
  assert.equal(threeMonthPeriod(new Date('2026-01-31T00:00:00Z')).start,'2025-10-31T00:00:00.000Z');
});
test('public metadata preserves evidence but never treats short duration or snippet tags as confirmed Shorts',()=>{
  const v=benchmarkVideo(video(),period,'short');assert.equal(v.views,123456);assert.equal(v.formatStatus,'short-candidate');assert.deepEqual(v.hashtags,['#건축','#삿포로돔']);assert.equal(v.checkedAt,period.end);
  assert.equal(benchmarkVideo(video('abcdefghijk',{snippet:{publishedAt:'2025-12-22'}}),period,'short'),null);
  assert.equal(benchmarkVideo(video('abcdefghijk',{snippet:{publishedAt:'2026-12-22'}}),period,'short'),null);
  assert.equal(benchmarkVideo(video('abcdefghijk',{statistics:{}}),period,'short'),null);
  assert.equal(benchmarkVideo(video('abcdefghijk',{contentDetails:{duration:'PT4M'}}),period,'short'),null);
  assert.equal(benchmarkVideo(video(),period,'long'),null);
});
test('hashtags are normalized, deduplicated and always start with # without spaces',()=>{
  assert.deepEqual(hashtags(['건축 공학','#건축공학','##Shorts']),['#건축공학','#Shorts']);assert.throws(()=>hashtags([]));
});
test('analysis requires actual time-stamped opening and ending evidence',()=>{
  assert.equal(parseAnalysis(analysis,media).subject,'삿포로돔');
  assert.throws(()=>parseAnalysis({...analysis,observations:analysis.observations.slice(0,2)},media));
  assert.throws(()=>parseAnalysis({...analysis,observations:analysis.observations.map(o=>({...o,at:99}))},media));
});
test('research uses official bounded search and full video details, excludes old and wrong-format evidence',async()=>{
  const calls=[];
  const result=await researchYouTube(analysis,'short',{YOUTUBE_API_KEY:'test'}, {now,fetcher:async url=>{
    calls.push(url);return Response.json(url.pathname.endsWith('/search')?{items:[{id:{videoId:'abcdefghijk'}},{id:{videoId:'bcdefghijkl'}}]}:{items:[video(),video('bcdefghijkl',{contentDetails:{duration:'PT10M'}})]});
  }});
  assert.equal(calls.length,3);assert.equal(calls[0].origin,'https://www.googleapis.com');assert.equal(calls[0].searchParams.get('publishedAfter'),period.start);assert.equal(calls[0].searchParams.get('publishedBefore'),period.end);assert.equal(calls[0].searchParams.get('videoDuration'),'short');assert.equal(result.candidates.length,1);assert.match(result.formatCaveat,/확정할 수 없습니다/);
});
test('provider failure is explicit; no scraped or invented fallback',async()=>{
  await assert.rejects(researchYouTube(analysis,'short',{}, {now}),/YouTube 연결/);
  await assert.rejects(researchYouTube(analysis,'short',{YOUTUBE_API_KEY:'test'}, {now,fetcher:async()=>new Response('',{status:403})}),/403/);
});
test('generated references cannot fabricate IDs, views, dates or use unselected sources',()=>{
  const research={candidates:[benchmarkVideo(video(),period,'short')],period,checkedAt:period.end,failures:[],formatCaveat:'형식 미확인'};
  const value=generated();value.references[0].views=999999999;value.references[0].publishedAt='2026-10-11';
  const result=parseMetadata(value,research);assert.equal(result.references[0].views,123456);assert.equal(result.references[0].publishedAt,'2026-08-10T00:00:00Z');assert.match(result.limitations.join(' '),/3개 미만/);
  assert.throws(()=>parseMetadata(generated(['notverified']),research));
  value.suggestions[0].referenceIds=['notverified'];assert.throws(()=>parseMetadata(value,research));
  assert.equal(parseMetadata(generated([]),{...research,candidates:[]}).references.length,0);
});
function store(){const items=new Map(),assets=new Map();return{execution:'test',capabilities:async()=>({metadata:true,workerAt:new Date().toISOString()}),list:async()=>[...items.values()],get:async id=>structuredClone(items.get(id)),create:async p=>items.set(p.id,structuredClone(p)),cas:async(p,r)=>{if(items.get(p.id).revision!==r)return false;items.set(p.id,structuredClone(p));return true;},writeAsset:async(k,v)=>assets.set(k,v),readAsset:async k=>new Response(assets.get(k)),assets};}
const env={SHOPSHORTS_TOKEN:'test-worker'};
function request(s,path,body,headers={}){return studioApi(new Request('https://app.test/api/studio'+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,s);}
test('API upload, queue, worker completion and refresh preserve the same source; normal projects list excludes metadata-only tasks',async()=>{
  const s=store();let p=(await(await request(s,'/metadata-project',{})).json()).project;
  assert.equal(p.purpose,'metadata');assert.equal((await(await request(s,'')).json()).projects.length,0);
  assert.equal((await(await request(s,'?purpose=metadata')).json()).projects.length,1);
  assert.equal((await(await request(s,'',undefined,{authorization:'Bearer test-worker'})).json()).projects.length,1);
  const bytes=Buffer.from([0,0,0,16,...Buffer.from('ftypisom'),0,0,0,0]);
  const upload=async(revision,type='video/mp4',body=bytes)=>studioApi(new Request(`https://app.test/api/studio/${p.id}/metadata-source?revision=${revision}`,{method:'POST',headers:{'content-type':type},body}),env,s);
  assert.equal((await upload(1)).status,409);assert.equal((await upload(0,'text/html')).status,400);assert.equal((await upload(0,'video/mp4',Buffer.alloc(20))).status,400);
  p=(await(await upload(0)).json()).project;assert.ok(p.metadataSource.key);assert.equal(p.render,null);
  assert.equal((await request(s,`/${p.id}/metadata`,{revision:p.revision,format:'auto'},{origin:'https://evil.test'})).status,403);
  p=(await(await request(s,`/${p.id}/metadata`,{revision:p.revision,format:'auto'})).json()).project;assert.equal(p.task.action,'metadata');
  assert.equal((await request(s,`/${p.id}/claim`,{revision:p.revision})).status,403);
  p=(await(await request(s,`/${p.id}/claim`,{revision:p.revision},{authorization:'Bearer test-worker'})).json()).project;
  assert.equal((await request(s,`/${p.id}/complete`,{revision:p.revision,taskId:p.task.id,result:{upload:{state:'done'}}},{authorization:'Bearer test-worker'})).status,400);
  p=(await(await request(s,`/${p.id}/complete`,{revision:p.revision,taskId:p.task.id,result:{metadataResult:{sourceKey:p.task.sourceKey}}},{authorization:'Bearer test-worker'})).json()).project;
  assert.equal(p.task.state,'done');assert.equal((await(await request(s,`/${p.id}`)).json()).project.metadataResult.sourceKey,p.metadataSource.key);
});
test('unavailable worker does not queue paid analysis; applying a draft cannot publish or use stale video evidence',async()=>{
  const s=store(),p=createProject({category:'건축학',topic:'삿포로돔',format:'short',duration:40});p.render={key:'studio/final.mp4'};await s.create(p);s.capabilities=async()=>({metadata:false});
  assert.equal((await request(s,`/${p.id}/metadata`,{revision:0,format:'auto'})).status,503);
  p.metadataResult={sourceKey:p.render.key,suggestions:generated().suggestions.map(s=>({...s,hashtags:hashtags(s.hashtags)}))};
  const applied=changeProject(p,'metadata-apply',{index:0});assert.match(applied.publication.description,/#건축공학/);assert.equal(applied.task,null);assert.equal(applied.upload,null);assert.equal(applied.publication.privacy,'private');assert.equal(applied.approved,false);
  assert.throws(()=>changeProject({...p,render:{key:'new.mp4'}},'metadata-apply',{index:0}));
  assert.throws(()=>changeProject(applied,'publish',{reviewed:false,platforms:['youtube'],privacy:'public',title:'title'}));
});
test('runner analyzes actual bytes before research, keeps stages and does not run publishing',async()=>{
  const stages=[],calls=[];const job={purpose:'metadata',metadataSource:{key:'video'},task:{action:'metadata',sourceKey:'video',format:'auto'}};
  const result=await generateVideoMetadata(job,{GEMINI_API_KEY:'test',YOUTUBE_API_KEY:'test'},{readAsset:async()=>Buffer.from('actual-video')},async p=>stages.push(p.metadataProgress.stage),{now,probe:async()=>media,generate:async parts=>{calls.push(parts);return calls.length===1?analysis:generated();},fetcher:async url=>Response.json(url.pathname.endsWith('/search')?{items:[{id:{videoId:'abcdefghijk'}}]}:{items:[video()]})});
  assert.deepEqual(stages,['analysis','research','writing']);assert.equal(calls[0][0].inlineData.data,Buffer.from('actual-video').toString('base64'));assert.equal(result.metadataResult.format,'short');assert.equal(result.metadataResult.suggestions.length,3);assert.equal(result.upload,undefined);
  await assert.rejects(generateVideoMetadata({...job,task:{...job.task,sourceKey:'changed'}},{GEMINI_API_KEY:'test',YOUTUBE_API_KEY:'test'},{},()=>{}),/변경/);
});
test('non-MP4 bytes are rejected before probing or provider calls',async()=>{await assert.rejects(probeMetadataVideo(Buffer.from('<html>wrong</html>')),/MP4/);});

test('description and hashtags fit the publishing form without silent truncation',()=>{
 const research={candidates:[],period,checkedAt:period.end,failures:[],formatCaveat:'형식 미확인'};
 const value=generated([]);value.suggestions[0].description='가'.repeat(3000);value.suggestions[0].hashtags=Array.from({length:25},(_,i)=>'#'+String(i)+'가'.repeat(56));
 assert.throws(()=>parseMetadata(value,research),/게시 입력란/);
});

test('live-provider authentication, permission and quota failures are actionable and never expose response bodies', async () => {
  const job={purpose:'metadata',metadataSource:{key:'video'},task:{action:'metadata',sourceKey:'video',format:'auto'}};
  for (const [status,message] of [[401,/Gemini 인증.*중앙/],[403,/Gemini 접근.*사용 권한/],[429,/Gemini 이용 한도/],[500,/영상 분석에 실패/]]) {
    const stages=[], calls=[];
    await assert.rejects(generateVideoMetadata(job,{GEMINI_API_KEY:'private-fixture-key',YOUTUBE_API_KEY:'test'},{readAsset:async()=>Buffer.from('fixture')},async p=>stages.push(p.metadataProgress.stage),{
      probe:async()=>media,
      fetcher:async(url,options)=>{calls.push({url,options});return new Response('private-provider-response',{status});},
    }),error=>message.test(error.message) && !/private-fixture-key|private-provider-response/.test(error.message));
    assert.deepEqual(stages,['analysis']);
    assert.equal(calls.length,1);
    assert.match(calls[0].url,/generativelanguage.googleapis.com/);
  }
});
