import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {Resvg} from '@resvg/resvg-js';
import {animationPlan} from './lib/animation-plan.js';

const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const font=fileURLToPath(new URL('./public/NanumGothic-Regular.ttf',import.meta.url));
const ink='#3b3932', colors=['#e57962','#7fb8a6','#e8bd58','#93a8cf'];
const icons={
 person:'<circle cy="-24" r="23"/><path d="M-32 55V29Q-32 5 0 5Q32 5 32 29V55M-12 55V78M12 55V78"/>',
 brain:'<path d="M0-42C-25-61-55-33-43-15C-67 8-44 45-15 35C-10 52 10 52 15 35C44 45 67 8 43-15C55-33 25-61 0-42ZM0-38V35M-35-12Q-10-20-15 7M35-12Q10-20 15 7"/>',
 heart:'<path d="M0 48L-43 3C-75-42-18-65 0-28C18-65 75-42 43 3Z"/>',
 clock:'<circle r="51"/><path d="M0-34V0L26 17M0-45V-40M45 0H40M0 45V40M-45 0H-40"/>',
 phone:'<rect x="-32" y="-56" width="64" height="112" rx="12"/><path d="M-12-42H12M-8 43H8"/><rect x="-22" y="-28" width="44" height="55" rx="3" fill="#f6f0dd"/>',
 book:'<path d="M0 45Q-28 30-52 40V-42Q-25-52 0-36Q25-52 52-42V40Q28 30 0 45ZM0-36V45M-40-22L-14-17M14-17L40-22M-40-5L-14 0M14 0L40-5"/>',
 cloud:'<path d="M-40 30C-70 30-72-8-47-14C-50-52 0-64 20-34C58-48 77 4 45 27Z"/>',
 home:'<path d="M-55-4L0-51L55-4M-43-12V49H43V-12M-12 49V14H13V49"/><rect x="-30" y="0" width="12" height="14" fill="#f6f0dd"/>',
 tree:'<path d="M-8 60V-9H8V60M0 20L-25 0M0 7L25-15"/><path d="M0-63C-40-68-63-36-38-15C-65 22-8 32 0 12C8 32 65 22 38-15C63-36 40-68 0-63Z"/>',
 star:'<path d="M0-60L18-18L61-16L28 13L38 57L0 34L-38 57L-28 13L-61-16L-18-18Z"/>',
};
const clamp=v=>Math.max(0,Math.min(1,v));
const ease=v=>1-(1-clamp(v))**3;
function lines(text,limit){const a=Array.from(text),out=[];for(let i=0;i<a.length;i+=limit)out.push(a.slice(i,i+limit).join(''));return out;}
function label(text,x,y,size,limit){return `<text x="${x}" y="${y}" text-anchor="middle" fill="${ink}" font-family="NanumGothic" font-size="${size}" font-weight="400">${lines(text,limit).map((line,i)=>`<tspan x="${x}" dy="${i?size*1.4:0}">${escape(line)}</tspan>`).join('')}</text>`;}

