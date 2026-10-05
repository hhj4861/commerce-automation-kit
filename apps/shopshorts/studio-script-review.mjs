// No API/paid calls. Use --prompt with a connected LLM, then --review before TTS/media.
import {readFile} from 'node:fs/promises';
import {reviewPrompt,validateDepthReview,depthFailure} from './lib/explanation-depth.js';
const args=process.argv.slice(2);
const get=key=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};
try {
  if(!get('--project') || (args.includes('--prompt')===Boolean(get('--review')))) throw Error('Usage: --project draft.json (--prompt | --review review.json)');
  const project=JSON.parse(await readFile(get('--project'),'utf8'));
  if(!project.brief || !project.title) throw Error('draft.json requires brief, title and scenes (id, narration, prompt, duration).');
  if(args.includes('--prompt')) console.log(await reviewPrompt(project.brief,project));
  else {
    const review=await validateDepthReview(JSON.parse(await readFile(get('--review'),'utf8')),project.brief,project);
    console.log(JSON.stringify(review,null,2));
    if(!review.passed) throw depthFailure();
  }
} catch(error) { console.error(error.code==='SCENARIO_DEPTH_INVALID'?error.message:'대본·검토 파일과 CLI 인자를 확인하세요.'); process.exitCode=1; }
