// Append-only execution contract. Missing version means the existing renderer.
export const PIPELINE_VERSION = 'studio-production-v1';
export function sharedPipeline(project){
 if(project?.pipelineVersion!==undefined&&project.pipelineVersion!==PIPELINE_VERSION)throw Object.assign(Error('지원하지 않는 제작 엔진 버전입니다.'),{status:409});
 return project?.pipelineVersion===PIPELINE_VERSION;
}
export function requireFinalReview(project) {
 if(sharedPipeline(project)&&(!project.render?.verification?.passed||project.render.verification.version!==PIPELINE_VERSION||!project.render.sha256||project.render.verification.sha256!==project.render.sha256))throw Object.assign(Error('완성본 검사를 통과한 영상을 다시 생성한 뒤 발행해 주세요.'),{status:409});
}

const ALIGNMENT_VERSION='whisper-words-v1';
export function validCaptionAlignment(value,text,duration,phrases){
 return value?.version===ALIGNMENT_VERSION&&value.text===text&&Number.isFinite(value.coverage)&&value.coverage>=.8&&value.coverage<=1&&Array.isArray(value.phrases)&&value.phrases.length>0&&(!phrases||(phrases.length===value.phrases.length&&phrases.every((p,i)=>p===value.phrases[i].text)))&&value.phrases.map(p=>p.text).join('').replace(/\s/gu,'')===text.replace(/\s/gu,'')&&value.phrases.every((p,i)=>Number.isFinite(p.start)&&Number.isFinite(p.end)&&p.start>=0&&p.end>p.start&&p.end<=duration+.1&&(i===0||p.start>=value.phrases[i-1].end-.001));
}
