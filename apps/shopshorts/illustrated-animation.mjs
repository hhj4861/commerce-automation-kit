// General scene choreography using original artwork; accepts only validated plan data.
import {P,clamp,ease,tx,path,circle,ellipse,group,enter,paper,envelope,box,person,robot,app,server,laptop,house,truck,speech,folder,shield,calendar,rail,travel} from './illustration-art.mjs';

function actor(e,t,icons) {
  const options={mood:e.expression||'neutral',wave:e.motion==='wave',phone:e.motion==='work'};
  const drawings={person:()=>person(0,0,1,t,options),robot:()=>robot(0,0,1,t,{point:e.motion==='wave'||e.motion==='work',uncertain:e.expression==='worried'}),
    app:()=>app(0,0,1,t),server:()=>server(0,0,1,t),laptop:()=>laptop(0,0,1,t),home:()=>house(0,0),
    parcel:()=>box(0,0,1.5,t),document:()=>paper(0,0,1.6,t,e.motion==='work'),envelope:()=>envelope(0,0,1.7),
    truck:()=>truck(0,0,1,t),folder:()=>folder(0,0,1.4),shield:()=>shield(0,0,1.5),calendar:()=>calendar(0,0,1.5)};
  let body=drawings[e.icon]?.()||`<g fill="${P.light}" stroke="${P.ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" transform="scale(1.6)">${icons[e.icon]}</g>`;
  if(e.motion==='talk')body+=speech(76,-145,.45+Math.sin(t*3)*.015);
  return body;
}

export const illustrationSymbol=(e,t)=>group(0,0,.55,actor(e,t,{}));
function textLines(text,x,y,size,limit){
  const chars=Array.from(text),lines=[];
  for(let i=0;i<chars.length;i+=limit)lines.push(tx(chars.slice(i,i+limit).join(''),x,y+(i/limit)*size*1.35,size));
  return lines.join('');
}

export function illustratedSvg(plan,duration,aspect,time,icons) {
  const portrait=aspect==='9:16',w=portrait?720:1280,h=portrait?1280:720,n=plan.elements.length;
  const staging=plan.staging||(plan.layout==='contrast'?'comparison':'reaction');
  // Artwork lives above and below the central subtitle band, in both aspect ratios.
  const points=plan.elements.map((_,i)=>portrait?
    {x:n===2?360:n===3&&i===2?360:190+(i%2)*340,y:n===2?370+i*530:365+Math.floor(i/2)*535}:
    {x:n===2?345+i*590:230+i*820/(n-1),y:205});
  let body='';
  if(staging==='comparison')body+=path(portrait?'M110 740H610':'M640 110V315','none',P.gray,2);
  // Route around the central subtitles, not through them. A transfer is opt-in.
  if(staging==='exchange'&&plan.prop&&plan.prop!=='none'){
    for(let i=1;i<n;i++){
      const a=points[i-1],b=points[i],rowChange=a.y!==b.y;
      const route=rowChange?[[a.x+80,a.y+35],[667,a.y+35],[667,b.y-45],[b.x+90,b.y-45]]:
        [[a.x+85,a.y+25],[b.x-85,b.y+25]];
      const local=Math.max(0,time-i*.45);
      body+=rail(route,P.gray)+`<g opacity="${ease(local)}">${travel(route,local,0,.36,plan.prop==='parcel'?'box':plan.prop==='document'?'document':'mail',3.2)}</g>`;
    }
  }
  plan.elements.forEach((e,i)=>{
    const p=points[i],local=Math.max(0,time-i*.35),progress=clamp(local/Math.max(1,duration*.65));
    const walking=e.motion==='walk'||staging==='journey';
    const dx=walking?-65+110*ease(progress):0;
    const dy=e.motion==='float'?Math.sin(local*2)*8:walking?-Math.abs(Math.sin(local*5))*5:0;
    const angle=e.motion==='shake'?Math.sin(local*6)*4:0;
    const scale=(portrait?(n===2?1.25:1.08):(n===2?.75:.7))*(e.motion==='pulse'?1+Math.sin(local*2)*.025:1);
    let character=actor(e,local,icons);
    // Reaction is an observable response to the earlier subject, without inventing a happy ending.
    if(staging==='reaction'&&i>0)character=group(0,0,1,character,Math.sin(local*1.5)*1.8);
    body+=ellipse(p.x,p.y+scale*120,scale*94,12,P.mint);
    body+=enter(group(p.x+dx,p.y+dy,scale,character,angle),time,i*.35);
    body+=textLines(e.label,p.x,portrait?p.y+scale*154:520,portrait?23:26,portrait?10:9);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${P.paper}"/>${path(`M48 ${h-70}H${w-48}`,'none',P.mint,2)}${textLines(plan.title,w/2,portrait?110:42,30,portrait?16:32)}${body}<rect x="48" y="${h-28}" width="${(w-96)*clamp(time/duration)}" height="3" rx="2" fill="${P.green}"/></svg>`;
}
