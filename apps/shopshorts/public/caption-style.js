// Optional fields preserve existing projects. Coordinates span the available text area.
export const CAPTION_STYLES = [
 {id:'clean',name:'깔끔한',font:'gothic',size:56,color:'#ffffff',background:false,outlineWidth:2,outlineColor:'#000000',backgroundColor:'#000000',backgroundOpacity:.65},
 {id:'box',name:'또렷한 박스',font:'gothic',size:56,color:'#ffffff',background:true,outlineWidth:0,outlineColor:'#000000',backgroundColor:'#000000',backgroundOpacity:.75},
 {id:'impact',name:'강한 한마디',font:'blackhan',size:76,color:'#ffda55',background:false,outlineWidth:4,outlineColor:'#151515',backgroundColor:'#000000',backgroundOpacity:.65},
 {id:'friendly',name:'다정한',font:'jua',size:64,color:'#ffffff',background:true,outlineWidth:0,outlineColor:'#000000',backgroundColor:'#355c53',backgroundOpacity:.9},
 {id:'story',name:'감성 이야기',font:'myeongjo',size:58,color:'#fff4df',background:false,outlineWidth:1,outlineColor:'#362d25',backgroundColor:'#000000',backgroundOpacity:.65},
 {id:'note',name:'손글씨',font:'pen',size:82,color:'#ffffff',background:false,outlineWidth:2,outlineColor:'#000000',backgroundColor:'#000000',backgroundOpacity:.65},
];
export function captionStyle(c) {
 return {outlineWidth:2,outlineColor:'#000000',backgroundColor:'#000000',backgroundOpacity:.65,...c};
}
export function captionExtras(c) {
 const out={};
 for(const [key,min,max] of [['x',0,100],['y',0,100],['outlineWidth',0,8],['backgroundOpacity',0,1]]) {
  if(c[key]===undefined)continue;
  if(!Number.isFinite(c[key])||c[key]<min||c[key]>max)throw Error('자막 위치와 스타일의 범위를 확인하세요.');
  out[key]=c[key];
 }
 for(const key of ['outlineColor','backgroundColor']) {
  if(c[key]===undefined)continue;
  if(typeof c[key]!=='string'||!/^#[0-9a-f]{6}$/i.test(c[key]))throw Error('자막 색상을 확인하세요.');
  out[key]=c[key];
 }
 return out;
}
export function applyCaptionStyle(c,id) {
 const preset=CAPTION_STYLES.find(p=>p.id===id);
 if(!preset)throw Error('자막 스타일을 선택하세요.');
 const {id:_,name,...values}=preset;
 return {...c,...values};
}
// Deleting and copying text never changes the underlying video clip.
export function deleteCaption(edit,id) {
 return {...edit,captions:edit.captions.filter(c=>c.id!==id)};
}
export function pasteCaption(edit,caption,clipId,localFrame,id) {
 const clip=edit.clips.find(c=>c.id===clipId);
 if(!clip||!caption)throw Error('자막을 붙일 영상 클립을 선택하세요.');
 const length=clip.outFrame-clip.inFrame,start=Math.max(0,Math.min(length-1,localFrame));
 return {...edit,captions:[...edit.captions,{...caption,id,clipId,startFrame:start,endFrame:Math.min(length,start+caption.endFrame-caption.startFrame)}]};
}
