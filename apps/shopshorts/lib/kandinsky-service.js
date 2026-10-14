import {llmOwner} from './llm-account-api.js';
import {sameOrigin} from './google-auth.js';
import {KandinskyClient, KandinskyError, validateInput, videoUrl, MAX_IMAGE} from '../public/kandinsky-api.js';

const ROOT = '/api/studio/kandinsky';
const json = (body, status=200) => Response.json(body,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
const fail = (message,status=400) => {throw Object.assign(new Error(message),{status, safe:true});};
function message(error) {
  if (error.safe) return error.message;
  if (error.status === 409) return '계정 또는 생성 상태가 변경됐습니다. 새로고침해 확인하세요. 진행 중인 접수 기록은 새 영상 만들기에서 정리할 수 있습니다.';
  return '계정 보관 서비스에 연결하지 못했습니다. 잠시 후 다시 시도하세요.';
}
async function bounded(request,max) {
  const reader=request.body?.getReader(); if(!reader)fail('요청 내용이 없습니다.');
  const chunks=[];let size=0;
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();fail('요청이 너무 큽니다.',413);}chunks.push(value);}
  return new Blob(chunks);
}
async function inputJson(request) {
  if(!request.headers.get('content-type')?.startsWith('application/json'))fail('JSON 요청이 필요합니다.',415);
  try {return JSON.parse(await (await bounded(request,4096)).text());}catch(e){if(e.safe)throw e;fail('입력 내용을 확인하세요.');}
}
function upstreamFailure(e) {
  const code=e?.cause?.code || e?.code || '';
  if (/CERT|TLS|SSL|ISSUER|UNABLE_TO_VERIFY_LEAF_SIGNATURE/.test(code))return '공식 데모의 인증서를 확인하지 못했습니다. 서버 네트워크의 인증서 신뢰 설정을 확인해야 합니다.';
  if(e?.name==='TimeoutError')return '공식 데모 응답 시간이 초과됐습니다. 접수된 작업은 결과 확인으로 이어가세요.';
  if(e?.name==='AbortError')return '결과 확인을 중단했습니다. 생성 접수 기록은 유지됩니다.';
  if(e instanceof TypeError)return 'Shopshorts 서버에서 공식 데모에 연결하지 못했습니다. 서비스 상태나 서버 네트워크를 확인하세요.';
  if(e instanceof SyntaxError)return '공식 데모가 올바른 응답을 보내지 않았습니다. 서비스 상태를 확인하세요.';
  // KandinskyClient emits sanitized errors, never upstream bodies or credentials.
  return e instanceof KandinskyError ? e.message : '공식 데모 연결을 처리하지 못했습니다. 잠시 후 접수 상태를 다시 확인하세요.';
}
async function provider(action) {
  try{return await action();}catch(e){fail(upstreamFailure(e),502);}
}

