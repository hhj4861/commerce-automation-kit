// Original episode animation; local SVG/ffmpeg rendering with official ElevenLabs narration.
import {readFile,writeFile,mkdir,access,rename} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const out=dirname(fileURLToPath(import.meta.url));
const brief=JSON.parse(await readFile(join(out,'brief.json'),'utf8'));
const engine=process.env.CAK_ENGINE_ROOT||'/private/tmp/cak-studio-animation-mode';
const cache=process.env.SENIOR_VIDEO_CACHE||'/private/tmp/cak-senior-family-conversation-20260929';
const require=createRequire(join(engine,'apps/shopshorts/package.json'));
const {Resvg}=require('@resvg/resvg-js');
const fontDir=join(engine,'apps/shopshorts/public');
const fontFiles=['NanumGothic-Regular.ttf','Jua-Regular.ttf','DoHyeon-Regular.ttf'].map(f=>join(fontDir,f));
const save=async(p,v)=>{await mkdir(dirname(p),{recursive:true});await writeFile(p,v);};
const exists=p=>access(p).then(()=>true,()=>false);
function run(bin,args){return new Promise((ok,fail)=>{const p=spawn(bin,args,{stdio:['ignore','pipe','pipe']});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err=(err+d).slice(-4000));p.once('error',fail);p.once('close',c=>c?fail(Error(bin+': '+err)):ok(out));});}
const duration=async p=>Number(await run('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',p]));
await mkdir(cache,{recursive:true});
const scenes=[];let total=0;
for(const [i,s] of brief.scenes.entries()){
 const raw=join(cache,'remote-narration',`beat-${String(i).padStart(2,'0')}.mp3`),meta=JSON.parse(await readFile(raw+'.json','utf8'));
 if(meta.text!==s.narration||meta.voiceId!==brief.voice)throw Error('Narration mismatch '+s.id);
 const voice=join(cache,`${s.id}-${brief.narrationSpeed}.wav`);
 await run('ffmpeg',['-y','-v','error','-i',raw,'-af',`atempo=${brief.narrationSpeed}`,'-c:a','pcm_s16le','-ar','44100','-ac','2',voice]);
 const speech=await duration(voice),rawDuration=await duration(raw),sourceFrames=Math.ceil((speech+.5)*12),seconds=sourceFrames/12;
 scenes.push({...s,voice,rawDuration,speechSeconds:speech,sourceFrames,frames:sourceFrames*2,duration:seconds,start:total});total+=seconds;
}
if(total<600||total>900)throw Error('Measured longform duration outside 10–15 minutes: '+total);
console.log(JSON.stringify({scenes:scenes.length,totalSeconds:total,speechSeconds:scenes.reduce((a,s)=>a+s.speechSeconds,0)}));
function captionCards(narration){
 const cards=[];
 for(const sentence of narration.match(/[^.!?]+[.!?]?/gu)||[]){
  const words=sentence.trim().split(/\s+/u),n=words.length;
  let solution;
  for(let count=Math.ceil(sentence.trim().length/44);count<=n&&!solution;count++){
   const memo=new Map(),target=sentence.trim().length/count;
   function partition(from,left){
    if(!left)return from===n?{cost:0,parts:[]}:null;
    const key=from+':'+left;if(memo.has(key))return memo.get(key);
    let best=null;
    for(let end=from+1;end<=n-left+1;end++){
     const part=words.slice(from,end).join(' ');if(part.length>44)break;
     const rest=partition(end,left-1);if(!rest)continue;
     const cost=(part.length-target)**2+rest.cost;
     if(!best||cost<best.cost)best={cost,parts:[part,...rest.parts]};
    }
    memo.set(key,best);return best;
   }
   solution=partition(0,count);
  }
  if(!solution)throw Error('Unable to balance captions');
  for(const part of solution.parts){
   if(part.length<=22){cards.push(part);continue;}
   const w=part.split(' ');let best;
   for(let k=1;k<w.length;k++){
    const a=w.slice(0,k).join(' '),b=w.slice(k).join(' ');
    if(a.length>24||b.length>24)continue;
    const cost=Math.abs(a.length-b.length);if(!best||cost<best.cost)best={cost,text:a+'\n'+b};
   }
   if(!best)throw Error('Caption line is too wide');cards.push(best.text);
  }
 }
 return cards;
}

