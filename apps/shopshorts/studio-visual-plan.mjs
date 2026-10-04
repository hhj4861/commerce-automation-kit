import {suggestedDescription} from './public/shorts-policy.js';
// CLI and web use the same scene validator and visual-direction compiler. No paid calls.
import {readFile,writeFile} from 'node:fs/promises';
import {scenarioResult} from './lib/studio-scenario.js';
import {VISUAL_QUALITY} from './lib/visual-direction.js';
import {sceneMediaPrompt} from './lib/scene-media-prompt.js';
const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1];
if(!args.includes('--project')||!args.includes('--out'))throw Error('Usage: node studio-visual-plan.mjs --project project.json --out plan.json');
const project=JSON.parse(await readFile(get('--project'),'utf8'));
const brief={...project.brief,visualQuality:VISUAL_QUALITY};
const result=scenarioResult(project,brief);const job={...project,...result,brief};
await writeFile(get('--out'),JSON.stringify({...result,brief,suggestedDescription:suggestedDescription(job),renderPrompts:result.scenes.map(scene=>({id:scene.id,renderer:scene.motion?'motion-hyperframes':brief.productionStyle==='animation'?'animation-svg':'configured-media-provider',prompt:sceneMediaPrompt(job,scene)}))},null,2));
console.log(JSON.stringify({ok:true,scenes:result.scenes.length,quality:result.visualQuality.version,paidCalls:0}));
