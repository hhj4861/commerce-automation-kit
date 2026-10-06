import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {webtoonPlan,webtoonScenes} from './lib/webtoon-plan.js';
import {validateDepthReview,depthFailure} from './lib/explanation-depth.js';
import {renderSvgScene} from './studio-animation.mjs';
import {generateHiggsfieldScene,higgsfieldPlan,higgsfieldParameters} from './studio-higgsfield.mjs';
import {higgsfieldCommand} from './studio-higgsfield-auth.mjs';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const clamp=n=>Math.max(0,Math.min(1,n));
const lerp=(a,b,t)=>a+(b-a)*t;
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const paidId=(job,s,kind)=>s.id.slice(0,25)+'-'+kind+'-'+hash([s,job.visualStyle,job.brief,job.mediaVersions?.[s.id]]).slice(0,16);
const artScene=s=>({...s,id:s.id+'-art',kind:'image',prompt:`Original Korean webtoon art, delicate ink lines, painterly depth, warm amber key light against cool navy/teal surroundings. No text, numbers, logos or subtitles. ${s.webtoon.artPrompt}`});
const paidArt=(job,s)=>({...artScene(s),id:paidId(job,s,'art')});
const paidOpening=(job,s)=>({...s,id:paidId(job,s,'opening'),duration:6});
function signature(job,s){return hash([artScene(s),job.visualStyle,job.brief,job.mediaVersions?.[s.id]]);}
export function webtoonSvg(scene,aspect,time,art){
 const plan=webtoonPlan(scene.webtoon),portrait=aspect==='9:16',w=portrait?720:1280,h=portrait?1280:720;
 const px=portrait?w*.07:w*.51,py=portrait?h*.5:h*.18,pw=portrait?w*.86:w*.43,ph=portrait?h*.20:h*.5,t=clamp(time/scene.duration);
 let body='';
 for(const l of plan.layers){
  let p=clamp((t-l.start)/(l.end-l.start));p=p*p*(3-2*p);
  const pos=l.motion==='move'?l.from.map((x,i)=>lerp(x,l.to[i],p)):l.from;
  const x=px+pos[0]/100*pw,y=py+pos[1]/100*ph,sw=l.size[0]/100*pw,sh=l.size[1]/100*ph;
  const points=l.points?.map(([a,b])=>[a/100*sw-sw/2,b/100*sh-sh/2]);
  let shape=l.shape==='ellipse'?`<ellipse rx="${sw/2}" ry="${sh/2}"/>`:l.shape==='rect'?`<rect x="${-sw/2}" y="${-sh/2}" width="${sw}" height="${sh}" rx="9"/>`:`<${l.shape==='path'?'polyline':'polygon'} points="${points.map(p=>p.join(',')).join(' ')}" ${l.shape==='path'?'fill="none"':''}/>`;
  if(l.motion==='flow'){
   const route=points||[[-sw/2,0],[sw/2,0]];
   for(let i=0;i<5;i++){
    const q=clamp(t>=l.end?1:((Math.max(0,t-l.start)*1.7+i/5)%1))*(route.length-1),j=Math.min(route.length-2,Math.floor(q)),u=q-j;
    shape+=`<circle cx="${lerp(route[j][0],route[j+1][0],u)}" cy="${lerp(route[j][1],route[j+1][1],u)}" r="5" fill="#fff2c7"/>`;
   }
  }
  const opacity=l.motion==='reveal'?p:t<l.start?0:1,scale=l.motion==='scale'?.5+.5*p:1;
  body+=`<g opacity="${opacity}" transform="translate(${x} ${y}) scale(${scale})" fill="${l.color}" stroke="#e4d5af" stroke-width="2.4" stroke-linejoin="round">${shape}</g><text x="${x}" y="${l.shape==='path'?y-sh/2-12:y+sh/2+23}" opacity="${opacity}" text-anchor="middle" fill="#fff3db" stroke="#152b35" stroke-width="3" paint-order="stroke" font-family="NanumGothic" font-size="19">${esc(l.label)}</text>`;
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#091d29"/><image href="${art}" width="${portrait?w:w*.46}" height="${portrait?h*.44:h*.78}" preserveAspectRatio="xMidYMid slice"/><rect x="${px-15}" y="${py-18}" width="${pw+30}" height="${ph+65}" rx="20" fill="#122d37" opacity=".92" stroke="#d5af78"/>${body}<text x="${px+pw/2}" y="${py-33}" text-anchor="middle" font-family="NanumGothic" font-size="17" fill="#fff3db">원리 설명용 재구성 · 실제 비율과 다를 수 있음</text></svg>`;
}
export async function checkWebtoonReview(job){
 webtoonScenes(job.scenes);
 const review=await validateDepthReview(job.depthReview,job.brief,job);
 if(!review.passed)throw depthFailure();
}
// All planned cost is checked before either narration or the first paid request.
export async function prepareWebtoon(job,env,work,io,checkpoint,{run=args=>higgsfieldCommand(args,env),fetcher=fetch,generate=generateHiggsfieldScene,render=renderSvgScene}={}){
 await checkWebtoonReview(job);
 const cap=job.brief.maxCredits;
 if(!Number.isInteger(cap)||cap<1||cap>1000)throw Error('웹툰 제작의 총 크레딧 상한을 먼저 설정해 주세요.');
 const wanted=job.scenes.filter(s=>!job.assets[s.id]&&(!job.task.sceneIds||job.task.sceneIds.includes(s.id)));
 const plans=[];
 for(const s of wanted){
  if(job.assets[s.id+'-art']?.signature!==signature(job,s))plans.push({scene:paidArt(job,s),job});
  if(s===job.scenes[0])plans.push({scene:paidOpening(job,s),job});
 }
 let additional=0;const estimates=new Map();
 for(const item of plans){
  const old=job.mediaJobs?.[item.scene.id];
  if(old?.state==='failed'||old?.state==='submitting'&&!old.id)throw Error('이전 유료 생성 내역을 확인해야 합니다. 자동으로 중복 요청하지 않습니다.');
  const plan=higgsfieldPlan(item.scene,job.brief.aspect,item.job),cost=await run(['generate','cost',plan.model,...higgsfieldParameters(plan)]);
  if(!Number.isFinite(cost.credits)||cost.credits<0)throw Error('웹툰 원화·도입부 견적을 확인하지 못했습니다.');
  estimates.set(item.scene.id,cost.credits);
  if(!old?.id)additional+=cost.credits;
 }
 const spent=Object.values(job.mediaJobs||{}).reduce((n,r)=>n+(Number.isFinite(r.credits)?r.credits:0),0);
 if(spent+additional>cap)throw Error(`웹툰 제작은 원화 포함 약 ${spent+additional}크레딧으로, 설정한 ${cap}크레딧을 초과합니다. 새 기획에서 예산 또는 장면 수를 조정해 주세요. 아직 새 생성은 시작하지 않았습니다.`);
 if(additional){const status=await run(['account','status']);if(!Number.isFinite(status.credits)||status.credits<additional)throw Error('Higgsfield 크레딧 잔액이 부족하거나 확인되지 않았습니다.');}
 let assets={...job.assets};
 const persist=async delta=>{if(delta.mediaJobs)job.mediaJobs=delta.mediaJobs;await checkpoint(delta);};
 // Recheck each individual estimate and never automatically retry a failed paid job.
 async function make(scene,reference,j=job){
  const result=await generate(j,scene,env,work,persist,{run,fetcher,reference,maxCredits:estimates.get(scene.id),noRetry:true});
  job.mediaJobs=j.mediaJobs||job.mediaJobs;
  return result;
 }
 return {
  async scene(s,duration){
   const id=s.id+'-art',sig=signature(job,s);let original=assets[id],data;
   if(original?.signature===sig)data=await io.readAsset(original.key);
   else {
    const result=await make(paidArt(job,s),undefined,job);data=result.data;
    const key=`studio/${job.id}/${sig}-art`;
    await io.writeAsset(key,data,result.type);
    original={key,type:result.type,kind:'image',source:'ai',purpose:'webtoon-art',signature:sig,name:id,provider:'higgsfield',providerJobId:result.providerJobId};
    assets[id]=original;await checkpoint({assets});
   }
   if(s===job.scenes[0]){
    const extension={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[original.type];
    if(!extension)throw Error('웹툰 원화 형식을 확인해 주세요.');
    const path=join(work,s.id+'-webtoon-reference.'+extension);await writeFile(path,data);
    return make(paidOpening(job,s),path);
   }
   const uri=`data:${original.type};base64,${Buffer.from(data).toString('base64')}`;
   const result=await render(job,{...s,duration},work,env,{svg:(scene,aspect,time)=>webtoonSvg(scene,aspect,time,uri)});
   return {...result,provider:'webtoon-hybrid'};
  },
  merge(next){const art=Object.fromEntries(Object.entries(assets).filter(([,a])=>a.purpose==='webtoon-art'));assets={...assets,...next,...art};return assets;}
 };
}
