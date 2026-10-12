/**
 * drama-series CLI — 판단 없는 검사·명세·조립. 외부 호출(JEV·힉스필드)은 하지 않는다.
 *
 *   genres
 *   episode-lock/episode-lock-status/episode-handoff/episode-unlock/episode-edit
 *   episode-keyframes-build/episode-keyframes-check (see README for ownership CAS arguments)
 *   keyframe-build   --series --episode --cut --aspect 16:9 --out request.json
 *   keyframe-source  --series --episode --cut --asset <id> --file image.png --out <new-directory>
 *   keyframe-approve --series --episode --cut --asset <id> --source <directory> --approval human.json --out <new-directory>
 *   keyframe-check   --series --episode --cut --asset <id> --source <approved-directory>
 *                    (all four accept --prev-episode; never authorize generation/assembly)
 *   topic-build  --topics topics.json --out req.json                                (req.meta.json 함께 생성)
 *   topic-apply  --topics topics.json --request req.json --response res.json --gates dir
 *   validate     --series s.json --episode e.json --gates dir
 *   judge-build  --kind dialogue|scenario|props --series --episode --out req.json
 *   judge-apply  --kind … --series --episode --request req.json --response res.json --gates dir [--episode-out e.json]
 *   approve-line --episode e.json --cut c2 --line 1 --by <승인자> --note <사유>
 *   plan         --series --episode --gates dir --budget <크레딧> [--resolution 480p] [--draft] [--aspect 16:9] --out plan.json
 *   verify-clip  --series --episode --cut c2 --gates dir (--transcript whisper.json | --media clip.mp4 [--work dir])
 *   join-check   --series s.json --episode e.json --clips <dir: cutId.mp4> [--min 0.45]   (이어지는 컷 경계 SSIM)
 *   assemble     --series s.json --episode e.json --gates dir --clips <dir: cutId.mp4> --out ep.mp4 --font <ttc> [--work dir] [--no-ai-label]
 *                [--cuts c1,c2,…(회차 일부만)] [--aspect 16:9|9:16(세로는 흐린 배경 채우기)] [--title <쇼츠 상단 고정 제목>] [--kicker <제목 위 머리글>]
 *                [--trim c2=0:27,c3=2: (컷별로 쓸 구간)]
 *                [--cold-open <cutId>@<시작초>+<길이초> [--cold-open-caption "10분 전"]]
 *                [--style style.json({title,kicker,subtitle,caption}: {fontFile,color,borderW,borderColor,shadow,box:{color,pad},scale})]
 *
 * stdout = JSON. 종료 코드 0 정상 / 1 차단·검증 실패 / 2 사용법 오류.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { DramaFinding, DramaGateReport } from '@cak/contracts';
import { parseEpisode, parseSeries, parseTopicSet } from '../core/model.js';
import { listGenres, loadGenre } from '../core/genre.js';
import { fingerprintOf, topicsFingerprint } from '../core/fingerprint.js';
import { runEpisodeGates } from '../core/gates/registry.js';
import type { GateContext } from '../core/gates/types.js';
import { applyVerdicts, buildQuestions, judgeState } from '../core/judge-gates.js';
import type { EpisodeJudgeKind, JudgeQuestion, JudgeRequestMeta } from '../core/judge-types.js';
import { applyTopicVerdicts, buildTopicQuestions } from '../core/topic-gates.js';
import { buildJevRequest, parseJevResponse } from '../adapters/judge/jev.js';
import { buildPlan } from '../core/plan.js';
import type { VideoOptions } from '../adapters/video/seedance-2-5.js';
import { transcriptGate, transcriptReadiness } from '../core/transcript.js';
import { isLineCleared, lineHash } from '../core/line-hash.js';
import { parseWhisperJson, transcribe } from '../adapters/transcribe/whisper.js';
import { assembleEpisode, type AssembleEpisodeInput } from '../adapters/assemble.js';
import { prepareReleaseSource, checkContinuationSource } from '../adapters/release-source.js';
import { readStrictJsonFile } from '../adapters/media-evidence.js';
import { contentSha } from '../core/release-source.js';
import { prepareVisualVerdict, applyVisualVerdict } from '../adapters/visual-verdict.js';
import { acquireEpisodeLock, episodeLockStatus, changeEpisodeOwner, withEpisodeOwner, assertUnprotectedOutput, type EpisodeGuard } from '../adapters/episode-lock.js';
import { buildEpisodeKeyframes, checkEpisodeKeyframes } from '../adapters/episode-keyframes.js';
import { writeKeyframeRequest, prepareKeyframeEvidence, approveKeyframeEvidence, checkKeyframeApproval } from '../adapters/keyframe-evidence.js';
import { parseTrimSpec } from '../core/assemble-args.js';
import { joinSimilarity } from '../adapters/ffmpeg.js';
import { JOIN_MIN_SSIM, chainsFrom, judgeJoin } from '../core/join.js';
import { chainsFromV1 } from '../core/shot-policy.js';

import { assertContinuation, previousCutOf, contextBinding, isContextLineCleared } from '../core/continuation.js';

class UsageError extends Error {}

/** "c7@3.5+2" → c7 클립의 3.5초부터 2초 */
function coldOpen(spec: string | undefined, caption: string | undefined, clipDir: string) {
  if (!spec) return null;
  const m = /^([\w-]+)@(\d+(?:\.\d+)?)\+(\d+(?:\.\d+)?)$/.exec(spec);
  if (!m) throw new UsageError('--cold-open 은 <cutId>@<시작초>+<길이초> (예: c7@3.5+2)');
  return { file: join(clipDir, `${m[1]}.mp4`), startSec: Number(m[2]), durationSec: Number(m[3]), ...(caption ? { caption } : {}) };
}
type Opts = Record<string, string | boolean | undefined>;

