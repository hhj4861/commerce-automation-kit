import test from 'node:test';
import assert from 'node:assert/strict';
import {projectSummary} from '../public/studio-projects.js';
import {collectContent} from '../public/content-library.js';
import {studioNavigation,navigationRoute,navigationLinks} from '../public/studio-navigation.js';
const base={id:'one',scenes:[],assets:{},brief:{},render:{}};
test('a render ready for human review is distinct from unfinished work and successful publishing',()=>{
 assert.equal(projectSummary(base).label,'완성 영상 · 검수 대기');
 assert.equal(projectSummary(base).action,'영상 검수하기');
 assert.equal(projectSummary(base).done,false);
 assert.equal(projectSummary({...base,upload:{state:'done'}}).done,true);
 assert.equal(projectSummary({...base,render:null}).action,'이어서 만들기');
});
test('failed regeneration or upload takes priority over an older available render',()=>{
 for(const project of [{...base,task:{state:'failed',action:'render'}},{...base,upload:{state:'failed'}}]){
  const summary=projectSummary(project);assert.match(summary.label,/확인 필요/);assert.equal(summary.action,'확인하고 이어하기');
  const item=collectContent({projects:[project]})[0];assert.equal(item.attention,true);assert.equal(item.ready,true);assert.equal(item.published,false);
 }
 assert.equal(projectSummary({...base,task:{state:'running',action:'render'}}).action,'진행 상황 보기');
});
test('all eleven menu destinations are available in the compact menu, with exact single current page',()=>{
 assert.equal(new Set(studioNavigation.map(x=>x.href)).size,11);
 for(const route of studioNavigation){const html=navigationLinks(route.href);assert.equal((html.match(/aria-current="page"/g)||[]).length,1);assert.ok(html.includes('설정'));assert.ok(html.includes('성과'));assert.ok(html.includes('알림함'));}
 assert.equal(navigationRoute('/studio/automatic/'),'/studio/dashboard');assert.equal(navigationRoute('/studio'),'/studio/dashboard');
 assert.equal(navigationRoute('/contents/'),'/contents');
});

test('primary navigation follows creating and continuing, with optional tools grouped separately',()=>{
 const primary=studioNavigation.filter(item=>item.group==='영상 작업');
 assert.deepEqual(primary.map(item=>item.href),['/','/studio/dashboard','/contents','/performance']);
 assert.equal(studioNavigation.find(item=>item.href==='/contents').label,'내 영상');
 assert.equal(studioNavigation.find(item=>item.href==='/metadata').group,'제작 도구');
});
