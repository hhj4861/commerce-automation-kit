// Exact reviewed dialogue -> official ElevenLabs (v3; one v2 pronunciation correction). No automatic paid retries.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {dirname,join} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const here=dirname(fileURLToPath(import.meta.url)),cache=process.env.VIDEO_CACHE,root=process.env.CAK_ENGINE_ROOT;
if(!cache||!root)throw Error('VIDEO_CACHE/CAK_ENGINE_ROOT required');await mkdir(join(cache,'voice'),{recursive:true});
const story=JSON.parse(await readFile(join(here,'story.json'),'utf8'));
const {validateDepthReview}=await import(pathToFileURL(join(root,'apps/shopshorts/lib/explanation-depth.js')));
const review=await validateDepthReview(JSON.parse(await readFile(join(here,'review.json'),'utf8')),story.brief,story);if(!review.passed)throw Error('Exact script review required');
const {runnerRequest}=await import(pathToFileURL(join(root,'apps/credential-broker/runner-client.mjs')));
const {values}=await runnerRequest('https://cak-credential-broker.guswhd1085.workers.dev','/Users/admin/Library/Application Support/Shopshorts/credential-runner.jwk','/runner/secrets',{});
const key=values.ELEVENLABS_API_KEY;if(!key)throw Error('TTS credential unavailable');
const directions={knock:['[serious]'],identity:['[cautious]','[confident]'],verify:['[nervous]'],pressure:['[stern]','[quietly]'],missing:['[serious]','[whispering]'],brace:['[calm]'],key:['[whispering]']};
const lines=[];for(const s of story.scenes){if(!s.spoken)continue;for(const [i,part]of s.narration.split(' / ').entries()){const at=part.indexOf(': '),speaker=part.slice(0,at),text=part.slice(at+2);lines.push({id:`${s.id}-${i}`,scene:s.id,speaker,text,voice:story.voices[speaker],tag:directions[s.id][i]});}}
for(const voice of new Set(lines.map(x=>x.voice))){const r=await fetch(`https://api.elevenlabs.io/v1/voices/${voice}`,{headers:{'xi-api-key':key},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`Selected voice unavailable HTTP${r.status}`);console.log('VOICE_AVAILABLE',voice);}
let receipts;try{receipts=JSON.parse(await readFile(join(cache,'tts-receipts.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;receipts={};}
const save=()=>writeFile(join(cache,'tts-receipts.json'),JSON.stringify(receipts,null,2));
for(const line of lines){
 const body={text:line.id==='missing-0'?line.text:`${line.tag} ${line.text}`,model_id:line.id==='missing-0'?'eleven_multilingual_v2':'eleven_v3',language_code:'ko',voice_settings:{stability:0.5,similarity_boost:0.75,speed:1.0}};
 const digest=createHash('sha256').update(JSON.stringify({voice:line.voice,body})).digest('hex');const file=join(cache,'voice',line.id+'.mp3');
 if(receipts[line.id]){if(receipts[line.id].state!=='downloaded'||receipts[line.id].digest!==digest)throw Error(`Inspect ambiguous or mismatched receipt ${line.id}`);await access(file);continue;}
 receipts[line.id]={...line,digest,state:'submitting',at:new Date().toISOString()};await save();
 const r=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${line.voice}?output_format=mp3_44100_128`,{method:'POST',headers:{'xi-api-key':key,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
 if(!r.ok){receipts[line.id].state='failed';receipts[line.id].http=r.status;await save();throw Error(`TTS ${line.id} HTTP${r.status}; no automatic retry`);}
 const data=Buffer.from(await r.arrayBuffer());if(data.length<1000)throw Error('Empty speech');await writeFile(file,data);
 receipts[line.id].state='downloaded';receipts[line.id].bytes=data.length;receipts[line.id].requestId=r.headers.get('request-id');await save();console.log('GENERATED',line.id,data.length);
}
await writeFile(join(cache,'lines.json'),JSON.stringify(lines,null,2));console.log('ALL_DIALOGUE_READY',lines.length);
