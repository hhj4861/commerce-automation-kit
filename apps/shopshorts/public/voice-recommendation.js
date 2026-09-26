// Editorial descriptions of the supported voices, not measured quality scores.
export const VOICE_PROFILES = [
 {id:'n2fbxG88jqAoaVPUy3IG',name:'Yooni',tone:'밝고 또렷한 전달'},
 {id:'ZRJMGKt2Okf3o9C38eSq',name:'Claire',tone:'차분한 설명'},
 {id:'Kndx0DUJ5HQE1HQgiMY8',name:'Jin',tone:'선명한 대화'},
 {id:'BbsagRO6ohd8MKPS2Ob0',name:'진건',tone:'차분한 남성 내레이션'},
 {id:'sf8Bpb1IU97NI9BHSMRf',name:'Rumi',tone:'부드러운 대화'},
 {id:'none',name:'내레이션 없음',tone:'사용자가 음성 없는 영상을 명시한 경우'},
];

// A freshness key, not a security boundary. Visual-only edits don't change casting.
export function voiceContext(project) {
 const text=JSON.stringify([project.brief?.category,project.brief?.topic,project.brief?.direction,(project.scenes||[]).map(s=>s.narration)]);
 let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
 return (hash>>>0).toString(16);
}
export function validatedVoiceRecommendation(value,project) {
 if(!VOICE_PROFILES.some(v=>v.id===value?.voiceId)||typeof value.reason!=='string'||!value.reason.trim()||value.reason.length>240)return null;
 return {voiceId:value.voiceId,reason:value.reason.trim(),context:voiceContext(project),method:'llm'};
}
export function recommendedVoice(project) {
 const saved=project.voiceRecommendation;
 if(saved?.context===voiceContext(project)){
  const checked=validatedVoiceRecommendation(saved,project);
  if(checked)return checked;
 }
 const direction=project.brief?.direction||'', category=project.brief?.category;
 let index=1,reason='설명을 차분하게 전달하는 기본 추천이에요.';
 if(/내레이션 없음|음성 없이|목소리 없이/.test(direction)){index=5;reason='음성 없이 제작해 달라는 요청을 반영했어요.';}
 else if(/남성|남자 목소리/.test(direction)){index=3;reason='차분한 남성 목소리 요청에 맞춘 기본 추천이에요.';}
 else if(/위로|따뜻|부드럽|공감/.test(direction)){index=4;reason='부드럽게 이야기하는 분위기에 맞춘 기본 추천이에요.';}
 else if(/밝|경쾌|활기/.test(direction)||category==='상품광고'){index=0;reason='밝고 또렷한 전달에 맞춘 기본 추천이에요.';}
 else if(/대화|상황극/.test(direction)||category==='막장드라마'){index=2;reason='대사를 선명하게 전달하는 기본 추천이에요.';}
 return {voiceId:VOICE_PROFILES[index].id,reason,method:'default'};
}
