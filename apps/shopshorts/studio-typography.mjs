import {Resvg} from '@resvg/resvg-js';
import {writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {captionArtwork} from './public/video-typography.js';
import {FONTS} from './public/editor-model.js';
import {captionExtras} from './public/caption-style.js';
const publicDir=resolve(dirname(fileURLToPath(import.meta.url)),'public');
export async function renderCaptionArtwork(c,aspect,path){
 captionExtras(c);
 const font=FONTS.find(f=>f.id===c.font);if(!font)throw Error('지원하지 않는 자막 폰트입니다.');
 // Default family uses this exact bundled font, never a host-dependent substitute.
 const family={pretendard:'Pretendard',gothic:'NanumGothic',myeongjo:'NanumMyeongjo',pen:'Nanum Pen Script',dohyeon:'Do Hyeon',jua:'Jua',blackhan:'Black Han Sans',gowun:'Gowun Dodum'}[c.font];
 const art=captionArtwork(c,aspect,family);
 const image=new Resvg(art.svg,{font:{fontFiles:[resolve(publicDir,font.file)],loadSystemFonts:false,defaultFontFamily:family}}).render();
 await writeFile(path,image.asPng());return {...art,path,caption:c};
}
export function artworkFilter(vf,overlays){
 const escape=p=>p.replaceAll('\\','/').replaceAll(':','\\:').replaceAll("'", "'\\\\''");
 for(const [i,{path,caption:c}] of overlays.entries()){
  const x=c.x===undefined?'(W-w)/2':`(W-w)*${c.x/100}`;
  const y=c.y===undefined?{top:'H*0.08',middle:'(H-h)/2',bottom:'H*0.92-h'}[c.position]:`(H-h)*${c.y/100}`;
  vf+=`[base${i}];movie=filename='${escape(path)}'[art${i}];[base${i}][art${i}]overlay=x=${x}:y=${y}:enable='gte(t,${c.startFrame/30})*lt(t,${c.endFrame/30})'`;
 }
 return vf;
}
