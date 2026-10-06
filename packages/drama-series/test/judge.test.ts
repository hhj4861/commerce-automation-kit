import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseEpisode, parseSeries } from '../src/core/model.js';
import { loadGenre } from '../src/core/genre.js';
import { applyVerdicts, buildQuestions } from '../src/core/judge-gates.js';
import { JudgeError, type ExpectedQuestion, type JudgeQuestion, type JudgeVerdict } from '../src/core/judge-types.js';
import { buildJevRequest, parseJevResponse } from '../src/adapters/judge/jev.js';
import type { GateContext } from '../src/core/gates/types.js';
import { lineHash } from '../src/core/line-hash.js';

const fx = (name: string): any => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
function ctx(mutate?: (s: any, e: any) => void): GateContext {
  const s = fx('series.json');
  const e = fx('episode.json');
  mutate?.(s, e);
  return { series: parseSeries(s), episode: parseEpisode(e), genre: loadGenre(s.genreId) };
}
const choice = (c: 'pass' | 'fail', confidence: number, p: number) => ({
  type: 'choice', choice: c, confidence, probabilities: c === 'pass' ? { pass: p, fail: 1 - p } : { pass: 1 - p, fail: p },
});
const score = (level: number, confidence = 0.9) => ({
  type: 'score', score: level - 1, confidence, legend: {},
  probabilities: Object.fromEntries([0, 1, 2, 3, 4].map((i) => [String(i), i === level - 1 ? 0.8 : 0.05])),
});
const expected = (qs: JudgeQuestion[]): ExpectedQuestion[] => qs.map((q) => ({ id: q.id, type: q.type }));
/** 요청한 질문 전부에 답을 만든다. 선택형은 pick, 점수형은 4/5. */
function answer(qs: JudgeQuestion[], pick: (id: string) => ['pass' | 'fail', number, number] = () => ['pass', 0.95, 0.97]): JudgeVerdict[] {
  const raw = { answers: Object.fromEntries(qs.map((q) => [q.id, q.type === 'score' ? score(4) : choice(...pick(q.id))])) };
  return parseJevResponse(raw, expected(qs));
}

describe('buildQuestions', () => {
  it('asks three choice checks for every unverified line', () => {
    const qs = buildQuestions('dialogue', ctx());
    expect(qs).toHaveLength(15);
    expect(qs[0]).toMatchObject({ id: 'c2__0__context', type: 'choice' });
    const voice = qs.find((q) => q.id === 'c4__0__voice')!;
    expect(String(voice.candidate.speakerProfile)).toMatch(/윗사람에게 깍듯한 존댓말/);
  });
  it('skips lines already verified or approved', () => {
    const c = ctx();
    const cut = c.episode.cuts[1]!;
    cut.lines[0]!.verification = { status: 'human-approved', approvedBy: 'u', lineHash: lineHash(cut, cut.lines[0]!) };
    expect(buildQuestions('dialogue', c)).toHaveLength(12);
  });
  it('asks again for a verified line whose text changed after verification', () => {
    const c = ctx();
    const cut = c.episode.cuts[1]!;
    cut.lines[0]!.verification = { status: 'verified', lineHash: lineHash(cut, cut.lines[0]!) };
    cut.lines[0]!.text = '야, 막내. 돈 내놔.';
    expect(buildQuestions('dialogue', c)).toHaveLength(15);
  });
  it('builds scenario structure, topic-element carry, safety and fun-score questions', () => {
    const ids = buildQuestions('scenario', ctx()).map((q) => `${q.id}:${q.type}`);
    expect(ids.slice(0, 5)).toEqual(['scenario__hook', 'scenario__conflict', 'scenario__payoff', 'scenario__cliffhanger', 'scenario__genre'].map((x) => `${x}:choice`));
    expect(ids).toEqual(expect.arrayContaining([
      'scenario__carry__strong-conflict:choice', 'scenario__carry__hidden-identity:choice',
      'scenario__safe__sexual-boundary:choice', 'scenario__safe__violence-boundary:choice',
      'scenario__fun__surprise:score', 'scenario__fun__emotional-peak:score',
    ]));
    expect(ids).toHaveLength(14);
  });
  it('refuses a verified topic element the genre pack does not define', () => {
    expect(() => buildQuestions('scenario', ctx((s) => { s.topic.verifiedElements = ['made-up']; }))).toThrow(JudgeError);
  });
  it('builds two prop checks per cut', () => {
    expect(buildQuestions('props', ctx())).toHaveLength(8);
  });
});

