// Episode-specific original SVG animation. No source-video pixels or audio reused.
// CAK_ENGINE_ROOT=/path/to/animation-enabled-checkout node produce.mjs dispatch|render
// Download the narration artifact into WIND_VIDEO_CACHE/remote-narration first.
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
const cache=process.env.WIND_VIDEO_CACHE||'/private/tmp/cak-skyscraper-wind-20260930';
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
const job=createProject({category:'건축학',topic:brief.title,format:'short',duration:targetSeconds,direction:brief.direction,productionStyle:'cinematic'});
job.brief.workflow='explainer-v1';job.brief.narrationSpeed=brief.narrationSpeed;job.visualStyle=brief.visualStyle;job.id=brief.id;job.approved=true;job.voicePreference=brief.voice;
job.scenes=brief.scenes.map(s=>({...s,kind:s.kind,duration:targetSeconds/brief.scenes.length,prompt:s.prompt,animation:{title:s.title,layout:'contrast',elements:[{icon:'building',label:'건물',motion:'float'},{icon:'circle',label:'댐퍼',motion:'enter'}]}}));
const io={workDir:join(cache,'work'),readAsset:k=>readFile(join(cache,k)),writeAsset:(k,d)=>save(join(cache,k),d)};
const speech=[],originalSpeech=[];
const speed=brief.narrationSpeed??1;
if(!Number.isFinite(speed)||speed<.5||speed>2)throw Error("Invalid narration speed");
for(const [i,s] of job.scenes.entries()){
 const source=join(process.env.WIND_NARRATION_CACHE||'/private/tmp/cak-skyscraper-wind-20260930','remote-narration',`beat-${String(i).padStart(2,'0')}.mp3`);
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
 const scene=job.scenes.find(s=>s.id===clip.sceneId),cards=captionCards(scene.narration);
 const weights=cards.map(c=>Array.from(c.replace(/\s/gu,'')).length),sum=weights.reduce((a,b)=>a+b,0);
 const end=Math.ceil(speech[i]*30);let used=0;
 cards.forEach((text,j)=>{
  const startFrame=Math.round(used/sum*end);used+=weights[j];const endFrame=Math.round(used/sum*end);
  if(endFrame-startFrame<12)throw Error('Caption too brief');
  job.edit.captions.push({id:clip.id+'-caption-'+j,clipId:clip.id,source:'script',text,startFrame,endFrame,font:'gothic',size:48,x:50,y:50,position:'middle',background:true,backgroundColor:'#111713',backgroundOpacity:.65,color:'#f2efe6',outlineWidth:0,outlineColor:'#000000'});
 });
}
validateEdit(job.edit,job);

