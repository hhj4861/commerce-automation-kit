import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ARCHITECTURE_RENDER,architectureQuality,validateArchitectureScene} from './public/architecture-quality.js';
const exec=promisify(execFile),here=dirname(fileURLToPath(import.meta.url));
const binary=env=>env.SHOPSHORTS_BLENDER_BIN||'blender';
const runtime=env=>({PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:env.TMPDIR||process.env.TMPDIR,TMP:env.TMP||process.env.TMP,TEMP:env.TEMP||process.env.TEMP});
export async function checkArchitectureRuntime(env={}) {
 try {
  await exec(binary(env),['-b','--factory-startup','--python-exit-code','1','--python-expr',"import bpy; assert bpy.app.version >= (4, 2, 0); assert bpy.app.build_options.cycles, 'Cycles required'"],{env:runtime(env),timeout:60000,maxBuffer:1024*1024});
  return true;
 } catch {throw Object.assign(Error('건축학 고품질 렌더에는 Blender 4.2 이상과 Cycles가 필요합니다. 제작 워커의 SHOPSHORTS_BLENDER_BIN을 확인하세요. 낮은 품질로 대체하지 않았습니다.'),{code:'ARCHITECTURE_BLENDER_UNAVAILABLE'});}
}
export async function renderArchitectureScene(job,scene,work,env={}) {
 if(!architectureQuality(job.brief)||!['9:16','16:9'].includes(job.brief.aspect)||!Number.isFinite(scene.duration)||scene.duration<1||scene.duration>30)throw Error('건축학 장면 형식을 확인하세요.');
 const parts=validateArchitectureScene(scene),dir=await mkdtemp(join(work,'architecture-'));
 try {
  const input=join(dir,'scene.json'),target=join(dir,'clip.mp4');
  await writeFile(input,JSON.stringify({scene,parts,aspect:job.brief.aspect,render:ARCHITECTURE_RENDER}));
  await exec(binary(env),['-b','--factory-startup','--python-exit-code','1','--python',join(here,'renderers/architecture.py'),'--','--input',input,'--out',target],{env:runtime(env),timeout:3600000,maxBuffer:8*1024*1024});
  const report=JSON.parse(await readFile(target+'.json','utf8'));
  if(report.engine!=='CYCLES'||report.samples!==48||!report.denoise)throw Error('건축학 렌더 품질 확인에 실패했습니다.');
  return {data:await readFile(target),type:'video/mp4',provider:'architecture-blender',qualityProfile:job.brief.architectureQuality,renderReport:report};
 } finally {await rm(dir,{recursive:true,force:true});}
}
