// Same project factory + Studio task runner as the browser. No fixture renderer.
import {readFile,writeFile,mkdir,copyFile,access} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {validateBrief,validateScenes} from './lib/studio.js';
import {RECIPE_ID} from './public/authored-recipes.js';
import {createAuthoredProject} from './lib/authored-project.js';
import {runHybridCli} from './studio-hybrid-cli.mjs';
import {validateDepthReview} from './lib/explanation-depth.js';
const exec=promisify(execFile),args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1];
if(!args.includes('--project'))throw Error('--project is required');
const file=resolve(get('--project')),action=args.includes('--action')?get('--action'):'plan';
if(action==='create'){
 try{await access(file);throw Error('기존 프로젝트를 덮어쓰지 않습니다.');}catch(e){if(e.code!=='ENOENT')throw e;}
 const p=createAuthoredProject('sapporo-hovering-v1');
 const review=await validateDepthReview(p.depthReview,p.brief,p);if(!review.passed)throw Error('검토를 통과하지 못했습니다.');
 await mkdir(dirname(file),{recursive:true});await writeFile(file,JSON.stringify(p,null,2),{flag:'wx'});console.log(JSON.stringify({id:p.id,project:file,paidCalls:0}));
}else if(action==='import'){
 if(!args.includes('--opening')||!args.includes('--voice-dir')||!args.includes('--assets'))throw Error('--opening --voice-dir --assets are required');
 const p=JSON.parse(await readFile(file,'utf8'));if(p.task||p.approved)throw Error('가져오기는 새 초안에서만 가능합니다.');
 if(!/^[a-f0-9-]{36}$/.test(p.id||'')||p.authoredRecipe!==RECIPE_ID)throw Error('등록된 초안과 안전한 프로젝트 ID가 필요합니다.');
 validateBrief(p.brief);validateScenes(p.scenes);if(!(await validateDepthReview(p.depthReview,p.brief,p)).passed)throw Error('검토를 통과하지 못했습니다.');
 const root=resolve(get('--assets')),dest=join(root,'studio',p.id);await mkdir(dest,{recursive:true});
 const opening=resolve(get('--opening'));const probe=JSON.parse((await exec('ffprobe',['-v','error','-show_streams','-of','json',opening])).stdout);const v=probe.streams.find(s=>s.codec_type==='video');if(!v||!Number.isFinite(Number(v.duration))||Number(v.duration)<6||v.width!==1080||v.height!==1920)throw Error('도입 영상은1080×1920,6초 이상이어야 합니다.');
 await copyFile(opening,join(dest,'opening.mp4'));p.assets.hook={key:`studio/${p.id}/opening.mp4`,kind:'video',type:'video/mp4',source:'owned',name:'재사용 Higgsfield 도입'};
 for(const scene of p.scenes){
  const input=join(resolve(get('--voice-dir')),scene.id+'.mp3'),meta=JSON.parse(await readFile(input+'.json','utf8'));
  if(meta.voiceId!==p.brief.voiceId||meta.text!==scene.narration)throw Error('재사용 음성의 목소리·대본이 다릅니다.');
  const target=join(dest,scene.id+'-voice.mp3');await exec('ffmpeg',['-v','error','-y','-i',input,'-af',`atempo=${p.brief.narrationSpeed}`,'-c:a','libmp3lame','-b:a','192k',target]);
  const duration=Number((await exec('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',target])).stdout);
  p.assets['narration-'+scene.id]={key:`studio/${p.id}/${scene.id}-voice.mp3`,kind:'audio',type:'audio/mpeg',purpose:'narration',source:'ai',voice:p.brief.voiceId,text:scene.narration,narrationSpeed:p.brief.narrationSpeed,duration,name:scene.id};
 }
 await writeFile(file,JSON.stringify(p,null,2));console.log(JSON.stringify({id:p.id,reusedOpening:true,reusedVoiceScenes:p.scenes.length,paidCalls:0}));
}else console.log(JSON.stringify(await runHybridCli(args,process.env),null,2));
