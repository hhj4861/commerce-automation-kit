/**
 * 프롬프트 조립·lint 테스트 — 스타일 가이드 포함, 비트 시간 누적, 금지구/온스크린 텍스트 검출,
 * 부정형("no on-screen text")은 통과.
 */
import { describe, it, expect } from 'vitest';
import { STYLE_GUIDE, buildSpotPrompt, lintPrompt } from '../src/core/prompt.js';
import type { AdConcept } from '@cak/contracts';

function concept(): AdConcept {
  return {
    subject: 'KOREA JINDO 사료',
    category: '펫',
    sellingPoints: ['진도 현지 배합'],
    evidence: ['브리더 인터뷰'],
    uniqueness: { passed: true, rationale: 'Only this brand reproduces the Jindo island feeding blend.' },
    beats: [
      { index: 0, durationSec: 2, description: 'Sea fog over Jindo coast, a dog running.' },
      { index: 1, durationSec: 3.5, description: 'Close-up of raw ingredients being blended.' },
      { index: 2, durationSec: 5, description: 'The dog approaches the bowl at golden hour.' },
      { index: 3, durationSec: 4.5, description: 'Hero shot of the product beside the dog.' },
    ],
    narrativeComplete: true,
    humanApproved: true,
  };
}

describe('buildSpotPrompt', () => {
  it('STYLE_GUIDE 가 항상 포함된다', () => {
    expect(buildSpotPrompt(concept())).toContain(STYLE_GUIDE);
  });

  it('extraStyle 은 STYLE_GUIDE 뒤에 붙는다', () => {
    const p = buildSpotPrompt(concept(), { extraStyle: 'Teal and amber palette.' });
    expect(p).toContain(`${STYLE_GUIDE} Teal and amber palette.`);
  });

  it('비트 초 구간이 누적 계산된다 (0–2, 2–5.5, 5.5–10.5, 10.5–15)', () => {
    const p = buildSpotPrompt(concept());
    expect(p).toContain('Beat 1 (0s–2s): Sea fog over Jindo coast');
    expect(p).toContain('Beat 2 (2s–5.5s):');
    expect(p).toContain('Beat 3 (5.5s–10.5s):');
    expect(p).toContain('Beat 4 (10.5s–15s):');
  });

  it('요약 문장에 subject·소구점·고유성 근거가 들어간다', () => {
    const p = buildSpotPrompt(concept());
    expect(p).toContain('KOREA JINDO 사료');
    expect(p).toContain('진도 현지 배합');
    expect(p).toContain('Only this brand reproduces');
  });

  it('조립된 프롬프트 자체가 lint 클린이다 (STYLE_GUIDE 의 "no on-screen text" 포함)', () => {
    const { violations } = lintPrompt(buildSpotPrompt(concept()));
    expect(violations).toEqual([]);
  });
});

describe('lintPrompt — 금지구 (NSFW 오탐 실측 사례)', () => {
  it('perfume commercial 검출 (대소문자 무시)', () => {
    const { violations } = lintPrompt('A luxurious Perfume Commercial in golden light');
    expect(violations.some((v) => v.phrase === 'perfume commercial')).toBe(true);
    expect(violations[0]!.reason).toContain('NSFW');
  });

  it('bare feet / lingerie 등 나머지 금지구도 검출', () => {
    const { violations } = lintPrompt('bare feet on marble, silk lingerie drape');
    const phrases = violations.map((v) => v.phrase);
    expect(phrases).toContain('bare feet');
    expect(phrases).toContain('lingerie');
  });
});

describe('lintPrompt — 온스크린 텍스트 지시', () => {
  it('화면 텍스트 지시는 violation (후반 오버레이로)', () => {
    const { violations } = lintPrompt('Show the text "SALE 50%" over the final frame');
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]!.reason).toContain('후반 오버레이');
  });

  it('caption / title card 지시도 검출', () => {
    const { violations } = lintPrompt('Add a caption at the bottom, then a title card');
    expect(violations.length).toBeGreaterThanOrEqual(2);
  });

  it('부정형 "no on-screen text" 는 위반이 아니다', () => {
    const { violations } = lintPrompt('smooth dolly moves, no camera shake, no on-screen text.');
    expect(violations).toEqual([]);
  });

  it('부정형 "without captions" 도 위반이 아니다', () => {
    const { violations } = lintPrompt('clean cinematic frame without captions');
    expect(violations).toEqual([]);
  });

  it('부정형과 긍정 지시가 섞이면 긍정 지시만 잡는다', () => {
    const { violations } = lintPrompt('no on-screen text in the intro, but display the words BUY NOW at the end');
    expect(violations.length).toBe(1);
    expect(violations[0]!.phrase.toLowerCase()).toContain('display the words');
  });
});
