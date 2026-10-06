import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG = fileURLToPath(new URL('..', import.meta.url));
const FX = fileURLToPath(new URL('./fixtures/', import.meta.url));
type Pick = (id: string) => ['pass' | 'fail', number, number];
const allPass: Pick = () => ['pass', 0.95, 0.97];

function cli(args: string[]): { code: number | null; json: any } {
  const r = spawnSync('npx', ['tsx', 'src/cli/index.ts', ...args], { cwd: PKG, encoding: 'utf8' });
  return { code: r.status, json: JSON.parse(r.stdout) };
}
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'drama-cli-'));
  for (const f of ['series.json', 'episode.json', 'topics.json']) copyFileSync(join(FX, f), join(dir, f));
  const p = (n: string) => join(dir, n);
  const base = ['--series', p('series.json'), '--episode', p('episode.json')];
  return { dir, p, base };
}
/** 판정기 대역: 선택형은 pick, 점수형은 4/5. */
function fakeResponse(req: string, res: string, pick: Pick = allPass) {
  const body = JSON.parse(readFileSync(req, 'utf8'));
  const answers = Object.fromEntries(Object.entries<any>(body.questions).map(([id, q]) => {
    if (q.type === 'score') {
      const n = q.criteria.length;
      return [id, { type: 'score', score: 3, confidence: 0.9, legend: {}, probabilities: Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i), i === 3 ? 1 - 0.05 * (n - 1) : 0.05])) }];
    }
    const [choice, confidence, p] = pick(id);
    return [id, { type: 'choice', choice, confidence, probabilities: choice === 'pass' ? { pass: p, fail: 1 - p } : { pass: 1 - p, fail: p } }];
  }));
  writeFileSync(res, JSON.stringify({ answers }));
}
/** night-shift 가 fixture series.topic 과 같은 요소(갈등·정체)만 확정되게 한다. */
const realisticTopics: Pick = (id) => {
  if (id.includes('__safe__') || id.endsWith('__genre')) return ['pass', 0.95, 0.97];
  return /__el__(strong-conflict|hidden-identity)$/.test(id) ? ['pass', 0.95, 0.97] : ['fail', 0.95, 0.97];
};
function topics(w: ReturnType<typeof workspace>, pick: Pick = realisticTopics) {
  expect(cli(['topic-build', '--topics', w.p('topics.json'), '--out', w.p('topic-req.json')]).code).toBe(0);
  fakeResponse(w.p('topic-req.json'), w.p('topic-res.json'), pick);
  return cli(['topic-apply', '--topics', w.p('topics.json'), '--request', w.p('topic-req.json'), '--response', w.p('topic-res.json'), '--gates', w.p('gates')]);
}
function judge(w: ReturnType<typeof workspace>, kind: string, pick?: Pick) {
  const built = cli(['judge-build', '--kind', kind, ...w.base, '--out', w.p(`${kind}-req.json`)]);
  expect(built.code).toBe(0);
  fakeResponse(w.p(`${kind}-req.json`), w.p(`${kind}-res.json`), pick);
  return cli(['judge-apply', '--kind', kind, ...w.base, '--request', w.p(`${kind}-req.json`), '--response', w.p(`${kind}-res.json`), '--gates', w.p('gates')]);
}
const plan = (w: ReturnType<typeof workspace>) => cli(['plan', ...w.base, '--gates', w.p('gates'), '--budget', '200', '--draft', '--out', w.p('plan.json')]);

