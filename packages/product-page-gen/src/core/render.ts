/**
 * HTML 렌더러 — ProductPageDoc(카피 완성본) → 큐텐재팬 상세용 HTML 프래그먼트.
 *
 * 원칙:
 * - 인라인 스타일만, <script>·외부 CSS·외부 폰트 0 (플랫폼 에디터 호환).
 * - 결정적 템플릿: 같은 입력 → 같은 출력. 카피 생성은 여기서 하지 않는다.
 * - 이미지: path 가 있으면 images/<basename> 상대참조, 없으면 {{IMAGE_SLOT:slot}} 토큰.
 *   (J'QSM 업로드 후 실제 URL 로 치환하는 것은 등록 단계의 일 — 이 원자는 파일 산출까지)
 * - 톤 3종: 2026-07-26 사용자 확인 시안 A(clean-derma)/B(premium-amber)/C(vivid-pop).
 */
import type { PageImageAsset, PageSection, PageTone, ProductPageBrief, ProductPageDoc } from '@cak/contracts';

interface ToneTokens {
  bg: string;
  ink: string;
  dim: string;
  acc: string;
  soft: string;
  line: string;
  headWeight: number;
  radius: number;
  headFont: string;
}

const TONES: Record<PageTone, ToneTokens> = {
  'clean-derma': {
    bg: '#FFFFFF', ink: '#1B2420', dim: '#5F6A64', acc: '#0E6B57',
    soft: '#F5F9F7', line: '#E4EBE7', headWeight: 800, radius: 10,
    headFont: "'Hiragino Kaku Gothic ProN','Yu Gothic',sans-serif",
  },
  'premium-amber': {
    bg: '#1E1B17', ink: '#F2EBDD', dim: '#B7AD9A', acc: '#C8A96A',
    soft: '#27231E', line: '#3A342B', headWeight: 600, radius: 10,
    headFont: "'Hiragino Mincho ProN','Yu Mincho',serif",
  },
  'vivid-pop': {
    bg: '#FFF9F0', ink: '#2A1F1A', dim: '#7A6A5E', acc: '#F04C51',
    soft: '#FFF1E4', line: '#F2DFC9', headWeight: 900, radius: 14,
    headFont: "'Hiragino Kaku Gothic ProN','Yu Gothic',sans-serif",
  },
};

export function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function imageRef(images: PageImageAsset[], slot: PageImageAsset['slot']): string {
  const img = images.find((i) => i.slot === slot);
  if (img?.path) {
    const base = img.path.split('/').pop() ?? img.path;
    return `images/${base}`;
  }
  return `{{IMAGE_SLOT:${slot}}}`;
}

function imgTag(images: PageImageAsset[], slot: PageImageAsset['slot'], alt: string): string {
  // src 도 escape — 파일명 유래 따옴표/특수문자의 속성 탈출(onerror 주입) 차단 (2026-07-26 리뷰).
  return `<img src="${escapeHtml(imageRef(images, slot))}" alt="${escapeHtml(alt)}" style="width:100%;max-width:100%;display:block;border:0;" />`;
}

export interface RenderWarnings {
  warnings: string[];
}

/** 렌더 전 무결성 검사 — 위반은 경고가 아니라 거부 사유. */
export function integrityErrors(brief: ProductPageBrief, doc: ProductPageDoc): string[] {
  const errors: string[] = [];
  if (doc.briefId !== brief.id) errors.push(`doc.briefId(${doc.briefId}) ≠ brief.id(${brief.id})`);
  // locale 오기입은 lint 규칙 세트 전체를 우회하는 경로 — 무결성 위반으로 취급 (2026-07-26 리뷰).
  if (doc.locale !== brief.locale) errors.push(`doc.locale(${doc.locale}) ≠ brief.locale(${brief.locale}) — lint 우회 위험`);
  for (const img of brief.images) {
    if (img.origin === 'ai-generated' && img.aiLabeled !== true) {
      errors.push(`AI 생성 이미지(${img.slot})에 aiLabeled=true 누락 — 정직 표기 원칙 위반`);
    }
  }
  return errors;
}

