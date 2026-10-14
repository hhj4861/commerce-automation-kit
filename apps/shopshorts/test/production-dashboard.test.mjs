import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {manualItems,manualCounts,filterManual,fetchManualProjects,createManualDashboard,automaticItems,fetchAutomaticProjects} from '../public/manual-dashboard.js';

const base={id:'idea',title:'작은 집 이야기',brief:{category:'건축학',format:'short'},scenes:[],assets:{},updatedAt:'2026-09-27T01:00:00Z'};
const scene={id:'scene-1',kind:'image'};
const projects=[base,{...base,id:'media',scenes:[scene],approved:true},{...base,id:'edit',scenes:[scene],approved:true,assets:{'scene-1':{kind:'image'}}},{...base,id:'ready',render:{}},{...base,id:'done',render:{},upload:{state:'done'}},{...base,id:'failed',render:{},task:{action:'render',state:'failed'}},{...base,id:'busy',task:{action:'scenario',state:'running'}},{...base,id:'uploading',render:{},upload:{state:'requested'}}];
test('manual dashboard uses the same resume stage as the editor, including failed and busy work',()=>{
  const items=manualItems(projects),phase=Object.fromEntries(items.map(i=>[i.id,i.phase]));
  assert.deepEqual(phase,{busy:'2',done:'5',edit:'4',failed:'4',idea:'2',media:'3',ready:'5',uploading:'5'});
  assert.ok(items.every(item=>item.href===`/studio?id=${item.id}`));
  assert.deepEqual(manualCounts(items),{all:8,working:7,busy:2,attention:1,done:1});
  assert.equal(items.find(i=>i.id==='uploading').label,'업로드 진행 중');
});
test('manual filters combine progress, stage, title/category and format without mutating records',()=>{
  const before=structuredClone(projects),items=manualItems(projects);
  assert.deepEqual(filterManual(items,{phase:'4'}).map(i=>i.id),['edit','failed']);
  assert.equal(filterManual(items,{search:'건축',phase:'3',format:'short'})[0].id,'media');
  assert.equal(filterManual(items,{status:'done'})[0].id,'done');
  assert.equal(filterManual(items,{format:'long'}).length,0);
  assert.deepEqual(projects,before);
});
test('manual dashboard only loads its own source and exposes expired, unavailable and malformed responses',async()=>{
  const urls=[];
  const items=await fetchManualProjects(async url=>{urls.push(url);return Response.json({projects});});
  assert.deepEqual(urls,['/api/studio']);assert.equal(items.length,8);
  for(const [response,pattern] of [[new Response('',{status:401}),/로그인/],[new Response('',{status:503}),/503/],[Response.json({projects:null}),/응답/]])await assert.rejects(fetchManualProjects(async()=>response),pattern);
});
function dashboardHost(){
  const nodes=new Map();
  return {isConnected:true,innerHTML:'',setAttribute(){},addEventListener(){},querySelector(key){if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',value:'',setAttribute(){},addEventListener(){}});return nodes.get(key);}};
}
test('failed refresh preserves last known manual rows and clears the warning when the API recovers',async()=>{
  let failed=false;
  const host=dashboardHost(),ui=createManualDashboard({fetcher:async()=>failed?new Response('',{status:503}):Response.json({projects:[base]})});
  await ui.mount(host);assert.match(host.querySelector('[data-manual-rows]').innerHTML,/작은 집 이야기/);
  failed=true;await ui.refresh();assert.match(host.querySelector('[data-manual-error]').innerHTML,/마지막으로 조회한 목록/);assert.match(host.querySelector('[data-manual-rows]').innerHTML,/작은 집 이야기/);
  failed=false;await ui.refresh();assert.equal(host.querySelector('[data-manual-error]').innerHTML,'');
});
test('an initial failed lookup never claims that the user has no projects',async()=>{
  const host=dashboardHost(),ui=createManualDashboard({fetcher:async()=>new Response('',{status:503})});
  await ui.mount(host);assert.equal(host.querySelector('[data-manual-count]').textContent,'목록 확인 필요');assert.equal(host.querySelector('[data-manual-summary]').innerHTML,'');
});
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('home and automatic route expose separate views; legacy job/request links resolve to the automatic dashboard',()=>{
  const source=html.slice(html.indexOf('const ROUTES ='),html.indexOf('function renderPage(name)'));
  const nodes=Object.fromEntries(['dashboardView','automaticView','pageView'].map(id=>[id,{hidden:false}]));
  const context={URLSearchParams,location:{pathname:'/',search:''},state:{},window:{scrollTo(){}},document:{querySelectorAll:()=>[],querySelector:()=>({textContent:''}),getElementById:id=>nodes[id]},activateNav(){},applyRequestedDraft(){},renderSummary(){},renderPipeline(){},renderJobs(){},renderDetail(){},renderPage(){}};
  vm.runInNewContext(source+';navigate(currentRoute(),false);',context);
  assert.equal(nodes.dashboardView.hidden,false);assert.equal(nodes.automaticView.hidden,true);
  for(const path of ['/studio/dashboard','/studio/automatic','/']){
    context.location={pathname:path,search:'?job=existing'};
    vm.runInNewContext('navigate(currentRoute(),false);',context);
    assert.equal(nodes.dashboardView.hidden,true);assert.equal(nodes.automaticView.hidden,false);assert.equal(context.state.selected,'existing');
  }
  context.location={pathname:'/',search:'?request=draft'};
  assert.equal(vm.runInNewContext('currentRoute()',context),'automatic');
});
test('dashboard inline scripts remain syntactically valid after moving management out of home',()=>{
  for(const [,attributes,script] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g))if(!/type="module"/.test(attributes))new vm.Script(script);
  const home=html.slice(html.indexOf('id="dashboardView"'),html.indexOf('id="automaticView"'));
  assert.doesNotMatch(home,/id="jobs"|id="summary"|대본 승인과 발행 검수/);
});

 test('a pending request resumes its own detail and then follows its materialized job without duplication',()=>{
  const fn=html.slice(html.indexOf('function applyRequestedDraft()'),html.indexOf('function activateNav(name)'));
  const context={URLSearchParams,location:{search:'?request=waiting'},currentRoute:()=> 'automatic',state:{requests:[{slug:'waiting',topic:'내 요청'}],jobs:[],selected:'different-job'}};
  vm.runInNewContext(fn+';applyRequestedDraft();',context);
  assert.equal(context.state.selected,'request:waiting');assert.equal(context.state.search,'내 요청');
  context.state.jobs=[{brief:{id:'waiting'}}];
  vm.runInNewContext('applyRequestedDraft();',context);
  assert.equal(context.state.selected,'waiting');assert.equal(context.state.search,'');assert.equal(context.state.filter,'all');
 });

 test('automatically generated studio projects never appear in the manual dashboard',()=>{
  assert.deepEqual(manualItems([{...base,id:'auto',automation:{keyword:'자동 주제'}},base]).map(i=>i.id),['idea']);
 });

test('automatic management combines studio, legacy and pending work without manual or materialized duplicates',()=>{
  const automatic={...base,id:'auto',automation:{keyword:'건축'},task:{action:'scenario',state:'running'}};
  const jobs=[{brief:{id:'legacy',productName:'기존 작업'},status:'review'},{brief:{id:'done'},status:'published',publishRef:'https://example.com/video'}];
  const items=automaticItems({projects:[base,automatic],jobs,requests:[{slug:'pending',topic:'요청',status:'pending'},{slug:'legacy',status:'pending'}]});
  assert.equal(items.length,4);assert.ok(items.every(item=>item.mode==='auto'));
  assert.deepEqual(manualCounts(items),{all:4,working:3,busy:2,attention:0,done:1});
  assert.deepEqual(filterManual(items,{phase:'5'}).map(item=>item.id),['legacy']);
});
test('automatic dashboard retains its complete last known list when any source fails and recovers on retry',async()=>{
  let fail=false;const calls=[];
  const fetcher=async url=>{calls.push(url);return fail&&url==='/api/jobs'?new Response('',{status:503}):Response.json(url==='/api/studio'?{projects:[{...base,automation:{keyword:'집'}}]}:url==='/api/jobs'?{jobs:[]}:{requests:[]});};
  const host=dashboardHost(),ui=createManualDashboard({mode:'auto',fetcher});
  await ui.mount(host);assert.match(host.querySelector('[data-manual-rows]').innerHTML,/작은 집 이야기/);
  fail=true;await ui.refresh();assert.match(host.querySelector('[data-manual-error]').innerHTML,/503/);assert.match(host.querySelector('[data-manual-rows]').innerHTML,/작은 집 이야기/);
  fail=false;await ui.refresh();assert.equal(host.querySelector('[data-manual-error]').innerHTML,'');
  assert.ok(calls.includes('/api/hot-keywords'));
  await assert.rejects(fetchAutomaticProjects(async()=>Response.json({})),/응답/);
});

test('sidebar checks studio heartbeat independently of the legacy queue and exposes unavailable status',async()=>{
 const source=html.slice(html.indexOf('async function updateStudioWorkerStatus()'),html.indexOf('async function load(keepSelection=false)'));
 const nodes={systemStatus:{},systemNote:{}};let response,fail=false;
 const context={Date,Number,document:{getElementById:id=>nodes[id]},api:async path=>{assert.equal(path,'/api/studio/config');if(fail)throw Error('unavailable');return response;},state:{workerAt:null}};
 vm.runInNewContext(source,context);
 for(const [config,expected] of [
  [{execution:'cloud-worker',capabilities:{workerAt:new Date().toISOString()}},'온라인'],
  [{execution:'cloud-worker',capabilities:{workerAt:new Date(Date.now()-120000).toISOString()}},'오프라인'],
  [{execution:'cloud-worker',capabilities:{}},'오프라인'],
  [{execution:'local'},'온라인']]){
  response=config;await context.updateStudioWorkerStatus();assert.match(nodes.systemStatus.innerHTML,new RegExp(expected));
 }
 fail=true;await context.updateStudioWorkerStatus();assert.match(nodes.systemStatus.innerHTML,/확인 필요/);assert.doesNotMatch(nodes.systemNote.textContent,/처리할 수/);
});
