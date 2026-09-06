import { describe, expect, it } from 'vitest';
import type { ShoppingShortsBrief, ShortsScript, ShortsScriptBeat } from '@cak/contracts';
import { rankScripts, scoreScript } from '../src/core/score.js';

function brief(over: Partial<ShoppingShortsBrief> = {}): ShoppingShortsBrief {
  return {
    id: 'hc',
    productName: '테스트 핸드크림',
    appealPoints: ['빠른 흡수'],
    createdAt: '2026-09-06T00:00:00Z',
    ...over,
  };
}

function beat(over: Partial<ShortsScriptBeat>): ShortsScriptBeat {
  return {
    index: 0,
    role: 'body',
    durationSec: 4,
    narration: '테스트 핸드크림 콩알만큼',
    caption: '콩알 크기',
    visualPrompt: 'Hands spreading cream on the back of a hand, macro',
    ...over,
  };
}

/** 기준 대본: 훅 3s(움직임) → 바디 4s → 바디 4s → CTA 4s = 15s, 상품명은 훅에서 언급 */
function script(over: Partial<ShortsScript> = {}, beats?: ShortsScriptBeat[]): ShortsScript {
  return {
    briefId: 'hc',
    hookType: 'before-after',
    title: '테스트 핸드크림 10초 (광고)',
    beats: beats ?? [
      beat({ index: 0, role: 'hook', durationSec: 3, narration: '테스트 핸드크림 바른 손등', caption: '환절기 손등', visualPrompt: 'Extreme close-up of a dry hand, fingers slowly turning under window light' }),
      beat({ index: 1, role: 'body', durationSec: 4 }),
      beat({ index: 2, role: 'body', durationSec: 4, narration: '종이를 눌러도 붙지 않아요', caption: '종이 테스트' }),
      beat({ index: 3, role: 'cta', durationSec: 4, narration: '성분과 용량은 설명란 링크에서 확인하세요', caption: '설명란 링크', visualPrompt: 'Hero shot of the tube on a table' }),
    ],
    hashtags: ['#핸드크림'],
    description: '(광고) 테스트',
    ...over,
  };
}

function dim(report: ReturnType<typeof scoreScript>, id: string) {
  const d = report.dimensions.find((x) => x.id === id);
  if (!d) throw new Error(`dimension ${id} 없음`);
  return d;
}

describe('scoreScript — 생성 전 효율 참고 점수', () => {
  it('기준 대본은 0~100 안의 총점을 내고 차원 합과 같다', () => {
    const r = scoreScript(brief(), script());
    expect(r.total).toBeGreaterThanOrEqual(0);
    expect(r.total).toBeLessThanOrEqual(100);
    expect(r.total).toBe(r.dimensions.reduce((s, d) => s + d.score, 0));
    expect(r.dimensions.reduce((s, d) => s + d.max, 0)).toBe(100);
  });

  it('훅 장면에 움직임이 있으면 hook-motion 만점, 정적 장면이면 감점', () => {
    const moving = scoreScript(brief(), script());
    const s = script();
    s.beats[0] = beat({ ...s.beats[0]!, visualPrompt: 'A white tube standing on a wooden table, soft light' });
    const still = scoreScript(brief(), s);
    expect(dim(moving, 'hook-motion').score).toBe(dim(moving, 'hook-motion').max);
    expect(dim(still, 'hook-motion').score).toBeLessThan(dim(moving, 'hook-motion').score);
  });

  it('핵심 데모(두 번째 비트)가 10초 안에 끝나면 payoff-10s 만점, 넘기면 감점', () => {
    const inTime = scoreScript(brief(), script());
    const s = script();
    s.beats[1] = beat({ ...s.beats[1]!, durationSec: 9 });
    const late = scoreScript(brief(), s);
    expect(dim(inTime, 'payoff-10s').score).toBe(dim(inTime, 'payoff-10s').max);
    expect(dim(late, 'payoff-10s').score).toBeLessThan(dim(inTime, 'payoff-10s').score);
  });

  it('초당 내레이션 글자 수가 과하면 narration-density 감점', () => {
    const s = script();
    s.beats[1] = beat({ ...s.beats[1]!, durationSec: 4, narration: '테스트 핸드크림을 콩알만큼 덜어서 손등 전체에 골고루 얇게 펴 바르고 열까지 세면서 기다리면 됩니다' });
    const dense = scoreScript(brief(), s);
    const normal = scoreScript(brief(), script());
    expect(dim(dense, 'narration-density').score).toBeLessThan(dim(normal, 'narration-density').score);
  });

  it('자막이 14자를 넘으면 caption-readable 감점', () => {
    const s = script();
    s.beats[2] = beat({ ...s.beats[2]!, caption: '열까지 세는 동안 스며들고 종이를 눌러도 안 붙어요' });
    expect(dim(scoreScript(brief(), s), 'caption-readable').score).toBeLessThan(
      dim(scoreScript(brief(), script()), 'caption-readable').score,
    );
  });

  it('상품명이 5초 안에 나오면 branding-early 만점, CTA에서만 나오면 감점', () => {
    const early = scoreScript(brief(), script());
    const s = script();
    s.beats[0] = beat({ ...s.beats[0]!, narration: '가을만 되면 손등이 갈라지죠' });
    s.beats[1] = beat({ ...s.beats[1]!, narration: '콩알만큼 덜어 펴 바르면', caption: '콩알' });
    s.beats[3] = beat({ ...s.beats[3]!, narration: '테스트 핸드크림 정보는 설명란 링크에서 확인하세요' });
    const late = scoreScript(brief(), s);
    expect(dim(early, 'branding-early').score).toBe(dim(early, 'branding-early').max);
    expect(dim(late, 'branding-early').score).toBeLessThan(dim(early, 'branding-early').score);
  });

  it('CTA 비트가 없으면 direction-cta 0점', () => {
    const s = script();
    s.beats = s.beats.slice(0, 3);
    expect(dim(scoreScript(brief(), s), 'direction-cta').score).toBe(0);
  });

  it('총 길이 10초 미만이면 length 0점(유료 조회 집계 기준 미달)', () => {
    const s = script({}, [
      beat({ index: 0, role: 'hook', durationSec: 3, visualPrompt: 'hand turning' }),
      beat({ index: 1, role: 'cta', durationSec: 4, narration: '설명란 링크에서 확인하세요' }),
    ]);
    expect(dim(scoreScript(brief(), s), 'length').score).toBe(0);
  });
});

describe('rankScripts — 후보 정렬', () => {
  it('총점 내림차순으로 정렬하고 같은 훅 유형이 겹치면 note 를 남긴다', () => {
    const strong = { brief: brief(), script: script() };
    const weak = script({ hookType: 'before-after' });
    weak.beats = weak.beats.slice(0, 3); // CTA 없음 → 감점
    const ranked = rankScripts([{ brief: brief(), script: weak }, strong]);
    expect(ranked[0]!.total).toBeGreaterThanOrEqual(ranked[1]!.total);
    expect(ranked[0]!.script.briefId).toBe('hc');
    expect(ranked.some((r) => r.notes.some((n) => n.includes('훅 유형')))).toBe(true);
  });
});
