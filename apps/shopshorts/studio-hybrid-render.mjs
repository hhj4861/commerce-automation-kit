import {copyFile,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {webtoonPlan} from './lib/webtoon-plan.js';
import {hybridScene} from './public/hybrid-plan.js';
const exec=promisify(execFile),here=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url);
export function validateHybridRender(scene){
 if(!/^[a-z0-9-]{1,60}$/.test(scene.id)||!Number.isFinite(scene.duration)||scene.duration<1||scene.duration>30)throw Error('혼합 장면 ID와 길이를 확인하세요.');
 const webtoon=webtoonPlan(scene.webtoon),hybrid=hybridScene(scene.hybrid,{...scene,webtoon});
 return {...scene,webtoon,...(hybrid?{hybrid}:{})};
}
// Only this reviewed renderer and GSAP execute. LLM/user input is escaped JSON, never JS/HTML.
export async function hybridComposition(scene,aspect,renderer){
 scene=validateHybridRender(scene);
 if(!['motion','3d'].includes(renderer)||!['9:16','16:9'].includes(aspect))throw Error('혼합 렌더 방식을 확인하세요.');
 const source=(await readFile(join(here,'public/hybrid-graphics.js'),'utf8')).replace('export function hybridSvg','function hybridSvg');
 const payload=JSON.stringify({scene,aspect,renderer}).replace(/</g,'\\u003c');
 const font=(await readFile(join(here,'public/NanumGothic-Regular.ttf'))).toString('base64');
 const [w,h]=aspect==='9:16'?[1080,1920]:[1920,1080];
 return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; font-src 'self' data:; img-src data:;"><style>@font-face{font-family:NanumGothic;src:url('data:font/ttf;base64,${font}') format('truetype')}html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:#10212d}</style></head><body><main id="stage" data-composition-id="hybrid" data-width="${w}" data-height="${h}" data-duration="${scene.duration}"></main><script src="./assets/gsap.min.js"></script><script>${source}
 const data=${payload},state={t:0},draw=()=>{document.getElementById('stage').innerHTML=hybridSvg(data.scene,data.aspect,state.t,data.renderer);};draw();
 const timeline=gsap.timeline({paused:true});timeline.to(state,{t:data.scene.duration,duration:data.scene.duration,ease:'none',onUpdate:draw});window.__timelines={hybrid:timeline};
 </script></body></html>`;
}
export async function checkHybridRuntime(env={}){
 const cli=env.SHOPSHORTS_MOTION_CLI||join(dirname(require.resolve('hyperframes/package.json')),'bin/hyperframes.mjs');
 const gsap=env.SHOPSHORTS_MOTION_GSAP||join(dirname(require.resolve('gsap/package.json')),'dist/gsap.min.js');
 await Promise.all([readFile(cli),readFile(gsap)]);
 const version=await exec(env.SHOPSHORTS_MOTION_NODE||process.execPath,['-p','process.versions.node'],{env:{PATH:process.env.PATH,HOME:process.env.HOME},timeout:15000});
 if(Number(version.stdout.trim().split('.')[0])<22)throw Error('자동 혼합 렌더에는 Node 22 이상이 필요합니다.');
 return true;
}
export async function renderHybridScene(job,scene,work,env={},renderer='motion'){
 const html=await hybridComposition(scene,job.brief.aspect,renderer);
 const cli=env.SHOPSHORTS_MOTION_CLI||join(dirname(require.resolve('hyperframes/package.json')),'bin/hyperframes.mjs');
 const gsap=env.SHOPSHORTS_MOTION_GSAP||join(dirname(require.resolve('gsap/package.json')),'dist/gsap.min.js');
 const node=env.SHOPSHORTS_MOTION_NODE||process.execPath;
 const runtime={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:env.TMPDIR||process.env.TMPDIR,TMP:env.TMP||process.env.TMP,TEMP:env.TEMP||process.env.TEMP,HYPERFRAMES_NO_TELEMETRY:'1',HYPERFRAMES_SKIP_SKILLS:'1',HYPERFRAMES_EXTRACT_CACHE_DIR:join(work,'hybrid-cache')};
 const version=await exec(node,['-p','process.versions.node'],{env:runtime,timeout:15000});
 if(Number(version.stdout.split('.')[0])<22)throw Error('자동 혼합 렌더에는 Node 22 이상이 필요합니다.');
 const project=join(work,scene.id+'-hybrid'),target=join(work,scene.id+'-hybrid.mp4');
 await mkdir(join(project,'assets'),{recursive:true});
 try{
  await writeFile(join(project,'index.html'),html);
  await copyFile(gsap,join(project,'assets/gsap.min.js'));
  await copyFile(join(here,'public/NanumGothic-Regular.ttf'),join(project,'assets/font.ttf'));
  await exec(node,[cli,'render',project,'-o',target,'--fps','30','--workers','2','--strict','--quiet'],{env:runtime,timeout:240000,maxBuffer:1024*1024});
  return {data:await readFile(target),type:'video/mp4',provider:renderer==='3d'?'hybrid-3d':'hybrid-motion'};
 }finally{await rm(project,{recursive:true,force:true});await rm(target,{force:true});}
}
