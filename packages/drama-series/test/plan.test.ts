import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { DramaGateReport } from '@cak/contracts';
import { parseEpisode, parseSeries } from '../src/core/model.js';
import { loadGenre } from '../src/core/genre.js';
import { runEpisodeGates } from '../src/core/gates/registry.js';
import { fingerprintOf, topicFingerprint } from '../src/core/fingerprint.js';
import { toReport } from '../src/core/report.js';
import { buildPlan } from '../src/core/plan.js';
import { lineHash } from '../src/core/line-hash.js';
import type { GateContext } from '../src/core/gates/types.js';

const fx = (name: string): any => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
function ctx(mutate?: (s: any, e: any) => void, verify = true): GateContext {
  const s = fx('series.json');
  const e = fx('episode.json');
  mutate?.(s, e);
  const episode = parseEpisode(e);
  if (verify) for (const c of episode.cuts) for (const l of c.lines) l.verification = { status: 'verified', judgeRef: 'r.json', lineHash: lineHash(c, l) };
  return { series: parseSeries(s), episode, genre: loadGenre(s.genreId) };
}
function passingReports(c: GateContext): DramaGateReport[] {
  const fp = fingerprintOf(c.series, c.episode);
  return [...runEpisodeGates(c), toReport('props', 'episode', [], fp), toReport('scenario', 'episode', [], fp), toReport('topic-night-shift', 'topic', [], topicFingerprint(c.series.topic, c.series.genreId))];
}
const video = { resolution: '480p' as const, draft: true, aspectRatio: '16:9' as const };
const plan = (c: GateContext, reports = passingReports(c), budgetCredits = 200, v = video) =>
  buildPlan({ ctx: c, reports, budgetCredits, video: v, now: '2026-10-06T00:00:00Z' });
const blocked = (r: ReturnType<typeof plan>, gate: string) => r.reports.find((x) => x.gate === gate)!.findings.map((f) => f.message).join('\n');