export function renderHtml(brief: ProductPageBrief, doc: ProductPageDoc): { html: string; warnings: string[] } {
  const errs = integrityErrors(brief, doc);
  if (errs.length > 0) throw new Error(`렌더 거부: ${errs.join(' / ')}`);

  const t = TONES[brief.tone];
  const warnings: string[] = [];
  if (brief.ingredients.length === 0) warnings.push('전성분(ingredients)이 비어 있음 — 표기 의무 항목, 등록 전 반드시 채울 것');
  if (!brief.images.some((i) => i.slot === 'hero')) warnings.push('히어로 이미지 미지정 — {{IMAGE_SLOT:hero}} 토큰으로 출력됨');
  const unverified = brief.claims.filter((c) => !c.verified);
  if (unverified.length > 0) warnings.push(`미검증 claim ${unverified.length}건 존재 — 본문 카피에 사용 금지(스킬 규칙)`);

  const parts: string[] = [];
  for (const s of doc.sections) {
    parts.push(renderSection(s, brief, t));
  }

  const html =
    `<div style="max-width:750px;margin:0 auto;background:${t.bg};color:${t.ink};` +
    `font-family:${t.headFont};font-size:15px;line-height:1.7;">\n${parts.join('\n')}\n</div>`;
  return { html, warnings };
}

function sectionWrap(t: ToneTokens, inner: string, last = false): string {
  const border = last ? '' : `border-bottom:1px solid ${t.line};`;
  return `<div style="padding:34px 26px;${border}">${inner}</div>`;
}

function heading(t: ToneTokens, text: string, size = 22): string {
  return `<div style="font-size:${size}px;font-weight:${t.headWeight};line-height:1.35;margin:0 0 8px 0;">${escapeHtml(text)}</div>`;
}

function eyebrow(t: ToneTokens, text?: string): string {
  if (!text) return '';
  return `<div style="font-size:11px;letter-spacing:2px;color:${t.acc};text-transform:uppercase;margin:0 0 10px 0;">${escapeHtml(text)}</div>`;
}

