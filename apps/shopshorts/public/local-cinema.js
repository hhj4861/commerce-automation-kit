// Shared browser/server contract. These are prompt directions, not physical camera guarantees.
export const LOCAL_CAMERAS = {locked:'고정', 'dolly-in':'다가가기', 'dolly-out':'멀어지기', 'pan-left':'왼쪽 팬', 'pan-right':'오른쪽 팬', orbit:'피사체 주위를 회전'};
export const LOCAL_LIGHTS = {natural:'자연광', soft:'부드러운 스튜디오', backlit:'역광', night:'야간 조명'};
export const LOCAL_LENSES = {wide:'광각', normal:'표준', portrait:'인물'};
export function localCinemaOptions(value) {
  const bad = () => { throw Object.assign(Error('로컬 생성의 카메라·조명·렌즈·시드를 확인해 주세요.'), {status:400}); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) bad();
  const {camera='locked', lighting='natural', lens='normal', seed=1} = value;
  if (!Object.hasOwn(LOCAL_CAMERAS,camera) || !Object.hasOwn(LOCAL_LIGHTS,lighting) || !Object.hasOwn(LOCAL_LENSES,lens) || !Number.isSafeInteger(seed) || seed<0 || seed>2147483647) bad();
  return {camera,lighting,lens,seed};
}
export function localCinemaPrompt(prompt, value) {
  const p=localCinemaOptions(value);
  const camera={locked:'Locked tripod, no camera movement.', 'dolly-in':'Slow physical dolly toward the subject; smooth motion.', 'dolly-out':'Slow physical dolly away from the subject.', 'pan-left':'Slow pan left, camera position fixed.', 'pan-right':'Slow pan right, camera position fixed.', orbit:'Smooth camera orbit around the centered subject, constant radius.'};
  const lighting={natural:'Natural daylight, balanced exposure.',soft:'Large diffused studio light, soft shadows.',backlit:'Backlight with gentle fill, controlled highlights.',night:'Night scene illuminated by visible practical lights.'};
  const lens={wide:'Wide-angle composition with clear spatial depth.',normal:'Natural perspective, medium depth of field.',portrait:'Portrait lens look, shallow depth of field, subject in focus.'};
  return `${prompt}\n${camera[p.camera]} ${lighting[p.lighting]} ${lens[p.lens]} Continuous coherent motion, stable subject identity. No captions or logos.`;
}

export function localCinemaMarkup(project) {
  if(['webtoon','hybrid','animation'].includes(project.brief.productionStyle))return '';
  const value=localCinemaOptions(project.localCinema||{});
  const select=(key,label,items)=>`<label class="field"><span>${label}</span><select id="local-${key}">${Object.entries(items).map(([id,name])=>`<option value="${id}" ${value[key]===id?'selected':''}>${name}</option>`).join('')}</select></label>`;
  return `<details class="panel" ${project.localCinema?'open':''}><summary>무료 로컬 시네마 · ${project.localCinema?'사용 중':'선택'}</summary><p>이 컴퓨터의 모델로 이미지·영상을 생성합니다. API 사용료 없이 무음으로 제작하며, 직접 만든 음원을 편집에서 추가할 수 있습니다. 모델 설치가 필요하고 화질·속도는 모델과 장비에 따라 달라집니다.</p>${select('camera','카메라',LOCAL_CAMERAS)}${select('lighting','조명',LOCAL_LIGHTS)}${select('lens','렌즈',LOCAL_LENSES)}<label class="field"><span>시드 · 같은 설정 재사용</span><input id="local-seed" type="number" min="0" max="2147483647" value="${value.seed}"></label><p class="hint">연출은 모델에 전달할 지시이며 정확한 카메라 움직임을 보장하지 않습니다. 설정을 적용하면 기존 AI 장면과 편집을 다시 만들어야 합니다.</p><button class="secondary" id="local-save">무료 모드와 연출 적용</button>${project.localCinema?'<button class="secondary" id="local-disable">기존 생성 방식으로 전환</button>':''}</details>`;
}
