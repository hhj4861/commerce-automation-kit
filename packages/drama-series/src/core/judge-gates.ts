import type { DramaCut, DramaEpisode, DramaFinding, DramaGateReport } from '@cak/contracts';
import { fingerprintOf } from './fingerprint.js';
import { lineFindings } from './gates/dialogue-lint.js';
import type { GateContext } from './gates/types.js';
import { JUDGE_GATE_ID, JudgeError, type ChoiceQuestion, type EpisodeJudgeKind, type ExpectedQuestion, type JudgeQuestion, type JudgeVerdict } from './judge-types.js';
import { toReport } from './report.js';
import { isLineCleared, lineHash } from './line-hash.js';

type Check = readonly [task: string, pass: string, fail: string];

const LINE_CHECKS = {
  context: [
    "This is one dialogue line of a Korean drama. Does this line make sense as what this speaker would say at this exact moment, given the scene so far and the speaker's motive?",
    "The line is a plausible reaction to the immediately preceding action and serves the speaker's motive in the scene.",
    "The line ignores or contradicts what just happened, or does not fit the speaker's motive.",
  ],
  voice: [
    "This is one dialogue line of a Korean drama. Does the line match this speaker's profile (speech level such as 존댓말/반말 toward this listener, temperament, length)? Judge only voice consistency.",
    'Speech level and tone match the profile for this listener.',
    'Speech level or tone contradicts the profile.',
  ],
  natural: [
    'This is one dialogue line of a Korean drama. Is this natural, idiomatic spoken Korean that a Korean TV drama actor would say? Judge only naturalness of wording, not plot fit.',
    'Sounds like natural colloquial Korean dialogue.',
    'Sounds unnatural, translated, stiff, or grammatically awkward for spoken dialogue.',
  ],
  // 2026-10-06: "다들 진정해. 내가 있잖아." 처럼 어느 위기 장면에도 붙는 범용 대사가 context 를 통과했다.
  reaction: [
    'This is one dialogue line of a Korean drama. Does this line respond specifically to the immediately preceding line or action (see sceneSoFar and previousCut) and move this scene forward? Judge only specificity and scene function, not wording.',
    'The line directly answers or reacts to what just happened, and could not be moved to another scene without losing meaning.',
    'The line is generic filler that could be pasted into any tense scene, ignores the immediately preceding line or action, or adds nothing to the scene.',
  ],
} as const satisfies Record<string, Check>;
export const LINE_CHECK_KEYS = Object.keys(LINE_CHECKS) as (keyof typeof LINE_CHECKS)[];

const PROP_CHECKS = {
  props: [
    'Would every object and action in this cut plausibly exist or happen in this location? Judge only physical plausibility of props and set dressing, not story.',
    'All objects and set dressing are things this location really has.',
    'The cut uses an object or set element this location would not have (for example a gym mat in a warehouse).',
  ],
  'single-location': [
    'Does this cut stay in one single location for its whole duration?',
    'One continuous location for the whole cut.',
    'The cut moves between two or more different locations.',
  ],
} as const satisfies Record<string, Check>;
const PROP_CHECK_KEYS = Object.keys(PROP_CHECKS) as (keyof typeof PROP_CHECKS)[];

const nameOf = (ctx: GateContext, id: string) => ctx.series.characters.find((c) => c.id === id)?.name ?? id;

function speakerProfile(ctx: GateContext, id: string): string {
  const c = ctx.series.characters.find((x) => x.id === id);
  if (!c) return id;
  const s = c.speech;
  return `${c.profile} 말투: 기본 ${s.default}${s.toSuperior ? `, 윗사람에게 ${s.toSuperior}` : ''}${s.toSubordinate ? `, 아랫사람에게 ${s.toSubordinate}` : ''}`;
}