const abs = (p: string) => (isAbsolute(p) ? p : resolve(process.env.INIT_CWD ?? process.cwd(), p));
const readJson = (p: string): unknown => JSON.parse(readFileSync(abs(p), 'utf8'));
function writeJson(p: string, v: unknown): void {
  assertUnprotectedOutput(abs(p));
  mkdirSync(dirname(abs(p)), { recursive: true });
  writeFileSync(abs(p), JSON.stringify(v, null, 2) + '\n');
}
const readStrictJson = (p:string):unknown => readStrictJsonFile(abs(p));
const out = (v: unknown) => console.log(JSON.stringify(v, null, 2));
const metaPath = (p: string) => `${p.replace(/\.json$/, '')}.meta.json`;

function opts(rest: string[], names: Record<string, 'string' | 'boolean'>): Opts {
  const options = Object.fromEntries(Object.entries(names).map(([k, type]) => [k, { type }]));
  try {
    const values=parseArgs({ args: rest, options, allowPositionals: false }).values as Opts;
    if(typeof values.out==='string')assertUnprotectedOutput(abs(values.out));
    return values;
  } catch (e) {
    throw new UsageError(e instanceof Error ? e.message : String(e));
  }
}
function req(o: Opts, k: string): string {
  const v = o[k];
  if (typeof v !== 'string' || v.length === 0) throw new UsageError(`--${k} 필수`);
  return v;
}
const optStr = (o: Opts, k: string): string | undefined => (typeof o[k] === 'string' && o[k] !== '' ? (o[k] as string) : undefined);