describe('drama-series CLI', { timeout: 180_000 }, () => {
  it('ranks topics and records verified elements', () => {
    const w = workspace();
    const r = topics(w, (id) => (id.startsWith('lunch-break__el__') || id === 'lunch-break__genre' ? ['fail', 0.95, 0.97] : allPass(id)));
    expect(r.code).toBe(0);
    expect(r.json.ranking.map((x: any) => [x.topicId, x.passed])).toEqual([['night-shift', true], ['lunch-break', false]]);
    expect(JSON.parse(readFileSync(w.p('topics.json'), 'utf8')).topics[0].verifiedElements).toHaveLength(7);
  });

  it('runs topic → validate → judge → plan and refuses a plan after the script changes', () => {
    const w = workspace();
    expect(topics(w).code).toBe(0);
    expect(cli(['validate', ...w.base, '--gates', w.p('gates')]).code).toBe(0);
    const d = judge(w, 'dialogue');
    expect(d.code).toBe(0);
    expect(d.json.verifiedLines).toBe(5);
    expect(cli(['judge-build', '--kind', 'dialogue', ...w.base, '--out', w.p('again.json')]).json.questions).toBe(0);
    expect(judge(w, 'scenario').code).toBe(0);
    expect(judge(w, 'props').code).toBe(0);
    expect(plan(w).code).toBe(0);
    expect(JSON.parse(readFileSync(w.p('plan.json'), 'utf8')).clips).toHaveLength(4);

    const e = JSON.parse(readFileSync(w.p('episode.json'), 'utf8'));
    e.cuts[2].lines[0].text = '그 손 놓으세요.';
    writeFileSync(w.p('episode.json'), JSON.stringify(e));
    const stale = plan(w);
    expect(stale.code).toBe(1);
    expect(JSON.stringify(stale.json)).toMatch(/현재 대본과 다름/);
    expect(JSON.parse(readFileSync(w.p('plan.json'), 'utf8')).ok).toBe(false);
    // 관문을 다시 돌려도 바뀐 대사는 다시 판정받기 전까지 막힌다.
    cli(['validate', ...w.base, '--gates', w.p('gates')]);
    judge(w, 'scenario');
    judge(w, 'props');
    expect(cli(['judge-build', '--kind', 'dialogue', ...w.base, '--out', w.p('again2.json')]).json.questions).toBe(3);
    const still = plan(w);
    expect(still.code).toBe(1);
    expect(JSON.stringify(still.json)).toMatch(/검증 이후 대사·장면이 바뀜/);
    expect(judge(w, 'dialogue').code).toBe(0);
    expect(plan(w).code).toBe(0);
  });

  it('assemble refuses cuts without a passing transcript check', () => {
    const w = workspace();
    const r = cli(['assemble', ...w.base, '--gates', w.p('gates'), '--clips', w.p('clips'), '--out', w.p('out/ep.mp4'), '--font', '/System/Library/Fonts/AppleSDGothicNeo.ttc']);
    expect(r.code).toBe(1);
    expect(JSON.stringify(r.json)).toMatch(/받아쓰기 대조 기록 없음: c2/);
  });

  it('refuses a plan when the topic gate was never passed', () => {
    const w = workspace();
    cli(['validate', ...w.base, '--gates', w.p('gates')]);
    judge(w, 'dialogue');
    judge(w, 'scenario');
    judge(w, 'props');
    const r = plan(w);
    expect(r.code).toBe(1);
    expect(JSON.stringify(r.json)).toMatch(/주제 관문 기록 없음: topic-night-shift/);
  });

  it('lets a person approve an undecided line, which then passes the plan', () => {
    const w = workspace();
    topics(w);
    cli(['validate', ...w.base, '--gates', w.p('gates')]);
    const d = judge(w, 'dialogue', (id) => (id === 'c2__1__natural' ? ['pass', 0.82, 0.91] : allPass(id)));
    expect(d.json.verifiedLines).toBe(4);
    const a = cli(['approve-line', '--episode', w.p('episode.json'), '--cut', 'c2', '--line', '1', '--by', 'user', '--note', 'JEV natural 0.82 미확정, 사용자 청취 승인']);
    expect(a.code).toBe(0);
    expect(cli(['approve-line', '--episode', w.p('episode.json'), '--cut', 'c2', '--line', '1', '--by', 'user', '--note', 'again']).code).toBe(1);
    judge(w, 'scenario');
    judge(w, 'props');
    expect(plan(w).code).toBe(0);
  });

  it('refuses to apply a judge response after the script changed', () => {
    const w = workspace();
    cli(['judge-build', '--kind', 'scenario', ...w.base, '--out', w.p('req.json')]);
    fakeResponse(w.p('req.json'), w.p('res.json'));
    const e = JSON.parse(readFileSync(w.p('episode.json'), 'utf8'));
    e.cuts[0].action = '서윤이 박스를 두 개씩 든다.';
    writeFileSync(w.p('episode.json'), JSON.stringify(e));
    const r = cli(['judge-apply', '--kind', 'scenario', ...w.base, '--request', w.p('req.json'), '--response', w.p('res.json'), '--gates', w.p('gates')]);
    expect(r.code).toBe(1);
    expect(r.json.problem).toMatch(/바뀜/);
  });

  it('verify-clip blocks the pilot mispronunciation from a whisper JSON file', () => {
    const w = workspace();
    const e = JSON.parse(readFileSync(w.p('episode.json'), 'utf8'));
    e.cuts[1].lines[0].text = '막내야, 이번 주 수수료 안 냈지?';
    writeFileSync(w.p('episode.json'), JSON.stringify(e));
    writeFileSync(w.p('c2.json'), JSON.stringify({ text: '막내야, 이번 주 수술이 안 냈지? 제 일당이에요. 제발요.' }));
    const r = cli(['verify-clip', ...w.base, '--cut', 'c2', '--transcript', w.p('c2.json'), '--gates', w.p('gates')]);
    expect(r.code).toBe(1);
    expect(r.json.report.gate).toBe('transcript-c2');
  });

  it('exits 2 on usage errors', () => {
    expect(cli(['plan']).code).toBe(2);
    expect(cli(['judge-build', '--kind', 'vibes']).code).toBe(2);
  });
});
