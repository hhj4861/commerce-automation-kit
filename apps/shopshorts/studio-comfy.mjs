import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {localCinemaOptions,localCinemaPrompt} from './public/local-cinema.js';

// Only native local nodes: API/custom execution nodes are intentionally unsupported.
const NODES=new Set(['CheckpointLoaderSimple','CLIPLoader','DualCLIPLoader','UNETLoader','VAELoader','CLIPTextEncode','EmptyLatentImage','EmptyLTXVLatentVideo','LTXVConditioning','LTXVScheduler','ModelSamplingLTXV','KSampler','KSamplerSelect','SamplerCustom','SamplerCustomAdvanced','RandomNoise','BasicGuider','CFGGuider','BasicScheduler','VAEDecode','VAEDecodeTiled','SaveImage','CreateVideo','SaveVideo']);
const MAX=50*1024*1024;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function comfyOrigin(env) {
  let u;try{u=new URL(env.SHOPSHORTS_COMFY_URL||'http://127.0.0.1:8188');}catch{throw Error('ComfyUI 로컬 주소를 확인해 주세요.');}
  if(u.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('무료 생성은 이 컴퓨터의 ComfyUI 루프백 주소만 지원합니다.');
  return u.origin;
}
export function localCapabilities(env) {
  try {comfyOrigin(env);return {configured:!!(env.SHOPSHORTS_COMFY_IMAGE_WORKFLOW||env.SHOPSHORTS_COMFY_VIDEO_WORKFLOW),image:!!env.SHOPSHORTS_COMFY_IMAGE_WORKFLOW,video:!!env.SHOPSHORTS_COMFY_VIDEO_WORKFLOW,verified:false};}
  catch{return {configured:false,image:false,video:false,verified:false};}
}
export function assertLocalTask(job) {
  if(!job.localCinema)return;
  localCinemaOptions(job.localCinema);
  if(job.scenes.some(s=>s.motion))throw Error('무료 로컬 시네마에서는 모션 템플릿을 해제한 일반 장면을 사용해 주세요.');
  if(['webtoon','hybrid','animation'].includes(job.brief.productionStyle))throw Error('무료 로컬 시네마는 일반 이미지·영상 장면을 지원합니다. 웹툰 도입·3D 혼합 제작은 별도 프로젝트에서 사용해 주세요.');
  if(['narration','metadata'].includes(job.task.action))throw Error('무료 로컬 모드에서는 유료 음성·메타데이터 생성을 실행하지 않습니다.');
  if(['media','render'].includes(job.task.action)&&(job.edit?.voice??job.voicePreference)!=='none')throw Error('무료 로컬 모드에서는 목소리를 내레이션 없음으로 선택해 주세요.');
}
function bind(value,variables) {
  if(typeof value==='string'&&/^\{\{[a-z]+\}\}$/.test(value)) {
    const key=value.slice(2,-2);if(!Object.hasOwn(variables,key))throw Error(`지원하지 않는 워크플로 입력: ${key}`);
    return variables[key];
  }
  if(Array.isArray(value))return value.map(v=>bind(v,variables));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,bind(v,variables)]));
  return value;
}
export function compileWorkflow(template,scene,aspect,options) {
  if(!['image','video'].includes(scene.kind)||!['9:16','16:9'].includes(aspect)||typeof scene.prompt!=='string'||!scene.prompt.trim()||scene.prompt.length>10000||!Number.isFinite(scene.duration)||scene.duration<1||scene.duration>30)throw Error('로컬 생성 장면 입력을 확인해 주세요.');
  if(template?.version!==1||!template.prompt||typeof template.prompt!=='object'||Array.isArray(template.prompt)||!template.prompt[template.outputNode])throw Error('ComfyUI API 워크플로와 출력 노드를 지정해 주세요.');
  const profile=template.profile;
  if(!profile||!Number.isInteger(profile.width)||!Number.isInteger(profile.height)||profile.width<64||profile.height<64||profile.width>1920||profile.height>1920||profile.width%32||profile.height%32||!Number.isInteger(profile.fps)||profile.fps<8||profile.fps>30||!Number.isFinite(profile.maxDuration)||profile.maxDuration<1||profile.maxDuration>30)throw Error('워크플로 해상도·FPS·최대 길이 프로필을 확인해 주세요.');
  if(scene.kind==='video'&&scene.duration>profile.maxDuration)throw Error(`워크플로에 설정된 최대 길이는 ${profile.maxDuration}초입니다. 장면을 나눠 주세요.`);
  const settings=localCinemaOptions(options), [width,height]=aspect==='9:16'?[Math.min(profile.width,profile.height),Math.max(profile.width,profile.height)]:[Math.max(profile.width,profile.height),Math.min(profile.width,profile.height)];
  const variables={prompt:localCinemaPrompt(scene.prompt,settings),seed:settings.seed,width,height,fps:profile.fps,frames:Math.ceil((scene.duration*profile.fps-1)/8)*8+1};
  const nodes=Object.values(template.prompt);
  if(!nodes.length||nodes.length>100||nodes.some(n=>!NODES.has(n?.class_type)||!n.inputs||typeof n.inputs!=='object'))throw Error('워크플로에는 지원되는 ComfyUI 로컬 기본 노드만 사용할 수 있습니다.');
  const expected=scene.kind==='video'?'SaveVideo':'SaveImage';
  if(template.prompt[template.outputNode].class_type!==expected)throw Error(`출력 노드는 ${expected}여야 합니다.`);
  const encoded=JSON.stringify(template.prompt);
  for(const name of ['prompt','seed','width','height',...(scene.kind==='video'?['frames','fps']:[])])if(!encoded.includes(`"{{${name}}}"`))throw Error(`워크플로에 {{${name}}} 입력이 필요합니다.`);
  return {prompt:bind(template.prompt,variables),outputNode:String(template.outputNode),width,height,fps:profile.fps,frames:variables.frames,modelLabel:String(template.modelLabel||'로컬 모델').slice(0,120)};
}
async function bounded(response,limit) {
  if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw Error('ComfyUI 응답 크기가 상한을 넘었습니다.');}
  if(!response.body)throw Error('ComfyUI 결과가 비어 있습니다.');
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error('ComfyUI 응답 크기가 상한을 넘었습니다.');chunks.push(chunk);}
  if(!size)throw Error('ComfyUI 결과가 비어 있습니다.');
  return Buffer.concat(chunks);
}
async function request(origin,path,fetcher,body) {
  const r=await fetcher(origin+path,{method:body?'POST':'GET',redirect:'error',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  if(!r.ok){await r.body?.cancel();throw Error(`ComfyUI 요청 실패(${r.status}). 로컬 실행기·모델 설정을 확인해 주세요.`);}
  return r;
}
async function json(origin,path,fetcher,body){return JSON.parse((await bounded(await request(origin,path,fetcher,body),8*1024*1024)).toString('utf8'));}
export async function prepareLocalScene(job,scene,env,{fetcher=fetch}={}) {
  const origin=comfyOrigin(env),file=env[scene.kind==='video'?'SHOPSHORTS_COMFY_VIDEO_WORKFLOW':'SHOPSHORTS_COMFY_IMAGE_WORKFLOW'];
  if(!file)throw Error(`로컬 ${scene.kind==='video'?'영상':'이미지'} 모델 워크플로가 연결되지 않았습니다. 유료 API로 전환하지 않았습니다.`);
  const contents=await readFile(file,'utf8');if(contents.length>1024*1024)throw Error('워크플로 파일이 너무 큽니다.');
  const plan=compileWorkflow(JSON.parse(contents),scene,job.brief.aspect,job.localCinema);
  const installed=await json(origin,'/object_info',fetcher);
  for(const n of Object.values(plan.prompt)){
    const info=installed[n.class_type];if(!info)throw Error(`ComfyUI 기본 노드가 없습니다: ${n.class_type}`);
    for(const [key,schema]of Object.entries(info.input?.required||{})){
      if(!Object.hasOwn(n.inputs,key))throw Error(`워크플로 필수 입력이 없습니다: ${n.class_type}.${key}`);
      if(Array.isArray(schema[0])&&!Array.isArray(n.inputs[key])&&!schema[0].includes(n.inputs[key]))throw Error(`모델 파일 또는 선택값이 설치와 다릅니다: ${n.class_type}.${key}`);
    }
  }
  return {origin,...plan};
}
export async function generateLocalScene(job,scene,env,work,checkpoint,{fetcher=fetch,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),timeoutMs=30*60000}={}) {
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(scene.id||''))throw Error('장면 ID를 확인해 주세요.');
  const plan=await prepareLocalScene(job,scene,env,{fetcher});
  const fingerprint=hash({plan,generation:job.mediaVersions?.[scene.id]});
  const jobs=job.mediaJobs||={}, receipt=join(work,`${scene.id}-${fingerprint}.comfy.json`);
  let operation=jobs[scene.id]?.fingerprint===fingerprint?jobs[scene.id]:null;
  // File errors never silently turn a possibly accepted job into a new submission.
  if(!operation?.id)try{const saved=JSON.parse(await readFile(receipt,'utf8'));if(saved.fingerprint===fingerprint)operation=saved;}catch(e){if(e.code!=='ENOENT')throw Error('로컬 생성 접수 기록을 확인해 주세요.');}
  const save=async op=>{const temp=receipt+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(op),{mode:0o600});await rename(temp,receipt);operation=op;jobs[scene.id]=op;job.mediaJobs=jobs;await checkpoint({mediaJobs:structuredClone(jobs)});};
  if(operation?.state==='submitting'&&!operation.id)throw Error('접수 응답이 불확실합니다. ComfyUI 대기열을 확인해 주세요. 자동 중복 생성은 하지 않습니다.');
  if(operation?.state==='failed')throw Error('로컬 모델 실행에 실패했습니다. 실행기 오류를 해결하고 장면 설정을 변경해 주세요.');
  if(!operation){
    await save({provider:'comfyui-local',fingerprint,state:'submitting'});
    const accepted=await json(plan.origin,'/prompt',fetcher,{prompt:plan.prompt,client_id:randomUUID()});
    if(!/^[a-f0-9-]{36}$/i.test(accepted.prompt_id||'')||Object.keys(accepted.node_errors||{}).length)throw Error('ComfyUI 접수 결과를 확인해 주세요.');
    await save({...operation,id:accepted.prompt_id,state:'accepted'});
  }
  const deadline=now()+timeoutMs;
  while(now()<deadline){
    const history=await json(plan.origin,`/history/${operation.id}`,fetcher), entry=history[operation.id];
    if(entry?.status?.status_str==='error'){await save({...operation,state:'failed'});throw Error('로컬 모델 실행에 실패했습니다. ComfyUI에서 메모리·모델 오류를 확인해 주세요.');}
    if(entry?.status?.completed===true){
      const out=entry.outputs?.[plan.outputNode],files=scene.kind==='video'?[...(out?.videos||[]),...(out?.images||[]),...(out?.gifs||[])]:out?.images||[];
      const file=files.find(f=>scene.kind==='video'?/\.mp4$/i.test(f.filename||''):/\.png$/i.test(f.filename||''));
      if(!file||file.type!=='output'||!file.filename||/[\\/\x00-\x1f]/.test(file.filename)||String(file.subfolder||'').split(/[\\/]/).some(p=>p==='..')||/^[\\/]/.test(file.subfolder||''))throw Error('ComfyUI 출력 파일을 확인해 주세요.');
      const query=new URLSearchParams({filename:file.filename,subfolder:file.subfolder||'',type:'output'});
      const r=await request(plan.origin,`/view?${query}`,fetcher),data=await bounded(r,MAX),type=scene.kind==='video'?'video/mp4':'image/png';
      if(scene.kind==='video'?data.subarray(4,8).toString()!=='ftyp':!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('로컬 출력이 요청한 PNG/MP4 형식과 다릅니다.');
      await save({...operation,state:'completed'});
      return {data,type,provider:'comfyui-local',providerJobId:operation.id,generation:{requestedWidth:plan.width,requestedHeight:plan.height,requestedFps:plan.fps,model:plan.modelLabel,settings:localCinemaOptions(job.localCinema),apiCost:0,qualityVerified:false}};
    }
    await sleep(1500);
  }
  throw Error('로컬 영상 생성이 아직 진행 중입니다. 다시 요청하면 같은 접수 번호로 이어서 확인합니다.');
}