for(const scene of scenes){
 const cards=captionCards(scene.narration),weights=cards.map(t=>Array.from(t.replace(/\s/gu,'')).length),sum=weights.reduce((a,b)=>a+b,0);let used=0;
 scene.captions=cards.map((text,i)=>{const start=used/sum*scene.speechSeconds;used+=weights[i];return {text,start,end:used/sum*scene.speechSeconds};});
}
if(process.argv[2]==='measure'){console.log(JSON.stringify(scenes.map(s=>({id:s.id,duration:s.duration,speech:s.speechSeconds}))));process.exit(0);}
const C={paper:'#f3edd8',ink:'#38382f',mint:'#92c5ad',red:'#ce7660',gold:'#d6ae58',cream:'#fcf8ea',muted:'#716e60'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const text=(s,x,y,size=29,color=C.ink,anchor='middle',font='NanumGothic')=>`<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" fill="${color}" text-anchor="${anchor}">${esc(s)}</text>`;
const path=(d,fill='none',stroke=C.ink,width=3)=>`<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const line=(x,y,x2,y2,color=C.ink,w=3)=>path(`M${x} ${y}Q${(x+x2)/2+2} ${(y+y2)/2-1} ${x2} ${y2}`,'none',color,w);
const ease=v=>1-(1-Math.max(0,Math.min(1,v)))**3;
const show=(content,t,delay=0)=>`<g opacity="${ease((t-delay)/.6)}" transform="translate(0 ${(1-ease((t-delay)/.6))*20})">${content}</g>`;
const rect=(x,y,w,h,fill=C.cream)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="17" fill="${fill}" stroke="${C.ink}" stroke-width="2"/>`;
const arrow=(x,y,x2,y2,color=C.ink)=>line(x,y,x2,y2,color)+path(`M${x2-12} ${y2-9}L${x2} ${y2}L${x2-12} ${y2+9}`,'none',color);
function heart(x,y,t,scale=1){return `<g transform="translate(${x} ${y}) scale(${scale*(1+.045*Math.sin(t*3))})">${path('M0 36C-92-17-32-79 0-33C36-80 91-13 0 36Z',C.red)}</g>`;}
function actor(x,y,t,{older=false,speaking=false,worried=false,gesture=0,scale=1}={}){
 const dy=Math.sin(t*1.7)*2,blink=Math.sin(t*1.3)>.992,hand=gesture?15*Math.sin(t*2.1):5*Math.sin(t*1.5),mouth=speaking?3+Math.abs(Math.sin(t*12))*6:2;
 return `<g transform="translate(${x} ${y+dy}) scale(${scale})">${path('M-45-5Q-66 55-42 108H43Q65 41 44-5',older?C.mint:'#dabd84')}${line(-30,110,-34,155)}${line(30,110,34,155)}${line(-34,155,-56,155)}${line(34,155,56,155)}${path(`M-48 20Q-86 58-106 ${25+hand}M48 20Q87 43 111 ${18-hand}`)}<ellipse cx="0" cy="-49" rx="55" ry="59" fill="${C.paper}" stroke="${C.ink}" stroke-width="3"/>${older?path('M-54-53Q-67-111-14-109Q42-124 55-63Q32-97 6-93Q-25-78-54-53Z','#d0ccc0'):path('M-53-62Q-53-127 16-110Q59-109 54-48L33-88L8-76L-12-92Z','#756759')}${blink?line(-24,-47,-12,-47)+line(12,-47,24,-47):'<ellipse cx="-18" cy="-47" rx="3" ry="4" fill="#38382f"/><ellipse cx="18" cy="-47" rx="3" ry="4" fill="#38382f"/>'}${older?'<g fill="none" stroke="#716e60" stroke-width="2"><ellipse cx="-19" cy="-45" rx="17" ry="13"/><ellipse cx="19" cy="-45" rx="17" ry="13"/><path d="M-2-45H2"/></g>':''}${speaking?`<ellipse cx="0" cy="-15" rx="9" ry="${mouth}" fill="#9d6c62"/>`:path(worried?'M-11-12Q0-23 11-12':'M-12-21Q0-6 12-21')}<ellipse cx="-31" cy="-24" rx="10" ry="5" fill="${C.red}" opacity=".28"/><ellipse cx="31" cy="-24" rx="10" ry="5" fill="${C.red}" opacity=".28"/></g>`;
}
function phone(x,y,t,mode='message',scale=1){
 const ring=mode==='ring'?Math.sin(t*19)*3:0,phase=t%5,typed=Math.floor(Math.max(0,Math.min(1,phase/2.5))*10);
 return `<g transform="translate(${x} ${y}) rotate(${ring}) scale(${scale})">${rect(-58,-94,116,188)}${line(-17,-78,17,-78)}${rect(-47,-65,94,124,'#e2e4d0')}${mode==='ring'?heart(0,-10,t,.43):Array.from({length:3},(_,i)=>line(-32,-38+i*25,-32+Math.min(66,Math.max(0,typed-i*3)*11),-38+i*25,C.muted,4)).join('')}${mode==='waiting'?Array.from({length:3},(_,i)=>`<circle cx="${-17+i*17}" cy="29" r="${3+Math.max(0,Math.sin(t*4-i))*2}" fill="${C.red}"/>`).join(''):''}<circle cx="0" cy="77" r="5" fill="none" stroke="${C.ink}"/></g>`;
}
function calendar(x,y,t,scale=1){return `<g transform="translate(${x} ${y}) scale(${scale})">${rect(-102,-87,204,174)}${line(-102,-44,102,-44)}${text('우리의 약속',0,-57,22)}${[0,1,2,3,4].map(i=>line(-70+i*35,-22,-70+i*35,68,'#b7ad8f',1)).join('')}${[0,1,2].map(i=>line(-82,-9+i*32,82,-9+i*32,'#b7ad8f',1)).join('')}${show(path('M-18 18L-4 34L35-11','none',C.red,6),t,1.5)}</g>`;}
function note(s,x,y,w=250,color=C.cream){return rect(x-w/2,y-33,w,63,color)+text(s,x,y+9,27);}
const phases=[['서운한 순간','말 뒤에 있던 마음'],['내 마음을 정리하기','상대의 사정도 듣기'],['작게 부탁하기','다시 연결되기']];
function svg(scene,t,index){
 const v=scene.visual,p=t/scene.duration,turn=Math.floor(t/3.8)%2,conversation=['listen','balance','mutual','dialogue','repair','two_views','alternative'].includes(v);
 let art='',footer='',parentX=210,childX=1070;
 if(['opening','waiting','waiting_reply','message'].includes(v)){
  art=phone(640,191,t,v==='opening'?'ring':v==='waiting_reply'?'waiting':'message',.88);
  art+=show(note(v==='waiting'?'오늘은 못 갈 것 같아':v==='message'?'한 가지 일 · 한 가지 부탁':'연락을 기다리는 마음',640,529,445),t,.7);
  footer=v==='waiting'?'가상의 가족 사례':v==='message'?'보내기 전, 내 목소리로 읽어 보기':'확인한 일과 떠오른 생각은 다를 수 있어요';
  if(v==='waiting')art+=show(path('M473 611H809M505 610V650M778 610V650')+'<ellipse cx="584" cy="602" rx="34" ry="9" fill="#fcf8ea" stroke="#38382f"/><ellipse cx="701" cy="602" rx="34" ry="9" fill="#fcf8ea" stroke="#38382f"/>',t,.2);
 }else if(['roadmap','four_steps','practice','closing'].includes(v)){
  const labels=['일어난 일','내 마음','소중한 이유','작은 부탁'],active=Math.min(3,Math.floor(p*4));
  art=labels.map((a,i)=>show(note(a,250+i*260,199,225,i===active?'#e0bfb0':C.cream),t,i*.6)).join('');
  art+=show(heart(641,528,t,.65),t,1)+text(v==='practice'?'내 상황에 맞는 네 줄을 적어 보세요':'말하기와 듣기가 함께 있는 대화',640,629,31);
  footer=v==='practice'?'생각할 시간이 필요하면 잠시 멈춰도 좋습니다':'외워야 하는 공식보다, 마음을 정리하는 순서';
 }else if(['fact','observation','feeling','reason','request','honesty'].includes(v)){
  const pair=v==='fact'?['방문이 취소되었다','나는 중요하지 않다']:v==='observation'?['너는 항상…','지난 토요일에…']:v==='feeling'?['너는 이기적이야','나는 서운했어']:v==='reason'?['무슨 마음이었을까','같이 먹고 싶었어']:v==='request'?['나에게 잘해','일정이 바뀌면 알려줘']:['괜찮아, 오지 마','지금은 조금 서운해'];
  art=show(note(pair[0],363,200,412),t,.1)+show(note(pair[1],917,200,412,'#e0e6ce'),t,2)+arrow(590,201,682,201,C.red);
  art+=show(heart(640,533,t,.62),t,1.4)+text(v==='fact'?'확인한 일과 해석을 나누어 보기':'평가보다 경험을, 추측보다 바람을',640,620,31);
  footer='예시 표현입니다. 각자의 말투와 상황에 맞춰 바꾸세요';
 }else if(['calendar','clock','agreement','alternative','boundary'].includes(v)){
  art=calendar(640,194,t,.85)+show(note(v==='boundary'?'내가 가능한 범위도 알리기':v==='alternative'?'그때가 어렵다면, 다른 시간은?':'둘 다 가능한 시간을 함께 정하기',640,537,575),t,1);
  footer='가족마다 가능한 횟수와 방식은 다릅니다';
 }else if(v==='pause'){
  const r=48+15*(1+Math.sin(t*.8));art=`<circle cx="640" cy="191" r="${r}" fill="none" stroke="${C.mint}" stroke-width="5"/>`+text('잠깐',640,202,29);
  art+=show(note('조금 진정하고 저녁에 다시 이야기하자',640,540,650),t,.6);footer='벌주는 침묵보다, 돌아올 시간을 알리는 멈춤';
 }else if(['listen','balance','two_views','mutual','dialogue','repair'].includes(v)){
  parentX=235+ease(Math.min(t/5,1))*45;childX=1045-ease(Math.min(t/5,1))*45;
  art=show(note(turn?'네 사정도 듣고 싶어':'나는 이렇게 느꼈어',640,201,490,turn?'#e0e6ce':C.cream),t,.1);
  art+=arrow(439,534,833,534,C.red)+path('M833 566Q640 612 439 566','none',C.mint,4)+text(v==='repair'?'다시 말해도 될까?':v==='balance'?'이해한다고 모두 동의하는 것은 아닙니다':'내 마음도, 상대의 사정도',640,633,30);
  footer='실제 대화는 천천히, 여러 번 이어갈 수 있습니다';
 }else if(v==='heart'){
  parentX=130;childX=1150;
  art=heart(640,195,t,.97)+['안부가 궁금해','함께하고 싶어','의견을 들어줘'].map((x,i)=>show(note(x,349+i*292,541,255),t,i*1.1)).join('');footer='내게 가장 중요했던 바람 하나를 찾아봅니다';
 }else if(v==='gift'){
  const x=560+ease((t%7)/3)*165;art=`<g transform="translate(${x} 199)">${rect(-64,-52,128,104,'#dfc383')}${line(0,-52,0,52,C.red,7)}${line(-64,-6,64,-6,C.red,7)}${path('M0-52C-85-114-65-34 0-52C75-121 80-32 0-52','none',C.red,4)}</g>`;
  art+=note('주고 싶은 방식 ↔ 받고 싶은 방식',640,550,600);footer='정성이 고마운 것과, 지금 필요한 것은 다를 수 있어요';
 }else if(v==='connections'){
  parentX=130;childX=1150;
  art=actor(516,209,t,{scale:.56,older:true,speaking:true})+actor(640,209,t,{scale:.56,older:true})+actor(764,209,t,{scale:.56,older:false,gesture:1});art+=['친구','취미','나의 하루'].map((x,i)=>show(note(x,361+i*280,544,225),t,i*.6)).join('');footer='자녀와의 연결을 소중히 하며, 내 삶에도 여러 자리를';
 }else if(v==='safety'){
  art=path('M640 118L713 142V200Q702 255 640 280Q578 252 567 200V142Z','#e0e6ce')+path('M608 193L632 216L676 166','none',C.ink,5);art+=note('안전과 존중이 먼저입니다',640,545,580);footer='반복되는 모욕·위협·강요는 혼자 감당하지 마세요';
 }
 art+=actor(parentX,509,t,{older:true,speaking:!turn||!conversation,worried:p<.35&&['opening','waiting','honesty'].includes(v),gesture:1});
 art+=actor(childX,509,t+1,{speaking:conversation&&!!turn,gesture:conversation?1:0});
 const chapter=index<8?'01 마음을 알아차리기':index<14?'02 서운함을 말하는 순서':index<24?'03 대화를 이어가는 방법':'04 나의 삶과 관계 돌보기';
 const progress=(scene.start+t)/total;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="${C.paper}"/>${text('마음을 읽는 작은 이야기',48,36,18,C.muted,'start')}${text(chapter,1230,36,17,C.muted,'end')}${text(scene.title,48,93,37,C.ink,'start','Jua')}${line(48,107,268,107,C.gold,4)}${art}${text(footer,640,686,19,C.muted)}${text(String(index+1).padStart(2,'0')+' / 30',1230,686,16,C.muted,'end')}<rect x="0" y="715" width="${1280*progress}" height="5" fill="${C.red}"/></svg>`;
}
const png=(scene,t,i,width=1280)=>new Resvg(svg(scene,t,i),{fitTo:{mode:'width',value:width},font:{fontFiles,loadSystemFonts:false,defaultFontFamily:'NanumGothic'}}).render().asPng();
if(process.argv[2]==='preview'){
 for(const [i,s] of scenes.entries())await save(join(cache,`preview-${i}.png`),png(s,4,i,960));
 console.log('Previews: '+cache);process.exit(0);
}
const hash=createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex').slice(0,12),segments=[];
for(const [i,s] of scenes.entries()){
 const target=join(cache,`scene-${s.id}-${hash}-${s.frames}.mov`);segments.push(target);
 if(!await exists(target)){
  const filters=['fps=24'];
  for(const [j,c] of s.captions.entries()){
   const file=join(cache,`${s.id}-caption-${j}.txt`);await save(file,c.text);
   filters.push(`drawtext=fontfile='${join(fontDir,'NanumGothic-Regular.ttf')}':textfile='${file}':expansion=none:fontsize=36:fontcolor=#38382f:box=1:boxcolor=#fcf8ea@0.97:boxborderw=10:x=(w-text_w)/2:y=(h-text_h)/2:enable='gte(t,${c.start})*lt(t,${c.end})'`);
  }
  const tmp=target+'.pending.mov',proc=spawn('ffmpeg',['-y','-v','error','-f','image2pipe','-framerate','12','-vcodec','png','-i','pipe:0','-i',s.voice,'-vf',filters.join(','),'-af','apad','-t',String(s.duration),'-map','0:v','-map','1:a','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','pcm_s16le','-ar','44100','-ac','2',tmp],{stdio:['pipe','ignore','pipe']});
  let err='',failure;proc.stderr.on('data',d=>err=(err+d).slice(-2000));proc.stdin.on('error',e=>failure=e);
  const done=new Promise((ok,fail)=>{proc.once('error',fail);proc.once('close',c=>c?fail(Error(err)):ok());});done.catch(e=>failure=e);
  try{for(let f=0;f<s.sourceFrames;f++){if(failure)throw failure;if(!proc.stdin.write(png(s,f/12,i)))await Promise.race([once(proc.stdin,'drain'),done]);if(f%12===0)await new Promise(r=>setImmediate(r));}proc.stdin.end();await done;await rename(tmp,target);}catch(e){proc.kill('SIGKILL');await done.catch(()=>{});throw e;}
 }
 console.log(`Scene ${i+1}/${scenes.length} · ${s.duration.toFixed(2)}s`);
}
const list=join(cache,'concat.txt');await save(list,segments.map(p=>`file '${p}'`).join('\n'));
await run('ffmpeg',['-y','-v','error','-f','concat','-safe','0','-i',list,'-c:v','copy','-af','loudnorm=I=-16:TP=-1.5:LRA=8','-c:a','aac','-b:a','192k','-ar','44100','-ac','2','-movflags','+faststart',join(out,'senior-family-conversation.mp4')]);
await save(join(out,'project.json'),JSON.stringify({...brief,duration:total,width:1280,height:720,fps:24,animationFps:12,artifact:'senior-family-conversation.mp4',published:false,scenes:scenes.map(({voice,...s})=>s)},null,2)+'\n');
console.log('COMPLETE: '+join(out,'senior-family-conversation.mp4'));
