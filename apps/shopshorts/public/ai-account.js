import {connectLlm} from './llm-connection.js';

export const AI_ACCOUNT_PANEL = '<div><h2 data-ai-title>AI 계정을 연결하세요</h2><p data-ai-description></p><small data-ai-note>직접 기획하고 편집하는 작업은 연결 없이도 할 수 있어요.</small></div><div class="ai-onboarding-actions"><button type="button" data-ai-connect>AI 계정 연결</button><a data-ai-continue href="/studio" hidden>제작 방식 선택</a><button type="button" data-ai-retry hidden>다시 확인</button><button type="button" data-ai-later>나중에</button></div><p data-ai-error role="status" hidden></p>';

// Only status is read on arrival. Provider authorization always requires a click.
export function mountAiAccount({document=globalThis.document, window=globalThis.window, fetcher=globalThis.fetch, connect=connectLlm}={}) {
  const entries=[...document.querySelectorAll('[data-ai-account]')], panel=document.querySelector('[data-ai-onboarding]');
  if (!panel || !entries.length) return;
  const el=name=>panel.querySelector(`[data-ai-${name}]`);
  if(!el('title'))panel.innerHTML=AI_ACCOUNT_PANEL;
  panel.classList.add('ai-onboarding');
  panel.setAttribute('aria-label','AI 계정 연결');
  let justConnected=false;
  let status=null, error='', loading=false, managing=false, dismissed=false, revision=0, checkedAt=0;
  function render() {
    const connected=status?.connected===true, pending=status?.job?.kind==='connect'&&['queued','running'].includes(status.job.state);
    const provider=status?.provider==='claude'?'Claude':status?.provider==='codex'?'Codex':'AI';
    const offline=status?.available===false;
    const label=error?'AI · 확인 필요':loading&&!status?'AI 확인 중…':pending?'AI · 연결 중':connected?`${provider} · ${offline?'일시 중단':'연결됨'}`:'AI 계정 연결';
    for (const entry of entries) {entry.textContent=label;entry.disabled=managing||(loading&&!status);entry.dataset.state=error?'error':connected?'connected':'disconnected';}
    panel.hidden=dismissed||(!error&&!pending&&connected&&!offline&&!justConnected)||(loading&&!status);
    el('title').textContent=error?'AI 연결 상태를 확인하지 못했어요':pending?'AI 계정 연결을 마쳐주세요':offline?'AI 제작 서비스가 잠시 쉬고 있어요':connected?'AI와 제작할 준비가 됐어요':'AI 계정을 연결하세요';
    el('description').textContent=error?'연결 정보를 바꾸지 않았어요. 잠시 후 다시 확인해 주세요.':pending?'인증 창에서 승인을 마친 뒤 연결 상태를 확인하세요.':offline?'계정을 다시 연결하지 않아도 돼요. 서비스 상태를 다시 확인해 주세요.':connected?`${provider} 계정으로 아이디어와 대본을 만들어보세요.`:'Codex 또는 Claude 구독으로 아이디어와 대본을 만들어요.';
    el('connect').textContent=pending?'인증 이어하기':connected?'연결 관리':'AI 계정 연결';
    el('connect').hidden=!!error||(connected&&!offline&&!pending);
    el('continue').hidden=!connected||offline||!!error||pending;
    el('connect').disabled=managing||loading;
    el('retry').hidden=!error&&!offline;
    el('retry').disabled=loading||managing;
    el('error').hidden=!error;
    el('error').textContent=error;
  }
  async function refresh() {
    const current=++revision;loading=true;render();
    try {
      const response=await fetcher('/api/studio/llm/status',{cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(current!==revision)return;
      if(response.status===401){window.location.assign('/login');return;}
      if(!response.ok)throw Error('연결 상태를 다시 확인해 주세요.');
      const next=await response.json();
      if(typeof next.connected!=='boolean'||typeof next.available!=='boolean')throw Error('연결 상태를 다시 확인해 주세요.');
      if(current!==revision)return;
      status=next;error='';checkedAt=Date.now();
    } catch {if(current===revision)error='AI 상태 조회에 실패했어요. 편집한 내용은 유지됩니다.';}
    finally {if(current===revision){loading=false;render();}}
  }
  async function manage() {
    if(managing)return;
    if(error){dismissed=false;return refresh();}
    const wasConnected=status?.connected;let failed=false;managing=true;render();
    try {const ready=await connect({manage:true});if(ready&&!wasConnected){justConnected=true;dismissed=false;}}
    catch {failed=true;dismissed=false;}
    finally {managing=false;await refresh();if(failed){error='AI 연결 화면을 열지 못했어요. 다시 확인해 주세요.';render();}}
  }
  entries.forEach(entry=>entry.addEventListener('click',manage));
  el('connect').addEventListener('click',manage);
  el('retry').addEventListener('click',refresh);
  el('later').addEventListener('click',()=>{dismissed=true;render();});
  window.addEventListener('llm-account-change',()=>{dismissed=false;refresh();});
  window.addEventListener('pageshow',refresh);
  window.addEventListener('focus',()=>{if(!loading&&!managing&&Date.now()-checkedAt>15000)refresh();});
  refresh();
  return {refresh};
}
if(typeof document!=='undefined')mountAiAccount();