function loadCtx(o: Opts, read: (p:string)=>unknown = readJson): GateContext {
  const series = parseSeries(read(req(o, 'series')));
  const episode = parseEpisode(read(req(o, 'episode')));
  const prev = optStr(o, 'prev-episode');
  const ctx: GateContext = { series, episode, genre: loadGenre(series.genreId), ...(prev ? { prev: { episode: parseEpisode(read(prev)) } } : {}) };
  assertContinuation(ctx);
  return ctx;
}
const guardOptions={agent:'string',session:'string','lock-id':'string','lock-revision':'string','episode-sha':'string'} as const;
function guardOf(o:Opts):EpisodeGuard {
  const agent=req(o,'agent');if(agent!=='codex' && agent!=='claude')throw new UsageError('--agent codex|claude');
  return {owner:{agent,session:req(o,'session')},lockId:req(o,'lock-id'),revision:Number(req(o,'lock-revision')),episodeSha:req(o,'episode-sha')};
}
function needsEpisodeLock(path:string):boolean {
  return existsSync(abs(path)+'.lock.json') || parseEpisode(readJson(path)).shotPolicy?.version==='shot-v1';
}
function lockedCtx(o:Opts,episode:GateContext['episode']):GateContext {
  return loadCtx(o,p=>abs(p)===abs(req(o,'episode'))?episode:readStrictJson(p));
}
function saveReport(dir: string, r: DramaGateReport): void {
  writeJson(join(dir, `${r.gate}.json`), r);
}
function loadReports(dir: string): DramaGateReport[] {
  const d = abs(dir);
  if (!existsSync(d)) return [];
  return readdirSync(d)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(d, f), 'utf8')) as DramaGateReport);
}
function writeRequest(target: string, kind: JudgeRequestMeta['kind'], fingerprint: string, state: Record<string, unknown>, questions: JudgeQuestion[], binding: { reviewContextDigest?: string } = {}): void {
  writeJson(target, buildJevRequest(state, questions));
  const meta: JudgeRequestMeta = { ...binding, kind, fingerprint, questions: questions.map((q) => ({ id: q.id, type: q.type })), createdAt: new Date().toISOString() };
  writeJson(metaPath(target), meta);
}
function readMeta(request: string, kind: JudgeRequestMeta['kind']): JudgeRequestMeta {
  const meta = readJson(metaPath(request)) as JudgeRequestMeta;
  if (meta.kind !== kind) throw new UsageError(`요청 종류(${meta.kind})와 명령(${kind})이 다름`);
  return meta;
}
const KINDS = ['dialogue', 'scenario', 'props'] as const;
function kindOf(v: string): EpisodeJudgeKind {
  if (!(KINDS as readonly string[]).includes(v)) throw new UsageError(`--kind 는 ${KINDS.join('|')}`);
  return v as EpisodeJudgeKind;
}

