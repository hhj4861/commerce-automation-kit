const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export function renderInbox(data, { filter = 'all', error = '', busy = false } = {}) {
  const disabled = busy ? 'disabled' : '';
  const items = data?.items || [];
  const problems = error || data?.warning || (data?.queue?.dead ? '일부 알림을 가져오지 못했어요. 다시 처리해 주세요.' : '');
  return `<div class="page-head"><div><h1>알림함</h1><p>승인할 작업과 제작 결과를 확인하세요.</p></div><button class="mini-btn" data-inbox-action="refresh" ${disabled}>새로고침</button></div>
    <div class="inbox-toolbar"><div class="inbox-filters" role="group" aria-label="알림 필터">
      <button data-inbox-filter="all" aria-pressed="${filter === 'all'}" ${disabled}>전체</button>
      <button data-inbox-filter="unread" aria-pressed="${filter === 'unread'}" ${disabled}>안 읽음 <span>${data?.unreadCount ?? '—'}</span></button></div>
      <button class="mini-btn" data-inbox-action="read-all" ${busy || !data?.unreadCount ? 'disabled' : ''}>모두 읽음</button></div>
    ${data?.enabled === false ? '<p class="inbox-note">새 알림 숫자 표시를 껐어요. 알림은 계속 이곳에 보관됩니다.</p>' : ''}
    ${problems ? `<div class="inbox-error" role="alert">${escape(problems)} <button data-inbox-action="${data?.queue?.dead ? 'retry' : 'refresh'}" ${disabled}>다시 시도</button></div>` : ''}
    ${data?.queue?.pending || data?.queue?.inflight ? '<p class="inbox-note" role="status">새 알림을 정리하고 있어요.</p>' : ''}
    <div class="inbox-list" aria-busy="${busy}">${!data ? `<div class="inbox-empty" role="status">${error ? '알림을 표시할 수 없어요. 위의 다시 시도로 연결을 확인하세요.' : '알림을 불러오는 중이에요.'}</div>` : !items.length ? `<div class="inbox-empty"><h2>${filter === 'unread' ? '안 읽은 알림이 없어요' : '아직 도착한 알림이 없어요'}</h2><p>작업 확인이 필요하거나 제작이 끝나면 이곳에 알려드려요.</p></div>` : items.map(item => `<article class="inbox-row ${item.read ? 'is-read' : ''}">
      <span class="inbox-dot ${item.kind === 'error' ? 'is-error' : ''}" aria-label="${item.read ? '읽음' : '안 읽음'}"></span>
      <div class="inbox-copy"><strong>${escape(item.title)}</strong><p>${escape(item.name)}</p><time datetime="${escape(item.occurredAt)}">${escape(new Date(item.occurredAt).toLocaleString('ko-KR'))}</time></div>
      <div class="inbox-actions"><button class="mini-btn" data-inbox-open="${escape(item.id)}" ${disabled}>작업 보기</button><button class="inbox-read" data-inbox-read="${escape(item.id)}" ${disabled}>${item.read ? '안 읽음으로' : '읽음으로'}</button></div>
    </article>`).join('')}</div>
    ${data?.nextCursor ? `<button class="inbox-more mini-btn" data-inbox-action="more" ${disabled}>이전 알림 더 보기</button>` : ''}`;
}

