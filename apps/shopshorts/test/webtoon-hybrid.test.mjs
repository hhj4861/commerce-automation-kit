import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Resvg} from '@resvg/resvg-js';
import {createProject,validateBrief,changeProject} from '../lib/studio.js';
import {webtoonPlan,KYLE} from '../lib/webtoon-plan.js';
import {scenarioBrief,scenarioResult} from '../lib/studio-scenario.js';
import {reviewPrompt,validateDepthReview} from '../lib/explanation-depth.js';
import {mockReview} from './helpers/editorial-review.mjs';
import {prepareWebtoon,webtoonSvg,checkWebtoonReview} from '../studio-webtoon.mjs';
import {executeStudioTask,command} from '../studio-runner.mjs';
import {continueAutomatic} from '../lib/studio-automatic.js';
const input={category:'건축학',topic:'선로를 피해 폭포를 설계한 이유',direction:'웹툰 원리 설명',format:'short',duration:16,productionStyle:'webtoon',maxCredits:70};
const plan={artPrompt:'따뜻한 조명 아래 폭포 옆으로 열차가 지나가는 독창적인 웹툰 아트리움.',answer:'먼저 있던 선로를 피하는 배치',layers:[{id:'rail',label:'기존 선로',meaning:'선로의 고정 위치',shape:'path',points:[[0,50],[100,50]],from:[50,30],to:[50,30],size:[80,8],color:'#e8be84',start:0,end:.2,motion:'reveal'},{id:'water',label:'폭포 위치',meaning:'선로를 피해 설계한 위치',shape:'ellipse',from:[50,30],to:[60,65],size:[15,15],color:'#78d2d8',start:.2,end:.8,motion:'move'}]};
const direction={focus:'폭포와 선로',before:'가정: 중앙 폭포',action:'선로를 피해 구멍 위치 비교',after:'편심 구멍',continuity:'같은 선로',material:'웹툰 유리',lighting:'따뜻한 조명',representation:'conceptual',treatment:'comparison',hookText:'왜 가운데가 아닐까?'};
const scenes=[{id:'scene-1',kind:'video',duration:6,narration:'왜 폭포를 한가운데 놓지 않았을까요?',prompt:'기존 열찻길 옆으로 떨어지는 폭포',webtoon:plan,shot:'wide',camera:'locked',visualDirection:direction},{id:'scene-2',kind:'video',duration:10,narration:'먼저 있던 선로를 피해서 설계했어요. 그래서 폭포와 열차 길이 겹치지 않죠.',prompt:'고정된 선로를 피해 폭포 위치를 비교한다.',webtoon:plan,shot:'close',camera:'locked',visualDirection:{...direction,focus:'구멍 위치 비교'}}];
const research={sources:[{id:'source-1',title:'구조 설계 기관',url:'https://www.istructe.org/structural-awards/projects/2021/jewel-changi-airport/'}],facts:[{claim:'기존 선로를 피해 폭포가 배치됐다.',sourceIds:['source-1']}],limitations:['도해는 측량도가 아니다.']};
async function fixture(){const p={...createProject(input),title:'왜 가운데가 아닐까?',scenes:structuredClone(scenes),research,visualStyle:'섬세한 잉크와 앰버/청록 대비',approved:true,automation:{version:2},task:{id:'fixture',state:'running',action:'media'}};p.depthReview=await validateDepthReview(mockReview(await reviewPrompt(p.brief,p)).value,p.brief,p);return p;}
async function dir(t){const d=await mkdtemp(join(tmpdir(),'webtoon-test-'));t.after(()=>rm(d,{recursive:true,force:true}));return d;}
const png=process.env.WEBTOON_QA_ART?await readFile(process.env.WEBTOON_QA_ART):new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#246477"/></svg>').render().asPng();
function provider(){const calls=[],jobs=new Map();let n=0;return {calls,run:async a=>{calls.push(a);if(a[0]==='account')return {credits:1000};if(a[1]==='cost')return {credits:a[2]==='seedance_2_0'?54:2};if(a[1]==='create'){const id=`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`;jobs.set(id,a[2]);return {id};}if(a[1]==='get')return {id:a[2],status:'completed',result_url:`https://fixture.higgsfield.ai/${jobs.get(a[2])}`};throw Error('unexpected call');},fetcher:async url=>new Response(png,{headers:{'content-type':String(url).includes('seedance')?'video/mp4':'image/png'}})};}
function ioFixture(d){const files=new Map();return {files,workDir:d,writeAsset:async(k,b)=>files.set(k,b),readAsset:async k=>{assert.ok(files.has(k),'asset exists');return files.get(k);}};}
test('new option preserves Kyle 1.1, long 1.0 and explicit existing choices',()=>{
 const b=validateBrief(input);assert.equal(b.voiceId,KYLE);assert.equal(b.narrationSpeed,1.1);assert.equal(b.captionPosition,'bottom');assert.equal(b.workflow,'explainer-v1');
 assert.equal(validateBrief({...input,format:'long'}).narrationSpeed,1);
 assert.equal(validateBrief({...input,voiceId:'ZRJMGKt2Okf3o9C38eSq',narrationSpeed:1.25}).narrationSpeed,1.25);
 for(const maxCredits of [NaN,0,1001,'50'])assert.throws(()=>validateBrief({...input,maxCredits}));
});
test('data plans reject executable shapes, URLs, unbounded geometry and motion without a change',()=>{
 for(const patch of [{shape:'svg'},{color:'url(https://bad)'},{from:[NaN,0]},{points:[[1,2],[300,4]],shape:'path'},{to:[50,30]},{size:[100000,2]}])assert.throws(()=>webtoonPlan({...plan,layers:[{...plan.layers[1],...patch}]}));
 const svg=webtoonSvg({webtoon:{...plan,layers:plan.layers.map(l=>({...l,label:'<script>x</script>'}))},duration:10},'9:16',3,'data:image/png;base64,'+png.toString('base64'));
 assert.ok(!svg.includes('<script>'));assert.match(svg,/&lt;script&gt;/);
 assert.notEqual(webtoonSvg({webtoon:plan,duration:10},'9:16',1,''),webtoonSvg({webtoon:plan,duration:10},'9:16',7,''));
});
test('research then scenario then independent review; receipt survives scenario transport',async()=>{
 let calls=0;const value={title:'왜 가운데?',visualStyle:'앰버 청록 웹툰',scenes,storyArc:{hook:{sceneId:'scene-1',line:scenes[0].narration},payoff:{sceneId:'scene-2',line:'먼저 있던 선로를 피해서 설계했어요.'},ending:{sceneId:'scene-2',line:'그래서 폭포와 열차 길이 겹치지 않죠.'}}};
 const b=createProject(input).brief;
 const result=await scenarioBrief(b,{}, {generate:async p=>{calls++;if(mockReview(p))return mockReview(p);if(calls===1)return {searched:true,value:research};assert.match(p,/웹툰 혼합 제작/);return {value};}});
 assert.equal(calls,3);assert.ok(result.depthReview.passed);const saved=scenarioResult(result,b);await checkWebtoonReview({...saved,brief:b});
 await assert.rejects(checkWebtoonReview({...saved,brief:b,scenes:saved.scenes.map(s=>({...s,narration:s.narration+' 바뀐 대사'}))}),/대본/);
});
test('budget and stale review fail before any paid create; successful intro uses original reference',async t=>{
 const d=await dir(t),p=await fixture(),io=ioFixture(d),pr=provider();
 p.brief.maxCredits=55;p.depthReview=await validateDepthReview(mockReview(await reviewPrompt(p.brief,p)).value,p.brief,p);
 await assert.rejects(prepareWebtoon(p,{},d,io,async()=>{},pr),/58크레딧/);assert.equal(pr.calls.filter(a=>a[1]==='create').length,0);
 const good=await fixture();const pipeline=await prepareWebtoon(good,{},d,io,async delta=>Object.assign(good,delta),pr);
 await pipeline.scene(good.scenes[0],6);
 const creates=pr.calls.filter(a=>a[1]==='create');assert.equal(creates.length,2);assert.equal(creates[0][2],'nano_banana_2');assert.equal(creates[1][2],'seedance_2_0');assert.ok(creates[1].includes('--start-image'));assert.equal(creates[1][creates[1].indexOf('--duration')+1],'6');
 const before=creates.length;const again=await prepareWebtoon(good,{},d,io,async delta=>Object.assign(good,delta),pr);await again.scene(good.scenes[0],6);assert.equal(pr.calls.filter(a=>a[1]==='create').length,before);
});
test('ambiguous paid receipts stop, without submitting again',async t=>{
 const d=await dir(t),p=await fixture(),io=ioFixture(d),pr=provider();
 const fail=async args=>{if(args[1]==='create')throw Error('connection lost');return pr.run(args);};
 const pipeline=await prepareWebtoon(p,{},d,io,async delta=>Object.assign(p,delta),{...pr,run:fail});await assert.rejects(pipeline.scene(p.scenes[0],6),/connection lost/);
 await assert.rejects(prepareWebtoon(p,{},d,io,async()=>{},pr),/중복/);assert.equal(pr.calls.filter(a=>a[1]==='create').length,0);
});
test('failed paid receipt and changed-scene spending remain budgeted',async t=>{
 const d=await dir(t),p=await fixture(),io=ioFixture(d),pr=provider();
 const pipeline=await prepareWebtoon(p,{},d,io,async delta=>Object.assign(p,delta),pr);await pipeline.scene(p.scenes[0],6);
 const key=Object.keys(p.mediaJobs).find(k=>k.includes('-opening-'));p.mediaJobs[key].state='failed';
 await assert.rejects(prepareWebtoon(p,{},d,io,async()=>{},pr),/이전 유료/);
 p.mediaJobs[key].state='accepted';p.scenes[0].webtoon.artPrompt+=' 시점 변경';p.depthReview=await validateDepthReview(mockReview(await reviewPrompt(p.brief,p)).value,p.brief,p);
 const n=pr.calls.filter(a=>a[1]==='create').length;await assert.rejects(prepareWebtoon(p,{},d,io,async()=>{},pr),/초과/);assert.equal(pr.calls.filter(a=>a[1]==='create').length,n);
});
test('actual body renderer produces changing frames; complete worker route includes Kyle, subtitles, opening and ending', {timeout:240000},async t=>{
 const d=await dir(t),p=await fixture(),io=ioFixture(d),pr=provider();
 const opening=join(d,'opening.mp4');await command('ffmpeg',['-y','-v','error','-f','lavfi','-i','testsrc2=size=360x640:rate=30','-t','6','-c:v','libx264','-pix_fmt','yuv420p',opening],{});
 pr.fetcher=async url=>new Response(String(url).includes('seedance')?await readFile(opening):png,{headers:{'content-type':String(url).includes('seedance')?'video/mp4':'image/png'}});
 const runCli=async(name,args,env)=>{
  assert.equal(name,'@cak/tts-narration');assert.equal(env.ELEVENLABS_VOICE_ID,KYLE);
  await command('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=240:sample_rate=44100','-t','3','-c:a','libmp3lame',args[args.indexOf('--out')+1]],{});return {};
 };
 const result=await executeStudioTask(p,{ELEVENLABS_API_KEY:'test',SHOPSHORTS_MEDIA_PROVIDER:'higgsfield'},io,async delta=>Object.assign(p,delta),{runCli,runHiggsfield:pr.run,fetcher:pr.fetcher});
 Object.assign(p,result);assert.equal(p.assets['scene-2'].provider,'webtoon-hybrid');assert.equal(p.assets['narration-scene-1'].narrationSpeed,1.1);assert.ok(p.assets['scene-1-art']);
 const manual=continueAutomatic({...p,automation:undefined,task:{...p.task,state:'done'}});assert.equal(manual.task.action,'media');assert.equal(manual.task.state,'done');assert.ok(manual.edit.captions.length);
 const next=continueAutomatic({...p,task:{...p.task,state:'done'}});assert.equal(next.task.action,'render');assert.equal(next.edit.voice,KYLE);assert.equal(next.edit.clips[0].outFrame,180);assert.ok(next.edit.captions.some(c=>c.text.includes('겹치지')));
 const final=await executeStudioTask(next,{},io,async()=>{},{runCli});const file=join(d,'final.mp4');await writeFile(file,io.files.get(final.render.key));
 const probe=JSON.parse(await command('ffprobe',['-v','error','-show_streams','-of','json',file],{}));assert.ok(probe.streams.some(s=>s.codec_type==='audio'));assert.equal(probe.streams[0].width,1080);
 const sums=await command('ffmpeg',['-v','error','-ss','6','-i',file,'-f','framemd5','-'],{});assert.ok(new Set(sums.split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split(',').at(-1))).size>20);
 if(process.env.WEBTOON_QA_COPY)await writeFile(process.env.WEBTOON_QA_COPY,io.files.get(final.render.key));
 const paid=pr.calls.filter(a=>a[1]==='create').length;
 await executeStudioTask({...p,task:{action:'media',id:'resume'}},{},io,async()=>{},{runCli,runHiggsfield:pr.run,fetcher:pr.fetcher});assert.equal(pr.calls.filter(a=>a[1]==='create').length,paid);
});
