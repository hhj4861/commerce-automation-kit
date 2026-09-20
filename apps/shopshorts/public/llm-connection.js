const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function request(path, body, signal) {
  const response = await fetch('/api/studio/' + path, { signal, ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
  if (response.status === 401) { location.href = '/login'; throw Error('로그인이 필요합니다.'); }
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'LLM 연결을 확인하지 못했습니다.');
  return data;
}
function pause(signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('취소됨', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, 1500);
    signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
  });
}

export async function connectLlm({ signal, manage = false, onProgress = () => {} } = {}) {
  onProgress({ stage: 'account' });
  const status = await request('llm/status', undefined, signal);
  if (status.connected && !manage) return true;
  if (signal?.aborted) return false;
  onProgress({ stage: 'authorization' });
  const dialog = document.createElement('dialog'); dialog.className = 'llm-dialog';
  dialog.setAttribute('aria-labelledby', 'llm-dialog-title');
  document.body.append(dialog);
  let current = status, busy = false, finished = false, attempt = null, message = '', polling = false, authorizationCode = '', copyState = '';
  const lifetime = new AbortController();
  return new Promise(resolve => {
    async function close(connected = false) {
      if (finished) return;
      finished = true; authorizationCode = ''; lifetime.abort(); signal?.removeEventListener('abort', aborted);
      if (!connected && attempt) request('llm/cancel', { id: attempt }).catch(() => {});
      dialog.close(); dialog.remove(); resolve(connected);
    }
    const aborted = () => close(false);
    signal?.addEventListener('abort', aborted, { once: true });
    const run = async fn => {
      if (busy || finished) return; busy = true; message = ''; render();
      try { await fn(); } catch (e) { if (!finished) message = e.message; }
      finally { busy = false; if (!finished) render(); }
    };
    async function poll() {
      if (polling) return; polling = true;
      try {
        while (!finished && attempt) {
          await pause(lifetime.signal);
          const next = await request('llm/status', undefined, lifetime.signal);
          if (next.job?.id !== attempt) { attempt = null; current = next; message = '연결 요청이 취소되거나 다른 창에서 변경됐습니다.'; render(); break; }
          current = next;
          if (next.connected && next.job.state === 'done') { attempt = null; await close(true); break; }
          if (next.job.state === 'failed') { message = next.job.error; attempt = null; }
          render();
        }
      } catch (e) { if (!finished) { message = e.message; render(); } }
      finally { polling = false; }
    }
    function render() {
      const pending = current.job?.kind === 'connect' && ['queued', 'running'].includes(current.job.state);
      const device = pending ? current.job.device : null;
      const manual = pending ? current.job.manual : null;
      const focusedCode = dialog.querySelector('#llm-authorization-code');
      const codeFocus = document.activeElement === focusedCode;
      const selection = focusedCode?.selectionStart;
      const selectionEnd = focusedCode?.selectionEnd;
      const focusedAction = document.activeElement?.closest('[data-focus]')?.dataset.focus;
      const providers = [{ id: 'codex', name: 'Codex', plan: 'ChatGPT 구독' }, { id: 'claude', name: 'Claude', plan: 'Claude 구독' }];
      const selected = providers.find(provider => provider.id === (pending ? current.job.provider : current.provider));
      const mark = provider => `<span class="llm-mark llm-mark-${provider.id}" aria-hidden="true">${provider.id === 'codex' ? 'C<span>↗</span>' : '✳'}</span>`;
      const error = message || (current.job?.state === 'failed' ? current.job.error : '');
      dialog.innerHTML = `<div class="llm-dialog-head"><h2 id="llm-dialog-title">${pending ? `${selected.name} 연결` : current.connected ? '연결된 AI 계정' : '어떤 AI와 함께할까요?'}</h2><button class="llm-close" data-close data-focus="close" aria-label="계정 연결 닫기">✕</button></div>
        <p class="llm-intro">${pending ? '로그인을 마치면 추천을 이어갈게요.' : current.connected ? '이 계정으로 영상 아이디어를 추천받아요.' : '사용 중인 구독 계정으로 아이디어를 추천받으세요.'}</p>
        ${!pending && !current.connected ? `<div class="llm-providers">${providers.map(provider => `<button class="llm-provider" data-connect="${provider.id}" data-focus="${provider.id}" aria-label="${provider.name} 연결" ${busy || !current.available ? 'disabled' : ''}>${mark(provider)}<span class="llm-provider-label"><strong>${provider.name}</strong><span>${provider.plan}</span></span><span class="llm-provider-action" aria-hidden="true">연결 <span>↗</span></span></button>`).join('')}</div>` : ''}
        ${current.connected && !pending ? `<section class="llm-connected">${mark(selected)}<div class="llm-provider-label"><strong>${selected.name} <span class="llm-connected-badge">연결됨</span></strong><span class="llm-account">${escape(current.account)}</span></div></section><div class="llm-manage"><button class="llm-text-button" data-disconnect data-focus="disconnect" ${busy ? 'disabled' : ''}>연결 해제</button><button class="llm-cta" data-continue data-focus="continue" ${busy ? 'disabled' : ''}>${manage ? '완료' : '추천받기'}</button></div>` : ''}
        ${!current.available ? '<p role="status" class="llm-error">LLM 실행기가 오프라인입니다. 잠시 후 다시 확인해 주세요.</p>' : ''}
        ${pending ? `<section class="llm-device" aria-label="${selected.name} 인증">
          ${device ? `<div class="llm-auth-step"><span class="llm-step-number">1</span><div><h3>인증 코드를 확인하세요</h3><div class="llm-code-row"><p class="llm-code" aria-label="인증 코드">${escape(device.code)}</p><button class="llm-copy" data-copy-code data-focus="copy" aria-label="인증 코드 복사" aria-busy="${copyState==='copying'}">${copyState==='copied'?'✓ 복사됨':'복사'}</button></div><span class="llm-copy-status" role="status">${copyState==='copied'?'인증 코드를 복사했어요.':''}</span></div></div><div class="llm-auth-step"><span class="llm-step-number">2</span><div><h3>ChatGPT에서 코드를 입력하세요</h3><a class="llm-cta" data-focus="authorize" href="${escape(device.url)}" target="_blank" rel="noopener noreferrer" aria-label="ChatGPT 인증 화면 열기 (새 창)">ChatGPT에서 계속 <span aria-hidden="true">↗</span></a></div></div><p class="llm-waiting" role="status"><span class="llm-status-dot"></span>인증을 기다리고 있어요</p>` : ''}
          ${manual ? `<div class="llm-auth-step"><span class="llm-step-number">1</span><div><h3>Claude에서 로그인하세요</h3><a class="llm-cta llm-cta-outline" data-focus="authorize" href="${escape(manual.url)}" target="_blank" rel="noopener noreferrer" aria-label="Claude 인증 화면 열기 (새 창)">Claude에서 계속 <span aria-hidden="true">↗</span></a></div></div><form id="llm-code-form" class="llm-auth-step"><span class="llm-step-number">2</span><div><label for="llm-authorization-code">받은 인증 코드를 붙여넣으세요</label><input id="llm-authorization-code" aria-label="일회용 인증 코드" aria-describedby="llm-code-hint" type="password" placeholder="인증 코드 붙여넣기" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="2600" ${current.job.codeSubmitted || busy ? 'disabled' : ''}><p id="llm-code-hint" class="llm-help">API 키가 아닌 일회용 코드예요.</p><button class="llm-cta" data-focus="submit" type="submit" ${current.job.codeSubmitted || busy ? 'disabled' : ''}>${current.job.codeSubmitted ? '연결 확인 중…' : '연결 완료'}</button></div></form>` : ''}
          ${!device && !manual ? '<p class="llm-waiting" role="status"><span class="llm-status-dot"></span>로그인 화면을 준비하고 있어요</p>' : ''}
          <button class="llm-text-button" data-cancel data-focus="cancel" ${busy ? 'disabled' : ''}>연결 취소</button></section>` : ''}
        ${error ? `<p class="llm-error" role="alert">${escape(error)}</p>` : ''}
        <footer class="llm-footer"><span>내 계정에만 안전하게 연결돼요</span>${!current.available || error ? `<button class="llm-text-button" data-refresh data-focus="refresh" ${busy ? 'disabled' : ''}>다시 확인</button>` : ''}</footer>`;
      dialog.querySelector('[data-close]').onclick = () => close(false);
      const continueButton = dialog.querySelector('[data-continue]');
      if (continueButton) continueButton.onclick = () => close(true);
      const refresh = dialog.querySelector('[data-refresh]');
      if (refresh) refresh.onclick = () => run(async () => { current = await request('llm/status', undefined, lifetime.signal); if (current.job?.kind === 'connect' && ['queued', 'running'].includes(current.job.state)) { attempt = current.job.id; poll(); } });
      for (const connect of dialog.querySelectorAll('[data-connect]')) connect.onclick = () => run(async () => { authorizationCode = ''; copyState = ''; const next = await request('llm/connect', { provider: connect.dataset.connect }); current = { ...current, ...next }; attempt = next.job?.kind === 'connect' ? next.job.id : null; if (finished && attempt) await request('llm/cancel', { id: attempt }); else poll(); });
      const copy = dialog.querySelector('[data-copy-code]');
      if (copy) copy.onclick = async () => {
        if (copyState === 'copying') return;
        const code = device.code; copyState = 'copying'; message = ''; render();
        try { await navigator.clipboard.writeText(code); copyState = 'copied'; }
        catch { copyState = ''; message = '복사할 수 없습니다. 코드를 직접 선택해 복사해 주세요.'; }
        if (!finished) render();
      };
      const disconnect = dialog.querySelector('[data-disconnect]');
      if (disconnect) disconnect.onclick = () => run(async () => { current = { ...current, ...await request('llm/disconnect', {}, lifetime.signal) }; });
      const cancel = dialog.querySelector('[data-cancel]');
      if (cancel) cancel.onclick = () => run(async () => { current = { ...current, ...await request('llm/cancel', { id: current.job.id }, lifetime.signal) }; attempt = null; });
      const codeInput = dialog.querySelector('#llm-authorization-code');
      if (codeInput) {
        codeInput.value = authorizationCode;
        codeInput.oninput = () => { authorizationCode = codeInput.value; };
        if (codeFocus) { codeInput.focus(); codeInput.setSelectionRange(selection, selectionEnd); }
        dialog.querySelector('#llm-code-form').onsubmit = event => {
          event.preventDefault(); const code = authorizationCode.trim();
          if (!code) { message = '일회용 인증 코드를 입력하세요.'; render(); return; }
          authorizationCode = ''; codeInput.value = '';
          run(async () => { current = { ...current, ...await request('llm/code', { id: current.job.id, code }, lifetime.signal) }; });
        };
      }
      if (!codeFocus && focusedAction) dialog.querySelector(`[data-focus="${focusedAction}"]`)?.focus({ preventScroll: true });
    }
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(false); });
    render(); dialog.showModal();
    if (current.job?.kind === 'connect' && ['queued', 'running'].includes(current.job.state)) { attempt = current.job.id; poll(); }
  });
}

