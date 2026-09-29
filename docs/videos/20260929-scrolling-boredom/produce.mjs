// Episode-specific original SVG animation. No source-video pixels or audio reused.
// CAK_ENGINE_ROOT=/path/to/animation-enabled-checkout node produce.mjs dispatch|render
// Download the narration artifact into BOREDOM_VIDEO_CACHE/remote-narration first.
import {readFile,writeFile,mkdir,access,rename,rm} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const out=dirname(fileURLToPath(import.meta.url));
const brief=JSON.parse(await readFile(join(out,'brief.json'),'utf8'));
const root=resolve(process.env.CAK_ENGINE_ROOT||join(out,'../../..'));
const cache=process.env.BOREDOM_VIDEO_CACHE||'/private/tmp/cak-scrolling-boredom-20260929';
const targetSeconds=brief.duration;
const targetFrames=Math.round(targetSeconds*30);
if(!Number.isFinite(targetSeconds)||targetSeconds<=0||targetSeconds>180)throw Error('Invalid Shorts duration');
const app=join(root,'apps/shopshorts');
const require=createRequire(join(app,'package.json'));
const {Resvg}=require('@resvg/resvg-js');
const imp=p=>import(pathToFileURL(join(app,p)));
const {executeStudioTask,command}=await imp('studio-runner.mjs');
const {createProject,validateEdit}=await imp('lib/studio.js');
const {cinematicEdit}=await imp('lib/cinematic-production.js');
const exists=p=>access(p).then(()=>true,()=>false);
const save=async(p,d)=>{await mkdir(dirname(p),{recursive:true});await writeFile(p,d);};
if(process.argv[2]==='dispatch'){
 const script={briefId:brief.id,title:brief.title,beats:brief.scenes.map((s,index)=>({index,role:index?'body':'hook',durationSec:targetSeconds/brief.scenes.length,narration:s.narration,caption:s.narration,visualPrompt:s.visual}))};
 const data={ref:'main',inputs:{script_b64:Buffer.from(JSON.stringify(script)).toString('base64'),voice_id:brief.voice,verify_secrets_only:'false'}};
 const p=spawn('gh',['api','repos/hhj4861/commerce-automation-kit/actions/workflows/tts-remote.yml/dispatches','--input','-'],{stdio:['pipe','inherit','inherit']});p.stdin.end(JSON.stringify(data));
 const [code]=await once(p,'close');process.exit(code||0);
}
await mkdir(cache,{recursive:true});
const job=createProject({category:'심리학',topic:brief.title,format:'short',duration:targetSeconds,direction:'디지털 전환과 지루함의 실험 결과를 비유와 구분해 설명',productionStyle:'animation'});
job.id=brief.id;job.approved=true;job.voicePreference=brief.voice;
job.scenes=brief.scenes.map(s=>({...s,kind:'video',duration:targetSeconds/brief.scenes.length,prompt:'Original hand-drawn animated explanation: '+s.visual,animation:{title:s.title,layout:'contrast',elements:[{icon:'cloud',label:'영상 전환',motion:'float'},{icon:'home',label:'지루함',motion:'enter'}]}}));
const io={workDir:join(cache,'work'),readAsset:k=>readFile(join(cache,k)),writeAsset:(k,d)=>save(join(cache,k),d)};
const speech=[],originalSpeech=[];
const speed=brief.narrationSpeed??1;
if(!Number.isFinite(speed)||speed<.5||speed>2)throw Error("Invalid narration speed");
for(const [i,s] of job.scenes.entries()){
 const source=join(cache,'remote-narration',`beat-${String(i).padStart(2,'0')}.mp3`);
 const meta=JSON.parse(await readFile(source+'.json','utf8'));
 if(meta.text!==s.narration||meta.voiceId!==brief.voice)throw Error(`Narration mismatch in scene ${i+1}`);
 const originalDuration=Number(await command('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',source],{}));
 originalSpeech.push(originalDuration);
 const processed=join(cache,`beat-${i}-speed-${speed}.mp3`);
 await command('ffmpeg',['-y','-v','error','-i',source,'-af',`atempo=${speed}`,'-c:a','libmp3lame','-b:a','192k',processed],{});
 const duration=Number(await command('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',processed],{}));
 if(!Number.isFinite(duration)||duration<=0)throw Error('Invalid narration duration');speech.push(duration);
 const hash=createHash('sha256').update(`${brief.voice}:${s.narration}`).digest('hex').slice(0,24),key=`studio/${job.id}/narration-${hash}.mp3`;
 await io.writeAsset(key,await readFile(processed));
 job.assets[`narration-${s.id}`]={key,kind:'audio',type:'audio/mpeg',purpose:'narration',source:'ai',voice:brief.voice,text:s.narration,duration,name:s.id};
}
const min=speech.map(d=>Math.ceil((d+.15)*30)),extra=targetFrames-min.reduce((a,b)=>a+b,0);
console.log(JSON.stringify({speechSeconds:speech,totalSpeech:speech.reduce((a,b)=>a+b,0),extraFrames:extra}));
if(extra>240)throw Error('Narration is too short for a dense edit at the requested length; expand the script before rendering');
if(extra<0)throw Error('Speech exceeds the requested duration; shorten script, do not truncate narration');
const frames=min.map((f,i)=>f+Math.floor(extra/brief.scenes.length)+(i<extra%brief.scenes.length?1:0));
job.scenes.forEach((s,i)=>s.duration=frames[i]/30);
if(process.argv[2]==='measure'){console.log(JSON.stringify({originalSpeech,speech,frames}));process.exit(0);}
job.edit=cinematicEdit(job);

