import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { practiceSongs } from '../lib/original-music.ts';
assert(process.argv.includes('--confirm-live'),'Makes provider audio calls; explicit authorization required');
assert(process.env.HANMADI_E2E_ARTIFACTS,'Set artifact directory');
const out=process.env.HANMADI_E2E_ARTIFACTS, base='https://hanmadi-lake.vercel.app';
const arg=name=>process.argv.find(value=>value.startsWith(name+'='))?.slice(name.length+1);
const language=arg('--language'), songDir=arg('--song-dir');
assert(!language || ['en','ja','th','es'].includes(language),'Unknown language');
const transcribeOnly=process.argv.includes('--transcribe-only');
let cookie='';const results=[];
async function json(path,body){
  const r=await fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
  const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));
  if(r.headers.getSetCookie().length)cookie=r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
  return d;
}
const normalized=s=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu,'');
await json('/api/study/account',{action:'signup',name:'qa_voice_'+Date.now(),password:randomBytes(24).toString('base64url')});
try{
  for(const song of practiceSongs.filter(song=>!language || song.language===language)){
    const record={language:song.language};results.push(record);
    try{
      if(!transcribeOnly){
      const tts=await fetch(base+'/api/study/audio',{method:'POST',headers:{Origin:base,cookie,'Content-Type':'application/json'},body:JSON.stringify({language:song.language,text:song.lines[0].text}),signal:AbortSignal.timeout(60000)});
      assert.equal(tts.status,200);assert.match(tts.headers.get('Content-Type'),/^audio\//);
      const speech=Buffer.from(await tts.arrayBuffer());assert(speech.length>1000);
      const speechFile=resolve(out,`speech-${song.language}.mp3`);await writeFile(speechFile,speech);
      assert.equal(spawnSync('ffmpeg',['-v','error','-i',speechFile,'-f','null','-']).status,0);
      record.speechBytes=speech.length;
      }
      const wav=resolve(out,`song-${song.language}.wav`);
      const conversion=spawnSync('ffmpeg',['-y','-v','error','-i',songDir?resolve(songDir,basename(song.audio)):'public'+song.audio,'-ar','16000','-ac','1',wav]);assert.equal(conversion.status,0);
      const form=new FormData();form.set('file',new Blob([await readFile(wav)],{type:'audio/wav'}),'original-practice.wav');form.set('language',song.language);
      const stt=await fetch(base+'/api/study/audio',{method:'POST',headers:{Origin:base,cookie},body:form,signal:AbortSignal.timeout(60000)});
      const data=await stt.json();assert.equal(stt.status,200,JSON.stringify(data));
      record.transcript=data.text;record.authored=song.lines.map(l=>l.text).join(' ');
      record.audioEventStrippedMatch=normalized(record.transcript.replace(/\[[^\]]*\]/g,''))===normalized(record.authored);
      record.normalizedLyricsMatch=normalized(record.transcript)===normalized(record.authored);
      console.log('PASS audio transport',song.language,'lyrics match:',record.normalizedLyricsMatch);
    }catch(e){record.error=e.message;console.log('FAIL',song.language,e.message);}
  }
}finally{
  await writeFile(resolve(out,'audio-live.json'),JSON.stringify({at:new Date().toISOString(),results},null,2));
  await json('/api/study/account',{action:'logout'}).catch(()=>{});
}
if(results.some(r=>r.error))process.exitCode=1;
