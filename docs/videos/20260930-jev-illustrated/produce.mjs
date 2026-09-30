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
const cache=process.env.JEV_VIDEO_CACHE||'/private/tmp/cak-jev-illustrated-20260930';
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

import {illustratedFrame} from './illustrations.mjs';
const svg=(scene,t,index)=>illustratedFrame(scene,t,index,job.scenes,targetSeconds);
const fontFiles=['NanumGothic-Regular.ttf','Jua-Regular.ttf','DoHyeon-Regular.ttf'].map(f=>join(app,'public',f));
const renderPng=(scene,t,i,width=1080)=>new Resvg(svg(scene,t,i),{fitTo:{mode:'width',value:width},font:{fontFiles,loadSystemFonts:false,defaultFontFamily:'NanumGothic'}}).render().asPng();
if(process.argv[2]==='preview'){
 for(let i=0;i<job.scenes.length;i++)await save(join(cache,`preview-${i}.png`),renderPng(job.scenes[i],3,i,540));
 console.log('Previews: '+cache);process.exit(0);
}

const codeHash=createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).update(await readFile(join(out,'illustrations.mjs'))).update(JSON.stringify(brief.scenes)).digest('hex').slice(0,12);
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
