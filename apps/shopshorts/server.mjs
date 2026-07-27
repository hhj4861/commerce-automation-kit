/**
 * shopshorts 대시보드 서버 — 원자 조합 계층(로컬 전용, 외부 바인딩 없음).
 *
 * 역할: 잡 큐(jobs.json 단일소스) 상태 관리 + 사람 게이트 UI 제공 + 원자 CLI 트리거.
 * 원자 로직을 재구현하지 않는다 — lint/estimate/assemble 은 전부
 * `@cak/shopping-shorts` CLI 를 spawn 해서 결과(JSON stdout)를 그대로 중계한다.
 *
 * 사람 게이트(우회 경로 없음):
 *  - draft → script-approved : lint ok + UI 버튼(사람)      [게이트 1: 기획 승인]
 *  - review → published      : lint ok 재검증 + UI 버튼(사람) [게이트 2: 발행 검수]
 * 서버는 발행(업로드)을 직접 하지 않는다 — 업로드는 shorts-publish CLI/스킬로 사람이 실행,
 * 대시보드는 그 결과(requestId)를 기록할 뿐이다. (완전 무인화 금지 — 저관여+사람 감시)
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = resolve(__dirname, '..', '..');
const DATA_DIR = join(__dirname, 'data');
const JOBS_PATH = join(DATA_DIR, 'jobs.json');
const PORT = Number(process.env.SHOPSHORTS_PORT ?? 5178);

const STATUSES = [
  'draft',
  'script-approved',
  'generated',
  'assembled',
  'review',
  'published',
  'rejected',
];

/** 허용 전이 — 사람 게이트·순서를 서버가 강제한다. */
const TRANSITIONS = {
  draft: ['script-approved', 'rejected'],
  'script-approved': ['generated', 'rejected'],
  generated: ['assembled', 'rejected'],
  assembled: ['review', 'rejected'],
  review: ['published', 'rejected'],
  rejected: ['draft'],
  published: [],
};

// ---------- 저장소 (jobs.json 단일소스) ----------

function loadJobs() {
  if (!existsSync(JOBS_PATH)) return [];
  try {
    const parsed = JSON.parse(readFileSync(JOBS_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // 손상 파일은 덮어쓰지 않고 명시적으로 실패시킨다(운영 데이터 보호).
    throw new Error(`jobs.json 이 손상됨 — 수동 확인 필요: ${JOBS_PATH}`);
  }
}

function saveJobs(jobs) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(JOBS_PATH, JSON.stringify(jobs, null, 1), 'utf8');
}

// ---------- 원자 CLI 브릿지 ----------

/** @cak/shopping-shorts CLI 실행 — stdout JSON 을 그대로 반환(원자 로직 재구현 금지). */
function runAtomCli(args, timeoutMs = 300_000) {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(
      'npm',
      ['run', '--silent', 'cli', '-w', '@cak/shopping-shorts', '--', ...args],
      { cwd: KIT_ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectP(new Error(`원자 CLI 타임아웃(${timeoutMs}ms)`));
    }, timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      rejectP(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        resolveP({ code: code ?? -1, data: JSON.parse(stdout) });
      } catch {
        rejectP(new Error(`원자 CLI 출력이 JSON 이 아님(exit ${code}): ${stderr.slice(-300)}`));
      }
    });
  });
}

/** 잡을 임시 파일로 떨궈 원자 CLI 에 넘긴다. */
function withJobFile(job, fn) {
  const p = join(tmpdir(), `shopshorts-job-${job.brief.id}-${Date.now()}.json`);
  writeFileSync(p, JSON.stringify({ brief: job.brief, script: job.script }), 'utf8');
  return fn(p);
}

// ---------- HTTP ----------

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data, null, 1));
}

function readBody(req) {
  return new Promise((resolveP, rejectP) => {
    let body = '';
    req.on('data', (d) => {
      body += d;
      if (body.length > 5_000_000) rejectP(new Error('본문이 너무 큼'));
    });
    req.on('end', () => {
      try {
        resolveP(body.length > 0 ? JSON.parse(body) : {});
      } catch {
        rejectP(new Error('본문이 JSON 이 아님'));
      }
    });
  });
}

