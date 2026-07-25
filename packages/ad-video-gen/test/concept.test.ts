/**
 * 컨셉 3중 게이트 테스트 — 각 실패 사유를 개별 케이스로, 경고 범위까지 검증.
 */
import { describe, it, expect } from 'vitest';
import { checkConcept } from '../src/core/concept.js';
import type { AdConcept } from '@cak/contracts';

/** 게이트를 전부 통과하는 기준 컨셉 (15초, 비트 4개) */
function validConcept(over: Partial<AdConcept> = {}): AdConcept {
  return {
    subject: '진돗개 사료',
    category: '펫',
    sellingPoints: ['진도 현지 급여 배합 재현'],
    evidence: ['진도군 브리더 인터뷰 2026-06 — 급여 배합 일화'],
    uniqueness: { passed: true, rationale: '진도 현지 배합은 이 브랜드만 검증했다' },
    beats: [
      { index: 0, durationSec: 3, description: '해무 낀 진도 해안, 달리는 진돗개' },
      { index: 1, durationSec: 4, description: '주방에서 배합되는 원물 클로즈업' },
      { index: 2, durationSec: 4, description: '그릇에 담기는 사료, 개가 다가옴' },
      { index: 3, durationSec: 4, description: '노을 아래 주인과 개, 제품 히어로 샷' },
    ],
    narrativeComplete: true,
    humanApproved: true,
    ...over,
  };
}

describe('checkConcept — 게이트 통과', () => {
  it('정상 컨셉은 ok=true, problems 없음', () => {
    const r = checkConcept(validConcept());
    expect(r.ok).toBe(true);
    expect(r.problems).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
});

describe('checkConcept — 실패 사유 개별 검증', () => {
  it('sellingPoints 비면 실패', () => {
    const r = checkConcept(validConcept({ sellingPoints: [] }));
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes('sellingPoints'))).toBe(true);
  });

  it('evidence 비면 실패 (리서치 근거 필수)', () => {
    const r = checkConcept(validConcept({ evidence: [] }));
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes('evidence'))).toBe(true);
  });

  it('고유성 테스트 실패 시 실패', () => {
    const r = checkConcept(validConcept({ uniqueness: { passed: false, rationale: '' } }));
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes('고유성'))).toBe(true);
  });

  it('서사 완결성 미통과 시 실패', () => {
    const r = checkConcept(validConcept({ narrativeComplete: false }));
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes('서사'))).toBe(true);
  });

  it('사람 게이트(humanApproved=false) 시 실패 — 무검수 광고 금지선', () => {
    const r = checkConcept(validConcept({ humanApproved: false }));
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes('사람 게이트'))).toBe(true);
  });

  it('beats 비면 실패', () => {
    const r = checkConcept(validConcept({ beats: [] }));
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes('beats'))).toBe(true);
  });

  it('beat durationSec<=0 이면 실패', () => {
    const c = validConcept();
    c.beats[1]!.durationSec = 0;
    const r = checkConcept(c);
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes('durationSec=0'))).toBe(true);
  });
});

describe('checkConcept — 경고', () => {
  it('beats 3개 미만이면 경고 (ok 는 유지)', () => {
    const r = checkConcept(
      validConcept({
        beats: [
          { index: 0, durationSec: 7, description: 'a' },
          { index: 1, durationSec: 8, description: 'b' },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes('권장 범위'))).toBe(true);
  });

  it('beats 6개 초과면 경고', () => {
    const beats = Array.from({ length: 7 }, (_, i) => ({ index: i, durationSec: 2, description: `b${i}` }));
    const r = checkConcept(validConcept({ beats }));
    expect(r.warnings.some((w) => w.includes('권장 범위'))).toBe(true);
  });

  it('beats 합이 15±2·30±3 밖이면 경고', () => {
    const beats = [
      { index: 0, durationSec: 7, description: 'a' },
      { index: 1, durationSec: 7, description: 'b' },
      { index: 2, durationSec: 7, description: 'c' },
    ]; // 합 21초 — 어느 범위에도 없음
    const r = checkConcept(validConcept({ beats }));
    expect(r.warnings.some((w) => w.includes('21초'))).toBe(true);
  });

  it('beats 합 30초(30±3 범위 내)는 경고 없음', () => {
    const beats = [
      { index: 0, durationSec: 10, description: 'a' },
      { index: 1, durationSec: 10, description: 'b' },
      { index: 2, durationSec: 10, description: 'c' },
    ];
    const r = checkConcept(validConcept({ beats }));
    expect(r.warnings).toEqual([]);
  });
});
