// Episode-specific original SVG animation. No source-video pixels or audio reused.
// CAK_ENGINE_ROOT=/path/to/animation-enabled-checkout node produce.mjs dispatch|render
// Download the narration artifact into TAIPEI_CINEMATIC_CACHE/remote-narration first.
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
const cache=process.env.TAIPEI_CINEMATIC_CACHE||'/private/tmp/cak-taipei101-cinematic-20260930';
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
const job=createProject({category:'건축학',topic:brief.title,format:'short',duration:targetSeconds,direction:'타이베이 101 동조질량감쇠기의 원리를 과장된 도해로 설명',productionStyle:'cinematic'});
job.visualStyle=brief.visualStyle;job.id=brief.id;job.approved=true;job.voicePreference=brief.voice;
job.scenes=brief.scenes.map(s=>({...s,kind:s.kind,duration:targetSeconds/brief.scenes.length,prompt:s.prompt,animation:{title:s.title,layout:'contrast',elements:[{icon:'building',label:'건물',motion:'float'},{icon:'circle',label:'댐퍼',motion:'enter'}]}}));
const io={workDir:join(cache,'work'),readAsset:k=>readFile(join(cache,k)),writeAsset:(k,d)=>save(join(cache,k),d)};
const speech=[],originalSpeech=[];
const speed=brief.narrationSpeed??1;
if(!Number.isFinite(speed)||speed<.5||speed>2)throw Error("Invalid narration speed");
for(const [i,s] of job.scenes.entries()){
 const source=join(process.env.TAIPEI_NARRATION_CACHE||'/private/tmp/cak-taipei101-damper-20260929','remote-narration',`beat-${String(i).padStart(2,'0')}.mp3`);
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
function ball(x,y,r){
 return `<g>${circle(x,y,r,C.gold)}${[-.65,-.35,0,.35,.65].map(k=>{const w=Math.sqrt(1-k*k)*r;return path(`M${x-w} ${y+k*r}Q${x} ${y+k*r+7} ${x+w} ${y+k*r}`,'none','#a88439',1.5)}).join('')}<ellipse cx="${x-r*.3}" cy="${y-r*.32}" rx="${r*.16}" ry="${r*.28}" fill="#fff5c9" opacity=".5"/></g>`;
}
function tower(x,base,h,t,amp=12,mark=false){
 const offset=Math.sin(t*2)*amp,k=-offset/h*180/Math.PI,w=h*.29;
 let b=path(`M${-w*.37} 0L${-w*.37} ${-h*.13}L${w*.37} ${-h*.13}L${w*.37} 0Z`,C.mint);
 for(let i=0;i<8;i++){
  const y=-h*.13-i*h*.092,tw=w*(1-i*.053);
  b+=path(`M${-tw/2} ${y}L${-tw*.59} ${y-h*.091}L${tw*.59} ${y-h*.091}L${tw/2} ${y}Z`,i%2?C.mint:'#b7cfbb');
  b+=line(-tw*.48,y-h*.045,tw*.48,y-h*.045,'#779788',1);
 }
 b+=path(`M-10 ${-h*.87}V${-h*.95}H10V${-h*.87}`,C.mint)+line(0,-h*.95,0,-h*1.04);
 if(mark)b+=circle(0,-h*.72,h*.047,C.gold);
 return line(x-w*.85,base,x+w*.85,base,'#9c987f',2)+`<g transform="translate(${x} ${base}) skewX(${k})">${b}</g>`;
}
function wind(x,y,t,w=140){
 return [0,1,2].map((i)=>{const phase=(t*.65+i*.28)%1,xx=x+phase*w*.35;return `<g opacity="${.35+.6*Math.sin(Math.PI*phase)}">${path(`M${xx} ${y+i*36}Q${xx+w*.5} ${y+i*36-17} ${xx+w} ${y+i*36}`,'none',C.blue,3)}${arrow(xx+w-18,y+i*36,xx+w,y+i*36,C.blue)}</g>`}).join('');
}
function piston(x1,y1,x2,y2,size=1){
 const l=Math.hypot(x2-x1,y2-y1),a=Math.atan2(y2-y1,x2-x1)*180/Math.PI;
 return `<g transform="translate(${x1} ${y1}) rotate(${a})">${line(0,0,l,0,'#777563',5*size)}<rect x="${l*.2}" y="${-9*size}" width="${l*.43}" height="${18*size}" rx="${4*size}" fill="${C.red}" stroke="${C.ink}" stroke-width="2"/>${line(l*.38,-8*size,l*.38,8*size,C.ink,2)}${circle(0,0,4*size,C.paper)}${circle(l,0,4*size,C.paper)}</g>`;
}
function cutaway(x,y,t,scale=1,{damping=true}={}){
 const frame=Math.sin(t*2)*19,bx=-Math.sin(t*2-.5)*24,by=25+Math.abs(bx)*.035;
 return `<g transform="translate(${x} ${y}) scale(${scale})">${path(`M${frame-158} 112V-126H${frame+158}V112`, '#26332b','#807e6b',4)}${path(`M${frame-143} 105V-109H${frame+143}V105`,C.paper,'#aaa68f',2)}${line(frame-173,112,frame+173,112,C.ink,4)}${[-40,40].map(dx=>line(frame+dx,-108,bx+dx*.7,by-49,'#686858',3)).join('')}${damping?piston(frame-126,101,bx-39,by+48)+piston(frame+126,101,bx+39,by+48):''}${ball(bx,by,68)}${line(frame-170,-126,frame+170,-126,C.ink,4)}</g>`;
}
function person(x,y,t){
 const sway=Math.sin(t*2)*8;
 return `<g transform="translate(${x+sway} ${y}) rotate(${sway*.5})">${path('M-30 0Q-39 30-27 74H27Q37 30 30 0Z',C.mint)}${circle(0,-27,34,C.paper)}${circle(-11,-29,2,C.ink)}${circle(11,-29,2,C.ink)}${path('M-8-10Q0-17 8-10')}${line(-17,74,-23,113)}${line(17,74,23,113)}${path('M-32 16L-62-9M32 16L62-9')}</g>`;
}
function wave(x,y,w,h,t,color,decay=0){
 const pts=Array.from({length:101},(_,i)=>{const u=i/100;return `${i?'L':'M'}${x+u*w} ${y+Math.sin(u*Math.PI*5-t*2)*h*Math.exp(-decay*u)}`}).join('');
 return line(x,y,x+w,y,'#c4bda4',1)+path(pts,'none',color,3);
}
function svg(scene,t,index){
 let body='',note='원리 설명 · 움직임과 비율 과장';
 if(scene.visual==='hook'){
  body=tower(181,549,240,t,8,true)+show(text('건물 속에',492,321,25),t)+ball(492+Math.sin(t*2)*15,427,95);
  body+=show(text('660',325,913,124,C.ink,'middle','Do Hyeon')+text('톤',501,905,47,C.ink,'middle','Jua'),t,.15)+show(pill('무겁게 하려고 넣었을까?',360,1030,450),t,.8);
 }else if(scene.visual==='wind'){
  body=wind(105,352,t,150)+tower(420,552,247,t,26);
  body+=person(233,905,t)+wave(363,898,229,34,t,C.red)+show(text('구조의 안전 + 사람의 편안함',360,1090,29,C.ink,'middle','Jua'),t,.8);
 }else if(scene.visual==='sphere'){
  const bx=360+Math.sin(t*1.5)*10;
  body=line(315,286,bx-35,334)+line(405,286,bx+35,334)+ball(bx,428,101)+text('약 5.5 m',553,439,24)+line(503,330,503,526,C.ink,2)+line(495,330,511,330)+line(495,526,511,526);
  body+=Array.from({length:7},(_,i)=>{const y=847+i*21,dx=(1-ease(t/2))*i*13;return `<ellipse cx="${291+dx}" cy="${y}" rx="105" ry="21" fill="${i%2?C.gold:'#d9b456'}" stroke="#887343" stroke-width="2"/>`}).join('');
  body+=show(text('41장',524,910,51,C.ink,'middle','Do Hyeon')+text('강철판을 겹쳐',527,960,23),t,.5);
  note='TAIPEI 101 공식 자료 · 무게 660톤, 지름 약 5.5m';
 }else if(scene.visual==='relative'){
  body=cutaway(360,425,t,1)+show(text('건물',143,304,23,C.ink)+text('쇠공',569,451,23,C.ink),t);
  body+=show(pill('건물과 공 사이의 상대운동',360,830,490),t,.3)+arrow(185+Math.sin(t*2)*25,962,299+Math.sin(t*2)*25,962,C.mint)+arrow(537-Math.sin(t*2)*25,962,423-Math.sin(t*2)*25,962,C.gold)+text('무게 + 움직임의 설계',360,1085,32,C.ink,'middle','Jua');
 }else if(scene.visual==='tuning'){
  body=cutaway(360,421,t,1)+text('TMD',575,354,29,C.red,'middle','Do Hyeon');
  body+=text('건물의 특성에 맞춘 주기',360,816,30,C.ink,'middle','Jua')+wave(125,917,470,43,t,C.mint)+wave(125,1038,470,43,t+.9,C.gold)+text('모터로 억지로 미는 장치가 아닙니다',360,1126,22);
 }else if(scene.visual==='damper'){
  body=cutaway(360,420,t,1)+show(text('아래의 유압 댐퍼',360,297,26,C.red),t);
  const end=529+Math.sin(t*2)*33;
  body+=piston(171,924,end,924,3)+show(text('움직임에 저항',360,812,32,C.ink,'middle','Jua'),t,.15);
  body+=[0,1,2].map(i=>{const phase=(t*.7+i*.3)%1;return `<g opacity="${1-phase}">${path(`M${281+i*41} ${896-phase*46}q-9-12 0-24q9-12 0-24`,'none',C.red,2)}</g>`}).join('');
  body+=show(pill('진동 에너지 → 열',360,1065,390),t,.8);
 }else if(scene.visual==='compare'){
  body=tower(196,550,245,t,30)+tower(523,550,245,t,10,true)+text('감쇠가 작을 때',196,290,23)+text('감쇠 장치 활용',523,290,23);
  body+=wave(91,851,210,42,t,C.red)+wave(417,851,210,15,t,C.mint)+show(text('흔들림을 줄여',360,989,39,C.ink,'middle','Jua')+text('더 편안하게',360,1050,39,C.ink,'middle','Jua'),t,.7);
  note='원리 비교 도해 · 실제 진폭·감소율 측정값 아님';
 }else{
  body=cutaway(360,425,t,1)+show(text('일부는 움직이고',360,843,42,C.ink,'middle','Jua'),t,.1)+show(text('전체는 덜 흔들리게',360,925,42,C.ink,'middle','Jua'),t,.65)+show(pill('건축은 움직임까지 설계합니다',360,1069,531),t,1.4);
 }
 const titleChars=Array.from(scene.title),titleLines=[];while(titleChars.length)titleLines.push(titleChars.splice(0,18).join(''));
 const head=titleLines.map((l,i)=>text(l,48,173+i*51,40,C.ink,'start','Jua')).join('');
 const subtitleY=titleLines.length>1?284:237;
 const progress=(job.scenes.slice(0,index).reduce((a,s)=>a+s.duration,0)+t)/targetSeconds;
 const speckles=Array.from({length:90},(_,i)=>`<circle cx="${(i*163+29)%720}" cy="${(i*109+47)%1280}" r="${i%3*.3+.3}" fill="${C.ink}" opacity=".09"/>`).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280"><rect width="720" height="1280" fill="${C.paper}"/>${speckles}${text('일상에서 발견하는 건축',48,72,19,C.ink,'start')}${line(48,82,263,82,C.gold,4)}${text(String(index+1).padStart(2,'0')+' / '+String(job.scenes.length).padStart(2,'0'),670,72,18,C.ink,'end')}${head}${text(scene.subtitle,48,subtitleY,22,C.ink,'start')}${body}${text(note,360,1184,17,'#adbaae')}${text('AI 재현 · 자료: TAIPEI 101 공식 전망대',48,1250,15,C.ink,'start')}<rect x="48" y="1267" width="${624*progress}" height="3" fill="${C.red}"/></svg>`;
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
 let total=0;for(const scene of job.scenes.filter(s=>!['relative','tuning','compare'].includes(s.visual))){const p=higgsfieldPlan(scene,job.brief.aspect,job);const args=['generate','cost',p.model,'--prompt',p.prompt,'--aspect_ratio',p.aspect,'--resolution',p.resolution,...(scene.kind==='video'?['--duration',String(p.duration),'--mode','std','--generate_audio','false']:[])];const c=await run(args);if(!Number.isFinite(c.credits))throw Error('Missing cost');total+=c.credits;console.log(JSON.stringify({scene:scene.id,model:p.model,seconds:p.duration,credits:c.credits}));}console.log(JSON.stringify({totalCredits:total}));process.exit(0);
}

const codeHash=createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex').slice(0,12);
for(const [i,scene] of job.scenes.entries()){
 const key=`custom/${scene.id}-${codeHash}-${frames[i]}.mp4`,target=join(cache,key);
 if(!['relative','tuning','compare'].includes(scene.visual)){
  const assetPath=join(cache,`provider-${scene.providerAssetId||scene.id}.json`);let asset;
  if(await exists(assetPath)){asset=JSON.parse(await readFile(assetPath,'utf8'));await io.readAsset(asset.key);}
  else{const result=await generateHiggsfieldScene(job,scene,process.env,cache,checkpoint,{run});const mediaKey=`provider/${scene.id}.${scene.kind==='image'?'png':'mp4'}`;await io.writeAsset(mediaKey,result.data);asset={key:mediaKey,kind:scene.kind,type:result.type,source:'ai',provider:result.provider,providerJobId:result.providerJobId,name:scene.title};await save(assetPath,JSON.stringify(asset));}
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
for(const [i,clip] of job.edit.clips.entries())if(!['relative','tuning','compare'].includes(job.scenes[i].visual))job.edit.captions.push({id:`ai-disclosure-${i}`,clipId:clip.id,source:'manual',text:i===5?'유압 댐퍼의 개념 이미지 · AI 재현':'AI로 재현한 설명 영상',startFrame:0,endFrame:frames[i],font:'gothic',size:25,x:50,y:95,position:'bottom',background:false,color:'#ffffff',outlineWidth:1,outlineColor:'#000000'});
job.task={id:'render',action:'render'};
const result=await executeStudioTask(job,{},io,async()=>{});
// Original quiet harmonic bed; no reference soundtrack or licensed track reused.
const score=join(cache,'original-ambient.wav');
await command('ffmpeg',['-y','-v','error','-f','lavfi','-i',`aevalsrc=0.008*(sin(2*PI*130.8128*t)+0.6*sin(2*PI*195.9977*t)+0.35*sin(2*PI*311.127*t))*(0.65+0.35*sin(2*PI*0.07*t)^2):s=44100:d=${targetSeconds}`,'-af','lowpass=f=950,afade=t=in:d=2,afade=t=out:st=58:d=4','-ac','2',score],{});
await command('ffmpeg',['-y','-v','error','-i',join(cache,result.render.key),'-i',score,'-filter_complex','[0:a]loudnorm=I=-16:TP=-1.5:LRA=8,asplit=2[voice][control];[1:a][control]sidechaincompress=threshold=0.025:ratio=4:attack=30:release=500[bed];[voice][bed]amix=inputs=2:duration=first:normalize=0[a]','-map','0:v:0','-map','[a]','-c:v','copy','-c:a','aac','-ar','44100','-b:a','192k','-t',String(targetSeconds),'-movflags','+faststart',join(out,'taipei101-cinematic.mp4')],{});
await save(join(out,'project.json'),JSON.stringify({...brief,voiceName:brief.voiceName,narrationSpeed:speed,artifact:'taipei101-cinematic.mp4',appPublished:false,scenes:job.scenes.map((s,i)=>({...s,frames:frames[i],originalSpeechSeconds:originalSpeech[i],measuredSpeechSeconds:speech[i]})),captions:job.edit.captions},null,2)+'\n');
console.log('COMPLETE: '+join(out,'taipei101-cinematic.mp4'));
