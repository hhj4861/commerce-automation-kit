import {createDiscoveryClient} from '../../../services/topic-discovery/client.mjs';
import {accountFailureCode,accountFailureMessage} from './llm-account-errors.js';
const unavailable=reason=>{
  const code=['no_accepted_candidates','no_grounded_candidates','search_evidence_missing','no_research_leads','research_evidence_missing'].includes(reason)?'DISCOVERY_NO_ACCEPTED_CANDIDATES':reason==='skipped_by_budget'?'DISCOVERY_BUDGET_LIMIT':reason==='discovery_in_progress'?'DISCOVERY_IN_PROGRESS':'DISCOVERY_UNAVAILABLE';
  return Object.assign(new Error(accountFailureMessage('codex',{code})),{status:503,code});
};
export async function discoverRecommendations(brief,env,{generate,signal,provider,history,subject,requestId,assertConnection,now=new Date(),fetch}={}) {
  if(!subject||!requestId||!assertConnection)throw unavailable('identity_required');
  // Operator opt-in only; never infer review policy from browser planning input.
  const reviewMode=env.DISCOVERY_REVIEW_MODE;
  if(reviewMode && (reviewMode!=='native-llm-v1'||env.DISCOVERY_WORKFLOW!=='research-v2')) throw unavailable('discovery_not_configured');
  const model=(provider==='claude'?env.SHOPSHORTS_CLAUDE_MODEL:env.SHOPSHORTS_CODEX_MODEL)||'provider-default';
  const {topic,direction,...preferences}=brief;
  const requestBrief=(topic||'실제 사례 의외의 원리')+'\n제작 요청사항:\n'+direction+'\n제작 설정:\n'+JSON.stringify(preferences);
  let result;
  try {
  const client=createDiscoveryClient({baseUrl:env.DISCOVERY_URL,apiKey:env.DISCOVERY_API_KEY,subject,
    allowLocalhost:env.DISCOVERY_ALLOW_LOCALHOST==='1',fetch});
    result=await client.discover({...(env.DISCOVERY_WORKFLOW?{workflow:env.DISCOVERY_WORKFLOW}:{}),...(reviewMode?{reviewMode}:{}),profile:'content',category:brief.category,brief:requestBrief,runtime:{provider,model},
      history:history.slice(0,100).map(x=>({title:x.topic,entity:x.caseStudy?.entity||'',answer:x.caseStudy?.mechanism||x.direction||''}))},
      {idempotencyKey:requestId,signal,assertConnection,generate:async prompt=>(await generate(prompt,{signal,draftOnly:true,model:model==='provider-default'?undefined:model})).value});
  } catch(e){if(accountFailureCode(e)!=='UNKNOWN')throw e;throw unavailable(e.code||'unavailable');}
  const accepted=result.candidates.filter(c=>c.decision==='accepted');
  if(result.state!=='complete'||!accepted.length)throw unavailable(result.reasonCodes?.[0]||'no_accepted_candidates');
  const sources=[...new Map(result.evidence.map(e=>[e.url,{title:e.title,url:e.url}])).values()];
  const suggestions=accepted.map(c=>({topic:c.title,direction:c.direction,reason:c.whyItMatters,
    ...(brief.intent==='keywords'?{keyword:c.keyword}:{}),
    ...(brief.category==='건축학'&&brief.focus==='topic'?{caseStudy:{entity:c.entity.slice(0,160),location:c.location.slice(0,120),surprise:c.question.slice(0,300),mechanism:c.answer.slice(0,240),openingVisual:c.openingVisual.slice(0,300),sourceUrls:[...new Set(result.evidence.filter(e=>c.evidenceIds.includes(e.id)).map(e=>e.url))].slice(0,5)}}:{})}));
  const end=now.toISOString();
  return {suggestions,sources,provider,category:brief.category,focus:brief.focus,...(brief.intent?{intent:brief.intent}:{}),checkedAt:end,
    period:{start:end,end},verification:{requestId:result.requestId,rubricVersion:result.rubricVersion,factChecked:false,requiresHumanReview:true,
      held:result.candidates.filter(c=>c.decision==='held').length,rejected:result.candidates.filter(c=>c.decision==='rejected').length}};
}