const C={paper:'#111713',ground:'#26332b',ink:'#e3e2d6',red:'#cca36d',mint:'#8caa99',blue:'#88a4a2',gold:'#b99854',navy:'#192a50',chalk:'#f4efdc'};
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const ease=t=>1-(1-Math.max(0,Math.min(1,t)))**3;
const text=(s,x,y,size=27,color=C.ink,anchor='middle',font='NanumGothic')=>`<text x="${x}" y="${y}" font-size="${size}" font-family="${font}" fill="${color}" text-anchor="${anchor}">${escape(s)}</text>`;
const path=(d,fill='none',stroke=C.ink,w=2)=>`<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const circle=(x,y,r,fill,stroke=C.ink)=>path(`M${x-r} ${y}C${x-r-3} ${y-r*.58} ${x-r*.55} ${y-r-2} ${x} ${y-r}S${x+r+2} ${y-r*.52} ${x+r} ${y}S${x+r*.48} ${y+r+2} ${x} ${y+r}S${x-r+1} ${y+r*.5} ${x-r} ${y}Z`,fill,stroke);
const show=(s,t,delay=0)=>`<g opacity="${ease((t-delay)/.6)}" transform="translate(0 ${(1-ease((t-delay)/.6))*24})">${s}</g>`;
const line=(a,b,c,d,color=C.ink,w=2)=>path(`M${a} ${b}Q${(a+c)/2+1} ${(b+d)/2-1} ${c} ${d}`,'none',color,w);

function pill(s,x,y,w=300){return `<rect x="${x-w/2}" y="${y-33}" width="${w}" height="52" rx="26" fill="#1f2a23" stroke="#738378"/>${text(s,x,y,23)}`;}
function arrow(x1,y1,x2,y2,color=C.red){
 const a=Math.atan2(y2-y1,x2-x1),h=11;
 return line(x1,y1,x2,y2,color,3)+path(`M${x2-h*Math.cos(a-.5)} ${y2-h*Math.sin(a-.5)}L${x2} ${y2}L${x2-h*Math.cos(a+.5)} ${y2-h*Math.sin(a+.5)}`,'none',color,3);
}
function tower(x,y,w,h,open=true){
 const top=w*.62;
 let shape=`<path d="M${x-w/2} ${y}L${x-top/2} ${y-h}H${x+top/2}L${x+w/2} ${y}Z" fill="#31473e" stroke="#95b4a3" stroke-width="2"/>`;
 for(let i=1;i<22;i++){const yy=y-h*i/22,ww=w-(w-top)*i/22;shape+=line(x-ww/2,yy,x+ww/2,yy,'#668d7b',.8);}
 if(open)shape+=`<path d="M${x-top*.36} ${y-h+22}H${x+top*.36}L${x+top*.25} ${y-h+96}H${x-top*.25}Z" fill="${C.paper}" stroke="${C.gold}" stroke-width="3"/>`;
 return shape;
}
function stream(x,y,t,w=500,color=C.blue){
 let a='';for(let i=0;i<10;i++){const p=(t*.23+i/10)%1,xx=x+p*w;a+=`<g opacity="${Math.sin(p*Math.PI)*.85}">${arrow(xx,y,xx+25,y,color)}</g>`;}return a;
}
function svg(scene,t,index){
 let body='',note='개념도 · 실제 풍속·압력·비율의 수치 시뮬레이션 아님';
 if(scene.visual==='pressure'){
  body=tower(360,570,150,280,false);
  for(let i=0;i<5;i++){const yy=340+i*43;body+=stream(50,yy,t,230);body+=`<path d="M90 ${yy}C270 ${yy} 235 245 370 240S515 ${yy} 650 ${yy}" fill="none" stroke="#698c80" stroke-width="2" opacity=".45"/>`;}
  body+=show(pill('외벽에 작용하는 압력',360,882,460),t,.3)+show(text('바람도 건물에 힘을 가합니다',360,1010,30),t,.7);
 }else if(scene.visual==='opening'){
  body=tower(360,560,230,300,true)+stream(72,322,t,570,C.gold)+stream(72,340,t+.2,570,C.gold);
  body+=show(text('상단 개구부',540,470,24,C.gold),t,.3)+arrow(525,445,414,350,C.gold);
  body+=show(pill('바람이 통과할 길',360,871,380),t,.5)+stream(92,1000,t,510)+show(text('압력을 줄이도록 설계',360,1100,31),t,1);
 }else if(scene.visual==='limits'){
  body=tower(360,548,128,258,true)+tower(170,548,92,145,false)+tower(549,548,106,183,false);
  const a=t*.5;body+=arrow(360+235*Math.cos(a),411+160*Math.sin(a),360+130*Math.cos(a),411+90*Math.sin(a),C.gold);
  body+=show(pill('개구부의 크기와 위치',360,840,470),t,.1)+show(pill('건물 전체의 형태',360,940,430),t,.5)+show(pill('주변 건물 · 바람 방향',360,1040,480),t,.9);
 }else{
  body=tower(360,568,215,295,true);
  const glow=.35+.3*Math.sin(t);body+=`<rect x="317" y="298" width="86" height="67" fill="#f9d591" opacity="${glow}"/>`+stream(80,331,t,555,C.gold);
  body+=show(text('비웠지만,',360,858,46,C.ink,'middle','Jua'),t,.2)+show(text('쓸모없는 공간은 아닙니다',360,928,38,C.gold,'middle','Jua'),t,.7)+show(pill('형태 + 바람에 대한 대응',360,1064,510),t,1.1);
 }
 const title=scene.title;
 const progress=(job.scenes.slice(0,index).reduce((a,s)=>a+s.duration,0)+t)/targetSeconds;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280"><rect width="720" height="1280" fill="${C.paper}"/>${text('일상에서 발견하는 건축',48,72,19,C.ink,'start')}${line(48,82,263,82,C.gold,4)}${text(String(index+1).padStart(2,'0')+' / 08',670,72,18,C.ink,'end')}${text(title,48,173,37,C.ink,'start','Jua')}${text(scene.subtitle,48,237,22,C.ink,'start')}${body}${text(note,360,1184,16,'#adbaae')}${text('원리 설명 · 자료: SWFC / Otis',48,1250,16,C.ink,'start')}<rect x="48" y="1267" width="${624*progress}" height="3" fill="${C.red}"/></svg>`;
}
const fontFiles=['NanumGothic-Regular.ttf','Jua-Regular.ttf','DoHyeon-Regular.ttf'].map(f=>join(app,'public',f));
const renderPng=(scene,t,i,width=1080)=>new Resvg(svg(scene,t,i),{fitTo:{mode:'width',value:width},font:{fontFiles,loadSystemFonts:false,defaultFontFamily:'NanumGothic'}}).render().asPng();
if(process.argv[2]==='preview'){
 for(let i=0;i<job.scenes.length;i++)await save(join(cache,`preview-${i}.png`),renderPng(job.scenes[i],3,i,540));
 console.log('Previews: '+cache);process.exit(0);
}

