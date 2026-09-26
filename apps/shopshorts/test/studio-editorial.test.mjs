import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES } from '../lib/studio.js';
import { editorialGuide, narrationGuide } from '../lib/studio-editorial.js';
import { scenarioBrief } from '../lib/studio-scenario.js';
import { recommendBrief } from '../lib/studio-recommendations.js';

const brief = { category: '심리학', topic: '아이에게 날카롭게 말한 순간 돌아보기', format: 'short', duration: 24,
  direction: '부모의 표정과 손동작에 집중하는 따뜻한 화면' };
const value = { title: '그 말 앞의 내 하루', scenes: [
  { id: 'scene-1', narration: '아이에게 잠깐만 하고 소리쳤나요? 그 말 앞의 내 하루를 돌아보세요.', prompt: '부모가 하던 일을 내려놓고 돌아본다.', duration: 8, kind: 'image' },
  { id: 'scene-2', narration: '내게 쌓인 부담을 살피는 것과 아이에게 사과하는 것은 함께 할 수 있어요.', prompt: '부모가 미완성 업무를 잠시 닫고 아이를 바라본다.', duration: 8, kind: 'image' },
  { id: 'scene-3', narration: '아까 큰 소리로 말해서 미안해. 무슨 이야기였어? 이렇게 다시 말을 건네보세요.', prompt: '부모가 아이의 대답을 기다린다.', duration: 8, kind: 'video' },
] };

test('every supported category has a distinct editorial structure, with longform depth and intact duration', () => {
  const guides = CATEGORIES.map(category => editorialGuide({ ...brief, category }));
  assert.equal(new Set(guides).size, CATEGORIES.length);
  for (const guide of guides) { assert.doesNotMatch(guide, /undefined/); assert.match(guide, /24초/); }
  assert.match(guides[0], /이유·관점/);
  assert.match(guides[1], /구조·재료·빛·동선/);
  assert.match(guides[2], /제품 정보가 없으면/);
  assert.match(guides[3], /긴장과 침묵/);
  assert.match(guides[4], /사료처럼 창작하지/);
  assert.match(guides[5], /작동 원리/);
  assert.match(editorialGuide({ ...brief, format: 'long', duration: 300 }), /소주제마다 원리·예시·한계/);
  assert.match(narrationGuide(brief), /72~108자/);
  assert.match(narrationGuide({ ...brief, duration: 60 }), /180~270자/);
});

for (const provider of ['codex', 'claude']) test(`${provider} scenario uses message-first guidance without changing user brief, JSON contract or number of calls`, async () => {
  const input = structuredClone(brief), controller = new AbortController(); let calls = 0;
  const actual = await scenarioBrief(input, { SHOPSHORTS_CODEX_MODEL: 'codex-model', SHOPSHORTS_CLAUDE_MODEL: 'claude-model' }, {
    provider, signal: controller.signal, generate: async (prompt, options) => {
      calls++;
      assert.equal(options.model, `${provider}-model`); assert.equal(options.signal, controller.signal);
      assert.match(prompt, /내레이션·대사 → 문장과 호흡에 맞춘 장면 분할/);
      assert.match(prompt, /공감할 일상 상황 →/); assert.match(prompt, /이유와 구체적 예/);
      assert.match(prompt, /실제 음성 길이를 측정한 값이 아닙니다/);
      assert.match(prompt, /부모의 표정과 손동작/); assert.match(prompt, /합계는 정확히 24초/);
      assert.match(prompt, /확인하지 못한 연구/); assert.match(prompt, /인증정보를 읽거나 수정하지/);
      assert.match(prompt, /킬링파트 설계/); assert.match(prompt, /storyArc/);
      assert.match(prompt, /질문, 사례, 원리 설명, 관점 전환, 실천/);
      assert.match(prompt, /장면 prompt는 독립적으로 생성/);
      assert.doesNotMatch(prompt, /읽을 수 있게 짧게 쓰세요|짧은 내레이션/);
      return { value: { ...value, storyArc: Object.fromEntries(['hook', 'payoff', 'ending'].map((key, i) => [key, { sceneId: value.scenes[i].id, line: value.scenes[i].narration }])) }, searched: false };
    },
  });
  assert.deepEqual(actual, value); assert.deepEqual(input, brief); assert.equal(calls, 1);
});

for (const focus of ['topic', 'direction']) test(`${focus} recommendations establish message and explanation before visual direction`, async () => {
  const result = await recommendBrief({ ...brief, focus }, {}, { generate: async prompt => {
    assert.match(prompt, /전달할 내용의 흐름과 말투를 먼저/);
    assert.match(prompt, /설명할 이유와 구체적 예시/);
    assert.match(prompt, /최근 30일/); assert.match(prompt, /입력한 주제를 유지/);
    assert.match(prompt, /목표 24초는 유지/);
    assert.match(prompt, /중심 질문, 설명할 원리, 구체적 사례, 관점 전환/);
    return { searched: true, value: { suggestions: Array.from({ length: 3 }, (_, i) => ({ topic: focus === 'direction' ? brief.topic : `${brief.topic} 관점 ${i}`, direction: `상황, 이해할 관점 ${i}, 실제로 건넬 말 순서로 설명`, reason: '검색 근거' })), sources: [{ title: '테스트 출처', url: 'https://example.org/source' }] } };
  } });
  assert.equal(result.suggestions.length, 3); assert.equal(result.focus, focus);
});

test('editorial changes keep malformed or badly timed scenarios from being accepted', async () => {
  for (const scenes of [[], value.scenes.map(scene => ({ ...scene, duration: 1 })), value.scenes.map(scene => ({ ...scene, narration: '' }))]) {
    await assert.rejects(scenarioBrief(brief, {}, { generate: async () => ({ value: { ...value, scenes } }) }));
  }
});

test('generic psychology ideation does not anchor on parenting, while relevant family guidance stays intact', () => {
 assert.doesNotMatch(editorialGuide({...brief,topic:'',direction:''}),/부모|아이/);
 assert.doesNotMatch(editorialGuide({...brief,topic:'왜 선택이 어려울까',direction:''}),/부모|아이/);
 assert.match(editorialGuide(brief),/아이에게 감정 돌봄을 맡기지/);
});

test('psychology explanation depth follows the selected duration without leaking to other categories', () => {
 const input = {...brief,topic:'왜 선택을 미룰까',direction:'',format:'long'};
 for (const [duration, expected] of [[60,/질문 하나와 사례 하나/],[120,/1~2개 소주제/],[180,/1~2개 소주제/],[300,/2~3개 소주제/],[600,/3~5개 소주제/]]) {
  const guide=editorialGuide({...input,duration});
  assert.match(guide,expected);
  assert.ok(guide.includes(`목표 ${duration}초는 유지`));
 }
 assert.match(editorialGuide({...input,format:'short',duration:180}),/질문 하나와 사례 하나/);
 for (const category of CATEGORIES.filter(category=>category!=='심리학')) {
  assert.doesNotMatch(editorialGuide({...input,category,duration:600}),/심리학 해설 구성|3~5개 소주제/);
 }
 assert.match(editorialGuide(input),/사용자가 다른 구성을 명시하지 않았다면/);
 assert.match(editorialGuide(input),/다른 해석이나 적용 한계/);
});
