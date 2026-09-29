// A bounded scene description, never executable LLM-generated JavaScript/SVG.
export const ANIMATION_ICONS = ['person','brain','heart','clock','phone','book','cloud','home','tree','star'];
export const ANIMATION_MOTIONS = ['enter','float','pulse','shake'];
export const animated = brief => brief?.productionStyle === 'animation';

export function productionStyle(input) {
  if (input !== undefined && !['cinematic','animation'].includes(input)) throw Object.assign(new Error('지원하지 않는 영상 연출입니다.'), {status:400});
  return input ? {productionStyle:input} : {};
}

export function animationPlan(value) {
  const bad = () => {throw Object.assign(new Error('애니메이션의 제목·개체·움직임을 확인해 주세요. 시나리오를 다시 생성할 수 있어요.'),{status:400});};
  const validText=(v,max)=>typeof v==='string'&&v.trim()&&[...v].length<=max&&!/[\x00-\x1f\x7f]/.test(v);
  if (!value || !validText(value.title,32) || !Array.isArray(value.elements) || value.elements.length<2 || value.elements.length>4) bad();
  const elements=value.elements.map(e=>{
    if(!e || !ANIMATION_ICONS.includes(e.icon) || !ANIMATION_MOTIONS.includes(e.motion) || !validText(e.label,16))bad();
    return {icon:e.icon,label:e.label.trim(),motion:e.motion};
  });
  if(!['sequence','contrast','cycle'].includes(value.layout))bad();
  return {title:value.title.trim(),layout:value.layout,elements};
}

export function animationGuide(brief) {
  if(!animated(brief))return '';
  return `제작 방식은 코드로 렌더링하는 손그림 설명 애니메이션입니다. 모든 장면 kind는 video입니다. 이미지·영상 생성 API는 사용하지 않습니다.
각 장면에 animation:{title,layout,elements}를 반드시 작성하세요. title은 장면의 핵심 메시지를 담은 1~32자 제목입니다.
layout은 sequence(원인·행동·결과), contrast(차이 비교), cycle(되풀이되는 과정) 중 대사에 맞게 고르세요.
elements는 2~4개이며 각 개체는 {icon,label,motion}입니다. icon은 ${ANIMATION_ICONS.join('/')} 중 선택합니다. label은 대사에서 설명하는 개념을 1~16자로 적으세요. motion은 ${ANIMATION_MOTIONS.join('/')} 중 선택하세요. enter=등장, float=부유, pulse=강조, shake=흔들림입니다.
예: 미루기의 감정 회피를 설명하는 장면은 {"title":"불편함을 피하는 순간","layout":"sequence","elements":[{"icon":"book","label":"해야 할 일","motion":"enter"},{"icon":"cloud","label":"불편한 감정","motion":"shake"},{"icon":"phone","label":"잠깐의 회피","motion":"pulse"}]}.
개체·순서·동작이 narration의 설명과 맞아야 합니다. 일러스트 종류는 지원 목록 안에서 비유로 구성하며 prompt에는 그 비유의 의미를 설명하세요. HTML·SVG·코드·URL을 반환하지 마세요. 장면마다 같은 제목·도식을 반복하지 마세요. 한 장면은 보통 4~10초로 읽을 시간을 주세요.`;
}
