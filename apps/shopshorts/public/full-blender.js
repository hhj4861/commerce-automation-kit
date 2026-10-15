// Explicit opt-in. Legacy hybrid/webtoon openings keep their paid-provider policy.
export const fullBlender=brief=>brief?.productionStyle==='blender';
export function fullBlenderGuide(brief){
 if(!fullBlender(brief))return '';
 return `전체 Blender 3D: 첫 장면부터 마지막까지 Blender로 생성합니다. Higgsfield/이미지 생성/웹툰 원화/2D 모션으로 대체하지 않습니다. 모든 장면 kind:video, hybrid.renderer:3d입니다. 최소2장면, 장면당1~12초이며 도입6초 강제는 없습니다.
장면마다 webtoon:{artPrompt,answer,layers}를 도형 데이터 컨테이너로 사용합니다. artPrompt는 원화 생성 요청이 아니라 공간/조명 설명(1~1600자), answer는 시각적 인과 설명(1~160자)입니다. layers는1~12개: {id,label,meaning,shape,color,from,to,size,start,end,motion,points?}. id는 영문소문자/숫자/하이픈1~30자, label20자 이하, meaning240자 이하. shape는rect/ellipse/polygon/path. color는#RRGGBB. from/to/size는0~100좌표쌍, size는각1이상. start0~0.8, end0.1~1이며 end>start. motion은move/flow/scale/reveal. 최소하나의 실제 변화가 필요합니다. move는from과to가 달라야 합니다. polygon은3~32, path는2~32개의0~100좌표쌍 points를 제공합니다.
hybrid:{renderer:3d,focus:실제layer의id,depth:1~24,parts:건축 부품 배열}를 작성합니다. 동일 시설의 형태·재질·축·좌표를 장면 사이에 유지하세요. 각 부품은 실제 대사와 연결하고 원인→변화→결과를 보여줍니다. 측정된 설계도나 안전 시뮬레이션이 아닌 원리 재현임을 밝히세요. 등록된 전용 장면은 서버에서만 선택합니다. 임의의 authored ID, 실행 코드, 파일 경로를 만들지 마세요.`;
}