describe('JEV adapter', () => {
  it('prefixes the common instruction, sends score levels and refuses label leaks', () => {
    const qs = buildQuestions('scenario', ctx());
    const body = buildJevRequest({ series: 't' }, qs);
    expect(body.model).toBe('jev-1.13.0');
    expect(body.questions['scenario__hook']!.instructions.task).toMatch(/^Evaluate only the specified check/);
    expect(body.questions['scenario__fun__surprise']).toMatchObject({ type: 'score' });
    expect(Array.isArray(body.questions['scenario__fun__surprise']!.criteria)).toBe(true);
    const first = qs[0]!;
    expect(() => buildJevRequest({}, [{ ...first, candidate: { expected: 'pass' } }])).toThrow(JudgeError);
  });
  it('applies thresholds: decided only when confidence ≥ 0.85 and probability ≥ 0.90', () => {
    const exp: ExpectedQuestion[] = [{ id: 'a', type: 'choice' }, { id: 'b', type: 'choice' }];
    const v = parseJevResponse({ answers: { a: choice('pass', 0.9, 0.95), b: choice('pass', 0.84, 0.95) } }, exp);
    expect(v.map((x) => x.decided)).toEqual([true, false]);
  });
  it('parses score answers into 1-based levels', () => {
    const [v] = parseJevResponse({ answers: { s: score(4) } }, [{ id: 's', type: 'score' }]);
    expect(v).toMatchObject({ type: 'score', level: 4, levels: 5, decided: true });
  });
  it('throws on missing answers, wrong type, or probabilities that do not sum to 1', () => {
    const a: ExpectedQuestion[] = [{ id: 'a', type: 'choice' }];
    expect(() => parseJevResponse({ answers: {} }, a)).toThrow(/누락/);
    expect(() => parseJevResponse({ answers: { a: score(3) } }, a)).toThrow(/형식 불일치/);
    expect(() => parseJevResponse({ answers: { a: { type: 'choice', choice: 'pass', confidence: 0.9, probabilities: { pass: 0.9, fail: 0.3 } } } }, a)).toThrow(/합/);
    expect(() => parseJevResponse({ answers: { a: { type: 'choice', choice: 'fail', confidence: 0.9, probabilities: { pass: 0.9, fail: 0.1 } } } }, a)).toThrow(/최대 확률/);
  });
  it('reads the relay result format and rejects a non-200 response', () => {
    const a: ExpectedQuestion[] = [{ id: 'a', type: 'choice' }];
    const relay = { sshExit: 0, events: [{ event: 'ready' }, { event: 'response', status: 200, body: { answers: { a: choice('fail', 1, 1) } } }] };
    expect(parseJevResponse(relay, a)[0]).toMatchObject({ choice: 'fail', decided: true });
    expect(() => parseJevResponse({ events: [{ event: 'response', status: 429, body: {} }] }, a)).toThrow(/200/);
  });
});

