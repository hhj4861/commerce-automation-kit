// Thin local client: the same approval, review, budget, receipt and render paths as Studio.
import {readFile,writeFile,mkdir,rename,open,rm} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {validateBrief,validateScenes,validateEdit,changeProject} from './lib/studio.js';
import {hybridPlan,isHybrid} from './public/hybrid-plan.js';
import {continueAutomatic} from './lib/studio-automatic.js';
import {executeStudioTask} from './studio-runner.mjs';
export function localAssetPath(root,key){
 if(typeof key!=='string'||!key||key.includes('\\')||key.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('잘못된 자산 경로입니다.');
 const base=resolve(root),path=resolve(base,key);
 if(!path.startsWith(base+sep))throw Error('자산은 지정 폴더 내부에 있어야 합니다.');
 return path;
}
export async function runHybridCli(args,env=process.env,{execute=executeStudioTask}={}){
 const value=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
 const file=value('--project'),action=value('--action')||'plan';
 if(!file||!['plan','media','render'].includes(action))throw Error('Usage: --project project.json --action plan|media|render [--assets DIR --work DIR --approve-script]');
 const source=resolve(file),lock=source+'.lock';let handle;
 if(action!=='plan')handle=await open(lock,'wx');
 try{
  let job=JSON.parse(await readFile(source,'utf8'));
  job.brief=validateBrief(job.brief);
  if(!isHybrid(job.brief)||!/^[-a-zA-Z0-9]{1,80}$/.test(job.id||''))throw Error('hybrid 프로젝트와 안전한 ID가 필요합니다.');
  validateBrief(job.brief);validateScenes(job.scenes);if(job.edit)validateEdit(job.edit,job);const plan=hybridPlan(job);
  if(action==='plan')return {ok:true,plan,paidCalls:0};
  const assets=value('--assets'),work=value('--work');if(!assets||!work)throw Error('--assets와 --work 경로를 지정하세요.');
  if(action==='media'&&!args.includes('--approve-script'))throw Error('대본 확인 후 --approve-script로 승인하세요.');
  job=changeProject(job,action,action==='media'?{approved:true}:{});
  job.task={...job.task,id:randomUUID(),state:'running'};
  const save=async delta=>{Object.assign(job,delta);const tmp=source+'.'+job.task.id+'.tmp';await writeFile(tmp,JSON.stringify(job,null,2));await rename(tmp,source);};
  const io={workDir:resolve(work),readAsset:key=>readFile(localAssetPath(assets,key)),writeAsset:async(key,data)=>{const dest=localAssetPath(assets,key);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,data);}};
  await save({});
  try{
   const result=await execute(job,env,io,save);await save({...result,task:{...job.task,state:'done'}});
   if(action==='media'){const prepared=continueAutomatic({...job,automation:undefined});await save({edit:prepared.edit});}
  }catch(error){await save({task:{...job.task,state:'failed',error:String(error.message)}});throw error;}
  return {ok:true,action,project:source,plan:hybridPlan(job),...(job.render?.key?{video:localAssetPath(assets,job.render.key)}:{})};
 }finally{if(handle){await handle.close();await rm(lock);}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(await runHybridCli(process.argv.slice(2)),null,2));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