function findJob(jobs, id) {
  return jobs.find((j) => j.brief?.id === id);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  try {
    // 정적 UI
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(readFileSync(join(__dirname, 'public', 'index.html')));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/jobs') {
      json(res, 200, { jobs: loadJobs(), statuses: STATUSES });
      return;
    }

    // 잡 등록(스킬이 초안을 밀어넣는 입구) — draft 로만 들어온다.
    if (req.method === 'POST' && url.pathname === '/api/jobs') {
      const body = await readBody(req);
      if (!body.brief?.id || !body.script) {
        json(res, 400, { error: 'brief/script 필수' });
        return;
      }
      const jobs = loadJobs();
      if (findJob(jobs, body.brief.id)) {
        json(res, 409, { error: `이미 존재하는 잡: ${body.brief.id}` });
        return;
      }
      const job = {
        brief: body.brief,
        script: body.script,
        status: 'draft',
        updatedAt: new Date().toISOString(),
      };
      // 등록 시점에 lint 를 즉시 실행해 카드에 리포트를 붙인다(참고용 — 게이트는 전이 시 재검증).
      try {
        job.lintReport = (await withJobFile(job, (p) => runAtomCli(['lint', '--job', p]))).data;
      } catch (e) {
        job.lintReport = { ok: false, findings: [], error: String(e.message ?? e) };
      }
      jobs.push(job);
      saveJobs(jobs);
      json(res, 201, { ok: true, job });
      return;
    }

    // 상태 전이(사람 게이트) — /api/jobs/:id/transition {to, note?, clipPaths?, outputVideo?, publishRef?}
    const m = url.pathname.match(/^\/api\/jobs\/([a-z0-9-]+)\/(transition|lint|estimate)$/);
    if (m && req.method === 'POST') {
      const [, id, action] = m;
      const jobs = loadJobs();
      const job = findJob(jobs, id);
      if (!job) {
        json(res, 404, { error: `잡 없음: ${id}` });
        return;
      }

      if (action === 'lint') {
        const r = await withJobFile(job, (p) => runAtomCli(['lint', '--job', p]));
        job.lintReport = r.data;
        job.updatedAt = new Date().toISOString();
        saveJobs(jobs);
        json(res, 200, r.data);
        return;
      }

      if (action === 'estimate') {
        const model = url.searchParams.get('model') ?? 'kling3_0-pro';
        const r = await withJobFile(job, (p) => runAtomCli(['estimate', '--job', p, '--model', model]));
        json(res, 200, r.data);
        return;
      }

      // transition
      const body = await readBody(req);
      const to = body.to;
      const allowed = TRANSITIONS[job.status] ?? [];
      if (!allowed.includes(to)) {
        json(res, 400, { error: `전이 불가: ${job.status} → ${to} (허용: ${allowed.join(', ') || '없음'})` });
        return;
      }

      // 게이트 1·2: 승인/발행 전이는 lint ok 를 그 자리에서 재검증한다(캐시 신뢰 안 함).
      if (to === 'script-approved' || to === 'published') {
        const r = await withJobFile(job, (p) => runAtomCli(['lint', '--job', p]));
        job.lintReport = r.data;
        if (r.data.ok !== true) {
          saveJobs(jobs);
          json(res, 422, { error: 'lint block — 전이 거부', report: r.data });
          return;
        }
      }
      // 발행 검수 진입 시 조립 산출물이 있어야 한다.
      if (to === 'review' && !body.outputVideo && !job.outputVideo) {
        json(res, 422, { error: 'outputVideo 없이 review 로 갈 수 없음(조립 먼저)' });
        return;
      }

      job.status = to;
      if (typeof body.note === 'string' && body.note.length > 0) job.note = body.note;
      if (Array.isArray(body.clipPaths)) job.clipPaths = body.clipPaths;
      if (typeof body.outputVideo === 'string') job.outputVideo = body.outputVideo;
      if (typeof body.publishRef === 'string') job.publishRef = body.publishRef;
      job.updatedAt = new Date().toISOString();
      saveJobs(jobs);
      json(res, 200, { ok: true, job });
      return;
    }

    json(res, 404, { error: 'not found' });
  } catch (e) {
    json(res, 500, { error: String(e?.message ?? e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[shopshorts] http://127.0.0.1:${PORT} (로컬 전용, jobs=${JOBS_PATH})`);
});
