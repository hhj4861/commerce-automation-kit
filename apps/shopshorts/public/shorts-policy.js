import {modernProject,defaultHeader} from './video-typography.js';
// Planning defaults, not YouTube ranking thresholds. Explicit lengths and saved edits win.
export const SHORTS_DEFAULT_SECONDS = 45;
export function openingCaption(project, clip) {
 if(modernProject(project))return defaultHeader(project,clip);
 const text=project.scenes?.[0]?.visualDirection?.hookText;
 if(project.brief?.format!=='short'||project.brief?.visualQuality!=='explain-v1'||!clip||!text)return [];
 // One bounded line avoids font-specific newline glyphs in FFmpeg drawtext.
 return [{id:'opening-question',clipId:clip.id,text,startFrame:0,endFrame:Math.min(90,clip.outFrame-clip.inFrame),font:'dohyeon',size:Math.min(64,Math.floor(900/[...text].length)),color:'#ffffff',position:'top',x:50,y:14,background:true,backgroundColor:'#131b22',backgroundOpacity:.8,outlineWidth:2,outlineColor:'#131b22'}];
}
export function suggestedDescription(project) {
 const category=project.brief?.category,topic=project.brief?.topic||'';
 const tags={'건축학':['#건축','#건축상식'],'과학':['#과학','#과학상식'],'심리학':['#심리학'],'역사':['#역사']}[category]||[];
 if(category==='과학'&&/반도체|기판|AI.?칩|HBM|메모리/.test(topic))tags.push('#반도체');
 return topic+(tags.length?'\n\n'+tags.join(' '):'');
}

export function relatedVideoUrl(value) {
 if(!value)return '';
 let u;try{u=new URL(value);}catch{throw Object.assign(Error('본편의 YouTube 주소를 입력하세요.'),{status:400});}
 const id=u.hostname==='youtu.be'?u.pathname.slice(1):['youtube.com','www.youtube.com'].includes(u.hostname)&&u.pathname==='/watch'?u.searchParams.get('v'):null;
 if(u.protocol!=='https:'||u.username||u.password||u.port||!/^[-_a-zA-Z0-9]{11}$/.test(id||''))throw Object.assign(Error('본편의 YouTube 주소를 입력하세요.'),{status:400});
 return 'https://www.youtube.com/watch?v='+id;
}
