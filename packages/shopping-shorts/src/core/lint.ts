/**
 * 대본 표현 lint — 순수 로직. block 1건이라도 있으면 조립·발행을 거부한다.
 *
 * 근거(설계 결정 2026-07-27, 쇼핑쇼츠 강의 3편 실측 분석):
 * - 유통되는 쇼핑쇼츠 공정에는 ① 가짜 경험담 훅("N년 써보니") ② 효능 단정
 *   ③ 타인 콘텐츠 재가공이 흔하다. 이 원자는 그 셋을 코드 레벨에서 차단한다.
 * - 금지선 #3(무검수 광고 대량 생성 금지): lint 는 사람 검수를 대체하지 않는다.
 *   block 을 통과한 대본도 script-approved(사람 게이트)를 거쳐야 생성 단계로 간다.
 *
 * 규칙은 보수적으로 시작한다(오탐보다 미탐을 줄이는 방향은 사람 게이트가 보완).
 */
import type {
  ScriptLintFinding,
  ScriptLintReport,
  ShoppingShortsBrief,
  ShortsScript,
} from '@cak/contracts';
import { hasDisclosure } from './disclosure.js';

interface Rule {
  id: string;
  severity: 'block' | 'warn';
  pattern: RegExp;
  reason: string;
  /** 검사 대상 필드 종류 (기본: 노출 텍스트 전부) */
  scope?: 'text' | 'visualPrompt';
  /** true 면 건강기능식품(brief.isHealthFunctional)일 때만 적용 */
  healthFunctionalOnly?: boolean;
}

/**
 * 질병 효능·의학적 단정(식품표시광고법 §8 / 표시광고법 기만).
 * 일반 상품에도 의학적 효능 서사는 차단한다.
 */
const DISEASE_EFFICACY: Rule = {
  id: 'disease-efficacy',
  severity: 'block',
  pattern:
    /(치료|완치|항암|암\s*예방|질병\s*예방|면역력\s*(강화|증진|상승)|혈압\s*(강하|개선)|혈당\s*(개선|조절)|디톡스|해독\s*효과|탈모\s*(치료|방지)|아토피|염증\s*(완화|제거)|숙취\s*해소)/,
  reason: '질병·의학적 효능 표현 — 식품표시광고법 §8/표시광고법 위반 소지(발행 불가)',
};

/** 건기식 강화 모드: 승인 표현 밖 효능 단정 자체를 차단. */
const HF_EFFICACY_ASSERTION: Rule = {
  id: 'hf-efficacy-assertion',
  severity: 'block',
  healthFunctionalOnly: true,
  pattern: /(효과(가|를)\s*(있|봅|보장)|살(이)?\s*빠(진|집니)|근육(이)?\s*(커|늘어)|피부(가)?\s*좋아(진|집니))/,
  reason: '건강기능식품 효능 단정 — 승인(자율심의) 표현 범위 밖 단정은 발행 불가',
};

/**
 * 가짜 경험담(실사용 서사) — AI 생성 인물·대본에는 실경험이 없다.
 * 실경험 없는 후기·내돈내산 서사는 기만광고 소지(추천·보증 심사지침).
 */
const FAKE_EXPERIENCE: Rule = {
  id: 'fake-experience',
  severity: 'block',
  pattern:
    /(제가|내가)\s*(직접|실제로)?\s*(써|사용해|먹어|입어|발라)\s*(보니|봤|본)|\d+\s*(년|개월)\s*(째|간|동안)\s*(쓰|사용|애용|먹)|내돈내산|찐\s*후기|리얼\s*후기|직접\s*구매해/,
  reason: '실경험 없는 사용 후기 서사(가짜 경험담) — 기만광고 소지(정보성·데모 프레임으로 재작성)',
};

/** 절대·보장 표현. */
const GUARANTEE: Rule = {
  id: 'guarantee',
  severity: 'block',
  pattern: /(100\s*%\s*(효과|만족|해결)|무조건\s*(좋|효과|만족)|부작용(이)?\s*(전혀)?\s*없|평생\s*보장|최저가\s*보장)/,
  reason: '절대·보장 표현 — 실증 불가 단정(표시광고법 부당광고 소지)',
};

/** 최상급 주장(근거 제시 없는). 차단까지는 아니고 경고 → 사람 게이트에서 판단. */
const SUPERLATIVE: Rule = {
  id: 'superlative',
  severity: 'warn',
  pattern: /(업계\s*1\s*위|판매\s*1\s*위|세계\s*최초|국내\s*유일|최고의)/,
  reason: '근거 없는 최상급 주장 — 실증 자료 없으면 완화 권장',
};

