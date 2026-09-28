import {collectContent,renderContentRows} from './content-library.js';
import {projectSummary} from './studio-projects.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const phases=[['all','전체 단계'],['2','시나리오'],['3','이미지 · 영상'],['4','편집'],['5','업로드']];

export function productionItems(projects,mode='manual') {
  const byId=new Map(projects.map(project=>[project.id,project]));
  return collectContent({projects}).filter(item=>item.mode===mode).map(item=>{
    const project=byId.get(item.id),summary=projectSummary(project);
    const busy=['queued','running'].includes(project.task?.state)||['requested','submitting','uploading'].includes(project.upload?.state);
    return {...item,phase:String(summary.step),busy:!item.published&&busy,...(!item.published&&['requested','submitting','uploading'].includes(project.upload?.state)?{label:'업로드 진행 중',action:'진행 상황 보기'}:{})};
  });
}
export const manualItems=projects=>productionItems(projects,'manual');
export function filterManual(items,{status='working',phase='all',search='',format='all'}={}) {
  const query=search.trim().toLocaleLowerCase('ko-KR');
  return items.filter(item=>(status==='all'||status==='working'&&!item.published||status==='busy'&&item.busy||status==='attention'&&item.attention||status==='done'&&item.published)&&
    (phase==='all'||phase===item.phase)&&(format==='all'||(format==='long'?'롱폼':'숏폼')===item.format)&&
    (!query||`${item.title} ${item.category}`.toLocaleLowerCase('ko-KR').includes(query)));
}
export function manualCounts(items) {
  return Object.fromEntries(['all','working','busy','attention','done'].map(status=>[status,filterManual(items,{status}).length]));
}
export async function fetchManualProjects(fetcher=fetch,mode='manual') {
  const response=await fetcher('/api/studio',{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(response.status===401?'로그인 세션이 만료됐어요. 다시 로그인해 주세요.':`수동 제작 목록을 불러오지 못했어요. (${response.status})`);
  const data=await response.json();
  if(!Array.isArray(data.projects))throw Error('수동 제작 목록 응답을 확인하지 못했어요.');
  return productionItems(data.projects,mode);
}
export function automaticItems({projects=[],jobs=[],requests=[]}={}) {
  const studio=new Map(productionItems(projects,'auto').map(item=>[item.key,item]));
  const byId=new Map(jobs.map(job=>[job.brief.id,job]));
  return collectContent({projects,jobs,requests}).filter(item=>item.mode==='auto').map(item=>{
    if(studio.has(item.key))return studio.get(item.key);
    const job=byId.get(item.id),phase=item.source==='request'?'2':({draft:'2',approved:'3','script-approved':'3',generated:'4',assembled:'5',review:'5',published:'5',rejected:'2'}[job?.status]||'3');
    const busy=item.source==='request'||['requested','submitting','uploading'].includes(job?.upload?.state)||['queued','running'].includes(job?.finalize?.state);
    return {...item,phase,busy:!item.published&&busy};
  });
}
export async function fetchAutomaticProjects(fetcher=fetch) {
  const entries=await Promise.all([['projects','/api/studio'],['jobs','/api/jobs'],['requests','/api/hot-keywords']].map(async([key,url])=>{
    const response=await fetcher(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error(response.status===401?'로그인 세션이 만료됐어요. 다시 로그인해 주세요.':`자동 제작 목록을 불러오지 못했어요. (${response.status})`);
    const data=await response.json();if(!Array.isArray(data[key]))throw Error('자동 제작 목록 응답을 확인하지 못했어요.');
    return [key,data[key]];
  }));
  return automaticItems(Object.fromEntries(entries));
}
export function createProductionDashboard({fetcher=fetch,mode='manual',onOpen,onCreate}={}) {
  let host,items=null,error='',pending;
  const label=mode==='auto'?'자동':'수동';
  const filters={status:'working',phase:'all',search:'',format:'all'};
  function paint() {
    if(!host?.isConnected)return;
    host.querySelector('[data-manual-error]').innerHTML=error?`<div class="content-error" role="alert"><strong>${esc(error)}</strong>${items?'<p>아래는 마지막으로 조회한 목록입니다. 최신 상태를 확인한 뒤 이어가세요.</p>':''}<button data-manual-retry>다시 불러오기</button>${/로그인/.test(error)?'<a class="workspace-link" href="/login">로그인</a>':''}</div>`:'';
    host.querySelector('[data-manual-retry]')?.addEventListener('click',refresh);
    if(items===null){host.querySelector('[data-manual-count]').textContent=error?'목록 확인 필요':'저장한 작업을 불러오는 중이에요.';return;}
    const counts=manualCounts(items);
    host.querySelector('[data-manual-summary]').innerHTML=[['working','이어 만들 작업','저장한 단계부터 시작'],['busy','생성 · 업로드 중','현재 진행 상황 확인'],['attention','확인 필요','실패한 작업 확인'],['done','업로드 완료','게시 결과 확인']].map(([status,label,note])=>`<button class="production-stat" data-manual-status="${status}" aria-pressed="${filters.status===status}"><span>${label}</span><strong>${counts[status]}<small>개</small></strong><span>${note}</span></button>`).join('');
    host.querySelector('[data-manual-phases]').innerHTML=phases.map(([phase,label])=>`<button class="production-phase" data-manual-phase="${phase}" aria-pressed="${filters.phase===phase}">${label}<span>${filterManual(items,{...filters,phase}).length}</span></button>`).join('');
    const visible=filterManual(items,filters);
    host.querySelector('[data-manual-count]').textContent=`${visible.length}개 표시 / 전체 ${items.length}개${error?' · 마지막 조회 기준':''}`;
    host.querySelector('[data-manual-all]').setAttribute('aria-pressed',String(filters.status==='all'));
    host.querySelector('[data-manual-rows]').innerHTML=visible.length?renderContentRows(visible):`<div class="content-empty"><h2>${items.length?'이 조건에 맞는 작업이 없어요':`첫 ${label} 영상을 만들어보세요`}</h2><p>${items.length?'전체 작업을 보거나 검색어와 제작 단계를 바꿔보세요.':'기획을 저장하면 제작 단계와 이어하기가 이곳에 표시됩니다.'}</p>${items.length?'<button class="workspace-link" data-manual-reset>전체 작업 보기</button>':`<a class="workspace-link" data-production-create href="${mode==='auto'?'#automaticCreation':'/studio?new=1'}">새 ${label} 영상 만들기</a>`}</div>`;
  }
  async function refresh() {
    if(pending)return pending;
    host?.setAttribute('aria-busy','true');
    pending=(mode==='auto'?fetchAutomaticProjects(fetcher):fetchManualProjects(fetcher)).then(next=>{items=next;error='';}).catch(e=>{error=e.message.replaceAll('수동 제작',label+' 제작');}).finally(()=>{pending=null;paint();host?.setAttribute('aria-busy','false');});
    return pending;
  }
  function reset() {
    Object.assign(filters,{status:'all',phase:'all',search:'',format:'all'});
    host.querySelector('[data-manual-search]').value='';host.querySelector('[data-manual-format]').value='all';paint();
  }
  function mount(container) {
    host=container;
    host.innerHTML=`<div class="production-actions"><p>${mode==='auto'?'자동 제작 작업의 대본을 승인하고, 완성 영상을 검수하세요.':'작업을 선택하면 저장한 단계부터 직접 이어서 만들 수 있어요.'}</p><a class="workspace-page-action" data-production-create href="${mode==='auto'?'#automaticCreation':'/studio?new=1'}">새 ${label} 영상 만들기</a></div><div data-manual-error></div><section class="production-stats" data-manual-summary aria-label="${label} 제작 현황"></section><section aria-label="${label} 작업 이어하기"><div class="workspace-section-head"><h2>작업 이어하기</h2><div><button class="workspace-link" data-manual-all aria-pressed="false">전체 작업</button> <button class="workspace-link" data-manual-refresh>새로고침</button></div></div><div class="content-toolbar"><label class="content-search">작업 검색<input type="search" data-manual-search placeholder="제목 또는 카테고리 검색"></label><label>영상 형식<select data-manual-format><option value="all">전체 형식</option><option value="short">숏폼</option><option value="long">롱폼</option></select></label></div><nav class="production-phases" data-manual-phases aria-label="제작 단계 필터"></nav><p class="content-count" data-manual-count role="status">저장한 작업을 불러오는 중이에요.</p><div class="content-list" data-manual-rows></div></section>`;
    host.addEventListener('click',event=>{
      const create=event.target.closest('[data-production-create]');
      if(create&&onCreate){event.preventDefault();onCreate();return;}
      const link=event.target.closest('.content-open');
      if(link&&onOpen&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onOpen(link.href);return;}
      const button=event.target.closest('button');if(!button)return;
      if(button.hasAttribute('data-manual-status')){filters.status=button.dataset.manualStatus;filters.phase='all';paint();}
      else if(button.hasAttribute('data-manual-phase')){filters.phase=button.dataset.manualPhase;paint();}
      else if(button.hasAttribute('data-manual-all')||button.hasAttribute('data-manual-reset'))reset();
      else if(button.hasAttribute('data-manual-refresh'))refresh();
    });
    host.querySelector('[data-manual-search]').addEventListener('input',event=>{filters.search=event.target.value;paint();});
    host.querySelector('[data-manual-format]').addEventListener('change',event=>{filters.format=event.target.value;paint();});
    return refresh();
  }
  return {mount,refresh};
}

// Keep existing callers compatible with the shared dashboard renderer.
export const createManualDashboard=createProductionDashboard;