// Balance each sentence into readable cards so a trailing verb is not stranded.
function captionCards(narration){
 const cards=[];
 for(const sentence of narration.match(/[^.!?]+[.!?]?/gu)||[]){
  const words=sentence.trim().split(/\s+/u),n=words.length;
  let solution;
  for(let count=Math.ceil(sentence.trim().length/36);count<=n&&!solution;count++){
   const memo=new Map(),target=sentence.trim().length/count;
   function partition(from,left){
    if(!left)return from===n?{cost:0,parts:[]}:null;
    const key=from+':'+left;if(memo.has(key))return memo.get(key);
    let best=null;
    for(let end=from+1;end<=n-left+1;end++){
     const part=words.slice(from,end).join(' ');if(part.length>36)break;
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
   if(part.length<=18){cards.push(part);continue;}
   const w=part.split(' ');let best;
   for(let k=1;k<w.length;k++){
    const a=w.slice(0,k).join(' '),b=w.slice(k).join(' ');
    if(a.length>20||b.length>20)continue;
    const cost=Math.abs(a.length-b.length);if(!best||cost<best.cost)best={cost,text:a+'\n'+b};
   }
   if(!best)throw Error('Caption line is too wide');cards.push(best.text);
  }
 }
 return cards;
}
job.edit.captions=[];
for(const [i,clip] of job.edit.clips.entries()){
 const scene=job.scenes.find(s=>s.id===clip.sceneId),cards=captionCards(scene.narration);
 const weights=cards.map(c=>Array.from(c.replace(/\s/gu,'')).length),sum=weights.reduce((a,b)=>a+b,0);
 const end=Math.ceil(speech[i]*30);let used=0;
 cards.forEach((text,j)=>{
  const startFrame=Math.round(used/sum*end);used+=weights[j];const endFrame=Math.round(used/sum*end);
  if(endFrame-startFrame<12)throw Error('Caption too brief');
  job.edit.captions.push({id:clip.id+'-caption-'+j,clipId:clip.id,source:'script',text,startFrame,endFrame,font:'gothic',size:48,x:50,y:50,position:'middle',background:true,backgroundColor:'#fcf8e9',backgroundOpacity:.96,color:'#34372f',outlineWidth:0,outlineColor:'#000000'});
 });
}
validateEdit(job.edit,job);

const C={paper:'#f3edd8',ground:'#e8dfc0',ink:'#38382f',red:'#d97763',mint:'#92c5ad',blue:'#85b8d1',gold:'#e7bf5f',navy:'#192a50',chalk:'#f4efdc'};
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const ease=t=>1-(1-Math.max(0,Math.min(1,t)))**3;
const text=(s,x,y,size=27,color=C.ink,anchor='middle',font='NanumGothic')=>`<text x="${x}" y="${y}" font-size="${size}" font-family="${font}" fill="${color}" text-anchor="${anchor}">${escape(s)}</text>`;
const path=(d,fill='none',stroke=C.ink,w=2)=>`<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const circle=(x,y,r,fill,stroke=C.ink)=>path(`M${x-r} ${y}C${x-r-3} ${y-r*.58} ${x-r*.55} ${y-r-2} ${x} ${y-r}S${x+r+2} ${y-r*.52} ${x+r} ${y}S${x+r*.48} ${y+r+2} ${x} ${y+r}S${x-r+1} ${y+r*.5} ${x-r} ${y}Z`,fill,stroke);
const show=(s,t,delay=0)=>`<g opacity="${ease((t-delay)/.6)}" transform="translate(0 ${(1-ease((t-delay)/.6))*24})">${s}</g>`;
const line=(a,b,c,d,color=C.ink,w=2)=>path(`M${a} ${b}Q${(a+c)/2+1} ${(b+d)/2-1} ${c} ${d}`,'none',color,w);
function face(x,y,t,mood='happy',ink=C.ink){
 const blink=Math.sin(t*1.8)> .994;
 return `<g fill="${ink}">${blink?line(x-19,y,x-11,y,ink):`<ellipse cx="${x-15}" cy="${y}" rx="3" ry="4"/>`}${blink?line(x+11,y,x+19,y,ink):`<ellipse cx="${x+15}" cy="${y}" rx="3" ry="4"/>`}</g>`+path(mood==='worried'?`M${x-9} ${y+20}Q${x} ${y+10} ${x+9} ${y+20}`:`M${x-10} ${y+12}Q${x} ${y+26} ${x+10} ${y+12}`,'none',ink,2)+`<ellipse cx="${x-29}" cy="${y+11}" rx="9" ry="4" fill="${C.red}" opacity=".3"/><ellipse cx="${x+29}" cy="${y+11}" rx="9" ry="4" fill="${C.red}" opacity=".3"/>`;
}

function person(x,y,t,mood='happy',scale=1){return `<g transform="translate(${x} ${y+Math.sin(t*2)*3}) scale(${scale})">${path('M-47 12Q-58 66-40 99L45 99Q59 49 45 12',C.mint)}${circle(0,-22,57,C.paper)}${face(0,-18,t,mood)}${path('M-33 100L-36 141L-57 141M33 100L36 141L57 141')}${path(`M-46 28Q-89 30-101 ${2+Math.sin(t*2)*14}M47 28Q90 41 102 ${10-Math.sin(t*2)*14}`)}</g>`;}
function doodle(x,y,variant,t,scale=1){
 const v=((variant%3)+3)%3;let d='';
 if(v===0)d=path('M-48-19L-45-56L-18-35Q0-43 18-35L46-56L49-19Q64 47 0 52Q-63 44-48-19Z',C.gold)+face(0,-4,t)+line(-49,18,-76,9)+line(49,18,76,9);
 if(v===1)d=circle(0,0,51,C.blue)+path('M-42-21L-15-40L2-14L-15 12L-34 4Z',C.mint)+path('M19 8L45 2L35 35L9 39Z',C.mint)+face(0,0,t);
 if(v===2)d=Array.from({length:6},(_,i)=>`<ellipse cx="0" cy="-36" rx="20" ry="31" transform="rotate(${i*60})" fill="${C.red}" stroke="${C.ink}" stroke-width="2"/>`).join('')+circle(0,0,29,C.gold)+face(0,-6,t);
 return `<g transform="translate(${x} ${y}) scale(${scale})">${d}</g>`;
}
function phone(x,y,t,{scale=1,swipe=false,variant=0,happy=true}={}){
 const phase=(t*.95)%1,offset=swipe?ease(Math.max(0,phase-.4)/.45)*190:0,k=swipe?Math.floor(t*.95):variant;
 return `<g transform="translate(${x} ${y}) scale(${scale})"><rect x="-89" y="-151" width="178" height="302" rx="22" fill="#faf7eb" stroke="${C.ink}" stroke-width="3"/>${line(-22,-135,22,-135)}<svg x="-76" y="-119" width="152" height="221" viewBox="-76 -110 152 221"><rect x="-76" y="-110" width="152" height="221" fill="${C.mint}" opacity=".23"/><g transform="translate(0 ${-offset})">${doodle(0,-12,k,t,.72)}${line(-45,57,45,57)}${line(-45,71,19,71)}${swipe?doodle(0,178,k+1,t,.72):''}</g></svg>${circle(0,126,8,C.paper)}${swipe?path(`M111 53L111 ${12-phase*100}M103 ${24-phase*100}L111 ${12-phase*100}L119 ${24-phase*100}`,'none',C.red,4):''}</g>`;
}
function pill(s,x,y,w=280,dark=false){dark=false;return `<rect x="${x-w/2}" y="${y-32}" width="${w}" height="51" rx="25" fill="${dark?'#304569':'#fbf8ec'}" stroke="${dark?'#99acc4':'#b5aa8d'}"/>${text(s,x,y,23,dark?C.chalk:C.ink)}`;}
function arrow(x1,y1,x2,y2,ink=C.ink){return path(`M${x1} ${y1}Q${(x1+x2)/2+8} ${(y1+y2)/2-8} ${x2} ${y2}`,'none',ink,3)+path(`M${x2-10} ${y2-9}L${x2} ${y2}L${x2-10} ${y2+9}`,'none',ink,3);}
function book(x,y,t,open=true,scale=1){return `<g transform="translate(${x} ${y}) scale(${scale})">${path('M0-50Q-64-89-115-50V82Q-54 47 0 80Q60 43 115 82V-50Q54-85 0-50Z',C.paper)}${line(0,-50,0,79)}${[-29,-4,21,46].map(yy=>line(-94,yy,-21,yy-8)+line(21,yy-8,94,yy)).join('')}${open?doodle(0,-118,0,t,.55):''}</g>`;}
function svg(scene,t,index){
 const dark=false,ink=C.ink;
 let body='',note='';
 if(scene.visual==='hook'){
  body=phone(458,422,t,{swipe:true,scale:.9})+person(212,416,t,'worried',1.12);
  body+=show(pill('손가락은 바쁜데…',360,786,405),t,.1)+show(text('왜 마음은 심심할까?',360,943,43,C.ink,'middle','Jua'),t,1);
  note='넘기는 순간보다, 본 뒤의 기분을 떠올려 보세요';
 }else if(scene.visual==='swipe'){
  body=phone(360,427,t,{swipe:true})+show(text('NEXT?',554,358,30,C.red,'middle','Do Hyeon'),t,.2);
  body+=person(218,881,t,'worried',.95)+show(pill('다음 건 재밌겠지',475,818,320),t,.2)+show(text('또 다음… 또 다음…',465,950,25),t,1.5);
  note='지루함을 피하려는 전환이, 지루함을 키울 수도';
 }else if(scene.visual==='experiment'){
  body=phone(192,448,t,{scale:.76})+phone(529,448,t,{scale:.76,swipe:true});
  body+=text('하나를 이어 보기',192,306,27,ink)+text('여러 개를 바꿔 보기',529,306,25,ink);
  body+=pill('같은 10분',360,783,255,true)+show(text('A',192,920,70,C.ink,'middle','Do Hyeon')+text('B',529,920,70,C.ink,'middle','Do Hyeon'),t,.2)+show(text('어느 쪽이 덜 지루했을까?',360,1040,28,ink),t,1);
  note='Tam & Inzlicht (2024) · 실험 조건을 단순화한 도해';
 }else if(scene.visual==='result'){
  body=show(text('이어 본 조건에서',360,340,36,ink,'middle','Jua')+pill('지루함 ↓',360,458,325,true),t,.1);
  body+=show(pill('만족감 ↑',205,799,270,true)+pill('몰입감 ↑',519,799,270,true),t,.4)+person(362,945,t,'happy',.82);
  note='측정 결과의 방향 표시 · 효과 크기·확률 수치 아님';
 }else if(scene.visual==='choice'){
  body=doodle(174,425,0,t)+doodle(362,425,1,t)+doodle(550,425,2,t)+show(text('내가 고른 영상이어도',360,316,33),t,.1);
  body+=phone(361,875,t,{scale:.9,swipe:true})+show(pill('취향만의 문제일까?',360,1100,430),t,.8);
  note='개인 선택 유튜브 영상 조건에서도 전환 효과 관찰';
 }else if(scene.visual==='book'){
  const phase=(t*.8)%1;
  body=book(360,495,t,true,1.2)+show(pill('다음 책으로',360,292,275),t,.2);
  body+=`<g opacity="${.45+.55*phase}" transform="translate(${80*(1-phase)} 0)">${book(189,906,t,false,.65)}</g>`+arrow(296,899,409,899,C.red)+book(529,906,t+.6,false,.65);
  body+=text('첫 장',189,1040,26)+text('또 첫 장',529,1040,26);
  note='몰입이 끊기는 모습을 설명하는 비유 · 실제 실험 아님';
 }else if(scene.visual==='loop'){
  body=show(pill('재미 찾기',179,397,245)+pill('영상 넘기기',544,397,250)+arrow(317,392,400,392,C.red),t,.1);
  body+=phone(360,873,t,{scale:.8,swipe:true})+show(text('재미에 들어갈 시간은?',360,1100,34,C.red,'middle','Jua'),t,1);
  body+=path('M600 446Q698 506 584 546L151 546Q72 516 122 448','none',C.red,3);
  note='전환과 몰입의 관계를 표현한 개념도';
 }else if(scene.visual==='limits'){
  body=show(text('실험에서 관찰한 경향',360,371,34,ink)+text('≠',360,489,79,C.red,'middle','Do Hyeon'),t,.1);
  body+=show(pill('모든 사람의 결과',360,779,433,true)+pill('뇌 손상·중독 진단',360,907,433,true),t,.3);
  body+=show(text('표본 · 콘텐츠 · 상황을 함께 봐야',360,1047,27,ink),t,.8);
  note='7개 실험, 총 1,223명 · 일부 조건에서는 결과 불명확';
 }else if(scene.visual==='try'){
  body=phone(360,436,t,{scale:.9})+show(text('내가 고른 하나',360,282,32,C.ink,'middle','Jua'),t,.1);
  body+=show(pill('① 중간에 넘기지 않기',360,797,455),t,.2)+show(pill('② 본 뒤의 기분 비교하기',360,947,495),t,.9);
  note='효과를 보장하는 처방이 아닌, 직접 비교해 볼 제안';
 }else{
  body=book(360,493,t,true,1.14)+show(text('찾는 재미 → 머무는 재미',360,310,32),t,.2);
  body+=person(361,899,t,'happy',1.08)+show(text('이야기에 들어갈 시간을 주세요',360,1123,29,C.ink,'middle','Jua'),t,1);
  note='억지로 오래 보기보다, 관심 있는 내용에 주의 기울이기';
 }
 const titleChars=Array.from(scene.title),titleLines=[];while(titleChars.length)titleLines.push(titleChars.splice(0,18).join(''));
 const head=titleLines.map((l,i)=>text(l,48,173+i*51,40,ink,'start','Jua')).join('');
 const subtitleY=titleLines.length>1?284:237;
 const progress=(job.scenes.slice(0,index).reduce((a,s)=>a+s.duration,0)+t)/targetSeconds;
 const speckles=Array.from({length:90},(_,i)=>`<circle cx="${(i*163+29)%720}" cy="${(i*109+47)%1280}" r="${i%3*.3+.3}" fill="${ink}" opacity=".09"/>`).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280"><rect width="720" height="1280" fill="${dark?C.navy:C.paper}"/>${speckles}${text('마음을 읽는 작은 이야기',48,72,19,ink,'start')}${line(48,82,263,82,C.gold,4)}${text(String(index+1).padStart(2,'0')+' / '+String(job.scenes.length).padStart(2,'0'),670,72,18,ink,'end')}${head}${text(scene.subtitle,48,subtitleY,22,ink,'start')}${body}${text(note,360,1184,17,dark?'#c5cfdf':'#696758')}${text('AI 애니메이션 · Tam & Inzlicht, 2024',48,1250,15,ink,'start')}<rect x="48" y="1267" width="${624*progress}" height="3" fill="${C.red}"/></svg>`;
}
const fontFiles=['NanumGothic-Regular.ttf','Jua-Regular.ttf','DoHyeon-Regular.ttf'].map(f=>join(app,'public',f));
const renderPng=(scene,t,i,width=1080)=>new Resvg(svg(scene,t,i),{fitTo:{mode:'width',value:width},font:{fontFiles,loadSystemFonts:false,defaultFontFamily:'NanumGothic'}}).render().asPng();
if(process.argv[2]==='preview'){
 for(let i=0;i<job.scenes.length;i++)await save(join(cache,`preview-${i}.png`),renderPng(job.scenes[i],3,i,540));
 console.log('Previews: '+cache);process.exit(0);
}
const codeHash=createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex').slice(0,12);
for(const [i,scene] of job.scenes.entries()){
 const key=`custom/${scene.id}-${codeHash}-${frames[i]}.mp4`,target=join(cache,key);
 if(!await exists(target)){
  await mkdir(dirname(target),{recursive:true});const temporary=target+'.pending.mp4';
  const p=spawn('ffmpeg',['-y','-v','error','-f','image2pipe','-framerate','30','-vcodec','png','-i','pipe:0','-an','-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',temporary],{stdio:['pipe','ignore','pipe']});
  let err='',failure;p.stderr.on('data',d=>err=(err+d).slice(-1500));p.stdin.on('error',e=>failure=e);
  const done=new Promise((ok,fail)=>{p.once('error',fail);p.once('close',c=>c?fail(Error(err)):ok());});done.catch(e=>failure=e);
  try{for(let f=0;f<frames[i];f++){if(failure)throw failure;if(!p.stdin.write(renderPng(scene,f/30,i)))await Promise.race([once(p.stdin,'drain'),done]);if(f%30===0)await new Promise(r=>setImmediate(r));}p.stdin.end();await done;await rename(temporary,target);}catch(e){p.kill('SIGKILL');await done.catch(()=>{});await rm(temporary,{force:true});throw e;}
 }
 job.assets[scene.id]={key,kind:'video',type:'video/mp4',source:'ai',provider:'original-sketch-animation',name:scene.title};console.log(`Animation ${i+1}/${job.scenes.length} · ${scene.duration.toFixed(2)}s`);
}
job.task={id:'render',action:'render'};
const result=await executeStudioTask(job,{},io,async()=>{});
await command('ffmpeg',['-y','-v','error','-i',join(cache,result.render.key),'-c:v','copy','-af','loudnorm=I=-16:TP=-1.5:LRA=8','-c:a','aac','-ar','44100','-b:a','192k','-t',String(targetSeconds),'-movflags','+faststart',join(out,'scrolling-boredom-115x.mp4')],{});
await save(join(out,'project.json'),JSON.stringify({...brief,voiceName:brief.voiceName,narrationSpeed:speed,artifact:'scrolling-boredom-115x.mp4',appPublished:false,scenes:job.scenes.map((s,i)=>({...s,frames:frames[i],originalSpeechSeconds:originalSpeech[i],measuredSpeechSeconds:speech[i]})),captions:job.edit.captions},null,2)+'\n');
console.log('COMPLETE: '+join(out,'scrolling-boredom-115x.mp4'));
