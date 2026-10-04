// Reproducible, receipt-guarded TTS. No credentials are stored in artifact directories.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const here=dirname(fileURLToPath(import.meta.url));
const story=JSON.parse(await readFile(join(here,'story.json'),'utf8'));
const [mode,role]=process.argv.slice(2),cache=process.env.VIDEO_CACHE;
if((mode!=='validate'&&!cache)||!['sample','tts','validate'].includes(mode))throw Error('VIDEO_CACHE required; sample|tts|validate [N/S/M]');
const ids=new Set(),indices={N:new Set(),S:new Set(),M:new Set()};
for(const b of story.episodes.flatMap(e=>e.beats)){
 if(ids.has(b.id)||indices[b.speaker].has(b.voiceIndex))throw Error('Duplicate beat/index');
 ids.add(b.id);indices[b.speaker].add(b.voiceIndex);
 if(!b.ttsText.endsWith(b.text)||!b.emotion||/\[/.test(b.text))throw Error('Display and speech text mismatch');
}
if(mode==='validate'){console.log(JSON.stringify({beats:ids.size,model:story.model,voices:story.voices,speed:story.speed}));process.exit(0);}
if(!story.voices[role])throw Error('Voice role N/S/M required');
await mkdir(cache,{recursive:true});
const selected={N:['e1-02','e1-27'],S:['e1-01','e1-24'],M:['e1-00','e1-23']};
let beats=story.episodes.filter(e=>story.approvedEpisodes.includes(e.number)).flatMap(e=>e.beats).filter(b=>b.speaker===role);
if(mode==='sample')beats=beats.filter(b=>selected[role].includes(b.id));
else{
 const pending=[];
 for(const b of beats){
  const f=join(cache,'voice-'+role,`beat-${String(b.voiceIndex).padStart(2,'0')}.mp3`);
  try{
   await access(f);const meta=JSON.parse(await readFile(f+'.json','utf8'));
   if(meta.text!==b.ttsText||meta.voiceId!==story.voices[role].id||meta.modelId!==story.model)throw Error('Existing voice cache mismatch');
  }catch(e){if(e.code!=='ENOENT')throw e;pending.push(b);}
 }beats=pending;
}
if(!beats.length){console.log('All requested audio already cached');process.exit(0);}
const label=story.id+'-'+mode+'-'+role;
const receipt=join(cache,label+'-dispatch.json');
try{await readFile(receipt);throw Error('Already dispatched; inspect receipt/run before retry')}catch(e){if(e.code!=='ENOENT')throw e;}
const data={ref:'feat/webtoon-psychology-trilogy',inputs:{script_b64:Buffer.from(JSON.stringify({briefId:label,title:story.title,beats:beats.map(b=>({index:b.voiceIndex,role:'body',durationSec:8,narration:b.ttsText,caption:b.text,visualPrompt:'Original fictional webtoon drama'}))})).toString('base64'),voice_id:story.voices[role].id,model_id:story.model,verify_secrets_only:'false',run_label:label}};
await writeFile(receipt,JSON.stringify({state:'submitting',at:new Date().toISOString(),role,voice:story.voices[role],model:story.model,beatIds:beats.map(b=>b.id),label},null,2)+'\n');
const r=spawnSync('gh',['api','repos/hhj4861/commerce-automation-kit/actions/workflows/tts-remote.yml/dispatches','--input','-'],{input:JSON.stringify(data),encoding:'utf8'});
if(r.status!==0)throw Error('Dispatch unconfirmed; inspect Actions before retry: '+r.stderr.slice(0,300));
console.log(JSON.stringify({role,beats:beats.length,label,state:'dispatched'}));
