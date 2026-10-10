import {mockReview} from './helpers/editorial-review.mjs';
import {normalizeEdit} from '../public/editor-model.js';
import {SHORTS_DEFAULT_SECONDS,suggestedDescription,relatedVideoUrl} from '../public/shorts-policy.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createProject,changeProject} from '../lib/studio.js';
import {scenarioBrief,scenarioResult} from '../lib/studio-scenario.js';
import {VISUAL_QUALITY,visualDirection,visualQualityReport} from '../lib/visual-direction.js';
import {sceneMediaPrompt} from '../lib/scene-media-prompt.js';
import {renderMotionScene} from '../studio-motion.mjs';
import {command} from '../studio-runner.mjs';
const direction=(i)=>({focus:`대상 ${i}`,before:`변화 전 ${i}`,action:`대상이 연결되는 변화 ${i}`,after:`변화 후 ${i}`,continuity:'같은 공간과 청록색 대상',material:'돌은 거칠고 얼음은 빛을 투과한다',lighting:'밝은 측면광, 배경과 다른 명도',representation:'conceptual',treatment:'process'});
const fixture=()=>{
 const brief={category:'건축학',topic:'전기 없이 얼음을 보관한 창고',format:'short',duration:18,visualQuality:VISUAL_QUALITY};
 const scenes=[1,2,3].map(i=>({id:`scene-${i}`,narration:`설명 ${i}입니다.`,prompt:`대상 ${i}의 변화`,kind:'video',duration:6,shot:['wide','detail','medium'][i-1],camera:'locked',visualDirection:direction(i)}));
 scenes[0].visualDirection.hookText='얼음 창고에 왜 구멍이 있을까?';
 scenes[2].visualDirection={...direction(3),treatment:'summary',labels:['겨울 얼음','열 유입 억제','녹은 물 배출']};
 return {brief,title:'차가움을 저장하는 구조',visualStyle:'자연스러운 돌과 얼음, 중립적인 조명',scenes,storyArc:Object.fromEntries(['hook','payoff','ending'].map((k,i)=>[k,{sceneId:scenes[i].id,line:scenes[i].narration}]))};
};
test('new projects opt into a versioned direction plan; legacy briefs are not silently rewritten',()=>{
 const p=createProject(fixture().brief);assert.equal(p.brief.visualQuality,VISUAL_QUALITY);
 const legacy=fixture();delete legacy.brief.visualQuality;legacy.scenes=legacy.scenes.map(({visualDirection,...s})=>s);
 assert.equal(scenarioResult(legacy,legacy.brief).visualQuality,undefined);
});
test('web generation, stored result validation and CLI compile the same safe plan',async t=>{
 const f=fixture();let prompt='';const generated=await scenarioBrief(f.brief,{}, {generate:async p=>{if(mockReview(p))return mockReview(p);prompt=p;return {value:f};}});
 assert.match(prompt,/before/);assert.match(prompt,/물리 시뮬레이션/);assert.equal(generated.visualQuality.passed,true);
 assert.equal(generated.scenes[2].motion.template,'summary');assert.equal(generated.scenes[2].motion.vars.label3,'녹은 물 배출');
 assert.deepEqual(scenarioResult(generated,f.brief),generated,'account result survives second validation');
 const media=sceneMediaPrompt({...f,...generated},generated.scenes[1]);assert.match(media,/first 20%/);assert.match(media,/대상 2/);assert.match(media,/빛을 투과/);
 const dir=await mkdtemp(join(tmpdir(),'visual-plan-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 await writeFile(join(dir,'input.json'),JSON.stringify(f));await command(process.execPath,['apps/shopshorts/studio-visual-plan.mjs','--project',join(dir,'input.json'),'--out',join(dir,'out.json')],{});
 const cli=JSON.parse(await readFile(join(dir,'out.json'),'utf8'));assert.deepEqual(cli.scenes,generated.scenes);assert.equal(cli.renderPrompts[2].renderer,'motion-hyperframes');
});
test('invalid, repetitive or unchanged plans fail before paid media generation',()=>{
 const f=fixture();assert.throws(()=>visualDirection({...direction(1),after:direction(1).before}),/변화 전후/);
 const repeated=[f.scenes[0],{...f.scenes[1],visualDirection:direction(1)}];assert.equal(visualQualityReport(repeated).passed,false);
 assert.equal(visualQualityReport(f.scenes.map(s=>({...s,shot:'wide'}))).issues.some(x=>x.code==='three-wide-shots'),true);
 assert.throws(()=>scenarioResult({...f,scenes:f.scenes.map(s=>({...s,visualDirection:undefined}))},f.brief),{code:'SCENARIO_VISUAL_INVALID'});
 const missing={...f,scenes:f.scenes.map(s=>({...s,motion:{template:'untrusted'},visualDirection:s.visualDirection}))};
 assert.equal(scenarioResult(missing,f.brief).scenes[2].motion.template,'summary');
 assert.throws(()=>scenarioResult({...f,scenes:[{...f.scenes[0],visualDirection:{...f.scenes[2].visualDirection,hookText:'왜 그럴까?'}},...f.scenes.slice(1)]},f.brief),/summary-placement/);
});
test('editing direction invalidates only its own media; saved legacy scenes stay editable',()=>{
 const f=fixture(),result=scenarioResult(f,f.brief);const p={...createProject(f.brief),brief:f.brief,...result,assets:{'scene-1':{source:'ai',key:'a'},'scene-2':{source:'ai',key:'b'}},task:null};
 const changed=changeProject(p,'scenes',{scenes:p.scenes.map((s,i)=>i? s:{...s,visualDirection:{...s.visualDirection,lighting:'왼쪽 측면광'}})});
 assert.equal(changed.assets['scene-1'],undefined);assert.equal(changed.assets['scene-2'].key,'b');
});
test('automatic summary renders real landscape frames without any paid media call',{timeout:180000},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'visual-motion-'));t.after(()=>rm(dir,{recursive:true,force:true}));const f=fixture();f.brief.aspect='16:9';const scene=scenarioResult(f,f.brief).scenes[2];
 const rendered=await renderMotionScene(f,scene,dir,{SHOPSHORTS_MOTION_NODE:process.env.SHOPSHORTS_MOTION_NODE||process.execPath});assert.equal(rendered.provider,'motion-hyperframes');
 const file=join(dir,'result.mp4');await writeFile(file,rendered.data);const meta=JSON.parse(await command('ffprobe',['-v','error','-show_streams','-of','json',file],{}));assert.equal(meta.streams[0].width,1920);assert.equal(meta.streams[0].height,1080);assert.equal(Number(meta.streams[0].nb_frames),180);
 await command('ffmpeg',['-v','error','-i',file,'-f','null','-'],{});
});

