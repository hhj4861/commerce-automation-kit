import {sharedPipeline} from './lib/production-pipeline.js';
import {scenarioBrief} from './lib/studio-scenario.js';
import {createCodexGenerator} from './studio-codex.mjs';
// Thin local client: the same approval, review, budget, receipt and render paths as Studio.
import {readFile,writeFile,mkdir,rename,open,rm} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createProject,validateBrief,validateScenes,validateEdit,changeProject} from './lib/studio.js';
import {hybridPlan} from './public/hybrid-plan.js';
import {continueAutomatic} from './lib/studio-automatic.js';
import {productionPreflight} from './studio-preflight.mjs';
import {executeStudioTask,command} from './studio-runner.mjs';
export function localAssetPath(root,key){
 if(typeof key!=='string'||!key||key.includes('\\')||key.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('잘못된 자산 경로입니다.');
 const base=resolve(root),path=resolve(base,key);
 if(!path.startsWith(base+sep))throw Error('자산은 지정 폴더 내부에 있어야 합니다.');
 return path;
}
export async function runHybridCli(args,env=process.env,{execute=executeStudioTask,scenarioGenerate}={}){
 const value=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
 const file=value('--project'),action=value('--action')||'plan';
 if(!file||!['create','plan','preflight','scenario','media','narration','render'].includes(action))throw Error('Usage: --project project.json --action create|plan|preflight|scenario|media|narration|render [--assets DIR --work DIR --approve-script]');
 const source=resolve(file),lock=source+'.lock';let handle;
 if(action==='create'){
  if(!value('--brief'))throw Error('--brief JSON 경로를 지정하세요.');
  const project=createProject(JSON.parse(await readFile(resolve(value('--brief')),'utf8')));
  await writeFile(source,JSON.stringify(project,null,2),{flag:'wx'});return {ok:true,project:source,id:project.id,paidCalls:0};
 }
 if(!['plan','preflight'].includes(action))handle=await open(lock,'wx');
 try{
  let job=JSON.parse(await readFile(source,'utf8'));
  sharedPipeline(job);
  job.brief=validateBrief(job.brief);
  if(!/^[-a-zA-Z0-9]{1,80}$/.test(job.id||''))throw Error('안전한 프로젝트 ID가 필요합니다.');
  validateBrief(job.brief);if(job.scenes.length)validateScenes(job.scenes);if(job.edit)validateEdit(job.edit,job);const plan=hybridPlan(job);
  if(action==='plan')return {ok:true,plan,pipelineVersion:job.pipelineVersion||'legacy',paidCalls:0};
  if(action==='preflight')return {ok:true,readiness:await productionPreflight({...job,task:{action:'media'}},env,{command}),paidCalls:0};
  const assets=value('--assets'),work=value('--work');if(!assets||!work)throw Error('--assets와 --work 경로를 지정하세요.');
  if(action==='media'&&!args.includes('--approve-script'))throw Error('대본 확인 후 --approve-script로 승인하세요.');
  job=changeProject(job,action,action==='media'?{approved:true}:action==='scenario'?{confirm:true}:{});
  job.task={...job.task,id:randomUUID(),state:'running'};
  const save=async delta=>{Object.assign(job,delta);const tmp=source+'.'+job.task.id+'.tmp';await writeFile(tmp,JSON.stringify(job,null,2));await rename(tmp,source);};
  const io={workDir:resolve(work),readAsset:key=>readFile(localAssetPath(assets,key)),writeAsset:async(key,data)=>{const dest=localAssetPath(assets,key);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,data);}};
  await save({});
  try{
   const result=action==='scenario'?await scenarioBrief(job.brief,env,{generate:scenarioGenerate||createCodexGenerator({env}),onProgress:async phase=>save({task:{...job.task,phase}})}):await execute(job,env,io,save);await save({...result,...(action==='scenario'?{assets:{},edit:null,approved:false,render:null}:{}),task:{...job.task,state:'done'}});
   if(action==='media'){const prepared=continueAutomatic({...job,automation:undefined});await save({edit:prepared.edit});}
  }catch(error){await save({task:{...job.task,state:'failed',error:String(error.message)}});throw error;}
  return {ok:true,action,project:source,plan:hybridPlan(job),...(job.render?.key?{video:localAssetPath(assets,job.render.key)}:{})};
 }finally{if(handle){await handle.close();await rm(lock);}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(await runHybridCli(process.argv.slice(2)),null,2));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
