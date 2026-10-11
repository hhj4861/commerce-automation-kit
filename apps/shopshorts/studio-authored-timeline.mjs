import {RECIPE_ID} from './public/authored-recipes.js';
import {clipSpans,FPS} from './public/editor-model.js';
// Carry the opening across a narration boundary, without adding silence or
// overriding a user's reordered/trimmed timeline.
export function openingCarry(job,timeline,clip){
 if(job.authoredRecipe!==RECIPE_ID)return null;
 const spans=clipSpans(timeline).sort((a,b)=>a.start-b.start),first=spans[0],next=spans[1];
 if(!first||!next||first.clip.sceneId!=='hook'||first.start!==0||first.clip.inFrame!==0||next.clip.id!==clip.id||clip.sceneId!=='sunlight'||clip.inFrame!==0||next.start!==first.end||next.start>=6*FPS)return null;
 return {offset:next.start/FPS,duration:Math.min(6*FPS-next.start,next.end-next.start)/FPS,key:job.assets.hook?.key};
}
