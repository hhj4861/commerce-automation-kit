// One-off content recipe. Uses Shopshorts narration/rendering; does not modify the app.
// Run: CAK_ENGINE_ROOT=/path/to/checkout-with-animation node produce.mjs [narration|all]
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {join, dirname, resolve} from 'node:path';
import {mkdir, readFile, writeFile, access} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';

const out=dirname(fileURLToPath(import.meta.url));
const root=resolve(process.env.CAK_ENGINE_ROOT||join(out,'../../..'));
const app=join(root,'apps/shopshorts');
const require=createRequire(join(app,'package.json'));
const {Resvg}=require('@resvg/resvg-js');
const imp=p=>import(pathToFileURL(join(root,p)));
const {executeStudioTask,command}=await imp('apps/shopshorts/studio-runner.mjs');
const {createProject,validateEdit}=await imp('apps/shopshorts/lib/studio.js');
const {normalizeEdit}=await imp('apps/shopshorts/public/editor-model.js');
const {cinematicEdit}=await imp('apps/shopshorts/lib/cinematic-production.js');
const {narrationAsset}=await imp('apps/shopshorts/public/narration-audio.js');
const {runnerRequest}=await imp('apps/credential-broker/runner-client.mjs');
const cache=process.env.HONAM_VIDEO_CACHE||'/private/tmp/cak-honam-datacenter-20260929';
await mkdir(cache,{recursive:true});
const exists=async p=>access(p).then(()=>true,()=>false);
const save=async(p,v)=>{await mkdir(dirname(p),{recursive:true});await writeFile(p,v);};
const io={workDir:join(cache,'work'),readAsset:k=>readFile(join(cache,k)),writeAsset:(k,d)=>save(join(cache,k),d)};
const voice='BbsagRO6ohd8MKPS2Ob0';
const specs=[
 ['왜 호남인가','답은 땅보다, 전력','메가 데이터센터, 왜 호남일까요? 답은 땅값보다 전기에 있습니다.','intro'],
 ['잠들지 않는 건물','24시간, 전력과 냉각','서버는 밤낮없이 전기를 쓰고 열을 냅니다. 전력과 냉각이 먼저죠.','server'],
 ['호남의 기회','재생에너지와 저장','호남의 기회는 재생에너지입니다. 전남은 출력 제한을 줄일 저장장치도 추진하죠.','energy'],
 ['발상을 뒤집으면','데이터를 전력 곁으로','전기를 멀리 보내는 대신, 데이터를 전기가 있는 곳으로 옮기는 겁니다.','shift'],
 ['건축의 해법','하나의 인프라 캠퍼스','서버동과 변전소, 냉각 설비를 하나의 캠퍼스로 설계할 기회도 생깁니다.','campus'],
 ['집중에서 분산으로','전력 수요도 나누기','이런 입지 분산은 수도권에 몰린 전력 수요를 나누는 방향이기도 하죠.','network'],
 ['입지에는 조건이 있다','반드시 확인할 세 가지','물론 조건은 있습니다. 계통 연결, 냉각과 용수, 통신망을 검증해야 합니다.','check'],
 ['호남을 보는 새 기준','에너지와 건축을 함께','호남이 주목받는 이유. 땅만 고르는 게 아니라, 에너지와 건축을 함께 설계하기 때문입니다.','final'],
];
const job=createProject({category:'건축학',topic:'메가 데이터센터가 호남에 위치해야 하는 이유',format:'short',duration:60,direction:'공식 자료 기반의 건축·에너지 입지 해설. 호남의 기회와 필수 검증 조건을 함께 설명한다.',productionStyle:'animation'});
job.id='honam-datacenter-20260929';job.approved=true;job.voicePreference=voice;
job.scenes=specs.map(([title,subtitle,narration,visual],i)=>({id:`scene-${i+1}`,kind:'video',duration:7.5,narration,prompt:`Original animated architectural diagram: ${visual}. ${title}. ${subtitle}. No actual site or built project represented.`,animation:{title,layout:'sequence',elements:[{icon:'home',label:'데이터센터',motion:'enter'},{icon:'star',label:'전력과 인프라',motion:'pulse'}]},visual,title,subtitle}));
job.edit=normalizeEdit(job);
if(await exists(join(cache,'assets.json')))job.assets=JSON.parse(await readFile(join(cache,'assets.json'),'utf8'));
const checkpoint=async patch=>{Object.assign(job,patch);await save(join(cache,'assets.json'),JSON.stringify(job.assets));};
const needed=job.scenes.some(s=>!narrationAsset(job,s,voice));
let env={};
if(needed){
 const {values}=await runnerRequest(process.env.CAK_BROKER_URL||'https://cak-credential-broker.guswhd1085.workers.dev',process.env.CAK_RUNNER_KEY_FILE||join(process.env.HOME,'Library/Application Support/Shopshorts/credential-runner.jwk'),'/runner/secrets',{});
 if(!values.ELEVENLABS_API_KEY)throw Error('Cloudflare ElevenLabs secret is not configured');
 env={ELEVENLABS_API_KEY:values.ELEVENLABS_API_KEY};
}
job.task={id:'narration',action:'narration'};
await checkpoint(await executeStudioTask(job,env,io,async patch=>{await checkpoint(patch);console.log(`Narration ${Object.keys(job.assets).filter(k=>k.startsWith('narration-')).length}/8`);}));
env={};
const speech=job.scenes.map(s=>narrationAsset(job,s,voice).duration);
console.log(JSON.stringify({speechSeconds:speech,totalSpeech:speech.reduce((a,b)=>a+b,0)}));
if(process.argv[2]==='narration')process.exit(0);
// Allocate exactly 1800 frames. Never truncate or time-stretch speech.
const minimum=speech.map(d=>Math.ceil((d+.18)*30));
let remaining=1800-minimum.reduce((a,b)=>a+b,0);
if(remaining<0)throw Error('Narration exceeds 60 seconds: shorten script before rendering');
const frames=minimum.map((f,i)=>f+Math.floor(remaining/8)+(i<remaining%8?1:0));
job.scenes.forEach((s,i)=>s.duration=frames[i]/30);
job.edit=null;job.edit=cinematicEdit(job);
job.edit.captions=job.edit.captions.map(c=>({...c,size:48,y:92,x:50,background:false,outlineWidth:1,outlineColor:'#112c35'}));
validateEdit(job.edit,job);

