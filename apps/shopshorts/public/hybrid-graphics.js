// Trusted deterministic SVG scene renderer. Only validated scene data enters this function.
// 3D mode uses parallel projection of box vertices; dimensions are conceptual, not measured.
export function hybridSvg(scene, aspect, time, renderer='motion') {
 const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const clamp=v=>Math.min(1,Math.max(0,v)),ease=v=>{const p=clamp(v);return p*p*(3-2*p);};
 const lerp=(a,b,t)=>a+(b-a)*t,t=clamp(time/scene.duration),portrait=aspect==='9:16';
 const w=portrait?1080:1920,h=portrait?1920:1080;
 const field={x:w*.16,y:h*.22,w:w*.68,h:h*(portrait?.43:.40)};
 const layers=scene.webtoon.layers;
 const focus=layers.find(l=>l.id===scene.hybrid?.focus)||layers[0];
 // Establish the object, approach the explanatory detail, then return to context.
 const zoom=1+.20*ease((t-.16)/.2)*(1-ease((t-.72)/.16));
 const fx=field.x+focus.to[0]/100*field.w,fy=field.y+focus.to[1]/100*field.h;
 const cx=w/2+(fx-w/2)*.35,cy=h*.44+(fy-h*.44)*.35;
 const line=(a,b,stroke='#e8bd7b',width=3)=>`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${stroke}" stroke-width="${width}"/>`;
 const poly=(pts,fill)=>`<polygon points="${pts.map(p=>p.join(',')).join(' ')}" fill="${fill}" stroke="#d8e5d7" stroke-width="2" stroke-linejoin="round"/>`;
 let body='';
 for(const l of layers){
  const p=ease((t-l.start)/(l.end-l.start));
  const pos=l.motion==='move'?l.from.map((v,i)=>lerp(v,l.to[i],p)):l.from;
  const x=field.x+pos[0]/100*field.w,y=field.y+pos[1]/100*field.h;
  const sw=l.size[0]/100*field.w,sh=l.size[1]/100*field.h;
  const scale=l.motion==='scale'?.55+.45*p:1,opacity=l.motion==='reveal'?p:t<l.start?0:1;
  let shape='';
  if(renderer==='3d'&&l.shape==='rect'){
   const d=(scene.hybrid?.depth??8)/100*Math.min(field.w,field.h);
   const project=(a,b,z)=>[a-z*.70,b-z*.38];
   const a=project(-sw/2,-sh/2,0),b=project(sw/2,-sh/2,0),c=project(sw/2,sh/2,0),e=project(-sw/2,sh/2,0),az=project(-sw/2,-sh/2,d),bz=project(sw/2,-sh/2,d),ez=project(-sw/2,sh/2,d);
   shape=poly([a,az,bz,b],'#92c4be')+poly([e,ez,az,a],'#37646c')+poly([a,b,c,e],l.color);
  } else if(l.shape==='rect')shape=`<rect x="${-sw/2}" y="${-sh/2}" width="${sw}" height="${sh}" rx="${Math.min(16,sh*.15)}" fill="${l.color}" stroke="#dfebde" stroke-width="2.5"/>`;
  else if(l.shape==='ellipse')shape=`<ellipse rx="${sw/2}" ry="${sh/2}" fill="${l.color}" stroke="#dfebde" stroke-width="2.5"/>`;
  else {
   const pts=l.points.map(([a,b])=>[a/100*sw-sw/2,b/100*sh-sh/2]);
   shape=l.shape==='polygon'?poly(pts,l.color):`<polyline points="${pts.map(p=>p.join(',')).join(' ')}" fill="none" stroke="${l.color}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  if(l.motion==='flow'){
   const route=(l.points||[[0,50],[100,50]]).map(([a,b])=>[a/100*sw-sw/2,b/100*sh-sh/2]);
   for(let i=0;i<4;i++){
    const q=(t>=l.end?1:clamp(((Math.max(0,t-l.start)/(l.end-l.start)+i/4)%1)))*(route.length-1),j=Math.min(route.length-2,Math.floor(q)),u=q-j;
    shape+=`<circle cx="${lerp(route[j][0],route[j+1][0],u)}" cy="${lerp(route[j][1],route[j+1][1],u)}" r="8" fill="#fff0bb"/>`;
   }
  }
  if(l.id===focus.id&&t>.25&&t<.78)shape+=`<rect x="${-sw/2-14}" y="${-sh/2-14}" width="${sw+28}" height="${sh+28}" rx="18" fill="none" stroke="#f2bb75" stroke-width="2" stroke-dasharray="6 9" opacity=".6"/>`;
  body+=`<g opacity="${opacity}" transform="translate(${x} ${y}) scale(${scale})">${shape}</g><text x="${x}" y="${y+sh/2+38}" opacity="${opacity}" fill="#f6eddb" font-family="NanumGothic" font-size="${portrait?29:26}" text-anchor="middle" stroke="#102733" stroke-width="5" paint-order="stroke">${esc(l.label)}</text>`;
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><radialGradient id="ambient"><stop stop-color="#244957"/><stop offset="1" stop-color="#10212d"/></radialGradient><pattern id="paper" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".6" fill="#efe2c6" opacity=".08"/></pattern></defs><rect width="${w}" height="${h}" fill="url(#ambient)"/><rect width="${w}" height="${h}" fill="url(#paper)"/><text x="${w*.07}" y="${h*.10}" font-family="NanumGothic" font-size="${portrait?30:27}" fill="#e9d6b5">${esc(scene.visualDirection?.focus||'변화를 따라가 보세요')}</text><text x="${w*.93}" y="${h*.14}" text-anchor="end" font-family="NanumGothic" font-size="${portrait?23:20}" fill="#a9c0c6">${renderer==='3d'?'3D 개념 구조도 · 실제 비율 아님':'원리 설명용 재구성'}</text><g transform="translate(${cx} ${cy}) scale(${zoom}) translate(${-cx} ${-cy})">${body}</g></svg>`;
}
