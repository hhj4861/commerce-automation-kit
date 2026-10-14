// Whitelisted body motion templates (HyperFrames). Shared by the studio UI, the Pages API
// validation and the local production worker. A scene can only name a template ID from this
// list and fill its declared variables — never HTML, script, URLs or file paths.
// Rendering happens only on the local worker (studio-motion.mjs); Pages never runs Chromium.

const SAFE_ICON = ['shield', 'ring', 'train', 'building', 'layers'];

export const MOTION_TEMPLATES = [
  {id: 'chapter', label: '챕터 전환', duration: 3.5, vars: [
    {id: 'chapterNo', type: 'string', label: '챕터 번호', max: 3, default: '02'},
    {id: 'title', type: 'string', label: '챕터 제목', max: 11, default: '다음 이야기'},
    {id: 'accent', type: 'color', label: '강조색', default: '#c95d47'},
  ]},
  {id: 'countup', label: '숫자 비교', duration: 5, vars: [
    {id: 'heading', type: 'string', label: '제목', max: 12, default: '얼마나 다를까'},
    {id: 'labelA', type: 'string', label: '항목 A', max: 8, default: '항목 A'},
    {id: 'valueA', type: 'number', label: '값 A', min: 0, max: 9999, default: 20},
    {id: 'labelB', type: 'string', label: '항목 B', max: 8, default: '항목 B'},
    {id: 'valueB', type: 'number', label: '값 B', min: 0, max: 9999, default: 35},
    {id: 'unit', type: 'string', label: '단위', max: 3, default: 'm'},
    // The note is shown with the numbers for the whole scene; keep it when values are illustrative.
    {id: 'note', type: 'string', label: '출처·주석', max: 16, default: '예시값 · 실제 수치 아님'},
  ]},
  {id: 'summary', label: '핵심 요약', duration: 5, vars: [
    {id: 'heading', type: 'string', label: '제목', max: 12, default: '한눈에 정리'},
    {id: 'icon1', type: 'enum', label: '아이콘 1', options: SAFE_ICON, default: 'layers'},
    {id: 'label1', type: 'string', label: '항목 1', max: 8, default: '첫 번째'},
    {id: 'icon2', type: 'enum', label: '아이콘 2', options: SAFE_ICON, default: 'ring'},
    {id: 'label2', type: 'string', label: '항목 2', max: 8, default: '두 번째'},
    {id: 'icon3', type: 'enum', label: '아이콘 3', options: SAFE_ICON, default: 'shield'},
    {id: 'label3', type: 'string', label: '항목 3', max: 8, default: '세 번째'},
  ]},
];
export const MOTION_ICON_LABELS = {shield: '방패', ring: '원형 링', train: '열차', building: '건물', layers: '지층'};

const byId = Object.fromEntries(MOTION_TEMPLATES.map(t => [t.id, t]));
export const motionTemplate = id => Object.prototype.hasOwnProperty.call(byId, id) ? byId[id] : null;
export const motionDefaults = id => Object.fromEntries((motionTemplate(id)?.vars || []).map(v => [v.id, v.default]));

function bad(message) { throw Object.assign(new Error(message), {status: 400}); }

// Text is placed with textContent, so markup cannot execute; URLs and markup-looking text are
// still rejected so a scene never carries links or code into a published video.
const FORBIDDEN_TEXT = /[\x00-\x1f\x7f<>]|:\/\/|\b(?:javascript|data|file):/i;

// Returns a normalized {template, vars} or throws a 400 with a user-facing reason.
export function motionSpec(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) bad('모션 템플릿 설정을 확인해 주세요.');
  const extra = Object.keys(value).filter(k => !['template', 'vars'].includes(k));
  if (extra.length) bad('모션 템플릿에는 템플릿과 변수만 지정할 수 있어요.');
  const template = motionTemplate(value.template);
  if (!template) bad('지원하지 않는 모션 템플릿입니다.');
  const input = value.vars === undefined ? {} : value.vars;
  if (!input || typeof input !== 'object' || Array.isArray(input)) bad('모션 템플릿 변수를 확인해 주세요.');
  const unknown = Object.keys(input).filter(k => !template.vars.some(v => v.id === k));
  if (unknown.length) bad(`${template.label} 템플릿에 없는 항목입니다: ${unknown.join(', ')}`);
  const vars = {};
  for (const def of template.vars) {
    const raw = Object.prototype.hasOwnProperty.call(input, def.id) ? input[def.id] : def.default;
    if (def.type === 'string') {
      if (typeof raw !== 'string' || !raw.trim()) bad(`${def.label}을(를) 입력해 주세요.`);
      const text = raw.trim();
      if ([...text].length > def.max) bad(`${def.label}은(는) ${def.max}자 이하로 적어 주세요.`);
      if (FORBIDDEN_TEXT.test(text)) bad(`${def.label}에는 주소·코드·특수 제어문자를 넣을 수 없어요.`);
      vars[def.id] = text;
    } else if (def.type === 'number') {
      const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
      // Integers only: the count-up shows whole numbers, so a decimal would be displayed rounded.
      if (typeof n !== 'number' || !Number.isInteger(n) || n < def.min || n > def.max) bad(`${def.label}은(는) ${def.min}~${def.max} 사이 정수여야 해요.`);
      vars[def.id] = n;
    } else if (def.type === 'color') {
      if (typeof raw !== 'string' || !/^#[0-9a-f]{6}$/i.test(raw)) bad(`${def.label}은(는) #RRGGBB 형식이어야 해요.`);
      vars[def.id] = raw.toLowerCase();
    } else if (def.type === 'enum') {
      if (!def.options.includes(raw)) bad(`${def.label}을(를) 목록에서 골라 주세요.`);
      vars[def.id] = raw;
    }
  }
  return {template: template.id, vars};
}

// Scene-level rules: motion scenes are video clips rendered locally, never the opening scene
// (the opening stays a Higgsfield shot) and not mixed into the illustrated-animation style.
export function validateMotionScene(scene, index, {animationStyle = false} = {}) {
  if (scene.motion === undefined) return undefined;
  if (animationStyle) bad('손그림 애니메이션 프로젝트에서는 모션 템플릿을 사용할 수 없어요.');
  if (index === 0) bad('첫 장면(도입부)은 Higgsfield 영상으로 유지해야 해요. 모션 템플릿은 두 번째 장면부터 쓸 수 있어요.');
  if (scene.kind !== 'video') bad('모션 템플릿 장면은 영상으로 만들어야 해요.');
  return motionSpec(scene.motion);
}
