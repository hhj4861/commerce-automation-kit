import test from 'node:test';
import assert from 'node:assert/strict';
import {organizeProjects,projectSummary,renderProjects,loadProjects} from '../public/studio-projects.js';
const base={id:'00000000-0000-4000-8000-000000000001',title:'영상 제목',brief:{category:'심리학',format:'short'},scenes:[{id:'scene-1'}],assets:{},updatedAt:'2026-09-25T00:00:00Z',revision:1};
test('resume prioritizes most recently saved unfinished videos, keeps finished videos separate and preserves input',()=>{
 const projects=[{...base,id:'completed',upload:{state:'done'},updatedAt:'2026-09-28T00:00:00Z'},base,{...base,id:'newest',updatedAt:'2026-09-27T00:00:00Z'}];
 const original=structuredClone(projects);const result=organizeProjects(projects);
 assert.deepEqual(result.unfinished.map(p=>p.id),['newest',base.id]);assert.equal(result.completed[0].id,'completed');assert.deepEqual(projects,original);
});
test('resume links preserve project identity and expose correct review, media, edit, upload or failure state',()=>{
 for(const [patch,step,label] of [[{},2,'시나리오 단계'],[{approved:true},3,'이미지 · 영상 단계'],[{approved:true,assets:{'scene-1':{kind:'image'}}},4,'편집 단계'],[{render:{}},5,'업로드 단계'],[{task:{action:'media',state:'failed'}},3,'장면 생성 확인 필요'],[{task:{action:'render',state:'running'}},4,'영상 렌더 중']]){
  const summary=projectSummary({...base,...patch});assert.equal(summary.step,step);assert.equal(summary.label,label);assert.equal(summary.href,`/studio?id=${base.id}`);
 }
 assert.equal(projectSummary({...base,upload:{state:'done'}}).action,'완성 영상 보기');
});
test('title and asset identifiers cannot inject markup, and missing media still gives a visible continuation action',()=>{
 const html=renderProjects([{...base,title:'<img src=x onerror=alert(1)>',approved:true,assets:{'scene-1':{kind:'image'}}}]);
 assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x/);assert.match(html,/aria-current="step"/);assert.match(html,/이어서 만들기/);assert.match(html,/assets\/scene-1/);
 assert.match(renderProjects([base]),/<svg/);assert.match(renderProjects([]),/새 영상 만들기/);
});
test('compact dashboard shows recent projects with access to full library',()=>{
 const html=renderProjects(Array.from({length:5},(_,i)=>({...base,id:String(i)})),{compact:true});
 assert.equal((html.match(/class="resume-row"/g)||[]).length,2);assert.match(html,/내 영상 전체 보기/);
});
test('failed loading is not presented as an empty library and retry can recover; 401 offers login',async()=>{
 const button={};const container={dataset:{studioProjects:'full'},setAttribute(){},querySelector:()=>button,innerHTML:''};
 let calls=0;
 await loadProjects(container,async()=>++calls===1?new Response('',{status:503}):Response.json({projects:[base]}));
 assert.match(container.innerHTML,/불러오지 못했/);await button.onclick();assert.match(container.innerHTML,/영상 제목/);
 await loadProjects(container,async()=>new Response('',{status:401}));assert.match(container.innerHTML,/href="\/login"/);
});
