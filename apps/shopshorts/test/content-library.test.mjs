import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {collectContent,filterContent,fetchContent,renderContentRows} from '../public/content-library.js';
import {draftPayload,requestAutomaticDraft} from '../public/automatic-creation.js';

const project={id:'same',title:'수동 심리학',brief:{category:'심리학',format:'long'},scenes:[],assets:{},updatedAt:'2026-09-27T10:00:00Z'};
const job={brief:{id:'same',productName:'자동 건조대',category:'리빙'},status:'generated',previewVideo:'preview.mp4',updatedAt:'2026-09-27T09:00:00Z'};
test('content route can render before module initialization even when browser exposes its element ID on window',()=>{
  const source=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('function renderPage(name)'),source.indexOf('// ---------- 소재 리서치'));
  const host={innerHTML:''},window={contentLibrary:host};
  const context={window,document:{getElementById:()=>host},bindPageActions(){}};
  vm.runInNewContext(fn+';renderPage("content");',context);
  assert.match(host.innerHTML,/전체 콘텐츠/);
  let mounted=false;window.workspaceContent={mount:node=>{assert.equal(node,host);mounted=true;}};
  vm.runInNewContext(fn+';renderPage("content");',context);assert.equal(mounted,true);
});
test('unified library keeps both storage identities and pending requests, excludes completed or already materialized requests',()=>{
  const input={projects:[project],jobs:[job],requests:[{slug:'waiting',topic:'대기 주제',status:'pending',requestedAt:'2026-09-27T11:00:00Z'},{slug:'same',status:'pending'},{slug:'done',status:'done'}]};
  const before=structuredClone(input),items=collectContent(input);
  assert.deepEqual(items.map(item=>item.key),['request:waiting','studio:same','job:same']);assert.deepEqual(input,before);
  assert.equal(items[1].href,'/studio?id=same');assert.equal(items[2].href,'/studio/automatic?job=same');assert.equal(items[0].href,'/studio/automatic?request=waiting');
});
test('preview does not count as final; rendered and uploaded content are separate states',()=>{
  const items=collectContent({projects:[project,{...project,id:'rendered',render:{}},{...project,id:'published',render:{},upload:{state:'done'}}],jobs:[job,{...job,brief:{id:'failed'},status:'published',outputVideo:'final.mp4',upload:{state:'failed'}}]});
  assert.equal(filterContent(items,{status:'ready'}).length,3);
  assert.equal(filterContent(items,{status:'published'}).length,1);
  assert.equal(filterContent(items,{status:'working'}).length,4);
  assert.equal(filterContent(items,{status:'attention'})[0].id,'failed');
  assert.equal(items.find(item=>item.key==='job:same').ready,false);
});
test('search, generation method and lifecycle filters combine and sort without mutating the source',()=>{
  const items=collectContent({projects:[project],jobs:[job]});
  assert.equal(filterContent(items,{search:'심리',mode:'manual',status:'working'})[0].id,'same');
  assert.equal(filterContent(items,{search:'심리',mode:'auto'}).length,0);
  assert.deepEqual(filterContent(items,{sort:'oldest'}).map(item=>item.source),['job','studio']);
  assert.equal(items[0].source,'studio');
});
test('partial source failure is explicit and does not hide successful content; malformed list and expired session remain errors',async()=>{
  const result=await fetchContent(async url=>url==='/api/studio'?Response.json({projects:[project]}):url==='/api/jobs'?new Response('',{status:503}):Response.json({requests:[]}));
  assert.equal(result.items.length,1);assert.match(result.errors[0],/자동 제작 영상.*503/);
  const failed=await fetchContent(async url=>url==='/api/studio'?new Response('',{status:401}):Response.json({}));
  assert.equal(failed.errors.length,3);assert.match(failed.errors[0],/로그인/);assert.equal(failed.items.length,0);
});
test('library escapes titles, categories and identifiers while preserving safe continuation links',()=>{
  const html=renderContentRows(collectContent({projects:[{...project,id:'"><x>',title:'<script>alert(1)</script>',brief:{category:'<img>',format:'short'}}]}));
  assert.doesNotMatch(html,/<script>|<img>/);assert.match(html,/&lt;script&gt;/);assert.match(html,/%22%3E%3Cx%3E/);
});
test('automatic request validates usable topic, sends only draft payload and handles duplicate without resubmitting',async()=>{
  assert.throws(()=>draftPayload(' '));assert.throws(()=>draftPayload('😀'));assert.throws(()=>draftPayload('가'.repeat(101)));
  let count=0;
  const result=await requestAutomaticDraft('  건조대  ',' 작은 방 ',{fetcher:async(url,options)=>{
    count++;assert.equal(url,'/api/draft-requests');assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{topic:'건조대',contentType:'shorts',memo:'작은 방'});return new Response('',{status:409});
  }});
  assert.equal(count,1);assert.equal(result.duplicate,true);
});
test('automatic request exposes authentication and service failures and accepts local and cloud response shapes',async()=>{
  for(const payload of [{ok:true,slug:'topic'},{ok:true,request:{slug:'topic'}}])assert.deepEqual(await requestAutomaticDraft('주제','',{fetcher:async()=>Response.json(payload,{status:201})}),{duplicate:false});
  await assert.rejects(requestAutomaticDraft('주제','',{fetcher:async()=>new Response('',{status:401})}),/로그인/);
  await assert.rejects(requestAutomaticDraft('주제','',{fetcher:async()=>Response.json({error:'제작 서비스 점검 중'},{status:503})}),/점검 중/);
});
