const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function mediaFailureMessage(message = '') {
  if (/Google 생성 API 실패\((401|403)\)|미디어 생성 인증/.test(message)) return '이미지·영상 생성 서비스의 인증을 확인해 주세요. 관리자에게 설정 확인을 요청한 뒤 다시 시도하세요.';
  return message || '생성을 완료하지 못했어요. 준비된 장면은 유지됩니다. 미완료 장면만 다시 생성해 주세요.';
}

export function mediaProgress({project, config, connectionUnknown = false, requestingMedia = false, mediaRequestError = ''}, now = Date.now()) {
  const scenes = project.scenes, ready = scenes.filter(s => project.assets?.[s.id]).length;
  const task = project.task?.action === 'media' ? project.task : null;
  const active = ['queued','running'].includes(task?.state);
  const online = config?.execution !== 'cloud-worker' || now - Date.parse(config?.capabilities?.workerAt) <= 90000;
  let kind = 'idle', title = '장면을 만들 준비가 됐어요', detail = '이미지 또는 영상을 선택하고, 대본 검수 후 생성해 주세요.';
  if (requestingMedia) { kind='submitting'; title='생성 요청을 보내고 있어요'; detail='접수되면 창을 닫아도 계속 진행됩니다.'; }
  else if (mediaRequestError) { kind='failed'; title='생성 요청을 확인하지 못했어요'; detail=mediaFailureMessage(mediaRequestError); }
  else if (task?.state === 'failed') { kind='failed'; title='장면 생성이 중단됐어요'; detail=mediaFailureMessage(task.error); }
  else if (active && connectionUnknown) { kind='unknown'; title='진행 상태를 확인하고 있어요'; detail='요청을 다시 보내지 않아도 됩니다. 서버에 다시 연결하고 있어요.'; }
  else if (active && !online) { kind='waiting'; title='생성기 연결을 기다리고 있어요'; detail='요청은 저장돼 있어요. 연결이 복구되면 진행 상태를 확인합니다.'; }
  else if (active) {
    kind=task.state;
    title=kind==='queued'?'생성 순서를 기다리고 있어요':ready===scenes.length?'생성 결과를 확인하고 있어요':'장면을 만들고 있어요';
    detail=kind==='queued'?'아직 생성 전입니다. 창을 닫아도 요청은 유지됩니다.':'완성된 장면부터 여기에 표시됩니다. 창을 닫아도 계속 진행됩니다.';
  }
  else if (scenes.length && ready === scenes.length) { kind='done'; title='모든 장면이 준비됐어요'; detail='미리보기를 확인하고 편집으로 이어가세요.'; }
  else if (task?.state === 'done') { kind='incomplete'; title='아직 준비되지 않은 장면이 있어요'; detail='작업은 종료됐지만 일부 결과가 없습니다. 미완료 장면만 다시 생성해 주세요.'; }
  else if (ready) { title='남은 장면을 만들어 주세요'; detail='이미 준비된 장면은 유지됩니다.'; }
  return {kind,title,detail,ready,total:scenes.length,active,firstMissing:scenes.find(s=>!project.assets?.[s.id])?.id};
}

export function mediaSceneStatus(status, scene, asset) {
  if(asset)return {kind:'ready',label:'준비 완료'};
  if(status.kind==='submitting')return {kind:'waiting',label:'요청 접수 중'};
  if(status.kind==='running')return scene.id===status.firstMissing ? {kind:'running',label:'생성 처리 중'} : {kind:'waiting',label:'차례 대기'};
  if(['queued','waiting','unknown'].includes(status.kind))return {kind:'waiting',label:status.kind==='queued'?'차례 대기':'연결 확인 중'};
  if(status.kind==='failed')return {kind:'failed',label:scene.id===status.firstMissing?'생성 중단':'미생성'};
  return {kind:'idle',label:status.kind==='incomplete'?'결과 확인 필요':'생성 전'};
}

export function renderMediaPlaceholder(status, scene) {
  const item=mediaSceneStatus(status,scene);
  return `<div class="media-placeholder" data-media-state="${item.kind}"><span aria-hidden="true" class="media-placeholder-symbol">${item.kind==='running'?'◌':item.kind==='failed'?'!':scene.kind==='image'?'▧':'▷'}</span><strong>${item.label}</strong><small>${item.kind==='failed'?'위 안내를 확인해 주세요.':item.kind==='idle'?'생성하면 여기에 표시됩니다.':item.kind==='running'?'완성되면 자동으로 표시됩니다.':'완성된 장면부터 표시됩니다.'}</small></div>`;
}

export function renderMediaProgress(status) {
  const moving=['submitting','running'].includes(status.kind);
  const percent=status.total?status.ready/status.total*100:0;
  return `<section class="media-progress" data-media-progress="${status.kind}" aria-label="미디어 생성 진행 상태"><div class="media-progress-heading"><div role="${['failed','incomplete'].includes(status.kind)?'alert':'status'}"><strong>${esc(status.title)}</strong><p>${esc(status.detail)}</p></div><span class="media-progress-count">${status.ready}<small> / ${status.total}장면</small></span></div><div class="media-progress-track" role="progressbar" aria-label="저장된 장면" aria-valuemin="0" aria-valuemax="${status.total}" aria-valuenow="${status.ready}" aria-valuetext="${status.total}개 중 ${status.ready}개 저장"><span style="width:${percent}%"></span></div>${moving?'<div class="media-progress-activity" aria-hidden="true"><span></span></div>':''}</section>`;
}