export function createNotificationInbox({ document, fetcher = fetch, openJob, openStudio }) {
  let data = null, filter = 'all', error = '', busy = false, host = null, serial = 0, restoreFocus = null;
  const api = async (path = '', body) => {
    const response = await fetcher(`/api/notifications${path}`, { cache: 'no-store', signal: AbortSignal.timeout(10000), ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
    if (!response.ok) throw new Error(response.status === 401 ? '로그인이 만료됐어요. 다시 로그인해 주세요.' : '알림을 불러오지 못했어요. 다시 시도해 주세요.');
    return response.json();
  };
  const paint = () => {
    document.querySelectorAll('[data-notification-count]').forEach(badge => {
      badge.textContent = data ? String(data.unreadCount > 99 ? '99+' : data.unreadCount) : '';
      badge.hidden = !data?.enabled || !data?.unreadCount;
    });
    document.querySelectorAll('[data-top-action="notifications"]').forEach(button => button.setAttribute('aria-label', data?.enabled && data.unreadCount ? `알림함, 안 읽음 ${data.unreadCount}개` : '알림함'));
    document.querySelectorAll('[data-notification-preference]').forEach(button => {
      button.classList.toggle('on', data?.enabled === true);
      button.setAttribute('aria-checked', String(data?.enabled === true));
      button.disabled = busy || !data;
      button.onclick = () => mutate('/preferences', { enabled: !data.enabled });
    });
    if (host?.isConnected) {
      const html = renderInbox(data, { filter, error, busy });
      if (host.innerHTML !== html) {
        const active = document.activeElement;
        if (host.contains?.(active) && active?.dataset) restoreFocus = Object.entries(active.dataset).find(([key]) => key.startsWith('inbox')) || restoreFocus;
        host.innerHTML = html;
        if (!busy && restoreFocus) {
          const [key, value] = restoreFocus;
          const button = [...(host.querySelectorAll?.('button') || [])].find(el => el.dataset[key] === value)
            || host.querySelector?.('[data-inbox-filter="unread"]');
          button?.focus(); restoreFocus = null;
        }
      }
    }
  };
  async function refresh({ more = false, quiet = false, summaryOnly = false } = {}) {
    if (busy) return;
    const requestId = ++serial;
    if (!quiet) { busy = true; paint(); }
    try {
      const result = await api(`?filter=${filter}${more && data?.nextCursor ? `&before=${data.nextCursor}` : ''}`);
      if (requestId !== serial) return;
      data = summaryOnly && data ? { ...data, enabled: result.enabled, unreadCount: result.unreadCount, queue: result.queue, warning: result.warning }
        : more ? { ...result, items: [...data.items, ...result.items] } : result;
      error = '';
    } catch (e) { if (requestId === serial) error = e.message; }
    finally { if (requestId === serial) { busy = false; paint(); } }
  }
  async function mutate(path, body, after) {
    if (busy) return;
    ++serial; busy = true; error = ''; paint();
    try {
      await api(path, body);
      busy = false;
      await refresh();
      if (after) await after();
    } catch (e) { error = e.message; }
    finally { busy = false; paint(); }
  }
  async function click(event) {
    const button = event.target.closest('button');
    if (!button || button.disabled || busy) return;
    const { inboxFilter, inboxAction, inboxRead, inboxOpen } = button.dataset;
    if (inboxFilter) { filter = inboxFilter; data = data ? { ...data, items: [], nextCursor: null } : null; return refresh(); }
    if (inboxAction === 'refresh') return refresh();
    if (inboxAction === 'more') return refresh({ more: true });
    if (inboxAction === 'read-all') return mutate('/read-all', { throughSeq: data.throughSeq });
    if (inboxAction === 'retry') return mutate('/retry', {});
    const item = data?.items.find(x => x.id === (inboxRead || inboxOpen));
    if (!item) return;
    const go = () => item.source === 'job' ? openJob(item.sourceId) : openStudio(item.sourceId);
    if (inboxOpen && item.read) { try { await go(); } catch (e) { error = e.message; paint(); } return; }
    return mutate(`/${encodeURIComponent(item.id)}/read`, { read: inboxOpen ? true : !item.read }, inboxOpen ? go : undefined);
  }
  return {
    mount(element) { host = element; host.onclick = click; paint(); return refresh(); },
    unmount() { if (host) host.onclick = null; host = null; restoreFocus = null; },
    refresh, bindPreference: paint,
    // Keep an expanded history stable during background badge updates.
    poll() { return refresh({ quiet: true, summaryOnly: data?.items.length > 50 }); },
  };
}
