import type { DramaCut, DramaFinding } from '@cak/contracts';
import type { GenrePack } from '../genre.js';
import type { DeterministicGate } from './types.js';

/** 10초당 22음절. 시험분에서 10초 컷 대사 두 줄이 이 안에서 자연스럽게 들어갔다. */
export const MAX_SYLLABLES_PER_SEC = 2.2;
export const MAX_LINES_PER_CUT = 2;

export function syllableCount(text: string): number {
  return text.match(/[가-힣]/g)?.length ?? 0;
}

/** 한 낱말 안에서 같은 음절이 연달아 나오는 낱말(수수료·똑똑히). 생성 음성이 뭉개기 쉽다. */
export function repeatedSyllableWords(text: string): string[] {
  const words = text.split(/[^가-힣]+/).filter(Boolean);
  return [...new Set(words.filter((w) => [...w].some((ch, i, a) => i > 0 && ch === a[i - 1])))];
}

export function bannedTokens(text: string, banned: string[]): string[] {
  const tokens = text.split(/[^가-힣a-zA-Z0-9]+/).filter(Boolean);
  return banned.filter((b) => tokens.some((t) => t === b || t.startsWith(b)));
}

export function lineFindings(cut: DramaCut, index: number, genre: GenrePack): DramaFinding[] {
  const line = cut.lines[index];
  if (!line) return [];
  const f: DramaFinding[] = [];
  for (const w of repeatedSyllableWords(line.text))
    f.push({ severity: 'block', message: `같은 음절 반복(오발음 위험): ${w}`, cutId: cut.id, lineIndex: index, evidence: line.text });
  for (const w of bannedTokens(line.text, genre.bannedWords))
    f.push({ severity: 'block', message: `금칙어: ${w}`, cutId: cut.id, lineIndex: index, evidence: line.text });
  return f;
}

export const dialogueLintGate: DeterministicGate = {
  id: 'dialogue-lint',
  stage: 'episode',
  run({ episode, genre }) {
    const f: DramaFinding[] = [];
    for (const cut of episode.cuts) {
      cut.lines.forEach((_, i) => f.push(...lineFindings(cut, i, genre)));
      const syl = cut.lines.reduce((n, l) => n + syllableCount(l.text), 0);
      const max = Math.floor(cut.durationSec * MAX_SYLLABLES_PER_SEC);
      if (syl > max)
        f.push({ severity: 'block', message: `대사 ${syl}음절이 ${cut.durationSec}초 컷 한도 ${max}음절을 넘음`, cutId: cut.id });
      if (cut.lines.length > MAX_LINES_PER_CUT)
        f.push({ severity: 'review', message: `컷당 대사 ${cut.lines.length}줄(권장 ${MAX_LINES_PER_CUT}줄 이하)`, cutId: cut.id });
    }
    return f;
  },
};
