// A bounded scene description, never executable LLM-generated JavaScript/SVG.
export const ANIMATION_ICONS = ['person','brain','heart','clock','phone','book','cloud','home','tree','star','building','wind','damper','planet','water','energy','robot','app','server','laptop','parcel','document','envelope','truck','folder','shield','calendar'];
export const ANIMATION_MOTIONS = ['enter','float','pulse','shake','walk','wave','talk','work'];
export const animated = brief => brief?.productionStyle === 'animation';

export function productionStyle(input) {
  if (input !== undefined && !['cinematic','animation','webtoon'].includes(input)) throw Object.assign(new Error('지원하지 않는 영상 연출입니다.'), {status:400});
  return input ? {productionStyle:input} : {};
}

export function animationPlan(value) {
  const bad = () => {throw Object.assign(new Error('애니메이션의 제목·개체·움직임을 확인해 주세요. 시나리오를 다시 생성할 수 있어요.'),{status:400});};
  const validText=(v,max)=>typeof v==='string'&&v.trim()&&[...v].length<=max&&!/[\x00-\x1f\x7f]/.test(v);
  if (!value || !validText(value.title,32) || !Array.isArray(value.elements) || value.elements.length<2 || value.elements.length>4) bad();
  const elements=value.elements.map(e=>{
    if(!e || !ANIMATION_ICONS.includes(e.icon) || !ANIMATION_MOTIONS.includes(e.motion) || !validText(e.label,16))bad();
    if(e.expression!==undefined&&!['happy','worried','neutral'].includes(e.expression))bad();
    return {icon:e.icon,label:e.label.trim(),motion:e.motion,...(e.expression?{expression:e.expression}:{})};
  });
  if(!['sequence','contrast','cycle'].includes(value.layout))bad();
  if(value.diagram!==undefined&&!['objects','pendulum','section','orbit'].includes(value.diagram))bad();
  if(value.presentation!==undefined&&!['illustrated','diagram'].includes(value.presentation))bad();
  if(value.staging!==undefined&&!['exchange','journey','reaction','comparison'].includes(value.staging))bad();
  if(value.prop!==undefined&&!['envelope','parcel','document','none'].includes(value.prop))bad();
  if(value.takeaway!==undefined&&!validText(value.takeaway,40))bad();
  return {title:value.title.trim(),layout:value.layout,elements,...(value.presentation?{presentation:value.presentation}:{}),...(value.staging?{staging:value.staging}:{}),...(value.prop?{prop:value.prop}:{}),...(value.diagram?{diagram:value.diagram}:{}),...(value.takeaway?{takeaway:value.takeaway.trim()}:{})};
}

export function animationGuide(brief) {
  if(!animated(brief))return '';
  return `제작 방식은 코드로 렌더링하는 손그림 설명 애니메이션입니다. 모든 장면 kind는 video입니다. 이미지·영상 생성 API는 사용하지 않습니다.
각 장면에 animation:{title,layout,elements,presentation,staging,prop}를 반드시 작성하세요. title은 장면의 핵심 메시지를 담은 1~32자 제목입니다.
layout은 sequence(원인·행동·결과), contrast(차이 비교), cycle(되풀이되는 과정) 중 대사에 맞게 고르세요.
elements는 2~4개이며 각 개체는 {icon,label,motion}입니다. icon은 ${ANIMATION_ICONS.join('/')} 중 선택합니다. label은 대사에서 설명하는 개념을 1~16자로 적으세요. motion은 ${ANIMATION_MOTIONS.join('/')} 중 선택하세요. enter=등장, float=부유, pulse=강조, shake=흔들림, walk=이동, wave=손짓, talk=말하기, work=작업입니다. 사람·로봇은 expression:happy/worried/neutral로 표정을 선택할 수 있습니다.
기본 presentation은 illustrated입니다. 글자와 아이콘 나열보다 사람·사물의 행동으로 설명하세요. person=사람, robot=AI/보조자, app=앱, server=서버, laptop=노트북, parcel=물건, document=문서, envelope=메시지, truck=운송, folder=자료, shield=보호, calendar=일정입니다. 꼭 대사와 맞는 대상만 선택하세요.
staging은 exchange(대상 사이 전달), journey(목표를 향한 이동), reaction(상황에 대한 반응), comparison(두 상황 비교) 중 선택합니다. 전달이 실제로 설명되는 경우에만 prop을 envelope/parcel/document로 지정하고 그 외에는 none으로 두세요. 관계선을 아무 의미 없이 그리지 마세요. 도해가 핵심인 물리 원리에는 presentation:diagram과 적합한 diagram을 사용하세요.
대사는 별도 자막으로 제공됩니다. 화면의 title은 짧게, label은 대상 이름만 적고 takeaway로 대사를 반복하지 마세요. 같은 캐릭터를 이어지는 장면에서도 유지하되 행동·배치·표정은 설명에 맞게 바꾸세요.
예: 미루기의 감정 회피를 설명하는 장면은 {"title":"불편함을 피하는 순간","layout":"sequence","presentation":"illustrated","staging":"reaction","prop":"none","elements":[{"icon":"book","label":"해야 할 일","motion":"enter"},{"icon":"person","label":"잠깐의 회피","motion":"work","expression":"worried"}]}.
선택 필드 diagram은 objects(개체 비교·순서·반복), pendulum(건물과 매달린 질량·댐퍼의 상대운동), section(건물 단면에서 바람·물·빛·에너지 흐름), orbit(중심체 주위 운동) 중 설명하는 원리와 실제로 맞을 때만 쓰세요. pendulum은 동조질량감쇠기 설명에 적합하며 다른 원리를 잘못 끼워 맞추지 마세요. section의 elements에는 건물 안팎에 흐르는 개체를, orbit에는 중심체와 그 주위 개체를 적으세요. 단면·진동·궤도 도해는 실제 시뮬레이션이나 실측이 아닌 원리 설명으로 표시됩니다. takeaway는 그 장면의 발견을 1~40자로 적으세요. 전 장면 크림색 배경을 유지하며 가운데는 별도 자막 영역으로 비워 둡니다. 핵심 개체가 실제로 움직이거나 관계가 변화하는 구성을 우선하세요.
개체·순서·동작이 narration의 설명과 맞아야 합니다. 일러스트 종류는 지원 목록 안에서 비유로 구성하며 prompt에는 그 비유의 의미를 설명하세요. HTML·SVG·코드·URL을 반환하지 마세요. 장면마다 같은 제목·도식을 반복하지 마세요. 한 장면은 보통 4~10초로 읽을 시간을 주세요.`;
}
