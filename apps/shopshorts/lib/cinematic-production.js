import {sharedPipeline,validCaptionAlignment} from './production-pipeline.js';
import {RECIPE_ID,authoredCaptionPhrases,authoredCaptionLayout} from '../public/authored-recipes.js';
import {modernProject,defaultCaption,captionPhrases} from '../public/video-typography.js';
import {explainer} from './explainer-production.js';
import {FPS, normalizeEdit} from '../public/editor-model.js';
import {narrationAsset} from '../public/narration-audio.js';

export function cinematicGuide(brief) {
  if (brief.productionStyle !== 'cinematic') return '';
  return `영상 연출: 하나의 완성된 시네마틱 에세이처럼 설계하세요. 사용자의 화풍·분위기를 우선하며 모든 주제를 어둡게 만들지 마세요.
영상 전체에 공통으로 적용할 visualStyle 문자열(1~1200자)에 색상 팔레트, 광원 방향·질감, 반복 인물의 외형·의상, 공간과 핵심 소품을 구체적으로 기록하세요. 장면별 prompt에도 등장하는 인물·공간을 독립 생성 가능한 수준으로 반복하세요.
말 한 문장에 화면 하나를 기계적으로 붙이지 말고 의미가 전환될 때 컷을 바꾸세요. 장면은 보통 4~8초, 꼭 필요한 긴 호흡만 12초 이내로 계획하세요. ${brief.duration}초 전체 안에서 공간을 보여주는 wide → 행동을 보여주는 medium → 의미 있는 사물·표정의 close/detail로 시선의 크기를 변화시키세요. 같은 구도만 반복하지 마세요.
각 장면에 shot(wide/medium/close/detail), camera(locked/push-in/pull-out/pan-left/pan-right)를 추가하세요. 움직임은 하나만 절제해서 사용하며 공간·도해를 읽어야 하면 locked를 사용하세요. prompt에 대상의 행동, 시작과 끝 상태, 카메라, 조명, 다음 장면으로 이어지는 시각적 단서를 쓰세요.
움직임 자체가 메시지를 설명하는 장면은 kind:video, 사물·비교·정적인 설명은 kind:image로 고르세요. 이미지는 편집기에서 미세한 카메라 이동을 적용합니다. 영상 생성은 추가 사용량이 발생하므로 모든 컷을 무조건 영상으로 고르지 마세요. 장면당 복잡한 다중 동작·카메라 회전·급격한 변형을 요구하지 마세요.
클라이맥스는 앞서 나온 사물이나 구도를 다시 보여주되 의미가 바뀌게 설계하세요. 분위기용 야경·숲으로 대본의 구체적인 의미를 대체하지 마세요. 화면 글자·로고·자막·검은 레터박스는 생성하지 마세요. 별도 자막을 얹을 하단 여백을 남기세요.`;
}

export {captionPhrases} from '../public/video-typography.js';