function previousCut(ctx: GateContext, cut: DramaCut): string {
  const i = ctx.episode.cuts.findIndex((c) => c.id === cut.id);
  const prev = i > 0 ? ctx.episode.cuts[i - 1] : undefined;
  if (!prev) return '(첫 컷)';
  const lines = prev.lines.map((l) => `${nameOf(ctx, l.speaker)}: "${l.text}"`).join(' ');
  return `${prev.action}${lines ? ` 대사 — ${lines}` : ''}`;
}

function sceneSoFar(ctx: GateContext, cut: DramaCut, index: number): string {
  const before = cut.lines.slice(0, index).map((l) => `${nameOf(ctx, l.speaker)}: "${l.text}"`).join(' ');
  return `${cut.action}${before ? ` 직전 대사 — ${before}` : ''}`;
}

export function episodeDigest(ctx: GateContext): string {
  return ctx.episode.cuts
    .map((c, i) => {
      const lines = c.lines.map((l) => `${nameOf(ctx, l.speaker)}: "${l.text}"`).join(' ');
      return `${i + 1}컷(${c.durationSec}초): ${c.action}${lines ? ` 대사 — ${lines}` : ''}`;
    })
    .join(' ');
}

export function judgeState(ctx: GateContext): Record<string, unknown> {
  return { series: ctx.series.title, logline: ctx.series.logline, genre: ctx.genre.name, genrePromise: ctx.genre.promise };
}

const choiceQ = (id: string, [task, pass, fail]: Check, candidate: Record<string, unknown>): ChoiceQuestion => ({ type: 'choice', id, task, pass, fail, candidate });

export function buildQuestions(kind: EpisodeJudgeKind, ctx: GateContext): JudgeQuestion[] {
  if (kind === 'dialogue') {
    return ctx.episode.cuts.flatMap((cut) =>
      cut.lines.flatMap((line, i) =>
        isLineCleared(cut, line)
          ? []
          : LINE_CHECK_KEYS.map((k) => choiceQ(`${cut.id}__${i}__${k}`, LINE_CHECKS[k], {
              speaker: nameOf(ctx, line.speaker), speakerProfile: speakerProfile(ctx, line.speaker), previousCut: previousCut(ctx, cut), sceneSoFar: sceneSoFar(ctx, cut, i), line: line.text,
            })),
      ),
    );
  }
  if (kind === 'scenario') {
    const g = ctx.genre;
    const total = ctx.episode.cuts.reduce((n, c) => n + c.durationSec, 0);
    const head = `This is episode ${ctx.episode.no} (${total}s, ${ctx.episode.cuts.length} cuts) of a Korean drama series.`;
    const candidate = { cuts: episodeDigest(ctx) };
    const structure = Object.entries(g.scenarioChecks).map(([k, c]) => choiceQ(`scenario__${k}`, [`${head} ${c.task}`, c.pass, c.fail], candidate));
    const carry = (ctx.series.topic.verifiedElements ?? []).map((el) => {
      const e = g.hookElements[el];
      if (!e) throw new JudgeError(`장르 팩에 없는 요소: ${el}`);
      return choiceQ(`scenario__carry__${el}`, [`${head} The approved topic was chosen for this view-driving element: ${e.name}. Judge the episode script itself, not the topic. ${e.task}`, e.pass, e.fail], candidate);
    });
    const safety = Object.entries(g.safetyChecks).map(([k, c]) => choiceQ(`scenario__safe__${k}`, [`${head} ${c.task}`, c.pass, c.fail], candidate));
    const fun = Object.entries(g.funChecks).map(([k, f]): JudgeQuestion => ({ type: 'score', id: `scenario__fun__${k}`, task: `${head} ${f.task}`, levels: f.levels, candidate }));
    return [...structure, ...carry, ...safety, ...fun];
  }
  return ctx.episode.cuts.flatMap((cut) => {
    const loc = ctx.series.locations.find((l) => l.id === cut.locationId);
    return PROP_CHECK_KEYS.map((k) => choiceQ(`${cut.id}__${k}`, PROP_CHECKS[k], {
      location: loc?.name ?? cut.locationId, locationProps: loc?.props ?? [], action: cut.action, visual: cut.visualEn,
    }));
  });
}