// Frame-based transforms make exports deterministic and independent of wall time.
export function animationSvg(scene,aspect,time) {
  const plan=animationPlan(scene.animation),portrait=aspect==='9:16',w=portrait?720:1280,h=portrait?1280:720;
  const duration=scene.duration,n=plan.elements.length;
  const points=plan.elements.map((_,i)=>portrait?{x:n===2||(n===3&&i===2)?w/2:180+(i%2)*360,y:n===2?410+i*370:420+Math.floor(i/2)*355}:{x:140+i*(1000/(n-1)),y:365});
  let body='';
  const links=plan.layout==='contrast'?[]:points.slice(1).map((p,i)=>[points[i],p,i+1]);
  if(plan.layout==='cycle')links.push([points[n-1],points[0],n]);
  for(const [a,b,i] of links){const opacity=clamp((time-i*duration*.12)*2);body+=`<path d="M${a.x} ${a.y+110} Q${(a.x+b.x)/2} ${Math.max(a.y,b.y)+155} ${b.x} ${b.y+110}" fill="none" stroke="${ink}" stroke-width="2" stroke-dasharray="6 7" opacity="${opacity*.35}"/>`;}
  plan.elements.forEach((e,i)=>{
    const t=time-i*duration*.12,show=ease(t/.65),p=points[i],phase=Math.max(0,t)*2.5;
    const dy=(1-show)*30+(e.motion==='float'?Math.sin(phase)*9:0),rotation=e.motion==='shake'?Math.sin(phase*2)*4:0,scale=show*(e.motion==='pulse'?1+Math.sin(phase)*.035:1);
    body+=`<g opacity="${show}" transform="translate(${p.x} ${p.y+dy})"><circle r="${portrait?107:95}" fill="${colors[i]}" opacity=".15"/><g transform="rotate(${rotation}) scale(${scale})" fill="${colors[i]}" stroke="${ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${icons[e.icon]}</g>${label(e.label,0,portrait?150:138,portrait?27:25,portrait?10:9)}<circle cx="-70" cy="-82" r="16" fill="${ink}"/><text x="-70" y="-76" text-anchor="middle" fill="#fffaf0" font-size="16" font-family="NanumGothic">${i+1}</text></g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#f5efdc"/><path d="M0 ${h*.83}Q${w*.3} ${h*.80} ${w*.6} ${h*.84}T${w} ${h*.82}V${h}H0Z" fill="#e8dfc6" opacity=".65"/><rect x="${w*.08}" y="${portrait?86:58}" width="44" height="5" rx="2" fill="#d97159"/>${label(plan.title,w/2,portrait?166:135,portrait?36:40,portrait?16:32)}${body}<rect x="${w*.08}" y="${h-40}" width="${w*.84*clamp(time/duration)}" height="3" rx="1" fill="#d97159" opacity=".5"/></svg>`;
}

export async function renderAnimationScene(job,scene,work,env={}, {width}={}) {
  animationPlan(scene.animation);
  if(!Number.isFinite(scene.duration)||scene.duration<1||scene.duration>30)throw Error('애니메이션 장면 길이를 확인해 주세요.');
  const target=join(work,`${scene.id}-animation.mp4`),fps=30,outputWidth=width||(job.brief.aspect==='9:16'?1080:1920);
  const child=spawn('ffmpeg',['-y','-v','error','-f','image2pipe','-framerate',String(fps),'-vcodec','png','-i','pipe:0','-an','-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',target],{env:{...process.env,...env},stdio:['pipe','ignore','pipe']});
  let stderr='',failure;
  child.stderr.on('data',d=>{stderr=(stderr+d).slice(-1200);});
  child.stdin.on('error',e=>{failure=e;});
  const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error(`애니메이션 렌더 실패: ${stderr}`)));});
  done.catch(e=>{failure=e;});
  const timer=setTimeout(()=>{failure=Error('애니메이션 렌더 시간이 초과되었습니다.');child.kill('SIGKILL');},600000);
  try {
    for(let frame=0;frame<Math.round(scene.duration*fps);frame++){
      if(failure)throw failure;
      const png=new Resvg(animationSvg(scene,job.brief.aspect,frame/fps),{fitTo:{mode:'width',value:outputWidth},font:{fontFiles:[font],loadSystemFonts:false,defaultFontFamily:'NanumGothic'}}).render().asPng();
      if(!child.stdin.write(png))await Promise.race([once(child.stdin,'drain'),done.then(()=>{throw Error('애니메이션 출력이 일찍 종료되었습니다.');})]);
      if(frame%30===0)await new Promise(r=>setImmediate(r));
    }
    child.stdin.end();await done;
    return {data:await readFile(target),type:'video/mp4',provider:'animation-svg'};
  } catch(e){child.kill('SIGKILL');await done.catch(()=>{});throw e;}
  finally{clearTimeout(timer);await rm(target,{force:true});}
}
