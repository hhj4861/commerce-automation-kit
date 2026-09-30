// Original episode artwork. Conceptual load paths, not engineering calculations.
const C={bg:'#111713',ink:'#efe9d9',gold:'#d2aa68',green:'#88af9b',line:'#5d796b',steel:'#263f34',dark:'#19271f'};
const clamp=v=>Math.max(0,Math.min(1,v));
const ease=v=>1-(1-clamp(v))**3;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const text=(s,x,y,size=24,color=C.ink,anchor='middle')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-family="NanumGothic" text-anchor="${anchor}" font-weight="bold">${esc(s)}</text>`;
const path=(d,stroke=C.line,w=2,fill='none',extra='')=>`<path d="${d}" stroke="${stroke}" stroke-width="${w}" fill="${fill}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const line=(a,b,c,d,col=C.line,w=2)=>path(`M${a} ${b}L${c} ${d}`,col,w);
const poly=(points,fill,col=C.line,w=2)=>`<polygon points="${points}" fill="${fill}" stroke="${col}" stroke-width="${w}" stroke-linejoin="round"/>`;
function arrow(x,y,xx,yy,col=C.gold,w=4){const a=Math.atan2(yy-y,xx-x),r=12;return line(x,y,xx,yy,col,w)+path(`M${xx-r*Math.cos(a-.55)} ${yy-r*Math.sin(a-.55)}L${xx} ${yy}L${xx-r*Math.cos(a+.55)} ${yy-r*Math.sin(a+.55)}`,col,w);}
const fade=(shape,t,at=0)=>`<g opacity="${ease((t-at)/.7)}">${shape}</g>`;
function room(x,y,w,h,d,t,{skin=0,weight=4,load=false,glow=false}={}){
 const dy=d*.56;let s='';
 s+=poly(`${x},${y} ${x+w},${y} ${x+w+d},${y-dy} ${x+d},${y-dy}`,'#354638');
 s+=poly(`${x+w},${y-h} ${x+w+d},${y-h-dy} ${x+w+d},${y-dy} ${x+w},${y}`,'#23342b');
 // Floorboards, furniture and rear window establish a room before revealing its frame.
 for(let k=1;k<7;k++)s+=line(x+k*w/7,y,x+d+k*w/7,y-dy,'#64705a',.8);
 s+=`<g opacity="${skin}">`;
 s+=poly(`${x+d},${y-h-dy} ${x+w+d},${y-h-dy} ${x+w+d},${y-dy} ${x+d},${y-dy}`,'#b5a589');
 s+=`<rect x="${x+d+w*.38}" y="${y-h-dy+22}" width="${w*.38}" height="${h*.47}" fill="#526e64" stroke="#cabda5" stroke-width="6"/>`;
 s+=line(x+d+w*.57,y-h-dy+22,x+d+w*.57,y-h-dy+22+h*.47,'#cabda5',4);
 s+=poly(`${x+20},${y-12} ${x+w*.62},${y-12} ${x+w*.62+48},${y-40} ${x+68},${y-40}`,'#aa9d7f');
 s+=`<rect x="${x+24}" y="${y-64}" width="${w*.52}" height="42" rx="9" fill="#6a8068"/>`;
 s+=poly(`${x},${y-h} ${x+d},${y-h-dy} ${x+d},${y-dy} ${x},${y}`,'#b3ab94');
 s+='</g>';
 const col=glow?C.gold:C.green;
 for(const [xx,yy] of [[x,y],[x+w,y],[x+d,y-dy],[x+w+d,y-dy]])s+=line(xx,yy,xx,yy-h,col,weight);
 for(const yy of [y,y-h])s+=poly(`${x},${yy} ${x+w},${yy} ${x+w+d},${yy-dy} ${x+d},${yy-dy}`,'none',col,weight);
 for(const [xx,yy] of [[x,y],[x+w,y],[x,y-h],[x+w,y-h]])s+=`<rect x="${xx-7}" y="${yy-7}" width="14" height="14" rx="2" fill="${C.gold}"/><circle cx="${xx}" cy="${yy}" r="2.2" fill="${C.dark}"/>`;
 if(load)for(const [xx,yy] of [[x,y],[x+w,y]]){const p=(t*.33)%1;s+=arrow(xx,yy-h+10+(h-65)*p,xx,yy-h+50+(h-65)*p,C.gold,5);}
 return s;
}
function stacked(x,base,w,levels,t,{core=false,load=false}={}){
 const h=39,d=54;let s='';
 if(core)s+=poly(`${x+w*.42},${base} ${x+w*.78},${base} ${x+w*.78},${base-levels*h-52} ${x+w*.42},${base-levels*h-52}`,'#9e8459',C.gold,2)+poly(`${x+w*.78},${base} ${x+w*.78+38},${base-23} ${x+w*.78+38},${base-levels*h-75} ${x+w*.78},${base-levels*h-52}`,'#6e604a',C.gold,2);
 for(let j=0;j<levels;j++){
  const yy=base-j*h;
  s+=room(x,yy,w,h,d,t,{skin:0,weight:load?2+(levels-j)*.38:2});
  if(core&&j%2===0)s+=`<g opacity="${.45+.45*Math.sin(t*2-j*.6)**2}">${line(x+10,yy-18,x+w*.59,yy-18,C.gold,3)}<circle cx="${x+w*.59}" cy="${yy-18}" r="5" fill="${C.gold}"/></g>`;
 }
 s+=poly(`${x-28},${base+16} ${x+w+30},${base+16} ${x+w+d+55},${base-13} ${x+d-25},${base-13}`,'#394239','#687b69',2);
 if(load){for(let j=0;j<5;j++){const yy=base-levels*h+((t*.28+j/5)%1)*(levels*h);s+=arrow(x-36,yy-23,x-36,yy+11,C.gold,3);}}
 return s;
}
function loadScene(t){
 let s='';const reveal=ease((t-1.4)/2.4),skin=1-reveal;
 s+=room(155,494,267,171,135,t,{skin,weight:5,load:reveal>.6,glow:reveal>.8});
 s+=fade(text('철골 모듈',365,548,24,C.gold),t,2.7);
 s+=fade(stacked(242,1080,190,5,t,{load:true}),t,.5);
 s+=fade(text('하중',139,857,21,C.gold),t,2);
 s+=fade(line(452,970,547,936,C.gold)+text('연결부',554,925,22,C.gold),t,3.4);
 s+=fade(text('기초로 전달',356,1137,24,C.green),t,4);
 return s;
}
function floorScene(t){
 let s=stacked(251,547,186,7,t,{load:true});
 const p=(t*.22)%1,yy=245+p*275;
 s+=`<circle cx="232" cy="${yy}" r="${5+p*9}" fill="${C.gold}" opacity=".8"/>`;
 s+=text('위층',542,277,21,C.green)+text('아래층',542,520,21,C.gold);
 s+=line(492,281,507,281,C.green)+line(492,515,507,515,C.gold);
 // Two structural members, schematic thickness contrast instead of invented dimensions.
 s+=fade(room(72,962,177,125,77,t,{weight:3,glow:false}),t,.7);
 s+=fade(room(395,962,177,125,77,t,{weight:9,glow:true}),t,1.8);
 s+=fade(text('받는 하중에 맞춰',360,1070,29),t,2.2);
 s+=fade(text('철골을 조정',360,1117,27,C.gold),t,2.8);
 return s;
}
function coreScene(t){
 let s=stacked(262,549,174,8,t,{core:true});
 for(let j=0;j<4;j++){const p=(t*.3+j*.23)%1;s+=`<g opacity="${Math.sin(p*Math.PI)}">${arrow(63+p*130,285+j*58,111+p*130,285+j*58,C.green,3)}</g>`;}
 s+=text('바람',119,241,22,C.green)+text('코어',490,179,22,C.gold)+line(473,189,410,202,C.gold);
 // Plan view: rooms connected to core, all parts stay in place while connectors light up.
 s+=fade(`<g transform="translate(360 946)">`+poly('-49,-93 49,-93 49,85 -49,85','#796647',C.gold,3)+text('코어',0,5,23,C.gold)+[-1,1].map(side=>[0,1,2].map(j=>{
  const x=side===-1?-211:78,y=-127+j*88,op=.4+.6*Math.sin(t*1.8-j*.8)**2;
  return `<rect x="${x}" y="${y}" width="132" height="70" rx="3" fill="${C.steel}" stroke="${C.green}" stroke-width="2"/>`+line(side===-1?-79:78,y+35,side===-1?-49:49,y+35,C.gold,4)+`<circle cx="${side===-1?-49:49}" cy="${y+35}" r="6" fill="${C.gold}" opacity="${op}"/>`;
 }).join('')).join('')+'</g>',t,.6);
 s+=fade(text('모듈과 코어를 함께 설계',360,1140,25),t,2);
 return s;
}
export function modularSvg(scene,t,index,scenes,total){
 const progress=(scenes.slice(0,index).reduce((a,s)=>a+s.duration,0)+t)/total;
 let bg=`<rect width="720" height="1280" fill="${C.bg}"/><rect width="720" height="1280" fill="url(#vignette)"/>`;
 for(let i=0;i<12;i++)bg+=line(36+i*59,170,36+i*59,1174,'#617863',.3);
 for(let j=0;j<18;j++)bg+=line(36,170+j*59,684,170+j*59,'#617863',.3);
 const body=scene.visual==='load'?loadScene(t):scene.visual==='floor'?floorScene(t):scene.visual==='core'?coreScene(t):'';
 return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280"><defs><radialGradient id="vignette"><stop stop-color="#3c513c" stop-opacity=".35"/><stop offset="1" stop-color="#050b07" stop-opacity=".2"/></radialGradient></defs>${bg}${text('보이지 않는 건축의 원리',40,62,18,C.green,'start')}${text(String(index+1).padStart(2,'0')+' / 08',675,62,18,C.green,'end')}${line(40,79,201,79,C.gold,3)}${text(scene.title,360,132,31)}${body}<rect x="35" y="588" width="650" height="146" rx="18" fill="${C.bg}" opacity=".35"/>${text('구조 원리 개념도 · 실제 설계도·층수 비율 아님',360,1204,16,'#a0aea0')}${text('MODULAR / BUILT TO CONNECT',40,1248,14,C.green,'start')}<rect x="40" y="1266" height="3" width="${640*clamp(progress)}" fill="${C.gold}"/></svg>`;
}
