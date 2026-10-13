const labels = {focus:'질문과 답',why:'필요한 이유',mechanism:'작동 과정',example:'구체적 예시',payoff:'완결된 답',pacing:'설명 호흡',visuals:'대사와 화면'};
const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function rejectionMarkup(value) {
  if (!value) return '<p>이 계정에서 확인할 검토 자료가 없어요. 이전 버전의 요청 또는 보관되지 않은 결과입니다.</p>';
  const scenes=value.draft.scenes;
  return `<section class="auto-rejection" aria-label="대본 보완 근거"><header><h3>어디를 보완해야 할까요?</h3><p>AI 검토 의견입니다. 아래 원문과 함께 확인하세요. 이 초안으로 영상은 생성되지 않았습니다.</p></header><ul class="auto-review-checks">${Object.entries(labels).filter(([key])=>value.review.checks[key].pass===false).map(([key,label])=>{const item=value.review.checks[key];return `<li><strong>${esc(label)}</strong><p>${esc(item.reason)}</p>${item.evidence.map(e=>`<blockquote><small>${scenes.findIndex(s=>s.id===e.sceneId)+1}번 장면 · ${e.field==='prompt'?'화면 계획':'대사'}</small><p>${esc(e.quote)}</p></blockquote>`).join('')}</li>`;}).join('')}</ul><details><summary>검토받은 대본 전체 · ${scenes.length}장면</summary><h4>${esc(value.draft.title)}</h4><ol class="auto-script">${scenes.map(s=>`<li><p>${esc(s.narration)}</p><small>${esc(s.duration)}초 · ${esc(s.prompt)}</small></li>`).join('')}</ol></details></section>`;
}
