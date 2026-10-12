const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const busy = p => ['queued','running'].includes(p?.task?.state);
let project=null, config=null, pending=false, file=null, localUrl=null, chosen=0, loading=false;
async function api(path='',options={}) {
  const response=await fetch('/api/studio'+path,options);
  if(response.status===401){location.assign('/login');throw Error('로그인 후 다시 시도하세요.');}
  const data=await response.json();if(!response.ok)throw Error(data.error||'요청을 처리하지 못했습니다. 다시 시도하세요.');return data;
}
const post=(path,body)=>api(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
function error(e){$('#error').textContent=e.message;$('#error').hidden=false;}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,4000);}
function controls(){
  const active=pending||loading||busy(project);
  for(const id of ['project','video-file','format'])$('#'+id).disabled=active;
  $('#recommend').disabled=active||!config?.capabilities?.metadata||!(file||project?.metadataSource||project?.render)||!!project?.upload;
  $('#recommend').textContent=active?'추천 준비 중…':project?.metadataResult?'다시 분석하고 추천받기':'영상 분석하고 추천받기';
}
function showSource(){
  const select=$('#project');
  if(project){
    let option=[...select.options].find(o=>o.value===project.id);
    if(!option){option=new Option('',project.id);select.add(option);}
    option.textContent=project.metadataSource?.name||project.title;
  }
  select.value=project?.id||'';
  if(localUrl){URL.revokeObjectURL(localUrl);localUrl=null;}
  const video=$('#preview');
  if(file){localUrl=URL.createObjectURL(file);video.src=localUrl;}
  else if(project?.purpose==='metadata'&&project.metadataSource)video.src=`/api/studio/${project.id}/metadata-source?v=${project.revision}`;
  else if(project?.render)video.src=`/api/studio/${project.id}/assets/final?v=${project.revision}`;
  else video.removeAttribute('src');
  video.hidden=!video.getAttribute('src');
  $('#source-name').textContent=file?.name||project?.metadataSource?.name||project?.title||'';
  $('#file-area').hidden=!!project&&project.purpose!=='metadata';
}
async function load(id){
  if(pending||loading)return;loading=true;controls();$('#error').hidden=true;
  try{
    project=id?(await api('/'+encodeURIComponent(id))).project:null;
    file=null;chosen=0;
    history.replaceState(null,'',id?'/metadata?id='+encodeURIComponent(id):'/metadata');
    $('#format').value=project?.metadataResult?.format||project?.task?.format||'auto';
    showSource();render();
  }catch(e){error(e);}finally{loading=false;controls();}
}
const day=iso=>new Date(iso).toLocaleDateString('ko-KR');
function render(){
  const task=project?.task;
  $('#status').textContent=busy(project)?(project.metadataProgress?.message||'작업이 끝나면 추천 결과가 이곳에 저장됩니다. 잠시 다른 화면으로 이동해도 괜찮아요.') : '';
  if(task?.action==='metadata'&&task.state==='failed')error(Error(task.error||'추천을 완료하지 못했습니다. 다시 시도하세요.'));
  const result=file?null:project?.metadataResult;
  if(!result){$('#results').innerHTML='<div class="metadata-empty"><h2>영상의 내용을 바탕으로 추천합니다.</h2><p>화면·자막·음성 분석 후, 최근 3개월의 유사 영상과 비교합니다.</p><p class="hint">결과에는 복사할 문구와 추천 이유, 실제로 참고한 영상이 함께 표시됩니다.</p></div>';controls();return;}
  const current=result.sourceKey===(project.purpose==='metadata'?project.metadataSource?.key:project.render?.key);
  const stale=Date.now()-Date.parse(result.checkedAt)>30*86400000;
  const a=result.analysis, selected=result.suggestions[chosen];
  const warnings=[...result.limitations,...a.uncertainties,...(!current?['영상이 변경됐습니다. 현재 영상으로 다시 분석해 주세요.']:[]),...(stale?['조사 후 30일이 지났습니다. 현재 흐름을 확인하려면 다시 추천받으세요.']:[])];
  $('#results').innerHTML=`<h2>${esc(a.subject)}</h2><p class="hint">${esc(a.category)} · ${result.format==='short'?'쇼츠':'롱폼'} · ${Math.round(a.media.duration)}초</p><p>${esc(a.summary)}</p><details class="metadata-analysis"><summary>영상에서 확인한 내용</summary><ul>${a.observations.map(o=>`<li><strong>${Math.floor(o.at/60)}:${String(Math.floor(o.at%60)).padStart(2,'0')}</strong> ${esc(o.visual)}${o.subtitle?`<br>자막: ${esc(o.subtitle)}`:''}${o.speech?`<br>음성: ${esc(o.speech)}`:''}</li>`).join('')}</ul></details><div class="metadata-tabs" aria-label="추천 유형">${result.suggestions.map((s,i)=>`<button data-choice="${i}" aria-pressed="${i===chosen}">${i===0?'추천 · ':''}${esc(s.type)}</button>`).join('')}</div><article class="metadata-draft"><div class="metadata-copyrow"><strong>제목</strong><button data-copy="title">제목 복사</button></div><h3>${esc(selected.title)}</h3><div class="metadata-copyrow"><strong>설명</strong><button data-copy="description">설명 복사</button></div><p class="metadata-description">${esc(selected.description)}</p><div class="metadata-copyrow"><strong>해시태그</strong><button data-copy="hashtags">해시태그 복사</button></div><p class="metadata-tags">${esc(selected.hashtags.join(' '))}</p><p class="metadata-reason">${esc(selected.reason)}</p><div class="metadata-actions"><button class="primary" data-copy="all">한 세트 복사</button>${project.purpose!=='metadata'?`<button class="secondary" id="apply" ${!current||busy(project)||project.upload?'disabled':''}>게시 초안에 적용</button><a class="secondary" href="/studio?id=${encodeURIComponent(project.id)}">제작실로 돌아가기</a>`:''}</div></article>${warnings.length?`<aside class="metadata-warning">${warnings.map(w=>`<p>${esc(w)}</p>`).join('')}</aside>`:''}<details class="metadata-sources" open><summary>참고 영상 ${result.references.length}개</summary><p class="hint">조사 기간 ${day(result.period.start)}~${day(result.period.end)} · 확인 ${day(result.checkedAt)}<br>조회수는 확인 시점의 값이며, 제목·해시태그가 조회수를 만든 원인이라고 단정할 수 없습니다.</p>${result.references.length?result.references.map(r=>`<article class="metadata-reference"><a href="https://www.youtube.com/watch?v=${encodeURIComponent(r.id)}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a><small>${esc(r.channel)} · ${day(r.publishedAt)} · 조회수 ${Number(r.views).toLocaleString('ko-KR')}회 · ${r.formatStatus==='short-candidate'?'쇼츠 후보 · 형식 미확인':'일반 영상'}</small><p>${esc(r.relevance)}</p><p>${esc(r.pattern)}</p><details><summary>공개 설명·해시태그 보기</summary><pre>${esc(r.description)}</pre><p class="metadata-tags">${esc(r.hashtags.join(' ')||'공개 해시태그 없음')}</p></details></article>`).join(''):'<p>조건에 맞는 참고 영상이 부족합니다. 추천은 첨부 영상 내용에 기반했습니다.</p>'}</details>`;
  document.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{chosen=Number(b.dataset.choice);render();});
  document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{
    const content={title:selected.title,description:selected.description,hashtags:selected.hashtags.join(' '),all:`${selected.title}\n\n${selected.description}\n\n${selected.hashtags.join(' ')}`}[b.dataset.copy];
    try{await navigator.clipboard.writeText(content);toast('복사했습니다.');}catch{error(Error('복사 권한이 없습니다. 문구를 직접 선택해 복사해 주세요.'));}
  });
  if($('#apply'))$('#apply').onclick=async()=>{if(pending)return;pending=true;$('#apply').disabled=true;try{project=(await post('/'+project.id+'/metadata-apply',{revision:project.revision,index:chosen})).project;toast('게시 초안에 적용했습니다. 제작실에서 확인한 뒤 업로드하세요.');}catch(e){error(e);}finally{pending=false;render();}};
  controls();
}
$('#video-file').onchange=()=>{file=$('#video-file').files[0]||null;if(file&&(file.size>50*1024*1024||!file.size||!file.name.toLowerCase().endsWith('.mp4'))){error(Error('50MB 이하의 MP4 영상을 선택하세요.'));file=null;$('#video-file').value='';}showSource();render();controls();};
$('#project').onchange=()=>load($('#project').value);
$('#recommend').onclick=async()=>{
  if(pending||busy(project))return;pending=true;controls();$('#error').hidden=true;
  try{
    if(!project)project=(await post('/metadata-project',{})).project;
    history.replaceState(null,'','/metadata?id='+encodeURIComponent(project.id));
    if(file){project=(await api(`/${project.id}/metadata-source?revision=${project.revision}&name=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'content-type':'video/mp4'},body:file})).project;file=null;$('#video-file').value='';showSource();}
    project=(await post('/'+project.id+'/metadata',{revision:project.revision,format:$('#format').value})).project;chosen=0;render();
  }catch(e){error(e);}finally{pending=false;controls();}
};
async function init(){
  try{
    const results=await Promise.all([api('/config'),api(''),api('?purpose=metadata')]);config=results[0];
    const ready=results[1].projects.filter(p=>p.render);
    $('#project').innerHTML='<option value="">새 영상 첨부</option>'+ready.map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('');
    $('#history').innerHTML=results[2].projects.map(p=>`<a href="/metadata?id=${encodeURIComponent(p.id)}">${esc(p.metadataSource?.name||p.title)} · ${p.task?.state==='done'?'추천 완료':p.task?.state==='failed'?'다시 시도':busy(p)?'분석 중':'영상 선택'}</a>`).join('')||'<p class="hint">아직 추천받은 영상이 없습니다.</p>';
    $('#connection').textContent=config.capabilities?.metadata?'화면을 닫아도 분석은 계속되며, 이 주소에서 결과를 다시 확인할 수 있어요.':'영상 분석 서버 연결이 필요합니다. 관리자에게 문의해 주세요.';
    const id=new URLSearchParams(location.search).get('id');if(id){$('#project').value=id;await load(id);}else controls();
  }catch(e){error(e);controls();}
}
setInterval(async()=>{if(!project||!busy(project)||pending||loading)return;const id=project.id;try{const latest=(await api('/'+id)).project;if(project?.id!==id)return;if(latest.revision!==project.revision){project=latest;render();}}catch(e){error(e);}},4000);
window.addEventListener('pagehide',()=>{if(localUrl)URL.revokeObjectURL(localUrl);});
init();
