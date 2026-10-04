// Official providers only. Paid submissions are receipt guarded; never auto-resubmit.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const here=dirname(fileURLToPath(import.meta.url));
const story=JSON.parse(await readFile(join(here,'story.json'),'utf8'));
const root=process.env.CAK_ENGINE_ROOT,cache=process.env.VIDEO_CACHE;
if(!root||!cache)throw Error('CAK_ENGINE_ROOT and VIDEO_CACHE required');
await mkdir(cache,{recursive:true});
const save=(n,d)=>writeFile(join(cache,n),JSON.stringify(d,null,2)+'\n');
const imp=p=>import(pathToFileURL(join(root,p)));
const mode=process.argv[2],role=process.argv[3];
if(mode==='tts'){
 if(!story.voices[role])throw Error('Voice role N/S/M required');
 const beats=story.episodes.flatMap(e=>e.beats).filter(b=>b.speaker===role).map(b=>({index:b.voiceIndex,role:'body',durationSec:8,narration:b.text,caption:b.text,visualPrompt:'Original fictional webtoon drama'}));
 const script={briefId:story.id+'-'+role,title:story.title,beats};
 const receipt=join(cache,'tts-'+role+'-dispatch.json');
 try{await readFile(receipt);throw Error('TTS already dispatched; inspect Actions instead of resubmitting')}catch(e){if(e.code!=='ENOENT')throw e;}
 await writeFile(receipt,JSON.stringify({state:'submitting',at:new Date().toISOString(),role,voice:story.voices[role],beats:beats.length}));
 const data={ref:'main',inputs:{script_b64:Buffer.from(JSON.stringify(script)).toString('base64'),voice_id:story.voices[role].id,verify_secrets_only:'false'}};
 const r=spawnSync('gh',['api','repos/hhj4861/commerce-automation-kit/actions/workflows/tts-remote.yml/dispatches','--input','-'],{input:JSON.stringify(data),encoding:'utf8'});
 if(r.status!==0)throw Error('Dispatch unconfirmed; inspect Actions history before retry');
 console.log(JSON.stringify({role,beats:beats.length,state:'dispatched'}));process.exit(0);
}
const {cloudHiggsfieldRunner}=await imp('apps/shopshorts/studio-higgsfield-auth.mjs');
const {downloadHiggsfield}=await imp('apps/shopshorts/studio-higgsfield.mjs');
const {runnerRequest}=await imp('apps/credential-broker/runner-client.mjs');
const run=cloudHiggsfieldRunner((p,b)=>runnerRequest('https://cak-credential-broker.guswhd1085.workers.dev','/Users/admin/Library/Application Support/Shopshorts/credential-runner.jwk',p,b),process.env,{root:'/Users/admin/Library/Application Support/Shopshorts'});
if(mode==='balance'){const r=await run(['account','status']);const safe={credits:r.credits,checkedAt:new Date().toISOString()};await save('balance-'+Date.now()+'.json',safe);console.log(JSON.stringify(safe));process.exit(0);}
if(mode==='model'){console.log(JSON.stringify(await run(['model','get','seedance_2_0'])));process.exit(0);}
const prompts=[
'Animate this exact mature Korean webtoon woman and painted scene, retain her face, illustration style, clothing and camera framing. She holds phone to ear with a small reassuring smile, slowly lowers her eyes, smile fades subtly. Rain runs down window, amber lamp steady, very gentle camera push. Restrained mature drama, six seconds, no cuts, no text, no lip sync, no new person, no photorealism.',
'Animate this exact Korean webtoon cafe two-shot, preserve both women identities and wardrobe. Woman with chestnut bob ivory blouse sits left, woman with black low ponytail rust cardigan right. One gently moves her hand near coffee cup as she speaks, the other listens tensely. Slow deliberate push-in, rain on window, restrained acting, no cuts, no text, maintain illustrated style.',
'Animate this exact illustrated Korean woman at the cafe, same chin-length chestnut bob ivory blouse and gold earrings. She takes a small breath then looks up to the friend across the table with vulnerable steady eyes, slight expressive hand motion. Soft amber lighting, subtle camera push, six seconds no cuts no text, maintain Korean webtoon painting style and character identity.'
];
const selected=role?[Number(role)]:[1,2,3];
let receipts={};try{receipts=JSON.parse(await readFile(join(cache,'higgsfield-receipts.json'),'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;}
const params=n=>['--prompt',prompts[n-1],'--aspect_ratio','16:9','--resolution','1080p','--duration','6','--mode','std','--generate_audio','false'];
if(mode==='cost'){for(const n of selected)console.log(JSON.stringify({episode:n,...await run(['generate','cost','seedance_2_0',...params(n)])}));process.exit(0);}
if(mode!=='generate')throw Error('Use tts N/S/M | balance | model | cost | generate [1/2/3]');
for(const n of selected){
 if(receipts[n]){if(!receipts[n].id)throw Error('Unknown existing submission; inspect provider history');continue;}
 const image=join(cache,'art',`opening-${n}.png`);await readFile(image);
 const cost=await run(['generate','cost','seedance_2_0',...params(n)]);
 const used=Object.values(receipts).reduce((s,r)=>s+r.credits,0);
 if(!Number.isFinite(cost.credits)||used+cost.credits>story.maxHiggsfieldCredits)throw Error('Credit budget exceeded');
 receipts[n]={state:'submitting',credits:cost.credits,prompt:prompts[n-1],reference:image};await save('higgsfield-receipts.json',receipts);
 const created=await run(['generate','create','seedance_2_0',...params(n),'--start-image',image]);
 const id=Array.isArray(created)?(typeof created[0]==='string'?created[0]:created[0]?.id):created?.id;
 if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('Submission id unknown; do not retry');
 receipts[n]={...receipts[n],id,state:'accepted'};await save('higgsfield-receipts.json',receipts);console.log(JSON.stringify({episode:n,id,credits:cost.credits}));
}
const deadline=Date.now()+20*60000;
while(Date.now()<deadline){let pending=false;
 for(const n of selected){const r=receipts[n];if(r.state==='downloaded')continue;
 const response=await run(['generate','get',r.id]);const job=Array.isArray(response)?response.find(x=>x.id===r.id):response;
 if(job?.id!==r.id)throw Error('Unexpected provider response');
 if(['failed','error','cancelled','rejected'].includes(job.status))throw Error('Provider job '+n+' '+job.status);
 if(job.status==='completed'){const media=await downloadHiggsfield(job.result_url,'video');await writeFile(join(cache,`opening-${n}.mp4`),media.data);r.state='downloaded';await save('higgsfield-receipts.json',receipts);console.log('DOWNLOADED',n,media.data.length);}else pending=true;
 }if(!pending)break;await new Promise(r=>setTimeout(r,10000));
}
if(selected.some(n=>receipts[n].state!=='downloaded'))throw Error('Provider pending; resume existing receipts');