function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'episode-lock': {
      const o=opts(rest,{episode:'string',agent:'string',session:'string','lock-revision':'string'});
      const agent=req(o,'agent');if(agent!=='codex' && agent!=='claude')throw new UsageError('--agent codex|claude');
      out(acquireEpisodeLock(abs(req(o,'episode')),{agent,session:req(o,'session')},Number(optStr(o,'lock-revision')??'0')));return 0;
    }
    case 'episode-lock-status': {
      const o=opts(rest,{episode:'string'});out(episodeLockStatus(abs(req(o,'episode'))));return 0;
    }
    case 'episode-handoff':
    case 'episode-unlock': {
      const o=opts(rest,{episode:'string',...guardOptions,'to-agent':'string','to-session':'string',note:'string'});
      const agent=cmd==='episode-handoff'?req(o,'to-agent'):null;
      if(agent!==null && agent!=='codex' && agent!=='claude')throw new UsageError('--to-agent codex|claude');
      out(changeEpisodeOwner(abs(req(o,'episode')),guardOf(o),agent?{agent,session:req(o,'to-session')}:null,req(o,'note')));return 0;
    }
    case 'episode-edit': {
      const o=opts(rest,{episode:'string',input:'string',...guardOptions});
      const next=parseEpisode(readStrictJson(req(o,'input')));
      withEpisodeOwner(abs(req(o,'episode')),guardOf(o),tx=>tx.write(next));
      out({ok:true,...episodeLockStatus(abs(req(o,'episode')))});return 0;
    }
    case 'episode-keyframes-build':
    case 'episode-keyframes-check': {
      const o=opts(rest,{episode:'string',series:'string','prev-episode':'string',keyframes:'string',out:'string',report:'string',...guardOptions});
      const input={episodePath:abs(req(o,'episode')),seriesPath:abs(req(o,'series')),prevPath:optStr(o,'prev-episode')?abs(req(o,'prev-episode')):undefined,manifestPath:abs(req(o,'keyframes')),guard:guardOf(o)};
      out(cmd==='episode-keyframes-build'?buildEpisodeKeyframes(input,abs(req(o,'out'))):checkEpisodeKeyframes(input,abs(req(o,'report'))));return 0;
    }

    case 'keyframe-build': {
      const o=opts(rest,{series:'string',episode:'string','prev-episode':'string',cut:'string',aspect:'string',out:'string'});
      const request=writeKeyframeRequest(loadCtx(o,readStrictJson),req(o,'cut'),optStr(o,'aspect')??'16:9',abs(req(o,'out')));
      out({ok:true,authorized:false,request});return 0;
    }
    case 'keyframe-source': {
      const o=opts(rest,{series:'string',episode:'string','prev-episode':'string',cut:'string',asset:'string',file:'string',out:'string'});
      const evidence=prepareKeyframeEvidence(loadCtx(o,readStrictJson),req(o,'cut'),req(o,'asset'),abs(req(o,'file')),abs(req(o,'out')));
      out({ok:true,authorized:false,evidence});return 0;
    }
    case 'keyframe-approve': {
      const o=opts(rest,{series:'string',episode:'string','prev-episode':'string',cut:'string',asset:'string',source:'string',approval:'string',out:'string'});
      const binding=approveKeyframeEvidence(loadCtx(o,readStrictJson),req(o,'cut'),req(o,'asset'),abs(req(o,'source')),readStrictJson(req(o,'approval')),abs(req(o,'out')));
      out({ok:true,authorized:false,binding});return 0;
    }
    case 'keyframe-check': {
      const o=opts(rest,{series:'string',episode:'string','prev-episode':'string',cut:'string',asset:'string',source:'string'});
      out(checkKeyframeApproval(loadCtx(o,readStrictJson),req(o,'cut'),req(o,'asset'),abs(req(o,'source'))));return 0;
    }
    case 'visual-verdict-build': {
      const o=opts(rest,{series:'string',episode:'string','prev-episode':'string',cut:'string',job:'string',clip:'string',out:'string'});
      const request=prepareVisualVerdict(loadCtx(o,readStrictJson),req(o,'cut'),req(o,'job'),abs(req(o,'clip')),abs(req(o,'out')));
      out({ok:true,authorized:false,request,directory:abs(req(o,'out'))}); return 0;
    }
    case 'visual-verdict-apply': {
      const o=opts(rest,{series:'string',episode:'string','prev-episode':'string',cut:'string',job:'string',source:'string',response:'string',out:'string'});
      const report=applyVisualVerdict(loadCtx(o,readStrictJson),req(o,'cut'),req(o,'job'),abs(req(o,'source')),readStrictJson(req(o,'response')));
      if(optStr(o,'out'))writeFileSync(abs(req(o,'out')),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
      out({ok:report.verdict==='pass',authorized:false,report}); return report.verdict==='pass'?0:1;
    }
    case 'release-source': {
      const o = opts(rest, { series:'string', episode:'string', cut:'string', clip:'string', out:'string' });
      const source = prepareReleaseSource(parseSeries(readJson(req(o,'series'))), parseEpisode(readJson(req(o,'episode'))), req(o,'cut'), abs(req(o,'clip')), abs(req(o,'out')));
      out({ ok:true, authorized:false, source, directory:abs(req(o,'out')), note:'미출시 증거 사본 — 별도 사람 승인 기록과 전체 출시 관문 필요' });
      return 0;
    }
    case 'continuation-check': {
      const o = opts(rest, { series:'string', episode:'string', 'prev-episode':'string', source:'string', approval:'string', binding:'string', out:'string' });
      const result = checkContinuationSource(loadCtx(o), abs(req(o,'source')), readJson(req(o,'approval')));
      if (optStr(o,'binding') && contentSha(readJson(req(o,'binding'))) !== contentSha(result.binding)) {
        out({ ok:false, authorized:false, problem:'저장된 연결 증거가 현재 문맥·파일·승인과 다름' });
        return 1;
      }
      if (optStr(o,'out')) writeFileSync(abs(req(o,'out')),JSON.stringify(result.binding,null,2)+'\n',{flag:'wx',mode:0o600});
      out(result);
      return 0;
    }
    case 'genres':
      out({ ok: true, genres: listGenres() });
      return 0;

    case 'topic-build': {
      const o = opts(rest, { topics: 'string', out: 'string' });
      const target = req(o, 'out');
      const set = parseTopicSet(readJson(req(o, 'topics')));
      const genre = loadGenre(set.genreId);
      const questions = buildTopicQuestions(set.topics, genre);
      writeRequest(target, 'topic', topicsFingerprint(set.topics, set.genreId), { genre: genre.name, genrePromise: genre.promise }, questions);
      out({ ok: true, kind: 'topic', topics: set.topics.length, questions: questions.length, out: abs(target), meta: abs(metaPath(target)) });
      return 0;
    }

    case 'topic-apply': {
      const o = opts(rest, { topics: 'string', request: 'string', response: 'string', gates: 'string' });
      const path = req(o, 'topics');
      const gates = req(o, 'gates');
      const set = parseTopicSet(readJson(path));
      const meta = readMeta(req(o, 'request'), 'topic');
      if (meta.fingerprint !== topicsFingerprint(set.topics, set.genreId)) {
        out({ ok: false, problem: '판정 요청 이후 주제가 바뀜 — topic-build 부터 다시 실행' });
        return 1;
      }
      const genre = loadGenre(set.genreId);
      const result = applyTopicVerdicts(set.topics, genre, meta.questions, parseJevResponse(readJson(req(o, 'response')), meta.questions));
      for (const r of result.reports) saveReport(gates, r);
      writeJson(path, { ...set, topics: result.topics });
      const passed = result.ranking.filter((r) => r.passed).length;
      out({ ok: passed > 0, passed, ranking: result.ranking, reports: result.reports });
      return passed > 0 ? 0 : 1;
    }

    case 'validate': {
      const o = opts(rest, { series: 'string', episode: 'string', 'prev-episode': 'string', gates: 'string' });
      const gates = req(o, 'gates');
      const reports = runEpisodeGates(loadCtx(o));
      for (const r of reports) saveReport(gates, r);
      const ok = reports.every((r) => r.ok);
      out({ ok, reports });
      return ok ? 0 : 1;
    }

    case 'judge-build': {
      const o = opts(rest, { kind: 'string', series: 'string', episode: 'string', 'prev-episode': 'string', out: 'string' });
      const kind = kindOf(req(o, 'kind'));
      const target = req(o, 'out');
      const ctx = loadCtx(o);
      const questions = buildQuestions(kind, ctx);
      if (!questions.length) {
        out({ ok: true, kind, questions: 0, note: '판정할 질문 없음(모든 대사가 이미 검증·승인됨)' });
        return 0;
      }
      writeRequest(target, kind, fingerprintOf(ctx.series, ctx.episode), judgeState(ctx), questions, contextBinding(ctx));
      out({ ok: true, kind, questions: questions.length, out: abs(target), meta: abs(metaPath(target)) });
      return 0;
    }

    case 'judge-apply': {
      const o = opts(rest, { kind: 'string', series: 'string', episode: 'string', 'prev-episode': 'string', request: 'string', response: 'string', gates: 'string', 'episode-out': 'string', ...guardOptions });
      const kind = kindOf(req(o, 'kind'));
      const gates = req(o, 'gates');
      if(needsEpisodeLock(req(o,'episode'))) {
        if(optStr(o,'episode-out') && abs(req(o,'episode-out'))!==abs(req(o,'episode')))throw new UsageError('잠긴 회차의 episode-out은 원본 경로만 허용');
        const result=withEpisodeOwner(abs(req(o,'episode')),guardOf(o),tx=>{
          const ctx=lockedCtx(o,tx.episode),meta=readMeta(req(o,'request'),kind),binding=contextBinding(ctx);
          if(meta.fingerprint!==fingerprintOf(ctx.series,ctx.episode) || (binding.reviewContextDigest && meta.reviewContextDigest!==binding.reviewContextDigest))throw new Error('판정 요청 이후 대본/문맥 변경');
          const verdicts=parseJevResponse(readStrictJson(req(o,'response')),meta.questions);
          const result=applyVerdicts(kind,ctx,meta.questions,verdicts,basename(req(o,'response')),new Date().toISOString(),meta);
          assertUnprotectedOutput(abs(join(gates,`${result.report.gate}.json`)));
          if(kind==='dialogue')tx.write(result.episode);
          return result;
        });
        saveReport(gates,result.report);
        out({ok:result.report.ok,report:result.report,...(kind==='dialogue'?{verifiedLines:result.episode.cuts.flatMap(c=>c.lines).filter(l=>l.verification.status==='verified').length}:{})});
        return result.report.ok?0:1;
      }
      const ctx = loadCtx(o);
      const meta = readMeta(req(o, 'request'), kind);
      const binding = contextBinding(ctx);
      if (meta.fingerprint !== fingerprintOf(ctx.series, ctx.episode) || (binding.reviewContextDigest && meta.reviewContextDigest !== binding.reviewContextDigest)) {
        out({ ok: false, problem: '판정 요청 이후 대본/검토 문맥이 바뀜 — judge-build 부터 다시 실행' });
        return 1;
      }
      const verdicts = parseJevResponse(readJson(req(o, 'response')), meta.questions);
      const { report, episode } = applyVerdicts(kind, ctx, meta.questions, verdicts, basename(req(o, 'response')), new Date().toISOString(), meta);
      saveReport(gates, report);
      if (kind === 'dialogue') writeJson(optStr(o, 'episode-out') ?? req(o, 'episode'), episode);
      const verifiedLines = episode.cuts.flatMap((c) => c.lines).filter((l) => l.verification.status === 'verified').length;
      out({ ok: report.ok, report, ...(kind === 'dialogue' ? { verifiedLines } : {}) });
      return report.ok ? 0 : 1;
    }

    case 'approve-line': {
      const o = opts(rest, { episode: 'string', series: 'string', 'prev-episode': 'string', cut: 'string', line: 'string', by: 'string', note: 'string', ...guardOptions });
      const path = req(o, 'episode');
      if(needsEpisodeLock(path)) {
        const result=withEpisodeOwner(abs(path),guardOf(o),tx=>{
          const episode=tx.episode,linked=episode.continuesFromEpisode || episode.startsFresh || optStr(o,'prev-episode');
          const ctx=linked?lockedCtx(o,episode):undefined,i=Number(req(o,'line'));
          const cut=episode.cuts.find(c=>c.id===req(o,'cut')),line=Number.isInteger(i)?cut?.lines[i]:undefined;
          if(!cut || !line)throw new UsageError('해당 컷·대사 없음');
          if(ctx?isContextLineCleared(ctx,cut,line):isLineCleared(cut,line))throw new Error('이미 검증/승인된 대사');
          line.verification={status:'human-approved',approvedBy:req(o,'by'),at:new Date().toISOString(),note:req(o,'note'),lineHash:lineHash(cut,line),...(ctx?contextBinding(ctx):{})};
          tx.write(episode);return {ok:true,cut:cut.id,line:i,text:line.text};
        });out(result);return 0;
      }
      const episode = parseEpisode(readJson(path));
      const linked = episode.continuesFromEpisode || episode.startsFresh || optStr(o, 'prev-episode');
      const ctx = linked ? loadCtx(o) : undefined;
      const i = Number(req(o, 'line'));
      const cut = episode.cuts.find((c) => c.id === req(o, 'cut'));
      const line = Number.isInteger(i) ? cut?.lines[i] : undefined;
      if (!cut || !line) throw new UsageError('해당 컷·대사 없음');
      if (ctx ? isContextLineCleared(ctx, cut, line) : isLineCleared(cut, line)) {
        out({ ok: false, problem: `이미 ${line.verification.status} 상태인 대사는 승인할 수 없음` });
        return 1;
      }
      line.verification = { status: 'human-approved', approvedBy: req(o, 'by'), at: new Date().toISOString(), note: req(o, 'note'), lineHash: lineHash(cut, line), ...(ctx ? contextBinding(ctx) : {}) };
      writeJson(path, episode);
      out({ ok: true, cut: cut.id, line: i, text: line.text });
      return 0;
    }

    case 'plan': {
      const o = opts(rest, { series: 'string', episode: 'string', 'prev-episode': 'string', gates: 'string', budget: 'string', resolution: 'string', draft: 'boolean', aspect: 'string', out: 'string' });
      const target = req(o, 'out');
      const budget = Number(req(o, 'budget'));
      if (!Number.isFinite(budget) || budget <= 0) throw new UsageError('--budget 은 양수 크레딧');
      const resolution = optStr(o, 'resolution') ?? '480p';
      if (!['480p', '720p', '1080p'].includes(resolution)) throw new UsageError('--resolution 은 480p|720p|1080p');
      const aspect = optStr(o, 'aspect') ?? '16:9';
      if (!['16:9', '9:16'].includes(aspect)) throw new UsageError('--aspect 는 16:9|9:16');
      const video: VideoOptions = { resolution: resolution as VideoOptions['resolution'], draft: o.draft === true, aspectRatio: aspect as VideoOptions['aspectRatio'] };
      const result = buildPlan({ ctx: loadCtx(o), reports: loadReports(req(o, 'gates')), budgetCredits: budget, video, now: new Date().toISOString() });
      // 실패 시에도 덮어써서 예전 승인 계획이 남지 않게 한다.
      writeJson(target, result.ok ? result.plan : { ok: false, reports: result.reports });
      out(result);
      return result.ok ? 0 : 1;
    }

    case 'verify-clip': {
      const o = opts(rest, { series: 'string', episode: 'string', 'prev-episode': 'string', cut: 'string', gates: 'string', transcript: 'string', media: 'string', work: 'string' });
      const gates = req(o, 'gates');
      const cutId = req(o, 'cut');
      const ctx = loadCtx(o);
      const transcriptFile = optStr(o, 'transcript');
      const media = optStr(o, 'media');
      let text: string;
      if (transcriptFile) text = parseWhisperJson(readJson(transcriptFile));
      else if (media) text = transcribe(abs(media), abs(optStr(o, 'work') ?? join(dirname(abs(media)), '.whisper')));
      else throw new UsageError('--transcript 또는 --media 필요');
      const report = transcriptGate(ctx, cutId, text);
      saveReport(gates, report);
      out({ ok: report.ok, transcript: text, report });
      return report.ok ? 0 : 1;
    }

    case 'join-check': {
      const o = opts(rest, { series: 'string', episode: 'string', 'prev-episode': 'string', clips: 'string', 'prev-clips': 'string', min: 'string' });
      const ctx = loadCtx(o);
      const dir = abs(req(o, 'clips'));
      const min = optStr(o, 'min') ? Number(optStr(o, 'min')) : JOIN_MIN_SSIM;
      type Join = { prev: string; cut: string; ssim: number | null; finding: DramaFinding | null };
      const joins = ctx.episode.cuts.flatMap((cut, i): Join[] => {
        const prev = previousCutOf(ctx, i);
        const cross = i === 0 && !!ctx.episode.continuesFromEpisode;
        const connected = ctx.episode.shotPolicy
          ? chainsFromV1(prev, cut, cross && ctx.prev?.episode.shotPolicy === undefined)
          : chainsFrom(prev, cut);
        if (ctx.episode.shotPolicy && cut.continuesFromPrev && !connected)
          return [{ prev: prev?.id ?? '', cut: cut.id, ssim: null, finding: { severity: 'block', cutId: cut.id, message: 'shot-v1 연결 선언 불일치: 앞 컷·장소/구도·전환·blocking 확인 필요' } }];
        if (!prev || !connected) return [];
        const prevDir = optStr(o, 'prev-clips');
        if (cross && !prevDir) return [{ prev: prev.id, cut: cut.id, ssim: null, finding: { severity: 'block', cutId: cut.id, message: '앞 회차 클립에는 --prev-clips 필수' } }];
        const a = join(cross ? abs(prevDir!) : dir, `${prev.id}.mp4`);
        const b = join(dir, `${cut.id}.mp4`);
        if (!existsSync(a) || !existsSync(b)) return [{ prev: prev.id, cut: cut.id, ssim: null, finding: { severity: 'block' as const, cutId: cut.id, message: '클립 파일 없음' } }];
        const ssim = joinSimilarity(a, b);
        return [{ prev: prev.id, cut: cut.id, ssim: Math.round(ssim * 1000) / 1000, finding: judgeJoin(prev.id, cut.id, ssim, min) }];
      });
      const ok = joins.every((j) => !j.finding);
      out({ ok, min, joins });
      return ok ? 0 : 1;
    }

    case 'assemble': {
      const o = opts(rest, { series: 'string', episode: 'string', 'prev-episode': 'string', gates: 'string', clips: 'string', out: 'string', font: 'string', work: 'string', 'no-ai-label': 'boolean', cuts: 'string', aspect: 'string', title: 'string', kicker: 'string', style: 'string', 'cold-open': 'string', 'cold-open-caption': 'string', trim: 'string' });
      const ctx = loadCtx(o);
      if (ctx.episode.shotPolicy !== undefined) {
        out({ ok: false, problem: 'shot-v1 조립 차단: 실행·출시 승인 결합 경로 미구현' });
        return 1;
      }
      if (ctx.episode.continuesFromEpisode) {
        out({ ok: false, problem: '회차 연결 조립 차단: 승인된 앞 회차 출시/프레임 결합 경로 미구현' });
        return 1;
      }
      const cutIds = optStr(o, 'cuts')?.split(',').map((x) => x.trim()).filter(Boolean);
      const unknown = cutIds?.filter((id) => !ctx.episode.cuts.some((c) => c.id === id)) ?? [];
      if (unknown.length) throw new UsageError(`대본에 없는 컷: ${unknown.join(', ')}`);
      const aspect = optStr(o, 'aspect') ?? '16:9';
      if (!['16:9', '9:16'].includes(aspect)) throw new UsageError('--aspect 는 16:9|9:16');
      const notReady = transcriptReadiness(ctx, loadReports(req(o, 'gates')), cutIds);
      if (notReady.length) {
        out({ ok: false, problem: '받아쓰기 대조를 통과하지 않은 컷이 있어 조립하지 않음', findings: notReady });
        return 1;
      }
      const episode = cutIds ? { ...ctx.episode, cuts: ctx.episode.cuts.filter((c) => cutIds.includes(c.id)) } : ctx.episode;
      const dir = abs(req(o, 'clips'));
      const target = abs(req(o, 'out'));
      const result = assembleEpisode({
        episode,
        clipFiles: Object.fromEntries(episode.cuts.map((c) => [c.id, join(dir, `${c.id}.mp4`)])),
        out: target,
        fontFile: abs(req(o, 'font')),
        workDir: abs(optStr(o, 'work') ?? join(dirname(target), '.assemble')),
        aiLabel: o['no-ai-label'] === true ? null : 'AI로 생성된 영상입니다',
        title: optStr(o, 'title') ?? null,
        kicker: optStr(o, 'kicker') ?? null,
        coldOpen: coldOpen(optStr(o, 'cold-open'), optStr(o, 'cold-open-caption'), dir),
        ...(optStr(o, 'trim') ? { trims: parseTrimSpec(optStr(o, 'trim')!) } : {}),
        ...(optStr(o, 'style') ? { styles: readJson(abs(req(o, 'style'))) as NonNullable<AssembleEpisodeInput['styles']> } : {}),
        ...(aspect === '9:16' ? { layout: 'blur-fill' as const, width: 1080, height: 1920 } : {}),
      });
      out({ ok: true, ...result });
      return 0;
    }

    default:
      throw new UsageError(`알 수 없는 명령: ${cmd ?? '(없음)'} — genres|topic-build|topic-apply|validate|judge-build|judge-apply|approve-line|plan|verify-clip|assemble`);
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  console.error(message);
  out({ ok: false, error: message });
  process.exitCode = e instanceof UsageError ? 2 : 1;
}
