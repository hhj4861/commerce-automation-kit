const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stages = {
  account: ['AI 계정을 확인하고 있어요', '연결 확인 후 추천을 시작합니다.', 0],
  authorization: ['계정 연결을 기다리고 있어요', '인증 화면에서 연결을 마쳐 주세요.', 0],
  queued: ['곧 추천을 시작해요', '요청이 접수됐어요. 순서가 되면 생성을 시작합니다.', 1],
  running: ['자료를 찾고 기획을 만들고 있어요', '검색과 생성이 끝나면 이곳에 3가지 제안을 한 번에 보여드려요.', 2],
  done: ['마음에 드는 기획을 골라보세요', '적용한 뒤에도 내용을 자유롭게 수정할 수 있어요.', 3],
};

// One continuous surface from request to selection; provider authentication uses
// its own native dialog while this dialog is temporarily closed.
export function createRecommendationFocus({ input, anchor, summary, onCancel, onApply, onRetry, onBackground = () => {} }) {
  const kind = input.focus === 'topic' ? '이야기' : '분위기';
  const started = Date.now();
  let pending = true, disposed = false, backgrounded = false, result = null, currentStage = null, currentProvider = null;
  const dialog = document.createElement('dialog');
  dialog.className = 'recommend-dialog';
  dialog.setAttribute('aria-labelledby', `recommend-title-${input.focus}`);
  dialog.innerHTML = `<header class="recommend-dialog-head"><div><p class="recommend-context">${escape(input.category)} <span>${input.format === 'short' ? '숏폼' : '롱폼'} / ${input.duration}초</span><span data-provider></span></p><h2 id="recommend-title-${input.focus}" tabindex="-1">${kind} 3가지를 제안할게요</h2></div><button class="recommend-dismiss" type="button" aria-label="추천 창 닫기">×</button></header>
    <div class="recommend-dialog-scroll"><section class="recommend-activity" aria-label="추천 진행 상황"><div class="recommend-activity-top"><strong role="status" data-stage-title></strong><span class="recommend-clock" data-clock aria-label="경과 시간">0초 경과</span></div><p data-stage-detail></p><ol class="recommend-flow" aria-label="추천 진행 순서">${['계정 확인','요청 대기','검색 · 생성','결과 선택'].map((label,i)=>`<li><span>${i+1}</span>${label}</li>`).join('')}</ol></section>
    <section class="recommend-deliverable"><h3>어떤 결과를 받나요?</h3><div class="recommend-deliverable-grid"><div><strong>${kind} 3가지</strong><p>${input.focus === 'topic' ? '영상으로 만들 이야기와 핵심 소재' : '입력한 이야기에 어울리는 서로 다른 연출'}</p></div><div><strong>바로 쓸 연출 방향</strong><p>말투, 장면 구성, 영상 분위기</p></div><div><strong>추천 근거와 출처</strong><p>선택한 카테고리의 최근 검색 자료</p></div></div><p class="recommend-timing" data-timing>검색 범위에 따라 시간이 달라져요. 완료되면 결과로 자동 전환됩니다.</p></section>
    <section class="recommend-results" aria-label="LLM 추천 결과" hidden></section></div>
    <footer class="recommend-dialog-foot"><span data-footer-note>닫아도 계속 생성돼요. 완료되면 알림함에 알려드려요.</span><div class="recommend-footer-actions"><button class="quiet recommend-stop" type="button">생성 취소</button><button class="secondary recommend-cancel" type="button">닫고 계속하기</button></div></footer>`;
  anchor.closest('.field').append(dialog);
  const title = dialog.querySelector('h2');
  const clock = dialog.querySelector('[data-clock]');
  const content = dialog.querySelector('.recommend-dialog-scroll');
  const results = dialog.querySelector('.recommend-results');
  const stop = () => clearInterval(timer);
  const open = (explicit = false) => {
    if (explicit) backgrounded = false;
    if (backgrounded) return;
    if (disposed || !dialog.isConnected || dialog.open) return;
    dialog.showModal(); content.scrollTop = 0; title.focus();
  };
  const close = () => { if (dialog.open) dialog.close(); if (anchor.isConnected) anchor.focus({ preventScroll: true }); };
  const dismiss = () => { backgrounded = true; close(); if (pending) onBackground(); };
  dialog.querySelector('.recommend-stop').onclick = () => { onCancel(); close(); };
  dialog.querySelector('.recommend-dismiss').onclick = dismiss;
  dialog.querySelector('.recommend-cancel').onclick = dismiss;
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  const elapsed = () => Math.floor((Date.now() - started) / 1000);
  const tick = () => {
    if (!dialog.isConnected) { stop(); return; }
    clock.textContent = `${elapsed()}초 ${pending ? '경과' : '소요'}`;
    if (pending && elapsed() >= 60 && currentStage === 'running') dialog.querySelector('[data-timing]').textContent = '검색·기획 생성이 계속 진행 중이에요. 완료되면 여기서 바로 비교할 수 있어요.';
  };
  const timer = setInterval(tick, 1000);
  function update({ stage, provider }) {
    if (disposed || !stages[stage] || stage === 'done') return;
    if (currentStage === stage && currentProvider === provider) return;
    currentStage = stage; currentProvider = provider;
    if (provider) dialog.querySelector('[data-provider]').textContent = provider === 'claude' ? 'Claude' : 'Codex';
    const [heading, detail, index] = stages[stage];
    dialog.querySelector('[data-stage-title]').textContent = heading;
    dialog.querySelector('[data-stage-detail]').textContent = detail;
    dialog.dataset.state = stage;
    summary.hidden = false; summary.dataset.state = stage;
    summary.replaceChildren();
    const progressButton = document.createElement('button'); progressButton.type = 'button'; progressButton.className = 'recommend-reopen';
    progressButton.textContent = `${kind} 추천 ${stage === 'authorization' ? '연결 대기' : '진행 중'} · 진행 보기`;
    progressButton.onclick = () => open(true); summary.append(progressButton);
    dialog.querySelectorAll('.recommend-flow li').forEach((item, i) => {
      item.className = i < index ? 'done' : i === index ? 'active' : '';
      if (i === index) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
      item.querySelector('span').textContent = i < index ? '✓' : String(i + 1);
    });
    if (stage === 'authorization') { if (dialog.open) dialog.close(); }
    else open();
  }
  function finishControls() {
    pending = false; stop(); tick();
    dialog.querySelector('.recommend-stop').hidden = true;
    dialog.querySelector('.recommend-dismiss').setAttribute('aria-label', '추천 창 닫기');
    dialog.querySelector('.recommend-cancel').textContent = '닫기';
  }
  function complete(data, { saved = false, elapsedMs } = {}) {
    if (disposed) return;
    result = data; finishControls();
    dialog.dataset.state = 'done'; summary.dataset.state = 'done';
    title.textContent = `${kind} ${data.suggestions.length}가지가 준비됐어요`;
    dialog.querySelector('.recommend-activity').hidden = true;
    dialog.querySelector('.recommend-deliverable').hidden = true;
    dialog.querySelector('[data-footer-note]').textContent = `${data.provider === 'claude' ? 'Claude' : 'Codex'} · ${saved ? (Number.isFinite(elapsedMs) ? Math.floor(elapsedMs / 1000)+'초 소요' : '저장된 결과') : elapsed()+'초 소요'} · 적용 전까지 입력 내용은 유지됩니다.`;
    results.hidden = false;
    results.innerHTML = `<p class="recommend-results-intro">마음에 드는 제안을 골라 적용하세요. 자세한 연출과 근거도 펼쳐볼 수 있어요.</p><div class="recommendation-list">${data.suggestions.map((item,i)=>`<article class="recommendation-card"><h3>${input.focus === 'direction' ? escape(item.direction) : escape(item.topic)}</h3><div class="recommendation-actions">${input.focus === 'topic' ? `<button class="primary" data-apply-recommendation="${i}" data-fields="both">주제·분위기 적용</button><button class="quiet" data-apply-recommendation="${i}" data-fields="topic">주제만 적용</button>` : `<button class="primary" data-apply-recommendation="${i}" data-fields="direction">이 분위기 적용</button>`}</div><details><summary>전체 제안과 추천 이유</summary><h4>이야기</h4><p>${escape(item.topic)}</p><h4>연출 방향</h4><p>${escape(item.direction)}</p><h4>추천 이유</h4><p>${escape(item.reason)}</p></details></article>`).join('')}</div><details class="recommendation-sources"><summary>참고한 검색 출처 ${data.sources.length}개</summary><p>${escape(new Date(data.checkedAt).toLocaleString('ko-KR'))} 기준. 검색량 순위를 뜻하지 않습니다.</p><ul>${data.sources.map(source=>`<li><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.title)}</a></li>`).join('')}</ul></details>`;
    results.querySelectorAll('[data-apply-recommendation]').forEach(button => button.onclick = () => {
      close(); onApply(result.suggestions[Number(button.dataset.applyRecommendation)], button.dataset.fields);
    });
    summary.replaceChildren();
    const reopen = document.createElement('button'); reopen.type = 'button'; reopen.className = 'recommend-reopen';
    reopen.textContent = `${kind} 추천 ${data.suggestions.length}개 다시 보기`; reopen.onclick = () => open(true); summary.append(reopen);
    open(); if (dialog.open) { content.scrollTop = 0; title.focus(); }
  }
  function fail(error) {
    if (disposed) return;
    finishControls();
    const cancelled = error.name === 'AbortError';
    summary.dataset.state = cancelled ? 'cancelled' : 'failed';
    summary.hidden = false; summary.textContent = cancelled ? '추천을 취소했어요. 입력 내용은 유지됩니다.' : '추천을 완료하지 못했어요. 다시 시도해 주세요.';
    if (cancelled) { close(); return; }
    dialog.dataset.state = 'failed'; title.textContent = '추천을 완료하지 못했어요';
    dialog.querySelector('.recommend-activity').hidden = true; dialog.querySelector('.recommend-deliverable').hidden = true;
    results.hidden = false; results.innerHTML = `<div class="recommend-failure"><p role="alert">${escape(error.message)}</p><p>입력 내용은 그대로예요. 연결 상태를 확인한 뒤 다시 시도하세요.</p><button class="primary" data-retry>다시 추천받기</button></div>`;
    dialog.querySelector('[data-footer-note]').textContent = '닫은 뒤 AI 계정 연결 관리에서 계정을 확인할 수 있어요.';
    results.querySelector('[data-retry]').onclick = () => { close(); onRetry(); };
    open(); if (dialog.open) title.focus();
  }
  update({ stage: 'account' });
  return { update, complete, fail, open: () => open(true), destroy() { disposed = true; stop(); if (dialog.open) dialog.close(); dialog.remove(); } };
}