export async function kandinskyApi(request,env,call,{fetcher=fetch}={}) {
  const url=new URL(request.url);
  if(!url.pathname.startsWith(ROOT+'/'))return null;
  try {
    const owner=await llmOwner(request,env);
    if(!owner)return json({error:'로그인이 필요합니다.'},401);
    if(!sameOrigin(request))return json({error:'다른 사이트에서 요청할 수 없습니다.'},403);
    const op=url.pathname.slice(ROOT.length+1),method=request.method;
    const account=(operation,input={})=>call(owner,operation,input);
    if(op==='account'&&method==='GET')return json(await account('status'));
    if(op==='account'&&method==='PUT') {
      const body=await inputJson(request),token=typeof body?.token==='string'?body.token.trim():'';
      if(!/^hf_[A-Za-z0-9]{10,200}$/.test(token))fail('Hugging Face 읽기 토큰을 입력하세요.');
      const user=await provider(()=>new KandinskyClient({token,fetchImpl:fetcher}).checkFreeAccount());
      return json(await account('save',{token,name:user.name || ''}));
    }
    if(op==='account'&&method==='DELETE')return json(await account('disconnect'));
    if(op==='clear'&&method==='POST') {
      const body=await inputJson(request);return json(await account('clear',{id:body?.id}));
    }
    if(!['generate','result','media'].includes(op))return json({error:'잘못된 요청입니다.'},404);
    if(method!==(op==='generate'?'POST':'GET'))return json({error:'지원하지 않는 요청입니다.'},405);
    const saved=await account('credential');
    if(!saved.token)fail('설정에서 무료 Hugging Face 계정을 먼저 연결하세요.',428);
    const c=new KandinskyClient({token:saved.token,fetchImpl:fetcher,signal:request.signal});
    if(op==='generate') {
      if(!request.headers.get('content-type')?.startsWith('multipart/form-data;'))fail('영상 입력 형식이 올바르지 않습니다.',415);
      const body=await bounded(request,MAX_IMAGE+32000);
      let form;try {form=await new Response(body,{headers:{'content-type':request.headers.get('content-type')}}).formData();}catch{fail('영상 입력을 읽지 못했습니다.');}
      const input={prompt:form.get('prompt'),seed:form.get('seed'),beautify:form.get('beautify')==='true'};
      try{validateInput(input);}catch(e){fail(e.message);}
      const image=form.get('image');
      if(image&&(!['image/png','image/jpeg','image/webp'].includes(image.type)||!image.size||image.size>MAX_IMAGE))fail('10MB 이하 PNG·JPG·WebP 이미지만 사용할 수 있습니다.');
      const id=crypto.randomUUID();await account('reserve',{id,revision:saved.revision});
      let submitting=false;
      try {
        const eventId=await provider(()=>c.submit(input,image,async()=>{
          // Persist before POST. A dropped acknowledgement must never trigger a second POST.
          submitting=true;await account('update',{id,expected:'checking',phase:'uncertain'});
        }));
        return json(await account('update',{id,expected:'uncertain',phase:'submitted',eventId}),202);
      }catch(e){
        if(!submitting)await account('update',{id,expected:'checking',phase:'failed'}).catch(()=>{});
        return json({error:message(e)},e.status||503);
      }
    }
    const job=saved.job;
    if(!job||job.id!==url.searchParams.get('id'))return json({error:'이 계정의 생성 기록을 찾지 못했습니다.'},404);
    if(op==='result') {
      if(!job.eventId||!['submitted','complete'].includes(job.phase))fail('결과를 확인할 수 있는 접수 번호가 없습니다.',409);
      const abort=new AbortController();
      const client=new KandinskyClient({token:saved.token,fetchImpl:fetcher,signal:AbortSignal.any([request.signal,abort.signal])});
      const stream=new ReadableStream({start(controller){
        const send=value=>controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`));
        const timer=setInterval(()=>{try{send({pending:true});}catch{}},15000);
        (async()=>{
          try{
            const result=job.phase==='complete'?{url:job.url,prompt:job.prompt}:await client.wait(job.eventId,()=>send({pending:true}));
            if(job.phase!=='complete')await account('update',{id:job.id,expected:'submitted',phase:'complete',...result});
            send({complete:true,prompt:result.prompt});
          }catch(e){send({error:e.status?message(e):upstreamFailure(e)});}
          finally{clearInterval(timer);try{controller.close();}catch{}}
        })().catch(()=>{clearInterval(timer);});
      },cancel(){abort.abort();}});
      return new Response(stream,{headers:{'content-type':'text/event-stream','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
    }
    if(job.phase!=='complete'||!job.url)fail('아직 다운로드할 영상이 없습니다.',409);
    const range=request.headers.get('range');
    if(range&&!/^bytes=\d*-\d*$/.test(range))fail('영상 범위가 올바르지 않습니다.',416);
    const media=await provider(()=>c.request(videoUrl(job.url),{headers:range?{range}:{}},120000));
    const headers={'content-type':'video/mp4','cache-control':'private, no-store','x-content-type-options':'nosniff','accept-ranges':'bytes'};
    for(const name of ['content-length','content-range'])if(media.headers.has(name))headers[name]=media.headers.get(name);
    const max=60*1024*1024;
    if(Number(headers['content-length'])>max){await media.body.cancel();fail('영상이 60MB를 넘어 다운로드를 중단했습니다.',413);}
    let count=0,head=new Uint8Array(),checked=!!range;
    return new Response(media.body.pipeThrough(new TransformStream({transform(chunk,controller){
      count+=chunk.length;if(count>max)throw Error('media limit');
      if(checked){controller.enqueue(chunk);return;}
      const combined=new Uint8Array(head.length+chunk.length);combined.set(head);combined.set(chunk,head.length);head=combined;
      if(head.length>=12){if(String.fromCharCode(...head.slice(4,8))!=='ftyp')throw Error('invalid MP4');checked=true;controller.enqueue(head);head=new Uint8Array();}
    },flush(){if(!checked)throw Error('invalid MP4');}})),{status:media.status,headers});
  }catch(e){return json({error:message(e)},e.status||503);}
}
