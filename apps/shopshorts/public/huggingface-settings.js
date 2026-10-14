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
      :host{display:block;color:inherit;font:inherit;padding:20px 0;border-top:1px solid #e5e6df}h3{margin:0 0 8px;font-size:16px}p{font-size:13px;line-height:1.6}form{display:flex;gap:10px;flex-wrap:wrap}label{display:flex;flex:1;min-width:180px;flex-direction:column;gap:6px;font-size:13px}input,button{font:inherit;border:1px solid #d4d8d1;border-radius:8px;padding:10px;background:white}button{cursor:pointer;align-self:end;color:#277e64}button:disabled{opacity:.5}a{color:#277e64}small{display:block;line-height:1.7;margin-top:10px}input:focus-visible,button:focus-visible{outline:2px solid #277e64;outline-offset:2px}[role=alert]{color:#a32e22}
      </style><h3>Hugging Face · Kandinsky</h3><p>무료 계정의 읽기 토큰을 한 번 저장하면 영상 생성 때 자동으로 사용합니다.</p>
      <p id="state" role="status">연결 확인 중…</p>
      <form><label>Hugging Face 읽기 토큰<input type="password" autocomplete="off" spellcheck="false" placeholder="hf_…" required maxlength="203"></label><button type="submit">토큰 저장</button><button type="button" id="disconnect">저장된 토큰 삭제</button></form>
      <p id="error" role="alert" hidden></p><small>토큰은 로그인한 사용자별로 서버에 암호화해 저장합니다. 저장한 값은 화면에 다시 표시하지 않습니다. 무료 여부를 확인한 계정만 연결하며 유료 생성으로 전환하지 않습니다.</small>
      <p><a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer">읽기 토큰 만들기 ↗</a> · <a href="/kandinsky">영상 생성으로 이동</a></p><button type="button" id="retry">연결 다시 확인</button>`;
    const $=id=>root.querySelector(id);let busy=false;
    const render=data=>{$('#state').textContent=data.configured?`${data.name || '무료 계정'} · 토큰 저장됨`:'저장된 토큰 없음';$('#disconnect').hidden=!data.configured;};
    const run=async action=>{
      if(busy)return;busy=true;root.querySelectorAll('button').forEach(b=>b.disabled=true);$('#error').hidden=true;
      try{render(await action());}catch(e){$('#error').textContent=e.message;$('#error').hidden=false;}
      finally{busy=false;root.querySelectorAll('button').forEach(b=>b.disabled=false);}
    };
    $('form').addEventListener('submit',event=>{event.preventDefault();const token=$('input').value.trim();
      run(async()=>{try{return await accountRequest('account',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({token})});}finally{$('input').value='';}});
    });
    $('#disconnect').addEventListener('click',()=>run(()=>accountRequest('account',{method:'DELETE'})));
    $('#retry').addEventListener('click',()=>run(()=>accountRequest()));
    run(()=>accountRequest());
  }
}
customElements.define('hf-account-settings',HuggingFaceSettings);
