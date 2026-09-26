const names = {scenario:'시나리오 생성',media:'이미지·영상 생성',narration:'대본 음성 생성',render:'영상 렌더',publish:'업로드'};
const steps = {scenario:2,media:3,narration:4,render:4,publish:5};
export function resumeStep(project) {
  // An unfinished or failed task must reopen where its progress/result belongs.
  if(['queued','running','failed'].includes(project.task?.state) && steps[project.task.action])return steps[project.task.action];
  if(project.render || project.upload)return 5;
  // Generated scenes still need a human review, including after leaving the page.
  if(!project.scenes.length || !project.approved)return 2;
  return project.scenes.every(scene=>project.assets?.[scene.id])?4:3;
}
export function executionStatus({project,step,config,connectionUnknown=false}, now=Date.now()) {
  const task=project?.task, name=names[task?.action] || '제작';
  const active=['queued','running'].includes(task?.state);
  const scenario=active ? task.action==='scenario' : step===2;
  const account=config?.scenarioRuntime;
  const online=scenario ? account?.available && account?.scenarioAvailable : config?.execution!=='cloud-worker' || now-Date.parse(config?.capabilities?.workerAt)<=90000;
  if(task?.state==='failed')return {kind:'failed',title:`${name}을 완료하지 못했어요`,detail:task.error || '다시 시도해 주세요.',action:task.action==='scenario'?'retry':null};
  if((connectionUnknown || (scenario && account?.known===false)) && (active || step>=2))return {kind:'unknown',title:'진행 상태를 확인할 수 없어요',detail:'서버에 다시 연결하고 있어요. 요청을 다시 보내지 않아도 됩니다.',action:'refresh'};
  if(active) {
    if(!online)return {kind:'waiting',title:task.state==='running'?'생성기 연결을 확인하고 있어요':'연결 대기 · 아직 시작하지 않았어요',detail:task.state==='running'?'마지막 상태는 실행 중입니다. 연결이 복구되면 결과를 확인합니다.':'요청은 저장됐어요. 생성기가 연결되면 시작합니다.',action:'refresh'};
    if(task.state==='queued')return {kind:'queued',title:`${name} 순서를 기다리고 있어요`,detail:'아직 생성 전입니다. 창을 닫아도 요청은 유지됩니다.'};
    return {kind:'running',title:`${name} 중이에요`,detail:task.action==='scenario'?'대사와 장면 설명을 작성하고 있어요. 창을 닫아도 계속 진행됩니다.':task.action==='media'?`${project.scenes.filter(s=>project.assets[s.id]).length}/${project.scenes.length}장면 준비됐어요.`:'창을 닫아도 계속 진행됩니다.'};
  }
  if(task?.state==='done' && steps[task.action]===step)return {kind:'done',title:`${name}을 완료했어요`,detail:scenario?`${project.scenes.length}개 장면을 확인하고 다듬어 주세요.`:task.action==='narration'?'가운데 재생 버튼으로 대본 음성을 들어보세요.':'결과를 확인한 뒤 다음 단계로 진행하세요.'};
  if(step===2 && account && !account.connected)return {kind:'waiting',title:'AI 계정을 연결해 주세요',detail:'Codex 또는 Claude 계정으로 시나리오를 만듭니다.',action:'connect'};
  if(step>=2 && !online)return {kind:'waiting',title:scenario?'AI 생성기 연결을 기다리고 있어요':'제작 서비스 연결을 기다리고 있어요',detail:'현재 생성은 시작되지 않습니다. 저장과 편집은 계속할 수 있어요.',action:'refresh'};
  return null;
}
const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderExecutionStatus(status) {
  if(!status)return '';
  const labels={retry:'다시 생성',connect:'AI 계정 연결',refresh:'연결 다시 확인'};
  return `<section class="execution-status" data-execution-state="${status.kind}" role="${status.kind==='failed'?'alert':'status'}"><span class="execution-symbol" aria-hidden="true">${status.kind==='done'?'✓':status.kind==='failed'?'!':status.kind==='running'?'◌':'Ⅱ'}</span><div><strong>${escape(status.title)}</strong><p>${escape(status.detail)}</p></div>${status.action?`<button class="secondary" data-execution-action="${status.action}">${labels[status.action]}</button>`:''}</section>`;
}
