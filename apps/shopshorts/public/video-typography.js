// Shared browser/worker artwork. Versioned, opt-in on existing projects.
export const TYPOGRAPHY = 'modern-v1';
export const modernProject = p => p.brief?.typography === TYPOGRAPHY;
export function defaultCaption(aspect='9:16') {
 return {presentation:TYPOGRAPHY,font:'pretendard',size:aspect==='9:16'?62:52,color:'#ffffff',position:'bottom',x:50,y:75,background:true,backgroundColor:'#0d161d',backgroundOpacity:215/255,outlineWidth:0,outlineColor:'#000000'};
}
export function defaultHeader(project,clip) {
 const text=(project.scenes?.[0]?.visualDirection?.hookText||project.title||project.brief?.topic||'').trim();
 if(!clip||!text)return [];
 return [{...defaultCaption(project.brief.aspect),id:'opening-question',clipId:clip.id,text:text.slice(0,100),startFrame:0,endFrame:Math.min(105,clip.outFrame-clip.inFrame),presentation:'modern-header-v1',size:project.brief.aspect==='9:16'?88:76,position:'top',x:0,y:0,background:true}];
}
const xml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
// Conservative advance bounds: Korean/CJK occupy one em, Latin/punctuation less.
const units=s=>[...s].reduce((n,c)=>n+(/\s/u.test(c)?.34:/[MW@]/u.test(c)?1:/[\u0000-\u007f]/u.test(c)?.7:1),0);
export function typographyLines(text,size,maxWidth) {
 const lines=[];
 for(const paragraph of text.split('\n')) {
  let line='';
  for(const char of paragraph){if(line&&units(line+char)*size>maxWidth){lines.push(line.trim());line='';}line+=char;}
  lines.push(line.trim());
 }
 return lines;
}
export function captionArtwork(c,aspect='9:16',family='Pretendard') {
 const header=c.presentation==='modern-header-v1',portrait=aspect==='9:16',canvasWidth=portrait?1080:1920;
 const maxWidth=header?canvasWidth-224:portrait?880:1600;
 let size=c.size,lines=typographyLines(c.text,size,maxWidth);
 if(header){while(lines.length>2&&size>20){size--;lines=typographyLines(c.text,size,maxWidth);}}
 if(lines.length===2&&!c.text.includes('\n')){const chars=[...c.text.replace(/\s+/gu,' ')];let best=lines,score=Infinity;for(let i=1;i<chars.length;i++){const pair=[chars.slice(0,i).join('').trim(),chars.slice(i).join('').trim()];const widths=pair.map(units);if(Math.max(...widths)*size>maxWidth)continue;const penalty=Math.abs(widths[0]-widths[1])+(/\s/u.test(chars[i-1])||/\s/u.test(chars[i])?0:4);if(penalty<score){best=pair;score=penalty;}}lines=best;}
 const lineHeight=size*78/62,padX=30,padY=18;
 const width=header?canvasWidth:Math.ceil(Math.min(maxWidth,Math.max(...lines.map(l=>units(l)*size),1))+padX*2);
 const height=header?(portrait?620:430):Math.ceil(lines.length*lineHeight+padY*2);
 let content='';
 if(header){
  if(c.background)content+=`<defs><linearGradient id="shade" x2="0" y2="1"><stop stop-color="#0d161d" stop-opacity=".67"/><stop offset="1" stop-color="#0d161d" stop-opacity="0"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#shade)"/>`;
  const top=portrait?204:100;
  content+=`<rect x="76" y="${top-6}" width="8" height="${Math.max(1,lines.length)*lineHeight+8}" rx="4" fill="#6ee9db"/>`;
  lines.forEach((line,i)=>{content+=`<text x="112" y="${top+size*.82+i*lineHeight}" fill="${i===0?xml(c.color):'#92f4e4'}">${xml(line)}</text>`;});
 }else{
  if(c.background)content+=`<rect width="${width}" height="${height}" rx="20" fill="${xml(c.backgroundColor||'#0d161d')}" fill-opacity="${c.backgroundOpacity??215/255}"/>`;
  lines.forEach((line,i)=>{content+=`<text x="${width/2}" y="${padY+size*.88+i*lineHeight}" text-anchor="middle" fill="${xml(c.color)}">${xml(line)}</text>`;});
 }
 const stroke=c.outlineWidth?` stroke="${xml(c.outlineColor||'#000000')}" stroke-width="${c.outlineWidth}" paint-order="stroke fill"`:'';
 return {width,height,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${xml(c.text)}"><g font-family="${xml(family)}" font-size="${size}" font-weight="600"${stroke}>${content}</g></svg>`};
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