export async function recommendWithAccount(input, signal, onProgress = () => {}) {
  if (!await connectLlm({ signal, onProgress })) throw new DOMException('취소됨', 'AbortError');
  onProgress({ stage: 'queued' });
  const initial = await request('recommendations', input), id = initial.job?.id;
  if (!id) throw Error('추천 요청을 시작하지 못했습니다. 다시 시도하세요.');
  return waitForRecommendation(id, signal, onProgress);
}

export async function waitForRecommendation(id, signal, onProgress = () => {}) {
  let done = false;
  try {
    while (!signal?.aborted) {
      await pause(signal);
      const current = await request('llm/status', undefined, signal);
      if (current.job?.id !== id) throw Error('추천 요청이 다른 창에서 변경됐습니다. 다시 시도하세요.');
      if (current.job.state === 'done') { done = true; onProgress({ stage: 'done', provider: current.provider }); return current.job.result; }
      if (current.job.state === 'failed') { done = true; throw Error(current.job.error); }
      onProgress({ stage: current.job.state === 'queued' ? 'queued' : 'running', provider: current.provider });
      if (!current.available) throw Error('LLM 실행기 연결이 끊겼습니다. 연결 상태를 확인하고 다시 시도하세요.');
    }
    throw new DOMException('취소됨', 'AbortError');
  } finally { if (!done && signal?.aborted && signal.reason === 'cancelled') await request('llm/cancel', { id }); }
}