describe('applyVerdicts', () => {
  it('marks lines verified when all three checks are decided pass', () => {
    const c = ctx();
    const qs = buildQuestions('dialogue', c);
    const { report, episode } = applyVerdicts('dialogue', c, expected(qs), answer(qs), 'r1.json', '2026-10-06T00:00:00Z');
    expect(report.ok).toBe(true);
    expect(episode.cuts.flatMap((x) => x.lines).every((l) => l.verification.status === 'verified')).toBe(true);
    expect(episode.cuts[1]!.lines[0]!.verification.judgeRef).toBe('r1.json');
    expect(episode.cuts[1]!.lines[0]!.verification.lineHash).toBe(lineHash(episode.cuts[1]!, episode.cuts[1]!.lines[0]!));
    expect(c.episode.cuts[1]!.lines[0]!.verification.status).toBe('unverified');
  });
  it('blocks a decided fail and leaves undecided lines for review', () => {
    const c = ctx();
    const qs = buildQuestions('dialogue', c);
    const v = answer(qs, (id) => (id === 'c2__0__context' ? ['fail', 0.99, 0.99] : id === 'c3__0__voice' ? ['pass', 0.6, 0.8] : ['pass', 0.95, 0.97]));
    const { report, episode } = applyVerdicts('dialogue', c, expected(qs), v, 'r1.json', 'now');
    expect(report.ok).toBe(false);
    expect(report.findings.find((f) => f.cutId === 'c2' && f.lineIndex === 0)!.severity).toBe('block');
    expect(report.findings.find((f) => f.cutId === 'c3' && f.lineIndex === 0)!.severity).toBe('review');
    expect(episode.cuts[1]!.lines[0]!.verification.status).toBe('unverified');
    expect(episode.cuts[2]!.lines[1]!.verification.status).toBe('verified');
  });
  it('does not verify a line the pronunciation lint blocks even if JEV passes it', () => {
    const c = ctx((_, e) => { e.cuts[1].lines[0].text = '막내야, 이번 주 수수료 안 냈지?'; });
    const qs = buildQuestions('dialogue', c);
    const { episode, report } = applyVerdicts('dialogue', c, expected(qs), answer(qs), 'r.json', 'now');
    expect(episode.cuts[1]!.lines[0]!.verification.status).toBe('unverified');
    expect(report.findings.some((f) => /수수료/.test(f.message))).toBe(true);
  });
  it('throws when a requested question has no verdict', () => {
    const c = ctx();
    const qs = buildQuestions('dialogue', c);
    expect(() => applyVerdicts('dialogue', c, expected(qs), answer(qs.slice(1)), 'r', 'now')).toThrow(JudgeError);
  });
  it('scenario: a lost topic element blocks, unsafe content blocks, fun scores are info only', () => {
    const c = ctx();
    const qs = buildQuestions('scenario', c);
    const ok = applyVerdicts('scenario', c, expected(qs), answer(qs), 'r', 'now');
    expect(ok.report.ok).toBe(true);
    expect(ok.report.findings.filter((f) => f.severity === 'info')).toHaveLength(5);
    expect(ok.report.findings.find((f) => /fun__surprise 4\/5/.test(f.message))).toBeTruthy();
    const lost = applyVerdicts('scenario', c, expected(qs), answer(qs, (id) => (id === 'scenario__carry__hidden-identity' ? ['fail', 0.95, 0.97] : ['pass', 0.95, 0.97])), 'r', 'now');
    expect(lost.report.ok).toBe(false);
    const unsafe = applyVerdicts('scenario', c, expected(qs), answer(qs, (id) => (id === 'scenario__safe__sexual-boundary' ? ['pass', 0.5, 0.7] : ['pass', 0.95, 0.97])), 'r', 'now');
    expect(unsafe.report.ok).toBe(false);
  });
  it('props: undecided is review', () => {
    const c = ctx();
    const qs = buildQuestions('props', c);
    const p = applyVerdicts('props', c, expected(qs), answer(qs, (id) => (id === 'c3__props' ? ['pass', 0.5, 0.7] : ['pass', 0.95, 0.97])), 'r', 'now');
    expect(p.report.ok).toBe(true);
    expect(p.report.findings).toEqual([expect.objectContaining({ severity: 'review', cutId: 'c3' })]);
  });
});
