import { describe, expect, it } from 'vitest';
import type { ShoppingShortsBrief, ShortsScript } from '@cak/contracts';
import { briefSchema, toBrief } from '../src/adapters/schemas.js';
import { overlaySpecFor } from '../src/core/disclosure.js';
import { lintScript } from '../src/core/lint.js';

function brief(over: Partial<ShoppingShortsBrief> = {}): ShoppingShortsBrief {
  return {
    id: 'handcream-pilot',
    productName: '테스트 핸드크림',
    appealPoints: ['빠른 흡수'],
    createdAt: '2026-09-06T00:00:00Z',
    ...over,
  };
}

function script(description: string): ShortsScript {
  return {
    briefId: 'handcream-pilot',
    hookType: 'demo',
    title: '테스트 핸드크림 흡수 테스트',
    beats: [
      {
        index: 0,
        role: 'hook',
        durationSec: 3,
        narration: '테스트 핸드크림 바르고 10초',
        caption: '10초 흡수',
        visualPrompt: 'Hand cream absorbing on the back of a hand, macro, studio light',
      },
    ],
    hashtags: ['#핸드크림'],
    description,
  };
}

describe('sponsored(유료 의뢰·자체 판매) 브리프', () => {
  it('스키마가 sponsored 를 받아 계약 객체에 보존한다', () => {
    const parsed = briefSchema.safeParse({ ...brief(), sponsored: true });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(toBrief(parsed.data).sponsored).toBe(true);
  });

  it('overlaySpecFor: 제휴 링크가 있으면 "(광고)" 오버레이', () => {
    expect(overlaySpecFor(brief({ affiliateUrl: 'https://link.coupang.com/a/x' }))).toEqual({
      overlay: true,
      text: '(광고)',
    });
  });

  it('overlaySpecFor: 제휴 링크 없이 sponsored 만 있어도 "(광고)" 오버레이', () => {
    expect(overlaySpecFor(brief({ sponsored: true }))).toEqual({ overlay: true, text: '(광고)' });
  });

  it('overlaySpecFor: 둘 다 없으면 오버레이 없음', () => {
    expect(overlaySpecFor(brief()).overlay).toBe(false);
  });

  it('lint: sponsored 브리프의 설명란에 "(광고)"가 없으면 block', () => {
    const report = lintScript(brief({ sponsored: true }), script('테스트 핸드크림 소개'));
    const f = report.findings.find((x) => x.rule === 'disclosure-missing');
    expect(f?.severity).toBe('block');
  });

  it('lint: sponsored 브리프라도 "(광고)"가 있으면 통과', () => {
    const report = lintScript(brief({ sponsored: true }), script('(광고) 테스트 핸드크림 소개'));
    expect(report.findings.some((x) => x.rule === 'disclosure-missing')).toBe(false);
  });
});
