import type { DramaFinding, DramaGateReport, DramaTopic } from '@cak/contracts';
import { topicFingerprint } from './fingerprint.js';
import type { GenrePack } from './genre.js';
import { JudgeError, type ChoiceQuestion, type ChoiceVerdict, type ExpectedQuestion, type JudgeQuestion, type JudgeVerdict } from './judge-types.js';
import { toReport } from './report.js';

export const topicGateId = (topicId: string) => `topic-${topicId}`;

export function buildTopicQuestions(topics: DramaTopic[], genre: GenrePack): JudgeQuestion[] {
  const seen = new Set<string>();
  return topics.flatMap((t): ChoiceQuestion[] => {
    if (seen.has(t.id)) throw new JudgeError(`주제 id 중복: ${t.id}`);
    seen.add(t.id);
    for (const el of t.claimedElements) if (!genre.hookElements[el]) throw new JudgeError(`장르 팩에 없는 요소: ${el} (${t.id})`);
    const candidate = { logline: t.logline, synopsis: t.synopsis };
    const head = `This is a topic proposal for a Korean "${genre.name}" drama series.`;
    return [
      ...Object.entries(genre.hookElements).map(([k, e]): ChoiceQuestion => ({ type: 'choice', id: `${t.id}__el__${k}`, task: `${head} ${e.task}`, pass: e.pass, fail: e.fail, candidate })),
      { type: 'choice', id: `${t.id}__genre`, task: `${head} Does this topic set up the genre's core promise: "${genre.promise}"?`, pass: 'The topic clearly sets up the genre promise.', fail: 'The topic does not set up the genre promise.', candidate },
      ...Object.entries(genre.safetyChecks).map(([k, c]): ChoiceQuestion => ({ type: 'choice', id: `${t.id}__safe__${k}`, task: `${head} ${c.task}`, pass: c.pass, fail: c.fail, candidate })),
    ];
  });
}

export interface TopicRank {
  topicId: string;
  passed: boolean;
  /** 확정 포함된 조회 유발 요소(장르 팩 순서) */
  elements: string[];
  /** 요소별 '포함' 확률 합(동점 정렬용, 참고값) */
  elementScore: number;
}

export interface TopicApplyResult {
  reports: DramaGateReport[];
  topics: DramaTopic[];
  ranking: TopicRank[];
}

const passProb = (v: ChoiceVerdict) => (v.choice === 'pass' ? v.probability : 1 - v.probability);

export function applyTopicVerdicts(topics: DramaTopic[], genre: GenrePack, expected: ExpectedQuestion[], verdicts: JudgeVerdict[]): TopicApplyResult {
  const asked = new Set(expected.map((q) => q.id));
  const byId = new Map(verdicts.map((v) => [v.id, v]));
  const get = (id: string): ChoiceVerdict => {
    if (!asked.has(id)) throw new JudgeError(`요청에 없는 질문: ${id}`);
    const v = byId.get(id);
    if (!v) throw new JudgeError(`판정 결과 누락: ${id}`);
    if (v.type !== 'choice') throw new JudgeError(`선택형이 아님: ${id}`);
    return v;
  };
  const reports: DramaGateReport[] = [];
  const ranking: TopicRank[] = [];
  const updated = topics.map((t) => {
    const findings: DramaFinding[] = [];
    const els = Object.keys(genre.hookElements).map((k) => ({ k, v: get(`${t.id}__el__${k}`) }));
    const confirmed = els.filter((x) => x.v.decided && x.v.choice === 'pass').map((x) => x.k);
    if (confirmed.length < genre.minHookElements)
      findings.push({ severity: 'block', message: `조회 유발 요소 확정 ${confirmed.length}개 — 최소 ${genre.minHookElements}개 필요`, evidence: confirmed.join(', ') || '(없음)' });
    for (const el of t.claimedElements)
      if (!confirmed.includes(el)) findings.push({ severity: 'info', message: `노린 요소가 확정되지 않음: ${genre.hookElements[el]?.name ?? el}` });
    const g = get(`${t.id}__genre`);
    if (g.decided && g.choice === 'fail') findings.push({ severity: 'block', message: '장르 약속 확정 fail' });
    else if (!g.decided) findings.push({ severity: 'review', message: `장르 약속 미확정(${g.choice} ${g.confidence.toFixed(2)}/${g.probability.toFixed(2)})` });
    for (const k of Object.keys(genre.safetyChecks)) {
      const v = get(`${t.id}__safe__${k}`);
      if (!(v.decided && v.choice === 'pass'))
        findings.push({ severity: 'block', message: `수위 안전 ${v.decided ? '확정 fail' : '미확정'}: ${k} — 표현을 고쳐 재판정` });
    }
    const judged = { ...t, verifiedElements: confirmed };
    const report = toReport(topicGateId(t.id), 'topic', findings, topicFingerprint(judged, genre.id));
    reports.push(report);
    ranking.push({ topicId: t.id, passed: report.ok, elements: confirmed, elementScore: Math.round(els.reduce((n, x) => n + passProb(x.v), 0) * 100) / 100 });
    return judged;
  });
  ranking.sort((a, b) => Number(b.passed) - Number(a.passed) || b.elements.length - a.elements.length || b.elementScore - a.elementScore);
  return { reports, topics: updated, ranking };
}