function renderSection(s: PageSection, brief: ProductPageBrief, t: ToneTokens): string {
  switch (s.type) {
    case 'hero': {
      const inner =
        eyebrow(t, s.eyebrow) +
        heading(t, s.heading) +
        (s.body ? `<div style="color:${t.dim};font-size:13.5px;">${escapeHtml(s.body)}</div>` : '') +
        `<div style="margin-top:18px;">${imgTag(brief.images, 'hero', brief.productName)}</div>`;
      return sectionWrap(t, inner);
    }
    case 'pain-points': {
      const items = (s.items ?? [])
        .map(
          (it) =>
            `<div style="background:${t.soft};border-radius:${Math.max(6, t.radius - 2)}px;padding:10px 13px;margin:0 0 9px 0;font-size:14.5px;">` +
            `<span style="color:${t.acc};font-weight:800;margin-right:8px;">&#10003;</span>${escapeHtml(it.text)}</div>`,
        )
        .join('');
      return sectionWrap(t, eyebrow(t, s.eyebrow) + heading(t, s.heading) + `<div style="margin-top:14px;">${items}</div>`);
    }
    case 'ingredient': {
      const gauges = (s.gauges ?? [])
        .map((g) => {
          const pct = Math.max(0, Math.min(100, g.pct));
          return (
            `<div style="margin-top:12px;">` +
            `<div style="font-size:12.5px;margin-bottom:5px;">${escapeHtml(g.label)}</div>` +
            `<div style="height:8px;border-radius:999px;background:${t.soft};"><div style="height:8px;width:${pct}%;border-radius:999px;background:${t.acc};"></div></div>` +
            `</div>`
          );
        })
        .join('');
      const body = s.body ? `<div style="color:${t.dim};font-size:13.5px;">${escapeHtml(s.body)}</div>` : '';
      return sectionWrap(t, eyebrow(t, s.eyebrow) + heading(t, s.heading) + body + gauges);
    }
    case 'selling-points': {
      const items = (s.items ?? [])
        .map(
          (it, i) =>
            `<div style="border:1px solid ${t.line};border-radius:${t.radius}px;padding:15px 16px;margin:0 0 14px 0;">` +
            `<div style="font-size:10.5px;color:${t.acc};letter-spacing:1.5px;">POINT ${String(i + 1).padStart(2, '0')}</div>` +
            `<div style="font-size:16px;font-weight:700;margin:3px 0 6px 0;">${escapeHtml(it.title ?? '')}</div>` +
            `<div style="font-size:13.5px;color:${t.dim};">${escapeHtml(it.text)}</div>` +
            `</div>`,
        )
        .join('');
      return sectionWrap(t, eyebrow(t, s.eyebrow) + heading(t, s.heading) + `<div style="margin-top:16px;">${items}</div>`);
    }
    case 'usage': {
      const rows = (s.items ?? [])
        .map(
          (it, i) =>
            `<tr>` +
            `<td style="border:1px solid ${t.line};padding:9px 11px;background:${t.soft};font-size:12px;white-space:nowrap;">STEP ${i + 1}</td>` +
            `<td style="border:1px solid ${t.line};padding:9px 11px;font-size:13.5px;">${escapeHtml(it.text)}</td>` +
            `</tr>`,
        )
        .join('');
      const texture = `<div style="margin-top:16px;">${imgTag(brief.images, 'texture', `${brief.productName} texture`)}</div>`;
      return sectionWrap(
        t,
        heading(t, s.heading) + `<table style="width:100%;border-collapse:collapse;margin-top:14px;">${rows}</table>` + texture,
      );
    }
    case 'full-ingredients': {
      const list = brief.ingredients.length > 0 ? brief.ingredients.join(', ') : '（全成分は登録前に必ず記載）';
      const cautions = (s.items ?? [])
        .map((it) => `<div style="font-size:12.5px;color:${t.dim};margin-top:5px;">・${escapeHtml(it.text)}</div>`)
        .join('');
      return sectionWrap(
        t,
        heading(t, s.heading) +
          `<div style="margin-top:12px;font-size:12px;color:${t.dim};background:${t.soft};border-radius:8px;padding:12px 14px;">${escapeHtml(list)}</div>` +
          cautions,
      );
    }
    case 'faq': {
      const items = (s.items ?? [])
        .map(
          (it) =>
            `<div style="border:1px solid ${t.line};border-radius:9px;padding:11px 14px;margin-top:10px;">` +
            `<div style="font-weight:700;font-size:14px;">Q. ${escapeHtml(it.title ?? '')}</div>` +
            `<div style="margin-top:8px;font-size:13.5px;color:${t.dim};">A. ${escapeHtml(it.text)}</div>` +
            `</div>`,
        )
        .join('');
      return sectionWrap(t, heading(t, s.heading) + items);
    }
    case 'policy': {
      return sectionWrap(
        t,
        heading(t, s.heading, 16) + `<div style="font-size:12.5px;color:${t.dim};">${escapeHtml(s.body ?? '')}</div>`,
        true,
      );
    }
  }
}

/** 텍스트 폴백 — HTML 미지원 노출면·검수용. 게이지·전성분 포함(검수 사각 방지). */
export function renderText(brief: ProductPageBrief, doc: ProductPageDoc): string {
  const out: string[] = [];
  for (const s of doc.sections) {
    if (s.eyebrow) out.push(`[${s.eyebrow}]`);
    out.push(`■ ${s.heading}`);
    if (s.body) out.push(s.body);
    s.gauges?.forEach((g) => {
      out.push(`- ${g.label}: ${g.pct}%`);
    });
    s.items?.forEach((it, i) => {
      out.push(it.title ? `${i + 1}. ${it.title} — ${it.text}` : `- ${it.text}`);
    });
    if (s.type === 'full-ingredients') {
      out.push(brief.ingredients.length > 0 ? `전성분: ${brief.ingredients.join(', ')}` : '전성분: (등록 전 필수 기재)');
    }
    out.push('');
  }
  return out.join('\n').trimEnd() + '\n';
}
