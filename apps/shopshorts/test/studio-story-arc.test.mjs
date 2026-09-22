import test from 'node:test';
import assert from 'node:assert/strict';
import { scenarioBrief, scenarioResult, validateStoryArc } from '../lib/studio-scenario.js';
import { storyArcGuide } from '../lib/studio-editorial.js';
import { accountFailureCode, accountFailureMessage } from '../lib/llm-account-errors.js';
import { CATEGORIES } from '../lib/studio.js';

const brief = { category: '심리학', topic: '아이에게 사과할 때 덧붙이는 말', format: 'short', duration: 24 };
const scenes = [
  { id: 'scene-1', narration: '미안해. 그런데 네가… 사과 뒤에 어떤 말을 붙이고 있나요?', prompt: '부모가 사과하다 멈춘다.', duration: 7, kind: 'video' },
  { id: 'scene-2', narration: '그런데 뒤의 설명을 잠시 멈춰보세요. 사과할 내 행동부터 말하는 거예요.', prompt: '손을 내려놓고 다시 아이에게 말을 건넨다.', duration: 10, kind: 'video' },
  { id: 'scene-3', narration: '아까 큰 소리 내서 미안해. 이번에는 이 말 뒤에서 아이의 답을 기다려요.', prompt: '부모가 아이의 대답을 기다린다.', duration: 7, kind: 'image' },
];
const storyArc = {
  hook: { sceneId: 'scene-1', line: '사과 뒤에 어떤 말을 붙이고 있나요?' },
  payoff: { sceneId: 'scene-2', line: '사과할 내 행동부터 말하는 거예요.' },
  ending: { sceneId: 'scene-3', line: '이번에는 이 말 뒤에서 아이의 답을 기다려요.' },
};
const result = { title: '사과 뒤의 그런데', scenes };

test('new generation requires actual spoken beats but keeps the stored project contract unchanged', async () => {
  let calls = 0;
  assert.deepEqual(await scenarioBrief(brief, {}, { generate: async () => { calls++; return { value: { ...result, storyArc } }; } }), result);
  assert.equal(calls, 1);
  assert.deepEqual(scenarioResult(result, brief), result); // Existing stored scenarios remain readable.
  await assert.rejects(scenarioBrief(brief, {}, { generate: async () => ({ value: result }) }), { code: 'SCENARIO_ARC_INVALID' });
});

test('metadata cannot substitute for missing narration, invent a scene, or cite only the visual prompt', () => {
  for (const patch of [undefined, null, {}, { line: '' }, { line: '   ' }, { line: 'x'.repeat(1201) }, { sceneId: 'missing' }, { line: '기억에 남는 중요한 교훈' }, { line: scenes[1].prompt }]) {
    const arc = { ...storyArc, payoff: patch == null ? patch : { ...storyArc.payoff, ...patch } };
    if (patch && Object.keys(patch).length === 0) delete arc.payoff.sceneId;
    assert.throws(() => validateStoryArc(arc, scenes), { code: 'SCENARIO_ARC_INVALID' });
  }
});

test('hook must open the script, ending must close it, and payoff must precede the ending', () => {
  for (const arc of [
    { ...storyArc, hook: storyArc.payoff },
    { ...storyArc, ending: storyArc.payoff },
    { ...storyArc, payoff: storyArc.ending },
  ]) assert.throws(() => validateStoryArc(arc, scenes), { code: 'SCENARIO_ARC_INVALID' });
  assert.doesNotThrow(() => validateStoryArc(storyArc, scenes));
});

test('three distinct spoken beats may share one scene, but cannot overlap or run backwards', () => {
  const single = [{ ...scenes[0], narration: '질문을 던져요. 관점이 바뀌어요. 직접 해봐요.', duration: 24 }];
  const arc = Object.fromEntries(['질문을 던져요.', '관점이 바뀌어요.', '직접 해봐요.'].map((line, i) => [['hook', 'payoff', 'ending'][i], { sceneId: 'scene-1', line }]));
  assert.doesNotThrow(() => validateStoryArc(arc, single));
  assert.throws(() => validateStoryArc({ ...arc, payoff: arc.hook }, single), { code: 'SCENARIO_ARC_INVALID' });
  assert.throws(() => validateStoryArc({ ...arc, payoff: arc.ending, ending: arc.payoff }, single), { code: 'SCENARIO_ARC_INVALID' });
  const callback = [{ ...single[0], narration: '잠깐만. 이제는 말을 멈추고 들어요. 잠깐만.' }];
  assert.doesNotThrow(() => validateStoryArc({ hook: { sceneId: 'scene-1', line: '잠깐만.' }, payoff: { sceneId: 'scene-1', line: '이제는 말을 멈추고 들어요.' }, ending: { sceneId: 'scene-1', line: '잠깐만.' } }, callback));
});

test('arc failures give both providers a retryable scenario message without credential guidance or raw output', () => {
  let error;
  try { validateStoryArc(null, scenes); } catch (e) { error = e; }
  assert.equal(accountFailureCode(error), 'SCENARIO_ARC_INVALID');
  for (const provider of ['codex', 'claude']) {
    const message = accountFailureMessage(provider, error);
    assert.match(message, /시나리오를 다시 생성/);
    assert.doesNotMatch(message, /계정|인증|로그인/);
    assert.equal(message, error.message);
  }
});

test('category payoff guidance preserves factual constraints, runtime choice and complete answers', () => {
  const guides = CATEGORIES.map(category => storyArcGuide({ ...brief, category }));
  assert.equal(new Set(guides).size, CATEGORIES.length);
  for (const guide of guides) {
    assert.doesNotMatch(guide, /undefined/);
    assert.match(guide, /자막·음악·카메라 지시만으로/);
    assert.match(guide, /주제·길이·분위기는 유지/);
    assert.match(guide, /도입의 약속은 이번 영상 안에서 회수/);
  }
  assert.match(guides[0], /속마음 단정/);
  assert.match(guides[2], /근거 없는 성능 비교/);
  assert.match(guides[3], /앞에 심어 둔 단서/);
  assert.match(storyArcGuide({ ...brief, format: 'long' }), /초반에 작은 답을 먼저/);
});
