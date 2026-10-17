import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),here=dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const runtime=resolve(arg('--runtime','/Users/admin/workSpace/shopshorts-production'));
const root=resolve(arg('--work')),mode=arg('--action','review');await mkdir(root,{recursive:true});
const mod=p=>import(pathToFileURL(join(runtime,p)).href);
const story=JSON.parse(await readFile(join(here,'story.json'),'utf8'));
const hash=createHash('sha256').update(JSON.stringify(story)).digest('hex');
const save=(n,v)=>writeFile(join(root,n),JSON.stringify(v,null,2));
const exists=async p=>{try{await access(p);return true;}catch{return false;}};
const command=async(bin,a,env=process.env,timeout=600000)=>(await exec(bin,a,{env,timeout,maxBuffer:8*1024*1024})).stdout;
const {reviewDepth,validateDepthReview}=await mod('apps/shopshorts/lib/explanation-depth.js');
if(mode==='review'){
 const {createCodexGenerator}=await mod('apps/shopshorts/studio-codex.mjs');
 const {reviewResearchAnswer,answerInput,validateAnswerPlan}=await mod('apps/shopshorts/lib/research-answer.js');
 const generate=createCodexGenerator({env:process.env,timeoutMs:360000});
 let evidence;try{const saved=validateAnswerPlan(JSON.parse(await readFile(join(root,'research-review.json'),'utf8')),story.research);if(saved.passed&&saved.digest===(await answerInput(story.brief,story.research)).digest)evidence=saved;}catch{}
 evidence ||= await reviewResearchAnswer(story.brief,story.research,{generate,signal:AbortSignal.timeout(360000)});
 await save('research-review.json',evidence);console.log(JSON.stringify({researchPassed:evidence.passed,failures:Object.fromEntries(Object.entries(evidence.checks).filter(([,v])=>!v.pass))}));
 if(!evidence.passed)process.exit(2);
 const review=await reviewDepth(story.brief,story,{generate,signal:AbortSignal.timeout(360000)});
 await save('review.json',review);console.log(JSON.stringify({passed:review.passed,failures:Object.fromEntries(Object.entries(review.checks).filter(([,v])=>!v.pass))}));
 if(!review.passed)process.exit(2);
}else{
 const review=JSON.parse(await readFile(join(root,'review.json'),'utf8'));
 if(!(await validateDepthReview(review,story.brief,story)).passed)throw Error('Current script review required');
 if(mode==='voice'){
  const {runnerRequest}=await mod('apps/credential-broker/runner-client.mjs');
  const fetchDiagnostic=async(url,options)=>{
   const response=await fetch(url,options);
   if(!response.ok){
    const text=await response.clone().text();
    const diagnostic={status:response.status,contentType:response.headers.get('content-type'),retryAfter:response.headers.get('retry-after'),cloudflareError:(text.match(/(?:Error|error code)\s*(?:code:?)?\s*(1\d{3})/i)||[])[1]||null,temporarilyRateLimited:text.includes('temporarily rate limited')};
    await save('credential-failure.json',{...diagnostic,time:new Date().toISOString()});console.error(JSON.stringify(diagnostic));
   }else{await save('credential-status.json',{status:response.status,time:new Date().toISOString()});}return response;
  };
  const {values}=await runnerRequest(process.env.CAK_SECRETS_URL||'https://cak-credential-broker.guswhd1085.workers.dev',process.env.CAK_RUNNER_KEY_FILE||join(runtime,'apps/shopshorts/data/credential-runner.jwk'),'/runner/secrets',{},fetchDiagnostic);
  if(!values.ELEVENLABS_API_KEY)throw Error('Voice credentials unavailable');
  const env={...process.env,ELEVENLABS_API_KEY:values.ELEVENLABS_API_KEY,ELEVENLABS_VOICE_ID:story.brief.voiceId};
  const {alignNarration}=await mod('apps/shopshorts/studio-alignment.mjs');
  const timeline={sourceHash:hash,voice:story.brief.voiceId,speed:1.1,beats:[]};
  for(const s of story.scenes){
   const raw=join(root,s.id+'-raw.mp3'),receipt=join(root,s.id+'-voice-receipt.json');
   const signature=createHash('sha256').update(story.brief.voiceId+':'+s.narration).digest('hex');
   if(await exists(receipt)){
    const saved=JSON.parse(await readFile(receipt,'utf8'));
    if(saved.signature!==signature||saved.state!=='complete'||!await exists(raw))throw Error('Voice receipt requires reconciliation: '+s.id);
   }else{
    await writeFile(receipt,JSON.stringify({signature,state:'requested'}),{flag:'wx'});
    await command(process.execPath,['--import',join(runtime,'node_modules/tsx/dist/loader.mjs'),join(runtime,'packages/tts-narration/src/cli/index.ts'),'generate','--text',s.narration,'--out',raw],env);
    await writeFile(receipt,JSON.stringify({signature,state:'complete'}));
   }
   const audio=join(root,s.id+'.mp3');
   await command('ffmpeg',['-v','error','-y','-i',raw,'-af','atempo=1.1','-c:a','libmp3lame','-b:a','192k',audio]);
   const audioDuration=Number(await command('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',audio]));
   const alignment=await alignNarration({brief:story.brief},s,{file:audio,hash:signature+'-1.1',duration:audioDuration},root,process.env,command);
   const duration=Math.ceil((audioDuration+(s.id==='payoff'?1.5:.16))*24)/24;
   timeline.beats.push({id:s.id,duration,audioDuration,narration:s.narration,alignment});
   await save('timeline.json',timeline);console.log(JSON.stringify({voice:s.id,audioDuration,duration}));
  }
 }else if(mode==='import-voice'){
  const file=arg('--voice-input');if(!file)throw Error('Reviewed website voice export required');
  const {scenePhrases}=await mod('apps/shopshorts/studio-alignment.mjs');
  const request=join(root,'website-import-input.json');await writeFile(request,JSON.stringify({sourceHash:hash,voiceId:story.brief.voiceId,scenes:story.scenes.map(s=>({...s,phrases:scenePhrases({brief:story.brief},s)}))}));
  console.log(await command(process.env.SHOPSHORTS_ALIGNMENT_PYTHON||'python3',[join(here,'import-voice.py'),'--audio',resolve(file),'--source-speed',arg('--source-speed','1'),'--input',request,'--out',root,'--aligner',join(runtime,'apps/shopshorts/renderers/align-narration.py'),'--cache',process.env.SHOPSHORTS_WHISPER_CACHE||join(root,'whisper-models')],process.env,600000));
 }else if(mode==='compose'){
  const tl=JSON.parse(await readFile(join(root,'timeline.json'),'utf8'));if(tl.sourceHash!==hash||tl.beats.length!==story.scenes.length)throw Error('Timeline mismatch');
  const {defaultCaption}=await mod('apps/shopshorts/public/video-typography.js');
  const {renderCaptionArtwork}=await mod('apps/shopshorts/studio-typography.mjs');
  const layers=[];let offset=0;
  for(const b of tl.beats){
   let video=join(resolve(arg('--render-dir',join(root,'render'))),b.id+'.mp4');if(!await exists(video)&&arg('--secondary-render-dir'))video=join(resolve(arg('--secondary-render-dir')),b.id+'.mp4');
   const audio=join(root,b.id+'.mp3'),clip=join(root,b.id+'-av.mp4');
   const visualDuration=Number(await command('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',video]));
   await command('ffmpeg',['-v','error','-y','-i',video,'-i',audio,'-map','0:v','-map','1:a','-vf',`setpts=${b.duration/visualDuration}*PTS,fps=24,tpad=stop_mode=clone:stop_duration=0.1`,'-c:v','libx264','-crf','17','-preset','fast','-af','apad','-c:a','aac','-b:a','192k','-t',String(b.duration),clip]);
   layers.push(clip);
   offset+=b.duration;
  }
  await writeFile(join(root,'concat.txt'),layers.map(p=>"file '"+p.replaceAll("'","'\\''")+"'").join('\n'));
  await command('ffmpeg',['-v','error','-y','-f','concat','-safe','0','-i',join(root,'concat.txt'),'-c','copy',join(root,'joined.mp4')]);
  // Shared modern artwork, word-aligned timestamps. Each overlay is pre-rendered; no text is discarded.
  const overlays=[];offset=0;let n=0;
  for(const b of tl.beats){
   for(const c of b.alignment.phrases){
    const f=join(root,`caption-${n++}.png`);const art=await renderCaptionArtwork({...defaultCaption(),text:c.text},'9:16',f);
    overlays.push({file:f,x:Math.round((1080-art.width)/2),y:Math.round(1920*(b.id==='hook'?.86:.74)-art.height/2),start:offset+c.start,end:offset+c.end});
   }offset+=b.duration;
  }
  const hf=join(root,'header.png');await renderCaptionArtwork({...defaultCaption(),presentation:'modern-header-v1',text:story.header,size:88},'9:16',hf);overlays.push({file:hf,x:0,y:0,start:0,end:3.5});
  const lf=join(root,'label.png');const label=await renderCaptionArtwork({...defaultCaption(),text:'AI 3D 재현 · 원리 설명',size:24,backgroundOpacity:.5},'9:16',lf);overlays.push({file:lf,x:Math.round((1080-label.width)/2),y:1820,start:0,end:offset});
  // One intermediate per 12 overlays keeps file descriptors/memory bounded.
  let input=join(root,'joined.mp4');
  for(let i=0;i<overlays.length;i+=12){
   const batch=overlays.slice(i,i+12),out=join(root,`subtitled-${i}.mp4`),filter=batch.map((c,j)=>`[${j===0?'0:v':'v'+j}][${j+1}:v]overlay=${c.x}:${c.y}:enable='between(t,${c.start},${c.end})'[v${j+1}]`).join(';');
   await command('ffmpeg',['-v','error','-y','-i',input,...batch.flatMap(c=>['-i',c.file]),'-filter_complex',filter,'-map',`[v${batch.length}]`,'-map','0:a','-c:v','libx264','-crf','17','-preset','fast','-c:a','copy',out],process.env,3600000);input=out;
  }
  const out=resolve(arg('--out',join(root,'al-bahr-blender-short.mp4')));await mkdir(dirname(out),{recursive:true});
  await command('ffmpeg',['-v','error','-y','-i',input,'-c:v','copy','-af','loudnorm=I=-16:TP=-1.5:LRA=9','-ar','48000','-c:a','aac','-b:a','192k','-movflags','+faststart',out]);
  await save('delivery.json',{file:out,duration:offset,sourceHash:hash,reviewDigest:review.digest,voice:tl.voice,speed:tl.speed,higgsfieldCalls:0});console.log(JSON.stringify({file:out,duration:offset}));
 }else throw Error('Unknown action');
}
