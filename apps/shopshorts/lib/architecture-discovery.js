// Evidence-shaped planning data. Source membership is validated here; it is not
// proof that a claim is true. The model must inspect primary sources separately.
export const architectureDiscovery = brief => brief.category === '건축학' && brief.focus === 'topic';
export const architectureDiscoveryGuide = brief => !architectureDiscovery(brief) ? '' : `건축 사례 발견 기준:
일반 건축 개념을 먼저 정하지 말고 실제 장소·건축물·토목시설부터 조사하세요. 실제 사례 발견 → 눈으로 보고도 궁금한 현상 → 그 이유와 원리 확인 → 첫 장면과 질문 순서입니다.
후보는 상식을 뒤집는 구조, 움직이거나 변하는 시설, 고대의 제작법, 익숙한 장소의 숨은 사연, 극한 환경 설계를 서로 다른 갈래에서 찾으세요. 일반적인 높이·내진·바람 원리나 유명 랜드마크만 반복하지 마세요. 고정 예시 목록을 반복하지 말고 매번 새 사례를 검색하세요.
국내와 해외 사례를 함께 탐색하세요. 사용자가 국내·한국 사례를 요청했다면 국내 실제 장소만 선정하세요. 최근 30일 관심사와 별개로 오래된 사례도 지금 확인한 1차 출처가 있으면 선정할 수 있습니다. 오래된 건축물을 최근 생긴 뉴스로 포장하지 마세요.
각 후보에 caseStudy 객체를 반드시 추가하세요: entity(실제 대상의 정식 명칭), location(국가·지역), surprise(보고도 궁금한 사실), mechanism(이번 영상이 설명할 핵심 원리 하나), openingVisual(첫 3초에 보여줄 구체적인 그림), sourceUrls(이 사례를 확인한 sources의 HTTPS 원문 URL 배열).
설계자·운영기관·문화유산기관·연구기관 등 1차 출처로 실재와 핵심 사실을 확인하세요. 참고 채널 제목은 사실의 증거가 아닙니다. 근거 없는 최초·유일·절대 안전·불가능을 쓰지 말고 전설·추정과 확인된 사실을 구분하세요.
topic에는 실제 대상과 궁금증·핵심 답을, direction에는 첫 장면과 그 원리를 그림으로 풀어낼 흐름을 담으세요. reason에는 의외성·시각성·기존 추천과의 차이 및 근거 날짜를 설명하세요.
중복은 제목이 아니라 대상 + 핵심 원리 + 시청자가 얻는 답으로 검토하세요. 기존 기획과 같은 내용을 제목만 바꾸거나 같은 사례를 세 후보로 쪼개지 마세요. 타인의 대본·제목·화면을 복제하지 마세요.`;
const fields = {entity:160, location:120, surprise:300, mechanism:240, openingVisual:300};
export const caseInvalid = () => Object.assign(new Error('실제 건축 사례와 확인 가능한 출처를 갖춘 기획을 완성하지 못했어요. 다시 추천받아 주세요.'), {status:502, code:'RECOMMENDATION_CASE_INVALID'});
export function parseArchitectureCase(value, sources) {
  if (!value || typeof value !== 'object') throw caseInvalid();
  const result = {};
  for (const [field,max] of Object.entries(fields)) {
    if (typeof value[field] !== 'string' || !value[field].trim() || value[field].length > max) throw caseInvalid();
    result[field] = value[field].trim();
  }
  const allowed = new Set(sources.map(s=>s.url));
  if (!Array.isArray(value.sourceUrls) || value.sourceUrls.length < 1 || value.sourceUrls.length > 5) throw caseInvalid();
  result.sourceUrls = [...new Set(value.sourceUrls.map(url=>{
    try { const parsed=new URL(url); if(typeof url==='string' && allowed.has(parsed.href)) return parsed.href; } catch {}
    throw caseInvalid();
  }))];
  return result;
}
export function caseHistory(value) {
  if (!value || typeof value.entity !== 'string' || typeof value.mechanism !== 'string') return {};
  return {caseStudy:{entity:value.entity.slice(0,160), location:typeof value.location==='string'?value.location.slice(0,120):'', mechanism:value.mechanism.slice(0,240)}};
}
const normalize = s => s.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[\p{P}\p{Z}\s]/gu,'');
export function repeatsArchitecture(suggestions, previous) {
  const seen=[...previous];
  for(const item of suggestions) {
    const c=item.caseStudy;
    if(c && seen.some(old=>{
      const entity=normalize(c.entity), oldEntity=old.caseStudy?.entity && normalize(old.caseStudy.entity);
      const sameEntity=oldEntity && (entity===oldEntity || Math.min(entity.length,oldEntity.length)>=4 && (entity.includes(oldEntity)||oldEntity.includes(entity)));
      return sameEntity || (!oldEntity && entity.length>=4 && normalize(old.topic||'').includes(entity))
        || old.caseStudy?.mechanism && normalize(old.caseStudy.mechanism)===normalize(c.mechanism);
    })) return true;
    seen.push(item);
  }
  return false;
}
