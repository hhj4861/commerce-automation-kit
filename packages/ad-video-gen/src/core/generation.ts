/** 광고·쇼츠 공통 생성기. 광고의 컨셉 게이트/프롬프트/품질 정책을 한 경로에서 사용한다. */
import type { AdVideoTier, VideoGenerationPlan, VideoGenerationRequest } from '@cak/contracts';
import { checkConcept } from './concept.js';
import { buildSpotPrompt, lintPrompt } from './prompt.js';
import { estimateCredits, pickTierDefaults } from './cost.js';

export type GenerationPlanResult =
  | { ok: true; plan: VideoGenerationPlan }
  | { ok: false; problems: string[]; warnings: string[] };

/** 티어 선택은 소비 채널과 무관하다. 쇼츠라는 이유로 저가 모델로 내리지 않는다. */
export function estimateGeneration(tier: AdVideoTier, durations: number[]) {
  const quality = pickTierDefaults(tier);
  const clips = durations.map((durationSec) => ({
    durationSec,
    ...estimateCredits(quality.model, quality.resolution, durationSec),
  }));
  const known = clips.length > 0 && clips.every((c) => c.credits !== null);
  return {
    tier,
    model: quality.model,
    resolution: quality.resolution,
    referenceCredits: known ? Math.round(clips.reduce((n, c) => n + c.credits!, 0) * 100) / 100 : null,
    costPreflightRequired: true as const,
    clips,
  };
}

export function buildVideoGenerationPlan(request: VideoGenerationRequest): GenerationPlanResult {
  const { concept } = request;
  const gate = checkConcept(concept);
  const problems = [...gate.problems];
  // 공백·중복 인덱스는 장면 누락/잘못된 클립 매핑으로 이어지므로 생성 전에 거부한다.
  if (!concept.subject.trim()) problems.push('subject: 상품/브랜드명 필수');
  if (concept.sellingPoints.some((s) => !s.trim())) problems.push('sellingPoints: 빈 소구점 불가');
  if (concept.evidence.some((s) => !s.trim())) problems.push('evidence: 빈 근거 불가');
  if (!concept.uniqueness.rationale.trim()) problems.push('uniqueness.rationale: 고유성 근거 필수');
  const beats = [...concept.beats].sort((a, b) => a.index - b.index);
  for (const [i, beat] of beats.entries()) {
    if (beat.index !== i) problems.push('beats.index: 0부터 연속된 고유 인덱스여야 한다');
    if (!Number.isFinite(beat.durationSec) || beat.durationSec <= 0) problems.push(`beat ${i}: 유효한 길이 필수`);
    if (!beat.description.trim()) problems.push(`beat ${i}: 장면 묘사 필수`);
  }
  if (request.target === 'shorts' && concept.aspectRatio !== undefined && concept.aspectRatio !== '9:16') {
    problems.push('쇼츠 컨셉 화면비는 9:16이어야 한다');
  }
  if (request.target === 'shorts' && request.splitByBeat === false) {
    problems.push('쇼츠는 대본/내레이션 동기화를 위해 비트별 클립이 필요하다');
  }
  if (problems.length) return { ok: false, problems, warnings: gate.warnings };

  const tier = request.tier ?? 'standard';
  const quality = pickTierDefaults(tier);
  const aspectRatio = request.target === 'shorts' ? '9:16' : concept.aspectRatio ?? '16:9';
  const splitByBeat = request.splitByBeat ?? request.target === 'shorts';
  const groups = splitByBeat ? beats.map((b) => [b]) : [beats];
  const clips = groups.map((group, index) => {
    const durationSec = group.reduce((sum, beat) => sum + beat.durationSec, 0);
    const prompt = buildSpotPrompt({ ...concept, beats: group }, {
      aspectRatio,
      ...(request.extraStyle !== undefined ? { extraStyle: request.extraStyle } : {}),
    });
    for (const v of lintPrompt(prompt).violations) problems.push(`clip ${index}: ${v.phrase} — ${v.reason}`);
    return {
      index,
      beatIndices: group.map((b) => b.index),
      prompt,
      durationSec,
      model: quality.model,
      resolution: quality.resolution,
      aspectRatio,
      generateAudio: false as const,
      referenceCredits: estimateCredits(quality.model, quality.resolution, durationSec).credits,
    };
  });
  // 한 장면이라도 실패하면 부분 계획을 내보내지 않는다(무검증 클립 생성 방지).
  if (problems.length) return { ok: false, problems, warnings: gate.warnings };
  return {
    ok: true,
    plan: {
      engine: 'ad-cinematic-v1', target: request.target, subject: concept.subject, tier, splitByBeat, clips,
      referenceCredits: estimateGeneration(tier, clips.map((c) => c.durationSec)).referenceCredits,
      costPreflightRequired: true,
      warnings: [...gate.warnings, '요청 모델·해상도·길이 지원과 실제 비용은 생성 전 get_cost로 확인한다. 임의 품질 하향 금지.'],
    },
  };
}
