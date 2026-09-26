// Non-destructive 30fps timeline, shared by browser and renderer.
export const FPS = 30;
import {musicClips} from './music-timeline.js';
export const FONTS = [
 {id:'gothic',name:'나눔고딕',family:'Studio Gothic',file:'NanumGothic-Regular.ttf'},
 {id:'myeongjo',name:'나눔명조',family:'Studio Myeongjo',file:'NanumMyeongjo-Regular.ttf'},
 {id:'pen',name:'나눔손글씨',family:'Studio Pen',file:'NanumPenScript-Regular.ttf'},
 {id:'dohyeon',name:'도현 · 단단한 제목',family:'Studio DoHyeon',file:'DoHyeon-Regular.ttf'},
 {id:'jua',name:'주아 · 둥근 고딕',family:'Studio Jua',file:'Jua-Regular.ttf'},
 {id:'blackhan',name:'검은고딕 · 굵은 강조',family:'Studio BlackHan',file:'BlackHanSans-Regular.ttf'},
 {id:'gowun',name:'고운돋움 · 부드러운 본문',family:'Studio Gowun',file:'GowunDodum-Regular.ttf'},
];
export function clipSpans(e) {
 let cursor=0;
 return e.clips.map(clip=>{const start=clip.startFrame??cursor,end=start+clip.outFrame-clip.inFrame;cursor=end;return{clip,start,end};});
}
export const videoFrames=e=>Math.max(0,...clipSpans(e).map(c=>c.end));
export const frameCount=e=>Math.max(videoFrames(e),...(e.musicClips||[]).map(c=>c.startFrame+c.outFrame-c.inFrame));
export function assertClipPositions(e) {
 for(const c of e.clips)if(c.startFrame!==undefined&&(!Number.isInteger(c.startFrame)||c.startFrame<0))throw Error('영상 시작 위치는 0 이상의 정수 프레임입니다.');
 let end=0;
 for(const span of [...clipSpans(e)].sort((a,b)=>a.start-b.start)) {
  if(!Number.isInteger(span.start)||span.start<0||span.start<end)throw Error('영상 클립이 겹칩니다. 빈 구간으로 옮기거나 순서 화살표를 사용하세요.');
  end=span.end;
 }
}
export function positionClips(edit) {const e=structuredClone(edit);e.clips=clipSpans(e).map(s=>({...s.clip,startFrame:s.start}));return e;}
export function moveClip(edit,id,startFrame) {
 const e=positionClips(edit),c=e.clips.find(c=>c.id===id);if(!c)throw Error('클립을 선택하세요.');
 c.startFrame=startFrame;assertClipPositions(e);e.clips.sort((a,b)=>a.startFrame-b.startFrame);return e;
}
export function reorderClip(edit,id,to) {
 const e=structuredClone(edit),from=e.clips.findIndex(c=>c.id===id);if(from<0)return e;
 const [c]=e.clips.splice(from,1);e.clips.splice(Math.max(0,Math.min(to,e.clips.length)),0,c);
 // Reorder is an explicit ripple operation; music keeps its absolute position.
 for(const c of e.clips)delete c.startFrame;
 return e;
}
export function normalizeEdit(p){const e=p.edit;if(e?.version===2)return structuredClone(e);return{version:2,fps:FPS,clips:(e?.order||p.scenes.map(s=>s.id)).map((id,i)=>({id:`clip-${i+1}`,sceneId:id,inFrame:0,outFrame:Math.round((e?.durations[id]??p.scenes.find(s=>s.id===id).duration)*FPS)})),captions:[],voice:e?.voice||'none',music:e?.music||null,musicVolume:e?.musicVolume??.15};}
export function clipAt(e,frame){for(const {clip,start,end} of clipSpans(e)){if(frame>=start&&frame<end)return{clip,start,local:frame-start};}return null;}
export function splitClip(edit,id,offset,newId){const e=structuredClone(edit),i=e.clips.findIndex(c=>c.id===id),c=e.clips[i];if(!c||!Number.isInteger(offset)||offset<1||offset>=c.outFrame-c.inFrame)throw Error('클립 안쪽 프레임에 재생 헤드를 놓으세요.');const cut=c.inFrame+offset;e.clips.splice(i,1,{...c,outFrame:cut},{...c,id:newId,inFrame:cut,...(c.startFrame!==undefined?{startFrame:c.startFrame+offset}:{})});e.captions=e.captions.flatMap((t,index)=>{if(t.clipId!==id)return[t];const parts=[];if(t.startFrame<offset)parts.push({...t,endFrame:Math.min(t.endFrame,offset)});if(t.endFrame>offset)parts.push({...t,id:`${newId}-text-${index}`,clipId:newId,startFrame:Math.max(0,t.startFrame-offset),endFrame:t.endFrame-offset});return parts;});return e;}
export function copyClip(e,id){const clip=e.clips.find(c=>c.id===id);if(!clip)throw Error('클립을 선택하세요.');return structuredClone({clip,captions:e.captions.filter(c=>c.clipId===id)});}
export function pasteClip(edit,data,afterId,newId){
 if(!data)throw Error('먼저 클립을 복사하세요.');
 const positioned=edit.clips.some(c=>c.startFrame!==undefined),e=positioned?positionClips(edit):structuredClone(edit),i=e.clips.findIndex(c=>c.id===afterId);
 const clip={...data.clip,id:newId};delete clip.startFrame;
 if(positioned){const after=e.clips[i],start=after?after.startFrame+after.outFrame-after.inFrame:videoFrames(e),length=clip.outFrame-clip.inFrame;for(const c of e.clips)if(c.startFrame>=start)c.startFrame+=length;clip.startFrame=start;}
 e.clips.splice(i<0?e.clips.length:i+1,0,clip);e.captions.push(...data.captions.map((t,i)=>({...t,id:`${newId}-text-${i}`,clipId:newId})));return e;
}
export function removeClip(edit,id){const e=structuredClone(edit);e.clips=e.clips.filter(c=>c.id!==id);e.captions=e.captions.filter(c=>c.clipId!==id);return e;}
// All removals are edit operations and can be undone. Source files stay intact.
export function removeSelection(edit,{captionId,audioId,voice,clipId}) {
 const e=structuredClone(edit);
 if(captionId){e.captions=e.captions.filter(c=>c.id!==captionId);return e;}
 if(audioId){e.musicClips=musicClips(e).filter(c=>c.id!==audioId);return e;}
 if(voice){e.voice='none';return e;}
 if(!e.clips.some(c=>c.id===clipId))return e;
 if(e.clips.length===1)throw Error('영상 클립을 하나 이상 남겨주세요.');
 return removeClip(e,clipId);
}
export function removeAudioAsset(edit,assetId) {
 const e=structuredClone(edit);
 e.musicClips=musicClips(e).filter(c=>c.assetId!==assetId);
 if(e.music===assetId)e.music=null;
 e.hiddenAudioAssets=[...new Set([...(e.hiddenAudioAssets||[]),assetId])];
 return e;
}
export function scriptCaption(edit,clipId,text,id) {
 if(!text?.trim()||text.length>500)throw Error('대본 자막은 1~500자로 나누어 입력하세요.');
 const e=structuredClone(edit),clip=e.clips.find(c=>c.id===clipId);
 if(!clip)throw Error('영상 클립을 선택하세요.');
 const matches=e.captions.filter(c=>c.clipId===clipId&&(c.source==='script'||c.text===text));
 const caption={...(matches[0]||{id,clipId,font:'gothic',size:56,color:'#ffffff',position:'bottom',background:true}),source:'script',text,startFrame:0,endFrame:clip.outFrame-clip.inFrame};
 e.captions=e.captions.filter(c=>!matches.some(m=>m.id===c.id));e.captions.push(caption);
 return {edit:e,captionId:caption.id};
}
export function deduplicateCaptions(edit) {
 const e=structuredClone(edit),seen=new Set();
 e.captions=e.captions.filter(c=>{const key=JSON.stringify([c.clipId,c.text,c.startFrame,c.endFrame,c.font,c.size,c.color,c.position,c.background,c.x,c.y,c.outlineWidth??2,c.outlineColor??'#000000',c.backgroundColor??'#000000',c.backgroundOpacity??.65]);if(seen.has(key))return false;seen.add(key);return true;});
 return e;
}
export function trimClip(edit,id,start,end){const e=structuredClone(edit),c=e.clips.find(c=>c.id===id);if(!c||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>900)throw Error('시작·끝은 0~900 사이 프레임이며 끝이 시작보다 커야 합니다.');const shift=start-c.inFrame,length=end-start;c.inFrame=start;c.outFrame=end;e.captions=e.captions.flatMap(t=>{if(t.clipId!==id)return[t];const a=Math.max(0,t.startFrame-shift),b=Math.min(length,t.endFrame-shift);return b>a?[{...t,startFrame:a,endFrame:b}]:[];});return e;}
