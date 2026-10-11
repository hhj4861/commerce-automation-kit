// Exact reviewed narrative -> official ElevenLabs. No credentials persisted; no automatic paid retries.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createPrivateKey,sign,randomUUID,createHash} from 'node:crypto';
import {dirname,join} from 'node:path';import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),cache=process.env.VIDEO_CACHE;
if(!cache)throw Error('VIDEO_CACHE required');
const story=JSON.parse(await readFile(join(here,'story.json'),'utf8'));
if(story.review.status!=='passed'||['focus','why','mechanism','example','payoff','pacing','visuals'].some(k=>!story.review[k]))throw Error('Exact script review required');
await mkdir(join(cache,'voice'),{recursive:true});
const jwk=JSON.parse(await readFile('/Users/admin/Library/Application Support/Shopshorts/credential-runner.jwk','utf8'));
const now=Math.floor(Date.now()/1000),b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const input=b64({alg:'EdDSA'})+'.'+b64({iss:'cak-runner',sub:'shopshorts-runner',aud:'cak-cloudflare-secrets',iat:now,exp:now+60,jti:randomUUID()});
const jwt=input+'.'+sign(null,Buffer.from(input),createPrivateKey({key:jwk,format:'jwk'})).toString('base64url');
const br=await fetch('https://cak-credential-broker.guswhd1085.workers.dev/runner/secrets',{method:'POST',redirect:'error',headers:{authorization:'Bearer '+jwt,'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});
if(!br.ok)throw Error('Credential service HTTP '+br.status);const {values}=await br.json(),key=values.ELEVENLABS_API_KEY;if(!key)throw Error('TTS credential unavailable');
const vr=await fetch('https://api.elevenlabs.io/v1/voices/'+story.voice,{headers:{'xi-api-key':key},signal:AbortSignal.timeout(30000)});if(!vr.ok)throw Error('Kyle unavailable HTTP '+vr.status);console.log('KYLE_AVAILABLE');
if(process.argv.includes('--preflight'))process.exit(0);
let receipts={};try{receipts=JSON.parse(await readFile(join(cache,'tts-receipts.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const save=()=>writeFile(join(cache,'tts-receipts.json'),JSON.stringify(receipts,null,2));
for(const s of story.scenes){
 const body={text:s.narration,model_id:'eleven_multilingual_v2',language_code:'ko',voice_settings:{stability:.48,similarity_boost:.75,style:.12,use_speaker_boost:true,speed:story.voiceSpeed}};
 const digest=createHash('sha256').update(JSON.stringify({voice:story.voice,body})).digest('hex'),file=join(cache,'voice',s.id+'.mp3');
 if(receipts[s.id]){if(receipts[s.id].state!=='downloaded'||receipts[s.id].digest!==digest)throw Error('Inspect ambiguous/mismatched receipt '+s.id);await access(file);continue;}
 receipts[s.id]={state:'submitting',digest,at:new Date().toISOString()};await save();
 const r=await fetch('https://api.elevenlabs.io/v1/text-to-speech/'+story.voice+'?output_format=mp3_44100_128',{method:'POST',headers:{'xi-api-key':key,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
 if(!r.ok){receipts[s.id].state='failed';receipts[s.id].http=r.status;await save();throw Error('TTS '+s.id+' HTTP '+r.status+'; no auto retry');}
 const data=Buffer.from(await r.arrayBuffer());if(data.length<1000)throw Error('Empty speech');await writeFile(file,data);receipts[s.id]={...receipts[s.id],state:'downloaded',bytes:data.length,requestId:r.headers.get('request-id')};await save();console.log('GENERATED',s.id,data.length);
}
console.log('NARRATION_READY',story.scenes.length);
