import {sharedPipeline} from './lib/production-pipeline.js';
import {webtoon} from './lib/webtoon-plan.js';
import {normalizeEdit} from './public/editor-model.js';
import {narrationAsset} from './public/narration-audio.js';
import {validAlignment,scenePhrases} from './studio-alignment.mjs';
import {narrationFailure} from './studio-narration.mjs';
import {checkArchitectureRuntime} from './studio-architecture-blender.mjs';
import {hybridPlan} from './public/hybrid-plan.js';
export async function productionPreflight(job,env,{command,fetcher=fetch,blenderReady=checkArchitectureRuntime}) {
 const checks=[];
 for(const binary of ['ffmpeg','ffprobe']){
  try{await command(binary,['-version'],env,15000);checks.push({name:binary,ready:true});}
  catch{throw Error(`${binary} 실행 환경을 확인해 주세요. 아직 새 생성은 시작하지 않았습니다.`);}
 }
 if(job.task.action==='media'&&hybridPlan(job)?.scenes.some(s=>s.renderer==='3d'&&!s.reused))await blenderReady(env);
 const edit=normalizeEdit(job);
 const needsSpeech=job.task.action!=='media'||((job.automation||webtoon(job.brief)||(sharedPipeline(job)&&['cinematic','animation'].includes(job.brief.productionStyle)))&&!job.edit);
 if(!needsSpeech||edit.voice==='none')return {checkedAt:new Date().toISOString(),checks,voiceReused:true};
 if(edit.voice!=='none'&&job.scenes.some(s=>{const a=narrationAsset(job,s,edit.voice);return !a||!validAlignment(a.alignment,s.narration,a.duration,scenePhrases(job,s));})){
  try{await command(env.SHOPSHORTS_ALIGNMENT_PYTHON||'python3',['-c','import whisper, torch'],env,30000);}
  catch{throw Error('실제 음성에 자막을 맞추는 실행기가 없습니다. 제작 워커의 SHOPSHORTS_ALIGNMENT_PYTHON과 Whisper 설치를 확인해 주세요.');}
 }
 const needed=edit.voice!=='none'&&job.scenes.some(s=>!narrationAsset(job,s,edit.voice));
 if(needed){
  if(!env.ELEVENLABS_API_KEY)throw Error('대본 음성 서비스를 연결해 주세요. 아직 새 생성은 시작하지 않았습니다.');
  try{
   // Read-only check: TLS, credentials and service reachability; never synthesizes speech.
   const r=await fetcher('https://api.elevenlabs.io/v1/user',{headers:{'xi-api-key':env.ELEVENLABS_API_KEY},signal:AbortSignal.timeout(15000)});
   await r.body?.cancel();
   if(!r.ok)throw Error(String(r.status));
  }catch(e){throw Error(narrationFailure(e));}
  checks.push({name:'voice-connection',ready:true});
 }
 return {checkedAt:new Date().toISOString(),checks,voiceReused:!needed};
}
