/**
 * 대본 효율 참고 점수 — 순수 로직, 생성 전에 후보를 거르는 깔때기 1층.
 *
 * 근거: Google ABCD 창작 프레임(Attention·Branding·Connection·Direction)과 Shorts 광고 권장
 * (세로·사운드·60초 이내·첫 3초), 그리고 조회 과금 기준(10초 이상 시청 = 1 view).
 * 규칙은 "설득력"이 아니라 "10초를 버티게 하는 구조"를 본다.
 *
 * 점수는 참고용이다. lint 처럼 block 하지 않고, 최종 선택은 사람이 한다(CLAUDE.md 개발 규칙).
 * 광고 실측(훅별 조회율)이 쌓이면 가중치를 데이터로 고친다.
 */
import type {
  ScriptScoreDimension,
  ScriptScoreReport,
  ShoppingShortsBrief,
  ShortsScript,
} from '@cak/contracts';

/** 훅 장면에 움직임이 있는지 — 정적 제품컷 훅은 첫 3초 이탈을 부른다. */
const MOTION_CUES =
  /(press|lift|spread|squeez|turn|rotat|dolly|zoom|pull|peel|pour|drip|apply|rub|reveal|wipe|crack|split|flak|slow[- ]?motion|glid|slid|swipe|tap|stretch|drop|splash|바르|떼|누르|짜|돌|흐르|갈라|벗겨|닦)/i;

const CTA_POINTER = /(링크|설명란|프로필|댓글|확인|보러)/;

function chars(text: string): number {
  return text.replace(/\s+/g, '').length;
}

function perSec(text: string, sec: number): number {
  return sec > 0 ? chars(text) / sec : Number.POSITIVE_INFINITY;
}

function dimension(id: string, score: number, max: number, reason: string): ScriptScoreDimension {
  return { id, score: Math.max(0, Math.min(max, score)), max, reason };
}

export function scoreScript(brief: ShoppingShortsBrief, script: ShortsScript): ScriptScoreReport {
  const beats = [...script.beats].sort((a, b) => a.index - b.index);
  const hook = beats[0];
  const total = beats.reduce((s, b) => s + b.durationSec, 0);
  const dims: ScriptScoreDimension[] = [];

  // A. Attention — 훅 3초
  if (hook === undefined) {
    dims.push(dimension('hook-motion', 0, 15, '비트 없음'));
    dims.push(dimension('hook-length', 0, 10, '비트 없음'));
    dims.push(dimension('hook-narration', 0, 10, '비트 없음'));
  } else {
    const moving = MOTION_CUES.test(hook.visualPrompt);
    dims.push(
      dimension('hook-motion', moving ? 15 : 5, 15, moving ? '첫 장면에 움직임 있음' : '첫 장면이 정적 — 손·제형·변화가 움직이는 장면 권장'),
    );
    const hl = hook.durationSec;
    const hlScore = hl >= 2 && hl <= 4 ? 10 : hl === 5 ? 6 : hl < 2 ? 4 : 2;
    dims.push(dimension('hook-length', hlScore, 10, `훅 ${hl}초 (권장 2~4초)`));
    const hps = perSec(hook.narration, hook.durationSec);
    const hnScore = hps <= 5 ? 10 : hps <= 6.5 ? 6 : 2;
    dims.push(dimension('hook-narration', hnScore, 10, `훅 내레이션 ${hps.toFixed(1)}자/초 (권장 ≤5)`));
  }

  // 10초 페이오프 — 핵심 데모(두 번째 비트)가 과금 조회 기준 안에 끝나는가
  const second = beats[1];
  if (hook === undefined || second === undefined) {
    dims.push(dimension('payoff-10s', 0, 20, '핵심 데모 비트 없음'));
  } else {
    const end = hook.durationSec + second.durationSec;
    const ps = end <= 10 ? 20 : end <= 12 ? 12 : 5;
    dims.push(dimension('payoff-10s', ps, 20, `핵심 데모 종료 ${end}초 (10초 안이면 만점)`));
  }

  // 전 비트 내레이션 밀도
  const maxPs = beats.length > 0 ? Math.max(...beats.map((b) => perSec(b.narration, b.durationSec))) : 0;
  const ndScore = maxPs <= 6 ? 10 : maxPs <= 7.5 ? 6 : 2;
  dims.push(dimension('narration-density', ndScore, 10, `최대 ${maxPs.toFixed(1)}자/초 (권장 ≤6)`));

  // 자막 가독성 — 한 줄(≤14자)
  const maxCap = beats.length > 0 ? Math.max(...beats.map((b) => chars(b.caption))) : 0;
  const capScore = maxCap <= 14 ? 10 : maxCap <= 20 ? 6 : 2;
  dims.push(dimension('caption-readable', capScore, 10, `가장 긴 자막 ${maxCap}자 (권장 ≤14)`));

  // B. Branding — 상품명 첫 등장 시각
  const key = brief.productName.replace(/\s+/g, '').slice(0, Math.min(4, chars(brief.productName)));
  let t = 0;
  let firstSeen: number | null = null;
  for (const b of beats) {
    if ((b.narration + b.caption).replace(/\s+/g, '').includes(key)) {
      firstSeen = t;
      break;
    }
    t += b.durationSec;
  }
  const brScore = firstSeen === null ? 0 : firstSeen <= 5 ? 10 : firstSeen <= 10 ? 6 : 2;
  dims.push(
    dimension('branding-early', brScore, 10, firstSeen === null ? '상품명 미언급(lint 경고 대상)' : `상품명 첫 등장 ${firstSeen}초 (5초 안이면 만점)`),
  );

  // D. Direction — CTA
  const cta = beats.find((b) => b.role === 'cta');
  const sentences = cta ? cta.narration.split(/[.!?。]/).filter((x) => x.trim().length > 0).length : 0;
  const dirScore = cta === undefined ? 0 : CTA_POINTER.test(cta.narration) && sentences <= 1 ? 10 : 5;
  dims.push(
    dimension('direction-cta', dirScore, 10, cta === undefined ? 'CTA 비트 없음' : dirScore === 10 ? 'CTA 한 문장 + 행동 지시' : 'CTA에 행동 지시(링크·설명란 등) 또는 한 문장 구성 필요'),
  );

  // 길이 — 10초 미만이면 과금 조회 자체가 불가
  const lenScore = total < 10 ? 0 : total <= 12 ? 3 : total <= 45 ? 5 : total <= 60 ? 3 : 0;
  dims.push(dimension('length', lenScore, 5, `총 ${total}초 (권장 12~45, 10초 미만은 조회 집계 불가)`));

  return { total: dims.reduce((s, d) => s + d.score, 0), dimensions: dims, notes: [] };
}

export interface RankedScript extends ScriptScoreReport {
  script: ShortsScript;
}

/** 후보 세트를 총점 내림차순으로 정렬. 훅 유형이 겹치면 다양화 메모를 남긴다(세트 A/B 목적). */
export function rankScripts(jobs: Array<{ brief: ShoppingShortsBrief; script: ShortsScript }>): RankedScript[] {
  const ranked = jobs
    .map(({ brief, script }) => ({ ...scoreScript(brief, script), script }))
    .sort((a, b) => b.total - a.total);
  const seen = new Map<string, number>();
  for (const r of ranked) {
    const n = (seen.get(r.script.hookType) ?? 0) + 1;
    seen.set(r.script.hookType, n);
    if (n > 1) r.notes.push(`훅 유형 '${r.script.hookType}' 중복 ${n}번째 — 세트 비교 목적이면 다른 유형으로 다양화 권장`);
  }
  return ranked;
}
