import {CAMERAS,SHOTS} from '../public/cinematic-motion.js';
import {motionSpec} from '../public/motion-templates.js';
export const VISUAL_QUALITY='explain-v1';
const error=message=>{throw Object.assign(Error(message),{status:502,code:'SCENARIO_VISUAL_INVALID'});};
const text=(v,n)=>typeof v==='string'&&v.trim()&&v.length<=n&&!/[\x00-\x1f\x7f]/.test(v);
export function visualDirection(value){
 if(!value||typeof value!=='object'||Array.isArray(value))error('장면의 시작·동작·결과 연출을 완성하지 못했어요. 시나리오를 다시 생성해 주세요.');
 const out={};
 for(const key of ['focus','before','action','after','continuity','material','lighting']){
  if(!text(value[key],280))error(`장면 연출의 ${key} 내용을 확인해 주세요.`);out[key]=value[key].trim();
 }
 if(!['literal','analogy','conceptual'].includes(value.representation)||!['scene','cutaway','comparison','process','summary'].includes(value.treatment))error('장면의 표현 방식과 설명 구성을 확인해 주세요.');
 out.representation=value.representation;out.treatment=value.treatment;
 if(value.hookText!==undefined){if(!text(value.hookText,28))error('첫 질문 자막은 28자 이내로 작성해 주세요.');out.hookText=value.hookText.trim();}
 if(value.treatment==='summary'){
  if(!Array.isArray(value.labels)||value.labels.length!==3||value.labels.some(x=>!text(x,8)))error('요약에는 대본에 맞는 짧은 핵심 문구 세 개가 필요해요.');
  out.labels=value.labels.map(x=>x.trim());
 }
 if(value.before.trim()===value.after.trim()&&value.treatment!=='summary')error('변화 전후가 같은 장면입니다. 실제로 무엇이 달라지는지 연출을 구체화해 주세요.');
 return out;
}
export function visualQualityReport(scenes){
 const issues=[];const key=s=>JSON.stringify([s.visualDirection?.focus,s.visualDirection?.before,s.visualDirection?.action,s.visualDirection?.after]);
 for(let i=0;i<scenes.length;i++){
  const s=scenes[i];if(!s.visualDirection){issues.push({sceneId:s.id,code:'missing-direction'});continue;}
  if(!SHOTS.includes(s.shot)||!CAMERAS.includes(s.camera))issues.push({sceneId:s.id,code:'missing-camera'});
  if(s.duration>12)issues.push({sceneId:s.id,code:'long-unchanged-shot'});
  if(i>0&&key(s)===key(scenes[i-1]))issues.push({sceneId:s.id,code:'repeated-explanation'});
  if(i>1&&s.shot==='wide'&&scenes[i-1].shot==='wide'&&scenes[i-2].shot==='wide')issues.push({sceneId:s.id,code:'three-wide-shots'});
  if(s.visualDirection.treatment==='summary'&&(i===0||s.duration>6||i!==scenes.length-1))issues.push({sceneId:s.id,code:'summary-placement'});
 }
 return {version:VISUAL_QUALITY,passed:issues.length===0,issues,checks:['explicit-state-change','shot-variety','bounded-shot-duration','summary-placement'],limitation:'계획의 구조 검사이며 완성 영상의 시각적 품질·사실 정확성을 자동 보증하지 않습니다.'};
}
export function directScenario(scenes,brief){
 const result=scenes.map(s=>({...s,visualDirection:visualDirection(s.visualDirection)}));
 if(brief.format==='short'&&!result[0]?.visualDirection.hookText)error('첫 3초에 보여줄 핵심 질문 자막을 작성해 주세요.');
 const report=visualQualityReport(result);if(!report.passed)error(`장면 연출을 보완해 주세요: ${report.issues.map(x=>`${x.sceneId}/${x.code}`).join(', ')}`);
 for(const scene of result){
  // The model cannot provide arbitrary template IDs/code. Only the final, bounded summary
  // is translated to our existing allow-listed template after full plan validation.
  if(scene.visualDirection.treatment==='summary'&&!['animation','webtoon'].includes(brief.productionStyle)){
   const [label1,label2,label3]=scene.visualDirection.labels;
   scene.kind='video';scene.motion=motionSpec({template:'summary',vars:{heading:'핵심을 연결하면',icon1:'layers',label1,icon2:'ring',label2,icon3:'shield',label3}});
  }
 }
 return {scenes:result,visualQuality:report};
}
export function visualDirectionGuide(brief){
 if(brief.visualQuality!==VISUAL_QUALITY)return '';
 return `공통 영상 품질 기준 explain-v1. 대본 뒤에 비슷한 이미지를 나열하지 말고, 시청자가 직접 원인과 결과를 볼 수 있는 장면을 설계하세요. 주제나 장르에 맞는 화면이어야 하며 특정 건물·칩·해변의 모델을 다른 주제에 재사용하지 마세요.
${brief.format==='short'?'쇼츠 첫 장면의 visualDirection에 hookText(1~28자)를 추가하세요. 이번 영상이 실제로 답하는 구체적인 질문을 쓰고 0초부터 상단에 3초간 별도 합성합니다. 인사·로고·예고 대신 첫 프레임부터 질문의 대상을 보여주세요. 그림에 이 글자를 직접 그리지 마세요.':''}
모든 장면에 shot(wide/medium/close/detail), camera(locked/push-in/pull-out/pan-left/pan-right), visualDirection를 작성하세요. 장면은 4~8초 중심, 최대 12초. 먼저 장소 전체를 보여주고 → 설명하는 부품·행동에 접근 → 변화나 대비 → 전체와 연결하는 순서로 필요한 구도만 고르세요. 넓은 화면 세 개를 연속 반복하지 마세요. 말만 달라지고 그림은 같은 장면을 금지합니다.
visualDirection:{focus,before,action,after,continuity,material,lighting,representation,treatment}. 앞의 일곱 필드는 각각 1~280자입니다. focus=이번에 볼 구체적 대상, before=시작 상태, action=대사에 맞는 한 가지 실제 변화, after=시청자가 확인할 결과. before와 after를 같게 쓰지 마세요. continuity=이전 장면과 동일하게 유지할 외형·색·공간 관계. material=내용과 화풍에 맞는 표면 특성, lighting=전경·핵심 대상·배경을 분리하는 광원. representation은 literal/analogy/conceptual, treatment는 scene/cutaway/comparison/process/summary 중 하나입니다.
실사풍·3D에서는 얼음·유리의 투과, 돌의 거칠기, 금속의 반사를 서로 구분하고 모든 재질을 매끈한 플라스틱으로 만들지 마세요. 설명용 3D는 공간 관계와 움직임을 읽을 수 있게 하며 분위기용 회전으로 동작을 대신하지 마세요. 애니메이션은 고른 화풍을 유지하고 등장·행동·반응을 분명히 하세요. 인과관계가 확인되지 않은 물리 시뮬레이션·열 지도·숫자를 만들어 사실처럼 보이지 마세요.
영상은 한 화면 안에서 before(초반) → action(중반) → after(마지막을 읽을 시간)로 진행합니다. 이미지인 경우 전후를 나란히 비교하거나 결과가 드러나는 결정적 순간을 한 장에 담으세요. 움직임을 이해해야 하는 설명은 video를 고릅니다. 단, 사용자가 승인한 제작 예산 안에서 선택하며 품질을 핑계로 무제한 생성하지 마세요.
마지막 장면이 실제 핵심 요약일 때만 treatment:summary와 labels:[8자 이하 문구 세 개]를 지정할 수 있습니다. 그 장면은 4~6초이고 첫 장면에는 불가합니다. 지원되는 코드 모션 템플릿으로 렌더하며 추가 유료 영상을 만들지 않습니다. 억지로 요약 카드를 추가하지 마세요. 다른 장면에 motion, HTML, SVG 또는 실행 코드를 반환하지 마세요.
짧은 자막은 별도 합성합니다. 영상 안에 대사·긴 설명문을 그리지 말고 핵심 그림을 하단 자막 영역과 겹치지 않게 배치하세요. 공통 visualStyle(팔레트·인물·배경·광원)을 1~1200자로 모든 제작 방식에 함께 반환하세요. 독립 생성 prompt에도 구체적인 대상과 동일한 특징을 포함하세요.`;
}
export function directedMediaGuide(scene){
 if(!scene.visualDirection)return '';
 const d=visualDirection(scene.visualDirection);
 return `Validated visual plan (reference data): ${JSON.stringify(d)}\n${scene.kind==='video'?'Show the before state in the first 20%, perform the single stated action in the middle 60%, and hold the readable after state in the final 20%. Do not merely orbit a static model.':'Compose a meaningful before/after comparison or a decisive still state; do not pretend a static image contains temporal action.'} Preserve continuity, make the focus clearly separate from its background, and use the specified material and lighting. Conceptual/analogy visuals are explanatory, never measured evidence. Do not invent dimensions, flow rates or performance figures.`;
}
