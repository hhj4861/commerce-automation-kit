// Run from apps/hanmadi: node --import tsx scripts/voice-stream-e2e.mjs
// Uses real Chrome decoding of an original synthetic MP3; requires ffmpeg.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import ts from 'typescript';
import {chromium} from 'playwright';
import {createStudySpeechResponses} from '../lib/study-audio-response.ts';
const output=process.env.HANMADI_VOICE_QA_DIR;if(!output)throw Error('Set HANMADI_VOICE_QA_DIR to the approved artifact directory');await mkdir(output,{recursive:true});
const generated=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=6','-ac','1','-ar','24000','-b:a','64k','-f','mp3','pipe:1']);
assert.equal(generated.status,0,generated.stderr.toString());const mp3=generated.stdout;
const sources=await Promise.all(['study-audio-client','study-audio-stream'].map(n=>readFile(resolve('lib',n+'.ts'),'utf8')));
const js=sources.map(s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).join('\n')+`
window.cache=createStudyAudioCache();window.__voiceState={};window.mode='public';window.noMse=false;
document.querySelector('button').onclick=()=>{
 window.player?.dispose();window.__voiceState={click:performance.now(),started:null,done:null,error:null};
 const p=createStudyPlayback(1,e=>window.__voiceState.error=e.message);window.player=p;
 p.audio.addEventListener('playing',()=>window.__voiceState.started=performance.now(),{once:true});
 window.cache.load(window.mode,'en',p.append).then(b=>{window.__voiceState.done=performance.now();return p.finish(b)}).catch(p.fail);
 p.started.catch(()=>{});
};
window.ready=true;`;
let upstreamCalls=0,clientCalls=0;const serve=createStudySpeechResponses();
const server=createServer(async(req,res)=>{
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<button>Listen</button><script type="module" src="/app.js"></script>');return;}
 if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(js);return;}
 if(req.url!=='/api/study/audio'){res.statusCode=404;res.end();return;}
 clientCalls++;const parts=[];for await(const c of req)parts.push(c);const {text}=JSON.parse(Buffer.concat(parts));
 const controller=new AbortController();res.on('close',()=>controller.abort());
 try{
  const r=await serve(text==='public'?'public-lesson':null,async()=>{
   upstreamCalls++;
   let offset=0,ended=false,timer;
   return new Response(new ReadableStream({
    start(c){const push=()=>{
      if(ended)return;
      if(text==='broken'&&offset>0){ended=true;c.error(new Error('fixture disconnect'));return;}
      if(offset>=mp3.length){ended=true;c.close();return;}
      const size=offset===0?12000:4000;c.enqueue(new Uint8Array(mp3.subarray(offset,offset+size)));offset+=size;timer=setTimeout(push,200);
     };timer=setTimeout(push,250);},
    cancel(){ended=true;clearTimeout(timer)},
   }),{headers:{'Content-Type':'audio/mpeg'}});
  },controller.signal);
  res.writeHead(r.status,Object.fromEntries(r.headers));for await(const c of r.body)res.write(Buffer.from(c));res.end();
 }catch{res.destroy();}
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:process.platform==='darwin'?'chrome':undefined,headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const evidence={};
try{
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.ready);
 assert(await page.evaluate(()=>MediaSource.isTypeSupported('audio/mpeg')),'Chrome MP3 MSE support required');
 await page.getByRole('button',{name:'Listen'}).click();await page.waitForFunction(()=>window.__voiceState.started!==null&&window.player.audio.currentTime>0.05);
 evidence.streaming=await page.evaluate(()=>({...window.__voiceState,currentTime:window.player.audio.currentTime}));assert.equal(evidence.streaming.done,null,'must start before final bytes');
 await page.waitForFunction(()=>window.__voiceState.done!==null);evidence.streaming.completeMs=await page.evaluate(()=>window.__voiceState.done-window.__voiceState.click);
 evidence.streaming.startMs=Math.round(evidence.streaming.started-evidence.streaming.click);
 const before=clientCalls;await page.getByRole('button',{name:'Listen'}).click();await page.waitForFunction(()=>window.__voiceState.started!==null);assert.equal(clientCalls,before);evidence.replayMs=await page.evaluate(()=>Math.round(window.__voiceState.started-window.__voiceState.click));
 await page.evaluate(()=>window.cache.clear());const upstreamBefore=upstreamCalls;await page.getByRole('button',{name:'Listen'}).click();await page.waitForFunction(()=>window.__voiceState.started!==null);assert.equal(upstreamCalls,upstreamBefore);evidence.publicCacheMs=await page.evaluate(()=>Math.round(window.__voiceState.started-window.__voiceState.click));
 await page.evaluate(()=>{window.player.dispose();window.cache.clear();window.mode='fallback';window.savedMse=window.MediaSource;window.MediaSource=undefined;});
 await page.getByRole('button',{name:'Listen'}).click();await page.waitForFunction(()=>window.__voiceState.started!==null&&window.player.audio.currentTime>0.05);evidence.fallback=await page.evaluate(()=>({...window.__voiceState}));assert(evidence.fallback.started>=evidence.fallback.done);
 await page.evaluate(()=>{window.MediaSource=window.savedMse;window.mode='broken';});await page.getByRole('button',{name:'Listen'}).click();await page.waitForFunction(()=>window.__voiceState.error!==null);assert.equal(await page.evaluate(()=>window.__voiceState.done),null);
 const failedCalls=upstreamCalls;await page.getByRole('button',{name:'Listen'}).click();await page.waitForFunction(()=>window.__voiceState.error!==null);assert.equal(upstreamCalls,failedCalls+1);evidence.failedStreamRetried=true;
 await page.evaluate(()=>window.mode='cancel');await page.getByRole('button',{name:'Listen'}).click();await page.evaluate(()=>{window.player.dispose();window.cache.clear()});await page.waitForTimeout(600);assert(await page.evaluate(()=>window.player.audio.paused));evidence.cancelled=true;
 assert.deepEqual(errors,[]);evidence.browserErrors=errors;evidence.upstreamCalls=upstreamCalls;evidence.clientCalls=clientCalls;
 console.log(JSON.stringify(evidence,null,2));await writeFile(resolve(output,'stream-e2e.json'),JSON.stringify(evidence,null,2));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
