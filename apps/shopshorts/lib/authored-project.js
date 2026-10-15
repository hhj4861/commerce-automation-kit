import {GATESHEAD_ID,GATESHEAD_BRIEF,GATESHEAD_TITLE,GATESHEAD_SCENES,GATESHEAD_RESEARCH} from '../public/gateshead-recipe.js';
import {review as gatesheadReview} from '../recipes/gateshead-review.js';
import {createProject,validateScenes} from './studio.js';
import {RECIPE_ID,RECIPE_TITLE,RECIPE_SCENES,RECIPE_RESEARCH} from '../public/authored-recipes.js';
import {review} from '../recipes/sapporo-review.js';
export function createAuthoredProject(id){
 if(id===GATESHEAD_ID){const p=createProject(GATESHEAD_BRIEF);return {...p,title:GATESHEAD_TITLE,authoredRecipe:id,scenes:validateScenes(structuredClone(GATESHEAD_SCENES)),research:structuredClone(GATESHEAD_RESEARCH),depthReview:structuredClone(gatesheadReview),automation:{version:2,keyword:GATESHEAD_TITLE,sources:structuredClone(GATESHEAD_RESEARCH.sources)}};}
 if(id!==RECIPE_ID)throw Object.assign(Error('등록된 제작 포맷을 선택하세요.'),{status:400});
 const p=createProject({category:'건축학',topic:RECIPE_TITLE,format:'short',duration:48,productionStyle:'hybrid',workflow:'explainer-v1',maxCredits:54,voiceId:'RU7aSi6lT4uQBXMLgDxK',narrationSpeed:1.1,captionPosition:'bottom',direction:'삿포로 돔 전용 Blender 장면. Higgsfield 도입과 modern-v1 자막. 원리 개념도이며 제작 도면이 아니다.'});
 return {...p,authoredRecipe:RECIPE_ID,scenes:validateScenes(structuredClone(RECIPE_SCENES)),research:structuredClone(RECIPE_RESEARCH),depthReview:structuredClone(review),automation:{version:2,keyword:RECIPE_TITLE,sources:structuredClone(RECIPE_RESEARCH.sources)}};
}