/** 거짓 긴급성. */
const FALSE_URGENCY: Rule = {
  id: 'false-urgency',
  severity: 'warn',
  pattern: /(오늘만\s*(이|할인)|곧\s*품절|마감\s*임박|재고\s*(얼마|몇\s*개)\s*안)/,
  reason: '확인되지 않은 긴급성(품절·마감) — 사실이 아니면 기만 소지',
};

/**
 * 외부 소스 사용 신호(visualPrompt 전용) — 금지선 #1.
 * 생성 프롬프트에 URL·타 플랫폼 영상 참조·캡처 지시가 있으면 자체 생성 원칙 위반.
 */
const EXTERNAL_SOURCE: Rule = {
  id: 'external-source',
  severity: 'block',
  scope: 'visualPrompt',
  pattern: /(https?:\/\/|다운로드|퍼오|캡처해|샤오홍슈|틱톡\s*영상|유튜브\s*영상|인스타\s*영상|원본\s*영상을?\s*(써|사용))/,
  reason: '타인 콘텐츠 재사용 신호 — 소재는 전량 자체 생성(금지선 #1)',
};

const RULES: Rule[] = [
  DISEASE_EFFICACY,
  HF_EFFICACY_ASSERTION,
  FAKE_EXPERIENCE,
  GUARANTEE,
  SUPERLATIVE,
  FALSE_URGENCY,
  EXTERNAL_SOURCE,
];

/** 검증 대상 텍스트를 NFKC 정규화(전각·호환문자로 규칙을 우회하지 못하게). */
function norm(text: string): string {
  return text.normalize('NFKC');
}

interface FieldText {
  field: string;
  text: string;
  kind: 'text' | 'visualPrompt';
}

function collectFields(script: ShortsScript): FieldText[] {
  const fields: FieldText[] = [
    { field: 'title', text: script.title, kind: 'text' },
    { field: 'description', text: script.description, kind: 'text' },
  ];
  script.beats.forEach((b, i) => {
    fields.push({ field: `beats[${i}].narration`, text: b.narration, kind: 'text' });
    fields.push({ field: `beats[${i}].caption`, text: b.caption, kind: 'text' });
    fields.push({ field: `beats[${i}].visualPrompt`, text: b.visualPrompt, kind: 'visualPrompt' });
  });
  return fields;
}

/** 대본 lint — brief 컨텍스트(건기식 여부·제휴 링크)까지 반영한 전체 검증. */
export function lintScript(brief: ShoppingShortsBrief, script: ShortsScript): ScriptLintReport {
  const findings: ScriptLintFinding[] = [];

  for (const f of collectFields(script)) {
    const text = norm(f.text);
    for (const rule of RULES) {
      if (rule.healthFunctionalOnly === true && brief.isHealthFunctional !== true) continue;
      const scope = rule.scope ?? 'text';
      if (scope !== f.kind) continue;
      const m = text.match(rule.pattern);
      if (m !== null) {
        findings.push({
          rule: rule.id,
          severity: rule.severity,
          field: f.field,
          matched: m[0],
          reason: rule.reason,
        });
      }
    }
  }

  // R-disclosure: 제휴 링크가 있으면 설명란 고지 필수(발행 게이트의 근거).
  if (typeof brief.affiliateUrl === 'string' && brief.affiliateUrl.length > 0) {
    if (!hasDisclosure(script.description)) {
      findings.push({
        rule: 'disclosure-missing',
        severity: 'block',
        field: 'description',
        matched: '(없음)',
        reason: '제휴 링크 발행물에 대가성 고지 문구 누락 — withDisclosure() 로 삽입 필요',
      });
    }
  }

  // 영상 속 상품과 링크 상품의 일치는 코드로 확정 불가 → 제목·대본에 상품명 부재 시 경고.
  const productMentioned = [script.title, ...script.beats.map((b) => b.narration)]
    .map(norm)
    .some((t) => t.includes(norm(brief.productName).slice(0, Math.min(4, brief.productName.length))));
  if (!productMentioned) {
    findings.push({
      rule: 'product-mismatch-risk',
      severity: 'warn',
      field: 'title',
      matched: brief.productName,
      reason: '대본에 상품명이 등장하지 않음 — 영상·링크 불일치(기만) 위험, 사람 검수에서 확인',
    });
  }

  return { ok: findings.every((f) => f.severity !== 'block'), findings };
}
