// Data-only choreography. Never execute model-provided code, SVG, URLs or filters.
export const webtoon=brief=>brief?.productionStyle==='webtoon';
export const KYLE='RU7aSi6lT4uQBXMLgDxK';
const bad=()=>{throw Object.assign(Error('웹툰의 대상·동작·결과 구성을 확인해 주세요.'),{status:400});};
const text=(x,n)=>typeof x==='string'&&x.trim()&&x.length<=n;
const num=(x,a,b)=>Number.isFinite(x)&&x>=a&&x<=b;
const point=p=>Array.isArray(p)&&p.length===2&&p.every(n=>num(n,0,100));
export function webtoonPlan(v){
 if(!v||!text(v.artPrompt,1600)||!text(v.answer,160)||!Array.isArray(v.layers)||v.layers.length<1||v.layers.length>12)bad();
 const ids=new Set();
 const layers=v.layers.map(l=>{
  if(!/^[a-z0-9-]{1,30}$/.test(l.id||'')||ids.has(l.id)||!text(l.label,20)||!text(l.meaning,240)||!['ellipse','rect','polygon','path'].includes(l.shape)||!/^#[0-9a-f]{6}$/i.test(l.color||'')||!point(l.from)||!point(l.to)||!point(l.size)||l.size.some(x=>x<1)||!num(l.start,0,.8)||!num(l.end,.1,1)||l.end<=l.start||!['move','reveal','flow','scale'].includes(l.motion))bad();
  ids.add(l.id);
  if(['polygon','path'].includes(l.shape)&&(!Array.isArray(l.points)||l.points.length<2||l.points.length>32||!l.points.every(point)))bad();
  if(l.shape==='polygon'&&l.points.length<3)bad();
  if(l.motion==='move'&&JSON.stringify(l.from)===JSON.stringify(l.to))bad();
  return {id:l.id,label:l.label.trim(),meaning:l.meaning.trim(),shape:l.shape,color:l.color,from:l.from,to:l.to,size:l.size,start:l.start,end:l.end,motion:l.motion,...(['polygon','path'].includes(l.shape)?{points:l.points}:{} )};
 });
 if(!layers.some(l=>['move','flow','scale'].includes(l.motion)))bad();
 return {artPrompt:v.artPrompt.trim(),answer:v.answer.trim(),layers};
}
export function webtoonScenes(scenes){
 if(scenes.length<2||scenes.some(s=>s.kind!=='video'||!s.webtoon)||scenes[0].duration!==6)bad();
 scenes.forEach(s=>webtoonPlan(s.webtoon));
}
export function webtoonGuide(brief){
 if(!webtoon(brief))return '';
 return `웹툰 혼합 제작: 첫 장면은 정확히 6초인 Higgsfield 영상, 나머지는 독창적인 웹툰 원화와 데이터 기반 동작 도해입니다. 모든 kind는 video, 최소 2장면입니다. 섬세한 잉크 선·회화적 질감, 따뜻한 앰버 조명과 청록/남색 배경 대비를 유지합니다. 인물/대상의 정체성을 visualStyle와 각 prompt에서 유지하세요.
모든 장면에 webtoon:{artPrompt,answer,layers}를 추가하세요. artPrompt(1~1600자)는 자막 없는 독창적 웹툰 원화의 공간·대상·구도 설명, answer(1~160자)는 이 장면에서 보여줄 인과적 발견(검토용, 읽지 않음)입니다. 단순 그림 확대가 아니라 같은 대상의 상태가 변해야 합니다.
layers는 1~12개 데이터 도형으로 각 {id,label,meaning,shape,color,from,to,size,start,end,motion,points?}입니다. id=영문소문자/숫자/하이픈 1~30자, label=대상명 20자 이하, meaning=실제 대사의 어느 대상과 변화를 뜻하는지 240자 이하. shape=rect/ellipse/polygon/path, color=#RRGGBB. from/to=[x,y],size=[폭,높이]는 0~100 정규화된 도해 내부 좌표(크기는 1이상). polygon/path의 points는 해당 도형 내부 0~100 좌표 2~32쌍(polygon 최소3). start/end는 장면의 0~1 진행률이며 start<=.8,end>start. motion=move(다른 위치로 이동)/flow(경로를 따라 입자가 이동)/scale(상태 확대 변화)/reveal(등장). 최소 하나는 move/flow/scale여야 합니다. 임의 HTML/SVG/코드/파일/URL은 금지합니다.
도해는 원화를 가리지 않는 별도 패널(세로 영상은 아래, 가로 영상은 오른쪽)에 합성됩니다. 원화는 주인공/핵심 대상이 중앙에 모인 구도로 만드세요. 실측으로 오해시키는 수치·가짜 물리 시뮬레이션을 만들지 마세요. 사물의 실제 모양은 원화, 구조의 인과·비교·흐름은 도해로 구분하세요. 장면 내 before → action → after가 대사와 일치하고 마지막 20%는 결과를 읽도록 합니다. 각 레이어의 의미와 실제 동작을 prompt에도 자연어로 명시해 별도 검토가 가능하게 하세요. 도입과 본문에 쓰이는 원화 생성 비용도 크레딧에 포함됩니다.`;
}
