// Run with the installed production tsx CLI to use the existing TTS atom.
// Secrets stay in process memory. Receipt guard prevents ambiguous paid retries.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const story=JSON.parse(await readFile(join(here,'story.json'),'utf8'));
const [mode,role]=process.argv.slice(2),cache=process.env.VIDEO_CACHE,root=process.env.CAK_ENGINE_ROOT;
if(!['sample','tts','validate','voices'].includes(mode))throw Error('sample|tts|validate|voices [N/S/M]');
const ids=new Set(),indices={N:new Set(),S:new Set(),M:new Set()};
for(const b of story.episodes.flatMap(e=>e.beats)){
 if(ids.has(b.id)||indices[b.speaker].has(b.voiceIndex))throw Error('Duplicate beat/index');
 ids.add(b.id);indices[b.speaker].add(b.voiceIndex);
 if(b.ttsText.replace(/\[[^\]]+\]\s*/g,'').trim()!==b.text||!b.emotion||/\[/.test(b.text))throw Error('Display and speech text mismatch');
}
if(mode==='validate'){console.log(JSON.stringify({beats:ids.size,model:story.model,voices:story.voices,speed:story.speed}));process.exit(0);}
if(!cache||!root)throw Error('VIDEO_CACHE and CAK_ENGINE_ROOT required');
await mkdir(cache,{recursive:true});
const {runnerRequest}=await import(pathToFileURL(join(root,'apps/credential-broker/runner-client.mjs')));
const {values}=await runnerRequest('https://cak-credential-broker.guswhd1085.workers.dev','/Users/admin/Library/Application Support/Shopshorts/credential-runner.jwk','/runner/secrets',{});
const key=values.ELEVENLABS_API_KEY;if(!key)throw Error('TTS credential unavailable');
const request=async(path,body)=>{
 const r=await fetch('https://api.elevenlabs.io'+path,{method:body?'POST':'GET',headers:{'xi-api-key':key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 const result=await r.json();return {status:r.status,result};
};
if(mode==='voices'){
 const verified=[];
 for(const [role,v] of Object.entries(story.voices)){
  let r=await request('/v1/voices/'+v.id);
  if(r.status!==200){
   if(r.result.detail?.status!=='voice_not_found')throw Error('Voice access failed '+r.status);
   const shared=await request('/v1/shared-voices?search='+encodeURIComponent(v.id));
   const found=shared.result.voices?.find(x=>x.voice_id===v.id);
   if(!found||found.rate!==1)throw Error('Exact standard-rate public voice unavailable');
   const added=await request('/v1/voices/add/'+found.public_owner_id+'/'+v.id,{new_name:found.name});
   if(added.status!==200||added.result.voice_id!==v.id)throw Error('Voice add failed; inspect account, do not substitute');
   r=await request('/v1/voices/'+v.id);
  }
  if(r.status!==200||r.result.voice_id!==v.id)throw Error('Voice verification failed');
  verified.push({role,id:v.id,name:r.result.name});
 }
 await writeFile(join(cache,'verified-voices.json'),JSON.stringify(verified,null,2)+'\n');console.log(JSON.stringify(verified));process.exit(0);
}
if(!story.voices[role])throw Error('Voice role N/S/M required');
const {synthesizeNarration}=await import(pathToFileURL(join(root,'packages/tts-narration/src/adapters/elevenlabs.ts')));
const selected={N:['e1-02','e1-27'],S:['e1-01','e1-24'],M:['e1-00','e1-23']};
let beats=story.episodes.filter(e=>story.approvedEpisodes.includes(e.number)).flatMap(e=>e.beats).filter(b=>b.speaker===role);
if(mode==='sample')beats=beats.filter(b=>selected[role].includes(b.id));
const ledger=join(cache,'tts-'+role+'-local-receipts.json');let receipts={};try{receipts=JSON.parse(await readFile(ledger,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;}
const save=()=>writeFile(ledger,JSON.stringify(receipts,null,2)+'\n');
const outdir=join(cache,'voice-'+role);await mkdir(outdir,{recursive:true});
for(const b of beats){
 const effectiveModel=b.model||story.model,receiptId=b.id+(b.voiceVariant||'');
 const file=join(outdir,`beat-${String(b.voiceIndex).padStart(2,'0')}${b.voiceVariant||''}.mp3`);
 try{
  await access(file);const meta=JSON.parse(await readFile(file+'.json','utf8'));
  if(meta.text!==b.ttsText||meta.voiceId!==story.voices[role].id||meta.modelId!==effectiveModel)throw Error('Existing voice cache mismatch');
  console.log('CACHED',b.id);continue;
 }catch(e){if(e.code!=='ENOENT')throw e;}
 if(receipts[receiptId])throw Error('Prior submission exists; inspect provider history, never auto-retry');
 receipts[receiptId]={state:'submitting',at:new Date().toISOString(),voiceId:story.voices[role].id,model:effectiveModel};await save();
 const meta=await synthesizeNarration({apiKey:key,text:b.ttsText,outPath:file,env:{ELEVENLABS_VOICE_ID:story.voices[role].id,ELEVENLABS_TTS_MODEL:effectiveModel},maxAttempts:1});
 await writeFile(file+'.json',JSON.stringify(meta,null,2)+'\n');receipts[receiptId].state='downloaded';await save();console.log('GENERATED',b.id);
}
