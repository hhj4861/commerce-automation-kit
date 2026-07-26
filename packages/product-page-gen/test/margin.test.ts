import { describe, expect, it } from 'vitest';
import { computeMargin } from '../src/core/margin.js';

/**
 * 검증 기준 수치: platform-selection-2026-07-26.md 소싱 실검증 —
 * 3W 스네일 실키포어 BB: 도매 12,100원, 큐텐재팬 ¥4,089, 환율 8.94,
 * Qxpress Standard 중간값 ¥675, 국내택배 배분 300원 →
 * 평시 순마진 ≈ +14,469원(39.6%), 메가와리 ≈ +8,803원(24.1%).
 */
const bb = {
  salePriceJpy: 4089,
  wholesaleKrw: 12100,
  jpyToKrw: 8.94,
  qxpressJpy: 675,
  domesticShipKrw: 300,
  vatRefund: true,
} as const;

describe('computeMargin — 3W BB 검증 케이스', () => {
  it('평시: 순마진 ≈ 14,469원, 마진율 ≈ 39.6%, pass', () => {
    const r = computeMargin({ ...bb, scenario: 'normal' });
    expect(r.appliedFeePct).toBe(12);
    expect(r.netKrw).toBeCloseTo(14468.92, 0);
    expect(r.netMarginPct).toBeCloseTo(39.58, 1);
    expect(r.pass).toBe(true);
  });

  it('메가와리(광고 4% 기본): 순마진 ≈ 8,803원, 마진율 ≈ 24.1%, pass', () => {
    const r = computeMargin({ ...bb, scenario: 'megawari' });
    expect(r.appliedFeePct).toBe(27.5);
    expect(r.netKrw).toBeCloseTo(8802.79, 0);
    expect(r.netMarginPct).toBeCloseTo(24.08, 1);
    expect(r.pass).toBe(true);
  });
});

describe('computeMargin — 게이트 동작', () => {
  it('역마진 케이스(3W 아이세럼: ¥779 판매, 도매 13,600원)는 fail', () => {
    const r = computeMargin({
      salePriceJpy: 779,
      wholesaleKrw: 13600,
      jpyToKrw: 8.94,
      scenario: 'normal',
      qxpressJpy: 619,
      domesticShipKrw: 300,
      vatRefund: true,
    });
    expect(r.netKrw).toBeLessThan(0);
    expect(r.pass).toBe(false);
  });

  it('부가세 환급 미반영 시 원가가 매입가 전액이다', () => {
    const withRefund = computeMargin({ ...bb, scenario: 'normal' });
    const withoutRefund = computeMargin({ ...bb, scenario: 'normal', vatRefund: false });
    expect(withoutRefund.cogsKrw - withRefund.cogsKrw).toBeCloseTo(12100 - 12100 * (100 / 110), 1);
    expect(withoutRefund.netKrw).toBeLessThan(withRefund.netKrw);
  });

  it('평시 광고비 기본 0, 명시하면 반영', () => {
    expect(computeMargin({ ...bb, scenario: 'normal' }).appliedFeePct).toBe(12);
    expect(computeMargin({ ...bb, scenario: 'normal', adRatePct: 3 }).appliedFeePct).toBe(15);
  });

  it('threshold 조정이 pass 를 바꾼다', () => {
    expect(computeMargin({ ...bb, scenario: 'megawari', passThresholdPct: 30 }).pass).toBe(false);
  });

  it('비정상 입력은 throw', () => {
    expect(() => computeMargin({ ...bb, scenario: 'normal', salePriceJpy: 0 })).toThrow();
    expect(() => computeMargin({ ...bb, scenario: 'normal', jpyToKrw: 0 })).toThrow();
  });

  it('음수 비용 입력은 throw — 부호 실수로 게이트 뒤집힘 방지 (리뷰 반영)', () => {
    expect(() => computeMargin({ ...bb, scenario: 'megawari', qxpressJpy: -675 })).toThrow(/qxpressJpy/);
    expect(() => computeMargin({ ...bb, scenario: 'megawari', adRatePct: -12 })).toThrow(/adRatePct/);
    expect(() => computeMargin({ ...bb, scenario: 'normal', domesticShipKrw: -300 })).toThrow(/domesticShipKrw/);
  });

  it('알 수 없는 scenario 는 throw (조용한 12% 폴백 금지 — 리뷰 반영)', () => {
    expect(() => computeMargin({ ...bb, scenario: 'Megawari' as never })).toThrow(/scenario/);
  });

  it('표시-판정 일치: netMarginPct(반올림)로 pass 를 판정하고 문턱을 결과에 담는다 (리뷰 반영)', () => {
    const r = computeMargin({
      salePriceJpy: 1000, jpyToKrw: 10, wholesaleKrw: 0, vatRefund: false,
      qxpressJpy: 0, domesticShipKrw: 7300.5, scenario: 'normal', fxSpreadPct: 0, adRatePct: 0,
      passThresholdPct: 15,
    });
    // 원시 14.995% → 표시 15.0% → 표시 기준 pass=true (모순 없는 계약)
    expect(r.netMarginPct).toBe(15);
    expect(r.pass).toBe(true);
    expect(r.passThresholdPct).toBe(15);
  });
});