// Bespoke vector artwork for this episode; all shapes and motion are original.
const C={bg:'#102b35',white:'#f5f2e7',muted:'#9bb4b8',mint:'#91e2c2',amber:'#ffc678',line:'#2b4852',blue:'#82bfe4'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const text=(s,x,y,size=26,color=C.white,anchor='start',font='NanumGothic')=>`<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" fill="${color}" text-anchor="${anchor}">${esc(s)}</text>`;
const line=(x1,y1,x2,y2,color=C.mint,width=3,dash='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
const ease=v=>1-(1-Math.max(0,Math.min(1,v)))**3;
const reveal=(body,t,delay=0)=>`<g opacity="${ease((t-delay)/.65)}" transform="translate(0 ${(1-ease((t-delay)/.65))*24})">${body}</g>`;
function building(x,y,w=280,h=160,t=0,label='DATA CENTER'){
 const depth=w*.16;
 let b=`<polygon points="${x},${y} ${x+depth},${y-depth} ${x+w+depth},${y-depth} ${x+w},${y}" fill="#4d727b" stroke="${C.mint}"/><polygon points="${x+w},${y} ${x+w+depth},${y-depth} ${x+w+depth},${y+h-depth} ${x+w},${y+h}" fill="#193e49" stroke="${C.mint}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#28525c" stroke="${C.mint}" stroke-width="2"/>`;
 for(let j=0;j<3;j++)for(let i=0;i<6;i++)b+=`<rect x="${x+18+i*(w-30)/6}" y="${y+25+j*30}" width="${(w-40)/8}" height="12" fill="${(i+j+Math.floor(t*2))%4===0?C.amber:C.blue}" opacity="${.5+((i+j)%2)*.3}"/>`;
 return b+text(label,x+15,y+h-14,14,C.white);
}
function solar(x,y,s=1){return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 10L115 10L140 90H25Z" fill="#254f61" stroke="${C.blue}" stroke-width="3"/>${[1,2,3].map(i=>line(29*i,10,25+29*i,90,C.blue,1)).join('')}${[1,2].map(i=>line(i*8,10+i*27,115+i*8,10+i*27,C.blue,1)).join('')}${line(47,90,47,120,C.muted)}${line(116,90,116,120,C.muted)}</g>`;}
function turbine(x,y,t,s=1){return `<g transform="translate(${x} ${y}) scale(${s})">${line(0,0,0,145,C.white,6)}<g transform="rotate(${t*27})">${[0,120,240].map(a=>`<path transform="rotate(${a})" d="M0 0L7-80Q-8-95-9-63Z" fill="${C.white}"/>`).join('')}</g><circle r="9" fill="${C.mint}"/></g>`;}
function battery(x,y,t){return `<g transform="translate(${x} ${y})"><rect width="110" height="160" rx="12" fill="#204650" stroke="${C.mint}" stroke-width="3"/><rect x="35" y="-10" width="40" height="10" fill="${C.mint}"/>${[0,1,2,3].map(i=>`<rect x="15" y="${118-i*30}" width="80" height="20" rx="3" fill="${C.mint}" opacity="${i<1+Math.floor(t*1.2)%4?.9:.2}"/>`).join('')}</g>`;}
function flow(x1,y1,x2,y2,t,color=C.mint){let s=line(x1,y1,x2,y2,color,2,'6 8');for(let i=0;i<4;i++){const p=(t*.23+i/4)%1;s+=`<circle cx="${x1+(x2-x1)*p}" cy="${y1+(y2-y1)*p}" r="5" fill="${color}"/>`;}return s;}
function chip(x,y,title,sub,t,delay){return reveal(`<rect x="${x}" y="${y}" width="190" height="116" rx="16" fill="#204550" stroke="${C.line}"/>${text(title,x+20,y+44,26,C.mint)}${text(sub,x+20,y+82,18,C.muted)}`,t,delay);}
function svg(scene,t,index){
 let diagram='';
 if(scene.visual==='intro'||scene.visual==='final'){
  diagram+=`<ellipse cx="365" cy="828" rx="278" ry="95" fill="#193e49"/>`;
  diagram+=reveal(building(170,575,335,200,t),t,.1);
  diagram+=reveal(turbine(130,465,t,.8)+solar(430,810,1.2),t,.7);
  diagram+=flow(142,618,165,700,t)+flow(485,830,420,785,t);
  diagram+=text('HONAM',360,980,62,C.mint,'middle','Do Hyeon');
  diagram+=text(scene.visual==='intro'?'메가 데이터센터의 입지를 묻다':'건물의 주소를 넘어, 에너지의 주소로',360,1028,24,C.white,'middle');
 }else if(scene.visual==='server'){
  for(let i=0;i<3;i++){
   const x=90+i*185;
   let rack=`<rect x="${x}" y="450" width="150" height="355" rx="14" fill="#234a56" stroke="${C.blue}" stroke-width="2"/>`;
   for(let j=0;j<7;j++)rack+=`<rect x="${x+15}" y="${472+j*43}" width="120" height="29" rx="3" fill="#102b35"/><circle cx="${x+115}" cy="${486+j*43}" r="4" fill="${(j+i+Math.floor(t*3))%3?C.mint:C.amber}"/>`;
   diagram+=reveal(rack,t,i*.17);
  }
  diagram+=flow(105,855,615,855,t,C.blue)+text('전력 공급',105,920,28,C.mint)+text('열을 빼내는 냉각',380,920,28,C.blue);
  diagram+=text('24 / 7',360,1045,85,C.amber,'middle','Do Hyeon');
 }else if(scene.visual==='energy'){
  diagram+=reveal(turbine(180,505,t,1.15)+solar(390,535,1.2),t,.1);
  diagram+=flow(200,695,335,805,t)+flow(490,695,390,805,t);
  diagram+=reveal(battery(307,820,t),t,.8);
  diagram+=text('발전',150,745,26,C.white)+text('저장',443,908,26,C.mint);
  diagram+=text('전남 ESS 확충 추진',360,1038,30,C.mint,'middle');
  diagram+=text('출력 제한 완화 목적 · 추진 단계',360,1080,20,C.muted,'middle');
 }else if(scene.visual==='shift'){
  diagram+=text('전력 생산지',95,458,27,C.mint)+text('데이터 수요',437,458,27,C.white);
  diagram+=solar(85,520,1.1)+building(425,542,150,133,t);
  diagram+=flow(252,592,417,592,t,C.amber);
  diagram+=text('전력만 멀리 보내기',360,747,29,C.muted,'middle');
  diagram+=reveal(`<rect x="70" y="810" width="580" height="258" rx="28" fill="#244e54" stroke="${C.mint}"/>${solar(102,893,.75)}${building(330,879,205,130,t)}${flow(223,957,327,957,t)}${text('전력 곁으로 데이터센터를',360,1040,30,C.mint,'middle')}`,t,1.4);
 }else if(scene.visual==='campus'){
  diagram+=`<path d="M70 780L345 430L665 640L395 1010Z" fill="#183e49" stroke="${C.muted}" stroke-dasharray="7 8"/>`;
  diagram+=reveal(building(255,595,245,168,t,'SERVER'),t,.1);
  diagram+=reveal(building(116,793,140,110,t,'POWER'),t,.8);
  diagram+=reveal(building(461,822,140,110,t,'COOLING'),t,1.5);
  diagram+=flow(235,808,306,771,t,C.amber)+flow(464,800,496,820,t,C.blue);
  diagram+=text('서버동',395,530,28,C.white,'middle')+text('변전소',190,968,26,C.amber,'middle')+text('냉각 설비',535,989,26,C.blue,'middle');
  diagram+=text('통합 배치 개념도 · 실제 시설 조감도 아님',360,1080,19,C.muted,'middle');
 }else if(scene.visual==='network'){
  diagram+=text('수도권 집중',360,468,30,C.amber,'middle');
  diagram+=building(272,527,150,120,t);
  for(const [i,[x,y,label]] of [[120,895,'지역 A'],[360,976,'호남'],[596,895,'지역 B']].entries()){
   diagram+=reveal(flow(360,700,x,y-45,t)+`<circle cx="${x}" cy="${y}" r="58" fill="#24515b" stroke="${i===1?C.mint:C.blue}" stroke-width="2"/>${text(label,x,y+9,24,C.white,'middle')}`,t,.6+i*.5);
  }
  diagram+=text('지역 분산 개념도',360,1090,21,C.muted,'middle');
 }else if(scene.visual==='check'){
  const rows=[['01','계통 연결','접속 가능 용량 · 전력 신뢰도'],['02','냉각과 용수','열 관리 · 물 사용 계획'],['03','통신망','연결 경로 · 지연시간']];
  rows.forEach(([n,a,b],i)=>{const y=460+i*190;diagram+=reveal(`<rect x="64" y="${y}" width="592" height="152" rx="20" fill="#214752"/>${text(n,92,y+60,32,C.mint,'start','Do Hyeon')}${text(a,165,y+61,34,C.white)}${text(b,165,y+110,23,C.muted)}`,t,i*.85);});
  diagram+=text('재생에너지 ≠ 상시 전력 공급 보장',360,1090,24,C.amber,'middle');
 }
 const progress=(job.scenes.slice(0,index).reduce((a,s)=>a+s.duration,0)+t)/60;
 const grid=`<pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#24424c" stroke-width=".6"/></pattern>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280"><defs>${grid}</defs><rect width="720" height="1280" fill="${C.bg}"/><rect width="720" height="1280" fill="url(#grid)"/><rect x="48" y="76" width="36" height="5" fill="${C.mint}"/>${text('건축의 시선  /  60초',100,88,20,C.muted)}${text(String(index+1).padStart(2,'0')+' / 08',672,88,19,C.muted,'end')}${reveal(text(scene.title,48,194,43,C.white,'start','Do Hyeon')+text(scene.subtitle,48,259,42,C.mint,'start','Do Hyeon'),t)}${diagram}<rect y="1104" width="720" height="176" fill="${C.bg}"/>${text('AI 애니메이션 · 입지 해설',48,1240,16,C.muted)}<rect x="48" y="1259" width="${624*progress}" height="3" fill="${C.mint}"/></svg>`;
}
const fonts=['NanumGothic-Regular.ttf','DoHyeon-Regular.ttf'].map(f=>join(app,'public',f));
async function renderScene(scene,index){
 const signature=createHash('sha256').update(JSON.stringify([scene,svg.toString(),building.toString()])).digest('hex').slice(0,12);
 const key=`custom/${scene.id}-${signature}.mp4`,target=join(cache,key);
 if(!await exists(target)){
  await mkdir(dirname(target),{recursive:true});
  const child=spawn('ffmpeg',['-y','-v','error','-f','image2pipe','-framerate','30','-vcodec','png','-i','pipe:0','-an','-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',target],{stdio:['pipe','ignore','pipe']});
  let stderr='',failure;child.stderr.on('data',d=>stderr=(stderr+d).slice(-2000));child.stdin.on('error',e=>failure=e);
  const done=new Promise((ok,fail)=>{child.once('error',fail);child.once('close',code=>code?fail(Error(stderr)):ok());});done.catch(e=>failure=e);
  for(let f=0;f<frames[index];f++){
   if(failure)throw failure;
   const data=new Resvg(svg(scene,f/30,index),{fitTo:{mode:'width',value:1080},font:{fontFiles:fonts,loadSystemFonts:false,defaultFontFamily:'NanumGothic'}}).render().asPng();
   if(!child.stdin.write(data))await Promise.race([once(child.stdin,'drain'),done]);
   if(f%30===0)await new Promise(r=>setImmediate(r));
  }
  child.stdin.end();await done;
 }
 job.assets[scene.id]={key,kind:'video',type:'video/mp4',source:'ai',provider:'original-svg-episode',name:scene.title};
 console.log(`Animation ${index+1}/8 · ${scene.duration.toFixed(2)}s`);
}
for(let i=0;i<job.scenes.length;i++)await renderScene(job.scenes[i],i);
await checkpoint({assets:job.assets});
job.task={id:'render',action:'render'};
const result=await executeStudioTask(job,{},io,checkpoint);
// Consistent voice loudness; no library music or third-party footage.
await command('ffmpeg',['-y','-v','error','-i',join(cache,result.render.key),'-c:v','copy','-af','loudnorm=I=-16:TP=-1.5:LRA=8','-c:a','aac','-ar','44100','-b:a','192k','-t','60','-movflags','+faststart',join(out,'honam-datacenter-60s.mp4')],{});
const manifest={title:job.title,category:'건축학',format:'short',aspect:'9:16',duration:60,voice:{name:'진건 · 차분한 남성',provider:'ElevenLabs',id:voice},productionStyle:'animation',artifact:'honam-datacenter-60s.mp4',appPublished:false,recipe:'produce.mjs',engineCommit:'88f804c4bdf4123dc50db3ad8a2e8d8c1dd2a928',visuals:'Original bespoke SVG episode artwork; not the generic in-app icon renderer',scenes:job.scenes.map((s,i)=>({...s,measuredSpeechSeconds:speech[i],frames:frames[i]})),captions:job.edit.captions};
await save(join(out,'project.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('COMPLETE: '+join(out,'honam-datacenter-60s.mp4'));
