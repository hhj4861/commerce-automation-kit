export const architectureValue = () => ({
  sources:[{title:'운영기관 테스트 자료',url:'https://example.org/architecture'}],
  suggestions:['영도대교','해인사 장경판전','문화비축기지'].map((entity,i)=>({
    keyword:entity,topic:`${entity}의 의외의 설계`,direction:`${entity}의 작동 전후를 보여준 뒤 원리 ${i}를 설명`,reason:'실제 사례와 원문을 확인하는 테스트 픽스처',
    caseStudy:{entity,location:['부산','합천','서울'][i],surprise:`예상과 다른 특징 ${i}`,mechanism:['도개 장치','자연 환기','산업시설 재생'][i],openingVisual:`${entity}의 변화가 보이는 장면`,sourceUrls:['https://example.org/architecture']}
  }))
});
