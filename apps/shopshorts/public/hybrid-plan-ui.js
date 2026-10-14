import {hybridPlan} from './hybrid-plan.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function hybridPlanMarkup(project) {
  const plan=hybridPlan(project);if(!plan?.scenes.length)return '';
  return `<section class="panel" aria-label="자동 혼합 연출 계획"><h3>이렇게 보여드릴게요</h3><ol>${plan.scenes.map(s=>`<li><strong>${esc(s.label)}</strong> · ${s.duration}초 ${s.reused?'· 완성 자산 재사용':''}<p class="hint">${esc(s.reason)}</p></li>`).join('')}</ol><p class="hint">${project.productionPlan?.cost?.status==='quoted'?`확인한 추가 생성 견적 ${Number(project.productionPlan.cost.additionalCredits)}크레딧 · `:''}추가 영상 ${plan.cost.videoScenes}장면 · 원화 최대 ${plan.cost.artworkScenes}장면 · ${Number(plan.cost.limit)}크레딧 상한. 실견적 확인 후 상한 안에서만 생성합니다. 음성 별도.</p></section>`;
}
