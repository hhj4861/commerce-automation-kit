import { describe, expect, it } from 'vitest';
import type { ProductPageBrief, ProductPageDoc } from '@cak/contracts';
import { productPageBriefSchema } from '../src/adapters/schemas.js';
import { renderHtml } from '../src/core/render.js';

const koBrief: ProductPageBrief = {
  id: 'hc1',
  keyword: '핸드크림',
  productName: '테스트 핸드크림',
  brand: 'TestBrand',
  market: 'naver-smartstore',
  tone: 'clean-derma',
  locale: 'ko',
  volume: '50ml',
  ingredients: [],
  claims: [],
  images: [{ slot: 'hero', path: '/tmp/hero.jpg', origin: 'user', licenseNote: '본인 촬영' }],
};

const koDoc: ProductPageDoc = {
  briefId: 'hc1',
  locale: 'ko',
  sections: [
    { type: 'hero', heading: '건조한 손에 수분 한 겹' },
    { type: 'full-ingredients', heading: '전성분', items: [{ text: '이상 시 사용 중지' }] },
  ],
};

describe('naver-smartstore 마켓 (한국어 상세)', () => {
  it('브리프 스키마가 market=naver-smartstore, locale=ko 를 받는다', () => {
    const parsed = productPageBriefSchema.safeParse(koBrief);
    expect(parsed.success).toBe(true);
  });

  it('ko 로케일에서 전성분 미기재 자리표시자가 한국어로 나온다', () => {
    const { html } = renderHtml(koBrief, koDoc);
    expect(html).toContain('전성분은 등록 전 반드시 기재');
    expect(html).not.toContain('全成分');
  });
});
