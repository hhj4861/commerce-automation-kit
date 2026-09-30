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
const cache=process.env.JEV_VIDEO_CACHE||'/private/tmp/cak-jev-architecture-20260930';
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
 const source=join(process.env.JEV_NARRATION_CACHE||'/private/tmp/cak-jev-architecture-20260930','remote-narration',`beat-${String(i).padStart(2,'0')}.mp3`);
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
if(brief.autoDuration){targetSeconds=Math.ceil(speech.reduce((a,b)=>a+b,0)+job.scenes.length*.3);if(targetSeconds>180)throw Error('Measured duration exceeds 180s; revise narration');targetFrames=targetSeconds*30;job.brief.duration=targetSeconds;}
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
// Travelling dots show direction; architecture distinguishes decision return from tool execution.
function movingArrow(x,y,xx,yy,t,color=C.green){const p=(t*.42)%1;return arrow(x,y,xx,yy,color)+`<circle cx="${x+(xx-x)*p}" cy="${y+(yy-y)*p}" r="6" fill="${C.gold}"/>`;}
function architecture(t,active='all'){
 const col=k=>active==='all'||active===k?C.green:C.line;
 return show(card(65,303,200,113,'사용자','프롬프트',col('input')),t)
 +movingArrow(280,360,398,360,t)
 +show(card(415,303,240,113,'우리 앱','맥락 · 규칙 · 권한',col('app')),t,.25)
 +movingArrow(510,430,510,471,t)+movingArrow(560,471,560,430,t,C.gold)
 +show(card(415,482,240,105,'Jev','판단 반환',col('jev')),t,.5)
 +text('↓ 판단 결과를 앱이 읽고 경로 선택',360,825,25,C.muted)
 +['업무 도구','언어 모델','추가 확인'].map((x,i)=>show(card(57+i*213,859,180,118,x,['조회 · 실행','답변 작성','질문 · 사람'][i],active==='all'||active===['tool','llm','human'][i]?C.green:C.line),t,.7+i*.18)).join('')
 +movingArrow(140,995,140,1057,t)+movingArrow(354,995,354,1057,t)+movingArrow(568,995,568,1057,t)
 +show(pill('앱이 결과를 모아 사용자에게 응답',360,1120,630),t,1.2);
}
function svg(scene,t,index){
 let body='',foot='개념 설명용 설계 · 실제 API 호출·통합 시연 아님';
 const v=scene.visual;
 if(v==='concept'){
 body=show(text('Jev',360,387,104,C.green,'middle','Jua'),t)+show(pill('System One',360,484,300),t,.4)+flow(t,['상황','판단','구조화 답'],850)+show(text('분류 · 점수 · 참/거짓 가능성',360,1100,30),t,.9);
 }else if(v==='roles'){
 body=show(card(65,310,280,220,'Jev','분류 · 판단 · 점수'),t)+show(card(375,310,280,220,'LLM','답장 · 글 · 코드',C.gold),t,.4)+flow(t,['판단','앱의 규칙','답변 작성'],865)+show(text('LLM도 분류 가능 · 목적에 맞게 역할 분담',360,1080,25),t,.8);
 }else if(v==='build'){
 body=show(card(65,304,590,125,'개발할 때','Claude Code / Codex + TypeSafe 스킬'),t)+movingArrow(360,443,360,483,t)+show(pill('Jev API를 호출하는 앱 코드 작성',360,540,590),t,.5)
 +show(card(65,847,590,138,'앱을 실행할 때','사용자 → 앱 → 필요할 때 Jev API 호출'),t,.9)+show(pill('스킬 설치 ≠ 모든 프롬프트 자동 경유',360,1110,640,C.gold),t,1.2);
 }else if(v==='architecture'){body=architecture(t);
 }else if(v==='state'){
 body=show(card(65,309,590,124,'사용자 프롬프트','무엇을 요청했는가?'),t)+show(pill('+ 필요한 문서 · 권한 있는 정보',360,535,590),t,.4)
 +show(card(65,855,280,135,'상황','텍스트로 된 맥락'),t,.7)+show(card(375,855,280,135,'질문','선택지와 기준'),t,.9)+movingArrow(360,1004,360,1042,t)+show(pill('앱 → Jev',360,1110,330),t,1.1);
 }else if(v==='decision'){
 body=show(card(185,310,350,123,'Jev','상황을 읽고 판단'),t)+movingArrow(360,447,360,481,t)+show(pill('정해진 형태의 결과',360,544,450),t,.4)
 +['선택 항목','선택지별 확률','확신도'].map((x,i)=>show(card(57+i*213,858,180,122,x,['어느 경로?','각각의 가능성','분포 요약'][i]),t,.6+i*.2)).join('')+show(text('판단 결과 ≠ 답장 ≠ 실행 명령',360,1110,30,C.gold),t,1.2);
 }else if(v==='route'){
 body=show(card(65,310,590,150,'우리 앱의 규칙','결과 + 정책 + 권한을 확인'),t)+show(text('어떤 처리가 필요한가?',360,551,29),t,.3)
 +['단순 조회','글쓰기','불확실'].map((x,i)=>show(card(57+i*213,850,180,134,x,['업무 도구','언어 모델','추가 확인'][i],i===2?C.red:C.green),t,.5+i*.3)).join('')+show(pill('모든 요청이 LLM을 거칠 필요는 없음',360,1110,640),t,1.2);
 }else if(v==='response'){
 body=show(card(65,310,590,134,'도구의 실제 결과','필요할 때만 LLM이 문장으로 정리'),t)+show(pill('사용자에게 돌려줄 결과 구성',360,550,570),t,.4)+flow(t,['도구 결과','앱의 응답','사용자'],860)+show(text('예시 구조 · 업무에 맞게 경로 설계',360,1100,28),t,1);
 }else if(v==='example_lookup'){
 body=message(['내 택배 어디 있어?'])+show(pill('Jev 분류: 배송 조회',360,537,460),t,.5)+flow(t,['권한 확인','주문 조회','결과 표시'],851)+show(card(65,1031,590,110,'내일 도착 예정','업무 시스템에서 조회한 값'),t,1);
 foot='가상 주문·가상 결과 · 실제 주문 조회 아님';
 }else if(v==='example_write'){
 body=message(['배송 지연 고객에게','사과 답장을 써줘.'])+show(pill('앱의 선택: LLM 작성 경로',360,541,530),t,.5)+flow(t,['배송 정보','LLM 초안','담당 검토'],853)+show(text('“배송이 늦어져 죄송합니다…”',360,1095,31,C.green,'middle','Jua'),t,1);
 foot='가상 고객지원 예시 · 초안 작성과 실제 발송은 구분';
 }else if(v==='ambiguous'){
 body=message(['안 왔는데 취소할까요?'])+show(pill('배송 문제? 취소 의사?',360,538,510,C.gold),t,.4)+show(card(65,847,590,145,'먼저 확인하기','“배송 확인과 취소 중 무엇을 원하시나요?”',C.red),t,.8)+show(text('형식 보장 ≠ 정답 보장',360,1110,34,C.red),t,1);
 }else{
 body=show(text('Jev + LLM + 앱',360,392,53,C.green,'middle','Jua'),t)+show(pill('작은 판단을 실제 흐름으로 연결',360,535,600),t,.4)+flow(t,['판단','작성','실행 제어'],855)+show(text('Claude Code · Codex로 연동 앱 개발',360,1095,27),t,1);
 }
 const progress=(job.scenes.slice(0,index).reduce((a,s)=>a+s.duration,0)+t)/targetSeconds;
 const fs=Math.min(35,624/(scene.title.length*.96));
 return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280"><rect width="720" height="1280" fill="${C.paper}"/>${text('어려운 기술, 흐름으로 이해하기',48,71,19,C.muted,'start')}${line(48,87,320,87,C.green,4)}${text(String(index+1).padStart(2,'0')+' / '+job.scenes.length,670,71,18,C.muted,'end')}${text(scene.title,48,164,fs,C.ink,'start','Jua')}${text(scene.subtitle,48,228,20,C.muted,'start')}${body}${text(foot,360,1202,16,C.muted)}${text('2026.09 자료 기준 · 독립 설명 영상',48,1250,16,C.muted,'start')}<rect x="48" y="1267" width="${624*progress}" height="3" fill="${C.green}"/></svg>`;
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
