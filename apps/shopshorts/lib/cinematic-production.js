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

// Phrase boundaries first, then word wrapping. No syllables are discarded.
export function captionPhrases(text, lineLimit) {
  const words = text.trim().split(/\s+/u).flatMap(word => {
    const chars = Array.from(word), parts = [];
    for(let i=0;i<chars.length;i+=lineLimit)parts.push(chars.slice(i,i+lineLimit).join(''));
    return parts;
  });
  const phrases = []; let lines = [''];
  const flush = () => {if(lines.some(Boolean))phrases.push(lines.filter(Boolean).join('\n'));lines=[''];};
  for(const word of words) {
    let last = lines.length-1;
    if(Array.from(lines[last] + (lines[last]?' ':'') + word).length > lineLimit) {
      if(lines.length===2)flush();else lines.push('');
      last=lines.length-1;
    }
    lines[last]+=(lines[last]?' ':'')+word;
    if(/[.!?。！？]$/u.test(word))flush();
  }
  flush(); return phrases;
}

export function cinematicEdit(project) {
  const edit = normalizeEdit(project);
  for(const clip of edit.clips) {
    const scene = project.scenes.find(s=>s.id===clip.sceneId);
    const audio = narrationAsset(project, scene, edit.voice);
    if(edit.voice!=='none' && (!audio || !Number.isFinite(audio.duration) || audio.duration<=0))throw Error('대본 음성이 아직 준비되지 않았어요. 영상 제작을 다시 이어가 주세요.');
    // Keep deliberate breathing room, but never silently trim a spoken ending.
    clip.outFrame=Math.max(clip.outFrame, Math.ceil(((audio?.duration||0)+.2)*FPS));
    if(clip.outFrame>900)throw Error(`장면 ${scene.id}의 음성이 너무 길어요. 대본을 나누거나 줄여 주세요.`);
    const phrases=captionPhrases(scene.narration,project.brief.aspect==='9:16'?18:32);
    const weights=phrases.map(t=>Array.from(t.replace(/\s/gu,'')).length);
    const sum=weights.reduce((a,b)=>a+b,0), frames=Math.min(clip.outFrame,Math.ceil((audio?.duration||scene.duration)*FPS));
    let used=0;
    phrases.forEach((text,i)=>{
      const startFrame=Math.round(used/sum*frames);used+=weights[i];
      const endFrame=Math.round(used/sum*frames);
      if(endFrame-startFrame<12)throw Error(`장면 ${scene.id}의 자막이 너무 빨라요. 대본을 줄이거나 장면을 나누어 주세요.`);
      edit.captions.push({id:`${clip.id}-caption-${i}`,clipId:clip.id,source:'script',text,startFrame,endFrame,font:'gothic',size:project.brief.aspect==='9:16'?52:44,color:'#ffffff',position:'bottom',background:false,outlineWidth:2,outlineColor:'#000000'});
    });
  }
  return edit;
}
