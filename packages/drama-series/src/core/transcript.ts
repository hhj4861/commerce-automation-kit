import type { DramaFinding, DramaGateReport } from '@cak/contracts';
import { fingerprintOf } from './fingerprint.js';
import type { GateContext } from './gates/types.js';
import { toReport } from './report.js';

/** 대사별 문자 오류율 한도. 12음절 대사에서 2글자 변형(수수료→수술이)이 0.167로 걸린다. */
export const MAX_LINE_CER = 0.15;

export function normalizeKo(s: string): string {
  return s.normalize('NFC').replace(/[^가-힣a-zA-Z0-9]/g, '').toLowerCase();
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
