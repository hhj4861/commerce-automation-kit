import {sceneMediaPrompt} from './lib/scene-media-prompt.js';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { higgsfieldCommand } from './studio-higgsfield-auth.mjs';

export function higgsfieldPlan(scene,aspect,job={brief:{aspect}}) {
  const image=scene.kind==='image';
  return {model:image?'nano_banana_2':'seedance_2_0',kind:scene.kind,
    prompt:sceneMediaPrompt(job,scene),generation:job.mediaVersions?.[scene.id],
    aspect,resolution:image?'2k':'1080p',...(image?{}:{duration:Math.max(4,Math.min(15,Math.ceil(scene.duration)))})};
}
function parameters(plan){return ['--prompt',plan.prompt,'--aspect_ratio',plan.aspect,'--resolution',plan.resolution,...(plan.kind==='video'?['--duration',String(plan.duration),'--mode','std','--generate_audio','false']:[])];}
function jobId(value){
  const id=Array.isArray(value)?(typeof value[0]==='string'?value[0]:value[0]?.id):value?.id;
  if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('Higgsfield 접수 번호를 확인하지 못했습니다. 생성 내역을 확인해 주세요.');
  return id;
}
export async function downloadHiggsfield(url,kind,fetcher=fetch){
  for(let redirects=0;redirects<4;redirects++){
    const target=new URL(url);
    if(target.protocol!=='https:' || target.username || target.password || (target.port&&target.port!=='443') || !(/\.cloudfront\.net$/.test(target.hostname)||/(^|\.)higgsfield\.ai$/.test(target.hostname)))throw Error('Higgsfield 미디어 다운로드 주소를 확인할 수 없습니다.');
    const response=await fetcher(target,{redirect:'manual',signal:AbortSignal.timeout(180000)});
    if([301,302,303,307,308].includes(response.status)){url=new URL(response.headers.get('location'),target).href;continue;}
    const type=response.headers.get('content-type')?.split(';')[0];
    if(!response.ok || !(kind==='image'?['image/png','image/jpeg','image/webp']:['video/mp4']).includes(type))throw Error('Higgsfield 결과 파일을 다운로드하지 못했습니다. 기존 생성 결과로 다시 시도하세요.');
    const limit=50*1024*1024;
    if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw Error('생성 미디어가 50MB를 초과했습니다.');}
    const reader=response.body.getReader(),chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('생성 미디어가 50MB를 초과했습니다.');}chunks.push(value);}
    if(!size)throw Error('Higgsfield 결과 파일이 비어 있습니다.');
    return {data:Buffer.concat(chunks),type};
  }
  throw Error('Higgsfield 다운로드 리디렉션을 확인해 주세요.');
}
export async function generateHiggsfieldScene(job,scene,env,work,checkpoint,{run=args=>higgsfieldCommand(args,env),fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now}={}){
  const plan=higgsfieldPlan(scene,job.brief.aspect,job),params=parameters(plan);
  const fingerprint=createHash('sha256').update(JSON.stringify(plan)).digest('hex');
  const receipt=join(work,`${scene.id}-${fingerprint}.higgsfield.json`);
  const jobs=job.mediaJobs ||= {};
  let operation=jobs[scene.id]?.fingerprint===fingerprint?jobs[scene.id]:null;
  if(!operation?.id){
    try{const saved=JSON.parse(await readFile(receipt,'utf8'));if(saved.fingerprint===fingerprint)operation=saved;}catch(error){if(error.code!=='ENOENT')throw Error('Higgsfield 접수 기록을 확인해 주세요. 중복 생성을 막기 위해 중단했습니다.');}
  }
  const save=async value=>{operation=value;jobs[scene.id]=value;await checkpoint({mediaJobs:structuredClone(jobs)});};
  if(operation?.id && jobs[scene.id]?.id!==operation.id)await save(operation);
  if(operation?.state==='submitting'&&!operation.id)throw Error('Higgsfield 접수 여부를 확인해야 합니다. 생성 내역을 확인할 때까지 중복 요청하지 않습니다.');
  if(!operation || operation.state==='failed'){
    const estimate=await run(['generate','cost',plan.model,...params]);
    if(!Number.isFinite(estimate?.credits)||estimate.credits<0)throw Error('Higgsfield 사용 크레딧을 확인하지 못했습니다.');
    await save({provider:'higgsfield',fingerprint,state:'submitting',model:plan.model,credits:estimate.credits});
    // Intent is durable BEFORE the paid request. Unknown responses never auto-resubmit.
    const created=await run(['generate','create',plan.model,...params]);
    const accepted={...operation,id:jobId(created),state:'accepted'};
    await writeFile(receipt,JSON.stringify(accepted),{mode:0o600});
    await save(accepted);
  }
  const deadline=now()+20*60000;
  while(now()<deadline){
    const response=await run(['generate','get',operation.id]);
    const result=Array.isArray(response)?response.find(r=>r.id===operation.id):response;
    if(result?.id!==operation.id)throw Error('Higgsfield 생성 상태를 확인하지 못했습니다. 기존 요청은 유지됩니다.');
    if(['failed','error','cancelled','canceled','rejected'].includes(result.status)){
      await save({...operation,state:'failed'});
      await writeFile(receipt,JSON.stringify(operation),{mode:0o600});
      throw Error('Higgsfield에서 장면 생성을 완료하지 못했습니다. 장면 설명을 확인한 뒤 다시 시도하세요.');
    }
    if(result.status==='completed'){
      const media=await downloadHiggsfield(result.result_url,scene.kind,fetcher);
      return {...media,provider:'higgsfield',providerJobId:operation.id};
    }
    await sleep(5000);
  }
  throw Error('Higgsfield에서 아직 장면을 만들고 있습니다. 다시 시도하면 기존 생성 결과를 확인합니다.');
}
