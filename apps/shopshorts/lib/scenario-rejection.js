// Rejected drafts remain owner-scoped evidence, never approved project scenes.
import {validateBrief, validateScenes} from './studio.js';
import {validateDepthReview} from './explanation-depth.js';
import {validateResearch} from './explainer-production.js';
export const REJECTION_VERSION = 'scenario-rejection-v1';
export async function rejectedScenario(brief, scenario, review) {
  const input = validateBrief(brief);
  if (typeof scenario?.title !== 'string' || !scenario.title.trim() || scenario.title.length > 100) throw Error('Invalid rejected draft');
  const draft = {title:scenario.title, scenes:validateScenes(scenario.scenes,{stripMotion:true}),
    ...(scenario.research ? {research:{...validateResearch(scenario.research),checkedAt:scenario.research.checkedAt}} : {})};
  const checked = await validateDepthReview(review,input,draft);
  if (checked.passed) throw Error('Only rejected reviews may be retained');
  const value = {version:REJECTION_VERSION,brief:input,draft,review:checked};
  if (new TextEncoder().encode(JSON.stringify(value)).length > 112000) throw Error('Rejected draft too large');
  return value;
}
export async function readScenarioRejection(value) {
  if (value?.version !== REJECTION_VERSION) return null;
  try {return await rejectedScenario(value.brief,value.draft,value.review);} catch {return null;}
}
