import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseTopicSet } from '../src/core/model.js';
import { loadGenre } from '../src/core/genre.js';
import { topicFingerprint } from '../src/core/fingerprint.js';
import { applyTopicVerdicts, buildTopicQuestions } from '../src/core/topic-gates.js';
import { JudgeError, type JudgeQuestion } from '../src/core/judge-types.js';
import { parseJevResponse } from '../src/adapters/judge/jev.js';

const set = () => parseTopicSet(JSON.parse(readFileSync(new URL('./fixtures/topics.json', import.meta.url), 'utf8')));
const genre = loadGenre('hidden-master-revenge');
type Pick = (id: string) => ['pass' | 'fail', number, number];
function verdicts(qs: JudgeQuestion[], pick: Pick) {
  const answers = Object.fromEntries(qs.map((q) => {
    const [c, conf, p] = pick(q.id);
    return [q.id, { type: 'choice', choice: c, confidence: conf, probabilities: c === 'pass' ? { pass: p, fail: 1 - p } : { pass: 1 - p, fail: p } }];
  }));
  return parseJevResponse({ answers }, qs.map((q) => ({ id: q.id, type: q.type })));
}
/** night-shift: 갈등·정체 요소 포함, lunch-break: 요소 없음·장르 약속 실패. 둘 다 수위 안전. */
const realistic: Pick = (id) => {
  if (id.includes('__safe__')) return ['pass', 0.97, 0.99];
  if (id.startsWith('night-shift__el__')) return /strong-conflict|hidden-identity/.test(id) ? ['pass', 0.95, 0.97] : ['fail', 0.9, 0.95];
  if (id === 'night-shift__genre') return ['pass', 0.95, 0.97];
  return ['fail', 0.95, 0.97];
};

describe('topic gate', () => {
  it('asks every view-driving element, the genre promise and every safety check per topic', () => {
    const qs = buildTopicQuestions(set().topics, genre);
    expect(qs).toHaveLength(2 * (7 + 1 + 2));
    expect(qs.map((q) => q.id)).toContain('night-shift__el__sensual-decadence');
    expect(qs.every((q) => q.type === 'choice')).toBe(true);
  });
  it('refuses a claimed element the genre pack does not define', () => {
    const t = set().topics;
    t[0]!.claimedElements = ['made-up'];
    expect(() => buildTopicQuestions(t, genre)).toThrow(JudgeError);
  });
  it('passes only topics with enough confirmed elements and ranks them first', () => {
    const topics = set().topics;
    const qs = buildTopicQuestions(topics, genre);
    const r = applyTopicVerdicts(topics, genre, qs.map((q) => ({ id: q.id, type: q.type })), verdicts(qs, realistic));
    expect(r.ranking.map((x) => [x.topicId, x.passed])).toEqual([['night-shift', true], ['lunch-break', false]]);
    expect(r.topics[0]!.verifiedElements).toEqual(['strong-conflict', 'hidden-identity']);
    const lunch = r.reports.find((x) => x.gate === 'topic-lunch-break')!;
    expect(lunch.ok).toBe(false);
    expect(lunch.findings.map((f) => f.message).join('\n')).toMatch(/조회 유발 요소 확정 0개 — 최소 2개[\s\S]*장르 약속 확정 fail/);
    expect(r.reports[0]!.fingerprint).toBe(topicFingerprint(r.topics[0]!, genre.id));
  });
  it('blocks a topic whose safety check is undecided even if every element passes', () => {
    const topics = set().topics;
    const qs = buildTopicQuestions(topics, genre);
    const r = applyTopicVerdicts(topics, genre, qs.map((q) => ({ id: q.id, type: q.type })),
      verdicts(qs, (id) => (id === 'night-shift__safe__sexual-boundary' ? ['pass', 0.6, 0.8] : realistic(id))));
    expect(r.ranking.find((x) => x.topicId === 'night-shift')!.passed).toBe(false);
  });
});
