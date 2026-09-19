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
  let current = status, busy = false, finished = false, attempt = null, message = '', polling = false;
  const lifetime = new AbortController();
  return new Promise(resolve => {
    async function close(connected = false) {
      if (finished) return;
      finished = true; lifetime.abort(); signal?.removeEventListener('abort', aborted);
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
      dialog.innerHTML = `<div class="llm-dialog-head"><div><span class="badge">AI 계정</span><h2 id="llm-dialog-title">추천에 사용할 계정을 연결하세요</h2></div><button class="quiet" data-close aria-label="계정 연결 닫기">✕</button></div>
        <p class="muted">현재 로그인한 사용자에게만 연결됩니다. 인증은 제공사의 공식 화면에서 진행합니다.</p>
        <div class="llm-providers"><section class="llm-provider ${current.connected ? 'connected' : ''}"><h3>Codex <span>ChatGPT 구독</span></h3><p>${current.connected ? escape(current.account) + ' · 연결됨' : 'ChatGPT 계정으로 로그인하고 구독 사용량으로 추천받습니다.'}</p>
        ${current.connected ? '<button class="secondary" data-disconnect>연결 해제</button>' : `<button class="primary" data-connect ${busy || pending || !current.available ? 'disabled' : ''}>${pending ? '인증 대기 중…' : 'Codex 연결'}</button>`}</section>
        <section class="llm-provider"><h3>Claude <span>공식 API 연결 필요</span></h3><p>Claude 구독 OAuth 토큰은 이 앱에서 수집·저장할 수 없습니다.</p><a href="https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use" target="_blank" rel="noopener noreferrer">지원되는 인증 방식 확인 ↗</a></section></div>
        ${!current.available ? '<p role="status" class="llm-error">LLM 실행기가 오프라인입니다. 실행기가 연결되면 인증과 추천을 진행할 수 있습니다.</p>' : ''}
        ${pending ? `<section class="llm-device" aria-label="Codex 인증"><h3>${device ? '공식 인증 화면에 코드를 입력하세요' : '인증 요청을 준비하고 있습니다…'}</h3>${device ? `<p class="llm-code">${escape(device.code)}</p><a class="primary" href="${escape(device.url)}" target="_blank" rel="noopener noreferrer">ChatGPT 인증 화면 열기 ↗</a><p class="hint">이 창은 그대로 두세요. 인증이 끝나면 추천을 이어서 진행합니다. 토큰을 복사하거나 붙여넣을 필요가 없습니다.</p>` : ''}<button class="quiet" data-cancel>연결 취소</button></section>` : ''}
        <p class="llm-error" role="alert">${escape(message || (current.job?.state === 'failed' ? current.job.error : ''))}</p>
        <div class="actions"><button class="secondary" data-refresh ${busy ? 'disabled' : ''}>연결 상태 다시 확인</button><button class="primary" data-continue ${!current.connected || busy ? 'disabled' : ''}>${manage ? '확인' : '연결된 계정으로 추천받기'}</button></div>`;
      dialog.querySelector('[data-close]').onclick = () => close(false);
      dialog.querySelector('[data-continue]').onclick = () => close(true);
      dialog.querySelector('[data-refresh]').onclick = () => run(async () => { current = await request('llm/status', undefined, lifetime.signal); if (current.job?.kind === 'connect' && ['queued', 'running'].includes(current.job.state)) { attempt = current.job.id; poll(); } });
      const connect = dialog.querySelector('[data-connect]');
      if (connect) connect.onclick = () => run(async () => { const next = await request('llm/connect', { provider: 'codex' }); current = { ...current, ...next }; attempt = next.job?.kind === 'connect' ? next.job.id : null; if (finished && attempt) await request('llm/cancel', { id: attempt }); else poll(); });
      const disconnect = dialog.querySelector('[data-disconnect]');
      if (disconnect) disconnect.onclick = () => run(async () => { current = { ...current, ...await request('llm/disconnect', {}, lifetime.signal) }; });
      const cancel = dialog.querySelector('[data-cancel]');
      if (cancel) cancel.onclick = () => run(async () => { current = { ...current, ...await request('llm/cancel', { id: current.job.id }, lifetime.signal) }; attempt = null; });
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
