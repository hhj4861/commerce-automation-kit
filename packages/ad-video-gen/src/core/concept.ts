/**
 * 컨셉 3중 게이트 — 생성(크레딧 소모) 전에 AdConcept 를 검증하는 순수 로직. I/O 없음.
 *
 * 게이트: (1) 리서치 기반 소구점+근거 (2) 고유성 테스트 (3) 서사 완결성 + 사람 승인.
 * humanApproved=false 는 하드 실패다 — CLAUDE.md 금지선(무검수 광고 자동발행 금지)의 코드 구현.
 * 실패는 problems 배열로 전부 투명화한다(silent drop 금지).
 */
import type { AdConcept } from '@cak/contracts';

export interface ConceptCheckResult {
  ok: boolean;
  problems: string[];
  warnings: string[];
}

/** 목표 길이 허용 범위: 15초 스팟은 ±2초, 30초 스팟은 ±3초 */
const DURATION_RANGES: ReadonlyArray<{ label: string; min: number; max: number }> = [
  { label: '15초 스팟(15±2초)', min: 13, max: 17 },
  { label: '30초 스팟(30±3초)', min: 27, max: 33 },
];

export function checkConcept(c: AdConcept): ConceptCheckResult {
  const problems: string[] = [];
  const warnings: string[] = [];

  if (c.sellingPoints.length === 0) {
    problems.push('sellingPoints 비어 있음 — 리서치로 소구점 1~2개를 먼저 도출해야 한다');
  }
  if (c.evidence.length === 0) {
    problems.push('evidence 비어 있음 — 소구점의 리서치 근거(출처·일화·차별 스펙) 필수');
  }
  if (!c.uniqueness.passed) {
    problems.push('고유성 테스트 실패 — 유사 대상을 넣어도 광고가 성립하면 실패한 컨셉');
  }
  if (!c.narrativeComplete) {
    problems.push('서사 완결성 미통과 — 결과로 점프하는 인과 구멍이 있는 서사로는 생성 금지');
  }
  if (!c.humanApproved) {
    problems.push('사람 게이트 미통과 — humanApproved=false 컨셉으로는 생성을 트리거하지 않는다');
  }
  if (c.beats.length === 0) {
    problems.push('beats 비어 있음 — 장면 비트 없이는 프롬프트를 조립할 수 없다');
  }
  for (const b of c.beats) {
    if (b.durationSec <= 0) {
      problems.push(`beat ${b.index}: durationSec=${b.durationSec} — 0 이하 길이는 무효`);
    }
  }

  // 경고는 비트가 존재할 때만 의미가 있다(비어 있으면 위 problems 가 이미 커버).
  if (c.beats.length > 0) {
    if (c.beats.length < 3 || c.beats.length > 6) {
      warnings.push(`beats ${c.beats.length}개 — 권장 범위(3~6개) 밖`);
    }
    const total = c.beats.reduce((sum, b) => sum + b.durationSec, 0);
    const inRange = DURATION_RANGES.some((r) => total >= r.min && total <= r.max);
    if (!inRange) {
      warnings.push(
        `beats 합 ${total}초 — 표준 스팟 길이 범위(${DURATION_RANGES.map((r) => r.label).join(' / ')}) 밖`,
      );
    }
  }

  return { ok: problems.length === 0, problems, warnings };
}
