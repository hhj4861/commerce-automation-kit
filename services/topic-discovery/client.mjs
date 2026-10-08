// Backend-only transport. No rubric, search, acceptance decision or credentials migration.
export class DiscoveryError extends Error {
  constructor(code,status=503) {super(code);this.code=code;this.status=status;}
}
export function createDiscoveryClient({baseUrl,apiKey,subject,allowLocalhost=false,fetch:fetcher=globalThis.fetch}) {
  if(typeof window!=='undefined'&&typeof document!=='undefined') throw new DiscoveryError('server_only');
  let base;
  try {
    base=new URL(baseUrl);
    if(base.username||base.password||base.search||base.hash||!(base.protocol==='https:'||(allowLocalhost&&base.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(base.hostname)))) throw Error();
    if(typeof apiKey!=='string'||apiKey.length<32||/[\r\n]/.test(apiKey)||!/^[a-f0-9]{64}$/.test(subject)) throw Error();
  } catch {throw new DiscoveryError('discovery_not_configured');}
  const root=base.href.replace(/\/$/,'');
  async function request(path,body,key,signal) {
    try {
      const timeout=AbortSignal.timeout(120000);
      const response=await fetcher(root+path,{method:body===undefined?'GET':'POST',redirect:'manual',cache:'no-store',
        headers:{Authorization:'Bearer '+apiKey,'X-Discovery-Subject':subject,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},
        ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:signal?AbortSignal.any([signal,timeout]):timeout});
      const reader=response.body?.getReader(); if(!reader) throw Error();
      let size=0; const chunks=[];
      for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>2097152){await reader.cancel();throw Error();}chunks.push(value);}
      const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
      const data=JSON.parse(new TextDecoder().decode(bytes));
      if(!response.ok) throw new DiscoveryError(typeof data.error==='string'&&/^[a-z_]{1,80}$/.test(data.error)?data.error:'discovery_unavailable',response.status);
      if(typeof data.requestId!=='string'||!Array.isArray(data.candidates)||!Array.isArray(data.evidence)) throw Error();
      return data;
    } catch(e){if(e instanceof DiscoveryError)throw e;throw new DiscoveryError(signal?.aborted?'cancelled':'discovery_unavailable');}
  }
  return {
    async discover(input,{idempotencyKey,generate,assertConnection,signal}={}) {
      // The authenticated adapter must recheck ownership/provider/model/state here and before submission.
      if(typeof assertConnection!=='function'||typeof generate!=='function') throw new DiscoveryError('generation_adapter_required');
      await assertConnection(input.runtime);
      let result=await request('/v1/discover',input,idempotencyKey,signal);
      const stages=input.workflow==='research-v2'?['research','draft',...(input.reviewMode==='native-llm-v1'?['review']:[])]:[undefined];
      const seen=new Set();
      if(result.state==='complete'||result.state==='held')return result;
      if(result.state!=='awaiting_generation')throw new DiscoveryError('discovery_in_progress',409);
      const offset=stages.indexOf(result.action?.stage);
      if(offset<0)throw new DiscoveryError('invalid_generation_action');
      for(let index=offset;index<stages.length;index++){
        const stage=stages[index];
        if(result.state==='complete'||result.state==='held')return result;
        if(result.state!=='awaiting_generation') throw new DiscoveryError('discovery_in_progress',409);
        const path='/v1/discover/'+encodeURIComponent(result.requestId);
        const action=result.action;
        if(!action||typeof action.id!=='string'||seen.has(action.id)||action.stage!==stage||typeof action.prompt!=='string'||action.prompt.length>350000||action.runtime?.provider!==input.runtime.provider||action.runtime?.model!==input.runtime.model||(input.workflow==='research-v2'&&result.usage?.generationClaims!==index)) throw new DiscoveryError('invalid_generation_action');
        await assertConnection(input.runtime);
        result=await request(path+'/claim',{actionId:action.id},undefined,signal);
        if(result.state!=='generating'||result.action?.id!==action.id||result.action?.stage!==stage||result.action?.prompt!==action.prompt||result.action?.runtime?.provider!==input.runtime.provider||result.action?.runtime?.model!==input.runtime.model||(input.workflow==='research-v2'&&result.usage?.generationClaims!==index+1))throw new DiscoveryError('invalid_generation_action');
        seen.add(action.id);
        await assertConnection(input.runtime);
        let output;
        try {output=await generate(action.prompt,{signal,model:input.runtime.model});}
        catch(e){
          // Not tied to the caller's signal: a cancelled job must still release the server-side scope lock.
          await request(path+'/complete',{actionId:action.id,runtime:input.runtime,generationError:true},undefined,AbortSignal.timeout(10000)).catch(()=>{});
          throw new DiscoveryError('generation_failed');
        }
        await assertConnection(input.runtime);
        result=await request(path+'/complete',{actionId:action.id,runtime:input.runtime,output},undefined,signal);
      }
      if(result.state!=='complete'&&result.state!=='held')throw new DiscoveryError('discovery_step_limit');
      return result;
    },
    get:(id,{signal}={})=>request('/v1/discover/'+encodeURIComponent(id),undefined,undefined,signal),
  };
}
