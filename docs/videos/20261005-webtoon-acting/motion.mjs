// Paid jobs are never silently resubmitted. Only eight episode-one shots are approved.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const story=JSON.parse(await readFile(join(here,'story.json'),'utf8'));
const cache=process.env.VIDEO_CACHE,source=process.env.SOURCE_CACHE,root=process.env.CAK_ENGINE_ROOT;
if(!cache||!source||!root)throw Error('VIDEO_CACHE, SOURCE_CACHE, CAK_ENGINE_ROOT required');
const prompts=[
'Woman holds phone to her ear, listens with a small polite smile, gives a small reassuring nod. Her smile gradually fades and her gaze lowers. A visible breath moves her shoulders; she blinks naturally. Keep phone at her ear. Restrained acting, no exaggerated tears.',
'Woman sitting alone beside her small birthday cake slowly lifts her head off her hand, looks toward the empty opposite chair, then lowers her gaze to the unlit candle. Her shoulders sink slightly. Natural blinking and breathing; raindrops move down window. Candle stays unlit.',
'Office woman looking at laptop lifts her eyes toward a coworker off camera, gives a practiced helpful smile and a little nod, types briefly with her free hand, then the smile fades as she looks back at the screen. Background workers move subtly. Restrained mature acting.',
'Woman at bakery counter carefully looks between the cakes, hesitates, then gently points toward the small cake and gives a small self-conscious smile to the shopkeeper off camera. She draws her hand back to the box. No new people in foreground.',
'Woman arriving home with cake box steps slowly through the doorway, gently closes the door behind her, pauses and exhales as her shoulders drop. Keep the cake box intact and level in her hand; preserve hands, outfit and identity. No scene change.',
'Closeup of hands at a birthday cake. Her fingertips carefully straighten the existing single unlit candle, linger over it uncertainly, then slowly withdraw. Her other hand rests on the wooden table. No fire, no new candles, no extra fingers. Keep cake intact.',
'Closeup of woman holding phone. Her eyes scan the screen, thumb starts to type, pauses, then taps backspace; she swallows and slowly raises her eyes with hurt and disappointment. Lips press together, shoulders rise with a small breath. Natural blinking, no crying or talking.',
'Woman alone at birthday table slowly turns from the rain-streaked window toward her phone on the table, reaches toward it but hesitates, pulls her hand back, then lowers her eyes and sighs. Quiet visible emotional acting. The existing candle remains unlit, cake intact.'
];
const base='Animate the supplied original Korean webtoon painting as a refined 2D animated drama. Preserve the same mature woman, chestnut wavy chin-length bob, ivory blouse, face, proportions, wardrobe and painted texture. Fixed camera, one continuous ten-second shot, no cuts, no zoom, no new text, no captions, no photorealistic conversion. The person must visibly act; do not just move the entire picture. ';
const params=i=>['--prompt',base+prompts[i],'--duration','10','--mode','pro','--aspect_ratio','16:9','--sound','off'];
const mode=process.argv[2],selected=process.argv[3]?[Number(process.argv[3])]:prompts.map((_,i)=>i);
if(!['quote','generate','poll','validate'].includes(mode)||selected.some(i=>!Number.isInteger(i)||i<0||i>7))throw Error('quote|generate|poll|validate [0..7]');
if(story.maxHiggsfieldCredits!==140||JSON.stringify(story.approvedEpisodes)!=='[1]')throw Error('Unexpected approval scope');
if(mode==='validate'){console.log(JSON.stringify({shots:8,seconds:80,maxCredits:140,approvedEpisodes:[1]}));process.exit(0);}
await mkdir(join(cache,'motion'),{recursive:true});
const imp=p=>import(pathToFileURL(join(root,p)));
const {cloudHiggsfieldRunner}=await imp('apps/shopshorts/studio-higgsfield-auth.mjs');
const {downloadHiggsfield}=await imp('apps/shopshorts/studio-higgsfield.mjs');
const {runnerRequest}=await imp('apps/credential-broker/runner-client.mjs');
const run=cloudHiggsfieldRunner((p,b)=>runnerRequest('https://cak-credential-broker.guswhd1085.workers.dev','/Users/admin/Library/Application Support/Shopshorts/credential-runner.jwk',p,b),process.env,{root:'/Users/admin/Library/Application Support/Shopshorts'});
const ledger=join(cache,'motion-receipts.json');let receipts={};try{receipts=JSON.parse(await readFile(ledger,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;}
const save=()=>writeFile(ledger,JSON.stringify(receipts,null,2)+'\n');
if(mode==='quote'){for(const i of selected)console.log(JSON.stringify({shot:i,...await run(['generate','cost','kling3_0',...params(i)])}));process.exit(0);}
const waitForAccepted=async(id)=>{
 const deadline=Date.now()+20*60_000;
 while(Date.now()<deadline){
  const response=await run(['generate','get',id]);const job=Array.isArray(response)?response.find(x=>x.id===id):response;
  if(job?.id!==id)throw Error('Unexpected accepted job response');
  if(job.status==='completed')return;
  if(['failed','error','cancelled','rejected'].includes(job.status))throw Error('Accepted job failed; do not reroll');
  await new Promise(resolve=>setTimeout(resolve,10000));
 }
 throw Error('Generation still pending; resume the accepted receipt before any new request');
};
if(mode==='generate')for(const i of selected){
 if(receipts[i]){if(!receipts[i].id)throw Error('Ambiguous prior submission; inspect account history');if(receipts[i].state!=='downloaded')await waitForAccepted(receipts[i].id);continue;}
 const reference=join(source,'art',`shot-${String(i).padStart(2,'0')}.png`);await readFile(reference);
 const quote=await run(['generate','cost','kling3_0',...params(i)]);
 const used=Object.values(receipts).reduce((n,r)=>n+r.credits,0);
 if(!Number.isFinite(quote.credits)||quote.credits>17.5||used+quote.credits>140)throw Error('Approved budget would be exceeded');
 receipts[i]={state:'submitting',credits:quote.credits,model:'kling3_0',prompt:base+prompts[i],reference,at:new Date().toISOString()};await save();
 const created=await run(['generate','create','kling3_0',...params(i),'--start-image',reference]);
 const id=Array.isArray(created)?(typeof created[0]==='string'?created[0]:created[0]?.id):created?.id;
 if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('Unknown submission id; never automatically retry');
 receipts[i]={...receipts[i],id,state:'accepted'};await save();console.log(JSON.stringify({shot:i,id,credits:quote.credits}));
 // Wait for this accepted request before submitting another; preserve account concurrency limits.
 await waitForAccepted(id);
}
// One bounded status sweep. Re-run poll on the same ledger, never create a replacement.
for(const i of selected){
 const r=receipts[i];if(!r?.id)throw Error('No accepted job for shot '+i);if(r.state==='downloaded')continue;
 const response=await run(['generate','get',r.id]);const job=Array.isArray(response)?response.find(x=>x.id===r.id):response;
 if(job?.id!==r.id)throw Error('Unexpected response');
 if(['failed','error','cancelled','rejected'].includes(job.status))throw Error('Provider shot '+i+' '+job.status);
 if(job.status==='completed'){
  const media=await downloadHiggsfield(job.result_url,'video');await writeFile(join(cache,'motion',`shot-${String(i).padStart(2,'0')}.mp4`),media.data);r.state='downloaded';await save();
 }console.log(JSON.stringify({shot:i,state:r.state,status:job.status}));
}
