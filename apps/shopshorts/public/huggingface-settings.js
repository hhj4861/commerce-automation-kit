export const KANDINSKY_API='/api/studio/kandinsky';
export async function accountRequest(operation='account',options={}) {
  let response;
  try {response=await fetch(`${KANDINSKY_API}/${operation}`,{cache:'no-store',...options});}
  catch(e) {if(e.name==='AbortError')throw e;throw Error('Shopshorts 연결이 끊겼습니다. 입력과 접수 상태를 확인한 뒤 다시 시도하세요.');}
  let data;try{data=await response.json();}catch{throw Error('서버 응답을 확인하지 못했습니다. 연결 상태를 다시 확인하세요.');}
  if(!response.ok)throw Error(data.error || '요청을 처리하지 못했습니다.');
  return data;
}
class HuggingFaceSettings extends HTMLElement {
  connectedCallback() {
    if(this.shadowRoot)return;
    const root=this.attachShadow({mode:'open'});
    root.innerHTML=`<style>
      :host{display:block;color:var(--ink,#242622);font:inherit}*{box-sizing:border-box}[hidden]{display:none!important}
      h3{margin:0;font-size:19px;letter-spacing:-.03em}p{margin:8px 0;font-size:14px;line-height:1.65}header{display:flex;justify-content:space-between;gap:16px;align-items:start}
      .service{color:#686d65;font-size:13px}.badge{font-size:12px;font-weight:700;padding:6px 10px;border-radius:6px;background:#f1f2ed;white-space:nowrap}
      .summary{margin:20px 0;padding:20px;border-left:3px solid #a4a79f;background:#f7f7f4;border-radius:0 10px 10px 0}.summary[data-state=saved]{border-color:#277e64;background:#e7f4ee}.summary[data-state=unknown]{border-color:#a26800;background:#fff3d7}
      #state{margin:0;font-size:20px;letter-spacing:-.03em;font-weight:700}#description{margin-bottom:0}.meta{font-size:12px;color:#62685e}
      .actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}button,a{font:inherit}button,.primary{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border:1px solid #d4d8d1;border-radius:8px;padding:10px 14px;background:#fff;font-size:13px;font-weight:600;text-decoration:none;cursor:pointer;color:#242622}
      .primary{background:#277e64;border-color:#277e64;color:white}button:disabled{opacity:.55;cursor:wait}.quiet{border-color:transparent;background:transparent;color:#62685e;padding:8px 2px}.danger{color:#a32e22}
      a{color:#277e64}form{padding:20px 0 0;margin-top:20px;border-top:1px solid #e5e6df}label{display:block;font-size:14px;font-weight:600;margin-bottom:8px}input{display:block;width:100%;font:inherit;border:1px solid #adb3a8;border-radius:8px;padding:12px;background:white;margin:10px 0;min-height:44px}
      .help{font-size:12px;color:#62685e}.form-actions{margin-top:16px}.notice{padding:12px;border-radius:8px;background:#fbeae7;color:#922c24;font-size:13px}.delete-panel{margin-top:16px;padding:16px;border:1px solid #e7bdb8;border-radius:8px}
      footer{margin-top:20px;border-top:1px solid #e5e6df;padding-top:12px}footer p{font-size:12px;color:#62685e}summary{cursor:pointer;font-size:12px;color:#62685e}details p{font-size:12px}
      :is(input,button,a,summary):focus-visible{outline:3px solid #277e64;outline-offset:3px}
      @media(max-width:560px){header{flex-wrap:wrap}.summary{padding:16px}#state{font-size:18px}.actions{gap:8px}.primary{flex:1}input{font-size:16px}}
      .account-row{display:grid;grid-template-columns:minmax(0,1fr) 104px;align-items:center;gap:20px;min-height:96px;padding:18px 0;border-bottom:1px solid var(--line,#e5e6df)}
      .account-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.account-title h3{font-size:14px;font-weight:700;line-height:22px;letter-spacing:0}
      .account-copy{margin:5px 0 0;font-size:13px;line-height:22px;color:#62685e;overflow-wrap:anywhere}
      .badge{font-size:11px;line-height:18px;padding:2px 6px;font-weight:600}.badge[data-state=saved]{color:#20664f;background:#e7f4ee}.badge[data-state=unknown]{color:#805300;background:#fff3d7}
      #manage{width:104px;height:42px;min-height:42px;padding:10px 12px;font-size:13px;font-weight:600;line-height:20px;letter-spacing:0;white-space:nowrap;border:1px solid #d4d8d1;border-radius:8px;color:#242622;background:#fff}
      dialog{color:inherit;font:inherit;background:#fff;border:1px solid #d4d8d1;border-radius:16px;padding:24px;width:min(560px,calc(100% - 32px));max-height:calc(100dvh - 48px);overflow:auto;overscroll-behavior:contain;box-shadow:0 20px 70px #17211c33}
      dialog::backdrop{background:#17211c66}dialog header{align-items:center}dialog h2{font-size:18px;line-height:1.5;margin:0;letter-spacing:-.02em}#close{min-height:36px;padding:6px 12px}
      dialog .summary{margin:18px 0;padding:14px 16px}dialog #state{font-size:16px}dialog #description{font-size:13px}dialog footer{margin-top:16px}dialog footer p{margin-top:0}
      @media(max-width:560px){.account-row{gap:12px;min-height:96px}.account-title{gap:4px 8px}dialog{padding:20px}.account-copy{font-size:13px}dialog header{flex-wrap:nowrap}}
      </style>
      <div class="account-row"><div><div class="account-title"><h3>Kandinsky 영상 생성</h3><span class="badge" id="badge" role="status">확인 중</span></div><p class="account-copy" id="account-copy">Hugging Face 계정으로 영상을 생성합니다.</p></div><button id="manage" type="button" aria-haspopup="dialog" aria-controls="account-dialog">연결 관리</button></div>
      <dialog id="account-dialog" aria-labelledby="dialog-title"><header><h2 id="dialog-title">Kandinsky 연결 관리</h2><button id="close" type="button" autofocus>닫기</button></header>
      <section class="summary" id="summary" aria-live="polite" aria-atomic="true"><p id="state" role="status">저장 상태를 확인하고 있어요</p><p id="description">잠시만 기다려 주세요.</p><p class="meta" id="saved-at" hidden></p></section>
      <div class="actions"><a class="primary" id="generate" href="/kandinsky" hidden>영상 만들기</a><button id="replace" type="button" aria-expanded="false" aria-controls="token-form" hidden>토큰 교체</button><button class="quiet" id="retry" type="button">저장 상태 새로고침</button></div>
      <p class="notice" id="error" role="alert" hidden></p>
      <form id="token-form" hidden><label for="token" id="token-label">Hugging Face 읽기 토큰</label><p class="help" id="form-help">무료 계정의 읽기 토큰을 한 번만 등록하세요.</p><input id="token" type="password" autocomplete="off" spellcheck="false" placeholder="hf_로 시작하는 토큰 붙여넣기" required maxlength="203" aria-describedby="form-help">
      <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer">Hugging Face에서 읽기 토큰 만들기 ↗</a>
      <div class="actions form-actions"><button class="primary" id="save" type="submit">토큰 확인 후 저장</button><button id="cancel" type="button" hidden>취소</button></div></form>
      <div class="delete-panel" id="delete-panel" hidden><strong>저장된 토큰을 삭제할까요?</strong><p>다음 영상 생성 전에 토큰을 다시 등록해야 합니다. Hugging Face의 토큰 자체는 폐기되지 않습니다.</p><div class="actions"><button class="danger" id="confirm-delete" type="button">토큰 삭제</button><button id="cancel-delete" type="button">삭제 취소</button></div></div>
      <footer><p>토큰은 내 로그인 계정에 암호화해 저장되며, 영상 생성 시 자동으로 사용됩니다.</p><details><summary>보관 및 무료 사용 안내</summary><p>저장한 토큰 값은 다시 표시하지 않습니다. 무료 여부를 확인한 계정만 연결하며 유료 생성으로 전환하지 않습니다. 저장 완료는 영상 생성 성공을 뜻하지 않으며, 공식 데모의 가용량과 상태에 따라 생성이 제한될 수 있습니다.</p></details><button class="quiet danger" id="disconnect" type="button" hidden>저장된 토큰 삭제…</button></footer></dialog>`;
    const $=id=>root.querySelector(id);
    let busy=false,account=null,editing=false,deleting=false;
    const paint=()=>{
      const saved=account?.configured===true,known=account!==null;
      $('#summary').dataset.state=saved?'saved':known?'empty':'unknown';
      $('#badge').textContent=saved?'✓ 저장 완료':known?'등록 필요':'확인 필요';
      $('#badge').dataset.state=saved?'saved':known?'empty':'unknown';
      $('#account-copy').textContent=saved?`${account.name || 'Hugging Face'} 계정 · 저장된 토큰을 자동으로 사용합니다.`:'Hugging Face 계정으로 영상을 생성합니다.';
      $('#state').textContent=saved?'토큰이 안전하게 저장되어 있어요':known?'영상 생성에 사용할 계정을 연결하세요':'저장 여부를 확인하지 못했어요';
      $('#description').textContent=saved?`${account.name || 'Hugging Face'} 계정의 토큰을 자동으로 사용합니다. 다시 입력할 필요 없어요.`:known?'읽기 토큰을 등록하면 Kandinsky에서 바로 사용할 수 있어요.':'저장된 토큰이 없다는 뜻은 아닙니다. 저장 상태를 다시 확인해 주세요.';
      const date=new Date(account?.updatedAt);
      $('#saved-at').hidden=!saved||!account.updatedAt||!Number.isFinite(date.getTime());
      $('#saved-at').textContent=$('#saved-at').hidden?'':`마지막 저장 · ${date.toLocaleString('ko-KR')}`;
      $('#generate').hidden=!saved;$('#replace').hidden=!saved;$('#disconnect').hidden=!saved;
      $('#token-form').hidden=!known||(saved&&!editing);$('#cancel').hidden=!saved;
      $('#replace').setAttribute('aria-expanded',String(editing));
      $('#token-label').textContent=saved?'새 읽기 토큰':'Hugging Face 읽기 토큰';
      $('#form-help').textContent=saved?'새 토큰 확인과 저장이 완료되면 기존 토큰을 교체합니다.':'무료 계정의 읽기 토큰을 한 번만 등록하세요.';
      $('#save').textContent=saved?'새 토큰 확인 후 저장':'토큰 확인 후 저장';
      $('#delete-panel').hidden=!deleting;
    };
    const run=async(action,kind='read')=>{
      if(busy)return;busy=true;root.querySelectorAll('button,input').forEach(b=>b.disabled=true);$('#error').hidden=true;
      const label=kind==='save'?'토큰을 확인하고 저장하는 중…':kind==='delete'?'토큰을 삭제하는 중…':'저장 상태를 확인하는 중…';
      $('#state').textContent=label;
      try{account=await action();editing=false;deleting=false;paint();
        if(kind==='save')$('#state').textContent='토큰 저장이 완료됐어요';
        if(kind==='delete')$('#state').textContent='저장된 토큰을 삭제했어요';
      }catch(e){
        // A lost mutation response does not prove the token was (or was not) saved.
        if(kind!=='read'){try{account=await accountRequest();}catch{account=null;}}
        else account=null;
        deleting=false;paint();$('#error').textContent=e.message;$('#error').hidden=false;
      }finally{busy=false;root.querySelectorAll('button,input').forEach(b=>b.disabled=false);}
    };
    const dialog=$('#account-dialog');
    const close=()=>{if(busy)return;dialog.close();};
    $('#manage').addEventListener('click',()=>dialog.showModal());
    $('#close').addEventListener('click',close);
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    dialog.addEventListener('close',()=>{editing=false;deleting=false;$('#token').value='';paint();$('#manage').focus();});
    $('#token-form').addEventListener('submit',event=>{event.preventDefault();const token=$('#token').value.trim();
      if(busy)return;
      run(async()=>{try{return await accountRequest('account',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({token})});}finally{$('#token').value='';}},'save');
    });
    $('#replace').addEventListener('click',()=>{editing=true;deleting=false;paint();$('#token').focus();});
    $('#cancel').addEventListener('click',()=>{editing=false;$('#token').value='';paint();$('#replace').focus();});
    $('#disconnect').addEventListener('click',()=>{deleting=true;editing=false;$('#token').value='';paint();$('#cancel-delete').focus();});
    $('#cancel-delete').addEventListener('click',()=>{deleting=false;paint();$('#disconnect').focus();});
    $('#confirm-delete').addEventListener('click',()=>run(()=>accountRequest('account',{method:'DELETE'}),'delete'));
    $('#retry').addEventListener('click',()=>{editing=false;$('#token').value='';run(()=>accountRequest());});
    run(()=>accountRequest());
  }
}
customElements.define('hf-account-settings',HuggingFaceSettings);
