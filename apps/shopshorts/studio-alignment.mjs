import {validCaptionAlignment as validAlignment} from './lib/production-pipeline.js';
export {validAlignment};
import {readFile,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {captionPhrases} from './public/video-typography.js';
import {authoredCaptionPhrases,RECIPE_ID} from './public/authored-recipes.js';
const here=dirname(fileURLToPath(import.meta.url));
export const ALIGNMENT_VERSION='whisper-words-v1';
export const scenePhrases=(job,scene)=>job.authoredRecipe===RECIPE_ID?authoredCaptionPhrases(scene):captionPhrases(scene.narration,job.brief.aspect==='9:16'?14:28);
export async function alignNarration(job,scene,audio,work,env,command){
 const output=join(work,audio.hash+'-alignment.json');
 let cached;try{cached=JSON.parse(await readFile(output,'utf8'));}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
 if(validAlignment(cached,scene.narration,audio.duration,scenePhrases(job,scene)))return cached;
 const request=join(work,audio.hash+'-alignment-input.json');
 await writeFile(request,JSON.stringify({text:scene.narration,phrases:scenePhrases(job,scene),duration:audio.duration}));
 await command(env.SHOPSHORTS_ALIGNMENT_PYTHON||'python3',[join(here,'renderers/align-narration.py'),'--audio',audio.file,'--input',request,'--output',output,'--model',env.SHOPSHORTS_WHISPER_MODEL||'small','--cache',env.SHOPSHORTS_WHISPER_CACHE||join(work,'whisper-models')],env,600000);
 const result=JSON.parse(await readFile(output,'utf8'));
 if(!validAlignment(result,scene.narration,audio.duration,scenePhrases(job,scene)))throw Error('대본과 실제 음성의 자막 정렬 검사를 통과하지 못했습니다. 음성을 확인해 주세요.');
 return result;
}