export interface ApplyResult {
  report: DramaGateReport;
  episode: DramaEpisode;
}

export function applyVerdicts(kind: EpisodeJudgeKind, ctx: GateContext, expected: ExpectedQuestion[], verdicts: JudgeVerdict[], judgeRef: string, now: string): ApplyResult {
  const byId = new Map(verdicts.map((v) => [v.id, v]));
  const ordered: JudgeVerdict[] = expected.map(({ id }) => {
    const v = byId.get(id);
    if (!v) throw new JudgeError(`판정 결과 누락: ${id}`);
    return v;
  });
  const findings: DramaFinding[] = [];
  const episode = structuredClone(ctx.episode);
  if (kind === 'dialogue') {
    const groups = new Map<string, JudgeVerdict[]>();
    for (const v of ordered) {
      if (v.type !== 'choice') throw new JudgeError(`대사 판정은 선택형만: ${v.id}`);
      const [cutId, idx] = v.id.split('__');
      const key = `${cutId}__${idx}`;
      groups.set(key, [...(groups.get(key) ?? []), v]);
    }
    for (const [key, vs] of groups) {
      const [cutId = '', idx = ''] = key.split('__');
      const i = Number(idx);
      const cut = episode.cuts.find((c) => c.id === cutId);
      const line = cut?.lines[i];
      if (!cut || !line) throw new JudgeError(`대본에 없는 대사: ${key}`);
      if (vs.length !== LINE_CHECK_KEYS.length) throw new JudgeError(`대사 판정 항목 수가 ${LINE_CHECK_KEYS.length}개가 아님: ${key}`);
      const check = (v: JudgeVerdict) => v.id.split('__')[2] ?? v.id;
      const failed = vs.filter((v) => v.type === 'choice' && v.decided && v.choice === 'fail').map(check);
      const pending = vs.filter((v) => !v.decided).map(check);
      const lint = lineFindings(cut, i, ctx.genre);
      if (failed.length) findings.push({ severity: 'block', message: `JEV 확정 fail: ${failed.join(', ')}`, cutId, lineIndex: i, evidence: line.text });
      else if (pending.length) findings.push({ severity: 'review', message: `JEV 미확정: ${pending.join(', ')} — 문구 수정 후 재판정 또는 사람 승인`, cutId, lineIndex: i, evidence: line.text });
      else if (lint.length) findings.push(...lint);
      else if (!isLineCleared(cut, line)) line.verification = { status: 'verified', judgeRef, at: now, lineHash: lineHash(cut, line) };
    }
  } else {
    for (const v of ordered) {
      const parts = v.id.split('__');
      const cutId = kind === 'props' ? parts[0] : undefined;
      const label = parts.slice(1).join('__') || v.id;
      if (v.type === 'score') {
        findings.push({ severity: 'info', message: `${label} ${v.level}/${v.levels} (확신도 ${v.confidence.toFixed(2)}, 참고용)` });
        continue;
      }
      // 수위 안전은 미확정도 통과로 보지 않는다 — 장르 팩이 undecided:'review' 로 완화한 항목만 예외.
      const safety = label.startsWith('safe__') && (ctx.genre.safetyChecks[label.slice('safe__'.length)]?.undecided ?? 'block') === 'block';
      if (v.decided && v.choice === 'fail') findings.push({ severity: 'block', message: `${label} 확정 fail`, cutId });
      else if (!v.decided) findings.push({ severity: safety ? 'block' : 'review', message: `${label} 미확정(${v.choice} ${v.confidence.toFixed(2)}/${v.probability.toFixed(2)})${safety ? ' — 수위 표현을 고쳐 재판정' : ''}`, cutId });
    }
  }
  return { report: toReport(JUDGE_GATE_ID[kind], 'episode', findings, fingerprintOf(ctx.series, ctx.episode)), episode };
}
