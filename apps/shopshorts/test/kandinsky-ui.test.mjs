import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {validateInput,MAX_IMAGE} from '../public/kandinsky-api.js';

// Event/state tests, not a layout/browser substitute. Run the shipped controller with a small DOM port.
const source=readFileSync(new URL('../public/kandinsky.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
function ui({configured=true,failGenerate=false}={}) {
  const elements=new Map(),examples=['cat','product','landscape'].map(example=>({dataset:{example}}));
  const element=id=>{
    if(!elements.has(id))elements.set(id,{value:id==='seed'?'42':'',hidden:true,files:[],dataset:{},listeners:{},attributes:{},
      addEventListener(name,fn){this.listeners[name]=fn;},setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return this.attributes[k];},removeAttribute(k){delete this.attributes[k];},load(){},focus(){}});
    return elements.get(id);
  };
  examples.forEach((e,i)=>Object.assign(e,element('example'+i)));
  examples.forEach((e,i)=>e.dataset.example=['cat','product','landscape'][i]);
  let job=null,posts=0;
  const accountRequest=async(op='account')=>{
    if(op==='generate'){posts++;if(failGenerate){job={id:'fixture',phase:'uncertain'};throw Error('시험 연결 실패');}job={id:'fixture',phase:'submitted'};}
    if(op==='clear')job=null;
    return {configured,job};
  };
  const fetch=async()=>{job={...job,phase:'complete',prompt:'검증된 장면'};return new Response('data: {"complete":true}\n\n');};
  runInNewContext(source,{document:{getElementById:element,querySelector:element,querySelectorAll:()=>examples},window:{addEventListener(){}},
    validateInput,MAX_IMAGE,accountRequest,KANDINSKY_API:'/api/studio/kandinsky',fetch,AbortController,FormData,TextDecoder,URL,confirm:()=>false});
  const settle=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
  const fire=async(id,event)=>{element(id).listeners[event]({preventDefault(){}});await settle();};
  return {element,examples,settle,fire,posts:()=>posts};
}
test('missing account and empty prompt prevent generation; examples populate count without overwriting a draft',async()=>{
  const a=ui({configured:false});await a.settle();assert(a.element('generate').disabled);assert.match(a.element('connection-title').textContent,/연결 필요/);
  const b=ui();await b.settle();assert(b.element('generate').disabled);
  b.examples[0].listeners.click();await b.settle();assert(!b.element('generate').disabled);assert.match(b.element('prompt-count').textContent,/^[1-9]/);
  const draft=b.element('prompt').value;b.examples[1].listeners.click();assert.equal(b.element('prompt').value,draft);
});
test('completion exposes same-origin download; new clears only receipt and retains input',async()=>{
  const f=ui();await f.settle();f.examples[0].listeners.click();await f.fire('generate-form','submit');
  assert.equal(f.posts(),1);assert.equal(f.element('phase-badge').textContent,'생성 완료');assert(!f.element('download').hidden);
  assert.equal(f.element('download').href,'/api/studio/kandinsky/media?id=fixture');assert(f.element('generate').disabled);
  const draft=f.element('prompt').value;await f.fire('new','click');assert.equal(f.element('prompt').value,draft);assert(!f.element('generate').disabled);
});
test('uncertain submission blocks repeat generation and preserves the actionable error',async()=>{
  const f=ui({failGenerate:true});await f.settle();f.examples[0].listeners.click();await f.fire('generate-form','submit');
  assert.equal(f.posts(),1);assert(f.element('generate').disabled);assert.equal(f.element('error').hidden,false);assert.equal(f.element('phase-badge').textContent,'확인 필요');
  await f.fire('generate-form','submit');assert.equal(f.posts(),1);assert.match(f.element('status').textContent,/접수 여부/);
});
