import type { DramaClipSpec, DramaFinding, DramaGateReport, DramaPlan } from '@cak/contracts';
import { PlanError, toSeedanceClip, type VideoOptions } from '../adapters/video/seedance-2-5.js';
import { RATE_MEASURED_AT, creditsFor } from './estimate.js';
import { fingerprintOf, topicFingerprint } from './fingerprint.js';
import type { GateContext } from './gates/types.js';
import { toReport } from './report.js';
import { topicGateId } from './topic-gates.js';
import { isLineCleared } from './line-hash.js';

/** 생성 명세 전에 같은 대본 지문으로 통과해야 하는 관문(주제 관문은 주제 지문으로 따로 확인). */
export const REQUIRED_GATES = ['schema', 'dialogue-lint', 'continuity', 'props', 'scenario'] as const;

export interface PlanInput {
  ctx: GateContext;
  reports: DramaGateReport[];
  budgetCredits: number;
  video: VideoOptions;
  now: string;
}

export interface PlanResult {
  ok: boolean;
  plan: DramaPlan | null;
  reports: DramaGateReport[];
}

export function buildPlan(input: PlanInput): PlanResult {
  const { ctx } = input;
  const fp = fingerprintOf(ctx.series, ctx.episode);

  const required: DramaFinding[] = [];
  for (const gate of REQUIRED_GATES) {
    const r = input.reports.filter((x) => x.gate === gate).at(-1);
    if (!r) required.push({ severity: 'block', message: `관문 기록 없음: ${gate}` });
    else if (r.fingerprint !== fp) required.push({ severity: 'block', message: `관문 기록이 현재 대본과 다름(대본 수정 후 재실행 필요): ${gate}` });
    else if (!r.ok) required.push({ severity: 'block', message: `관문 미통과: ${gate}` });
  }
  const topicGate = topicGateId(ctx.series.topic.id);
  const tr = input.reports.filter((x) => x.gate === topicGate).at(-1);
  if (!tr) required.push({ severity: 'block', message: `주제 관문 기록 없음: ${topicGate}` });
  else if (tr.fingerprint !== topicFingerprint(ctx.series.topic, ctx.series.genreId)) required.push({ severity: 'block', message: `주제 관문 기록이 시리즈의 주제와 다름: ${topicGate}` });
  else if (!tr.ok) required.push({ severity: 'block', message: `주제 관문 미통과: ${topicGate}` });

  const lines: DramaFinding[] = [];
  for (const cut of ctx.episode.cuts)
    cut.lines.forEach((l, i) => {
      if (isLineCleared(cut, l)) return;
      const s = l.verification.status;
      const message = s === 'verified' || s === 'human-approved' ? `검증 이후 대사·장면이 바뀜(재판정 필요, ${s})` : `검증되지 않은 대사(${s})`;
      lines.push({ severity: 'block', message, cutId: cut.id, lineIndex: i, evidence: l.text });
    });

  const backend: DramaFinding[] = [];
  const clips: DramaClipSpec[] = [];
  ctx.episode.cuts.forEach((cut, i) => {
    const prev = ctx.episode.cuts[i - 1];
    // 같은 장소에서 전환(섬광·암전) 없이 이어지면 앞 컷 마지막 프레임에서 시작한다
    const chained = prev && prev.locationId === cut.locationId && (cut.transitionIn ?? 'cut') === 'cut';
    try {
      const spec = toSeedanceClip(ctx, cut, input.video);
      clips.push({ ...spec, estCredits: creditsFor(spec.model, input.video.resolution, input.video.draft, spec.durationSec), ...(chained ? { startFromCut: prev.id } : {}) });
    } catch (e) {
      if (!(e instanceof PlanError)) throw e;
      backend.push({ severity: 'block', message: e.message, cutId: e.cutId });
    }
  });

  const budget: DramaFinding[] = [];
  const unknown = clips.filter((c) => c.estCredits === null);
  const total = unknown.length ? null : clips.reduce((n, c) => n + (c.estCredits ?? 0), 0);
  if (unknown.length)
    budget.push({ severity: 'block', message: `미실측 단가 — 생성 직전 get_cost 로 단가표 갱신 필요: ${unknown.map((c) => c.cutId).join(', ')}` });
  else if (total !== null && total > input.budgetCredits)
    budget.push({ severity: 'block', message: `견적 ${total}크레딧이 승인 한도 ${input.budgetCredits}크레딧 초과` });

  const reports = [
    toReport('required-gates', 'plan', required, fp),
    toReport('verified-lines', 'plan', lines, fp),
    toReport('backend', 'plan', backend, fp),
    toReport('budget', 'plan', budget, fp),
  ];
  const ok = reports.every((r) => r.ok);
  return {
    ok,
    reports,
    plan: ok
      ? { seriesId: ctx.series.id, episodeNo: ctx.episode.no, fingerprint: fp, clips, totalCredits: total, budgetCredits: input.budgetCredits, rateMeasuredAt: RATE_MEASURED_AT, createdAt: input.now }
      : null,
  };
}
