import {projectSummary} from './studio-projects.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const encode = encodeURIComponent;
const jobLabels = {draft:'대본 검수', 'script-approved':'영상 생성', generated:'미리보기 검수', assembled:'최종 검수', review:'발행 검수', rejected:'수정 필요', approved:'제작 준비', published:'발행 확인'};

export function collectContent({projects=[],jobs=[],requests=[]}={}) {
  const items = projects.map(project => {
    const summary = projectSummary(project);
    const scene = project.scenes?.find(scene => project.assets?.[scene.id]?.kind === 'image');
    return {key:`studio:${project.id}`,id:project.id,source:'studio',mode:'manual',title:project.title || project.brief?.topic || '제목 없는 영상',category:project.brief?.category || '',format:project.brief?.format === 'long' ? '롱폼' : '숏폼',updatedAt:project.updatedAt,
      ready:!!project.render,published:project.upload?.state === 'done',attention:project.task?.state === 'failed' || project.upload?.state === 'failed',label:project.upload?.state === 'failed' ? '업로드 확인 필요' : summary.label,action:summary.action,href:summary.href,
      poster:scene ? `/api/studio/${encode(project.id)}/assets/${encode(scene.id)}?v=${encode(project.revision)}` : null};
  });
  for (const job of jobs) {
    const ready = !!(job.mediaUploaded?.final || (job.outputVideo && ['assembled','review','published'].includes(job.status)));
    const published = job.upload?.state === 'done' || (job.status === 'published' && !job.upload && !!job.publishRef);
    const attention = ['failed','error'].includes(job.upload?.state) || job.finalize?.state === 'error' || job.status === 'rejected';
    const label = attention ? '확인 필요' : published ? '업로드 완료' : ['requested','uploading'].includes(job.upload?.state) ? '업로드 진행 중' : jobLabels[job.status] || '제작 중';
    items.push({key:`job:${job.brief.id}`,id:job.brief.id,source:'job',mode:'auto',title:job.script?.title || job.brief.productName || job.brief.keyword || '제목 없는 영상',category:job.brief.category || '',format:'숏폼',updatedAt:job.updatedAt,ready,published,attention,label,action:published?'콘텐츠 보기':'확인하고 이어하기',href:`/?job=${encode(job.brief.id)}`});
  }
  const jobIds = new Set(jobs.map(job => job.brief.id));
  for (const request of requests.filter(request => request.status === 'pending' && !jobIds.has(request.slug))) {
    items.push({key:`request:${request.slug}`,id:request.slug,source:'request',mode:'auto',title:request.topic,category:'초안 요청',format:'숏폼',updatedAt:request.requestedAt || request.requested_at,ready:false,published:false,attention:false,label:'대본 작성 대기',action:'요청 관리',href:`/?request=${encode(request.slug)}`});
  }
  return items.sort((a,b) => (Date.parse(b.updatedAt)||0)-(Date.parse(a.updatedAt)||0) || a.key.localeCompare(b.key));
}

export function filterContent(items,{search='',mode='all',status='all',sort='recent'}={}) {
  const query=search.trim().toLocaleLowerCase('ko-KR');
  const result=items.filter(item => (!query || `${item.title} ${item.category}`.toLocaleLowerCase('ko-KR').includes(query)) &&
    (mode==='all'||item.mode===mode) && (status==='all'||status==='working'&&!item.published||status==='ready'&&item.ready||status==='published'&&item.published||status==='attention'&&item.attention));
  return sort==='oldest' ? result.reverse() : result;
}

