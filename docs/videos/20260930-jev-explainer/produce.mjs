// Episode-specific original SVG animation. No source-video pixels or audio reused.
// CAK_ENGINE_ROOT=/path/to/animation-enabled-checkout node produce.mjs dispatch|render
// Download the narration artifact into JEV_VIDEO_CACHE/remote-narration first.
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
const cache=process.env.JEV_VIDEO_CACHE||'/private/tmp/cak-jev-explainer-20260930';
let targetSeconds=brief.duration;
let targetFrames=Math.round(targetSeconds*30);
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
const job=createProject({category:'과학',topic:brief.title,format:'short',duration:targetSeconds,direction:brief.direction,productionStyle:'cinematic'});
job.brief.workflow='explainer-v1';job.brief.narrationSpeed=brief.narrationSpeed;job.visualStyle=brief.visualStyle;job.id=brief.id;job.approved=true;job.voicePreference=brief.voice;
job.scenes=brief.scenes.map(s=>({...s,kind:s.kind,duration:targetSeconds/brief.scenes.length,prompt:s.prompt,animation:{title:s.title,layout:'contrast',elements:[{icon:'circle',label:'판단',motion:'enter'}]}}));
const io={workDir:join(cache,'work'),readAsset:k=>readFile(join(cache,k)),writeAsset:(k,d)=>save(join(cache,k),d)};
const speech=[],originalSpeech=[];
const speed=brief.narrationSpeed??1;
if(!Number.isFinite(speed)||speed<.5||speed>2)throw Error("Invalid narration speed");
for(const [i,s] of job.scenes.entries()){
 const source=join(process.env.JEV_NARRATION_CACHE||'/private/tmp/cak-jev-explainer-20260930','remote-narration',`beat-${String(i).padStart(2,'0')}.mp3`);
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
 job.assets[`narration-${s.id}`]={key,kind:'audio',type:'audio/mpeg',purpose:'narration',narrationSpeed:speed,source:'ai',voice:brief.voice,text:s.narration,duration,name:s.id};
}
if(brief.autoDuration){targetSeconds=Math.ceil(speech.reduce((a,b)=>a+b,0)+job.scenes.length*.3);targetFrames=targetSeconds*30;job.brief.duration=targetSeconds;}
const min=speech.map(d=>Math.ceil((d+.15)*30)),extra=targetFrames-min.reduce((a,b)=>a+b,0);
console.log(JSON.stringify({speechSeconds:speech,totalSpeech:speech.reduce((a,b)=>a+b,0),extraFrames:extra}));
if(extra>240)throw Error('Narration is too short for a dense edit at the requested length; expand the script before rendering');
if(extra<0)throw Error('Speech exceeds the requested duration; shorten script, do not truncate narration');
const frames=min.map((f,i)=>f+Math.floor(extra/brief.scenes.length)+(i<extra%brief.scenes.length?1:0));
job.scenes.forEach((s,i)=>s.duration=frames[i]/30);
if(process.argv[2]==='measure'){console.log(JSON.stringify({originalSpeech,speech,frames}));process.exit(0);}
job.edit=cinematicEdit(job);
let timelineFrame=0;job.edit.clips.forEach((clip,i)=>{clip.startFrame=timelineFrame;clip.inFrame=0;clip.outFrame=frames[i];timelineFrame+=frames[i];});

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
 const scene=job.scenes.find(s=>s.id===clip.sceneId),cards=captionCards(scene.captionNarration||scene.narration);
 const weights=cards.map(c=>Array.from(c.replace(/\s/gu,'')).length),sum=weights.reduce((a,b)=>a+b,0);
 const end=Math.ceil(speech[i]*30);let used=0;
 cards.forEach((text,j)=>{
  const startFrame=Math.round(used/sum*end);used+=weights[j];const endFrame=Math.round(used/sum*end);
  if(endFrame-startFrame<12)throw Error('Caption too brief');
  job.edit.captions.push({id:clip.id+'-caption-'+j,clipId:clip.id,source:'script',text,startFrame,endFrame,font:'gothic',size:48,x:50,y:50,position:'middle',background:true,backgroundColor:'#f7f2e7',backgroundOpacity:.94,color:'#24372f',outlineWidth:0,outlineColor:'#000000'});
 });
}
validateEdit(job.edit,job);

