// Official read-only API; never forward billing details or credentials to clients.
export function sanitizeAudioAccount(value) {
 const state=['ready','unavailable','disconnected'].includes(value?.state)?value.state:'unavailable';
 const result={state,checkedAt:Number.isFinite(Date.parse(value?.checkedAt))?value.checkedAt:null};
 if(state!=='ready')return result;
 result.tier=typeof value.tier==='string'&&/^[a-z0-9_-]{1,40}$/i.test(value.tier)?value.tier:'unknown';
 for(const key of ['used','limit'])result[key]=Number.isSafeInteger(value[key])&&value[key]>=0?value[key]:null;
 result.remaining=result.used!==null&&result.limit!==null?Math.max(0,result.limit-result.used):null;
 return result;
}
export function createAudioAccountReader(env,fetcher=fetch,now=Date.now) {
 let cached,expires=0,pending;
 return async()=>{
  if(cached&&now()<expires)return cached;
  if(pending)return pending;
  pending=(async()=>{
   const checkedAt=new Date(now()).toISOString();
   let value={state:'disconnected',checkedAt};
   if(env.ELEVENLABS_API_KEY){
    try{
     const response=await fetcher('https://api.elevenlabs.io/v1/user/subscription',{headers:{'xi-api-key':env.ELEVENLABS_API_KEY},signal:AbortSignal.timeout(5000)});
     if(!response.ok)throw Error('subscription unavailable');
     const body=await response.json();
     if(typeof body.tier!=='string'||!Number.isSafeInteger(body.character_count)||body.character_count<0||!Number.isSafeInteger(body.character_limit)||body.character_limit<0)throw Error('invalid subscription');
     value={state:'ready',checkedAt,tier:body.tier,used:body.character_count,limit:body.character_limit};
    }catch{value={state:'unavailable',checkedAt};}
   }
   cached=sanitizeAudioAccount(value);expires=now()+(cached.state==='unavailable'?60000:300000);return cached;
  })().finally(()=>{pending=null;});
  return pending;
 };
}
