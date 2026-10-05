// Official adapters only; ambiguous submissions never automatically repeat.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),story=JSON.parse(await readFile(join(here,'story.json'),'utf8'));
const cache=process.env.VIDEO_CACHE,root=process.env.CAK_ENGINE_ROOT;
if(!cache||!root)throw Error('VIDEO_CACHE and CAK_ENGINE_ROOT required');
await mkdir(cache,{recursive:true});
story.beats=story.scenes.map(s=>({...s,text:s.narration}));
const imp=p=>import(pathToFileURL(join(root,p)));
const {runnerRequest}=await imp('apps/credential-broker/runner-client.mjs');
const request=(p,b)=>runnerRequest('https://cak-credential-broker.guswhd1085.workers.dev','/Users/admin/Library/Application Support/Shopshorts/credential-runner.jwk',p,b);
const save=(n,d)=>writeFile(join(cache,n),JSON.stringify(d,null,2)+'\n');
const get=async n=>{try{return JSON.parse(await readFile(join(cache,n),'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;return null;}};
const mode=process.argv[2];
const {reviewPrompt,validateDepthReview,depthFailure}=await import('../../../apps/shopshorts/lib/explanation-depth.js');
if(mode==='review'){
 const {generateCodexRecommendation}=await import('../../../apps/shopshorts/studio-codex.mjs');
 const prompt=await reviewPrompt(story.brief,story);await writeFile(join(cache,'review-prompt.txt'),prompt);
 const response=await generateCodexRecommendation(prompt,{draftOnly:true});
 const review=await validateDepthReview(response.value,story.brief,story);await save('review.json',review);
 console.log(JSON.stringify(review));if(!review.passed)throw depthFailure();process.exit(0);
}
if(['tts','generate'].includes(mode)){
 const review=await validateDepthReview(await get('review.json'),story.brief,story);
 if(!review.passed)throw depthFailure();
}
if(mode==='tts'){
 const {values}=await request('/runner/secrets',{}),apiKey=values.ELEVENLABS_API_KEY;
 if(!apiKey)throw Error('TTS credential unavailable');
 const {synthesizeNarration}=await imp('packages/tts-narration/src/adapters/elevenlabs.ts');
 let receipts=await get('tts-receipts.json')||{};
 await mkdir(join(cache,'voice'),{recursive:true});
 for(const b of story.beats){
  const outPath=join(cache,'voice',b.id+'.mp3');
  const old=await get('voice/'+b.id+'.mp3.json');
  if(old){if(old.text!==b.text||old.voiceId!==story.voiceId||old.modelId!==story.model)throw Error('TTS cache mismatch');await access(outPath);console.log('CACHED',b.id);continue;}
  if(receipts[b.id])throw Error('Unconfirmed TTS submission: inspect history before retry');
  receipts[b.id]={state:'submitting',at:new Date().toISOString(),voiceId:story.voiceId,text:b.text};await save('tts-receipts.json',receipts);
  const meta=await synthesizeNarration({apiKey,text:b.text,outPath,env:{ELEVENLABS_VOICE_ID:story.voiceId,ELEVENLABS_TTS_MODEL:story.model},maxAttempts:1});
  await save('voice/'+b.id+'.mp3.json',meta);receipts[b.id].state='downloaded';await save('tts-receipts.json',receipts);console.log('GENERATED',b.id);
 }
 process.exit(0);
}
const {cloudHiggsfieldRunner}=await imp('apps/shopshorts/studio-higgsfield-auth.mjs');
const {downloadHiggsfield}=await imp('apps/shopshorts/studio-higgsfield.mjs');
const run=cloudHiggsfieldRunner(request,process.env,{root:'/Users/admin/Library/Application Support/Shopshorts'});
const prompt=story.openingPrompt;
const params=['--prompt',prompt,'--aspect_ratio','9:16','--resolution','1080p','--duration','6','--mode','std','--generate_audio','false'];
if(mode==='preflight'){
 const balance=await run(['account','status']),cost=await run(['generate','cost','seedance_2_0',...params]);
 const safe={balance:balance.credits,cost,at:new Date().toISOString()};await save('preflight.json',safe);console.log(JSON.stringify(safe));process.exit(0);
}
let receipt=await get('higgsfield-receipt.json');
if(mode==='generate'){
 if(receipt){if(!receipt.id)throw Error('Ambiguous prior submission; inspect provider history');console.log(JSON.stringify({state:receipt.state,id:receipt.id}));process.exit(0);}
 const cost=await run(['generate','cost','seedance_2_0',...params]);
 if(!Number.isFinite(cost.credits)||cost.credits>story.maxHiggsfieldCredits)throw Error('Credit cap exceeded');
 const image=join(cache,'art/hero.png');await access(image);
 receipt={state:'submitting',credits:cost.credits,prompt,reference:image,at:new Date().toISOString()};await save('higgsfield-receipt.json',receipt);
 const created=await run(['generate','create','seedance_2_0',...params,'--start-image',image]);
 const id=Array.isArray(created)?(typeof created[0]==='string'?created[0]:created[0]?.id):created?.id;
 if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('Unknown submission result; do not retry');
 receipt={...receipt,id,state:'accepted'};await save('higgsfield-receipt.json',receipt);console.log(JSON.stringify({id,credits:cost.credits,state:'accepted'}));process.exit(0);
}
if(mode==='poll'){
 if(!receipt?.id)throw Error('No accepted generation');
 if(receipt.state==='downloaded'){console.log('CACHED opening.mp4');process.exit(0);}
 const response=await run(['generate','get',receipt.id]),job=Array.isArray(response)?response.find(x=>x.id===receipt.id):response;
 if(job?.id!==receipt.id)throw Error('Unexpected provider response');
 if(['failed','error','cancelled','rejected'].includes(job.status))throw Error('Provider job '+job.status);
 if(job.status==='completed'){const m=await downloadHiggsfield(job.result_url,'video');await writeFile(join(cache,'opening.mp4'),m.data);receipt.state='downloaded';await save('higgsfield-receipt.json',receipt);console.log('DOWNLOADED',m.data.length);}else console.log(JSON.stringify({state:job.status,id:receipt.id}));
 process.exit(0);
}
throw Error('Use review|preflight|tts|generate|poll');