const C={paper:'#f7f2e7',ink:'#24372f',green:'#3e7561',mint:'#dbe8df',gold:'#ad703a',red:'#b55238',muted:'#6f7b70',line:'#b9c5b8'};
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const ease=t=>1-(1-Math.max(0,Math.min(1,t)))**3;
const text=(s,x,y,size=27,color=C.ink,anchor='middle',font='NanumGothic')=>`<text x="${x}" y="${y}" font-size="${size}" font-family="${font}" fill="${color}" text-anchor="${anchor}">${escape(s)}</text>`;
const line=(x,y,xx,yy,color=C.line,w=2)=>`<path d="M${x} ${y}L${xx} ${yy}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
const show=(s,t,d=0)=>`<g opacity="${ease((t-d)/.65)}" transform="translate(0 ${(1-ease((t-d)/.65))*18})">${s}</g>`;
const rect=(x,y,w,h,fill=C.mint,stroke=C.line,r=20)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}"/>`;
const pill=(label,x,y,w=270,color=C.green)=>rect(x-w/2,y-32,w,52,C.paper,color,26)+text(label,x,y,22,color);
function card(x,y,w,h,title,sub='',color=C.green){return rect(x,y,w,h,'#fffcf5',color)+text(title,x+w/2,y+44,Math.min(27,(w-28)/Math.max(1,title.length)),color,'middle','Jua')+(sub?text(sub,x+w/2,y+83,20,C.muted):'');}
function arrow(x,y,xx,yy,color=C.green){const a=Math.atan2(yy-y,xx-x),h=10;return line(x,y,xx,yy,color,3)+`<path d="M${xx-h*Math.cos(a-.5)} ${yy-h*Math.sin(a-.5)}L${xx} ${yy}L${xx-h*Math.cos(a+.5)} ${yy-h*Math.sin(a+.5)}" fill="none" stroke="${color}" stroke-width="3"/>`;}
function parcel(x,y,t,size=90){const u=Math.sin(t*1.7)*4;return `<g transform="translate(${x} ${y+u})">${rect(-size/2,-size/2,size,size,'#e8cca4',C.gold,8)}${line(0,-size/2,0,size/2,C.gold,3)}${rect(-13,-size/2,26,23,C.paper,C.gold,2)}</g>`;}
function message(lines,y=300){return rect(65,y,590,150,'#fffcf5',C.line)+text('고객 메시지',96,y+35,20,C.muted,'start')+lines.map((s,i)=>text(s,360,y+82+i*34,28,C.ink,'middle','Jua')).join('');}
function bar(label,value,y,t,color=C.green,delay=0){const v=ease((t-delay)/1.1);return text(label,92,y+5,24,C.ink,'start')+rect(186,y-18,375,29,'#e3e5da','none',14)+rect(186,y-18,Math.max(1,375*value*v),29,color,'none',14)+text(Math.round(value*100*v)+'%',631,y+5,25,color,'end');}
function flow(t,labels,y=900){const xs=[72,282,492];let a='';labels.forEach((s,i)=>{a+=show(card(xs[i],y,156,102,s,'',i===2?C.gold:C.green),t,i*.35);if(i<2)a+=arrow(xs[i]+165,y+48,xs[i]+196,y+48);});const k=(t*.32)%1;a+=`<circle cx="${140+430*k}" cy="${y+125}" r="6" fill="${C.gold}"/>`;return a;}
function svg(scene,t,index){
 let body='',foot='개념 설명 애니메이션 · 자료: TypeSafe 공식 문서';
 const v=scene.visual;
 if(v==='hook'){
  body=message(['택배가 아직 안 왔어요.'])+parcel(140,523,t,80)+show(pill('누가 처리해야 할까?',431,527,360),t,.5)+flow(t,['문의','판단','담당자'],850)+show(text('답변 전에 필요한 작은 결정',360,1100,30,C.ink,'middle','Jua'),t,1);
 }else if(v==='one'){
  body=show(text('Jev',360,391,100,C.green,'middle','Jua'),t)+show(pill('System One',360,478,300),t,.4)+flow(t,['상황','판단','구조화 답'],820)+show(text('빠르고, 좁고, 구체적인 질문',360,1050,31,C.ink,'middle','Jua'),t,.8);
 }else if(v==='input'){
  body=message(['배송 완료라고 뜨는데','택배가 없어요.'])+show(pill('주문 상태: 배송 완료',360,529,430),t,.6)+flow(t,['글 정보','Jev','판단'],850);
  foot='가상 고객 문의 · 실제 고객정보나 API 응답 아님';
 }else if(v==='choices'){
  body=show(card(83,313,554,138,'어느 담당자가 처리할까요?','선택지와 의미를 미리 정의합니다'),t);
  ['배송','환불','기타'].forEach((s,i)=>body+=show(card(66+i*205,841,178,117,s,['배송 상태','환불 요청','해당 없음'][i]),t,i*.4));
  body+=show(pill('선택지 밖의 부서를 만들지 않음',360,1085,590),t,1);
 }else if(v==='probabilities'){
  body=show(pill('선택 결과: 배송',360,359,420),t)+text('선택지별 확률',360,430,25,C.muted)+bar('배송',.90,862,t)+bar('환불',.08,947,t,C.gold,.2)+bar('기타',.02,1032,t,C.muted,.4);
  foot='90% · 8% · 2%는 설명용 가정 · 실제 API 결과 아님';
 }else if(v==='route'){
  body=show(card(107,310,506,170,'예시 규칙','배송 확률이 정한 기준을 넘으면'),t)+show(text('→ 배송팀에 배정',360,446,29,C.green,'middle','Jua'),t,.6)+flow(t,['AI 판단','규칙 확인','배송팀'],845)+show(pill('정책은 사람이 정하고, 코드로 실행',360,1080,620),t,1);
  foot='설명용 분류 규칙 · 실제 자동 처리·환불 실행 없음';
 }else if(v==='ambiguous'){
  body=message(['상품을 못 받았는데','취소할 수 있나요?'])+bar('배송',.49,845,t,C.gold)+bar('환불',.48,925,t,C.red,.2)+bar('기타',.03,1005,t,C.muted,.4)+show(pill('차이가 작다 → 바로 결정하지 않기',360,1120,600,C.red),t,1);
  foot='49% · 48% · 3%는 설명용 가정 · 실제 API 결과 아님';
 }else if(v==='confidence'){
  body=show(card(70,300,580,125,'확률','각 선택지의 가능성을 나눠 표시'),t)+show(card(70,448,580,125,'확신도','확률 분포의 모양을 요약'),t,.4);
  body+=show(card(72,847,255,130,'사람에게 확인','불확실하면 검토',C.red),t,.8)+show(card(393,847,255,130,'고객에게 질문','정보가 더 필요할 때'),t,1.1)+show(pill('확률 ≠ 확신도',360,1080,370,C.gold),t,1.2);
 }else if(v==='parallel'){
  body=show(card(185,299,350,104,'같은 고객 문의'),t);
  [157,360,563].forEach((x,i)=>body+=arrow(360,412,x,486)+show(pill(['담당자?','환불 요청?','불편 정도?'][i],x,530,184),t,.4));
  ['선택지 분류','참/거짓 가능성','척도로 점수'].forEach((s,i)=>body+=show(card(62+i*205,834,185,113,s),t,.8));
  body+=show(text('질문은 독립적으로 · 결과는 코드로 조합',360,1075,25),t,1.2);
 }else if(v==='limits'){
  body=show(card(65,302,590,129,'형식을 지킨다','배송 · 환불 · 기타 중 하나'),t)+show(text('≠',360,525,90,C.red,'middle','Jua'),t,.5)+show(card(65,830,590,129,'항상 정답이다','잘못된 선택지를 고를 수도 있음',C.red),t,.8)+show(pill('우리 데이터로 정확도 검증',360,1080,540),t,1.2);
 }else if(v==='roles'){
  body=show(card(64,300,280,220,'Jev','담당 분류 · 점수'),t)+show(card(376,300,280,220,'언어 모델','답장 · 글 · 코드',C.gold),t,.4);
  body+=flow(t,['분류','규칙','답장 작성'],849)+show(text('기존 언어 모델도 분류할 수 있습니다',360,1080,25),t,.8);
 }else{
  body=show(text('Jev',360,376,88,C.green,'middle','Jua'),t)+show(pill('똑똑한 분류 스위치',360,486,450),t,.3)+show(card(65,843,280,130,'명확하면','규칙에 맞게 연결'),t,.5)+show(card(375,843,280,130,'애매하면','사람에게 확인',C.red),t,.9)+show(text('판단 + 규칙 + 확인',360,1097,37,C.ink,'middle','Jua'),t,1.3);
 }
 const progress=(job.scenes.slice(0,index).reduce((a,s)=>a+s.duration,0)+t)/targetSeconds;
 const title=scene.title.length>20?[scene.title.slice(0,20),scene.title.slice(20)]:[scene.title];
 return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280"><rect width="720" height="1280" fill="${C.paper}"/>${text('어려운 기술, 쉬운 예시',48,71,19,C.muted,'start')}${line(48,87,263,87,C.green,4)}${text(String(index+1).padStart(2,'0')+' / 12',670,71,18,C.muted,'end')}${title.map((s,i)=>text(s,48,164+i*44,35,C.ink,'start','Jua')).join('')}${text(scene.subtitle,48,title.length>1?255:228,21,C.muted,'start')}${body}${text(foot,360,1202,16,C.muted)}${text('2026.09 자료 기준 · 독립 설명 영상',48,1250,16,C.muted,'start')}<rect x="48" y="1267" width="${624*progress}" height="3" fill="${C.green}"/></svg>`;
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
// Original quiet harmonic bed; no reference soundtrack or licensed track reused.
const score=join(cache,'original-ambient.wav');
await command('ffmpeg',['-y','-v','error','-f','lavfi','-i',`aevalsrc=0.008*(sin(2*PI*130.8128*t)+0.6*sin(2*PI*195.9977*t)+0.35*sin(2*PI*311.127*t))*(0.65+0.35*sin(2*PI*0.07*t)^2):s=44100:d=${targetSeconds}`,'-af',`lowpass=f=950,afade=t=in:d=2,afade=t=out:st=${targetSeconds-4}:d=4`,'-ac','2',score],{});
await command('ffmpeg',['-y','-v','error','-i',join(cache,result.render.key),'-i',score,'-filter_complex','[0:a]loudnorm=I=-16:TP=-1.5:LRA=8,asplit=2[voice][control];[1:a][control]sidechaincompress=threshold=0.025:ratio=4:attack=30:release=500[bed];[voice][bed]amix=inputs=2:duration=first:normalize=0[a]','-map','0:v:0','-map','[a]','-c:v','copy','-c:a','aac','-ar','44100','-b:a','192k','-t',String(targetSeconds),'-movflags','+faststart',join(out,'jev-explainer.mp4')],{});
await save(join(out,'project.json'),JSON.stringify({...brief,duration:targetSeconds,mediaProvenance:{provider:"original-svg-animation",generatedClips:0},voiceName:brief.voiceName,narrationSpeed:speed,artifact:'jev-explainer.mp4',appPublished:false,scenes:job.scenes.map((s,i)=>({...s,frames:frames[i],originalSpeechSeconds:originalSpeech[i],measuredSpeechSeconds:speech[i]})),captions:job.edit.captions},null,2)+'\n');
console.log('COMPLETE: '+join(out,'jev-explainer.mp4'));
