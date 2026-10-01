// Original episode recipe. No reference-video frames or audio are downloaded/reused.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
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
 const script={briefId:brief.id,title:brief.title,beats:brief.scenes.map((s,index)=>({index,role:index?'body':'hook',durationSec:s.duration,narration:s.narration,caption:s.narration,visualPrompt:s.prompt}))};
 const data={ref:'main',inputs:{script_b64:Buffer.from(JSON.stringify(script)).toString('base64'),voice_id:brief.voice,verify_secrets_only:'false'}};
 const r=spawnSync('gh',['api','repos/hhj4861/commerce-automation-kit/actions/workflows/tts-remote.yml/dispatches','--input','-'],{input:JSON.stringify(data),stdio:['pipe','inherit','inherit']});process.exit(r.status??1);
}
throw Error('This episode only generates narration; existing Higgsfield intro is reused.');
