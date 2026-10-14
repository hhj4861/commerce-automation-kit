// Media-step controls for body motion templates. Pure HTML builders and form readers so the
// studio page and tests share one implementation; validation is motion-templates.js.
import {MOTION_TEMPLATES, MOTION_ICON_LABELS, motionDefaults, motionSpec, motionTemplate} from './motion-templates.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Why motion is unavailable for this scene, or '' when it can be chosen.
export function motionBlockedReason(project, index) {
  if (project.brief?.productionStyle === 'animation') return '손그림 애니메이션 프로젝트에서는 쓸 수 없어요.';
  if (index === 0) return '첫 장면(도입부)은 Higgsfield 영상으로 유지합니다.';
  return '';
}

export function mediaKindValue(scene) { return scene.motion ? 'motion' : scene.kind; }

export function kindOptionsHTML(project, scene, index) {
  const value = mediaKindValue(scene), blocked = motionBlockedReason(project, index);
  return `<option value="image" ${value==='image'?'selected':''}>이미지</option><option value="video" ${value==='video'?'selected':''}>영상</option>`
    + `<option value="motion" ${value==='motion'?'selected':''} ${blocked && value!=='motion'?'disabled':''}>모션 템플릿</option>`;
}

// Scene after the media-kind select changes; motion always starts from the first template's defaults.
export function sceneWithKind(scene, value) {
  if (value === 'motion') return {...scene, kind: 'video', motion: scene.motion || {template: MOTION_TEMPLATES[0].id, vars: motionDefaults(MOTION_TEMPLATES[0].id)}};
  const {motion, ...rest} = scene;
  return {...rest, kind: value};
}

export function sceneWithTemplate(scene, templateId) {
  return {...scene, kind: 'video', motion: {template: templateId, vars: motionDefaults(templateId)}};
}

function fieldHTML(sceneId, def, value) {
  const name = `data-motion-var="${esc(def.id)}" data-motion-scene="${esc(sceneId)}" aria-label="${esc(def.label)}"`;
  if (def.type === 'enum') return `<label class="field motion-field"><span>${esc(def.label)}</span><select ${name}>${def.options.map(o=>`<option value="${esc(o)}" ${o===value?'selected':''}>${esc(MOTION_ICON_LABELS[o]||o)}</option>`).join('')}</select></label>`;
  if (def.type === 'color') return `<label class="field motion-field"><span>${esc(def.label)}</span><input type="color" ${name} value="${esc(value)}"></label>`;
  if (def.type === 'number') return `<label class="field motion-field"><span>${esc(def.label)}</span><input type="number" step="1" min="${def.min}" max="${def.max}" ${name} value="${esc(value)}"></label>`;
  return `<label class="field motion-field"><span>${esc(def.label)} <small>(${def.max}자 이하)</small></span><input type="text" maxlength="${def.max}" ${name} value="${esc(value)}"></label>`;
}

export function motionFormHTML(scene, {busy = false, capability} = {}) {
  if (!scene.motion) return '';
  const template = motionTemplate(scene.motion.template);
  if (!template) return `<p class="status-note error">지원하지 않는 모션 템플릿입니다. 종류를 다시 선택하세요.</p>`;
  const vars = {...motionDefaults(template.id), ...scene.motion.vars};
  const warn = capability === false ? '<p class="hint" data-motion-capability="missing">현재 제작 워커가 모션 템플릿 렌더를 지원하지 않아요. 생성 요청 시 원인이 표시됩니다.</p>' : '';
  return `<div class="motion-form" data-motion-form="${esc(scene.id)}">`
    + `<label class="field motion-field"><span>모션 템플릿</span><select data-motion-template="${esc(scene.id)}" aria-label="모션 템플릿">${MOTION_TEMPLATES.map(t=>`<option value="${t.id}" ${t.id===template.id?'selected':''}>${esc(t.label)} · ${t.duration}초</option>`).join('')}</select></label>`
    + template.vars.map(def => fieldHTML(scene.id, def, vars[def.id])).join('')
    + `<p class="hint">본문 설명용 그래픽이에요. 숫자·사실은 검증된 값만 넣고, 예시값이면 주석을 유지하세요. Higgsfield·생성 API 사용료 없이 제작 워커에서 렌더합니다.</p>${warn}`
    + `<button class="secondary" data-motion-save="${esc(scene.id)}" ${busy?'disabled':''}>템플릿 내용 저장</button></div>`;
}

// Reads the form for one scene from a root element; throws the same 400 message the server would.
export function readMotionForm(root, scene) {
  const template = root.querySelector(`[data-motion-template="${CSS.escape(scene.id)}"]`)?.value || scene.motion?.template;
  const def = motionTemplate(template);
  const vars = {};
  for (const input of root.querySelectorAll(`[data-motion-scene="${CSS.escape(scene.id)}"]`)) {
    const field = def?.vars.find(v => v.id === input.dataset.motionVar);
    if (!field) continue;
    vars[field.id] = field.type === 'number' ? (input.value === '' ? NaN : Number(input.value)) : input.value;
  }
  return {...scene, kind: 'video', motion: motionSpec({template, vars})};
}
