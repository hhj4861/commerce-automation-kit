/**
 * shopshorts 로컬 워커 — 클라우드 큐(shopshorts-cloud)의 실행자.
 *
 * 클라우드(D1)가 단일 진실 소스, 이 데몬은 Mac 에서 결정적 작업만 수행:
 *  1. 하트비트(워커 온라인 표시)
 *  2. 승인건 lint 검증 — 위반 시 draft 자동 반려(+사유) → "lint 게이트" 유지
 *  3. finalize 요청 실행: TTS(Yooni, 기존 음성 재사용) + 동기 조립 → R2 업로드 → assembled
 *  4. 로컬 미리보기/클립 산출물 R2 업로드(클립 생성은 Claude 세션이 로컬 경로로 기록)
 *  5. keyword-intel 핫 키워드 주기 push(30분)
 *
 * 경합 규칙: 서버의 video PUT 이 job.mediaUploaded 를 갱신하므로,
 * 잡을 수정할 때는 **반드시 직전에 GET 으로 다시 읽고** PUT 한다(낡은 사본 덮어쓰기 금지).
 *
 * 실행: node apps/shopshorts/worker.mjs   (환경: kit .env 의 SHOPSHORTS_TOKEN, SHOPSHORTS_CLOUD_URL)
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = resolve(__dirname, '..', '..');
const WORK_DIR = join(__dirname, 'data', 'work');

function kitEnv() {
  const envPath = join(KIT_ROOT, '.env');
  const extra = {};
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
      if (m) extra[m[1]] = m[2];
    }
  }
  return { ...process.env, ...extra };
}

const ENV = kitEnv();
const CLOUD = (ENV.SHOPSHORTS_CLOUD_URL ?? '').replace(/\/$/, '');
const TOKEN = ENV.SHOPSHORTS_TOKEN;
const VOICE_ID = ENV.SHOPSHORTS_VOICE_ID ?? 'n2fbxG88jqAoaVPUy3IG'; // Yooni
if (!CLOUD || !TOKEN) {
  console.error('[worker] SHOPSHORTS_CLOUD_URL / SHOPSHORTS_TOKEN 필요(.env)');
  process.exit(1);
}

const log = (event, extra = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...extra }));

async function api(path, opts = {}) {
  const res = await fetch(`${CLOUD}${path}`, {
    ...opts,
    headers: { authorization: `Bearer ${TOKEN}`, ...(opts.headers ?? {}) },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${data.error ?? text.slice(0, 200)}`);
  return data;
}

function runCli(args, extraEnv = {}) {
  return new Promise((resolveP, rejectP) => {
    const child = spawn('npm', ['run', '--silent', 'cli', ...args], {
      cwd: KIT_ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...ENV, ...extraEnv },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); rejectP(new Error('CLI 타임아웃')); }, 600_000);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => { clearTimeout(timer); rejectP(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      let data = null;
      try { data = JSON.parse(stdout); } catch { /* JSON 아님 */ }
      // 리뷰 확정 결함 수정: exit code 우선 — lint 리포트(JSON, ok:false, exit 1)는 성공 파싱이지만
      // "실행 성공"이지 결과 성공이 아니다. 호출부가 data.ok 를 판단하도록 그대로 넘기되,
      // exit≠0 이면서 JSON 도 아닌 경우만 실패로 던진다.
      if (data !== null) resolveP({ code: code ?? -1, data });
      else if (code === 0) resolveP({ code: 0, data: null });
      else rejectP(new Error(`exit ${code}: ${stderr.slice(-300)}`));
    });
  });
}

async function uploadVideo(id, which, filePath) {
  const buf = await readFile(filePath);
  await api(`/api/jobs/${id}/video?which=${which}`, {
    method: 'PUT',
    headers: { 'content-type': 'video/mp4' },
    body: buf,
  });
  log('upload.done', { id, which, bytes: buf.length });
}

