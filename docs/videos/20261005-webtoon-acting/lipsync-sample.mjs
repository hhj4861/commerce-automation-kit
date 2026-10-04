import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const s=JSON.parse(await readFile(join(here,'lipsync-sample.json'),'utf8'));
const root=process.env.CAK_ENGINE_ROOT,cache=process.env.VIDEO_CACHE;
if(!root||!cache)throw Error('CAK_ENGINE_ROOT and VIDEO_CACHE required');
const mode=process.argv[2];if(!['voices','tts'].includes(mode))throw Error('voices|tts');
await mkdir(cache,{recursive:true});
const {runnerRequest}=await import(pathToFileURL(join(root,'apps/credential-broker/runner-client.mjs')));
const {values}=await runnerRequest('https://cak-credential-broker.guswhd1085.workers.dev','/Users/admin/Library/Application Support/Shopshorts/credential-runner.jwk','/runner/secrets',{});
const key=values.ELEVENLABS_API_KEY;if(!key)throw Error('Missing TTS credential');
const req=async(p,body)=>{const r=await fetch('https://api.elevenlabs.io'+p,{method:body?'POST':'GET',headers:{'xi-api-key':key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});return {status:r.status,data:await r.json()};};
if(mode==='voices'){
 const out=[];
 for(const b of s.beats){
  let r=await req('/v1/voices/'+b.voiceId);
  if(r.status!==200){
   if(r.data.detail?.status!=='voice_not_found')throw Error('Voice access '+r.status);
   const f=(await req('/v1/shared-voices?search='+b.voiceId)).data.voices?.find(v=>v.voice_id===b.voiceId);
   if(!f||f.rate!==1)throw Error('Exact voice at standard rate unavailable');
   const added=await req('/v1/voices/add/'+f.public_owner_id+'/'+f.voice_id,{new_name:f.name});
   if(added.status!==200)throw Error('Voice add '+added.status);
   r=await req('/v1/voices/'+b.voiceId);
  }
  if(r.status!==200||r.data.voice_id!==b.voiceId)throw Error('Voice mismatch');
  out.push({role:b.id,voiceId:b.voiceId,name:r.data.name});
 }
 await writeFile(join(cache,'voices.json'),JSON.stringify(out,null,2));console.log(out);
}else{
 const {synthesizeNarration}=await import(pathToFileURL(join(root,'packages/tts-narration/src/adapters/elevenlabs.ts')));
 for(const b of s.beats){
  const path=join(cache,b.id+'.mp3'),receipt=join(cache,b.id+'-receipt.json');
  try{await access(receipt);console.log('Already submitted',b.id);continue;}catch(e){if(e.code!=='ENOENT')throw e;}
  await writeFile(receipt,JSON.stringify({state:'submitting',voiceId:b.voiceId,text:b.ttsText}),{flag:'wx'});
  const meta=await synthesizeNarration({apiKey:key,text:b.ttsText,outPath:path,env:{ELEVENLABS_VOICE_ID:b.voiceId,ELEVENLABS_TTS_MODEL:'eleven_v3'},maxAttempts:1});
  await writeFile(path+'.json',JSON.stringify(meta,null,2));await writeFile(receipt,JSON.stringify({state:'downloaded',voiceId:b.voiceId,text:b.ttsText}));console.log('Generated',b.id);
 }
}
