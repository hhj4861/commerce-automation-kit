import {fortuneProject,FORTUNE_THEMES,fortuneEdit} from './fortune.js';
import {changeProject,busy,fail,VOICES} from './studio.js';
import {narrationReady} from '../public/narration-audio.js';
import {llmOwner} from './llm-account-api.js';
const json=(v,status=200)=>Response.json(v,{status,headers:{'cache-control':'no-store'}});
export async function fortuneApi(request,env,store,parts){
 const owner=await llmOwner(request,env);if(!owner)fail('Google 로그인이 필요합니다.',401);
 if(parts.length===1&&request.method==='POST'){
  const input=await request.json();const project=await fortuneProject(input,owner),old=await store.get(project.id);
  if(old)return json({project:old,reused:true});
  // Reuse an owner's established character across daily episodes, under a new owned media key.
  const previous=(await store.list()).find(p=>p.fortune?.owner===owner&&p.fortune.characterFingerprint===project.fortune.characterFingerprint&&p.assets[p.fortune.referenceSceneId]);
  if(previous){
   try{const original=previous.assets[previous.fortune.referenceSceneId],response=await store.readAsset(original.key,request);
    const type=response.headers.get('content-type')?.split(';')[0];
    if(response.ok&&['image/png','image/jpeg','image/webp'].includes(type)){const bytes=await response.arrayBuffer();if(bytes.byteLength&&bytes.byteLength<=50*1024*1024){
     const key=`studio/${project.id}/fortune-character-${project.fortune.characterFingerprint}.png`;await store.writeAsset(key,bytes,type);
     project.assets[project.fortune.referenceSceneId]={...original,key,type};project.fortune.referenceReused=true;
    }}
   }catch{project.fortune.referenceReused=false;}
  }
  try{await store.create(project);}catch(e){const concurrent=await store.get(project.id);if(concurrent)return json({project:concurrent,reused:true});throw e;}
  return json({project},201);
 }
 if(parts[1]==='config'&&request.method==='GET'){
  const capabilities=await store.capabilities();return json({themes:FORTUNE_THEMES,capabilities,execution:store.execution,manseCalculation:false,profilePhotoInput:false});
 }
 const id=parts[1];if(!/^[a-f0-9-]{36}$/.test(id||''))fail('에피소드가 없습니다.',404);
 const project=await store.get(id);if(!project?.fortune||project.fortune.owner!==owner)fail('에피소드가 없습니다.',404);
 if(parts.length===2&&request.method==='GET')return json({project});
 const body=await request.json();if(body.revision!==project.revision)fail('변경된 에피소드를 다시 불러오세요.',409);
 let next=structuredClone(project);
 if(parts[2]==='generate'&&request.method==='POST'){
  if(busy(project))return json({project},202);
  const caps=await store.capabilities();if(caps.fortuneEngine!==1)fail('기존 제작 워커에 운세 생성 엔진 업데이트가 필요합니다.',503);if(store.execution==='cloud-worker'&&(!Number.isFinite(Date.parse(caps.workerAt))||Date.now()-Date.parse(caps.workerAt)>90000))fail('제작 워커가 오프라인입니다.',503);
  if(caps.mediaProvider!=='higgsfield'||!caps.image||(project.fortune.input.output==='video'&&!caps.video))fail('Higgsfield 생성 엔진을 연결해 주세요. Google 생성은 비용 통제 어댑터 확인 후 연결합니다.',503);
  if(!Number.isFinite(body.maxCredits)||body.maxCredits<=0||body.maxCredits>10000)fail('이번 에피소드의 최대 생성 크레딧을 입력하세요.');
  if(body.approved!==true)fail('운세 원문·대본·사용량을 확인해 주세요.');
  if(project.assets&&project.fortune.sceneIds.every(id=>project.assets[id]))return json({project,reused:true});
  next.fortune.paidAuthorization={provider:'higgsfield',maxCredits:body.maxCredits,fingerprint:project.fortune.fingerprint};
  next=changeProject(next,'media',{approved:true});
 }else if(parts[2]==='render'&&request.method==='POST'){
  if(project.fortune.input.output==='webtoon')fail('웹툰은 그림이 완성되면 바로 볼 수 있습니다.');
  if(busy(project))return json({project},202);
  if(!project.fortune.sceneIds.every(id=>project.assets[id]))fail('장면 생성을 먼저 완료하세요.');
  const voice=body.voice||'none';if(!VOICES.some(v=>v.id===voice))fail('지원하는 목소리를 선택하세요.');
  next.voicePreference='none';next.edit=fortuneEdit(next);next.edit.voice=voice;next.voicePreference=voice;
  if(!narrationReady(next,next.edit)){
   const caps=await store.capabilities();if(!caps.voice)fail('음성 생성 서비스를 연결하세요.',503);
   const characters=next.scenes.filter(s=>next.fortune.sceneIds.includes(s.id)).reduce((n,s)=>n+s.narration.length,0);
   if(characters>2500)fail('에피소드 음성 원문이 너무 깁니다. 2,500자 이내로 줄이세요.');
   if(caps.audioAccount?.state==='ready'&&caps.audioAccount.remaining<characters)fail('남은 음성 사용량이 부족합니다. 무음을 선택하거나 사용량을 확인하세요.');
   next=changeProject(next,'narration',{});
  }
  else {next.edit=fortuneEdit(next);next=changeProject(next,'render',{});}
 }else fail('지원하지 않는 요청입니다.',404);
 next.revision=project.revision+1;next.updatedAt=new Date().toISOString();
 if(!await store.cas(next,project.revision))fail('다른 요청에서 수정되었습니다.',409);return json({project:next},202);
}
