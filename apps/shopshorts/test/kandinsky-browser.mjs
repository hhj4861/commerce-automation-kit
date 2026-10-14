// Local-only browser verification server. Actual API + AES-GCM vault; only HF/D1 are fixtures.
// Start this then inspect /settings and /kandinsky through the browser tool.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fixture} from './fixtures/kandinsky.mjs';
import {kandinskyApi} from '../lib/kandinsky-service.js';
const f=fixture(),root=resolve(import.meta.dirname,'../public');
const artifact=process.env.KANDINSKY_TEST_DIR;
if(!artifact)throw Error('KANDINSKY_TEST_DIR required');
const mp4=await readFile(resolve(artifact,'fixture.mp4'));
const server=createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,`http://127.0.0.1:${server.address().port}`);
  if(url.pathname==='/test/login') {res.writeHead(302,{'set-cookie':'ss=local-test-auth; HttpOnly; SameSite=Lax; Path=/',location:'/settings'});res.end();return;}
  if(req.headers.cookie!=='ss=local-test-auth'){res.writeHead(401);res.end('Local fixture: open /test/login');return;}
  if(url.pathname==='/test/mode') {f.setMode(url.searchParams.get('value'));res.end('ok');return;}
  if(url.pathname==='/test/counts') {res.setHeader('content-type','application/json');res.end(JSON.stringify({posts:f.calls.filter(x=>x.url.endsWith('/call/generate')).length}));return;}
  if(url.pathname.startsWith('/api/studio/kandinsky/')) {
   const chunks=[];for await(const c of req)chunks.push(c);
   const controller=new AbortController();res.once('close',()=>controller.abort());
   const request=new Request(url,{method:req.method,headers:req.headers,signal:controller.signal,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
   const result=await kandinskyApi(request,f.env,f.call,{fetcher:async(u,i)=>u.includes('/gradio_api/file=')?new Response(mp4,{headers:{'content-type':'video/mp4'}}):f.fetcher(u,i)});
   res.writeHead(result.status,Object.fromEntries(result.headers));for await(const c of result.body||[])res.write(c);res.end();return;
  }
  if(url.pathname.startsWith('/api/')){res.setHeader('content-type','application/json');res.end(JSON.stringify(url.pathname==='/api/jobs'?[]:{}));return;}
  const file=url.pathname==='/settings'?'/index.html':url.pathname==='/kandinsky'?'/kandinsky.html':url.pathname;
  const path=resolve(root,'.'+file);if(!path.startsWith(root+'/'))throw Error('bad path');
  res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf'})[extname(path)]||'application/octet-stream');
  const body=await readFile(path);res.end(extname(path)==='.html'?body.toString().replace('<main ', '<div style="position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#fff3d7;color:#674400;text-align:center;padding:5px;font:12px sans-serif">로컬 UI 검증용 · 실제 토큰을 입력하지 마세요 · 결과 영상은 시험용 샘플입니다.</div><main '):body);
 }catch{if(!res.headersSent)res.writeHead(500);res.end('fixture error');}
});
server.listen(Number(process.env.KANDINSKY_TEST_PORT)||0,'127.0.0.1',()=>console.log(`http://127.0.0.1:${server.address().port}/test/login`));
