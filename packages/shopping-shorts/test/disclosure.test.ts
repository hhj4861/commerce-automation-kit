import { describe, expect, it } from 'vitest';
import { PARTNERS_DISCLOSURE, hasDisclosure, withDisclosure } from '../src/core/disclosure.js';

describe('disclosure', () => {
  it('표준 문구를 인식한다', () => {
    expect(hasDisclosure(PARTNERS_DISCLOSURE)).toBe(true);
  });

  it('핵심 요소(파트너스+수수료) 동시 존재만 인정 — 한쪽만으로는 불인정', () => {
    expect(hasDisclosure('쿠팡 파트너스 링크입니다')).toBe(false);
    expect(hasDisclosure('수수료를 받을 수 있습니다')).toBe(false);
    expect(hasDisclosure('파트너스 활동으로 수수료를 받을 수 있습니다')).toBe(true);
  });

  it('공백·전각 변형에도 검증이 유지된다(NFKC+공백 제거)', () => {
    expect(hasDisclosure('파 트 너 스　수 수 료')).toBe(true);
  });

  it('withDisclosure: 없으면 덧붙이고, 있으면 그대로', () => {
    const appended = withDisclosure('제품 소개');
    expect(appended).toContain(PARTNERS_DISCLOSURE);
    expect(withDisclosure(appended)).toBe(appended);
  });

  it('빈 설명이면 구분 개행 없이 문구만', () => {
    expect(withDisclosure('')).toBe(PARTNERS_DISCLOSURE);
  });
});
