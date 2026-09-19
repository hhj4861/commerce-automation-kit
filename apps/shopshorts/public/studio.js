import {createEditor} from './editor.js';
import {frameCount,FPS} from './editor-model.js';
let editor=null, recommendationController=null;
'use strict';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = { project:null, step:1, config:null, category:'심리학', format:'short', selected:null, dirty:false, pending:false, previewTimer:null };
const names = ['기획','시나리오','이미지 · 영상','편집','업로드'];
const platformNames = {youtube:'YouTube',instagram:'Instagram',tiktok:'TikTok'};
const taskNames = {scenario:'시나리오 생성',media:'이미지·영상 생성',render:'최종 영상 만들기',publish:'플랫폼 업로드'};
const taskBusy = () => ['queued','running'].includes(state.project?.task?.state);
const total = p => p.edit?.version===2 ? Math.round(frameCount(p.edit)/FPS*100)/100 : p.edit ? p.edit.order.reduce((sum,id) => sum + p.edit.durations[id],0) : p.scenes.reduce((sum,s) => sum+s.duration,0);
const assetUrl = (id, asset) => `/api/studio/${id}/assets/${encodeURIComponent(asset)}?v=${state.project?.revision || 0}`;
function toast(text){ $('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,5000); }
async function api(path='', options={}) {
  const response=await fetch('/api/studio'+path,options);
  if(response.status===401){location.href='/login';throw Error('로그인이 필요합니다.');}
  const data=await response.json();if(!response.ok)throw Error(data.error || '요청 실패');return data;
}
function post(path,body){return api(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}
async function run(fn){
 if(state.pending)return;state.pending=true;
 const controls=[...document.querySelectorAll('#stage button,#stage input,#stage select,#stage textarea')].map(node=>({node,disabled:node.disabled}));
 controls.forEach(({node})=>node.disabled=true);let failed=false;
 try{await fn();}catch(e){failed=true;toast(e.message);}
 finally{state.pending=false;if(failed)controls.forEach(({node,disabled})=>{if(node.isConnected)node.disabled=disabled;});else if(state.project)render();else if(!$('#workspace').hidden)renderBrief();}
}
async function action(name,body={}){const r=await post(`/${state.project.id}/${name}`,{revision:state.project.revision,...body});state.project=r.project;state.dirty=false;return r.project;}
function progress(){
 const p=state.project;const highest=!p?1:!p.scenes.length?2:!p.approved||p.scenes.some(s=>!p.assets[s.id])?3:!p.render?4:5;
 $('#steps').innerHTML=names.map((name,i)=>`<button class="step ${state.step===i+1?'active':i+1<highest?'done':''}" data-step="${i+1}" ${i+1>highest?'disabled':''} ${state.step===i+1?'aria-current="step"':''}><span>${i+1<highest?'✓':i+1}</span>${name}</button>`).join('');
 $('#steps').querySelectorAll('button').forEach(b=>b.onclick=()=>run(async()=>{await saveCurrent();state.step=Number(b.dataset.step);render();}));
}
function note(){
 const p=state.project, task=p?.task;
 const caps=state.config?.capabilities || {};
 let html='';
 if(state.config?.execution==='cloud-worker' && (!caps.workerAt || Date.now()-Date.parse(caps.workerAt)>90000))html='<div class="status-note">제작 워커가 연결되지 않았습니다. 프로젝트 저장과 편집은 가능하며, 생성·렌더·업로드 요청은 워커가 연결되면 처리됩니다.</div>';
 if(task && ['queued','running'].includes(task.state))html+=`<div class="status-note"><span class="progress-dots"></span><strong>${taskNames[task.action]} ${task.state==='queued'?'대기 중':'진행 중'}</strong> — 창을 닫아도 서버에서 계속 처리합니다. ${task.action==='media'?`${p.scenes.filter(s=>p.assets[s.id]).length}/${p.scenes.length}장면 준비됨`:''}</div>`;
 if(task?.state==='failed')html+=`<div class="status-note error"><strong>${taskNames[task.action]} 실패</strong><br>${esc(task.error)}</div>`;
 $('#notice').innerHTML=html;
}
function heading(){
 const p=state.project;$('.heading h1').textContent=p?p.title:'내 이야기로 시작하기';
 $('#intro').textContent=p?`${p.brief.category} · ${p.brief.format==='short'?'숏폼 9:16':'롱폼 16:9'} · ${p.scenes.length?p.scenes.length+'장면 / '+total(p)+'초':p.brief.duration+'초 목표'}`:'주제와 영상 형식을 정하면 AI가 시나리오를 작성합니다.';
 $('#newProject').hidden=false;
}
function start(){recommendationController?.abort();editor?.destroy();editor=null;state.project=null;state.step=1;state.dirty=false;$('#modes').hidden=true;$('#workspace').hidden=false;$('#projects').hidden=true;history.replaceState(null,'','/studio?new=1');heading();progress();renderBrief();}
function renderBrief(){
 recommendationController?.abort();
 const p=state.project, brief=p?.brief;
 const cats=state.config?.categories || ['심리학','건축학','상품광고','막장드라마','역사','과학','직접 입력'];
 if(brief){state.category=brief.category;state.format=brief.format;}
 $('#stage').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>이야기의 출발점을 정하세요</h2><p>관심 있는 주제와 원하는 분위기를 알려주세요.</p></div><span class="badge">1 / 5 기획</span></div><div class="brief-grid"><div><div class="field"><span>카테고리</span><div class="chips">${cats.map(c=>`<button class="chip ${c===state.category?'selected':''}" data-category="${esc(c)}" aria-pressed="${c===state.category}" ${p?'disabled':''}>${esc(c)}</button>`).join('')}</div></div><div class="field"><div class="field-title"><label for="topic">어떤 이야기를 만들까요?</label>${!p?'<button type="button" class="recommend-button" data-recommend="topic">✦ LLM 추천</button>':''}</div><textarea id="topic" maxlength="1000" placeholder="예: 사람은 왜 미루는 걸까? 일상 속 심리학을 쉽게 설명하는 영상" ${p?'readonly':''}>${esc(brief?.topic || '')}</textarea></div><div class="field"><div class="field-title"><label for="direction">분위기와 요청사항 <small class="muted">선택</small></label>${!p?'<button type="button" class="recommend-button" data-recommend="direction">✦ LLM 추천</button>':''}</div><textarea id="direction" maxlength="2000" placeholder="예: 친근한 말투, 따뜻한 일러스트, 마지막에 실천 팁 한 가지" ${p?'readonly':''}>${esc(brief?.direction || '')}</textarea></div>${!p?'<p class="hint">선택한 카테고리의 최근 검색 자료로 3가지 기획을 추천합니다. Gemini 검색·생성 사용료가 발생할 수 있습니다.</p><section id="recommendations" class="recommendations" aria-label="LLM 추천 결과" hidden></section>':''}</div><div><span class="label">영상 형식</span><div class="formats"><button class="format ${state.format==='short'?'selected':''}" data-format="short" ${p?'disabled':''}><span class="ratio">9:16</span><strong>숏폼</strong><small>짧고 선명한 이야기</small></button><button class="format ${state.format==='long'?'selected':''}" data-format="long" ${p?'disabled':''}><span class="ratio landscape">16:9</span><strong>롱폼</strong><small>깊이 있게 풀어내는 이야기</small></button></div><label class="field" style="margin-top:24px"><span>목표 길이</span><select id="duration" ${p?'disabled':''}></select><small class="hint">숏폼은 최대 3분, 롱폼은 최대 10분까지 제작합니다.</small></label><p class="muted">${p?'프로젝트 기획은 저장되어 있습니다. 다른 기획은 새 프로젝트에서 시작하세요.':'광고는 사실에 근거해 작성하고, 생성한 대본을 직접 확인한 뒤 제작을 시작합니다.'}</p></div></div><div class="actions"><span class="save-state">${p?'저장된 기획':'기획 저장 후 다음 단계에서 시나리오를 생성합니다.'}</span><button class="primary" id="create">${p?'시나리오 보기':'기획 저장 · 다음 단계'}</button></div></section>`;
 function durations(){const values=state.format==='short'?[24,32,48,60,90,120,180]:[120,180,300,600];$('#duration').innerHTML=values.map(v=>`<option value="${v}">${v<60?v+'초':v/60+'분'}</option>`).join('');if(brief)$('#duration').value=brief.duration;}
 durations();
 const invalidateRecommendations=bindRecommendations(p);
 document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{state.category=b.dataset.category;invalidateRecommendations();document.querySelectorAll('[data-category]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});});
 document.querySelectorAll('[data-format]').forEach(b=>b.onclick=()=>{state.format=b.dataset.format;invalidateRecommendations();document.querySelectorAll('[data-format]').forEach(x=>x.classList.toggle('selected',x===b));durations();});
 $('#create').onclick=()=>run(async()=>{if(!p){const r=await post('',{category:state.category,format:state.format,topic:$('#topic').value,direction:$('#direction').value,duration:Number($('#duration').value)});state.project=r.project;state.dirty=false;history.replaceState(null,'',`/studio?id=${r.project.id}`);}state.step=2;render();});
}
function bindRecommendations(project){
 if(project)return()=>{};
 const panel=$('#recommendations'),buttons=[...document.querySelectorAll('[data-recommend]')];let requestId=0;
 const form=focus=>({category:state.category,format:state.format,duration:Number($('#duration').value),focus,topic:$('#topic').value,direction:$('#direction').value});
 const busy=value=>{buttons.forEach(b=>{b.disabled=value;b.textContent=value?'검색·추천 중…':'✦ LLM 추천';});panel.setAttribute('aria-busy',String(value));};
 const invalidate=()=>{requestId++;recommendationController?.abort();busy(false);panel.hidden=true;panel.replaceChildren();};
 for(const id of ['topic','direction','duration'])$('#'+id).addEventListener('input',invalidate);
 buttons.forEach(button=>button.onclick=async()=>{
  const input=form(button.dataset.recommend);
  if(input.focus==='direction'&&!input.topic.trim()){toast('분위기를 추천받을 주제를 먼저 입력하세요.');$('#topic').focus();return;}
  if(input.category==='직접 입력'&&!input.topic.trim()){toast('관심 분야나 주제를 먼저 입력하세요.');$('#topic').focus();return;}
  const current=++requestId;recommendationController=new AbortController();busy(true);panel.hidden=false;
  panel.innerHTML='<p role="status">최근 자료를 검색하고 카테고리에 맞는 기획을 추천하고 있어요…</p>';
  try{
   const data=await api('/recommendations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input),signal:recommendationController.signal});
   if(current!==requestId||!panel.isConnected||JSON.stringify(form(input.focus))!==JSON.stringify(input))return;
   panel.innerHTML=`<div class="recommendation-heading"><h3>${esc(input.category)} · ${input.focus==='topic'?'이야기':'분위기'} 추천</h3><small>${new Date(data.checkedAt).toLocaleString('ko-KR')} 검색</small></div><p class="hint">최근 30일 검색 자료를 참고한 기획입니다. 검색량 순위를 뜻하지 않습니다.</p><div class="recommendation-list">${data.suggestions.map((item,i)=>`<article class="recommendation-card"><span class="badge">제안 ${i+1}</span><h4>${esc(item.topic)}</h4><p class="recommendation-direction">${esc(item.direction)}</p><p class="recommendation-reason">${esc(item.reason)}</p><div class="recommendation-actions">${input.focus==='topic'?`<button class="secondary" data-apply-recommendation="${i}" data-fields="both">주제·분위기 적용</button><button class="quiet" data-apply-recommendation="${i}" data-fields="topic">주제만 적용</button>`:`<button class="secondary" data-apply-recommendation="${i}" data-fields="direction">이 분위기 적용</button>`}</div></article>`).join('')}</div><div class="recommendation-sources"><strong>추천에 참고한 검색 출처</strong><ul>${data.sources.map(source=>`<li><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)} ↗</a></li>`).join('')}</ul></div><div id="searchSuggestions"></div>`;
   // Provider HTML is isolated from app CSS; scripts, handlers and unsafe URLs are never attached.
   if(data.searchSuggestions){
    const fragment=new DOMParser().parseFromString(data.searchSuggestions,'text/html');
    const allowed=new Set(['style','div','span','a','svg','path','g','circle','rect','line','polyline','polygon','title']);
    for(const el of [...fragment.head.querySelectorAll('*'),...fragment.body.querySelectorAll('*')])if(!allowed.has(el.localName))el.remove();
    for(const el of fragment.querySelectorAll('*'))for(const attr of [...el.attributes]){
     if(attr.name.startsWith('on')||['srcdoc','action','formaction'].includes(attr.name))el.removeAttribute(attr.name);
     if(['href','src','xlink:href'].includes(attr.name)&&!/^https:\/\//i.test(attr.value))el.removeAttribute(attr.name);
    }
    fragment.querySelectorAll('a').forEach(a=>{a.target='_blank';a.rel='noopener noreferrer';});
    const shadow=panel.querySelector('#searchSuggestions').attachShadow({mode:'closed'});
    shadow.append(...fragment.head.childNodes,...fragment.body.childNodes);
   }
   panel.querySelectorAll('[data-apply-recommendation]').forEach(b=>b.onclick=()=>{
    const item=data.suggestions[Number(b.dataset.applyRecommendation)];
    if(b.dataset.fields!=='direction')$('#topic').value=item.topic;
    if(b.dataset.fields!=='topic')$('#direction').value=item.direction;
    state.dirty=true;invalidate();toast('추천을 적용했습니다. 내용을 확인하고 기획을 저장하세요.');
   });
  }catch(error){if(current===requestId&&panel.isConnected&&error.name!=='AbortError')panel.innerHTML=`<p class="recommendation-error" role="alert">${esc(error.message)}</p><p class="hint">입력한 내용은 유지됩니다. LLM 추천 버튼으로 다시 시도할 수 있습니다.</p>`;}
  finally{if(current===requestId&&panel.isConnected)busy(false);}
 });
 return invalidate;
}
function render(){
 editor?.destroy();editor=null;heading();progress();note();
 if(state.step===1)renderBrief();if(state.step===2)renderScenario();if(state.step===3)renderMedia();if(state.step===4)renderEditor();if(state.step===5)renderPublish();
 if(taskBusy() || state.project?.upload)document.querySelectorAll('#stage button,#stage input,#stage textarea,#stage select').forEach(b=>b.disabled=true);

}
function renderScenario(){
 const p=state.project;
 $('#stage').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>이야기를 장면으로 나누기</h2><p>AI가 만든 대사와 장면 설명을 읽고 자유롭게 다듬으세요.</p></div><span class="badge">2 / 5 시나리오</span></div>${p.scenes.length?`<label class="field"><span>영상 제목</span><input id="scriptTitle" maxlength="100" value="${esc(p.title)}"></label><div class="scene-list">${p.scenes.map((s,i)=>`<article class="scene-row" data-scene="${s.id}"><span class="scene-number">${String(i+1).padStart(2,'0')}</span><label class="field"><span>내레이션</span><textarea data-narration maxlength="1200">${esc(s.narration)}</textarea></label><label class="field visual-field"><span>장면 설명</span><textarea data-prompt maxlength="2000">${esc(s.prompt)}</textarea></label><label class="field"><span>길이 (초)</span><input data-duration type="number" min="1" max="30" step="0.1" value="${s.duration}"></label></article>`).join('')}</div>`:`<div class="empty"><div class="empty-icon">▤</div><h2>첫 장면은 어떤 모습일까요?</h2><p>${esc(p.brief.topic)}<br>설정한 주제와 분위기를 바탕으로 시나리오를 생성합니다.</p><button class="primary" id="generate">AI 시나리오 생성</button><small class="hint">Gemini API 사용료가 발생합니다.</small></div>`}
 ${!state.config?.capabilities?.scenario?'<p class="hint">생성하려면 제작 워커에 Gemini API 키를 등록하세요.</p>':''}<div class="actions"><button class="secondary" id="back">이전</button><div>${p.scenes.length?'<button class="secondary" id="regenerate">다시 생성</button><button class="secondary" id="save">대본 저장</button><button class="primary" id="next">이미지 · 영상 선택</button>':''}</div></div></section>`;
 $('#back').onclick=()=>run(async()=>{await saveCurrent();state.step=1;});
 const generate=()=>run(async()=>{if(p.scenes.length&&!confirm('다시 생성하면 기존 장면과 편집 결과를 새 대본으로 교체합니다. 생성할까요?'))return;await action('scenario',{confirm:true});});
 if($('#generate'))$('#generate').onclick=generate;if($('#regenerate'))$('#regenerate').onclick=generate;
 if($('#save'))$('#save').onclick=()=>run(async()=>{await saveCurrent();toast('대본을 저장했습니다.');});
 if($('#next'))$('#next').onclick=()=>run(async()=>{await saveCurrent();state.step=3;});
}
async function saveCurrent(){
 const p=state.project;if(!p||!state.dirty)return;
 if(state.step===2){const scenes=[...document.querySelectorAll('[data-scene]')].map(row=>({...p.scenes.find(s=>s.id===row.dataset.scene),narration:row.querySelector('[data-narration]').value,prompt:row.querySelector('[data-prompt]').value,duration:Number(row.querySelector('[data-duration]').value)}));await action('scenes',{title:$('#scriptTitle').value,scenes});}
 if(state.step===4)await saveEdit();
}
function mediaHTML(p,s,controls=false){if(!p.assets[s.id])return '<div class="placeholder">아직 생성한 미디어가 없습니다.</div>';return s.kind==='image'?`<img src="${assetUrl(p.id,s.id)}" alt="${esc(s.prompt)}">`:`<video src="${assetUrl(p.id,s.id)}" ${controls?'controls':'muted'} playsinline preload="metadata"></video>`;}
function renderMedia(){
 const p=state.project,ready=p.scenes.every(s=>p.assets[s.id]);
 $('#stage').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>장면에 어울리는 미디어 선택</h2><p>이미지와 영상을 섞어 만들 수 있습니다. 직접 제작한 파일도 사용할 수 있어요.</p></div><span class="badge">3 / 5 이미지 · 영상</span></div><div class="media-grid">${p.scenes.map((s,i)=>`<article class="media-card"><div class="media-view">${mediaHTML(p,s,true)}</div><div class="media-body"><div class="row"><strong>장면 ${i+1}</strong><select data-kind="${s.id}" aria-label="장면 ${i+1} 미디어 종류"><option value="image" ${s.kind==='image'?'selected':''}>이미지</option><option value="video" ${s.kind==='video'?'selected':''}>영상</option></select></div><p>${esc(s.narration)}</p><small class="muted">${s.duration}초 · ${p.assets[s.id]?'준비 완료':'생성 대기'}</small><br><label class="file-label">내 ${s.kind==='image'?'이미지':'영상'} 파일 사용<input type="file" data-file="${s.id}" accept="${s.kind==='image'?'image/png,image/jpeg,image/webp':'video/mp4'}"></label></div></article>`).join('')}</div><label class="check"><input id="approve" type="checkbox" ${p.approved?'checked':''}>대본의 사실·표현과 장면 설명을 검수했습니다. AI 생성 요청 시 사용료가 발생함을 확인합니다.</label><p class="hint">영상 생성은 장면별 8초 클립을 사용합니다. 편집 길이가 더 길면 해당 클립을 반복합니다. 사용권이 있는 파일만 등록하세요.</p><div class="actions"><button class="secondary" id="back">시나리오 수정</button><div><button class="secondary" id="approveOnly">검수 승인</button><button class="primary" id="generateMedia">${ready?'미디어 준비 완료':'미생성 장면 만들기'}</button><button class="primary" id="next" ${!ready||!p.approved?'disabled':''}>편집하기</button></div></div></section>`;
 $('#generateMedia').disabled=ready;
 $('#approveOnly').onclick=()=>run(async()=>{if(!$('#approve').checked)throw Error('대본 검수 확인을 체크하세요.');await action('approve',{approved:true});toast('검수 승인했습니다.');});
 $('#generateMedia').onclick=()=>run(async()=>{if(!$('#approve').checked)throw Error('대본 검수 확인을 체크하세요.');await action('media',{approved:true});});
 $('#back').onclick=()=>{state.step=2;render();};$('#next').onclick=()=>{state.step=4;render();};
 document.querySelectorAll('[data-kind]').forEach(select=>select.onchange=()=>run(async()=>{if(p.assets[select.dataset.kind]&&!confirm('미디어 종류를 바꾸면 해당 장면을 다시 생성해야 합니다. 변경할까요?'))return;await action('scenes',{title:p.title,scenes:p.scenes.map(s=>s.id===select.dataset.kind?{...s,kind:select.value}:s)});}));
 document.querySelectorAll('[data-file]').forEach(input=>input.onchange=()=>run(async()=>{const s=p.scenes.find(s=>s.id===input.dataset.file);if(!p.approved)throw Error('먼저 검수 승인을 눌러주세요.');await uploadFile(input.files[0],s.kind,s.id);}));
}
async function uploadFile(file,kind,scene){
 if(!file)return;if(file.size>50*1024*1024)throw Error('파일은 50MB 이하로 선택하세요.');
 if(!confirm('직접 제작했거나 이 영상에 사용할 권리가 있는 파일인가요?'))return;
 const params=new URLSearchParams({rights:'confirmed',kind,name:file.name,...(scene?{scene}:{})});
 const data=await api(`/${state.project.id}/assets?${params}`,{method:'POST',headers:{'content-type':file.type|| (file.name.endsWith('.mp3')?'audio/mpeg':'application/octet-stream')},body:file});state.project=data.project;state.dirty=false;toast('파일을 등록했습니다.');
}
function renderEditor(){
 editor=createEditor($('#stage'),state.project,state.config,{
  toast,dirty:value=>state.dirty=value,
  save:edit=>action('edit',edit),
  upload:async file=>{const before=Object.keys(state.project.assets);await uploadFile(file,'audio');const id=Object.keys(state.project.assets).find(k=>!before.includes(k));return id?{project:state.project,id}:null;},
  render:async()=>{await action('render');render();},
  navigate:step=>{state.step=step;render();},
 });
}
async function saveEdit(){if(editor)await editor.save();}
function renderPublish(){
 const p=state.project;
 $('#stage').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>마지막 확인, 그리고 업로드</h2><p>최종 영상을 확인하고 게시할 플랫폼을 선택하세요.</p></div><span class="badge">5 / 5 업로드</span></div>${p.upload?`<div class="upload-results"><strong>${p.upload.state==='done'?'업로드 완료':p.upload.state==='failed'?'일부 또는 전체 업로드 실패':p.upload.state==='submitting'?'업로드 전송 중 · 접수 여부 확인 필요':'업로드 접수 완료 · 플랫폼 처리 중'}</strong><p class="hint">${esc(p.upload.message||'')}${p.upload.requestId?'요청 ID: '+esc(p.upload.requestId):''}</p>${(p.upload.results||[]).map(r=>`<p>${esc(platformNames[r.platform]||r.platform)}: ${r.url&&/^https:\/\//.test(r.url)?`<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">게시 영상 열기 ↗</a>`:esc(r.error|| (r.success?'완료':'실패'))}</p>`).join('')}</div>`:''}<div class="publish-grid"><div><div class="final-preview">${p.render?`<video src="${assetUrl(p.id,'final')}" controls playsinline preload="metadata"></video>`:'최종 영상을 먼저 만들어주세요.'}</div><p class="hint">${p.brief.aspect} · ${p.render?.duration||0}초 · AI 생성 콘텐츠</p></div><div><span class="label">업로드 플랫폼</span><div class="platforms">${['youtube','instagram','tiktok'].map(key=>`<label class="platform"><input type="checkbox" name="platform" value="${key}" ${p.publication?.platforms.includes(key)||(!p.publication&&key==='youtube')?'checked':''} ${p.brief.format==='long'&&key!=='youtube'?'disabled':''}> ${platformNames[key]}</label>`).join('')}</div><p class="hint" style="margin-bottom:22px">${p.brief.format==='long'?'롱폼은 YouTube 연결 계정으로 업로드합니다.':'제작 워커에 연결된 Upload-Post 계정으로 업로드합니다. Instagram·TikTok 공개 범위는 해당 플랫폼 계정 설정을 따릅니다.'}<br>Google 로그인 계정과 업로드 채널은 별도입니다.</p><label class="field"><span>게시 제목</span><input id="publishTitle" maxlength="100" value="${esc(p.publication?.title||p.title)}"></label><label class="field"><span>설명</span><textarea id="description" maxlength="4000">${esc(p.publication?.description||p.brief.topic)}</textarea><small class="hint">AI 생성 고지${p.brief.category==='상품광고'?'와 (광고) 표기':''}가 자동으로 추가됩니다.</small></label><label class="field"><span>YouTube 공개 범위</span><select id="privacy">${[['private','비공개'],['unlisted','일부 공개'],['public','전체 공개']].map(([v,n])=>`<option value="${v}" ${p.publication?.privacy===v?'selected':''}>${n}</option>`).join('')}</select></label><label class="check"><input id="reviewed" type="checkbox">최종 영상·음원 사용권·표현·게시 계정을 확인했습니다. 선택한 플랫폼으로 업로드합니다.</label></div></div><div class="actions"><button class="secondary" id="back">편집으로 돌아가기</button><button class="primary" id="publish" ${!p.render||p.upload?'disabled':''}>선택한 플랫폼에 업로드</button></div></section>`;
 $('#back').onclick=()=>{state.step=4;render();};$('#publish').onclick=()=>run(async()=>{if(!$('#reviewed').checked)throw Error('최종 검수 확인을 체크하세요.');await action('publish',{reviewed:true,platforms:[...document.querySelectorAll('[name=platform]:checked')].map(x=>x.value),privacy:$('#privacy').value,title:$('#publishTitle').value,description:$('#description').value});});
}
async function openProject(id){
 if(state.dirty)await saveCurrent();
 state.project=(await api('/'+id)).project;state.selected=null;state.dirty=false;
 const p=state.project;state.step=p.render||p.upload?5:p.scenes.length?(p.approved&&p.scenes.every(s=>p.assets[s.id])?4:3):2;
 $('#modes').hidden=true;$('#workspace').hidden=false;$('#projects').hidden=true;history.replaceState(null,'',`/studio?id=${p.id}`);render();
}
async function loadList(){const {projects}=await api();$('#projectList').innerHTML=projects.length?projects.map(p=>`<button class="project-entry" data-project="${p.id}"><span><strong>${esc(p.title)}</strong><small>${esc(p.brief.category)} · ${p.brief.format==='short'?'숏폼':'롱폼'} · ${new Date(p.updatedAt).toLocaleDateString('ko-KR')}</small></span><span class="badge">${p.upload?.state==='done'?'업로드 완료':p.task?.state==='failed'?'작업 확인 필요':p.task&&['running','queued'].includes(p.task.state)?taskNames[p.task.action]+' 중':p.render?'업로드 준비':p.scenes.length?'제작 중':'기획 완료'}</span></button>`).join(''):'<div class="empty"><h3>첫 번째 이야기를 기다리고 있어요</h3><p>위에서 자동 또는 수동 제작을 선택하세요.</p></div>';document.querySelectorAll('[data-project]').forEach(b=>b.onclick=()=>run(()=>openProject(b.dataset.project)));}
$('#manual').onclick=()=>{if(!state.config){toast('서버 연결 상태를 먼저 확인하세요.');return;}start();};$('#newProject').onclick=()=>{if(state.pending)return;if(state.dirty&&!confirm('저장하지 않은 변경이 있습니다. 새 프로젝트를 시작할까요?'))return;start();};
$('#stage').addEventListener('input',()=>{if(state.step!==4)state.dirty=true;});
window.addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue='';}});
(async()=>{try{state.config=await api('/config');const auth=await(await fetch('/auth/status')).json();if(auth.user)$('#account').textContent=auth.user.name||auth.user.email;const id=new URLSearchParams(location.search).get('id');if(id)await openProject(id);else if(new URLSearchParams(location.search).has('new'))start();else await loadList();}catch(e){$('#notice').innerHTML=`<div class="status-note error">${esc(e.message)}</div>`;}})();
setInterval(async()=>{if(state.pending||state.dirty)return;try{if(state.project&&taskBusy()){const p=(await api('/'+state.project.id)).project;if(p.revision!==state.project.revision){const previous=state.project.task;state.project=p;if(p.task?.state==='done'&&previous?.state!=='done'){if(p.task.action==='scenario')state.step=2;if(p.task.action==='render'||p.task.action==='publish')state.step=5;}render();}}}catch(e){toast(e.message);}},4000);
