import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {createProject,validateBrief,validateScenes,changeProject} from '../lib/studio.js';
import {ARCHITECTURE_QUALITY,architectureGuide,architectureParts} from '../public/architecture-quality.js';
import {hybridPlan,isHybrid} from '../public/hybrid-plan.js';
import {scenarioResult} from '../lib/studio-scenario.js';
import {sceneMediaPrompt} from '../lib/scene-media-prompt.js';
import {prepareWebtoon} from '../studio-webtoon.mjs';
import {renderHybridScene} from '../studio-hybrid-render.mjs';
import {checkArchitectureRuntime} from '../studio-architecture-blender.mjs';
import {reviewPrompt,validateDepthReview} from '../lib/explanation-depth.js';
import {mockReview} from './helpers/editorial-review.mjs';
import {studioApi} from '../lib/studio-api.js';
import {runHybridCli} from '../studio-hybrid-cli.mjs';
const exec=promisify(execFile);
const input={category:'건축학',topic:'건물의 차양이 접히는 이유',format:'short',duration:16};
export async function architectureFixture(){
 const p=createProject(input);
 const layers=[{id:'window',label:'유리',meaning:'차양 뒤의 유리 면',shape:'rect',color:'#6d929e',from:[50,50],to:[50,50],size:[75,68],start:0,end:.2,motion:'reveal'}, {id:'shade',label:'차양',meaning:'차양이 움직여 빛을 가린다',shape:'polygon',color:'#d6a669',from:[49,49],to:[51,49],size:[60,60],start:.15,end:.8,motion:'move',points:[[0,0],[100,50],[0,100]]}];
 const parts=[{layerId:'window',material:'glass'},{layerId:'shade',material:'fabric',offset:-15,hinge:{axis:'z',pivot:[0,50],from:-60,to:-5}}];
 const direction={focus:'접히는 차양',before:'접힌 차양',action:'힌지를 중심으로 펼침',after:'유리를 가리는 면',continuity:'앰버 차양과 청록 유리',material:'직조 천과 유리 반사',lighting:'따뜻한 주광과 차가운 보조광',representation:'conceptual',treatment:'cutaway',hookText:'건물의 피부가 움직인다면?'};
 const scenes=[6,4,6].map((duration,i)=>({id:'scene-'+(i+1),duration,kind:'video',narration:'차양이 펼쳐져 유리 앞을 가립니다. '+i,prompt:'같은 삼각 차양을 힌지로 회전시켜 투과 면적의 변화를 설명한다. '+i,shot:i?'detail':'wide',camera:'push-in',visualDirection:{...direction,focus:direction.focus+i,treatment:i?'cutaway':'scene'},webtoon:{artPrompt:'원화 속 외벽과 삼각 차양',answer:'빛이 들어오는 면적이 달라진다.',layers:structuredClone(layers)},hybrid:{renderer:'auto',focus:'shade',depth:8,parts:structuredClone(parts)}}));
 Object.assign(p,scenarioResult({title:'접히는 차양',scenes,visualStyle:'앰버 천과 청록 유리의 대조',research:{sources:[{id:'source-1',title:'전송 테스트',url:'https://example.com/test'}],facts:[{claim:'테스트용 계획',sourceIds:['source-1']}],limitations:['실제 건축 검증이 아닌 테스트 fixture']}},p.brief));
 p.depthReview=await validateDepthReview(mockReview(await reviewPrompt(p.brief,p)).value,p.brief,p);return p;
}
test('new architecture defaults; explicit styles and saved legacy briefs remain intact',()=>{
 const p=createProject(input);assert.equal(p.brief.architectureQuality,ARCHITECTURE_QUALITY);assert.equal(p.brief.productionStyle,'webtoon');assert.equal(p.brief.narrationSpeed,1.1);assert.ok(isHybrid(p.brief));
 assert.equal(createProject({...input,category:'과학'}).brief.architectureQuality,undefined);
 for(const style of ['cinematic','animation']){const b=createProject({...input,productionStyle:style}).brief;assert.equal(b.productionStyle,style);assert.equal(isHybrid(b),false);}
 const legacy=validateBrief({...input,productionStyle:'webtoon'});assert.equal(legacy.architectureQuality,undefined);assert.equal(isHybrid(legacy),false);
 assert.throws(()=>validateBrief({...input,architectureQuality:'unknown'}));
});
test('web create and CLI use the same version and renderer plan without paid calls',async t=>{
 let saved;const r=await studioApi(new Request('https://studio.test/api/studio',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}),{}, {create:async p=>{saved=p;}});
 assert.equal(r.status,201);assert.equal(saved.brief.architectureQuality,ARCHITECTURE_QUALITY);
 const p=await architectureFixture(),dir=await mkdtemp(join(tmpdir(),'arch-cli-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=join(dir,'project.json');await writeFile(file,JSON.stringify(p));
 const result=await runHybridCli(['--project',file]);assert.deepEqual(result.plan,hybridPlan(p));assert.equal(result.paidCalls,0);assert.deepEqual(result.plan.scenes.map(s=>s.renderer),['higgsfield','3d','3d']);assert.match(result.plan.scenes[1].label,/Blender/);
 assert.match(sceneMediaPrompt(p,p.scenes[1]),/architecture-cycles-v1/);assert.match(architectureGuide(p.brief),/힌지/);
});
test('typed materials and hinges reject missing parts, scale deformation and unbounded input',async()=>{
 const p=await architectureFixture();const bad=structuredClone(p);delete bad.scenes[1].hybrid.parts;assert.throws(()=>hybridPlan(bad),/재질/);
 for(const h of [{axis:'x',pivot:[50,50],from:0,to:Infinity},{axis:'code',pivot:[50,50],from:0,to:60}])assert.throws(()=>architectureParts([{layerId:'shade',material:'fabric',hinge:h}],p.scenes[1]));
 const scaled=structuredClone(p);scaled.scenes[1].webtoon.layers[1].motion='scale';assert.throws(()=>hybridPlan(scaled),/크기 변화/);
 const changed=structuredClone(p.scenes);changed[1].hybrid.parts[1].material='metal';p.assets={'scene-2':{source:'ai'},'scene-3':{source:'ai'}};const next=changeProject(p,'scenes',{scenes:changed});assert.equal(next.assets['scene-2'],undefined);assert.ok(next.assets['scene-3']);
 assert.equal(validateScenes(p.scenes)[1].hybrid.parts[1].hinge.to,-5);
});
test('Blender preflight failure happens before quotes, paid calls or local rendering',async()=>{
 const p=await architectureFixture();p.task={action:'media'};let calls=0;
 await assert.rejects(prepareWebtoon(p,{},'/unused',{},async()=>{},{blenderReady:async()=>{throw Error('Blender unavailable');},run:async()=>{calls++;},renderHybrid:async()=>{calls++;}}),/Blender unavailable/);assert.equal(calls,0);
 await assert.rejects(checkArchitectureRuntime({SHOPSHORTS_BLENDER_BIN:'/does-not-exist'}),{code:'ARCHITECTURE_BLENDER_UNAVAILABLE'});
});
test('completed assets are reused without Blender or paid requests',async()=>{
 const p=await architectureFixture();p.task={action:'media'};p.assets=Object.fromEntries(p.scenes.map(s=>[s.id,{key:s.id,source:'owned'}]));let calls=0;
 await prepareWebtoon(p,{},'/unused',{},async()=>{},{blenderReady:async()=>{calls++;},run:async()=>{calls++;}});assert.equal(calls,0);assert.ok(hybridPlan(p).scenes.every(s=>s.reused));
});
test('actual common renderer produces Cycles clip with moving geometry', {skip:!process.env.ARCHITECTURE_RENDER_E2E,timeout:600000},async()=>{
 const p=await architectureFixture(),dir=process.env.ARCHITECTURE_QA_DIR;assert.ok(dir);await checkArchitectureRuntime(process.env);
 const result=await renderHybridScene(p,{...p.scenes[1],duration:1},dir,process.env,'3d');assert.equal(result.provider,'architecture-blender');assert.equal(result.qualityProfile,ARCHITECTURE_QUALITY);assert.equal(result.renderReport.samples,48);assert.equal(result.renderReport.styleId,'architecture-crafted-v1');assert.match(result.renderReport.styleDigest,/^[a-f0-9]{64}$/);
 const out=join(dir,'architecture-default-e2e.mp4');await writeFile(out,result.data);await writeFile(join(dir,'render-report.json'),JSON.stringify(result.renderReport,null,2));
 const {stdout}=await exec('ffprobe',['-v','error','-show_streams','-of','json',out]);const v=JSON.parse(stdout).streams[0];assert.equal(v.width,1080);assert.equal(v.height,1920);assert.equal(+v.nb_frames,24);assert.equal(+v.duration,1);
 await exec('ffmpeg',['-v','error','-i',out,'-f','null','-']);
 for(const [t,name] of [['0','before'],['0.8','after']])await exec('ffmpeg',['-y','-v','error','-ss',t,'-i',out,'-frames:v','1',join(dir,name+'.png')]);
 assert.notDeepEqual(await readFile(join(dir,'before.png')),await readFile(join(dir,'after.png')));
});