export function cinematicEdit(project) {
  const edit = normalizeEdit(project);
  for(const clip of edit.clips) {
    const scene = project.scenes.find(s=>s.id===clip.sceneId);
    const audio = narrationAsset(project, scene, edit.voice);
    if(edit.voice!=='none' && (!audio || !Number.isFinite(audio.duration) || audio.duration<=0))throw Error('대본 음성이 아직 준비되지 않았어요. 영상 제작을 다시 이어가 주세요.');
    // Keep deliberate breathing room, but never silently trim a spoken ending.
    clip.outFrame=explainer(project.brief)&&audio?Math.ceil((audio.duration+.3)*FPS):Math.max(clip.outFrame, Math.ceil(((audio?.duration||0)+.2)*FPS));
    if(['ending','return'].includes(scene.hybrid?.authored?.shot)&&audio)clip.outFrame=Math.max(clip.outFrame,Math.ceil((audio.duration+1.5)*FPS));
    if(['webtoon','hybrid'].includes(project.brief.productionStyle)&&scene===project.scenes[0]&&project.authoredRecipe!==RECIPE_ID)clip.outFrame=Math.max(180,clip.outFrame);
    if(clip.outFrame>900)throw Error(`장면 ${scene.id}의 음성이 너무 길어요. 대본을 나누거나 줄여 주세요.`);
    edit.captions=edit.captions.flatMap(c=>c.clipId!==clip.id?[c]:c.startFrame<clip.outFrame-clip.inFrame?[{...c,endFrame:Math.min(c.endFrame,clip.outFrame-clip.inFrame)}]:[]);
    const phrases=project.authoredRecipe===RECIPE_ID?authoredCaptionPhrases(scene):captionPhrases(scene.narration,project.brief.aspect==='9:16'?(modernProject(project)?14:18):(modernProject(project)?28:32));
    const aligned=sharedPipeline(project)?audio?.alignment:null;
    if(sharedPipeline(project)&&edit.voice!=='none'&&(!validCaptionAlignment(aligned,scene.narration,audio.duration)||aligned.phrases.length!==phrases.length||aligned.phrases.some((p,i)=>p.text!==phrases[i])))throw Error('실제 음성의 자막 정렬이 아직 완료되지 않았습니다. 음성 생성을 이어가 주세요.');
    const weights=phrases.map(t=>Array.from(t.replace(/\s/gu,'')).length);
    const sum=weights.reduce((a,b)=>a+b,0), frames=Math.min(clip.outFrame,Math.ceil((audio?.duration||scene.duration)*FPS));
    let used=0;
    phrases.forEach((text,i)=>{
      const startFrame=aligned?Math.max(0,Math.floor(aligned.phrases[i].start*FPS)):Math.round(used/sum*frames);used+=weights[i];
      let endFrame=aligned?Math.min(clip.outFrame,Math.ceil(aligned.phrases[i].end*FPS)):Math.round(used/sum*frames);
      if(project.authoredRecipe===RECIPE_ID&&scene.id==='ending'&&i===phrases.length-1)endFrame=Math.max(endFrame,clip.outFrame-10);
      if(endFrame-startFrame<12)throw Error(`장면 ${scene.id}의 자막이 너무 빨라요. 대본을 줄이거나 장면을 나누어 주세요.`);
      edit.captions.push({id:`${clip.id}-caption-${i}`,clipId:clip.id,source:'script',text,startFrame,endFrame,font:'gothic',size:project.brief.aspect==='9:16'?52:44,color:'#ffffff',position:'bottom',background:false,outlineWidth:2,outlineColor:'#000000',...(explainer(project.brief)?{x:50,y:project.brief.captionPosition==='middle'?50:['webtoon','hybrid'].includes(project.brief.productionStyle)?82:88,position:project.brief.captionPosition,font:'gothic',size:project.brief.aspect==='9:16'?48:44,background:!['webtoon','hybrid'].includes(project.brief.productionStyle),backgroundColor:project.brief.productionStyle==='animation'?'#fcf8e9':'#161616',backgroundOpacity:.96,color:project.brief.productionStyle==='animation'?'#34372f':'#ffffff',outlineWidth:['webtoon','hybrid'].includes(project.brief.productionStyle)?3:0}:{}),...(modernProject(project)?{...defaultCaption(project.brief.aspect),...(project.brief.captionPosition==='middle'?{y:50,position:'middle'}:{})}:{})});
    });
  }
  for(const c of edit.captions){const clip=edit.clips.find(x=>x.id===c.clipId),scene=project.scenes.find(x=>x.id===clip?.sceneId);if(scene?.hybrid?.authored?.shot==='wheels')c.y=18;}
  if(project.authoredRecipe===RECIPE_ID){
    for(const c of edit.captions.filter(c=>c.source==='script'))Object.assign(c,authoredCaptionLayout(c.text));
    const header=edit.captions.find(c=>c.presentation==='modern-header-v1');if(header)header.text='8,300톤을\n공기로 띄운다?';
    const air=edit.clips.find(c=>c.sceneId==='air');
    if(air)edit.captions.push({...defaultCaption(project.brief.aspect),id:'authored-concept-label',clipId:air.id,source:'script',text:'원리 개념도 · 실제 상승 7.5cm',startFrame:0,endFrame:air.outFrame-air.inFrame,size:30,x:8,y:26,position:'top'});
  }
  if(project.authoredRecipe==='gateshead-tilting-v1'){
    const header=edit.captions.find(c=>c.presentation==='modern-header-v1');if(header)header.text='다리를 끊지 않고\n배가 지나간다고?';
    const structure=edit.clips.find(c=>c.sceneId==='structure');
    if(structure)edit.captions.push({...defaultCaption(project.brief.aspect),id:'authored-concept-label',clipId:structure.id,source:'script',text:'원리 재현 · 실제 비율과 다를 수 있음',startFrame:0,endFrame:structure.outFrame-structure.inFrame,size:30,x:8,y:26,position:'top'});
  }
  return edit;
}