/** 최신 잡을 다시 읽어 patch 를 적용 후 PUT (경합 방지 원칙). */
async function updateJob(id, patch) {
  const { jobs } = await api('/api/jobs');
  const fresh = jobs.find((j) => j.brief.id === id);
  if (!fresh) throw new Error(`잡 소실: ${id}`);
  const next = { ...fresh, ...patch(fresh) };
  await api(`/api/jobs/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-shopshorts-worker': '1' },
    body: JSON.stringify(next),
  });
  return next;
}

// ---------- 작업 핸들러 ----------

async function lintApproved(job) {
  const id = job.brief.id;
  const tmp = join(WORK_DIR, id, 'lint-job.json');
  await mkdir(dirname(tmp), { recursive: true });
  await writeFile(tmp, JSON.stringify({ brief: job.brief, script: job.script }));
  const r = await runCli(['-w', '@cak/shopping-shorts', '--', 'lint', '--job', tmp]);
  if (r.data === null) throw new Error('lint 출력 없음(CLI 크래시)');
  if (r.data.ok === true) {
    await updateJob(id, () => ({ lintChecked: true, lintRequested: false, lintReport: r.data }));
    log('lint.pass', { id });
  } else if (job.status === 'script-approved') {
    await updateJob(id, () => ({
      status: 'draft',
      lintChecked: false,
      lintRequested: false,
      lintReport: r.data,
      note: `자동 반려: lint 위반 ${r.data.findings?.filter((f) => f.severity === 'block').length ?? '?'}건 — 대본 수정 필요`,
    }));
    log('lint.block-revert', { id });
  } else {
    // 재검증 요청(request-lint/set-link)이 draft 등 다른 상태에서 위반이면 상태는 두고 리포트만 갱신
    await updateJob(id, () => ({ lintChecked: false, lintRequested: false, lintReport: r.data }));
    log('lint.block-report', { id, status: job.status });
  }
}

async function runFinalize(stale) {
  const id = stale.brief.id;
  // 리뷰 확정 결함 수정: 실행 직전 최신 상태 재확인 — 반려·역전이된 잡을 과금·조립하지 않는다.
  const { jobs } = await api('/api/jobs');
  const job = jobs.find((j) => j.brief.id === id);
  if (!job || job.status !== 'generated' || job.finalize?.state !== 'requested') {
    log('finalize.skip-stale', { id, status: job?.status, finalize: job?.finalize?.state });
    if (job && job.finalize?.state === 'requested') {
      // generated 가 아닌데 requested 잔류 → 유령 요청 정리
      await updateJob(id, (f) => ({ finalize: { state: 'cancelled', at: new Date().toISOString(), reason: `상태 ${f.status} — 요청 취소` } }));
    }
    return;
  }
  await updateJob(id, () => ({ finalize: { state: 'running', at: new Date().toISOString() } }));
  try {
    const work = join(WORK_DIR, id);
    await mkdir(work, { recursive: true });
    const scriptPath = join(work, 'script.json');
    const jobPath = join(work, 'job.json');
    await writeFile(scriptPath, JSON.stringify(job.script));
    await writeFile(jobPath, JSON.stringify({ brief: job.brief, script: job.script }));
    const voDir = join(work, 'vo');
    const outVideo = join(work, `${id}-final.mp4`);

    if (!Array.isArray(job.clipPaths) || job.clipPaths.length === 0) throw new Error('clipPaths 없음(클립 미생성)');
    for (const c of job.clipPaths) if (!existsSync(c)) throw new Error(`클립 파일 없음: ${c}`);

    // TTS(이미 있으면 재사용 — 중복 과금 방지)
    if (!existsSync(join(voDir, 'narration.json'))) {
      const t = await runCli(['-w', '@cak/tts-narration', '--', 'script', '--script', scriptPath, '--outdir', voDir],
        { ELEVENLABS_VOICE_ID: VOICE_ID });
      if (t.code !== 0) throw new Error(`TTS 실패(exit ${t.code})`);
    }
    // 동기 조립(Vrew 스타일 자막·(광고) 오버레이·faststart) — lint 게이트 내장
    const a = await runCli(['-w', '@cak/shopping-shorts', '--', 'assemble',
      '--job', jobPath, '--clips', job.clipPaths.join(','), '--out', outVideo, '--narration-dir', voDir]);
    if (a.code !== 0 || a.data?.ok !== true) {
      throw new Error(a.data?.refused === 'lint-block' ? 'lint block — 대본 수정 필요' : `조립 실패(exit ${a.code})`);
    }

    await uploadVideo(id, 'final', outVideo);
    // 완료 반영도 최신 상태 조건부 — 조립 사이 사람이 반려했다면 상태를 건드리지 않는다.
    await updateJob(id, (fresh) => {
      if (fresh.status !== 'generated' || fresh.finalize?.state !== 'running') {
        log('finalize.conflict', { id, status: fresh.status });
        return { finalize: { state: 'cancelled', at: new Date().toISOString(), reason: `조립 중 상태 변경(${fresh.status}) — 결과는 업로드됨, 상태는 유지` } };
      }
      return {
        status: 'assembled',
        outputVideo: outVideo,
        finalize: { state: 'done', at: new Date().toISOString(), voice: `Yooni(${VOICE_ID})` },
      };
    });
    log('finalize.done', { id });
  } catch (e) {
    await updateJob(id, () => ({
      finalize: { state: 'error', error: String(e?.message ?? e), at: new Date().toISOString() },
    })).catch(() => {});
    log('finalize.error', { id, error: String(e?.message ?? e) });
  }
}

// ---------- 실제 업로드 (발행 확인 = 사람 게이트 2 통과 → upload-post) ----------

/** 업로드 설명란: 대본 설명 + 제휴 링크 라인(파트너스 고지 블록 앞에 삽입). */
function uploadDescription(job) {
  const base = job.script?.description ?? '';
  const links = Array.isArray(job.affiliateLinks) && job.affiliateLinks.length
    ? job.affiliateLinks
    : (job.brief?.affiliateUrl ? [{ label: '제품 보러가기', url: job.brief.affiliateUrl }] : []);
  if (!links.length) return base;
  const blocks = base.split('\n\n');
  const linkLine = links.map((link) => `🔗 ${link.label}: ${link.url}`).join('\n');
  const i = blocks.findIndex((b) => b.includes('파트너스'));
  if (i >= 0) blocks.splice(i, 0, linkLine);
  else blocks.push(linkLine);
  return blocks.join('\n\n');
}

async function runUpload(stale) {
  const id = stale.brief.id;
  // 실행 직전 최신 상태 재확인 — 역전이·수동 처리된 잡을 업로드하지 않는다
  const { jobs } = await api('/api/jobs');
  const job = jobs.find((j) => j.brief.id === id);
  if (!job || job.status !== 'published' || job.upload?.state !== 'requested') {
    log('publish-upload.skip-stale', { id, status: job?.status, upload: job?.upload?.state });
    return;
  }
  await updateJob(id, (f) => ({ upload: { ...f.upload, state: 'running', at: new Date().toISOString() } }));
  try {
    const video = join(WORK_DIR, id, `${id}-final.mp4`);
    if (!existsSync(video)) throw new Error(`최종 영상 없음: ${video} — 이 워커에서 조립된 잡만 업로드 가능`);
    const platforms = (job.upload.platforms ?? ['youtube', 'instagram']).join(',');
    const r = await runCli(['-w', '@cak/shorts-publish', '--', 'upload',
      '--video', video, '--title', job.script.title, '--platforms', platforms,
      '--desc', uploadDescription(job), '--yt-privacy', 'public']);
    if (r.code === 75) {
      // 네트워크 순단 — requested 로 되돌려 백오프 후 재시도(과금·중복 없음: 접수 실패)
      await updateJob(id, (f) => ({ upload: { ...f.upload, state: 'requested', at: new Date().toISOString(), note: '네트워크 순단 — 재시도 대기' } }));
      throw new Error('transient');
    }
    if (r.data?.ok !== true || !r.data?.requestId) {
      throw new Error(`업로드 접수 실패: ${JSON.stringify(r.data?.body ?? r.data ?? null).slice(0, 200)}`);
    }
    await updateJob(id, () => ({
      publishRef: r.data.requestId,
      upload: { state: 'uploaded', requestId: r.data.requestId, platforms: job.upload.platforms, at: new Date().toISOString() },
    }));
    log('publish-upload.sent', { id, requestId: r.data.requestId });
  } catch (e) {
    const msg = String(e?.message ?? e);
    if (msg !== 'transient') {
      await updateJob(id, () => ({ upload: { state: 'failed', error: msg, at: new Date().toISOString() } })).catch(() => {});
    }
    throw e;
  }
}

async function pollUpload(job) {
  const id = job.brief.id;
  const r = await runCli(['-w', '@cak/shorts-publish', '--', 'poll', '--request-id', job.upload.requestId]);
  if (r.data?.ok !== true) {
    if (r.code === 75) return; // 네트워크 순단 — 다음 틱에 재폴링
    throw new Error(`상태 조회 실패: ${JSON.stringify(r.data ?? null).slice(0, 200)}`);
  }
  const st = r.data.body?.status;
  if (st === 'completed') {
    const results = (r.data.body.results ?? []).map((x) => ({
      platform: x.platform, success: x.success === true,
      url: x.post_url ?? null, error: x.error_message ?? null,
    }));
    const allOk = results.length > 0 && results.every((x) => x.success);
    const errText = results.filter((x) => !x.success).map((x) => `${x.platform}: ${x.error}`).join(' / ');
    await updateJob(id, (f) => ({
      upload: {
        ...f.upload, state: allOk ? 'done' : 'failed', results,
        at: new Date().toISOString(), ...(allOk ? {} : { error: errText }),
      },
    }));
    log('publish-upload.completed', { id, allOk, results: results.map((x) => x.url) });
  } else if (st === 'failed' || st === 'error') {
    await updateJob(id, (f) => ({ upload: { ...f.upload, state: 'failed', error: `업로드 ${st}`, at: new Date().toISOString() } }));
    log('publish-upload.failed', { id, st });
  }
  // pending/processing → 다음 폴링 주기에 재확인
}

// ---------- 소재 리서치: 유튜브 쇼츠 그리드 채움(공식 search.list, 관찰 창 인페이지용) ----------

let lastYtFill = 0;
async function fillYoutubeGrids() {
  if (Date.now() - lastYtFill < 60_000) return; // 1분 주기
  lastYtFill = Date.now();
  if (shouldSkip('global', 'yt-search')) return;
  try {
    const { topics } = await api('/api/keyword-research/missing-youtube');
    for (const topic of (topics ?? []).slice(0, 3)) {
      const r = await runCli(['-w', '@cak/youtube-upload', '--', 'search', '--query', topic, '--max', '9']);
      if (r.data?.ok !== true || !Array.isArray(r.data.items)) {
        throw new Error(`search 실패: ${JSON.stringify(r.data?.problems ?? null).slice(0, 120)}`);
      }
      await api('/api/keyword-research', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-shopshorts-worker': '1' },
        body: JSON.stringify({ topic, youtube: r.data.items }),
      });
      log('yt-grid.filled', { topic, count: r.data.items.length });
    }
    clearFailure('global', 'yt-search');
  } catch (e) {
    // 인증 만료(invalid_grant)·키 미설정 등 — 백오프로 조용히 대기(관찰 창은 팝업 버튼으로 동작 지속)
    recordFailure('global', 'yt-search');
    log('yt-grid.error', { error: String(e?.message ?? e).slice(0, 160) });
  }
}

// ---------- 메인 루프 ----------

let busy = false;
// 리뷰 확정 결함 수정: 잡별 실패 격리 + 백오프 — 한 잡의 반복 실패가 큐 전체를 막지 않게
const failures = new Map(); // key: `${id}:${action}` → { count, until }
const lastPoll = new Map(); // 업로드 상태 폴링 주기 제한

function shouldSkip(id, action) {
  const f = failures.get(`${id}:${action}`);
  return f !== undefined && Date.now() < f.until;
}
function recordFailure(id, action) {
  const key = `${id}:${action}`;
  const f = failures.get(key) ?? { count: 0, until: 0 };
  f.count += 1;
  f.until = Date.now() + Math.min(f.count * 60_000, 15 * 60_000); // 1분→15분 상한 백오프
  failures.set(key, f);
  return f.count;
}
function clearFailure(id, action) {
  failures.delete(`${id}:${action}`);
}

async function handleJob(job) {
  const id = job.brief.id;
  if ((job.status === 'script-approved' && job.lintChecked !== true) || job.lintRequested === true) {
    if (shouldSkip(id, 'lint')) return;
    try { await lintApproved(job); clearFailure(id, 'lint'); }
    catch (e) {
      const n = recordFailure(id, 'lint');
      log('lint.error', { id, attempt: n, error: String(e?.message ?? e) });
      if (n >= 3) await updateJob(id, () => ({ note: `워커 lint 실행 실패 ${n}회 — 로그 확인 필요` })).catch(() => {});
    }
    return;
  }
  if (job.finalize?.state === 'requested') {
    if (shouldSkip(id, 'finalize')) return;
    try { await runFinalize(job); clearFailure(id, 'finalize'); }
    catch (e) { recordFailure(id, 'finalize'); log('finalize.outer-error', { id, error: String(e?.message ?? e) }); }
    return;
  }
  if (job.status === 'published' && job.upload?.state === 'requested') {
    if (shouldSkip(id, 'publish-upload')) return;
    try { await runUpload(job); clearFailure(id, 'publish-upload'); }
    catch (e) { recordFailure(id, 'publish-upload'); log('publish-upload.error', { id, error: String(e?.message ?? e) }); }
    return;
  }
  if (job.status === 'published' && job.upload?.state === 'uploaded') {
    if (Date.now() - (lastPoll.get(id) ?? 0) < 20_000) return; // 20초 주기 폴링
    lastPoll.set(id, Date.now());
    try { await pollUpload(job); }
    catch (e) { log('publish-poll.error', { id, error: String(e?.message ?? e) }); }
    return;
  }
  if (job.previewVideo && existsSync(job.previewVideo) && !job.mediaUploaded?.preview && !shouldSkip(id, 'up-preview')) {
    try { await uploadVideo(id, 'preview', job.previewVideo); clearFailure(id, 'up-preview'); }
    catch (e) { recordFailure(id, 'up-preview'); log('upload.error', { id, which: 'preview', error: String(e?.message ?? e) }); }
  }
  if (job.outputVideo && existsSync(job.outputVideo) && !job.mediaUploaded?.final && !shouldSkip(id, 'up-final')) {
    try { await uploadVideo(id, 'final', job.outputVideo); clearFailure(id, 'up-final'); }
    catch (e) { recordFailure(id, 'up-final'); log('upload.error', { id, which: 'final', error: String(e?.message ?? e) }); }
  }
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    await api('/api/worker-heartbeat', { method: 'PUT' }).catch(() => {});
    const { jobs } = await api('/api/jobs');
    for (const job of jobs) {
      await handleJob(job); // 잡별 예외는 handleJob 내부에서 격리
    }
    await fillYoutubeGrids();
  } catch (e) {
    log('tick.error', { error: String(e?.message ?? e) });
  } finally {
    busy = false;
  }
}

/** 기동 시 회복: 이전 워커가 running 중 죽어 낀 잡을 error 로 풀어준다(재요청 가능하게). */
async function recoverStuck() {
  try {
    const { jobs } = await api('/api/jobs');
    for (const job of jobs) {
      if (job.finalize?.state === 'running') {
        await updateJob(job.brief.id, () => ({
          finalize: { state: 'error', error: '워커 중단으로 조립이 끊김 — 다시 요청하세요', at: new Date().toISOString() },
        }));
        log('recover.stuck-finalize', { id: job.brief.id });
      }
      if (job.upload?.state === 'running') {
        // 접수 전 중단이면 미전송 — 재요청 가능하게 실패로 풀어준다(uploaded 부터는 poll 이 이어받음)
        await updateJob(job.brief.id, () => ({
          upload: { state: 'failed', error: '워커 중단으로 업로드가 끊김 — 업로드 재시도를 눌러주세요', at: new Date().toISOString() },
        }));
        log('recover.stuck-upload', { id: job.brief.id });
      }
    }
  } catch (e) {
    log('recover.error', { error: String(e?.message ?? e) });
  }
}

log('worker.start', { cloud: CLOUD });
await recoverStuck();
setInterval(tick, 5000);
tick();
