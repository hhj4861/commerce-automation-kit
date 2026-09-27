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
export function mountAutomaticCreation(host,{fetcher=fetch}={}) {
  host.innerHTML=`<section class="panel automatic-brief"><div class="panel-head"><div><h2>어떤 쇼핑쇼츠를 만들까요?</h2><p>주제를 입력하면 대본 초안을 자동으로 작성합니다.</p></div></div><ol><li>주제 입력 후 대본 초안 요청</li><li>콘텐츠에서 대본 검수와 영상 생성 진행</li><li>최종 영상 확인 후 발행</li></ol><form data-auto-form><label class="field"><span>상품 또는 주제</span><input name="topic" required maxlength="100" placeholder="예: 작은 방을 정리하는 접이식 건조대"></label><label class="field"><span>대본에 참고할 내용 <small>선택</small></span><textarea name="memo" maxlength="500" placeholder="예: 좁은 공간에서 보관하는 방법을 보여주세요."></textarea></label><p class="hint">자동 생성은 현재 쇼핑쇼츠를 지원합니다. 다른 카테고리나 롱폼은 수동 생성에서 시작하세요. 대본 승인과 최종 발행은 직접 확인하며, 영상·음성 생성에 서비스별 사용료가 발생할 수 있습니다.</p><div class="actions"><a href="/studio">제작 방식 다시 선택</a><button class="primary" type="submit">자동 초안 요청</button></div><div class="auto-feedback" data-auto-feedback role="status" aria-live="polite"></div></form><div class="studio-library-link"><p>주제가 아직 없다면 검색 트렌드에서 소재를 찾아보세요.</p><a href="/trends">트렌드 탐색</a></div></section>`;
  const form=host.querySelector('form'),feedback=host.querySelector('[data-auto-feedback]'),button=form.querySelector('button');
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(button.disabled)return;
    button.disabled=true;button.textContent='요청 중…';feedback.textContent='';
    try {
      const result=await requestAutomaticDraft(form.elements.topic.value,form.elements.memo.value,{fetcher});
      feedback.innerHTML=`<p>${result.duplicate?'이미 요청한 주제예요. 콘텐츠에서 진행 상태를 확인하세요.':'초안을 요청했어요. 콘텐츠에 저장되었으며, 제작 서비스가 처리하면 대본을 검수할 수 있습니다.'}</p><a class="workspace-link" href="/contents?status=working">콘텐츠에서 진행 상태 보기</a>`;
      button.textContent=result.duplicate?'이미 요청됨':'요청 완료';
      form.elements.topic.disabled=true;form.elements.memo.disabled=true;
    } catch(error) {feedback.textContent=error.message;button.disabled=false;button.textContent='다시 요청';}
  });
}
