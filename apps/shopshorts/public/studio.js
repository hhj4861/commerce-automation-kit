import {executionStatus,renderExecutionStatus,resumeStep} from './studio-status.js';
import {mediaProgress,mediaSceneStatus,renderMediaProgress,renderMediaPlaceholder} from './studio-media.js';
import {createEditor} from './editor.js';
import {connectLlm,recommendWithAccount,waitForRecommendation} from './llm-connection.js';
import {createNotificationInbox} from './notifications.js';
import {createRecommendationFocus} from './recommendation-focus.js';
import {frameCount,FPS} from './editor-model.js';
let editor=null, recommendationController=null, recommendationCleanup=null, restoreRecommendation=null;
'use strict';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = { project:null, step:1, config:null, category:'심리학', format:'short', selected:null, dirty:false, pending:false, previewTimer:null };
const names = ['기획','시나리오','이미지 · 영상','편집','업로드'];
const platformNames = {youtube:'YouTube',instagram:'Instagram',tiktok:'TikTok'};
const taskNames = {scenario:'시나리오 생성',media:'이미지·영상 생성',narration:'대본 음성 생성',render:'최종 영상 만들기',publish:'플랫폼 업로드'};
const taskBusy = () => ['queued','running'].includes(state.project?.task?.state);
const total = p => p.edit?.version===2 ? Math.round(frameCount(p.edit)/FPS*100)/100 : p.edit ? p.edit.order.reduce((sum,id) => sum + p.edit.durations[id],0) : p.scenes.reduce((sum,s) => sum+s.duration,0);
const assetUrl = (id, asset) => `/api/studio/${id}/assets/${encodeURIComponent(asset)}?v=${state.project?.revision || 0}`;
function toast(text){ $('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,5000); }
const recommendationInbox=createNotificationInbox({document,recommendations:true,openJob:id=>location.assign('/?job='+encodeURIComponent(id)),openStudio:id=>location.assign('/studio?id='+encodeURIComponent(id)),openRecommendation:id=>location.assign('/studio?new=1&recommendation='+encodeURIComponent(id))});
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
async function action(name,body={}){const r=await post(`/${state.project.id}/${name}`,{revision:state.project.revision,...body});state.project=r.project;state.dirty=false;state.mediaRequestError='';return r.project;}
function progress(){
 const p=state.project;const highest=!p?1:!p.scenes.length?2:!p.approved||p.scenes.some(s=>!p.assets[s.id])?3:!p.render?4:5;
 $('#steps').innerHTML=names.map((name,i)=>`<button class="step ${state.step===i+1?'active':i+1<highest?'done':''}" data-step="${i+1}" ${i+1>highest?'disabled':''} ${state.step===i+1?'aria-current="step"':''}><span>${i+1<highest?'✓':i+1}</span>${name}</button>`).join('');
 $('#steps').querySelectorAll('button').forEach(b=>b.onclick=()=>run(async()=>{await saveCurrent();state.step=Number(b.dataset.step);render();}));
}
function note(){
 if(state.step===3 && state.project && (!state.project.task || state.project.task.action==='media')){$('#notice').innerHTML='';updateMediaStatus();return;}
 $('#notice').innerHTML=renderExecutionStatus(executionStatus(state));
 const button=$('[data-execution-action]');
 if(button)button.onclick=()=>run(async()=>{
  const action=button.dataset.executionAction;
  if(action==='retry'){state.step=2;await generateScenario();}
  else if(action==='connect')await connectLlm({manage:true});
  await refreshConnection();
 });
}
async function refreshConnection(){
 try{state.config=await api('/config');state.connectionUnknown=false;}
 catch{state.connectionUnknown=true;}
 note();
}
async function generateScenario(){
 if(state.project.scenes.length&&!confirm('다시 생성하면 기존 장면과 편집 결과를 새 대본으로 교체합니다. 생성할까요?'))return;
 if(!await connectLlm())return;
 await action('scenario',{confirm:true});await refreshConnection();
}
function heading(){
 const p=state.project;$('.heading h1').textContent=p?p.title:'내 이야기로 시작하기';
 $('#intro').textContent=p?`${p.brief.category} · ${p.brief.format==='short'?'숏폼 9:16':'롱폼 16:9'} · ${p.scenes.length?p.scenes.length+'장면 / '+total(p)+'초':p.brief.duration+'초 목표'}`:'주제와 영상 형식을 정하면 AI가 시나리오를 작성합니다.';
 $('#newProject').hidden=false;
}
function start(){recommendationController?.abort('detached');editor?.destroy();editor=null;state.project=null;state.step=1;state.dirty=false;state.mediaRequestError='';state.requestingMedia=false;$('#modes').hidden=true;$('#workspace').hidden=false;$('#projects').hidden=true;history.replaceState(null,'','/studio?new=1');heading();progress();renderBrief();}
function renderBrief(){
 recommendationCleanup?.(); recommendationCleanup=null;
 const p=state.project, brief=p?.brief;
 const cats=state.config?.categories || ['심리학','건축학','상품광고','막장드라마','역사','과학','직접 입력'];
 if(brief){state.category=brief.category;state.format=brief.format;}
 $('#stage').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>이야기의 출발점을 정하세요</h2><p>관심 있는 주제와 원하는 분위기를 알려주세요.</p></div><span class="badge">1 / 5 기획</span></div><div class="brief-grid"><div><div class="field"><span>카테고리</span><div class="chips">${cats.map(c=>`<button class="chip ${c===state.category?'selected':''}" data-category="${esc(c)}" aria-pressed="${c===state.category}" ${p?'disabled':''}>${esc(c)}</button>`).join('')}</div></div><div class="field"><div class="field-title"><label for="topic">어떤 이야기를 만들까요?</label>${!p?'<button type="button" class="recommend-button" data-recommend="topic">✦ LLM 추천</button>':''}</div><textarea id="topic" maxlength="1000" placeholder="예: 사람은 왜 미루는 걸까? 일상 속 심리학을 쉽게 설명하는 영상" ${p?'readonly':''}>${esc(brief?.topic || '')}</textarea></div><div class="field"><div class="field-title"><label for="direction">분위기와 요청사항 <small class="muted">선택</small></label>${!p?'<button type="button" class="recommend-button" data-recommend="direction">✦ LLM 추천</button>':''}</div><textarea id="direction" maxlength="2000" placeholder="예: 친근한 말투, 따뜻한 일러스트, 마지막에 실천 팁 한 가지" ${p?'readonly':''}>${esc(brief?.direction || '')}</textarea></div>${!p?'<p class="hint">선택한 카테고리의 최근 검색 자료로 3가지 기획을 추천합니다. 연결한 AI 계정으로 추천받으며, 계정이 없으면 연결 화면이 열립니다.</p><section id="recommendations" class="recommendations" aria-label="LLM 추천 결과" hidden></section>':''}</div><div><span class="label">영상 형식</span><div class="formats"><button class="format ${state.format==='short'?'selected':''}" data-format="short" ${p?'disabled':''}><span class="ratio">9:16</span><strong>숏폼</strong><small>짧고 선명한 이야기</small></button><button class="format ${state.format==='long'?'selected':''}" data-format="long" ${p?'disabled':''}><span class="ratio landscape">16:9</span><strong>롱폼</strong><small>깊이 있게 풀어내는 이야기</small></button></div><label class="field" style="margin-top:24px"><span>목표 길이</span><select id="duration" ${p?'disabled':''}></select><small class="hint">숏폼은 최대 3분, 롱폼은 최대 10분까지 제작합니다.</small></label><p class="muted">${p?'프로젝트 기획은 저장되어 있습니다. 다른 기획은 새 프로젝트에서 시작하세요.':'광고는 사실에 근거해 작성하고, 생성한 대본을 직접 확인한 뒤 제작을 시작합니다.'}</p></div></div><div class="actions"><span class="save-state">${p?'저장된 기획':'기획 저장 후 다음 단계에서 시나리오를 생성합니다.'}</span><button class="primary" id="create">${p?'시나리오 보기':'기획 저장 · 다음 단계'}</button></div></section>`;
 function durations(){const values=state.format==='short'?[24,32,48,60,90,120,180]:[120,180,300,600];$('#duration').innerHTML=values.map(v=>`<option value="${v}">${v<60?v+'초':v/60+'분'}</option>`).join('');if(brief)$('#duration').value=brief.duration;}
 durations();
 const invalidateRecommendations=bindRecommendations(p);
 document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{state.category=b.dataset.category;invalidateRecommendations();document.querySelectorAll('[data-category]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});});
 document.querySelectorAll('[data-format]').forEach(b=>b.onclick=()=>{state.format=b.dataset.format;invalidateRecommendations();document.querySelectorAll('[data-format]').forEach(x=>x.classList.toggle('selected',x===b));durations();});
 $('#create').onclick=()=>run(async()=>{if(!p){const r=await post('',{category:state.category,format:state.format,topic:$('#topic').value,direction:$('#direction').value,duration:Number($('#duration').value)});state.project=r.project;state.dirty=false;history.replaceState(null,'',`/studio?id=${r.project.id}`);}state.step=2;render();});
}
function bindRecommendations(project){
 if(project)return()=>{};
 const panel=$('#recommendations'),buttons=[...document.querySelectorAll('[data-recommend]')];let requestId=0,activeFocus=null;
 const views=new Map();
 const manage=document.createElement('button');manage.type='button';manage.className='quiet';manage.textContent='AI 계정 연결 관리';panel.before(manage);
 manage.onclick=()=>connectLlm({manage:true}).catch(e=>toast(e.message));
 const form=focus=>({category:state.category,format:state.format,duration:Number($('#duration').value),focus,topic:$('#topic').value,direction:$('#direction').value});
 const areas=Object.fromEntries(buttons.map(button=>{
  const area=document.createElement('div');area.className='recommend-summary';area.hidden=true;area.dataset.recommendProgress=button.dataset.recommend;
  area.setAttribute('role','status');button.closest('.field').append(area);return[button.dataset.recommend,area];
 }));
 const busy=value=>{buttons.forEach(b=>{b.disabled=value;b.textContent=value&&b.dataset.recommend===activeFocus?'추천 중…':'✦ LLM 추천';});manage.disabled=value;};
 const invalidate=()=>{requestId++;recommendationController?.abort('detached');busy(false);activeFocus=null;views.forEach(view=>view.destroy());views.clear();Object.values(areas).forEach(area=>{area.hidden=true;area.replaceChildren();});};
 recommendationCleanup=invalidate;
 for(const id of ['topic','direction','duration'])$('#'+id).addEventListener('input',invalidate);
 const execute=async(button,saved)=>{
  const input=saved?.input || form(button.dataset.recommend);
  if(input.focus==='direction'&&!input.topic.trim()){toast('분위기를 추천받을 주제를 먼저 입력하세요.');$('#topic').focus();return;}
  if(input.category==='직접 입력'&&!input.topic.trim()){toast('관심 분야나 주제를 먼저 입력하세요.');$('#topic').focus();return;}
  const current=++requestId;recommendationController=new AbortController();activeFocus=input.focus;busy(true);
  const controller=recommendationController;
  views.get(input.focus)?.destroy();
  const view=createRecommendationFocus({input,anchor:button,summary:areas[input.focus],onCancel:()=>controller.abort('cancelled'),onBackground:()=>toast('추천은 계속 진행됩니다. 완료되면 알림함에서 확인하세요.'),onRetry:()=>button.click(),onApply:(item,fields)=>{
   if(fields!=='direction')$('#topic').value=item.topic;
   if(fields!=='topic')$('#direction').value=item.direction;
   state.dirty=true;invalidate();const target=$(fields==='direction'?'#direction':'#topic');target.focus();target.scrollIntoView({block:'center',behavior:'instant'});toast('추천을 적용했습니다. 내용을 확인하고 기획을 저장하세요.');
  }});
  views.set(input.focus,view);
  try{
   if(saved?.state==='failed')throw Error(saved.error || '추천을 완료하지 못했어요. 다시 시도해 주세요.');
   const onProgress=value=>{if(current===requestId)view.update(value);};
   const data=saved?.state==='done'?saved.result:saved?await waitForRecommendation(saved.id,controller.signal,onProgress):await recommendWithAccount(input,controller.signal,onProgress);
   if(current!==requestId||!panel.isConnected||JSON.stringify(form(input.focus))!==JSON.stringify(input))return;
   view.complete(data,{saved:!!saved,elapsedMs:saved?.elapsedMs});recommendationInbox.refresh();
   if(!document.querySelector('.recommend-dialog[open]'))toast('AI 추천이 완료됐어요. 알림함에서 결과를 확인하세요.');
  }catch(error){if(current===requestId&&panel.isConnected){view.fail(error);recommendationInbox.refresh();}}
  finally{if(current===requestId&&panel.isConnected){busy(false);if(controller.signal.aborted&&!document.querySelector('dialog[open]'))button.focus({preventScroll:true});}}
 };
 buttons.forEach(button=>button.onclick=()=>execute(button));
 restoreRecommendation=saved=>execute(buttons.find(button=>button.dataset.recommend===saved.input.focus),saved);
 return invalidate;
}
function render(){
 if(state.step!==1){recommendationCleanup?.();recommendationCleanup=null;}
 editor?.destroy();editor=null;heading();progress();note();
 if(state.step===1)renderBrief();if(state.step===2)renderScenario();if(state.step===3)renderMedia();if(state.step===4)renderEditor();if(state.step===5)renderPublish();
 if(state.pending || taskBusy() || state.project?.upload)document.querySelectorAll('#stage button,#stage input,#stage textarea,#stage select').forEach(b=>b.disabled=true);

}
function renderScenario(){
 const p=state.project;
 $('#stage').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>이야기를 장면으로 나누기</h2><p>AI가 만든 대사와 장면 설명을 읽고 자유롭게 다듬으세요.</p></div><span class="badge">2 / 5 시나리오</span></div>${p.scenes.length?`<label class="field"><span>영상 제목</span><input id="scriptTitle" maxlength="100" value="${esc(p.title)}"></label><div class="scene-list">${p.scenes.map((s,i)=>`<article class="scene-row" data-scene="${s.id}"><span class="scene-number">${String(i+1).padStart(2,'0')}</span><label class="field"><span>내레이션</span><textarea data-narration maxlength="1200">${esc(s.narration)}</textarea></label><label class="field visual-field"><span>장면 설명</span><textarea data-prompt maxlength="2000">${esc(s.prompt)}</textarea></label><label class="field"><span>길이 (초)</span><input data-duration type="number" min="1" max="30" step="0.1" value="${s.duration}"></label></article>`).join('')}</div>`:`<div class="empty"><div class="empty-icon">▤</div><h2>${taskBusy()?'대사와 장면이 여기에 모입니다':'첫 장면은 어떤 모습일까요?'}</h2><p>${esc(p.brief.topic)}<br>${taskBusy()?'완성되면 장면별 대사와 화면 구성을 확인할 수 있어요.':'설정한 주제와 분위기를 바탕으로 시나리오를 생성합니다.'}</p>${taskBusy()?'<div class="scenario-deliverables"><span>대사</span><span>장면 설명</span><span>장면별 길이</span></div>':p.task?.state==='failed'?'':'<button class="primary" id="generate">AI 시나리오 생성</button>'}<small class="hint">연결한 AI 계정의 구독 사용량으로 생성합니다.</small></div>`}
 <div class="actions"><button class="secondary" id="back">이전</button><div>${p.scenes.length?'<button class="secondary" id="regenerate">다시 생성</button><button class="secondary" id="save">대본 저장</button><button class="primary" id="next">이미지 · 영상 선택</button>':''}</div></div></section>`;
 $('#back').onclick=()=>run(async()=>{await saveCurrent();state.step=1;});
 const generate=()=>run(generateScenario);
 if($('#generate'))$('#generate').onclick=generate;if($('#regenerate'))$('#regenerate').onclick=generate;
 if($('#save'))$('#save').onclick=()=>run(async()=>{await saveCurrent();toast('대본을 저장했습니다.');});
 if($('#next'))$('#next').onclick=()=>run(async()=>{await saveCurrent();state.step=3;});
}
async function saveCurrent(){
 const p=state.project;if(!p||!state.dirty)return;
 if(state.step===2){const scenes=[...document.querySelectorAll('[data-scene]')].map(row=>({...p.scenes.find(s=>s.id===row.dataset.scene),narration:row.querySelector('[data-narration]').value,prompt:row.querySelector('[data-prompt]').value,duration:Number(row.querySelector('[data-duration]').value)}));await action('scenes',{title:$('#scriptTitle').value,scenes});}
 if(state.step===4)await saveEdit();
}
function mediaHTML(p,s,controls=false){if(!p.assets[s.id])return `<div data-media-placeholder="${s.id}">${renderMediaPlaceholder(mediaProgress(state),s)}</div>`;return s.kind==='image'?`<img src="${assetUrl(p.id,s.id)}" alt="${esc(s.prompt)}">`:`<video src="${assetUrl(p.id,s.id)}" ${controls?'controls':'muted'} playsinline preload="metadata"></video>`;}
function renderMedia(){
 const p=state.project,ready=p.scenes.every(s=>p.assets[s.id]),mediaState=mediaProgress(state);
 $('#stage').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>장면에 어울리는 미디어 선택</h2><p>이미지와 영상을 섞어 만들 수 있습니다. 직접 제작한 파일도 사용할 수 있어요.</p></div><span class="badge">3 / 5 이미지 · 영상</span></div><div id="mediaStatus">${renderMediaProgress(mediaState)}</div><div class="media-grid">${p.scenes.map((s,i)=>`<article class="media-card"><div class="media-view">${mediaHTML(p,s,true)}</div><div class="media-body"><div class="row"><strong>장면 ${i+1}</strong><select data-kind="${s.id}" aria-label="장면 ${i+1} 미디어 종류"><option value="image" ${s.kind==='image'?'selected':''}>이미지</option><option value="video" ${s.kind==='video'?'selected':''}>영상</option></select></div><p>${esc(s.narration)}</p><details><summary>화면 구상</summary><p class="hint">${esc(s.prompt)}</p></details>${p.assets[s.id]?`<button class="secondary" data-remake-scene="${s.id}" ${taskBusy()?'disabled':''}>대본·자막에 맞춰 다시 만들기</button>`:''}<small class="muted">${s.duration}초 · <span data-media-scene-status="${s.id}">${mediaSceneStatus(mediaState,s,p.assets[s.id]).label}</span></small><br><label class="file-label">내 ${s.kind==='image'?'이미지':'영상'} 파일 사용<input type="file" data-file="${s.id}" accept="${s.kind==='image'?'image/png,image/jpeg,image/webp':'video/mp4'}"></label></div></article>`).join('')}</div><label class="check"><input id="approve" type="checkbox" ${p.approved?'checked':''}>대본의 사실·표현과 장면 설명을 검수했습니다. AI 생성 요청 시 사용료가 발생함을 확인합니다.</label><p class="hint">${state.config?.capabilities?.mediaProvider==='higgsfield'?'Higgsfield 구독 크레딧으로 생성합니다. 웹 무제한 혜택은 적용되지 않습니다. 영상은 장면당 4~15초로 생성합니다.':'영상 생성은 장면별 8초 클립을 사용합니다.'} 편집 길이가 더 길면 해당 클립을 반복합니다. 사용권이 있는 파일만 등록하세요.</p><div class="actions"><button class="secondary" id="back">시나리오 수정</button><div><button class="secondary" id="approveOnly">검수 승인</button><button class="primary" id="generateMedia">${state.requestingMedia?'요청 접수 중…':mediaState.active?'장면 생성 중…':ready?'미디어 준비 완료':['failed','incomplete'].includes(mediaState.kind)?'미완료 장면 다시 생성':'미생성 장면 만들기'}</button><button class="primary" id="next" ${!ready||!p.approved?'disabled':''}>편집하기</button></div></div></section>`;
 $('#generateMedia').disabled=ready;
 $('#approveOnly').onclick=()=>run(async()=>{if(!$('#approve').checked)throw Error('대본 검수 확인을 체크하세요.');await action('approve',{approved:true});toast('검수 승인했습니다.');});
 $('#generateMedia').onclick=()=>run(async()=>{
  if(!$('#approve').checked){state.mediaRequestError='대본 검수 확인을 체크한 뒤 생성해 주세요.';return;}
  state.mediaRequestError='';state.requestingMedia=true;render();$('#mediaStatus')?.scrollIntoView({block:'nearest'});
  try{await action('media',{approved:true});}
  catch(e){state.mediaRequestError=e.message;}
  finally{state.requestingMedia=false;}
 });
 $('#back').onclick=()=>{state.step=2;render();};$('#next').onclick=()=>{state.step=4;render();};
 document.querySelectorAll('[data-remake-scene]').forEach(button=>button.onclick=()=>run(async()=>{if(!$('#approve').checked)throw Error('대본 검수와 생성 사용료 확인을 체크해 주세요.');await action('media',{approved:true,sceneId:button.dataset.remakeScene});render();}));
 document.querySelectorAll('[data-kind]').forEach(select=>select.onchange=()=>run(async()=>{if(p.assets[select.dataset.kind]&&!confirm('미디어 종류를 바꾸면 해당 장면을 다시 생성해야 합니다. 변경할까요?'))return;await action('scenes',{title:p.title,scenes:p.scenes.map(s=>s.id===select.dataset.kind?{...s,kind:select.value}:s)});}));
 document.querySelectorAll('[data-file]').forEach(input=>input.onchange=()=>run(async()=>{const s=p.scenes.find(s=>s.id===input.dataset.file);if(!p.approved)throw Error('먼저 검수 승인을 눌러주세요.');await uploadFile(input.files[0],s.kind,s.id);}));
}
function updateMediaStatus(){
 const host=$('#mediaStatus');if(!host || !state.project)return;
 const status=mediaProgress(state),html=renderMediaProgress(status);
 if(host.innerHTML!==html)host.innerHTML=html;
 for(const scene of state.project.scenes){
  const placeholder=document.querySelector(`[data-media-placeholder="${scene.id}"]`);
  if(placeholder){const content=renderMediaPlaceholder(status,scene);if(placeholder.innerHTML!==content)placeholder.innerHTML=content;}
  const label=document.querySelector(`[data-media-scene-status="${scene.id}"]`);
  if(label)label.textContent=mediaSceneStatus(status,scene,state.project.assets[scene.id]).label;
 }
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
  narration:async()=>{await action('narration');render();},
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
 state.project=(await api('/'+id)).project;state.selected=null;state.dirty=false;state.mediaRequestError='';
 const p=state.project;state.step=resumeStep(p);
 $('#modes').hidden=true;$('#workspace').hidden=false;$('#projects').hidden=true;history.replaceState(null,'',`/studio?id=${p.id}`);render();
}
$('#manual').onclick=()=>{if(!state.config){toast('서버 연결 상태를 먼저 확인하세요.');return;}start();};$('#newProject').onclick=()=>{if(state.pending)return;if(state.dirty&&!confirm('저장하지 않은 변경이 있습니다. 새 프로젝트를 시작할까요?'))return;start();};
$('#stage').addEventListener('input',()=>{if(state.step!==4)state.dirty=true;});
window.addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue='';}});
(async()=>{try{state.config=await api('/config');const auth=await(await fetch('/auth/status')).json();if(auth.user)$('#account').textContent=auth.user.name||auth.user.email;const params=new URLSearchParams(location.search),id=params.get('id'),recommendationId=params.get('recommendation');if(recommendationId){const saved=(await api('/llm/recommendation?id='+encodeURIComponent(recommendationId))).recommendation;start();state.category=saved.input.category;state.format=saved.input.format;renderBrief();$('#topic').value=saved.input.topic;$('#direction').value=saved.input.direction;$('#duration').value=saved.input.duration;history.replaceState(null,'','/studio?new=1&recommendation='+encodeURIComponent(recommendationId));restoreRecommendation(saved);}else if(id)await openProject(id);else if(params.has('new'))start();recommendationInbox.refresh();}catch(e){$('#notice').innerHTML=`<div class="status-note error">${esc(e.message)}</div>`;}})();
let checkingExecution=false;
setInterval(async()=>{if(state.pending||checkingExecution||document.hidden)return;checkingExecution=true;try{await refreshConnection();if(state.project&&taskBusy()&&!state.dirty){const p=(await api('/'+state.project.id)).project;if(p.revision!==state.project.revision){const previous=state.project.task;state.project=p;if(p.task?.state==='done'&&previous?.state!=='done'){if(p.task.action==='scenario')state.step=2;if(p.task.action==='render'||p.task.action==='publish')state.step=5;}render();}}}catch{state.connectionUnknown=true;note();}finally{checkingExecution=false;}},4000);

setInterval(()=>{if(!document.hidden)recommendationInbox.poll();},5000);
