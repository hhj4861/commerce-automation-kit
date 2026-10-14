import assert from 'node:assert/strict';
import {kandinskyApi} from '../../lib/kandinsky-service.js';
import {huggingFaceAccount} from '../../../credential-broker/huggingface.mjs';
import {HOST} from '../../public/kandinsky-api.js';
export function fixture() {
  const rows=new Map();
  const env={SHOPSHORTS_TOKEN:'local-test-auth',VAULT_KEY:{get:async()=>Buffer.alloc(32,17).toString('base64')},DB:{prepare(sql){return{bind(...args){return{
    first:async()=>rows.get(args[0])||null,
    run:async()=>{let changes=0;if(sql.startsWith('INSERT')){if(!rows.has(args[0])){rows.set(args[0],{revision:1,payload:args[1]});changes=1;}}
      else if(sql.startsWith('UPDATE')){const row=rows.get(args[2]);if(row?.revision===args[3]){rows.set(args[2],{revision:row.revision+1,payload:args[0]});changes=1;}}return{meta:{changes}};}
  };}};}}};
  const token='hf_SyntheticFixture12345',calls=[],media=`${HOST}/gradio_api/file=/tmp/result.mp4`;
  let mode='ok';
  const fetcher=async(url,init)=>{
    calls.push({url,method:init.method||'GET'});assert.equal(init.headers.get('authorization'),`Bearer ${token}`);assert.equal(init.redirect,'error');
    if(url.endsWith('whoami-v2'))return Response.json({type:'user',isPro:mode==='paid',canPay:false,orgs:[],name:'fixture-free'});
    if(url.endsWith('/info')){
      if(mode==='tls')throw new TypeError('fetch failed',{cause:{code:'UNABLE_TO_VERIFY_LEAF_SIGNATURE'}});
      return Response.json({named_endpoints:{'/generate':{parameters:['prompt','use_beautifier','seed','image'].map(parameter_name=>({parameter_name})),returns:[{},{},{},{}]}}});
    }
    if(url.endsWith('/upload'))return Response.json(['/tmp/frame.png']);
    if(url.endsWith('/call/generate')){if(mode==='uncertain')throw new TypeError('lost');return Response.json({event_id:'event123'});}
    if(url.includes('/call/generate/'))return new Response(mode==='quota'?'event: error\ndata: "GPU quota exceeded"\n\n':`event: complete\ndata: ${JSON.stringify([{video:{url:media}},'생성 결과','ignored','ignored'])}\n\n`);
    if(url===media)return new Response(new Uint8Array([0,0,0,12,102,116,121,112,109,112,52,50]),{headers:{'content-type':'video/mp4'}});
    throw Error('unexpected endpoint');
  };
  const call=(owner,op,input)=>huggingFaceAccount(env,owner,op,input);
  const request=(path,method='GET',body,headers={})=>new Request(`https://shop.test/api/studio/kandinsky/${path}`,{method,headers:{cookie:'ss=local-test-auth',...headers},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
  const api=(...args)=>kandinskyApi(request(...args),env,call,{fetcher});
  const save=()=>api('account','PUT',{token},{'content-type':'application/json'});
  const generate=()=>{const form=new FormData();form.set('prompt','고양이');form.set('seed','42');return api('generate','POST',form);};
  return{env,rows,token,calls,call,request,api,save,generate,fetcher,setMode:value=>mode=value};
}