describe('buildPlan', () => {
  it('issues clip specs with ordered references and verified dialogue', () => {
    const r = plan(ctx());
    expect(r.ok).toBe(true);
    expect(r.plan!.clips).toHaveLength(4);
    expect(r.plan!.totalCredits).toBe((10 + 10 + 10 + 6) * 3);
    const c2 = r.plan!.clips[1]!;
    expect(c2.medias.map((m) => m.label)).toEqual(['오창식(base)', '최민재(base)', '물류센터 야간 작업 통로']);
    expect(c2.prompt).toContain('@Image1 (Korean man in his 40s');
    expect(c2.prompt).toContain('@Image1 says in Korean: "야, 막내. 이번 주 몫 내놔."');
    expect(c2.prompt).toContain('Same continuous location');
    expect(c2.params).toMatchObject({ mode: 'omni_reference', duration: 10, resolution: '480p', draft: true, generate_audio: true });
    expect(r.plan!.clips[0]!.prompt).toContain('No dialogue spoken on screen.');
  });
  it('chains each cut to the last frame of the previous cut in the same place, unless a transition is intended', () => {
    // 2026-10-07 2화: 컷을 따로따로 생성해 앞 컷 끝과 다음 컷 시작이 이어지지 않았다.
    const c = ctx();
    const r = plan(c);
    const cuts = c.episode.cuts;
    r.plan!.clips.forEach((clip, i) => {
      const prev = cuts[i - 1];
      const cut = cuts[i]!;
      const chained = !!prev && prev.locationId === cut.locationId && (cut.transitionIn ?? 'cut') === 'cut';
      expect(clip.startFromCut).toBe(chained ? prev!.id : undefined);
    });
    expect(r.plan!.clips.some((x) => x.startFromCut)).toBe(true);
  });
  it('refuses unverified dialogue', () => {
    const r = plan(ctx(undefined, false));
    expect(r.ok).toBe(false);
    expect(r.plan).toBeNull();
    expect(blocked(r, 'verified-lines')).toMatch(/검증되지 않은 대사/);
  });
  it('accepts human-approved lines', () => {
    const c = ctx();
    const cut = c.episode.cuts[1]!;
    const line = cut.lines[1]!;
    line.verification = { status: 'human-approved', approvedBy: 'user', lineHash: lineHash(cut, line) };
    expect(plan(c).ok).toBe(true);
  });
  it('refuses a verified line whose text changed after verification, even with fresh gate reports', () => {
    const c = ctx();
    c.episode.cuts[2]!.lines[0]!.text = '그 손 놓으세요.';
    const r = plan(c, passingReports(c));
    expect(r.ok).toBe(false);
    expect(blocked(r, 'verified-lines')).toMatch(/검증 이후 대사·장면이 바뀜/);
  });
  it('refuses a hand-written verified status without a line hash', () => {
    const c = ctx();
    c.episode.cuts[1]!.lines[0]!.verification = { status: 'verified' };
    expect(blocked(plan(c), 'verified-lines')).toMatch(/검증 이후 대사·장면이 바뀜/);
  });
  it('refuses gate reports made for an older script (stale fingerprint)', () => {
    const old = ctx();
    const reports = passingReports(old);
    const edited = ctx((_, e) => { e.cuts[2].lines[0].text = '그 손 놓으세요.'; });
    const r = plan(edited, reports);
    expect(r.ok).toBe(false);
    expect(blocked(r, 'required-gates')).toMatch(/현재 대본과 다름/);
  });
  it('refuses a missing or failed required gate', () => {
    const c = ctx();
    const fp = fingerprintOf(c.series, c.episode);
    const reports = [...runEpisodeGates(c), toReport('scenario', 'episode', [{ severity: 'block', message: 'hook 확정 fail' }], fp)];
    const msg = blocked(plan(c, reports), 'required-gates');
    expect(msg).toMatch(/관문 기록 없음: props/);
    expect(msg).toMatch(/관문 미통과: scenario/);
  });
  it('refuses a series whose topic never passed the topic gate or was edited after it', () => {
    const c = ctx();
    const noTopic = passingReports(c).filter((r) => r.gate !== 'topic-night-shift');
    expect(blocked(plan(c, noTopic), 'required-gates')).toMatch(/주제 관문 기록 없음: topic-night-shift/);
    const edited = ctx((s) => { s.topic.logline = '물류센터 알바생이 사실은 재벌 상속녀였다.'; });
    expect(blocked(plan(edited, passingReports(c)), 'required-gates')).toMatch(/주제와 다름/);
    const trimmed = ctx((s) => { s.topic.verifiedElements = []; });
    expect(blocked(plan(trimmed, passingReports(c)), 'required-gates')).toMatch(/주제와 다름/);
    const otherGenre = ctx((s) => { s.genreId = 'regression-apocalypse'; });
    expect(blocked(plan(otherGenre, passingReports(c)), 'required-gates')).toMatch(/주제와 다름/);
  });
  it('rejects durations outside 4–30 seconds and a missing reference image', () => {
    expect(blocked(plan(ctx((_, e) => { e.cuts[3].durationSec = 3; })), 'backend')).toMatch(/3초/);
    expect(blocked(plan(ctx((_, e) => { e.cuts[3].durationSec = 31; })), 'backend')).toMatch(/31초/);
    expect(blocked(plan(ctx((s) => { delete s.characters[1].looks[0].refAssetId; })), 'backend')).toMatch(/참조 이미지 미등록: 오창식/);
  });
  it('blocks over-budget and unmeasured rates', () => {
    expect(blocked(plan(ctx(), undefined, 100), 'budget')).toMatch(/108크레딧이 승인 한도 100/);
    expect(blocked(plan(ctx(), undefined, 9999, { resolution: '1080p', draft: false, aspectRatio: '16:9' }), 'budget')).toMatch(/미실측 단가/);
  });
  it('writes an off-screen voice for a speaker not in the cast and keeps monologue out of the prompt', () => {
    const r = plan(ctx((_, e) => {
      e.cuts[3].lines = [
        { speaker: 'minjae', text: '실장님, 어디세요?', kind: 'dialogue', verification: { status: 'verified' } },
        { speaker: 'changsik', text: '일이 꼬였어.', kind: 'monologue', verification: { status: 'verified' } },
      ];
    }));
    const c4 = r.plan!.clips[3]!;
    expect(c4.prompt).toContain('An off-screen voice of 최민재 says in Korean: "실장님, 어디세요?"');
    expect(c4.prompt).not.toContain('일이 꼬였어');
    expect(c4.voiceOver).toEqual([{ speaker: 'changsik', text: '일이 꼬였어.' }]);
  });
});
