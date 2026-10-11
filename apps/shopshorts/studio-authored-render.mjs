import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {authoredSpec} from './public/authored-recipes.js';
const exec=promisify(execFile),here=dirname(fileURLToPath(import.meta.url));
export async function renderAuthoredScene(job,scene,work,env={}){
 const recipe=authoredSpec(scene.hybrid?.authored,scene);
 if(!recipe||job.brief.category!=='건축학'||job.brief.aspect!=='9:16'||!Number.isFinite(scene.duration)||scene.duration<1||scene.duration>30)throw Error('등록 장면의 형식과 길이를 확인하세요.');
 const source=join(here,'renderers/sapporo-hovering.py'),sourceHash=createHash('sha256').update(await readFile(source)).digest('hex');
 const dir=join(work,'authored-'+recipe.shot),timeline=join(dir,'timeline.json');await mkdir(dir,{recursive:true});
 await writeFile(timeline,JSON.stringify({beats:[{id:'hook',duration:6},{id:recipe.shot,duration:scene.duration}]}));
 // Only the bundled allow-listed model executes, never a request-supplied path or code.
 await exec(env.SHOPSHORTS_BLENDER_BIN||'blender',['-b','--factory-startup','--python-exit-code','1','--python',source,'--','--out',dir,'--timeline',timeline,'--shot',recipe.shot,'--percent','100','--samples','48'],{env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:env.TMPDIR||process.env.TMPDIR},timeout:3600000,maxBuffer:64*1024*1024});
 const report=JSON.parse(await readFile(join(dir,'render-manifest.json'),'utf8')),shot=report.shots.find(s=>s.shot===recipe.shot),data=await readFile(join(dir,recipe.shot+'.mp4'));
 if(report.sourceHash!==sourceHash||report.samples!==48||report.percentage!==100||shot?.frames!==Math.round(scene.duration*24)||shot.sha256!==createHash('sha256').update(data).digest('hex'))throw Error('등록 장면의 렌더 품질 또는 파일 검증에 실패했습니다.');
 return {data,type:'video/mp4',provider:'authored-blender',qualityProfile:recipe.id,renderReport:{...report,recipe}};
}
