import {hybridPlanMarkup} from './hybrid-plan-ui.js';
import {SHORTS_DEFAULT_SECONDS} from './shorts-policy.js';
import {architectureCaseMarkup} from './architecture-case.js';
import {connectLlm} from './llm-connection.js';
export function draftPayload(topic,memo='') {
  const clean=String(topic).trim();
  if(!clean || clean.length>100)throw Error('주제를 1~100자로 입력해 주세요.');
  if(!/[a-z0-9가-힣]/i.test(clean))throw Error('주제에 한글이나 영문, 숫자를 포함해 주세요.');
  return {topic:clean,contentType:'shorts',...(memo.trim()?{memo:memo.trim().slice(0,500)}:{})};
}
export async function requestAutomaticDraft(topic,memo,{fetcher=fetch}={}) {
  const response=await fetcher('/api/draft-requests',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(draftPayload(topic,memo)),signal:AbortSignal.timeout(20000)});
  const data=await response.json().catch(()=>({}));
  if(response.status===409)return {duplicate:true};
  if(response.status===401)throw Error('로그인 세션이 만료됐어요. 다시 로그인한 뒤 요청해 주세요.');
  if(!response.ok)throw Error(data.error || '초안을 요청하지 못했어요. 다시 시도해 주세요.');
  return {duplicate:false};
}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const projectStep=p=>p.render?5:p.task?.action==='media'||p.task?.action==='render'?4:p.scenes.length||p.task?.phase==='scenario'?3:2;
const busy=project=>['queued','running'].includes(project.task?.state);
export function automaticStatus(project) {
  if(project.upload?.state==='done')return '발행 완료';
  if(project.task?.state==='failed'||project.upload?.state==='failed')return '확인 필요';
  if(busy(project)&&project.task.action==='scenario'&&project.brief.workflow==='explainer-v1')return project.task.state==='queued'?'자료 검색 요청 대기 중':project.task.phase==='scenario'?'확인한 자료로 대본 작성 중':'선택한 주제의 자료 확인 중';
  if(busy(project)&&project.task.action==='media'&&project.brief.workflow==='explainer-v1'){const n=project.scenes.length,a=Object.values(project.assets||{}).filter(a=>a.purpose==='narration').length,m=project.scenes.filter(s=>project.assets[s.id]).length;return a<n?`음성 생성 ${a} / ${n}`:`장면 생성 ${m} / ${n}`;}
  if(busy(project))return ({scenario:'대본 생성',media:'장면 생성',render:'음성·자막·영상 조립',publish:'업로드',narration:'음성 생성'}[project.task.action]||'제작')+(project.task.state==='queued'?' 대기 중':' 중');
  if(project.render)return '발행 검수';
  if(project.scenes.length&&!project.approved)return '대본 승인';
  return project.scenes.length?'영상 제작 이어하기':'대본 생성 필요';
}
export function mountAutomaticCreation(host,{fetcher=fetch,connect=connectLlm,selectedOnly=false}={}) {
  let saved=null,selected=0,pending=false,polling=false,projects=new Map(),signature='',selectedProject=new URLSearchParams(location.search).get('project');
  let recommendationId=new URLSearchParams(location.search).get('recommendation'),started=Date.now();
  const q=selector=>host.querySelector(selector);
  const api=async(path,body)=>{
    const response=await fetcher('/api/studio'+path,{cache:'no-store',signal:AbortSignal.timeout(25000),...(body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})});
    const data=await response.json();if(!response.ok)throw Error(data.error||'요청을 확인하지 못했어요. 다시 시도해 주세요.');return data;
  };
  host.innerHTML=`<details class="production-create" data-auto-planner ${!selectedOnly||recommendationId?'open':''}><summary>새 자동 영상 만들기</summary><section class="auto-planner" aria-labelledby="auto-title"><header><h2 id="auto-title">주제 하나로, 완성 영상까지</h2><p>관심 있는 이야기를 고르면, 근거를 찾고 대본부터 영상까지 만듭니다.</p></header><ol class="auto-steps" aria-label="자동 제작 순서"><li aria-current="step">카테고리</li><li>주제 추천</li><li>자료 확인</li><li>대본</li><li>영상·음성</li><li>완성</li></ol><form data-search><fieldset disabled><legend>어떤 분야를 만들까요?</legend><div class="auto-categories" data-categories></div><div class="auto-methods" role="group" aria-label="영상 제작 방식"><label><input type="radio" name="productionStyle" value="webtoon" checked><span class="auto-method-art auto-method-animation" aria-hidden="true">▧ ↝</span><strong>웹툰 혼합 제작</strong><small>웹툰 원화 · Higgsfield 도입 · 움직이는 설명</small></label><label><input type="radio" name="productionStyle" value="hybrid"><span class="auto-method-art auto-method-animation" aria-hidden="true">▧ ↔ ◇</span><strong>자동 혼합</strong><small>장면에 맞춰 웹툰 · 3D 구조도 · 모션</small></label><label><input type="radio" name="productionStyle" value="animation"><span class="auto-method-art auto-method-animation" aria-hidden="true">◯ ↔ ▥</span><strong>설명 애니메이션</strong><small>캐릭터와 사물의 움직임으로 쉽게</small></label><label><input type="radio" name="productionStyle" value="cinematic"><span class="auto-method-art auto-method-cinema" aria-hidden="true">▥</span><strong>시네마틱 영상</strong><small>Higgsfield로 만드는 실사·일러스트</small></label></div><div class="auto-options"><label>영상 형식<select name="format"><option value="short">숏폼 · 세로</option><option value="long">롱폼 · 가로</option></select></label><label>목표 길이<select name="duration"><option value="32">32초</option><option value="45" selected>45초 · 추천</option><option value="60">60초</option><option value="120">120초</option></select></label><label class="auto-interest">관심사 · 제품 정보 <span>선택</span><input name="topic" maxlength="1000" placeholder="예: 부모와 아이의 대화, 빛이 들어오는 작은 집"></label><label class="auto-interest">분위기·연출 <span>선택</span><input name="direction" maxlength="2000" placeholder="예: 따뜻한 손그림, 어두운 건축 다큐, 밝은 3D"></label></div><div class="auto-options" data-webtoon-budget><label class="auto-interest">Higgsfield 총 크레딧 상한<input name="maxCredits" type="number" min="1" max="1000" step="1" value="54" required><small>원화 + 도입 6초 포함. 견적 초과 시 생성하지 않아요. 음성 사용량은 별도입니다.</small></label></div><details class="auto-settings"><summary>목소리·자막 설정</summary><div class="auto-options"><label>목소리<select name="voiceId"><option value="RU7aSi6lT4uQBXMLgDxK" selected>Kyle · 자연스러운 설명</option><option value="n2fbxG88jqAoaVPUy3IG">Yooni · 또렷한 설명</option><option value="ZRJMGKt2Okf3o9C38eSq">Claire · 차분한 설명</option><option value="Kndx0DUJ5HQE1HQgiMY8">Jin · 선명한 대화</option><option value="BbsagRO6ohd8MKPS2Ob0">진건 · 차분한 남성</option><option value="sf8Bpb1IU97NI9BHSMRf">Rumi · 부드러운 대화</option></select></label><label>말하는 속도<select name="narrationSpeed"><option value="1">1.0배</option><option value="1.1" selected>1.1배</option><option value="1.15">1.15배</option><option value="1.25">1.25배</option></select></label><label>자막 위치<select name="captionPosition"><option value="middle">가운데</option><option value="bottom" selected>아래</option></select></label></div></details><button class="auto-primary" type="submit">관심 분야로 주제 추천받기</button></fieldset></form><div data-search-status role="status" aria-live="polite"></div><div data-keywords></div></section></details><section class="auto-management" aria-labelledby="auto-management-title"><header><h2 id="auto-management-title">대본 승인과 발행 검수</h2><p>작업을 선택하면 검수 내용을 펼쳐볼 수 있어요.</p></header><p data-management-message role="status"></p><div data-projects><p>제작 작업을 불러오고 있어요.</p></div></section>`;
  const form=q('[data-search]'),status=q('[data-search-status]'),feedback=q('[data-management-message]');
  const step=n=>q('.auto-steps').querySelectorAll('li').forEach((li,i)=>{li.toggleAttribute('data-done',i<n);if(i===n)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');});
  function progress(text){status.innerHTML=`<div class="auto-progress"><progress aria-label="트렌드 검색 진행"></progress><div><strong>${esc(text)}</strong><p>최근 자료 확인 후 키워드 3개와 영상 기획을 보여드려요. 창을 닫아도 계속 진행됩니다.</p></div></div>`;}
  function updateLocation(query=''){
    if(new URLSearchParams(location.search).get('mode')==='manual')return;
    history.replaceState(null,'','/studio/dashboard?mode=auto'+(query?'&'+query:''));
  }
  function setRecommendation(id){recommendationId=id;updateLocation('recommendation='+encodeURIComponent(id));}
  function result(item){
    saved=item;pending=false;form.querySelector('fieldset').disabled=false;step(1);status.textContent='추천이 준비됐어요. 영상으로 만들 이야기를 선택하세요.';
    const data=item.result;
    q('[data-keywords]').innerHTML=`<fieldset class="auto-keywords"><legend>어떤 이야기를 만들까요?</legend>${data.suggestions.map((s,i)=>`<label class="auto-keyword"><input type="radio" name="keyword" value="${i}" ${i===0?'checked':''}><span><strong>${esc(s.keyword)}</strong><b>${esc(s.topic)}</b>${architectureCaseMarkup(s)}<span>${esc(s.reason)}</span><small>${esc(s.direction)}</small></span></label>`).join('')}</fieldset><details class="auto-sources"><summary>검색 근거 ${data.sources.length}개 · ${esc(data.checkedAt?.slice(0,10))}</summary>${data.sources.map(s=>{let safe=false;try{safe=new URL(s.url).protocol==='https:';}catch{}return safe?`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>`:'';}).join('')}</details><button type="button" class="auto-primary" data-create>이 주제로 자료 확인 · 대본 만들기</button><p class="auto-note">대본 승인 후 장면·음성·자막을 생성하고 영상을 조립합니다. 생성 서비스 사용료가 발생할 수 있어요.</p>`;
    selected=0;
    q('[data-keywords]').onchange=e=>{if(e.target.name==='keyword')selected=Number(e.target.value);};
    q('[data-create]').onclick=async e=>{
      const button=e.currentTarget;button.disabled=true;button.textContent='대본 생성 요청 중…';
      try {
        const data=await api('/automatic',{recommendationId:item.id,index:selected});selectedProject=data.project.id;recommendationId=null;step(2);
        updateLocation('project='+encodeURIComponent(selectedProject));
        feedback.textContent=data.error||'제작을 시작했어요. 대본이 준비되면 이곳에서 승인해 주세요.';
        signature='';await refreshProjects();q('.auto-management').scrollIntoView({behavior:'smooth',block:'start'});button.textContent='작업에서 이어하기';
      } catch(error){status.textContent=error.message;button.textContent='다시 영상 만들기';}
      finally{button.disabled=false;}
    };
  }
  async function checkRecommendation(){
    if(!recommendationId||!pending)return;
    const {recommendation:item}=await api('/llm/recommendation?id='+encodeURIComponent(recommendationId));
    if(item?.input?.intent!=='keywords')throw Error('자동 제작 키워드 검색을 다시 시작해 주세요.');
    if(item.state==='failed')throw Error(item.error||'검색을 완료하지 못했어요. 다시 시도해 주세요.');
    if(item.state==='done'){result(item);return;}
    step(1);progress(item.state==='queued'?'검색 요청 대기 중':`트렌드 검색·키워드 산출 중 · ${Math.max(0,Math.round((Date.now()-started)/1000))}초`);
  }
  function budgetVisibility(){const active=['webtoon','hybrid'].includes(form.elements.productionStyle.value);q('[data-webtoon-budget]').hidden=!active;form.elements.maxCredits.disabled=!active;}
  form.onchange=e=>{
    budgetVisibility();
    if(e.target.name==='format')form.elements.narrationSpeed.value=e.target.value==='short'?'1.1':'1';
    if(e.target.name==='format')form.elements.duration.innerHTML=(e.target.value==='short'?[[SHORTS_DEFAULT_SECONDS,'45초 · 추천'],[32,'32초'],[60,'60초'],[120,'120초']]:[[120,'2분'],[300,'5분'],[600,'10분']]).map(([v,t])=>`<option value="${v}">${t}</option>`).join('');
    if(!pending)step(0);
    if(saved){saved=null;recommendationId=null;q('[data-keywords]').innerHTML='';status.textContent='선택한 조건으로 다시 검색해 주세요.';step(0);updateLocation();}
  };
  form.onsubmit=async e=>{
    e.preventDefault();if(pending)return;pending=true;saved=null;q('[data-keywords]').innerHTML='';form.querySelector('fieldset').disabled=true;progress('AI 계정 확인 중');
    try {
      if(!await connect())throw Error('계정을 연결한 뒤 검색해 주세요.');
      const input={...(['webtoon','hybrid'].includes(form.elements.productionStyle.value)?{maxCredits:Number(form.elements.maxCredits.value)}:{}),workflow:'explainer-v1',voiceId:form.elements.voiceId.value,narrationSpeed:Number(form.elements.narrationSpeed.value),captionPosition:form.elements.captionPosition.value,productionStyle:form.elements.productionStyle.value,intent:'keywords',focus:'topic',category:form.elements.category.value,format:form.elements.format.value,duration:Number(form.elements.duration.value),topic:form.elements.topic.value,direction:form.elements.direction.value};
      const response=await api('/recommendations',input);if(!response.job?.id)throw Error('검색 요청을 확인하지 못했어요.');
      started=Date.now();setRecommendation(response.job.id);step(1);await checkRecommendation();
    }catch(error){pending=false;form.querySelector('fieldset').disabled=false;status.textContent=error.message;}
  };
  function researchMarkup(p){
    if(!p.research)return '';
    return `<details class="auto-research"><summary>대본에 사용한 자료 ${p.research.sources.length}개</summary><ul>${p.research.facts.map(f=>`<li>${esc(f.claim)}</li>`).join('')}</ul>${p.research.sources.map(s=>{let ok=false;try{ok=new URL(s.url).protocol==='https:';}catch{}return ok?`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>`:'';}).join('')}${p.research.limitations.length?`<p>설명할 때 주의한 점</p><ul>${p.research.limitations.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:''}</details>`;
  }
  function timeline(p){
    const stage=projectStep(p);
    const labels=['주제 선택','자료 확인','대본 검토','영상·음성','완성'];
    return `<ol class="auto-pipeline" aria-label="제작 진행">${labels.map((l,i)=>`<li ${i<stage-1?'data-done':i===stage-1?'aria-current="step"':''}>${esc(l)}</li>`).join('')}</ol>`;
  }
  const asset=p=>`/api/studio/${encodeURIComponent(p.id)}/assets/final?v=${p.revision}`;
  function projectMarkup(p){
    const running=busy(p),failed=p.task?.state==='failed',published=!!p.upload;
    let controls='';
    if(!running&&!published){
      if(!p.scenes.length)controls='<button data-auto-action="scenario" class="auto-primary">대본 생성 다시 시도</button>';
      else if(!p.approved)controls=hybridPlanMarkup(p)+(['webtoon','hybrid'].includes(p.brief.productionStyle)?`<p class="auto-note">웹툰 원화와 도입 영상: 총 ${Number(p.brief.maxCredits)}크레딧 이내. 음성 사용량 별도. 대본 수정 시 재검토가 필요합니다.</p>`:'')+'<label class="auto-check"><input type="checkbox" data-approve>대본과 장면 설명을 확인했습니다.</label><p class="auto-note">승인하면 장면·음성 생성과 영상 조립을 진행하며 서비스 사용료가 발생할 수 있어요.</p><button data-auto-action="media" class="auto-primary" disabled>대본 승인하고 영상 만들기</button>';
      else if(p.render)controls=`<video controls preload="metadata" src="${asset(p)}"></video><form data-publish><label>게시 제목<input name="title" required maxlength="100" value="${esc(p.title)}"></label><label>플랫폼<select name="platform"><option value="youtube">YouTube</option>${p.brief.format==='short'?'<option value="instagram">Instagram</option><option value="tiktok">TikTok</option>':''}</select></label><label>공개 범위<select name="privacy"><option value="private">비공개</option><option value="unlisted">일부 공개</option><option value="public">공개</option></select></label><label class="auto-check"><input name="reviewed" type="checkbox" required>최종 영상과 발행 정보를 확인했습니다.</label><button class="auto-primary">검수 완료 · 업로드</button></form>`;
      else controls=`<button data-auto-action="${p.scenes.every(s=>p.assets[s.id])&&p.edit?'render':'media'}" class="auto-primary">영상 제작 이어하기</button>`;
    }
    return `<details class="auto-project" data-project="${p.id}" ${selectedProject===p.id?'open':''}><summary><span><small>${esc(p.brief.category)} · ${esc(p.automation.keyword)}</small><strong>${esc(p.title)}</strong></span><b class="${failed?'auto-error':''}">${esc(automaticStatus(p))}</b></summary><div class="auto-project-body">${p.brief.workflow?timeline(p):''}${researchMarkup(p)}${running?`<div class="auto-progress"><progress aria-label="${esc(automaticStatus(p))}"></progress><p>${esc(automaticStatus(p))}<br>창을 닫아도 서버에서 계속 처리합니다.</p></div>`:''}${failed?`<p role="alert" class="auto-error">${esc(p.task.error)}</p>`:''}${p.upload?`<p>${p.upload.state==='done'?'발행을 완료했어요.':'업로드 결과를 제작실에서 확인해 주세요.'}</p>`:''}${p.scenes.length?`<ol class="auto-script">${p.scenes.map(s=>`<li><p>${esc(s.narration)}</p><small>${esc(s.kind==='video'?'영상':'이미지')} · ${esc(s.duration)}초 · ${esc(s.prompt)}</small></li>`).join('')}</ol>`:''}<a href="/studio?id=${p.id}">대본·영상 직접 편집</a><div class="auto-project-controls">${controls}</div></div></details>`;
  }
  async function refreshProjects(){
    const {projects:items}=await api('');const automatic=items.filter(p=>p.automation);
    if(selectedOnly&&selectedProject&&!automatic.some(p=>p.id===selectedProject))feedback.textContent='선택한 작업을 찾을 수 없어요. 목록에서 다른 작업을 선택해 주세요.';
    automatic.sort((a,b)=>{const attention=p=>!busy(p)&&!p.upload;return Number(attention(b))-Number(attention(a))||b.updatedAt.localeCompare(a.updatedAt);});
    projects=new Map(automatic.map(p=>[p.id,p]));if(selectedProject&&projects.has(selectedProject)&&!pending&&!recommendationId)step(projectStep(projects.get(selectedProject)));const next=JSON.stringify([selectedProject,automatic.map(p=>[p.id,p.revision])]);if(next===signature)return;
    const activeCard=document.activeElement?.closest('[data-project]');
    if(activeCard&&activeCard.dataset.revision===String(projects.get(activeCard.dataset.project)?.revision))return;
    signature=next;
    const list=q('[data-projects]');
    if(!automatic.length){list.innerHTML='<p class="auto-empty">키워드로 영상을 시작하면 이곳에서 대본과 완성 영상을 확인할 수 있어요.</p>';return;}
    const cards=new Map([...list.querySelectorAll('[data-project]')].map(el=>[el.dataset.project,el]));
    // Keep untouched forms and video players mounted while another job advances.
    for(const p of automatic.filter(p=>!selectedOnly||p.id===selectedProject)){
      let card=cards.get(p.id);
      if(!card || card.dataset.revision!==String(p.revision)){
        const template=document.createElement('template');template.innerHTML=projectMarkup(p);const nextCard=template.content.firstElementChild;
        nextCard.dataset.revision=String(p.revision);if(card?.open)nextCard.open=true;
        if(card)card.replaceWith(nextCard);card=nextCard;
      }
      if(p.id===selectedProject)card.open=true;
      list.append(card);cards.delete(p.id);
    }
    for(const card of cards.values())card.remove();
    for(const child of [...list.children])if(!child.matches('[data-project]'))child.remove();
    if(selectedOnly&&!selectedProject)list.innerHTML='<p class="auto-empty">위 목록에서 작업을 선택해 대본을 승인하거나 발행을 검수하세요.</p>';
  }
  async function act(card,action,body={}){
    const p=projects.get(card.dataset.project),buttons=[...card.querySelectorAll('button')].map(button=>({button,disabled:button.disabled}));buttons.forEach(({button})=>button.disabled=true);feedback.textContent='';
    try {await api(`/${p.id}/${action}`,{revision:p.revision,...body});signature='';await refreshProjects();}
    catch(error){feedback.textContent=error.message;signature='';await refreshProjects().catch(()=>{});}
    finally{buttons.forEach(({button,disabled})=>{if(button.isConnected)button.disabled=disabled;});}
  }
  q('[data-projects]').onchange=e=>{if(e.target.matches('[data-approve]'))e.target.closest('[data-project]').querySelector('[data-auto-action="media"]').disabled=!e.target.checked;};
  q('[data-projects]').onclick=e=>{const button=e.target.closest('[data-auto-action]');if(!button||button.disabled)return;const action=button.dataset.autoAction;void act(button.closest('[data-project]'),action,action==='scenario'?{confirm:true}:action==='media'?{approved:true}:{});};
  q('[data-projects]').onsubmit=e=>{if(!e.target.matches('[data-publish]'))return;e.preventDefault();const f=e.target;void act(f.closest('[data-project]'),'publish',{reviewed:f.elements.reviewed.checked,platforms:[f.elements.platform.value],privacy:f.elements.privacy.value,title:f.elements.title.value});};
  async function poll(){
    if(polling)return;polling=true;
    try {await checkRecommendation();}catch(error){status.textContent=error.message;pending=false;form.querySelector('fieldset').disabled=false;}
    try {await refreshProjects();}catch(error){feedback.textContent='작업 목록을 확인하지 못했어요. 자동으로 다시 확인합니다. '+error.message;}
    finally{polling=false;}
  }
  const ready=(async()=>{
    try{
      const config=await api('/config');q('[data-categories]').innerHTML=config.categories.map((c,i)=>`<label><input type="radio" name="category" value="${esc(c)}" ${i===0?'checked':''}><span>${esc(c)}</span></label>`).join('');form.querySelector('fieldset').disabled=false;
      if(recommendationId){pending=true;form.querySelector('fieldset').disabled=true;const {recommendation:item}=await api('/llm/recommendation?id='+encodeURIComponent(recommendationId));if(item?.input){form.elements.productionStyle.value=item.input.productionStyle||'cinematic';for(const key of ['voiceId','narrationSpeed','captionPosition','maxCredits'])if(item.input[key]!==undefined)form.elements[key].value=String(item.input[key]);form.elements.category.value=item.input.category;form.elements.format.value=item.input.format;form.elements.topic.value=item.input.topic;form.elements.direction.value=item.input.direction||'';form.elements.duration.innerHTML=`<option value="${Number(item.input.duration)}">${Number(item.input.duration)}초</option>`;}await checkRecommendation();}
      await refreshProjects();
      if(selectedProject&&projects.has(selectedProject)){const p=projects.get(selectedProject);form.elements.productionStyle.value=p.brief.productionStyle||'cinematic';form.elements.category.value=p.brief.category;form.elements.topic.value=p.brief.topic;form.elements.direction.value=p.brief.direction||'';for(const key of ['voiceId','narrationSpeed','captionPosition','maxCredits'])if(p.brief[key]!==undefined)form.elements[key].value=String(p.brief[key]);form.elements.format.value=p.brief.format;form.elements.duration.innerHTML=`<option value="${p.brief.duration}">${p.brief.duration}초</option>`;step(projectStep(p));q('.auto-management').scrollIntoView({block:'start'});}
    }catch(error){status.textContent=error.message;pending=false;form.querySelector('fieldset').disabled=false;}
    budgetVisibility();
  })();
  const timer=setInterval(()=>{if(host.isConnected&&!host.closest('[hidden]')&&!document.hidden)void poll();},4000);
  return {ready,refresh:poll,
    openPlanner(){q('[data-auto-planner]').open=true;q('[data-auto-planner]').scrollIntoView({block:'start'});form.querySelector('input')?.focus();},
    async selectProject(id,{scroll=true}={}){if(selectedProject!==id){selectedProject=id;signature='';}await poll();if(scroll)q('.auto-management').scrollIntoView({block:'start'});},
    destroy:()=>clearInterval(timer)};
}
