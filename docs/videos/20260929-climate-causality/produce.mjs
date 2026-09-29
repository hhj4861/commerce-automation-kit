// Episode-specific original SVG animation. No source-video pixels or audio reused.
// CAK_ENGINE_ROOT=/path/to/animation-enabled-checkout node produce.mjs dispatch|render
// Download the narration artifact into CLIMATE_VIDEO_CACHE/remote-narration first.
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
const cache=process.env.CLIMATE_VIDEO_CACHE||'/private/tmp/cak-climate-causality-20260929';
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
 const script={briefId:brief.id,title:brief.title,beats:brief.scenes.map((s,index)=>({index,role:index?'body':'hook',durationSec:60/9,narration:s.narration,caption:s.narration,visualPrompt:s.visual}))};
 const data={ref:'main',inputs:{script_b64:Buffer.from(JSON.stringify(script)).toString('base64'),voice_id:brief.voice,verify_secrets_only:'false'}};
 const p=spawn('gh',['api','repos/hhj4861/commerce-automation-kit/actions/workflows/tts-remote.yml/dispatches','--input','-'],{stdio:['pipe','inherit','inherit']});p.stdin.end(JSON.stringify(data));
 const [code]=await once(p,'close');process.exit(code||0);
}
await mkdir(cache,{recursive:true});
const job=createProject({category:'과학',topic:brief.title,format:'short',duration:60,direction:'근거에 따라 기후 위험 증가와 지각판 충돌을 구분하는 과학 해설',productionStyle:'animation'});
job.id=brief.id;job.approved=true;job.voicePreference=brief.voice;
job.scenes=brief.scenes.map(s=>({...s,kind:'video',duration:60/9,prompt:'Original hand-drawn animated explanation: '+s.visual,animation:{title:s.title,layout:'contrast',elements:[{icon:'cloud',label:'기후',motion:'float'},{icon:'home',label:'재난의 원인',motion:'enter'}]}}));
const io={workDir:join(cache,'work'),readAsset:k=>readFile(join(cache,k)),writeAsset:(k,d)=>save(join(cache,k),d)};
const speech=[];
for(const [i,s] of job.scenes.entries()){
 const source=join(cache,'remote-narration',`beat-${String(i).padStart(2,'0')}.mp3`);
 const meta=JSON.parse(await readFile(source+'.json','utf8'));
 if(meta.text!==s.narration)throw Error(`Narration mismatch in scene ${i+1}`);
 const duration=Number(await command('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',source],{}));
 if(!Number.isFinite(duration)||duration<=0)throw Error('Invalid narration duration');speech.push(duration);
 const hash=createHash('sha256').update(`${brief.voice}:${s.narration}`).digest('hex').slice(0,24),key=`studio/${job.id}/narration-${hash}.mp3`;
 await io.writeAsset(key,await readFile(source));
 job.assets[`narration-${s.id}`]={key,kind:'audio',type:'audio/mpeg',purpose:'narration',source:'ai',voice:brief.voice,text:s.narration,duration,name:s.id};
}
const min=speech.map(d=>Math.ceil((d+.15)*30)),extra=1800-min.reduce((a,b)=>a+b,0);
console.log(JSON.stringify({speechSeconds:speech,totalSpeech:speech.reduce((a,b)=>a+b,0),extraFrames:extra}));
if(extra<0)throw Error('Speech exceeds 60 seconds; shorten script, do not trim or speed up');
const frames=min.map((f,i)=>f+Math.floor(extra/9)+(i<extra%9?1:0));
job.scenes.forEach((s,i)=>s.duration=frames[i]/30);
job.edit=cinematicEdit(job);
job.edit.captions=job.edit.captions.map(c=>({...c,text:c.text.replaceAll('영점 일 도','0.1도').replaceAll('일 점 오 도','1.5도'),font:'gothic',size:48,x:50,y:94,background:true,backgroundColor:'#fcf8e9',backgroundOpacity:.96,color:'#34372f',outlineWidth:0}));
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
function globe(x,y,r,t,mood='happy'){
 const dy=Math.sin(t*2)*3;
 return `<g transform="translate(0 ${dy})">${line(x-r*.32,y+r-3,x-r*.37,y+r+34)}${line(x+r*.32,y+r-3,x+r*.35,y+r+34)}${line(x-r,y,x-r-30,y-12+Math.sin(t*3)*9)}${line(x+r,y,x+r+30,y-12-Math.sin(t*3)*9)}${circle(x,y,r,C.blue)}<g transform="translate(${x} ${y}) scale(${r/100})">${path('M-72-50L-45-64L-14-42L-32-14L-58-15L-62 20L-77 3Z',C.mint)}${path('M15-80L49-63L75-38L57-13L20-28L8-1L-5-25Z',C.mint)}${path('M28 32L65 26L67 55L33 77L12 60Z',C.mint)}${face(0,5,t,mood)}</g></g>`;
}
function drop(x,y,s,t,ink=C.ink){return `<g transform="translate(${x} ${y+Math.sin(t*2)*4}) scale(${s})">${path('M0-45C-10-24-29-8-29 11C-29 46 29 46 29 11C29-8 10-24 0-45Z',C.blue,ink)}${face(0,6,t,'happy',ink)}</g>`;}
function cloud(x,y,scale,t,dark=false){const ink=dark?C.chalk:C.ink;return `<g transform="translate(${x} ${y}) scale(${scale})">${path('M-91 26C-132 26-132-23-97-27C-99-62-53-83-30-54C-7-89 49-68 53-36C106-56 140 6 97 27Z',dark?'#40577c':'#fbf8ed',ink)}${face(0,-7,t,'happy',ink)}</g>`;}
function rain(x,y,t,count=15){return Array.from({length:count},(_,i)=>{const xx=x+(i%5)*34,yy=y+((t*110+Math.floor(i/5)*63)%170);return line(xx,yy,xx-7,yy+16,C.blue,3);}).join('');}
function house(x,y,s=1){return `<g transform="translate(${x} ${y}) scale(${s})">${path('M-48 0L0-40L49 0',C.red)}${path('M-38 0V70H38V0',C.paper)}${path('M-9 70V35H12V70',C.mint)}${path('M-26 13H-13V27H-26Z',C.blue)}</g>`;}
function arrow(x1,y1,x2,y2,t,ink=C.ink){const p=ease(t/.8),back=x2-Math.sign(x2-x1)*10;return `<g opacity="${p}">${path(`M${x1} ${y1}Q${(x1+x2)/2+15} ${(y1+y2)/2-8} ${x1+(x2-x1)*p} ${y1+(y2-y1)*p}`,'none',ink,2)}${p>.95?path(`M${back} ${y2-7}L${x2} ${y2}L${back} ${y2+7}`,'none',ink,2):''}</g>`;}
function label(s,x,y,t,delay=0,dark=false){return show(text(s,x,y,27,dark?C.chalk:C.ink),t,delay);}
function badge(s,x,y,w=280,dark=false){return `<rect x="${x-w/2}" y="${y-32}" width="${w}" height="49" rx="22" fill="${dark?'#304569':'#fbf8ec'}" stroke="${dark?'#94abc5':'#aaa186'}"/>${text(s,x,y,22,dark?C.chalk:C.ink)}`;}
function svg(scene,t,index){
 const dark=['budget','plates','causes'].includes(scene.visual),ink=dark?C.chalk:C.ink;
 let body='',note='';
 if(scene.visual==='question'){
  body=globe(360,665,150,t,'worried')+show(badge('멸망까지 남은 시간?',360,432,420),t,.3)+text('0.1°C',360,359,92,C.red,'middle','Do Hyeon');
  body+=show(path('M154 430Q362 397 567 426','none',C.red,4)+badge('아니요, 숫자의 기준부터!',360,944,500),t,2.7);
  note='기후 위험은 실제입니다. 숫자의 해석은 정확하게.';
 }else if(scene.visual==='target'){
  body=show(`<rect x="78" y="367" width="205" height="230" rx="13" fill="#faf6e8" stroke="${ink}"/>${line(78,414,283,414)}${text('한 해',180,460,32)}${text('연평균 기온',180,519,25)}${text('≠',358,506,66,C.red)}<rect x="427" y="367" width="215" height="230" rx="13" fill="#dce8d9" stroke="${ink}"/>${text('오랜 기간',534,447,29)}${text('장기 온난화',534,504,26)}${text('목표 1.5°C',534,559,26,C.ink)}`,t,.1);
  body+=globe(360,852,104,t)+label('한 번의 더운 해 = 목표의 장기 초과?',360,680,t,1.4)+show(badge('서로 다른 지표예요',360,1034,350),t,2);
  note='기준: 산업화 이전(1850–1900) 대비';
 }else if(scene.visual==='budget'){
  const level=Math.max(.12,.85-t*.1);
  body=show(path('M201 464L214 852Q360 875 508 852L519 464Z','#24395e',ink,3)+`<path d="M213 ${855-level*360}Q362 ${843-level*360} 507 ${855-level*360}L507 851Q360 866 214 851Z" fill="${C.gold}" opacity=".8"/>`+path('M190 464Q360 442 529 464Q361 484 190 464Z','none',ink,3)+text('남은 CO₂ 예산',360,400,33,ink)+text('약 1,300억 톤',360,941,40,C.gold,'middle','Do Hyeon'),t,.1);
  body+=show(text('현재 배출 속도 → 약 3년분',360,1011,28,ink),t,1.2);
  note='2026년 초 추정 · 1.5°C 이내 제한 가능성 50%';
 }else if(scene.visual==='rain'){
  body=cloud(358,436,1.25,t)+rain(292,494,t,20)+show(drop(160,770,1.3,t)+drop(280,799,1.2,t+.5)+drop(440,785,1.25,t+1)+drop(560,759,1.15,t+2),t,.4);
  body+=show(text('따뜻한 공기',360,343,33)+text('담을 수 있는 수증기 증가',360,658,30)+arrow(170,900,550,900,t-.6)+text('강한 비가 내릴 조건',360,987,33,C.ink,'middle','Jua'),t,.7);
  note='기온 상승 → 수증기 증가 → 강한 강수 위험';
 }else if(scene.visual==='storm'){
  const spin=t*38;
  body=`<g transform="translate(360 583) rotate(${spin})">${[0,120,240].map(a=>`<g transform="rotate(${a})">${path('M0-32C146-143 210 5 119 72C53 122-52 79-46 4C-41-38 23-72 75-46','none',C.ink,5)}</g>`).join('')}${circle(0,0,22,C.paper)}</g>`;
  body+=rain(292,730,t,14)+path(`M59 909Q150 ${889+Math.sin(t*2)*10} 241 911T426 910T660 910V971H59Z`,C.blue,'none');
  body+=show(text('따뜻한 바다 + 수증기',360,373,31)+text('강한 비를 키울 수 있다',360,1040,30),t,.5);
  note='강수 강도와 전 세계 태풍 발생 수는 구분';
 }else if(scene.visual==='attribution'){
  body=show(house(182,560,1.45)+cloud(177,449,.8,t)+rain(124,480,t,10)+path('M70 678Q170 654 293 680V735H70Z',C.blue),t,.1);
  body+=show(`<g transform="translate(533 573) rotate(${t*28})">${path('M0-35C97-96 129 15 60 58C-16 95-80 18-43-28C-16-62 39-52 54-21','none',C.ink,5)}</g>`,t,.6);
  body+=text('일본 홍수',178,805,30)+text('중국 태풍',532,805,30)+show(badge('개별 사건 분석이 필요해요',360,940,520),t,1.3);
  body+=show(text('강수 · 지형 · 배수 · 노출도',360,1031,27),t,2);
  note='특정 사건의 기후 기여도·피해 원인은 미확정';
 }else if(scene.visual==='plates'){
  const dx=Math.sin(t*1.5)*4;
  body=show(`<g transform="translate(${dx} 0)">${path('M70 805L319 805L432 896L70 896Z','#9c7958',ink,2)}</g><g transform="translate(${-dx} 0)">${path('M335 805L422 718L456 772L481 727L533 805H660V914H449Z','#788e92',ink,2)}</g>`,t,.1);
  body+=arrow(126,986,270,986,t-.4,C.gold)+arrow(590,986,470,986,t-.4,C.gold)+text('인도판',180,1050,31,ink)+text('유라시아판',532,1050,31,ink);
  body+=show(text('히말라야',459,651,33,ink)+text('판 충돌 → 단층에 쌓인 힘',360,466,32,ink)+text('갑작스러운 미끄러짐 → 지진',360,526,28,ink),t,.8);
  for(let i=0;i<3;i++)body+=`<circle cx="358" cy="817" r="${30+((t*35+i*40)%125)}" fill="none" stroke="${C.gold}" opacity="${.45*(1-((t*35+i*40)%125)/125)}"/>`;
  note='판 운동 개념도 · 실제 지진파·단층 비율 아님';
 }else if(scene.visual==='causes'){
  body=show(badge('온난화',163,432,200,true)+badge('판 운동',548,432,200,true),t,.1);
  body+=show(path('M163 466Q130 597 166 733','none',C.gold,3)+path('M548 466Q580 597 547 733','none',C.mint,3)+cloud(164,810,.8,t,true)+text('강한 비 위험',164,918,27,ink)+path('M471 860L535 779L600 861',C.navy,ink,3)+text('지진',548,918,29,ink),t,.6);
  body+=show(text('≠',360,709,85,C.gold)+text('동시 발생은 인과관계의 증거가 아니다',360,1031,25,ink),t,1.4);
  note='기후재난과 지질재난의 주된 발생 경로 구분';
 }else{
  body=show(path('M89 889C251 881 393 744 639 449','none',C.red,5)+text('추가 온난화 →',375,1005,29)+text('위험 증가',563,390,30,C.red),t,.1);
  body+=globe(248,744,97,t)+show(badge('줄이는 0.1°C마다',382,1071,385),t,.7);
  body+=show(text('배출 감축',170,479,31)+text('+',355,479,35,C.red)+text('재난 대비',532,479,31),t,1.2);
  note='위험 증가 개념도 · 정량 그래프 아님 · 일부 변화는 비가역적';
 }
 const title=Array.from(scene.title),titleLines=[];while(title.length)titleLines.push(title.splice(0,19).join(''));
 const head=titleLines.map((s,i)=>text(s,48,180+i*47,37,ink,'start','Jua')).join('');
 const subtitleY=titleLines.length>1?284:238;
 const speckles=Array.from({length:95},(_,i)=>`<circle cx="${(i*163+29)%720}" cy="${(i*109+47)%1280}" r="${i%3*.3+.3}" fill="${ink}" opacity=".1"/>`).join('');
 const progress=(job.scenes.slice(0,index).reduce((a,s)=>a+s.duration,0)+t)/60;
 const noteColor=dark?'#c5cfdf':'#696758';
 const noteSvg=scene.visual==='budget'?text('2026년 초 추정 · 1.5°C 목표',360,1084,20,noteColor)+text('목표 이내 제한 가능성 50%',360,1115,20,noteColor):text(note,360,1120,18,noteColor);
 return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280"><rect width="720" height="1280" fill="${dark?C.navy:C.paper}"/>${speckles}${!dark?path('M0 1085Q154 1062 327 1087T720 1080V1280H0Z',C.ground,'none'):''}${text('기후를 읽는 작은 이야기',48,72,19,ink,'start')}${line(48,80,263,80,C.gold,4)}${text(String(index+1).padStart(2,'0')+' / 09',670,72,18,ink,'end')}${show(head+text(scene.subtitle,48,subtitleY,22,ink,'start'),t)}${body}${noteSvg}<rect x="36" y="1140" width="648" height="87" rx="22" fill="${dark?'#304264':'#ebe3ca'}"/>${text('AI 애니메이션 · 공식 자료 기반 해설',48,1250,15,ink,'start')}<rect x="48" y="1267" width="${624*progress}" height="3" fill="${C.red}"/></svg>`;
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
 job.assets[scene.id]={key,kind:'video',type:'video/mp4',source:'ai',provider:'original-sketch-animation',name:scene.title};console.log(`Animation ${i+1}/9 · ${scene.duration.toFixed(2)}s`);
}
job.task={id:'render',action:'render'};
const result=await executeStudioTask(job,{},io,async()=>{});
await command('ffmpeg',['-y','-v','error','-i',join(cache,result.render.key),'-c:v','copy','-af','loudnorm=I=-16:TP=-1.5:LRA=8','-c:a','aac','-ar','44100','-b:a','192k','-t','60','-movflags','+faststart',join(out,'climate-causality-60s.mp4')],{});
await save(join(out,'project.json'),JSON.stringify({...brief,voiceName:'진건 · 차분한 남성',artifact:'climate-causality-60s.mp4',appPublished:false,scenes:job.scenes.map((s,i)=>({...s,frames:frames[i],measuredSpeechSeconds:speech[i]})),captions:job.edit.captions},null,2)+'\n');
console.log('COMPLETE: '+join(out,'climate-causality-60s.mp4'));