const {cloudHiggsfieldRunner}=await imp('studio-higgsfield-auth.mjs');
const {higgsfieldPlan,generateHiggsfieldScene}=await imp('studio-higgsfield.mjs');
const {runnerRequest}=await import(pathToFileURL(join(root,'apps/credential-broker/runner-client.mjs')));
const call=(path,body)=>runnerRequest('https://cak-credential-broker.guswhd1085.workers.dev',process.env.CAK_RUNNER_KEY_FILE||'/Users/admin/Library/Application Support/Shopshorts/credential-runner.jwk',path,body);
const run=cloudHiggsfieldRunner(call,process.env);
const receiptFile=join(cache,'media-receipts.json');
if(await exists(receiptFile))job.mediaJobs=JSON.parse(await readFile(receiptFile,'utf8'));
const checkpoint=async delta=>{if(delta.mediaJobs){job.mediaJobs=delta.mediaJobs;await save(receiptFile,JSON.stringify(delta.mediaJobs,null,2));}};
if(process.argv[2]==='cost'){
 let total=0;for(const scene of job.scenes.filter(s=>!['pressure','opening','limits','reveal'].includes(s.visual))){const p=higgsfieldPlan(scene,job.brief.aspect,job);const args=['generate','cost',p.model,'--prompt',p.prompt,'--aspect_ratio',p.aspect,'--resolution',p.resolution,...(scene.kind==='video'?['--duration',String(p.duration),'--mode','std','--generate_audio','false']:[])];const c=await run(args);if(!Number.isFinite(c.credits))throw Error('Missing cost');total+=c.credits;console.log(JSON.stringify({scene:scene.id,model:p.model,seconds:p.duration,credits:c.credits}));}console.log(JSON.stringify({totalCredits:total}));process.exit(0);
}

// Independent paid scenes run together. Every accepted ID remains durable for resume.
let receiptWrites=Promise.resolve();
const pending=job.scenes.filter(s=>!['pressure','opening','limits','reveal'].includes(s.visual));
const outcomes=await Promise.allSettled(pending.map(async scene=>{
 const assetPath=join(cache,`provider-${scene.id}.json`);
 if(await exists(assetPath)){const a=JSON.parse(await readFile(assetPath,'utf8'));await io.readAsset(a.key);return;}
 const sceneJob=structuredClone(job);
 const persist=async delta=>{
  job.mediaJobs ||= {};job.mediaJobs[scene.id]=delta.mediaJobs[scene.id];
  const snapshot=JSON.stringify(job.mediaJobs,null,2);
  receiptWrites=receiptWrites.then(()=>save(receiptFile,snapshot));await receiptWrites;
  console.log(`Scene ${scene.id}: ${delta.mediaJobs[scene.id].state}`);
 };
 const result=await generateHiggsfieldScene(sceneJob,scene,process.env,cache,persist,{run});
 const mediaKey=`provider/${scene.id}.mp4`;
 await io.writeAsset(mediaKey,result.data);
 await save(assetPath,JSON.stringify({key:mediaKey,kind:scene.kind,type:result.type,source:'ai',provider:result.provider,providerJobId:result.providerJobId,name:scene.title}));
 console.log(`Cinematic ${scene.id} downloaded`);
}));
await receiptWrites;
const failed=outcomes.find(r=>r.status==='rejected');if(failed)throw failed.reason;

