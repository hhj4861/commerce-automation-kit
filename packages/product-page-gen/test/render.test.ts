import { describe, expect, it } from 'vitest';
import { escapeHtml, renderHtml, renderText } from '../src/core/render.js';
import { parseArgs } from '../src/cli/index.js';
import { productPageBriefSchema } from '../src/adapters/schemas.js';
import type { ProductPageBrief, ProductPageDoc } from '@cak/contracts';

const brief: ProductPageBrief = {
  id: 'b1',
  keyword: '나이아신 화장품',
  productName: 'ナイアシンアミド10%セラム',
  brand: 'TestBrand',
  market: 'qoo10-jp',
  tone: 'clean-derma',
  locale: 'ja',
  volume: '30ml',
  ingredients: ['水', 'ナイアシンアミド', 'グリセリン'],
  claims: [{ text: 'ナイアシンアミドはビタミンB3', sourceUrl: 'https://example.com/a', verified: true }],
  images: [{ slot: 'hero', path: '/tmp/hero.jpg', origin: 'user', licenseNote: '본인 촬영' }],
  weightG: 90,
};

const doc: ProductPageDoc = {
  briefId: 'b1',
  locale: 'ja',
  sections: [
    { type: 'hero', eyebrow: 'NIACINAMIDE 10%', heading: 'うるおいセラム', body: 'キメを整える' },
    { type: 'pain-points', heading: 'こんなお悩みに', items: [{ text: 'テカリが気になる' }] },
    { type: 'ingredient', heading: 'ビタミンB3のちから', body: '説明', gauges: [{ label: 'ナイアシンアミド', pct: 50 }] },
    { type: 'usage', heading: '使い方', items: [{ text: '洗顔後に2-3滴' }] },
    { type: 'full-ingredients', heading: '全成分', items: [{ text: '異常時は使用を中止' }] },
    { type: 'faq', heading: 'FAQ', items: [{ title: '敏感肌でも?', text: 'パッチテスト推奨' }] },
    { type: 'policy', heading: '配送について', body: '5〜7日でお届け' },
  ],
};

describe('renderHtml', () => {
  it('스크립트·외부 CSS 없이 인라인 스타일만 출력한다', () => {
    const { html } = renderHtml(brief, doc);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<link');
    expect(html).not.toContain('<style');
    expect(html).toContain('style="');
  });

  it('이미지 path 는 images/<basename> 로, 미지정 슬롯은 토큰으로', () => {
    const { html } = renderHtml(brief, doc);
    expect(html).toContain('images/hero.jpg');
    expect(html).toContain('{{IMAGE_SLOT:texture}}'); // usage 섹션의 texture 슬롯 미지정
  });

  it('HTML 이스케이프가 적용된다', () => {
    const evil: ProductPageDoc = { ...doc, sections: [{ type: 'hero', heading: '<b>x</b>&"quote"' }] };
    const { html } = renderHtml(brief, evil);
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('&amp;');
  });

  it('톤에 따라 팔레트가 달라진다', () => {
    const a = renderHtml({ ...brief, tone: 'clean-derma' }, doc).html;
    const b = renderHtml({ ...brief, tone: 'premium-amber' }, doc).html;
    const c = renderHtml({ ...brief, tone: 'vivid-pop' }, doc).html;
    expect(a).toContain('#0E6B57');
    expect(b).toContain('#C8A96A');
    expect(c).toContain('#F04C51');
  });

  it('AI 생성 이미지에 aiLabeled 누락 시 렌더를 거부한다', () => {
    const bad: ProductPageBrief = {
      ...brief,
      images: [{ slot: 'hero', path: '/tmp/x.jpg', origin: 'ai-generated', licenseNote: 'i2i 생성' }],
    };
    expect(() => renderHtml(bad, doc)).toThrow(/aiLabeled/);
  });

  it('briefId 불일치는 거부한다', () => {
    expect(() => renderHtml(brief, { ...doc, briefId: 'other' })).toThrow(/briefId/);
  });

  it('locale 불일치는 거부한다 — lint 우회 경로 차단 (리뷰 반영)', () => {
    expect(() => renderHtml(brief, { ...doc, locale: 'ko' })).toThrow(/locale/);
  });

  it('이미지 path 의 따옴표·특수문자는 src 속성에서 escape 된다 (리뷰 반영)', () => {
    const evil: ProductPageBrief = {
      ...brief,
      images: [{ slot: 'hero', path: '/tmp/x" onerror="alert(1).jpg', origin: 'user', licenseNote: '본인 촬영' }],
    };
    const { html } = renderHtml(evil, doc);
    expect(html).not.toContain('onerror="alert');
    expect(html).toContain('&quot;');
  });

  it('전성분 비면 경고를 낸다', () => {
    const { warnings } = renderHtml({ ...brief, ingredients: [] }, doc);
    expect(warnings.some((w) => w.includes('전성분'))).toBe(true);
  });

  it('미검증 claim 이 있으면 경고를 낸다', () => {
    const { warnings } = renderHtml(
      { ...brief, claims: [{ text: '근거 없는 주장', verified: false }] },
      doc,
    );
    expect(warnings.some((w) => w.includes('미검증 claim'))).toBe(true);
  });
});

describe('renderText', () => {
  it('섹션 헤딩·항목·게이지·전성분을 담은 텍스트 폴백을 만든다 (리뷰 반영)', () => {
    const t = renderText(brief, doc);
    expect(t).toContain('■ うるおいセラム');
    expect(t).toContain('- テカリが気になる');
    expect(t).toContain('- ナイアシンアミド: 50%');
    expect(t).toContain('전성분: 水, ナイアシンアミド, グリセリン');
  });
});

describe('escapeHtml / parseArgs / schema', () => {
  it('escapeHtml 기본 5종', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('parseArgs — 플래그/불리언/값', () => {
    const a = parseArgs(['margin', '--sale-jpy', '4089', '--no-vat-refund', '--scenario', 'megawari']);
    expect(a.cmd).toBe('margin');
    expect(a.flags['sale-jpy']).toBe('4089');
    expect(a.flags['no-vat-refund']).toBe(true);
    expect(a.flags['scenario']).toBe('megawari');
  });

  it('brief 스키마 — ai-generated + aiLabeled 누락을 거부', () => {
    const bad = {
      ...brief,
      images: [{ slot: 'hero', origin: 'ai-generated', licenseNote: 'x' }],
    };
    expect(productPageBriefSchema.safeParse(bad).success).toBe(false);
  });

  it('brief 스키마 — 정상 케이스 통과', () => {
    expect(productPageBriefSchema.safeParse(brief).success).toBe(true);
  });
});
