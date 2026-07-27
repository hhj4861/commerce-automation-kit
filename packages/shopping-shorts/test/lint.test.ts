import { describe, expect, it } from 'vitest';
import type { ShoppingShortsBrief, ShortsScript } from '@cak/contracts';
import { lintScript } from '../src/core/lint.js';

function brief(over: Partial<ShoppingShortsBrief> = {}): ShoppingShortsBrief {
  return {
    id: 'test-item',
    productName: '스텐 건조대',
    appealPoints: ['튼튼함'],
    createdAt: '2026-07-27T00:00:00Z',
    ...over,
  };
}

function script(over: Partial<ShortsScript> = {}): ShortsScript {
  return {
    briefId: 'test-item',
    hookType: 'demo',
    title: '스텐 건조대, 이렇게 씁니다',
    beats: [
      {
        index: 0,
        role: 'hook',
        durationSec: 3,
        narration: '빨래 널 곳이 늘 모자라다면',
        caption: '건조 공간 부족?',
        visualPrompt: 'A sturdy stainless laundry rack in a bright living room, cinematic',
      },
      {
        index: 1,
        role: 'cta',
        durationSec: 4,
        narration: '스텐 건조대 정보는 프로필 링크에',
        caption: '링크는 프로필에',
        visualPrompt: 'Close-up of the folded rack, studio light',
      },
    ],
    hashtags: ['#건조대'],
    description: '스텐 건조대 소개',
    ...over,
  };
}

function findRules(report: { findings: { rule: string }[] }): string[] {
  return report.findings.map((f) => f.rule);
}

describe('lintScript', () => {
  it('무해한 데모 대본은 통과', () => {
    const r = lintScript(brief(), script());
    expect(r.ok).toBe(true);
  });

  it('질병 효능 표현은 block', () => {
    const s = script();
    s.beats[0]!.narration = '이거 쓰면 아토피 완화에 좋아요';
    const r = lintScript(brief(), s);
    expect(r.ok).toBe(false);
    expect(findRules(r)).toContain('disease-efficacy');
  });

  it('가짜 경험담(N년 째 사용)은 block', () => {
    const s = script();
    s.beats[0]!.narration = '3년째 쓰는데 최고예요';
    const r = lintScript(brief(), s);
    expect(r.ok).toBe(false);
    expect(findRules(r)).toContain('fake-experience');
  });

  it('내돈내산·찐후기 서사도 block', () => {
    const s = script({ title: '내돈내산 건조대 찐후기' });
    const r = lintScript(brief(), s);
    expect(r.ok).toBe(false);
    expect(findRules(r)).toContain('fake-experience');
  });

  it('절대·보장 표현은 block', () => {
    const s = script();
    s.beats[1]!.caption = '100% 만족 보장';
    const r = lintScript(brief(), s);
    expect(r.ok).toBe(false);
    expect(findRules(r)).toContain('guarantee');
  });

  it('건기식 아니면 효능단정 강화 규칙 미적용, 건기식이면 block', () => {
    const s = script();
    s.beats[0]!.narration = '먹으면 근육이 커집니다';
    expect(lintScript(brief(), s).ok).toBe(true);
    const r = lintScript(brief({ isHealthFunctional: true }), s);
    expect(r.ok).toBe(false);
    expect(findRules(r)).toContain('hf-efficacy-assertion');
  });

  it('visualPrompt 의 외부 소스 신호(URL·캡처)는 block — 금지선 #1', () => {
    const s = script();
    s.beats[0]!.visualPrompt = 'use this https://example.com/video.mp4 as base';
    const r = lintScript(brief(), s);
    expect(r.ok).toBe(false);
    expect(findRules(r)).toContain('external-source');
  });

  it('제휴 링크가 있는데 고지 없으면 block, 고지 있으면 통과', () => {
    const b = brief({ affiliateUrl: 'https://link.coupang.com/a/xxxx' });
    const r1 = lintScript(b, script());
    expect(r1.ok).toBe(false);
    expect(findRules(r1)).toContain('disclosure-missing');

    const s2 = script({
      description:
        '스텐 건조대 소개\n\n이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.',
    });
    expect(lintScript(b, s2).ok).toBe(true);
  });

  it('공백 변형으로 고지 검증을 우회할 수 없다(NFKC·공백 정규화)', () => {
    const b = brief({ affiliateUrl: 'https://link.coupang.com/a/xxxx' });
    const s = script({ description: '쿠팡 파 트 너 스 활동으로 수 수 료를 받습니다' });
    expect(lintScript(b, s).ok).toBe(true);
  });

  it('최상급·긴급성은 warn(통과하되 보고)', () => {
    const s = script();
    s.beats[0]!.caption = '업계 1위 건조대, 곧 품절';
    const r = lintScript(brief(), s);
    expect(r.ok).toBe(true);
    expect(findRules(r)).toEqual(expect.arrayContaining(['superlative', 'false-urgency']));
  });

  it('대본에 상품명이 없으면 product-mismatch-risk warn', () => {
    const s = script({ title: '살림 꿀팁' });
    s.beats[0]!.narration = '공간 활용 팁';
    s.beats[1]!.narration = '링크는 프로필에';
    const r = lintScript(brief(), s);
    expect(r.ok).toBe(true);
    expect(findRules(r)).toContain('product-mismatch-risk');
  });
});
