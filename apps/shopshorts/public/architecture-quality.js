// Shared browser/CLI/worker policy. Versioned on new/validated briefs; no asset migration.
export const ARCHITECTURE_QUALITY = 'architecture-cycles-v1';
export const architectureQuality = brief => brief?.category === '건축학' && brief.architectureQuality === ARCHITECTURE_QUALITY;
export const ARCHITECTURE_RENDER = Object.freeze({engine:'CYCLES',samples:48,denoise:true,fps:24,width:1080,height:1920});
const invalid = message => {throw Object.assign(Error(message),{status:400,code:'ARCHITECTURE_PLAN_INVALID'});};
export function architectureDefaults(input, {apply=true}={}) {
 if(input.architectureQuality !== undefined && (input.category !== '건축학' || input.architectureQuality !== ARCHITECTURE_QUALITY))invalid('건축학 품질 설정을 확인하세요.');
 if(input.category !== '건축학' || !apply)return input;
 return {...input,productionStyle:input.productionStyle ?? 'webtoon',architectureQuality:ARCHITECTURE_QUALITY};
}
export function architectureParts(value, scene) {
 if(value===undefined)return undefined;
 if(!Array.isArray(value)||value.length>12)invalid('건축 부품은 최대 12개입니다.');
 const ids=new Set();
 return value.map(p=>{
  if(!p || ids.has(p.layerId) || !scene.webtoon?.layers?.some(l=>l.id===p.layerId) || !['glass','metal','fabric','concrete'].includes(p.material))invalid('건축 부품의 대상과 재질을 확인하세요.');
  if(p.offset!==undefined&&(!Number.isFinite(p.offset)||Math.abs(p.offset)>100))invalid('부품 깊이 위치는 -100~100입니다.');
  ids.add(p.layerId);let hinge;
  if(p.hinge!==undefined){
   const h=p.hinge;
   if(!h||!['x','y','z'].includes(h.axis)||!Array.isArray(h.pivot)||h.pivot.length!==2||h.pivot.some(v=>!Number.isFinite(v)||v<0||v>100)||!Number.isFinite(h.from)||!Number.isFinite(h.to)||Math.abs(h.from)>150||Math.abs(h.to)>150||h.from===h.to)invalid('힌지 축·회전 범위·고정점을 확인하세요.');
   hinge={axis:h.axis,pivot:h.pivot,from:h.from,to:h.to};
  }
  return {layerId:p.layerId,material:p.material,...(p.offset!==undefined?{offset:p.offset}:{}),...(hinge?{hinge}:{})};
 });
}
export function validateArchitectureScene(scene) {
 const parts=architectureParts(scene.hybrid?.parts,scene);
 if(!parts?.length || scene.webtoon.layers.some(l=>!parts.some(p=>p.layerId===l.id)))invalid('Blender 구조 장면의 모든 부품에 재질을 지정하세요.');
 if(scene.webtoon.layers.some(l=>l.motion==='scale'))invalid('건축 부품은 크기 변화 대신 이동·힌지 회전·흐름으로 설명하세요.');
 return parts;
}
export function architectureGuide(brief) {
 if(!architectureQuality(brief))return '';
 return `건축학 기본 품질 ${ARCHITECTURE_QUALITY}: 방금 검증한 Al Bahr 개선 방향을 사용합니다. 특정 건물 모델을 다른 건물에 복제하지 않습니다. 가는 윤곽의 웹툰 기반, 따뜻한 핵심 대상/주광과 차가운 배경/보조광을 분리하세요. 유리는 투과·반사, 금속은 모서리와 연결부, 천은 직조, 콘크리트는 거친 질감을 구분합니다. 전체 장소 → 작동 부위 근접 → 변화 → 결과/전체 연결로 설명하고 배경만 보는 장면을 반복하지 마세요. 카메라는 연속적으로 움직이며 갑자기 점프하지 않습니다. 도입 Higgsfield와 본문 팔레트를 맞춥니다. 자막은 별도 합성합니다.
웹툰/자동 혼합에서 cutaway는 실제 Blender Cycles 48 samples/denoise/24fps로 렌더합니다. hybrid.parts에 모든 layers의 {layerId,material,offset?}를 지정하며 material=glass/metal/fabric/concrete입니다. offset은 도해 폭/높이의 짧은 변 기준 깊이 위치(-100~100, 음수는 카메라 쪽)입니다. 겹쳐 보이는 앞뒤 부품은 깊이를 구분하세요. 실제 회전이 필요한 부품만 hinge:{axis:"x"|"y"|"z",pivot:[0~100,0~100],from:-150~150,to:-150~150}를 추가하세요. pivot은 부품 내부 고정점, from/to는 각도입니다. 좌표는 x=가로,y=깊이,z=높이입니다. 임의 실행코드는 금지입니다. 개폐를 scale로 표현하지 말고 이동·힌지 회전·흐름으로 표현하세요. 구조도는 검증된 대사와 대응하는 설명용 재구성이며 실제 제작도·해석·물리 시뮬레이션이 아닙니다. 이 데이터 도형으로 표현할 수 없는 실제 외형은 웹툰 원화로 보여주고, 구조 설명에 적합한 부품만 Blender로 구성하세요. 실사/애니메이션을 명시한 경우 그 스타일은 유지합니다.`;
}
