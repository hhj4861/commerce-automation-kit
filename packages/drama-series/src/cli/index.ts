/**
 * drama-series CLI — 판단 없는 검사·명세·조립. 외부 호출(JEV·힉스필드)은 하지 않는다.
 *
 *   genres
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
import { parseTrimSpec } from '../core/assemble-args.js';
import { joinSimilarity } from '../adapters/ffmpeg.js';
import { JOIN_MIN_SSIM, chainsFrom, judgeJoin } from '../core/join.js';

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
  mkdirSync(dirname(abs(p)), { recursive: true });
  writeFileSync(abs(p), JSON.stringify(v, null, 2) + '\n');
}
const out = (v: unknown) => console.log(JSON.stringify(v, null, 2));
const metaPath = (p: string) => `${p.replace(/\.json$/, '')}.meta.json`;

function opts(rest: string[], names: Record<string, 'string' | 'boolean'>): Opts {
  const options = Object.fromEntries(Object.entries(names).map(([k, type]) => [k, { type }]));
  try {
    return parseArgs({ args: rest, options, allowPositionals: false }).values as Opts;
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

function loadCtx(o: Opts): GateContext {
  const series = parseSeries(readJson(req(o, 'series')));
  const episode = parseEpisode(readJson(req(o, 'episode')));
  return { series, episode, genre: loadGenre(series.genreId) };
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
function writeRequest(target: string, kind: JudgeRequestMeta['kind'], fingerprint: string, state: Record<string, unknown>, questions: JudgeQuestion[]): void {
  writeJson(target, buildJevRequest(state, questions));
  const meta: JudgeRequestMeta = { kind, fingerprint, questions: questions.map((q) => ({ id: q.id, type: q.type })), createdAt: new Date().toISOString() };
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
      const o = opts(rest, { series: 'string', episode: 'string', gates: 'string' });
      const gates = req(o, 'gates');
      const reports = runEpisodeGates(loadCtx(o));
      for (const r of reports) saveReport(gates, r);
      const ok = reports.every((r) => r.ok);
      out({ ok, reports });
      return ok ? 0 : 1;
    }

    case 'judge-build': {
      const o = opts(rest, { kind: 'string', series: 'string', episode: 'string', out: 'string' });
      const kind = kindOf(req(o, 'kind'));
      const target = req(o, 'out');
      const ctx = loadCtx(o);
      const questions = buildQuestions(kind, ctx);
      if (!questions.length) {
        out({ ok: true, kind, questions: 0, note: '판정할 질문 없음(모든 대사가 이미 검증·승인됨)' });
        return 0;
      }
      writeRequest(target, kind, fingerprintOf(ctx.series, ctx.episode), judgeState(ctx), questions);
      out({ ok: true, kind, questions: questions.length, out: abs(target), meta: abs(metaPath(target)) });
      return 0;
    }

    case 'judge-apply': {
      const o = opts(rest, { kind: 'string', series: 'string', episode: 'string', request: 'string', response: 'string', gates: 'string', 'episode-out': 'string' });
      const kind = kindOf(req(o, 'kind'));
      const gates = req(o, 'gates');
      const ctx = loadCtx(o);
      const meta = readMeta(req(o, 'request'), kind);
      if (meta.fingerprint !== fingerprintOf(ctx.series, ctx.episode)) {
        out({ ok: false, problem: '판정 요청 이후 대본이 바뀜 — judge-build 부터 다시 실행' });
        return 1;
      }
      const verdicts = parseJevResponse(readJson(req(o, 'response')), meta.questions);
      const { report, episode } = applyVerdicts(kind, ctx, meta.questions, verdicts, basename(req(o, 'response')), new Date().toISOString());
      saveReport(gates, report);
      if (kind === 'dialogue') writeJson(optStr(o, 'episode-out') ?? req(o, 'episode'), episode);
      const verifiedLines = episode.cuts.flatMap((c) => c.lines).filter((l) => l.verification.status === 'verified').length;
      out({ ok: report.ok, report, ...(kind === 'dialogue' ? { verifiedLines } : {}) });
      return report.ok ? 0 : 1;
    }

    case 'approve-line': {
      const o = opts(rest, { episode: 'string', cut: 'string', line: 'string', by: 'string', note: 'string' });
      const path = req(o, 'episode');
      const episode = parseEpisode(readJson(path));
      const i = Number(req(o, 'line'));
      const cut = episode.cuts.find((c) => c.id === req(o, 'cut'));
      const line = Number.isInteger(i) ? cut?.lines[i] : undefined;
      if (!cut || !line) throw new UsageError('해당 컷·대사 없음');
      if (isLineCleared(cut, line)) {
        out({ ok: false, problem: `이미 ${line.verification.status} 상태인 대사는 승인할 수 없음` });
        return 1;
      }
      line.verification = { status: 'human-approved', approvedBy: req(o, 'by'), at: new Date().toISOString(), note: req(o, 'note'), lineHash: lineHash(cut, line) };
      writeJson(path, episode);
      out({ ok: true, cut: cut.id, line: i, text: line.text });
      return 0;
    }

    case 'plan': {
      const o = opts(rest, { series: 'string', episode: 'string', gates: 'string', budget: 'string', resolution: 'string', draft: 'boolean', aspect: 'string', out: 'string' });
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
      const o = opts(rest, { series: 'string', episode: 'string', cut: 'string', gates: 'string', transcript: 'string', media: 'string', work: 'string' });
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
      const o = opts(rest, { series: 'string', episode: 'string', clips: 'string', min: 'string' });
      const ctx = loadCtx(o);
      const dir = abs(req(o, 'clips'));
      const min = optStr(o, 'min') ? Number(optStr(o, 'min')) : JOIN_MIN_SSIM;
      type Join = { prev: string; cut: string; ssim: number | null; finding: DramaFinding | null };
      const joins = ctx.episode.cuts.flatMap((cut, i): Join[] => {
        const prev = ctx.episode.cuts[i - 1];
        if (!prev || !chainsFrom(prev, cut)) return [];
        const a = join(dir, `${prev.id}.mp4`);
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
      const o = opts(rest, { series: 'string', episode: 'string', gates: 'string', clips: 'string', out: 'string', font: 'string', work: 'string', 'no-ai-label': 'boolean', cuts: 'string', aspect: 'string', title: 'string', kicker: 'string', style: 'string', 'cold-open': 'string', 'cold-open-caption': 'string', trim: 'string' });
      const ctx = loadCtx(o);
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
