// Original episode recipe. No reference-video frames or audio are downloaded/reused.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const here=dirname(fileURLToPath(import.meta.url));
const brief=JSON.parse(await readFile(join(here,'brief.json'),'utf8'));
const root=process.env.CAK_ENGINE_ROOT;if(!root)throw Error('CAK_ENGINE_ROOT required');
const cache=process.env.VIDEO_CACHE;if(!cache)throw Error('VIDEO_CACHE required');
await mkdir(cache,{recursive:true});
const save=(name,data)=>writeFile(join(cache,name),JSON.stringify(data,null,2)+'\n');
const imp=p=>import(pathToFileURL(join(root,p)));
const mode=process.argv[2];
if(mode==='tts'){
 if(!brief.voice)throw Error('Voice choice required');
 const script={briefId:brief.id,title:brief.title,beats:brief.scenes.map((s,index)=>({index,role:index?'body':'hook',durationSec:12,narration:s.narration,caption:s.narration,visualPrompt:s.prompt}))};
 const data={ref:'main',inputs:{script_b64:Buffer.from(JSON.stringify(script)).toString('base64'),voice_id:brief.voice,verify_secrets_only:'false'}};
 const r=spawnSync('gh',['api','repos/hhj4861/commerce-automation-kit/actions/workflows/tts-remote.yml/dispatches','--input','-'],{input:JSON.stringify(data),stdio:['pipe','inherit','inherit']});process.exit(r.status||0);
}
const {cloudHiggsfieldRunner}=await imp('apps/shopshorts/studio-higgsfield-auth.mjs');
const {higgsfieldPlan,downloadHiggsfield}=await imp('apps/shopshorts/studio-higgsfield.mjs');
const {runnerRequest}=await imp('apps/credential-broker/runner-client.mjs');
const run=cloudHiggsfieldRunner((p,b)=>runnerRequest('https://cak-credential-broker.guswhd1085.workers.dev',process.env.CAK_RUNNER_KEY_FILE||'/Users/admin/Library/Application Support/Shopshorts/credential-runner.jwk',p,b),process.env);
const job={brief:{category:'건축학',topic:brief.title,aspect:brief.aspect,productionStyle:'cinematic',workflow:'explainer-v1'},visualStyle:brief.visualStyle,scenes:brief.scenes};
const selected=brief.scenes.filter(s=>s.kind==='video'&&(!process.argv[3]||s.id===process.argv[3]));
let receipts={};try{receipts=JSON.parse(await readFile(join(cache,'media-receipts.json'),'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;}
if(mode==='cost'){
 let total=0;for(const s of selected){const p=higgsfieldPlan(s,brief.aspect,job);const c=await run(['generate','cost',p.model,'--prompt',p.prompt,'--aspect_ratio',p.aspect,'--resolution',p.resolution,'--duration',String(p.duration),'--mode','std','--generate_audio','false']);total+=c.credits;console.log(JSON.stringify({id:s.id,credits:c.credits}));}console.log({total});process.exit(0);
}
if(mode!=='generate')throw Error('Use cost|generate [scene]|tts');
for(const s of selected){
 if(receipts[s.id]){if(!receipts[s.id].id)throw Error('Unknown submission: inspect history before resubmission');continue;}
 const p=higgsfieldPlan(s,brief.aspect,job),params=['--prompt',p.prompt,'--aspect_ratio',p.aspect,'--resolution',p.resolution,'--duration',String(p.duration),'--mode','std','--generate_audio','false'];
 const cost=await run(['generate','cost',p.model,...params]);
 const used=Object.values(receipts).reduce((n,r)=>n+r.credits,0);
 if(!Number.isFinite(cost.credits)||used+cost.credits>brief.maxHiggsfieldCredits)throw Error('Credit cap exceeded');
 receipts[s.id]={state:'submitting',credits:cost.credits,model:p.model,prompt:p.prompt};await save('media-receipts.json',receipts);
 const created=await run(['generate','create',p.model,...params]);
 const id=Array.isArray(created)?(typeof created[0]==='string'?created[0]:created[0]?.id):created?.id;
 if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('Unknown submission: do not auto-retry');
 receipts[s.id]={...receipts[s.id],id,state:'accepted'};await save('media-receipts.json',receipts);console.log(JSON.stringify({scene:s.id,id,credits:cost.credits}));
}
const deadline=Date.now()+20*60000;
while(Date.now()<deadline){
 let pending=false;
 for(const s of selected){const r=receipts[s.id];if(r.state==='downloaded')continue;
 const result=await run(['generate','get',r.id]);const status=Array.isArray(result)?result.find(x=>x.id===r.id):result;
 if(status?.id!==r.id)throw Error('Unexpected result id');
 if(['failed','error','cancelled','rejected'].includes(status.status))throw Error(`Scene ${s.id}: ${status.status}; no paid retry`);
 if(status.status==='completed'){const media=await downloadHiggsfield(status.result_url,'video');await writeFile(join(cache,s.id+'.mp4'),media.data);r.state='downloaded';await save('media-receipts.json',receipts);console.log(JSON.stringify({scene:s.id,state:r.state,bytes:media.data.length}));}
 else pending=true;
 }if(!pending)break;await new Promise(r=>setTimeout(r,10000));
}
if(selected.some(s=>receipts[s.id].state!=='downloaded'))throw Error('Pending provider job; rerun resumes existing receipt');
