import type { DramaFinding, DramaGateReport } from '@cak/contracts';
import { fingerprintOf } from './fingerprint.js';
import type { GateContext } from './gates/types.js';
import { toReport } from './report.js';

/** 대사별 문자 오류율 한도. 12음절 대사에서 2글자 변형(수수료→수술이)이 0.167로 걸린다. */
export const MAX_LINE_CER = 0.15;

const DIGIT = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
const UNIT = ['', '십', '백', '천'];

/** 0~9999 를 한자어 수 읽기로("10"→"십", "2013"→"이천십삼"). 더 큰 수는 그대로 둔다. */
export function sinoKorean(n: number): string {
  if (n === 0) return '영';
  if (!Number.isInteger(n) || n < 0 || n > 9999) return String(n);
  return [...String(n)]
    .map((d, i, a) => {
      const v = Number(d);
      const u = UNIT[a.length - 1 - i] ?? '';
      if (v === 0) return '';
      return (v === 1 && u ? '' : DIGIT[v]) + u;
    })
    .join('');
}

/**
 * 대본과 받아쓰기 비교용 정규화. whisper 는 "십 년"을 "10년"으로 적으므로 아라비아 숫자는 한자어 읽기로 바꾼다.
 * 고유어 읽기("두 시")는 바꾸지 않는다 — 대본에 시각을 쓸 땐 자막으로 넣고 대사에는 피한다.
 */
export function normalizeKo(s: string): string {
  return s
    .normalize('NFC')
    .replace(/(\d),(?=\d{3})/g, '$1')
    .replace(/\d+/g, (m) => sinoKorean(Number(m)))
    .replace(/[^가-힣a-zA-Z0-9]/g, '')
    .toLowerCase();
}

/** pattern 이 text 의 어느 부분 문자열과 가장 가깝게 맞는지의 편집 거리(semi-global). */
export function bestSubstringDistance(pattern: string, text: string): number {
  const p = [...pattern];
  const t = [...text];
  let prev: number[] = new Array<number>(t.length + 1).fill(0);
  for (let i = 1; i <= p.length; i++) {
    const cur: number[] = new Array<number>(t.length + 1).fill(0);
    cur[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = p[i - 1] === t[j - 1] ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = cur;
  }
  return Math.min(...prev);
}

export interface LineScore {
  lineIndex: number;
  expected: string;
  cer: number;
}

export function scoreTranscript(lines: string[], transcript: string): LineScore[] {
  const t = normalizeKo(transcript);
  return lines.map((text, i) => {
    const e = normalizeKo(text);
    return { lineIndex: i, expected: text, cer: e.length ? bestSubstringDistance(e, t) / e.length : 0 };
  });
}

/** 조립 전 확인: 대사가 있는 모든 컷에 현재 대본 기준으로 통과한 받아쓰기 대조 기록이 있어야 한다. */
/** cutIds 를 주면 그 컷만 확인한다(회차 일부만 조립할 때). 지문은 항상 회차 전체 기준. */
export function transcriptReadiness(ctx: GateContext, reports: DramaGateReport[], cutIds?: string[]): DramaFinding[] {
  const fp = fingerprintOf(ctx.series, ctx.episode);
  return ctx.episode.cuts
    .filter((c) => !cutIds || cutIds.includes(c.id))
    .filter((c) => c.lines.some((l) => l.kind === 'dialogue'))
    .flatMap((c): DramaFinding[] => {
      const r = reports.filter((x) => x.gate === `transcript-${c.id}`).at(-1);
      if (!r) return [{ severity: 'block', message: `받아쓰기 대조 기록 없음: ${c.id}`, cutId: c.id }];
      if (r.fingerprint !== fp) return [{ severity: 'block', message: `받아쓰기 대조 기록이 현재 대본과 다름: ${c.id}`, cutId: c.id }];
      if (!r.ok) return [{ severity: 'block', message: `받아쓰기 대조 미통과: ${c.id}`, cutId: c.id }];
      return [];
    });
}

export function transcriptGate(ctx: GateContext, cutId: string, transcript: string, maxCer = MAX_LINE_CER): DramaGateReport {
  const cut = ctx.episode.cuts.find((c) => c.id === cutId);
  if (!cut) throw new Error(`컷 없음: ${cutId}`);
  const dialogue = cut.lines.map((l, i) => ({ l, i })).filter((x) => x.l.kind === 'dialogue');
  const findings: DramaFinding[] = [];
  if (!dialogue.length) findings.push({ severity: 'info', message: '대사 없는 컷 — 받아쓰기 대조 생략', cutId });
  scoreTranscript(dialogue.map((x) => x.l.text), transcript).forEach((s, k) => {
    if (s.cer > maxCer)
      findings.push({
        severity: 'block',
        message: `대사 불일치 CER ${s.cer.toFixed(2)} > ${maxCer}`,
        cutId,
        lineIndex: dialogue[k]?.i ?? s.lineIndex,
        evidence: `기대 "${s.expected}" / 전사 "${transcript.trim()}"`,
      });
  });
  return toReport(`transcript-${cutId}`, 'clip', findings, fingerprintOf(ctx.series, ctx.episode));
}
