import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseEpisode, parseSeries } from '../src/core/model.js';
import { loadGenre } from '../src/core/genre.js';
import { bestSubstringDistance, normalizeKo, scoreTranscript, transcriptGate, transcriptReadiness } from '../src/core/transcript.js';
import { DEFAULT_WHISPER_MODEL, TranscribeError, parseWhisperJson } from '../src/adapters/transcribe/whisper.js';
import type { GateContext } from '../src/core/gates/types.js';

const fx = (name: string): any => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
function ctx(mutate?: (e: any) => void): GateContext {
  const s = fx('series.json');
  const e = fx('episode.json');
  mutate?.(e);
  return { series: parseSeries(s), episode: parseEpisode(e), genre: loadGenre(s.genreId) };
}
/** 시험분 2컷 실제 생성 결과(2026-10-06): 대본 '수수료'가 '수술이'로 발음됨. */
const pilot = (e: any) => {
  e.cuts[1].lines[0].text = '막내야, 이번 주 수수료 안 냈지?';
  e.cuts[1].lines[1].text = '그건 제 일당이잖아요…';
};
const PILOT_WHISPER = '막내야, 이번 주 수술이 안 냈지? 그건 제 일당이잖아요.';

describe('transcript gate', () => {
  it('normalizes punctuation and spacing away', () => {
    expect(normalizeKo('그건 제 일당이잖아요…')).toBe('그건제일당이잖아요');
    expect(bestSubstringDistance('abc', 'xxabcxx')).toBe(0);
  });
  it('reads Arabic numerals as Sino-Korean so whisper digits match scripted 한글 numbers', () => {
    // 2026-10-06 9분판 c2: 대사 "날짜가… 십 년 전이야." 를 whisper 가 "날짜가 10년 전이야." 로 적었다.
    expect(normalizeKo('날짜가 10년 전이야.')).toBe(normalizeKo('날짜가… 십 년 전이야.'));
    expect(normalizeKo('30분 뒤에')).toBe(normalizeKo('삼십 분 뒤에'));
    expect(normalizeKo('5분도 못 버텨요')).toBe(normalizeKo('오 분도 못 버텨요'));
    expect(normalizeKo('2,013원')).toBe(normalizeKo('이천십삼 원'));
  });
  it('blocks the pilot mispronunciation 수수료 → 수술이', () => {
    const r = transcriptGate(ctx(pilot), 'c2', PILOT_WHISPER);
    expect(r.gate).toBe('transcript-c2');
    expect(r.ok).toBe(false);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ lineIndex: 0, severity: 'block' });
    expect(scoreTranscript(['막내야, 이번 주 수수료 안 냈지?'], PILOT_WHISPER)[0]!.cer).toBeCloseTo(2 / 12, 3);
  });
  it('passes when only punctuation, spacing and ellipsis differ', () => {
    expect(transcriptGate(ctx(pilot), 'c2', '막내야 이번주 수수료 안냈지 그건 제 일당이잖아요').ok).toBe(true);
  });
  it('blocks a line missing from the transcript', () => {
    expect(transcriptGate(ctx(pilot), 'c2', '막내야, 이번 주 수수료 안 냈지?').ok).toBe(false);
  });
  it('treats a cut without dialogue as info only', () => {
    const r = transcriptGate(ctx(), 'c1', '');
    expect(r.ok).toBe(true);
    expect(r.findings[0]!.severity).toBe('info');
  });
  it('readiness requires a passing, current transcript report for every dialogue cut', () => {
    const c = ctx();
    const missing = transcriptReadiness(c, []);
    expect(missing.map((f) => f.cutId)).toEqual(['c2', 'c3', 'c4']);
    const ok = ['c2', 'c3', 'c4'].map((id) => transcriptGate(c, id, c.episode.cuts.find((x) => x.id === id)!.lines.map((l) => l.text).join(' ')));
    expect(transcriptReadiness(c, ok)).toEqual([]);
    const bad = transcriptGate(c, 'c2', '완전히 다른 말');
    expect(transcriptReadiness(c, [...ok, bad]).map((f) => f.message)).toEqual([expect.stringMatching(/미통과: c2/)]);
    const edited = ctx((e) => { e.cuts[2].lines[0].text = '그 손 놓으세요.'; });
    expect(transcriptReadiness(edited, ok).some((f) => /현재 대본과 다름/.test(f.message))).toBe(true);
  });
  it('defaults to whisper large-v3', () => {
    // 2026-10-06: small/medium 이 실제로 발음된 대사를 "아이고"·"샤토"로 적거나 통째로 빠뜨렸다. large-v3 는 같은 클립을 정확히 받아썼다.
    expect(DEFAULT_WHISPER_MODEL).toBe('large-v3');
  });
  it('readiness can be limited to the cuts being assembled', () => {
    const c = ctx();
    const all = transcriptReadiness(c, []);
    const dialogueCuts = [...new Set(all.map((f) => f.cutId))];
    expect(dialogueCuts.length).toBeGreaterThan(1);
    const only = transcriptReadiness(c, [], [dialogueCuts[0]!]);
    expect(only.map((f) => f.cutId)).toEqual([dialogueCuts[0]]);
  });
  it('parses whisper JSON output', () => {
    expect(parseWhisperJson({ text: ' 넌 또 뭐야? ', segments: [] })).toBe('넌 또 뭐야?');
    expect(() => parseWhisperJson({ segments: [] })).toThrow(TranscribeError);
  });
});
