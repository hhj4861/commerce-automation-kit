import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg=fileURLToPath(new URL('..',import.meta.url));
const fixtures=new URL('./fixtures/',import.meta.url);
function cli(args:string[]) {
  const r=spawnSync(process.execPath,['--import','tsx','src/cli/index.ts',...args],{cwd:pkg,encoding:'utf8',timeout:30_000});
  if(r.error||r.signal||!r.stdout.trim()) throw new Error(`${r.error??r.signal??r.stderr}`);
  return {code:r.status,json:JSON.parse(r.stdout)};
}
function workspace() {
  const dir=mkdtempSync(join(tmpdir(),'continuation-cli-')), p=(name:string)=>join(dir,name);
  copyFileSync(new URL('series.json',fixtures),p('series.json'));
  const prev=JSON.parse(readFileSync(new URL('episode.json',fixtures),'utf8'));
  const episode={...structuredClone(prev),no:2,continuesFromEpisode:{no:1,cutId:'c4'},cuts:[{...structuredClone(prev.cuts[3]),transitionIn:'cut'}]};
  writeFileSync(p('previous.json'),JSON.stringify(prev));writeFileSync(p('episode.json'),JSON.stringify(episode));
  const base=['--series',p('series.json'),'--episode',p('episode.json')];
  const linked=[...base,'--prev-episode',p('previous.json')];
  return {p,base,linked};
}
describe('linked episode CLI', {timeout:60_000}, () => {
  it('requires previous input and persists the contextual fingerprint on validation', () => {
    const w=workspace();
    const missing=cli(['validate',...w.base,'--gates',w.p('gates')]);
    expect(missing.code).toBe(1);expect(missing.json.error).toContain('--prev-episode');
    expect(cli(['validate',...w.linked,'--gates',w.p('gates')]).code).toBe(0);
    const report=JSON.parse(readFileSync(w.p('gates/continuity.json'),'utf8'));
    expect(report.reviewContextDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
  it('sends prior scene context and rejects an answer after prior dialogue changes', () => {
    const w=workspace();
    expect(cli(['judge-build','--kind','scenario',...w.linked,'--out',w.p('req.json')]).code).toBe(0);
    const req=JSON.parse(readFileSync(w.p('req.json'),'utf8'));
    expect(JSON.stringify(req)).toContain('previousEpisode');
    const prev=JSON.parse(readFileSync(w.p('previous.json'),'utf8'));
    prev.cuts[3].lines[0].text='거기 그대로 있어.';
    writeFileSync(w.p('previous.json'),JSON.stringify(prev));
    // Deliberately no response file: context invalidation must precede reading it.
    const applied=cli(['judge-apply','--kind','scenario',...w.linked,'--request',w.p('req.json'),'--response',w.p('absent.json'),'--gates',w.p('gates')]);
    expect(applied.code).toBe(1);expect(applied.json.problem).toContain('검토 문맥이 바뀜');
  });
  it('binds a synthetic human approval and asks again after the previous action changes', () => {
    const w=workspace();
    expect(cli(['approve-line',...w.linked,'--cut','c4','--line','0','--by','synthetic-test','--note','fixture only']).code).toBe(0);
    const saved=JSON.parse(readFileSync(w.p('episode.json'),'utf8'));
    expect(saved.cuts[0].lines[0].verification.reviewContextDigest).toMatch(/^sha256:/);
    expect(cli(['judge-build','--kind','dialogue',...w.linked,'--out',w.p('req.json')]).json.questions).toBe(0);
    const prev=JSON.parse(readFileSync(w.p('previous.json'),'utf8'));prev.cuts[3].action='전화를 끊는다.';
    writeFileSync(w.p('previous.json'),JSON.stringify(prev));
    expect(cli(['judge-build','--kind','dialogue',...w.linked,'--out',w.p('new.json')]).json.questions).toBe(4);
  });
  it('requires explicit previous clip directory and never borrows a colliding current clip', () => {
    const w=workspace();mkdirSync(w.p('clips'));mkdirSync(w.p('previous-clips'));
    writeFileSync(w.p('clips/c4.mp4'),'not a video: must not be read as the previous clip');
    const missing=cli(['join-check',...w.linked,'--clips',w.p('clips')]);
    expect(missing.code).toBe(1);expect(missing.json.joins[0].finding.message).toContain('--prev-clips 필수');
    const separate=cli(['join-check',...w.linked,'--clips',w.p('clips'),'--prev-clips',w.p('previous-clips')]);
    expect(separate.code).toBe(1);expect(separate.json.joins[0].finding.message).toBe('클립 파일 없음');
  });
  it('blocks linked planning and assembly before emitting generation specs or reading media', () => {
    const w=workspace();
    const plan=cli(['plan',...w.linked,'--gates',w.p('gates'),'--budget','200','--draft','--out',w.p('plan.json')]);
    expect(plan.code).toBe(1);expect(JSON.stringify(plan.json)).toContain('회차 연결 생성 차단');
    const saved=JSON.parse(readFileSync(w.p('plan.json'),'utf8'));expect(saved.ok).toBe(false);
    const assembled=cli(['assemble',...w.linked,'--gates',w.p('gates'),'--clips',w.p('clips'),'--out',w.p('out.mp4'),'--font',w.p('missing-font')]);
    expect(assembled.code).toBe(1);expect(assembled.json.problem).toContain('회차 연결 조립 차단');
  });
});

it('refuses old raw answers combined with a fresh linked request and accepts matching answers', () => {
  const w=workspace();
  const build=()=>cli(['judge-build','--kind','dialogue',...w.linked,'--out',w.p('req.json')]);
  const answer=()=>{
    const request=JSON.parse(readFileSync(w.p('req.json'),'utf8'));
    writeFileSync(w.p('res.json'),JSON.stringify({answers:Object.fromEntries(Object.keys(request.questions).map(id=>[id,{type:'choice',choice:'pass',confidence:1,probabilities:{pass:1,fail:0}}]))}));
  };
  const apply=()=>cli(['judge-apply','--kind','dialogue',...w.linked,'--request',w.p('req.json'),'--response',w.p('res.json'),'--gates',w.p('gates')]);
  expect(build().code).toBe(0);answer();
  const prev=JSON.parse(readFileSync(w.p('previous.json'),'utf8'));prev.cuts[3].lines[0].text='거기서 기다려.';
  writeFileSync(w.p('previous.json'),JSON.stringify(prev));
  expect(build().code).toBe(0);
  const mixed=apply();expect(mixed.code).toBe(1);expect(mixed.json.error).toContain('질문 누락');
  answer();expect(apply().code).toBe(0);
  expect(build().json.questions).toBe(0);
},60_000);
