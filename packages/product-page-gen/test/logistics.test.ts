import { describe, expect, it } from 'vitest';
import { billedWeightG, checkLogistics, estimateJpy, volumetricG } from '../src/core/logistics.js';

describe('estimateJpy — 2023-08 요율표', () => {
  it('Standard green 500g = ¥730 (검증 수치)', () => {
    expect(estimateJpy('standard', 500, 'green')).toBe(730);
  });

  it('Economy silver 500g = ¥480, green 500g = ¥485', () => {
    expect(estimateJpy('economy', 500, 'silver')).toBe(480);
    expect(estimateJpy('economy', 500, 'green')).toBe(485);
  });

  it('Economy 는 gold 등급이 없어 silver 로 폴백', () => {
    expect(estimateJpy('economy', 500, 'gold')).toBe(480);
  });

  it('경계값: 501g 은 750g 구간', () => {
    expect(estimateJpy('standard', 501, 'green')).toBe(833);
  });

  it('Express 500g = ¥1,927', () => {
    expect(estimateJpy('express', 500)).toBe(1927);
  });

  it('표 범위 초과(6kg)는 null', () => {
    expect(estimateJpy('standard', 6000, 'green')).toBeNull();
  });
});

describe('부피무게', () => {
  it('(30×20×10)/6000 = 1kg', () => {
    expect(volumetricG({ wCm: 30, hCm: 20, tCm: 10 })).toBeCloseTo(1000);
  });

  it('청구 무게는 실측 vs 부피 중 큰 쪽', () => {
    expect(billedWeightG(200, { wCm: 30, hCm: 20, tCm: 10 })).toBeCloseTo(1000);
    expect(billedWeightG(1500, { wCm: 10, hCm: 10, tCm: 5 })).toBe(1500);
  });
});

describe('checkLogistics', () => {
  it('스프레이/미스트/향수는 flammable 판정', () => {
    for (const name of ['수분 미스트 150ml', 'ヘアカラー剤', 'Rose Perfume 50ml']) {
      const r = checkLogistics({ name, weightG: 200 });
      expect(r.flammable).toBe(true);
      expect(r.flammableMatches.length).toBeGreaterThan(0);
    }
  });

  it('일반 크림은 flammable 아님', () => {
    expect(checkLogistics({ name: 'スネイルBBクリーム', weightG: 100 }).flammable).toBe(false);
  });

  it('치수 없으면 economyEligible=null + 노트', () => {
    const r = checkLogistics({ name: 'クリーム', weightG: 300 });
    expect(r.economyEligible).toBeNull();
    expect(r.notes.some((n) => n.includes('치수 미제공'))).toBe(true);
  });

  it('A4·2.5cm 이내면 Economy 적격 + Economy 요율', () => {
    const r = checkLogistics({ name: 'シートマスク', weightG: 300, dims: { wCm: 20, hCm: 15, tCm: 1 }, grade: 'green' });
    expect(r.economyEligible).toBe(true);
    expect(r.estimatedJpy).toBe(425);
  });

  it('두께 초과면 Standard 요율로 추정', () => {
    const r = checkLogistics({ name: 'BBクリーム', weightG: 300, dims: { wCm: 15, hCm: 5, tCm: 4 }, grade: 'green' });
    expect(r.economyEligible).toBe(false);
    expect(r.estimatedJpy).toBe(648);
  });

  it('1kg 초과는 Economy 불가', () => {
    const r = checkLogistics({ name: 'ギフトセット', weightG: 1200 });
    expect(r.economyEligible).toBe(false);
  });

  it('요율 스테일 경고(TODO(D1))가 항상 포함된다', () => {
    const r = checkLogistics({ name: 'クリーム', weightG: 100 });
    expect(r.notes.some((n) => n.includes('TODO(D1)'))).toBe(true);
  });

  it('가로/세로 회전을 고려해 A4 판정한다 (리뷰 반영)', () => {
    const r = checkLogistics({ name: 'シートマスク', weightG: 300, dims: { wCm: 22, hCm: 31, tCm: 1 }, grade: 'green' });
    expect(r.economyEligible).toBe(true);
    expect(r.estimatedJpy).toBe(425);
  });

  it('중량 없이 치수만 있어도 부피무게 하한으로 추정한다 (리뷰 반영)', () => {
    const r = checkLogistics({ name: 'ギフトBOX', dims: { wCm: 40, hCm: 30, tCm: 10 } });
    expect(r.economyEligible).toBe(false); // 40cm > A4 + 부피무게 2kg
    expect(r.estimatedJpy).toBe(1010); // Standard green 2000g
    expect(r.notes.some((n) => n.includes('부피무게'))).toBe(true);
  });

  it('0 이하 중량은 미제공 처리 + 정확한 노트 (오도성 "범위 초과" 노트 금지)', () => {
    const r = checkLogistics({ name: 'クリーム', weightG: 0 });
    expect(r.estimatedJpy).toBeNull();
    expect(r.notes.some((n) => n.includes('유효하지 않음'))).toBe(true);
    expect(r.notes.some((n) => n.includes('범위 초과'))).toBe(false);
  });

  it('알 수 없는 등급은 throw (리뷰 반영)', () => {
    expect(() => estimateJpy('standard', 300, 'platinum' as never)).toThrow(/gold\|silver\|green/);
  });
});
