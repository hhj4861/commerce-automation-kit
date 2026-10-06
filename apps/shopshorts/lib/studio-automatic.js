import {createProject, changeProject, validateEdit, fail} from './studio.js';
import {llmOwner} from './llm-account-api.js';
import {recommendationInput, parseRecommendations} from './studio-recommendations.js';
import {startScenario} from './studio-scenario-account.js';
import {normalizeEdit} from '../public/editor-model.js';
import {cinematicEdit} from './cinematic-production.js';

// Resolve the recommendation from the signed-in owner's vault. Browser-supplied
// titles, sources, categories and owner identifiers are never trusted here.
export async function startAutomatic(request, env, store, input, call) {
  if (!call) fail('AI 계정 연결 서비스를 확인해 주세요.', 503);
  const owner = await llmOwner(request, env);
  if (!owner) fail('로그인이 필요합니다.', 401);
  if (!/^[a-f0-9-]{36}$/.test(input?.recommendationId || '') || !Number.isInteger(input.index) || input.index < 0 || input.index > 2) fail('생성할 키워드를 선택하세요.');
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${owner}:${input.recommendationId}:${input.index}`)))].map(n => n.toString(16).padStart(2,'0')).join('').slice(0,32);
  const id = `${digest.slice(0,8)}-${digest.slice(8,12)}-${digest.slice(12,16)}-${digest.slice(16,20)}-${digest.slice(20)}`;
  // Stable IDs make retries after a lost response safe, even after history expiry.
  const existing = await store.get(id);
  if (existing) return {project: existing};
  const response = await call(owner, 'recommendation', {id: input.recommendationId});
  const saved = response.recommendation;
  if (response.error) fail(response.error, response.status || 502);
  if (saved?.state !== 'done' || saved.input?.intent !== 'keywords' || saved.result?.intent !== 'keywords') fail('키워드 검색이 완료된 뒤 영상을 만들어 주세요.', 409);
  const brief = recommendationInput(saved.input);
  const result = parseRecommendations(saved.result, true, 'keywords');
  const selected = result.suggestions[input.index];
  const project = {...createProject({...brief, topic: selected.topic, direction: selected.direction, productionStyle:brief.productionStyle||'cinematic'}), id,
    ...(brief.voiceId?{voicePreference:brief.voiceId}:{}),
    automation: {version: brief.workflow?2:1, recommendationId: input.recommendationId, keyword: selected.keyword, ...(selected.caseStudy?{caseStudy:selected.caseStudy}:{}), sources: result.sources, checkedAt: saved.result.checkedAt}};
  try { await store.create(project); }
  catch (error) { const concurrent = await store.get(id); if (concurrent) return {project: concurrent}; throw error; }
  try { return {project: await startScenario(request, env, store, project, {confirm:true}, call)}; }
  catch (error) {
    // Keep a reviewable project and a visible retry path on connection failures.
    return {project: await store.get(id) || project, error: error.status ? error.message : '대본 생성 요청을 확인하지 못했어요. 작업에서 다시 시도해 주세요.'};
  }
}

export function continueAutomatic(project) {
  if (project.task?.action !== 'media' || project.task.state !== 'done') return project;
  if (!project.automation) {
    // Manual hybrid editing starts with measured speech/captions but never auto-renders.
    if (project.brief.productionStyle!=='webtoon' || project.edit || !project.approved || project.scenes.some(s=>!project.assets[s.id])) return project;
    return {...project,edit:validateEdit(cinematicEdit(project),project)};
  }
  if (!project.approved || project.scenes.some(scene => !project.assets[scene.id])) fail('완료되지 않은 장면이 있어 영상을 조립할 수 없습니다.', 409);
  const next = structuredClone(project);
  if(!next.edit && ['cinematic','animation','webtoon'].includes(next.brief.productionStyle))next.edit=validateEdit(cinematicEdit(next),next);
  if (!next.edit) {
    const edit = normalizeEdit(next);
    for (const clip of edit.clips) {
      const text = next.scenes.find(scene => scene.id === clip.sceneId).narration;
      const chunkSize = Math.max(80, Math.ceil(text.length / Math.floor(300 / next.scenes.length)));
      const chunks = text.match(new RegExp(`[\\s\\S]{1,${chunkSize}}`, 'gu')) || [];
      let offset = 0;
      chunks.forEach((chunk, i) => {
        const startFrame = Math.round(offset / text.length * clip.outFrame); offset += chunk.length;
        edit.captions.push({id:`${clip.id}-caption-${i}`, clipId:clip.id, source:'script', text:chunk, startFrame,
          endFrame:Math.round(offset / text.length * clip.outFrame), font:'gothic', size:56, color:'#ffffff', position:'bottom', background:true});
      });
    }
    next.edit = validateEdit(edit, next);
  }
  // This CAS transition is executed by the worker, never by a browser poll.
  // Render includes narration; publishing always requires a separate review.
  return changeProject(next, 'render', {});
}
