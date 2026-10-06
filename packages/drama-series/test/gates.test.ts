import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseEpisode, parseSeries } from '../src/core/model.js';
import { loadGenre } from '../src/core/genre.js';
import { runEpisodeGates } from '../src/core/gates/registry.js';
import { repeatedSyllableWords, syllableCount } from '../src/core/gates/dialogue-lint.js';
import type { GateContext } from '../src/core/gates/types.js';

const fx = (name: string): any => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
function ctx(mutate?: (s: any, e: any) => void): GateContext {
  const s = fx('series.json');
  const e = fx('episode.json');
  mutate?.(s, e);
  return { series: parseSeries(s), episode: parseEpisode(e), genre: loadGenre(s.genreId) };
}
const report = (c: GateContext, gate: string) => runEpisodeGates(c).find((r) => r.gate === gate)!;

describe('deterministic gates', () => {
  it('fixture passes schema, dialogue-lint and continuity', () => {
    const reports = runEpisodeGates(ctx());
    expect(reports.map((r) => r.gate)).toEqual(['schema', 'dialogue-lint', 'continuity']);
    expect(reports.every((r) => r.ok)).toBe(true);
  });
  it('schema blocks a mismatched seriesId and an unknown visual token', () => {
    const r = report(ctx((_, e) => { e.seriesId = 'other'; e.cuts[0].visualEn = 'Shot of {ghost} in {location}.'; }), 'schema');
    expect(r.ok).toBe(false);
    expect(r.findings.map((f) => f.message).join('\n')).toMatch(/seriesId[\s\S]*\{ghost\}/);
  });
  it('schema blocks an unknown look id', () => {
    const r = report(ctx((_, e) => { e.cuts[0].cast[0].lookId = 'v9'; }), 'schema');
    expect(r.ok).toBe(false);
  });
  it('dialogue-lint blocks repeated syllables such as 수수료 and 똑똑히', () => {
    expect(repeatedSyllableWords('막내야, 이번 주 수수료 안 냈지?')).toEqual(['수수료']);
    expect(repeatedSyllableWords('너, 얼굴 똑똑히 기억해 둔다.')).toEqual(['똑똑히']);
    const r = report(ctx((_, e) => { e.cuts[1].lines[0].text = '막내야, 이번 주 수수료 안 냈지?'; }), 'dialogue-lint');
    expect(r.ok).toBe(false);
    expect(r.findings[0]).toMatchObject({ cutId: 'c2', lineIndex: 0, severity: 'block' });
  });
  it('dialogue-lint blocks lines too long for the cut', () => {
    expect(syllableCount('부사장님, 일이 좀 꼬였습니다.')).toBe(12);
    const r = report(ctx((_, e) => { e.cuts[3].lines[0].text = '부사장님 일이 좀 꼬였습니다 웬 여자가 갑자기 끼어들어서 다 망쳤습니다'; }), 'dialogue-lint');
    expect(r.findings.some((f) => /음절이 6초 컷 한도 13음절/.test(f.message))).toBe(true);
  });
  it('dialogue-lint marks three lines in a cut as review, not block', () => {
    const r = report(ctx((_, e) => { e.cuts[2].lines.push({ speaker: 'seoyun', text: '가세요.', kind: 'dialogue' }); }), 'dialogue-lint');
    expect(r.ok).toBe(true);
    expect(r.findings.some((f) => f.severity === 'review')).toBe(true);
  });
  it('dialogue-lint blocks banned words from the genre pack', () => {
    const r = report(ctx((_, e) => { e.cuts[2].lines[1].text = '이 병신이 뭐야?'; }), 'dialogue-lint');
    expect(r.ok).toBe(false);
  });
  it('continuity blocks a prop state that the next same-location cut drops', () => {
    const r = report(ctx((_, e) => { delete e.cuts[1].propState; }), 'continuity');
    expect(r.ok).toBe(false);
    expect(r.findings[0]!.message).toMatch(/앞 컷\(c1\) 소품 상태 미반영: 빈 박스 더미/);
  });
  it('continuity blocks a prop the location does not have (gym mat in a warehouse)', () => {
    const r = report(ctx((_, e) => { e.cuts[2].propState = { '빈 박스 더미': '무너짐', 매트: '깔림' }; }), 'continuity');
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => /장소에 없는 소품: 매트/.test(f.message))).toBe(true);
  });
  it('continuity flags a location without reference image as review', () => {
    const r = report(ctx((s) => { delete s.locations[0].refAssetId; }), 'continuity');
    expect(r.ok).toBe(true);
    expect(r.findings[0]!.severity).toBe('review');
  });
  it('a different location does not inherit prop state', () => {
    const r = report(ctx(), 'continuity');
    expect(r.findings.filter((f) => f.cutId === 'c4')).toEqual([]);
  });
});
