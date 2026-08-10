/**
 * TV급 프롬프트 조립 + lint — 순수 로직. I/O 없음.
 *
 * 실측(2026-07, 힉스필드)에서 확정된 도메인 지식을 상수로 고정한다:
 *  - STYLE_GUIDE: 다큐/홈비디오 톤 방지. 모든 스팟 프롬프트에 항상 포함.
 *  - FORBIDDEN_PHRASES: NSFW 필터 오탐으로 실제 차단·크레딧 환불이 발생했던 구문.
 *  - ONSCREEN_TEXT_PATTERNS: 화면 내 텍스트를 AI 에게 시키는 지시 검출.
 *    텍스트는 생성이 아니라 후반 오버레이(ffargs.buildTitleArgs)로 넣는다.
 *    단 "no on-screen text" 같은 부정형은 위반이 아니다 — 매치 직전의 부정어를 확인한다.
 */
import type { AdConcept } from '@cak/contracts';

/** 항상 포함되는 시네마틱 스타일 가이드 (다큐/홈비디오 톤 방지) */
export const STYLE_GUIDE =
  'High-end cinematic TV commercial. High-contrast cinematic grade, shallow depth of field, anamorphic feel, sculptural dramatic lighting with rim light, smooth dolly/gimbal moves, subtle speed ramps, no camera shake, no on-screen text.';

/** 힉스필드 NSFW 필터 오탐 실측 사례 — 검출 시 생성 전에 차단한다 */
export const FORBIDDEN_PHRASES: readonly string[] = [
  'perfume commercial',
  'lingerie',
  'person lacing up',
  'bare feet',
  'bare skin',
];

/** 화면 내 텍스트 생성을 지시하는 패턴들 (부정형은 lintPrompt 에서 별도 제외) */
export const ONSCREEN_TEXT_PATTERNS: readonly RegExp[] = [
  /on-?screen text/gi,
  /text overlay/gi,
  /overlai?d text/gi,
  /\bcaptions?\b/gi,
  /\bsubtitles?\b/gi,
  /title card/gi,
  /\blettering\b/gi,
  /\btypography\b/gi,
  /(?:show|display|render)(?:s|ing|ed)?\s+(?:the\s+)?(?:text|words?|logo text|slogan)\b/gi,
  /\btext (?:appears?|reading|saying|that (?:reads?|says?))\b/gi,
];

/** 매치 직전 문맥에 부정어(no/without/never/not/avoid)가 있으면 위반이 아니다 */
const NEGATION_TAIL = /\b(?:no|without|never|not|avoid(?:s|ing)?)\b[\s,:;–-]*(?:[\w'’-]+[\s,–-]*){0,2}$/i;

export interface PromptViolation {
  phrase: string;
  reason: string;
}

const NSFW_REASON =
  '힉스필드 NSFW 필터 오탐으로 차단·크레딧 환불 이력 — 구문을 바꿔 표현할 것';
const ONSCREEN_REASON = '텍스트는 AI가 아니라 후반 오버레이로 (ffmpeg drawtext 사용)';

/** 프롬프트 lint — 금지구·화면 내 텍스트 지시 검출. 부정형("no on-screen text")은 통과. */
export function lintPrompt(prompt: string): { violations: PromptViolation[] } {
  const violations: PromptViolation[] = [];
  const lower = prompt.toLowerCase();

  for (const phrase of FORBIDDEN_PHRASES) {
    if (lower.includes(phrase)) {
      violations.push({ phrase, reason: NSFW_REASON });
    }
  }

  for (const pattern of ONSCREEN_TEXT_PATTERNS) {
    // 전역 플래그 정규식은 lastIndex 상태를 가지므로 매 호출마다 재생성해 재사용 안전하게.
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(prompt)) !== null) {
      const before = prompt.slice(Math.max(0, m.index - 40), m.index);
      if (NEGATION_TAIL.test(before)) continue; // "no on-screen text" 등 부정형은 위반 아님
      violations.push({ phrase: m[0], reason: ONSCREEN_REASON });
      if (m.index === re.lastIndex) re.lastIndex += 1; // 빈 매치 무한루프 방지(방어)
    }
  }

  return { violations };
}

/** 초 표기 — 부동소수 오차를 정리해 "5.5" / "2" 형태로 */
function fmtSec(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * 스팟 프롬프트 조립: 컨셉 요약 문장 + 비트별 시간 구간 + STYLE_GUIDE(+extraStyle).
 * 비트 초 구간은 durationSec 를 누적해 "Beat 1 (0s–2s): ..." 식으로 표기한다.
 */
export function buildSpotPrompt(concept: AdConcept, opts?: { extraStyle?: string }): string {
  const totalSec = concept.beats.reduce((sum, b) => sum + b.durationSec, 0);
  const category = concept.category ? ` (${concept.category})` : '';
  const summary =
    `A ${fmtSec(totalSec)}-second TV commercial for ${concept.subject}${category}. ` +
    `Key selling points: ${concept.sellingPoints.join('; ')}. ${concept.uniqueness.rationale}`;

  const beatLines: string[] = [];
  let t = 0;
  const ordered = [...concept.beats].sort((a, b) => a.index - b.index);
  for (const [i, beat] of ordered.entries()) {
    const start = t;
    t += beat.durationSec;
    // 포커스 연출 극대화(광고적 비주얼 과장) — 사실 주장이 아닌 연출 강도만 증폭한다
    const DRAMATIZE: Record<string, string> = {
      problem:
        ' [DRAMATIZE PROBLEM: push the problem to its visual extreme — severe, overwhelming, uncomfortable intensity; the viewer must feel the pain instantly]',
      resolution:
        ' [DRAMATIZE RELIEF: maximum before/after contrast — pristine, perfectly clean, almost surreal clarity and calm]',
      hero:
        ' [GLORIFY PRODUCT: luxurious macro detail, sculptural rim light, premium material texture worship]',
    };
    const extra = beat.emphasis ? DRAMATIZE[beat.emphasis] ?? '' : '';
    beatLines.push(`Beat ${i + 1} (${fmtSec(start)}s–${fmtSec(t)}s): ${beat.description}${extra}`);
  }

  const style = opts?.extraStyle ? `${STYLE_GUIDE} ${opts.extraStyle}` : STYLE_GUIDE;
  return [summary, ...beatLines, style].join('\n');
}
