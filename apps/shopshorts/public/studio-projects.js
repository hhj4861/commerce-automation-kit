import {resumeStep} from './studio-status.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const steps = ['기획','시나리오','이미지 · 영상','편집','업로드'];
const tasks = {scenario:'시나리오 생성',media:'장면 생성',narration:'음성 생성',render:'영상 렌더',publish:'업로드'};
export function projectSummary(project) {
  const step = resumeStep(project), task = project.task;
  const done = project.upload?.state === 'done';
  const busy = ['queued','running'].includes(task?.state);
  const failed = task?.state === 'failed';
  const label = done ? '업로드 완료' : failed ? `${tasks[task.action] || '작업'} 확인 필요` : busy ? `${tasks[task.action] || '제작'} ${task.state === 'queued' ? '대기 중' : '중'}` : `${steps[step-1]} 단계`;
  return {step, done, tone: failed ? 'error' : busy ? 'active' : 'ready', label,
    action: done ? '완성 영상 보기' : busy ? '진행 상황 보기' : failed ? '확인하고 이어하기' : '이어서 만들기',
    href: `/studio?id=${encodeURIComponent(project.id)}`};
}
export function organizeProjects(projects) {
  const sorted = [...projects].sort((a,b) => (Date.parse(b.updatedAt)||0) - (Date.parse(a.updatedAt)||0));
  return {unfinished: sorted.filter(p => !projectSummary(p).done), completed: sorted.filter(p => projectSummary(p).done)};
}
function thumbnail(project) {
  const scene = project.scenes.find(scene => project.assets?.[scene.id]?.kind === 'image');
  return `<span class="resume-poster" aria-hidden="true">${scene ? `<img loading="lazy" alt="" src="/api/studio/${encodeURIComponent(project.id)}/assets/${encodeURIComponent(scene.id)}?v=${encodeURIComponent(project.revision)}">` : '<svg viewBox="0 0 48 60" fill="none"><rect x="8" y="2" width="32" height="56" rx="5" stroke="currentColor" stroke-width="2"/><path d="m20 21 13 9-13 9V21Z" fill="currentColor"/></svg>'}</span>`;
}
function updated(project) {
  const date = new Date(project.updatedAt);
  return Number.isNaN(date.getTime()) ? '' : `${date.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} 저장`;
}
function meta(project) {
  return `<span>${escape(project.brief.category)}</span><span>${project.brief.format === 'long' ? '롱폼' : '숏폼'}</span><span>${escape(updated(project))}</span>`;
}
function row(project) {
  const status = projectSummary(project);
  return `<a class="resume-row" href="${status.href}">${thumbnail(project)}<span class="resume-row-text"><strong>${escape(project.title)}</strong><span class="resume-meta">${meta(project)}</span></span><span class="resume-state" data-tone="${status.tone}">${escape(status.label)}</span><span class="resume-row-action">${status.action}</span></a>`;
}
export function renderProjects(projects, {compact = false} = {}) {
  const {unfinished, completed} = organizeProjects(projects), project = unfinished[0];
  if (!project) return `<div class="resume-empty"><div><h2>${completed.length ? '모든 영상을 완성했어요' : '첫 영상을 만들어보세요'}</h2><p>${completed.length ? '완성한 영상은 아래에서 다시 볼 수 있어요.' : '저장한 영상은 이곳에서 바로 이어 만들 수 있어요.'}</p></div><a class="resume-cta" href="/studio?new=1">새 영상 만들기</a></div>${completed.length ? `<details class="resume-archive"><summary>완성한 영상 ${completed.length}개</summary>${completed.map(row).join('')}</details>` : ''}`;
  const status = projectSummary(project);
  return `<div class="resume-section-head"><h2>만들던 영상 이어하기 <span>${unfinished.length}</span></h2><a href="/studio${compact ? '' : '?new=1'}">${compact ? '내 영상 전체 보기' : '새 영상 만들기'}</a></div>
    <article class="resume-feature">${thumbnail(project)}<div class="resume-copy"><span class="resume-state" data-tone="${status.tone}">${escape(status.label)}</span><h3>${escape(project.title)}</h3><div class="resume-meta">${meta(project)}</div><ol class="resume-steps" aria-label="제작 단계">${steps.map((name,i) => `<li ${i+1===status.step ? 'aria-current="step"' : ''} class="${i+1<status.step?'passed':''}"><span aria-hidden="true">${i+1<status.step?'✓':i+1}</span>${name}</li>`).join('')}</ol></div><a class="resume-cta" href="${status.href}" aria-label="${escape(project.title)} — ${status.action}">${status.action}</a></article>
    ${unfinished.length > 1 ? `<div class="resume-others">${unfinished.slice(1,compact?3:undefined).map(row).join('')}</div>` : ''}
    ${!compact && completed.length ? `<details class="resume-archive"><summary>완성한 영상 ${completed.length}개</summary>${completed.map(row).join('')}</details>` : ''}`;
}
export async function loadProjects(container, fetcher = fetch) {
  container.setAttribute('aria-busy','true');
  try {
    const response = await fetcher('/api/studio', {cache:'no-store',signal:AbortSignal.timeout(15000)});
    if (response.status === 401) {
      container.innerHTML = '<div class="resume-empty"><div><h2>만들던 영상 이어하기</h2><p>로그인하면 저장한 영상을 불러올 수 있어요.</p></div><a class="resume-cta" href="/login">로그인</a></div>'; return;
    }
    if (!response.ok) throw Error('load failed');
    const data = await response.json();
    if (!Array.isArray(data.projects)) throw Error('invalid project list');
    container.innerHTML = renderProjects(data.projects, {compact:container.dataset.studioProjects==='compact'});
  } catch {
    container.innerHTML = '<div class="resume-empty"><div><h2>만들던 영상 이어하기</h2><p role="alert">저장한 영상을 불러오지 못했어요.</p></div><button class="resume-cta" type="button" data-project-retry>다시 불러오기</button></div>';
    container.querySelector('[data-project-retry]').onclick = () => loadProjects(container, fetcher);
  } finally { container.setAttribute('aria-busy','false'); }
}
if (typeof document !== 'undefined') {
  const params = new URLSearchParams(location.search);
  for (const container of document.querySelectorAll('[data-studio-projects]')) {
    if (location.pathname === '/studio' && ['new','id','recommendation'].some(key => params.has(key))) container.hidden = true;
    else loadProjects(container);
  }
  window.addEventListener('pageshow', event => { if (event.persisted) for (const container of document.querySelectorAll('[data-studio-projects]')) loadProjects(container); });
}