test('shorts hook starts on frame zero and user deletion is preserved; metadata stays relevant',()=>{
 const f=fixture(),p={...createProject(f.brief),...scenarioResult(f,f.brief)};const edit=normalizeEdit(p);
 assert.equal(SHORTS_DEFAULT_SECONDS,45);assert.equal(edit.captions[0].startFrame,0);assert.equal(edit.captions[0].endFrame,105);assert.equal(edit.captions[0].position,'top');
 assert.deepEqual(normalizeEdit({...p,edit:{...edit,captions:[]}}).captions,[]);
 assert.equal(normalizeEdit({...p,brief:{...p.brief,format:'long'}}).captions[0].presentation,'modern-header-v1');
 const legacy={...p,brief:{...p.brief}};delete legacy.brief.typography;assert.equal(normalizeEdit(legacy).captions[0].endFrame,90);
 assert.match(suggestedDescription(p),/#건축/);assert.doesNotMatch(suggestedDescription(p),/automobile/);
 assert.throws(()=>scenarioResult({...f,scenes:f.scenes.map((s,i)=>i?s:{...s,visualDirection:direction(1)})},f.brief),/첫 3초/);
});

test('related video is a validated handoff, not a false automatic YouTube association',()=>{
 assert.equal(relatedVideoUrl('https://youtu.be/lQaYhIJePu0?si=tracking'),'https://www.youtube.com/watch?v=lQaYhIJePu0');
 for(const url of ['https://evil.test/watch?v=lQaYhIJePu0','javascript:alert(1)','https://youtube.com/watch?v=bad'])assert.throws(()=>relatedVideoUrl(url));
 const f=fixture(),p={...createProject(f.brief),...scenarioResult(f,f.brief),render:{key:'render'},approved:true};
 const changed=changeProject(p,'publish',{platforms:['youtube'],privacy:'private',title:p.title,description:'설명',reviewed:true,relatedVideoUrl:'https://youtu.be/lQaYhIJePu0'});
 assert.equal(changed.publication.relatedVideoStatus,'manual-required');
});