const sources=[['projects','수동 제작 영상','/api/studio'],['jobs','자동 제작 영상','/api/jobs'],['requests','작성 대기 요청','/api/hot-keywords']];
export async function fetchContent(fetcher=fetch) {
  const settled=await Promise.allSettled(sources.map(async([key,,url]) => {
    const response=await fetcher(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error(response.status===401?'로그인이 필요합니다.':`불러오기 실패 (${response.status})`);
    const data=await response.json();
    if(!Array.isArray(data[key]))throw Error('목록 응답을 확인하지 못했습니다.');
    return data[key];
  }));
  const data={},errors=[];
  settled.forEach((result,i) => {
    const [key,label]=sources[i];
    if(result.status==='fulfilled')data[key]=result.value;
    else {data[key]=[];errors.push(`${label}: ${result.reason.message}`);}
  });
  return {items:collectContent(data),errors,data};
}

function dateLabel(value) {
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'저장 시각 없음':date.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
}
function row(item,{allowDelete=false}={}) {
  return `<article class="content-row" data-content-key="${esc(item.key)}"><a class="content-open" href="${esc(item.href)}"><span class="content-poster" aria-hidden="true">${item.poster?`<img src="${esc(item.poster)}" alt="" loading="lazy">`:'<svg viewBox="0 0 40 50" fill="none"><rect x="7" y="2" width="26" height="46" rx="4" stroke="currentColor"/><path d="m16 17 12 8-12 8Z" fill="currentColor"/></svg>'}</span><span class="content-copy"><strong>${esc(item.title)}</strong><span class="content-meta">${item.mode==='auto'?'자동 생성':'수동 생성'} · ${esc(item.category)} · ${item.format}<time>${esc(dateLabel(item.updatedAt))}</time></span></span><span class="content-state" data-attention="${item.attention}">${esc(item.label)}</span><span class="content-action">${item.action}</span></a>${allowDelete && item.source==='job'?`<button class="content-delete" data-delete-content="${esc(item.id)}" aria-label="${esc(item.title)} 삭제">삭제</button>`:''}</article>`;
}
export function renderContentRows(items,options={}) {
  return items.length?items.map(item=>row(item,options)).join(''):'<div class="content-empty"><h2>표시할 콘텐츠가 없어요</h2><p>검색어나 필터를 바꾸거나 새 영상을 시작하세요.</p><a class="workspace-link" href="/studio">새 영상 만들기</a></div>';
}

export function createContentLibrary({fetcher=fetch,onData=()=>{},onDelete}={}) {
  let host=null,home=null,result=null,pending=null;
  const initial=new URLSearchParams(globalThis.location?.search || '');
  const filters={search:'',mode:'all',status:['working','ready','published','attention'].includes(initial.get('status'))?initial.get('status'):'all',sort:'recent'};
  const errorMarkup=()=>result.errors.length?`<div class="content-error" role="alert"><strong>일부 콘텐츠를 불러오지 못했어요.</strong><p>${result.errors.map(esc).join('<br>')}</p><button data-content-retry>다시 불러오기</button></div>`:'';
  function paint() {
    if(!result)return;
    if(host?.isConnected) {
      host.querySelector('[data-content-errors]').innerHTML=errorMarkup();
      const items=filterContent(result.items,filters);
      host.querySelector('[data-content-count]').textContent=`${items.length}개${result.errors.length?' (조회된 콘텐츠 기준)':` / 전체 ${result.items.length}개`}`;
      host.querySelector('[data-content-rows]').innerHTML=renderContentRows(items,{allowDelete:!!onDelete});
      host.querySelector('[data-content-retry]')?.addEventListener('click',refresh);
      host.querySelectorAll('[data-delete-content]').forEach(button=>button.onclick=async()=>{await onDelete(button.dataset.deleteContent);await refresh();});
    }
    if(home?.isConnected) {
      const unfinished=result.items.filter(item=>!item.published).slice(0,3);
      home.innerHTML=`<div class="workspace-section-head"><h2>최근 작업 이어하기</h2><a href="/contents?status=working">콘텐츠 전체 보기</a></div>${errorMarkup()}${unfinished.length?renderContentRows(unfinished):`<div class="content-empty"><p>${result.items.length?'진행 중인 작업이 없어요. 완성한 영상은 콘텐츠에서 확인하세요.':'첫 영상을 시작하면 이곳에서 이어 만들 수 있어요.'}</p><a class="workspace-link" href="${result.items.length?'/contents':'/studio'}">${result.items.length?'콘텐츠 보기':'새 영상 만들기'}</a></div>`}`;
      home.querySelector('[data-content-retry]')?.addEventListener('click',refresh);
    }
  }
  async function refresh() {
    if(pending)return pending;
    const containers=[host,home].filter(node=>node?.isConnected);
    containers.forEach(node=>node.setAttribute('aria-busy','true'));
    pending=fetchContent(fetcher).then(next=>{result=next;onData(next.data);paint();}).finally(()=>{containers.forEach(node=>node.setAttribute('aria-busy','false'));pending=null;});
    return pending;
  }
  function mount(container) {
    host=container;
    host.innerHTML=`<div class="content-toolbar"><label class="content-search">검색<input type="search" data-content-search placeholder="제목 또는 카테고리 검색" value="${esc(filters.search)}"></label><label>제작 방식<select data-content-mode><option value="all">자동 + 수동</option><option value="auto">자동 생성</option><option value="manual">수동 생성</option></select></label><label>상태<select data-content-status><option value="all">전체 상태</option><option value="working">이어 만들기</option><option value="ready">완성 영상 있음</option><option value="published">업로드 완료</option><option value="attention">확인 필요</option></select></label><label>정렬<select data-content-sort><option value="recent">최근 저장순</option><option value="oldest">오래된순</option></select></label></div><div data-content-errors></div><p class="content-count" data-content-count role="status">콘텐츠를 불러오는 중이에요.</p><div class="content-list" data-content-rows></div>`;
    for(const key of ['search','mode','status','sort']) {
      const input=host.querySelector(`[data-content-${key}]`);input.value=filters[key];
      input.addEventListener(key==='search'?'input':'change',()=>{filters[key]=input.value;paint();});
    }
    paint();return refresh();
  }
  return {mount,refresh,mountHome(container){home=container;paint();return refresh();}};
}
