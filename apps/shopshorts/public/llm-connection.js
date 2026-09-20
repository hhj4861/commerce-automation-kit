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

export async function connectLlm({ signal, manage = false } = {}) {
  const status = await request('llm/status', undefined, signal);
  if (status.connected && !manage) return true;
  if (signal?.aborted) return false;
  const dialog = document.createElement('dialog'); dialog.className = 'llm-dialog';
  dialog.setAttribute('aria-labelledby', 'llm-dialog-title');
  document.body.append(dialog);
  let current = status, busy = false, finished = false, attempt = null, message = '', polling = false, authorizationCode = '';
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
      const providers = [{ id: 'codex', name: 'Codex', plan: 'ChatGPT 구독' }, { id: 'claude', name: 'Claude', plan: 'Claude 구독' }];
      dialog.innerHTML = `<div class="llm-dialog-head"><div><span class="badge">AI 계정</span><h2 id="llm-dialog-title">추천에 사용할 계정을 연결하세요</h2></div><button class="quiet" data-close aria-label="계정 연결 닫기">✕</button></div>
        <p class="muted">현재 로그인한 사용자에게만 연결됩니다. 인증은 제공사의 공식 화면에서 진행합니다.</p>
        <div class="llm-providers">${providers.map(provider => {
          const connected = current.connected && current.provider === provider.id;
          const connecting = pending && current.job.provider === provider.id;
          return `<section class="llm-provider ${connected ? 'connected' : ''}"><h3>${provider.name}<span>${provider.plan}</span></h3><p>${connected ? escape(current.account) + ' · 연결됨' : `${provider.plan} 계정으로 로그인하고 구독 사용량으로 추천받습니다.`}</p>${connected ? '<button class="secondary" data-disconnect>연결 해제</button>' : `<button class="primary" data-connect="${provider.id}" ${busy || pending || current.connected || !current.available ? 'disabled' : ''}>${connecting ? '인증 대기 중…' : `${provider.name} 연결`}</button>`}</section>`;
        }).join('')}</div>
        ${current.connected ? '<p class="hint">다른 제공사를 사용하려면 현재 연결을 해제한 뒤 새 계정을 연결하세요.</p>' : ''}
        ${!current.available ? '<p role="status" class="llm-error">LLM 실행기가 오프라인입니다. 실행기가 연결되면 인증과 추천을 진행할 수 있습니다.</p>' : ''}
        ${pending ? `<section class="llm-device" aria-label="${current.job.provider === 'claude' ? 'Claude' : 'Codex'} 인증"><h3>${device ? '공식 인증 화면에 코드를 입력하세요' : manual ? 'Claude 인증 후 받은 코드를 입력하세요' : '인증 요청을 준비하고 있습니다…'}</h3>${device ? `<p class="llm-code">${escape(device.code)}</p><a class="primary" href="${escape(device.url)}" target="_blank" rel="noopener noreferrer">ChatGPT 인증 화면 열기 ↗</a><p class="hint">이 창은 그대로 두세요. 인증이 끝나면 추천을 이어서 진행합니다. 토큰을 복사하거나 붙여넣을 필요가 없습니다.</p>` : ''}${manual ? `<a class="primary" href="${escape(manual.url)}" target="_blank" rel="noopener noreferrer">Claude 인증 화면 열기 ↗</a><p class="hint">공식 화면에서 로그인한 뒤 표시되는 일회용 인증 코드를 복사하세요. API 키나 access/refresh 토큰을 입력하지 마세요.</p><form id="llm-code-form"><label for="llm-authorization-code">일회용 인증 코드</label><input id="llm-authorization-code" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="2600" ${current.job.codeSubmitted || busy ? 'disabled' : ''}><button class="primary" type="submit" ${current.job.codeSubmitted || busy ? 'disabled' : ''}>${current.job.codeSubmitted ? '인증 확인 중…' : '코드 확인 · 연결'}</button></form>` : ''}<button class="quiet" data-cancel>연결 취소</button></section>` : ''}
        <p class="llm-error" role="alert">${escape(message || (current.job?.state === 'failed' ? current.job.error : ''))}</p>
        <div class="actions"><button class="secondary" data-refresh ${busy ? 'disabled' : ''}>연결 상태 다시 확인</button><button class="primary" data-continue ${!current.connected || busy ? 'disabled' : ''}>${manage ? '확인' : '연결된 계정으로 추천받기'}</button></div>`;
      dialog.querySelector('[data-close]').onclick = () => close(false);
      dialog.querySelector('[data-continue]').onclick = () => close(true);
      dialog.querySelector('[data-refresh]').onclick = () => run(async () => { current = await request('llm/status', undefined, lifetime.signal); if (current.job?.kind === 'connect' && ['queued', 'running'].includes(current.job.state)) { attempt = current.job.id; poll(); } });
      for (const connect of dialog.querySelectorAll('[data-connect]')) connect.onclick = () => run(async () => { authorizationCode = ''; const next = await request('llm/connect', { provider: connect.dataset.connect }); current = { ...current, ...next }; attempt = next.job?.kind === 'connect' ? next.job.id : null; if (finished && attempt) await request('llm/cancel', { id: attempt }); else poll(); });
      const disconnect = dialog.querySelector('[data-disconnect]');
      if (disconnect) disconnect.onclick = () => run(async () => { current = { ...current, ...await request('llm/disconnect', {}, lifetime.signal) }; });
      const cancel = dialog.querySelector('[data-cancel]');
      if (cancel) cancel.onclick = () => run(async () => { current = { ...current, ...await request('llm/cancel', { id: current.job.id }, lifetime.signal) }; attempt = null; });
      const codeInput = dialog.querySelector('#llm-authorization-code');
      if (codeInput) {
        codeInput.value = authorizationCode;
        codeInput.oninput = () => { authorizationCode = codeInput.value; };
        if (codeFocus) { codeInput.focus(); codeInput.setSelectionRange(selection, selection); }
        dialog.querySelector('#llm-code-form').onsubmit = event => {
          event.preventDefault(); const code = authorizationCode.trim();
          if (!code) { message = '일회용 인증 코드를 입력하세요.'; render(); return; }
          authorizationCode = ''; codeInput.value = '';
          run(async () => { current = { ...current, ...await request('llm/code', { id: current.job.id, code }, lifetime.signal) }; });
        };
      }
    }
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(false); });
    render(); dialog.showModal();
    if (current.job?.kind === 'connect' && ['queued', 'running'].includes(current.job.state)) { attempt = current.job.id; poll(); }
  });
}

export async function recommendWithAccount(input, signal) {
  if (!await connectLlm({ signal })) throw new DOMException('취소됨', 'AbortError');
  const initial = await request('recommendations', input), id = initial.job?.id;
  if (!id) throw Error('추천 요청을 시작하지 못했습니다. 다시 시도하세요.');
  let done = false;
  try {
    while (!signal?.aborted) {
      await pause(signal);
      const current = await request('llm/status', undefined, signal);
      if (current.job?.id !== id) throw Error('추천 요청이 다른 창에서 변경됐습니다. 다시 시도하세요.');
      if (current.job.state === 'done') { done = true; return current.job.result; }
      if (current.job.state === 'failed') { done = true; throw Error(current.job.error); }
      if (!current.available) throw Error('LLM 실행기 연결이 끊겼습니다. 연결 상태를 확인하고 다시 시도하세요.');
    }
    throw new DOMException('취소됨', 'AbortError');
  } finally { if (!done) request('llm/cancel', { id }).catch(() => {}); }
}
