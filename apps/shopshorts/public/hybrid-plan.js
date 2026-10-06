// Shared by browser, CLI and worker. Plans are data, never model-provided code.
export const HYBRID_VERSION = 'hybrid-v1';
export const isHybrid = brief => brief?.productionStyle === 'hybrid';
export const HYBRID_LABELS = {higgsfield:'Higgsfield 도입',webtoon:'웹툰 상황·사례',motion:'모션으로 원리 설명','3d':'3D 구조도'};
const invalid = message => {throw Object.assign(Error(message),{status:400,code:'HYBRID_PLAN_INVALID'});};
export function hybridScene(value, scene) {
  if (value === undefined) return undefined;
  if (!value || !['auto','webtoon','motion','3d'].includes(value.renderer)) invalid('혼합 장면의 제작 방식을 확인해 주세요.');
  const focus=value.focus??scene.webtoon?.layers?.[0]?.id;
  if (!scene.webtoon?.layers?.some(l=>l.id===focus)) invalid('확대할 대상이 장면에 없습니다.');
  const depth=value.depth??8;
  if (!Number.isFinite(depth)||depth<1||depth>24) invalid('3D 구조도의 깊이는 1~24입니다.');
  return {renderer:value.renderer,focus,depth};
}
export function sceneRoute(scene,index) {
  if(index===0)return {renderer:'higgsfield',reason:'질문의 대상을 첫 장면부터 보여줍니다.'};
  const spec=hybridScene(scene.hybrid,scene);
  const renderer=spec?.renderer&&spec.renderer!=='auto'?spec.renderer:({scene:'webtoon',cutaway:'3d',comparison:'motion',process:'motion',summary:'motion'}[scene.visualDirection?.treatment]);
  if(!renderer)invalid('자동 혼합에는 장면별 상황·단면·비교·흐름 구성이 필요합니다.');
  if(renderer==='3d'&&!scene.webtoon?.layers?.some(l=>l.shape==='rect'))invalid('3D 구조도에는 두께를 보여줄 사각형 부품이 필요합니다. 다른 형태는 모션을 선택해 주세요.');
  return {renderer,reason:({webtoon:'사례와 상황을 원화와 움직임으로 연결합니다.',motion:'같은 대상의 변화와 흐름을 확대해 보여줍니다.','3d':'부품의 두께와 공간 관계를 구조도로 보여줍니다.'})[renderer]};
}
export function hybridPlan(project) {
  if(!isHybrid(project.brief))return null;
  if(!project.scenes?.length)return {version:HYBRID_VERSION,scenes:[],cost:{credits:null,status:'scenario-required'}};
  const scenes=project.scenes.map((scene,index)=>{
    const route=sceneRoute(scene,index),reused=!!project.assets?.[scene.id];
    return {sceneId:scene.id,duration:scene.duration,...route,label:HYBRID_LABELS[route.renderer],reused,needsArtwork:!reused&&['higgsfield','webtoon'].includes(route.renderer),needsVideo:!reused&&route.renderer==='higgsfield',localRender:!reused&&['motion','3d','webtoon'].includes(route.renderer)};
  });
  return {version:HYBRID_VERSION,style:'섬세한 잉크 선 · 청록/남색 · 앰버 강조',scenes,cost:{credits:null,status:'worker-live-quote',limit:project.brief.maxCredits,artworkScenes:scenes.filter(s=>s.needsArtwork).length,videoScenes:scenes.filter(s=>s.needsVideo).length,note:'생성 전 워커가 원화 캐시와 실견적을 확인합니다. 음성 사용량은 별도입니다.'}};
}
export function hybridGuide(brief) {
  if(!isHybrid(brief))return '';
  return `자동 혼합 hybrid-v1: 첫 장면은 6초 Higgsfield, 이후 visualDirection.treatment에 따라 scene=웹툰, cutaway=3D 구조도, comparison/process/summary=전체 화면 모션입니다. 모든 장면의 webtoon 데이터는 필요하지만 3D/모션 장면의 원화는 생성하지 않습니다.
모든 장면에 hybrid:{renderer:"auto",focus:"확대할 layers의 실제 id",depth:8}를 넣으세요. 사용자가 방식을 지정했을 때만 renderer를 webtoon/motion/3d로 지정하세요. 3D는 사각 부품의 두께와 공간 관계를 보여주는 개념 구조도이며 일반 실사 3D 모델이나 물리 시뮬레이션이 아닙니다. 단면이 맞지 않으면 comparison/process로 정확한 2D 모션을 사용하세요.
같은 핵심 대상은 앞뒤 장면에서 색/외형/label을 통일합니다. 모든 화면은 남색 배경과 청록 대상, 앰버 강조를 유지하며 웹툰의 잉크 선을 공유합니다. 레이어의 from/to/size/points/start/end는 실제 대사에서 설명한 움직임을 표현하세요. 첫20% 맥락, 중간60% 변화, 마지막20% 결과를 읽습니다. 도입 후 구조 전체 → focus 대상 확대 → 결과 → 전체 연결을 유지하세요. 원리와 무관한 장식 회전, 이유 없는 화면 변화, 제목 카드 반복을 넣지 마세요. 코드/HTML/URL은 반환하지 않습니다.`;
}