const codeHash=createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex').slice(0,12);
for(const [i,scene] of job.scenes.entries()){
 const key=`custom/${scene.id}-${codeHash}-${frames[i]}.mp4`,target=join(cache,key);
 if(!['pressure','opening','limits','reveal'].includes(scene.visual)){
  const assetPath=join(cache,`provider-${scene.providerAssetId||scene.id}.json`);let asset;
  if(await exists(assetPath)){asset=JSON.parse(await readFile(assetPath,'utf8'));await io.readAsset(asset.key);}
  else{const result=await generateHiggsfieldScene(job,scene,process.env,cache,checkpoint,{run});const mediaKey=`provider/${scene.id}.${scene.kind==='image'?'png':'mp4'}`;await io.writeAsset(mediaKey,result.data);asset={key:mediaKey,kind:scene.kind,type:result.type,source:'ai',provider:result.provider,providerJobId:result.providerJobId,name:scene.title};await save(assetPath,JSON.stringify(asset));}
  if(scene.id==='s1'){
   const opening='provider/s1-opening-first.mp4';
   if(!await exists(join(cache,opening)))await command('ffmpeg',['-y','-v','error','-i',join(cache,asset.key),'-vf','reverse','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',join(cache,opening)],{});
   asset={...asset,key:opening,editorialTransform:'reverse camera move to reveal aperture immediately'};
  }
  job.assets[scene.id]=asset;console.log(`Cinematic ${i+1}/${job.scenes.length} ready`);continue;
 }
 if(!await exists(target)){
  await mkdir(dirname(target),{recursive:true});const temporary=target+'.pending.mp4';
  const p=spawn('ffmpeg',['-y','-v','error','-f','image2pipe','-framerate','30','-vcodec','png','-i','pipe:0','-an','-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',temporary],{stdio:['pipe','ignore','pipe']});
  let err='',failure;p.stderr.on('data',d=>err=(err+d).slice(-1500));p.stdin.on('error',e=>failure=e);
  const done=new Promise((ok,fail)=>{p.once('error',fail);p.once('close',c=>c?fail(Error(err)):ok());});done.catch(e=>failure=e);
  try{for(let f=0;f<frames[i];f++){if(failure)throw failure;if(!p.stdin.write(renderPng(scene,f/30,i)))await Promise.race([once(p.stdin,'drain'),done]);if(f%30===0)await new Promise(r=>setImmediate(r));}p.stdin.end();await done;await rename(temporary,target);}catch(e){p.kill('SIGKILL');await done.catch(()=>{});await rm(temporary,{force:true});throw e;}
 }
 job.assets[scene.id]={key,kind:'video',type:'video/mp4',source:'ai',provider:'original-sketch-animation',name:scene.title};console.log(`Animation ${i+1}/${job.scenes.length} · ${scene.duration.toFixed(2)}s`);
}
for(const [i,clip] of job.edit.clips.entries())if(!['pressure','opening','limits','reveal'].includes(job.scenes[i].visual))job.edit.captions.push({id:`ai-disclosure-${i}`,clipId:clip.id,source:'manual',text:i===5?'풍동 실험 개념 이미지 · AI 재현':'AI로 재현한 설명 영상',startFrame:0,endFrame:frames[i],font:'gothic',size:25,x:50,y:95,position:'bottom',background:false,color:'#ffffff',outlineWidth:1,outlineColor:'#000000'});
job.task={id:'render',action:'render'};
const result=await executeStudioTask(job,{},io,async()=>{});
// Original quiet harmonic bed; no reference soundtrack or licensed track reused.
const score=join(cache,'original-ambient.wav');
await command('ffmpeg',['-y','-v','error','-f','lavfi','-i',`aevalsrc=0.008*(sin(2*PI*130.8128*t)+0.6*sin(2*PI*195.9977*t)+0.35*sin(2*PI*311.127*t))*(0.65+0.35*sin(2*PI*0.07*t)^2):s=44100:d=${targetSeconds}`,'-af',`lowpass=f=950,afade=t=in:d=2,afade=t=out:st=${targetSeconds-4}:d=4`,'-ac','2',score],{});
await command('ffmpeg',['-y','-v','error','-i',join(cache,result.render.key),'-i',score,'-filter_complex','[0:a]loudnorm=I=-16:TP=-1.5:LRA=8,asplit=2[voice][control];[1:a][control]sidechaincompress=threshold=0.025:ratio=4:attack=30:release=500[bed];[voice][bed]amix=inputs=2:duration=first:normalize=0[a]','-map','0:v:0','-map','[a]','-c:v','copy','-c:a','aac','-ar','44100','-b:a','192k','-t',String(targetSeconds),'-movflags','+faststart',join(out,'skyscraper-wind.mp4')],{});
await save(join(out,'project.json'),JSON.stringify({...brief,duration:targetSeconds,mediaProvenance:job.mediaJobs,voiceName:brief.voiceName,narrationSpeed:speed,artifact:'skyscraper-wind.mp4',appPublished:false,scenes:job.scenes.map((s,i)=>({...s,frames:frames[i],originalSpeechSeconds:originalSpeech[i],measuredSpeechSeconds:speech[i]})),captions:job.edit.captions},null,2)+'\n');
console.log('COMPLETE: '+join(out,'skyscraper-wind.mp4'));
