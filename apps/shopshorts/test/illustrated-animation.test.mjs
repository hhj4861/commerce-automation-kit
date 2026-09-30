import test from 'node:test';
import assert from 'node:assert/strict';
import {Resvg} from '@resvg/resvg-js';
import {animationGuide,animationPlan,ANIMATION_ICONS} from '../lib/animation-plan.js';
import {animationSvg} from '../studio-animation.mjs';
import {createProject,changeProject} from '../lib/studio.js';

const plan={title:'함께 풀어가는 문제',layout:'sequence',presentation:'illustrated',staging:'exchange',prop:'document',elements:[
 {icon:'person',label:'사용자',motion:'talk',expression:'worried'},
 {icon:'robot',label:'도우미',motion:'work',expression:'neutral'},
 {icon:'app',label:'앱',motion:'pulse'}]};
const scene={id:'s1',duration:8,kind:'video',narration:'대화를 통해 문제를 해결합니다.',prompt:'사람과 도우미 사이에 전달되는 문서',animation:plan};
test('new animation guidance requests reusable illustration actions and avoids text-heavy scenes',()=>{
 const guide=animationGuide({productionStyle:'animation'});
 assert.match(guide,/기본 presentation은 illustrated/);assert.match(guide,/전달이 실제로 설명되는 경우에만/);assert.match(guide,/대사는 별도 자막/);
 assert.deepEqual(animationPlan(plan),plan);
 for(const field of ['presentation','staging','prop'])assert.throws(()=>animationPlan({...plan,[field]:'<script/>'}));
 assert.throws(()=>animationPlan({...plan,elements:[{...plan.elements[0],expression:'invalid'},plan.elements[1]]}));
});
test('all whitelisted artwork renders in both aspect ratios with deterministic real movement',()=>{
 for(const aspect of ['9:16','16:9'])for(const icon of ANIMATION_ICONS){
  const s={...scene,animation:{...plan,elements:[{icon,label:'대상',motion:'work'},plan.elements[0]]}};
  const svg=animationSvg(s,aspect,2);assert.ok(!svg.includes('undefined'));assert.ok(!svg.includes('Jev'));
  const first=new Resvg(svg,{fitTo:{mode:'width',value:240}}).render().asPng();
  assert.ok(first.length>1000);assert.equal(svg,animationSvg(s,aspect,2));
  // Remove progress to ensure animation isn't just a changing progress bar.
  const frame=t=>new Resvg(animationSvg(s,aspect,t).replace(/<rect x="48" y="(?:1252|692)"[^>]*\/>/,''),{fitTo:{mode:'width',value:240}}).render().asPng();
  assert.notDeepEqual(frame(2),frame(3));
 }
});
test('untrusted labels are escaped; plans cannot introduce external assets or executable markup',()=>{
 const svg=animationSvg({...scene,animation:{...plan,title:'<script>bad</script>',elements:plan.elements.map(e=>({...e,label:'<img onerror=x>'}))}},'9:16',2);
 assert.ok(!svg.includes('<script>'));assert.ok(!svg.includes('<img'));assert.match(svg,/&lt;script&gt;/);assert.ok(!svg.includes('href='));
});
test('saved projects keep illustration choices and edits invalidate generated media',()=>{
 const p={...createProject({category:'과학',topic:'도구를 사용하는 AI',format:'short',duration:16,productionStyle:'animation'}),scenes:[scene],assets:{s1:{source:'ai',key:'old'}},approved:true};
 const next=changeProject(p,'scenes',{scenes:[{...scene,animation:{...plan,staging:'reaction',prop:'none'}}]});
 assert.equal(next.assets.s1,undefined);assert.equal(next.scenes[0].animation.staging,'reaction');
});
