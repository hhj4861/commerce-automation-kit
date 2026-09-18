export const CATEGORIES = ['심리학', '건축학', '상품광고', '막장드라마', '역사', '과학', '직접 입력'];
export const VOICES = [{ id: 'none', name: '내레이션 없음' }, { id: 'n2fbxG88jqAoaVPUy3IG', name: 'Yooni · 밝고 또렷한 한국어' }, { id: 'ZRJMGKt2Okf3o9C38eSq', name: 'Claire · 차분한 한국어' }];
export const PLATFORMS = ['youtube', 'instagram', 'tiktok'];
export const busy = job => ['queued', 'running'].includes(job.task?.state);
export function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
const text = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
export function validateBrief(input) {
  if (!CATEGORIES.includes(input.category) || !text(input.topic, 1000)) fail('카테고리와 주제(1~1,000자)를 입력하세요.');
  if (!['short', 'long'].includes(input.format)) fail('숏폼 또는 롱폼을 선택하세요.');
  const duration = Number(input.duration);
  if (!Number.isInteger(duration) || duration < 16 || duration > (input.format === 'short' ? 180 : 600)) fail('영상 길이는 숏폼 16~180초, 롱폼 16~600초입니다.');
  return { category: input.category, topic: input.topic.trim(), format: input.format, duration, direction: String(input.direction || '').slice(0, 2000), aspect: input.format === 'short' ? '9:16' : '16:9' };
}
export function validateScenes(scenes) {
  if (!Array.isArray(scenes) || !scenes.length || scenes.length > 100) fail('장면은 1~100개 필요합니다.');
  const ids = new Set();
  return scenes.map((scene, i) => {
    const id = scene.id || `scene-${i + 1}`;
    if (!/^[a-z0-9-]{1,60}$/.test(id) || ids.has(id)) fail('장면 ID가 중복되거나 잘못되었습니다.');
    ids.add(id);
    if (!text(scene.narration, 1200) || !text(scene.prompt, 2000)) fail(`장면 ${i + 1}의 대사와 장면 설명을 입력하세요.`);
    if (!Number.isFinite(scene.duration) || scene.duration < 1 || scene.duration > 30) fail('장면 길이는 1~30초입니다.');
    if (!['image', 'video'].includes(scene.kind)) fail('이미지 또는 영상을 선택하세요.');
    return { id, narration: scene.narration.trim(), prompt: scene.prompt.trim(), duration: scene.duration, kind: scene.kind };
  });
}
export function validateEdit(input, job) {
  const order = input.order;
  if (!Array.isArray(order) || order.length !== job.scenes.length || new Set(order).size !== order.length || order.some(id => !job.scenes.some(s => s.id === id))) fail('타임라인에는 모든 장면이 한 번씩 포함되어야 합니다.');
  if (!VOICES.some(v => v.id === input.voice)) fail('지원하는 목소리를 선택하세요.');
  if (input.music && (!job.assets[input.music] || job.assets[input.music].kind !== 'audio')) fail('배경음 파일을 다시 선택하세요.');
  const musicVolume = Number(input.musicVolume);
  if (!Number.isFinite(musicVolume) || musicVolume < 0 || musicVolume > 1) fail('배경음 음량은 0~100%입니다.');
  const durations = Object.fromEntries(order.map(id => {
    const duration = Number(input.durations?.[id] ?? job.scenes.find(s => s.id === id).duration);
    if (!Number.isFinite(duration) || duration < 1 || duration > 30) fail('장면 길이는 1~30초입니다.');
    return [id, duration];
  }));
  const total = Object.values(durations).reduce((a, b) => a + b, 0);
  if (total > (job.brief.format === 'short' ? 180 : 600)) fail('선택한 영상 형식의 최대 길이를 넘었습니다.');
  return { order, durations, voice: input.voice, music: input.music || null, musicVolume };
}
export function createProject(input) {
  return { id: crypto.randomUUID(), revision: 0, title: input.topic?.slice(0, 100), brief: validateBrief(input), scenes: [], assets: {}, edit: null, approved: false, render: null, upload: null, task: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}
export function changeProject(original, action, body) {
  const job = structuredClone(original);
  if (busy(job)) fail('현재 작업이 끝난 뒤 수정하세요.', 409);
  if (job.upload) fail('업로드가 접수된 프로젝트는 변경할 수 없습니다. 새 프로젝트를 만드세요.', 409);
  const invalidate = () => { job.approved = false; job.render = null; job.task = null; };
  if (action === 'scenes') {
    const scenes = validateScenes(body.scenes);
    if (scenes.reduce((sum, s) => sum + s.duration, 0) > (job.brief.format === 'short' ? 180 : 600)) fail('장면의 전체 길이가 형식의 최대 길이를 넘었습니다.');
    const old = Object.fromEntries(job.scenes.map(s => [s.id, s]));
    for (const s of scenes) if (old[s.id]?.prompt !== s.prompt || old[s.id]?.kind !== s.kind) delete job.assets[s.id];
    for (const id of Object.keys(old)) if (!scenes.some(s => s.id === id)) delete job.assets[id];
    job.scenes = scenes; job.title = String(body.title || job.title).slice(0, 100); job.edit = null; invalidate();
  } else if (action === 'edit') {
    job.edit = validateEdit(body, job); job.render = null; job.task = null;
  } else if (action === 'scenario') {
    if (body.confirm !== true) fail('대본 생성 요청을 확인하세요.');
    invalidate(); job.task = { action, state: 'queued' };
  } else if (action === 'media') {
    if (body.approved !== true || !job.scenes.length) fail('대본을 검수하고 승인하세요.');
    job.approved = true; job.render = null; job.task = { action, state: 'queued' };
  } else if (action === 'render') {
    if (!job.approved || !job.edit || job.scenes.some(s => !job.assets[s.id])) fail('대본 승인·장면 생성·편집 저장을 먼저 완료하세요.');
    job.render = null; job.task = { action, state: 'queued' };
  } else if (action === 'publish') {
    if (body.reviewed !== true || !job.render || !job.approved) fail('최종 영상을 생성하고 검수 확인을 체크하세요.');
    if (!Array.isArray(body.platforms) || !body.platforms.length || body.platforms.some(p => !PLATFORMS.includes(p))) fail('업로드 플랫폼을 선택하세요.');
    if (job.brief.format === 'long' && body.platforms.some(p => p !== 'youtube')) fail('롱폼 업로드는 YouTube를 지원합니다.');
    if (!['private', 'unlisted', 'public'].includes(body.privacy)) fail('공개 범위를 선택하세요.');
    if (!text(body.title, 100)) fail('게시 제목은 1~100자입니다.');
    job.publication = { platforms: [...new Set(body.platforms)], privacy: body.privacy, title: body.title, description: String(body.description || '').slice(0, 4000) };
    job.task = { action, state: 'queued' };
  } else fail('지원하지 않는 작업입니다.', 404);
  if (job.task?.state === 'queued') job.task = { ...job.task, id: crypto.randomUUID(), requestedAt: new Date().toISOString() };
  return job;
}
