// Non-destructive 30fps timeline, shared by browser and renderer.
export const FPS = 30;
export const FONTS = [
 {id:'gothic',name:'나눔고딕',family:'Studio Gothic',file:'NanumGothic-Regular.ttf'},
 {id:'myeongjo',name:'나눔명조',family:'Studio Myeongjo',file:'NanumMyeongjo-Regular.ttf'},
 {id:'pen',name:'나눔손글씨',family:'Studio Pen',file:'NanumPenScript-Regular.ttf'},
];
export const frameCount=e=>e.clips.reduce((n,c)=>n+c.outFrame-c.inFrame,0);
export function normalizeEdit(p){const e=p.edit;if(e?.version===2)return structuredClone(e);return{version:2,fps:FPS,clips:(e?.order||p.scenes.map(s=>s.id)).map((id,i)=>({id:`clip-${i+1}`,sceneId:id,inFrame:0,outFrame:Math.round((e?.durations[id]??p.scenes.find(s=>s.id===id).duration)*FPS)})),captions:[],voice:e?.voice||'none',music:e?.music||null,musicVolume:e?.musicVolume??.15};}
export function clipAt(e,frame){let start=0;for(const clip of e.clips){const end=start+clip.outFrame-clip.inFrame;if(frame<end)return{clip,start,local:Math.max(0,frame-start)};start=end;}return null;}
export function splitClip(edit,id,offset,newId){const e=structuredClone(edit),i=e.clips.findIndex(c=>c.id===id),c=e.clips[i];if(!c||!Number.isInteger(offset)||offset<1||offset>=c.outFrame-c.inFrame)throw Error('클립 안쪽 프레임에 재생 헤드를 놓으세요.');const cut=c.inFrame+offset;e.clips.splice(i,1,{...c,outFrame:cut},{...c,id:newId,inFrame:cut});e.captions=e.captions.flatMap((t,index)=>{if(t.clipId!==id)return[t];const parts=[];if(t.startFrame<offset)parts.push({...t,endFrame:Math.min(t.endFrame,offset)});if(t.endFrame>offset)parts.push({...t,id:`${newId}-text-${index}`,clipId:newId,startFrame:Math.max(0,t.startFrame-offset),endFrame:t.endFrame-offset});return parts;});return e;}
export function copyClip(e,id){const clip=e.clips.find(c=>c.id===id);if(!clip)throw Error('클립을 선택하세요.');return structuredClone({clip,captions:e.captions.filter(c=>c.clipId===id)});}
export function pasteClip(edit,data,afterId,newId){if(!data)throw Error('먼저 클립을 복사하세요.');const e=structuredClone(edit),i=e.clips.findIndex(c=>c.id===afterId);e.clips.splice(i<0?e.clips.length:i+1,0,{...data.clip,id:newId});e.captions.push(...data.captions.map((t,i)=>({...t,id:`${newId}-text-${i}`,clipId:newId})));return e;}
export function removeClip(edit,id){const e=structuredClone(edit);e.clips=e.clips.filter(c=>c.id!==id);e.captions=e.captions.filter(c=>c.clipId!==id);return e;}
export function trimClip(edit,id,start,end){const e=structuredClone(edit),c=e.clips.find(c=>c.id===id);if(!c||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>900)throw Error('시작·끝은 0~900 사이 프레임이며 끝이 시작보다 커야 합니다.');const shift=start-c.inFrame,length=end-start;c.inFrame=start;c.outFrame=end;e.captions=e.captions.flatMap(t=>{if(t.clipId!==id)return[t];const a=Math.max(0,t.startFrame-shift),b=Math.min(length,t.endFrame-shift);return b>a?[{...t,startFrame:a,endFrame:b}]:[];});return e;}
