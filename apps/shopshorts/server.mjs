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
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = resolve(__dirname, '..', '..');
const DATA_DIR = join(__dirname, 'data');
const JOBS_PATH = join(DATA_DIR, 'jobs.json');
const DRAFT_REQ_PATH = join(DATA_DIR, 'draft-requests.json');
const PORT = Number(process.env.SHOPSHORTS_PORT ?? 5178);
/**
 * 조립(finalize) 내레이션 보이스 — Yooni(Natural & Clear, 사용자 청음 선택 2026-07-28).
 * ElevenLabs 공유 보이스라 계정에 1회 추가돼 있어야 한다(voice add — 미추가 시 TTS 400).
 * hanmadi/tts-narration 의 기본(Claire)은 건드리지 않고 이 파이프라인에서만 재정의.
 */
const FINALIZE_VOICE_ID = process.env.SHOPSHORTS_VOICE_ID ?? 'n2fbxG88jqAoaVPUy3IG';

/** kit .env 파싱(값 로그 금지) — tts-narration spawn 에 ELEVENLABS_API_KEY 전달용. */
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
// 전방(파이프라인 진행) + 역방향(사람 되돌리기 — published 포함, 기록 정정용)
const TRANSITIONS = {
  draft: ['script-approved', 'rejected'],
  'script-approved': ['generated', 'rejected', 'draft'],
  generated: ['assembled', 'rejected', 'script-approved'],
  assembled: ['review', 'rejected', 'generated'],
  review: ['published', 'rejected', 'assembled'],
  rejected: ['draft'],
  published: ['review'],
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

// ---------- 초안 요청 큐 (콘텐츠 유형 확장형) ----------
// contentType: 'shorts'(활성) | 'ad' | 'blog' | 'music' (예약 — 각 원자 파이프라인 연결 시 활성화)
const CONTENT_TYPES = ['shorts', 'ad', 'blog', 'music'];

function loadDraftRequests() {
  if (!existsSync(DRAFT_REQ_PATH)) return [];
  try {
    return JSON.parse(readFileSync(DRAFT_REQ_PATH, 'utf8'));
  } catch {
    return [];
  }
}
function saveDraftRequests(rows) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DRAFT_REQ_PATH, JSON.stringify(rows, null, 1), 'utf8');
}

// ---------- 소재 리서치 저장소 (현지 검색어 변환 캐시 — 검색어 문자열만) ----------
const RESEARCH_PATH = join(DATA_DIR, 'keyword-research.json');
function loadResearch() {
  if (!existsSync(RESEARCH_PATH)) return {};
  try { return JSON.parse(readFileSync(RESEARCH_PATH, 'utf8')); } catch { return {}; }
}
function saveResearch(rows) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(RESEARCH_PATH, JSON.stringify(rows, null, 1), 'utf8');
}

// ---------- 핫 키워드 (keyword-intel 연동, 10분 캐시) ----------
let hotCache = { at: 0, items: [] };

function runKeywordIntel() {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(
      'npm',
      ['run', '--silent', 'analyze', '-w', '@cak/keyword-intel', '--', '--top', '20', '--json'],
      { cwd: KIT_ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); rejectP(new Error('keyword-intel 타임아웃')); }, 60_000);
    child.stdout.on('data', (d) => (stdout += d));
    child.on('error', (e) => { clearTimeout(timer); rejectP(e); });
    child.on('close', () => {
      clearTimeout(timer);
      try { resolveP(JSON.parse(stdout)); } catch { rejectP(new Error('keyword-intel 출력 파싱 실패')); }
    });
  });
}

async function getHotKeywords() {
  const now = Date.now();
  if (now - hotCache.at < 10 * 60_000 && hotCache.items.length > 0) return hotCache.items;
  const data = await runKeywordIntel();
  const jobs = loadJobs();
  const requests = loadDraftRequests();
  const taken = new Set([
    ...jobs.map((j) => (j.brief?.keyword ?? '').replace(/\s+/g, '')),
    ...requests.map((r) => (r.topic ?? '').replace(/\s+/g, '')),
  ]);
  // 스코어는 참고 지표 — 여기서는 "표시"만 하고, 발행(초안 요청)은 사람 버튼이 결정한다.
  const items = (data.items ?? [])
    .filter((it) => !taken.has(it.topic.replace(/\s+/g, '')))
    .slice(0, 3)
    .map((it) => ({ topic: it.topic, opportunity: it.opportunity }));
  hotCache = { at: now, items };
  return items;
}

// ---------- 자막+TTS 조립 (deterministic — 원자 CLI 조합, 바쿠치올 클립과 동일 스타일/보이스) ----------

function runCli(cmd, args, opts = {}) {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(cmd, args, { cwd: KIT_ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: opts.env ?? process.env });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); rejectP(new Error(`${args[0] ?? cmd} 타임아웃`)); }, opts.timeoutMs ?? 300_000);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => { clearTimeout(timer); rejectP(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolveP({ stdout, stderr });
      else rejectP(new Error(`exit ${code}: ${stderr.slice(-400)}`));
    });
  });
}

/** generated 상태 잡에 Claire TTS(정렬) + 자막·고지 번인 조립. 완료 시 assembled 로 전이. */
async function finalizeJob(id) {
  const jobs = loadJobs();
  const job = findJob(jobs, id);
  if (!job) throw new Error(`잡 없음: ${id}`);
  if (job.status !== 'generated') throw new Error(`generated 상태에서만 조립 가능(현재 ${job.status})`);
  if (!Array.isArray(job.clipPaths) || job.clipPaths.length === 0) throw new Error('clipPaths 없음');

  const work = join(DATA_DIR, 'work', id);
  mkdirSync(work, { recursive: true });
  const scriptPath = join(work, 'script.json');
  const jobPath = join(work, 'job.json');
  writeFileSync(scriptPath, JSON.stringify(job.script), 'utf8');
  writeFileSync(jobPath, JSON.stringify({ brief: job.brief, script: job.script }), 'utf8');
  const voDir = join(work, 'vo');
  const voFull = join(voDir, 'full.mp3');
  const outVideo = join(work, `${id}-final.mp4`);

  // ① 내레이션 — 보이스: Yooni(FINALIZE_VOICE_ID). 이미 생성돼 있으면 재사용(중복 과금 방지)
  if (!existsSync(join(voDir, 'narration.json'))) {
    await runCli('npm', ['run', '--silent', 'cli', '-w', '@cak/tts-narration', '--', 'script',
      '--script', scriptPath, '--outdir', voDir],
      { env: { ...kitEnv(), ELEVENLABS_VOICE_ID: FINALIZE_VOICE_ID } });
  }
  // ② 동기 조립(Vrew 스타일) — 내레이션 길이에 영상·자막 동기, 내레이션 전문 자막(중앙·나눔펜),
  //    고지 오버레이, faststart. lint 게이트 내장.
  await runCli('npm', ['run', '--silent', 'cli', '-w', '@cak/shopping-shorts', '--', 'assemble',
    '--job', jobPath, '--clips', job.clipPaths.join(','), '--out', outVideo, '--narration-dir', voDir]);

  const fresh = loadJobs();
  const j2 = findJob(fresh, id);
  j2.outputVideo = outVideo;
  j2.status = 'assembled';
  j2.finalize = { state: 'done', at: new Date().toISOString(), voice: `Yooni(${FINALIZE_VOICE_ID})` };
  j2.updatedAt = new Date().toISOString();
  saveJobs(fresh);
  return j2;
}

// ---------- 제휴 링크 관리 ----------
// 수동 입력(허용 도메인 검증) + 쿠팡 딥링크 API 자동 변환(파트너스 키 있을 때만).
// 네이버 쇼핑커넥트는 공식 API 부재(2026-07-28 실측) — 발급 페이지 바로가기 + 수동 입력만.

const LINK_PLATFORMS = {
  coupang: { hosts: ['link.coupang.com', 'www.coupang.com', 'coupa.ng'], label: '쿠팡 파트너스' },
  naverConnect: { hosts: ['naver.me', 'shopping.naver.com', 'smartstore.naver.com', 'brand.naver.com'], label: '네이버 쇼핑커넥트' },
};

function affiliateDisclosure(platform) {
  return platform === 'coupang'
    ? '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.'
    : '이 링크를 통한 구매 시 일정액의 수수료를 제공받을 수 있습니다.';
}

function readAffiliateLinks(job) {
  if (Array.isArray(job.affiliateLinks) && job.affiliateLinks.length > 0) {
    return job.affiliateLinks.filter((link) => link?.id && link?.platform && link?.url);
  }
  const url = job.brief?.affiliateUrl;
  if (!url || isPlaceholderLink(url)) return [];
  const platform = Object.entries(job.platformLinks ?? {}).find(([, value]) => value === url)?.[0]
    ?? (/coupang|coupa\.ng/.test(url) ? 'coupang' : 'naverConnect');
  return [{ id: `legacy-${platform}`, platform, label: LINK_PLATFORMS[platform]?.label ?? '제품 보러가기', url, primary: true }];
}

function buildAffiliateComment(links) {
  if (!links.length) return '';
  const rows = links.map((link) => `- ${link.label}: ${link.url}`).join('\n');
  const disclosures = [...new Set(links.map((link) => affiliateDisclosure(link.platform)))];
  return `제품 구매 링크\n${rows}\n\n${disclosures.join('\n')}`;
}

function syncDescriptionDisclosures(job, links) {
  const known = new Set(Object.keys(LINK_PLATFORMS).map(affiliateDisclosure));
  const description = String(job.script?.description ?? '')
    .split('\n')
    .filter((line) => !known.has(line.trim()))
    .join('\n')
    .trimEnd();
  const disclosures = [...new Set(links.map((link) => affiliateDisclosure(link.platform)))];
  job.script ??= {};
  job.script.description = `${description}${description && disclosures.length ? '\n\n' : ''}${disclosures.join('\n')}`;
}

function syncAffiliateState(job, links) {
  const primaryId = links.find((link) => link.primary === true)?.id ?? links[0]?.id;
  const normalized = links.map((link) => ({ ...link, primary: link.id === primaryId }));
  const primary = normalized.find((link) => link.primary) ?? normalized[0] ?? null;
  job.affiliateLinks = normalized;
  job.brief.affiliateUrl = primary?.url ?? '';
  job.platformLinks = {};
  for (const link of normalized) job.platformLinks[link.platform] ??= link.url;
  job.affiliateComment = buildAffiliateComment(normalized);
  syncDescriptionDisclosures(job, normalized);
  return normalized;
}

function validateAffiliateUrl(platform, urlStr) {
  const p = LINK_PLATFORMS[platform];
  if (!p) throw new Error(`platform 은 ${Object.keys(LINK_PLATFORMS).join('|')}`);
  let u;
  try { u = new URL(urlStr); } catch { throw new Error('URL 형식이 아님'); }
  if (u.protocol !== 'https:') throw new Error('https 링크만 허용');
  if (!p.hosts.some((h) => u.hostname === h || u.hostname.endsWith('.' + h))) {
    throw new Error(`${p.label} 도메인이 아님 (허용: ${p.hosts.join(', ')})`);
  }
  return u.toString();
}

/**
 * 쿠팡 파트너스 딥링크 변환 — 공식 Open API (HMAC-SHA256 CEA 서명).
 * 활성화 요건: 파트너스 승인 + 누적 실적 후 발급되는 COUPANG_ACCESS_KEY/COUPANG_SECRET_KEY (.env).
 * TODO(D1): 요율 제한·약관 상세는 developers.coupangcorp.com 원문 재확인(임계 사용 전).
 */
async function coupangDeeplink(productUrl) {
  const env = kitEnv();
  const accessKey = env.COUPANG_ACCESS_KEY;
  const secretKey = env.COUPANG_SECRET_KEY;
  if (!accessKey || !secretKey) {
    const err = new Error('쿠팡 파트너스 API 키 없음 — .env 에 COUPANG_ACCESS_KEY/COUPANG_SECRET_KEY 필요(활성화 요건: 파트너스 누적 실적 15만원+)');
    err.code = 'NO_KEYS';
    throw err;
  }
  const { createHmac } = await import('node:crypto');
  const method = 'POST';
  const path = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  // CEA signed-date 포맷: yyMMdd'T'HHmmss'Z' (UTC)
  const datetime = `${String(now.getUTCFullYear()).slice(2)}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const message = datetime + method + path;
  const signature = createHmac('sha256', secretKey).update(message).digest('hex');
  const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
  const resp = await fetch(`https://api-gateway.coupang.com${path}`, {
    method,
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({ coupangUrls: [productUrl] }),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`딥링크 API ${resp.status}: ${JSON.stringify(body).slice(0, 200)}`);
  const link = body?.data?.[0]?.shortenUrl ?? body?.data?.[0]?.landingUrl;
  if (!link) throw new Error(`딥링크 응답에 링크 없음: ${JSON.stringify(body).slice(0, 200)}`);
  return link;
}

/** 잡에 기록된 파일만 스트리밍(임의 경로 차단). Range 지원 — <video> 시킹용. */
function serveJobVideo(req, res, job, which) {
  let path = null;
  if (which === 'final') path = job.outputVideo ?? null;
  else if (which === 'preview') path = job.previewVideo ?? job.outputVideo ?? null;
  else if (/^clip\d+$/.test(which)) path = job.clipPaths?.[Number(which.slice(4))] ?? null;
  if (!path || !existsSync(path)) {
    json(res, 404, { error: `영상 파일 없음(${which})` });
    return;
  }
  const size = statSync(path).size;
  const range = req.headers.range;
  if (range) {
    const m = range.match(/bytes=(\d+)-(\d*)/);
    const start = m ? Number(m[1]) : 0;
    const end = m && m[2] ? Number(m[2]) : size - 1;
    res.writeHead(206, {
      'content-range': `bytes ${start}-${end}/${size}`,
      'accept-ranges': 'bytes',
      'content-length': end - start + 1,
      'content-type': 'video/mp4',
    });
    const rs = createReadStream(path, { start, end });
    rs.on('error', () => res.destroy());
    rs.pipe(res);
  } else {
    res.writeHead(200, { 'content-length': size, 'content-type': 'video/mp4', 'accept-ranges': 'bytes' });
    const rs = createReadStream(path);
    rs.on('error', () => res.destroy());
    rs.pipe(res);
  }
}

// 원격 접속 토큰(Cloudflare Tunnel 경유용) — .env SHOPSHORTS_TOKEN.
// 로컬(127.0.0.1/localhost Host)은 무인증 유지, 터널 호스트로 들어온 요청만 토큰 요구.
const REMOTE_TOKEN = kitEnv().SHOPSHORTS_TOKEN ?? null;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  try {
    const host = req.headers.host ?? '';
    const isLocal = host.startsWith('127.0.0.1') || host.startsWith('localhost');
    if (!isLocal) {
      if (!REMOTE_TOKEN) { res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }); res.end('원격 접속 비활성(SHOPSHORTS_TOKEN 미설정)'); return; }
      const q = url.searchParams.get('token');
      if (q === REMOTE_TOKEN) {
        res.writeHead(302, {
          'set-cookie': `ss=${REMOTE_TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
          location: url.pathname,
        });
        res.end();
        return;
      }
      const cookie = /(?:^|;\s*)ss=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
      if (cookie !== REMOTE_TOKEN) {
        res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('인증 필요 — 발급받은 ?token= 링크로 접속하세요');
        return;
      }
    }
    // 정적 UI
    const appPages = ['/', '/index.html', '/contents', '/trends', '/blog', '/performance', '/affiliate-links', '/settings'];
    if (req.method === 'GET' && appPages.includes(url.pathname)) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(readFileSync(join(__dirname, 'public', 'index.html')));
      return;
    }
    // 개편 전 UI — 전환 직후 비교·롤백 확인용.
    if (req.method === 'GET' && (url.pathname === '/legacy' || url.pathname === '/legacy.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(readFileSync(join(__dirname, 'public', 'legacy.html')));
      return;
    }
    // 과거 검토 링크 호환.
    if (req.method === 'GET' && (url.pathname === '/design-proposal' || url.pathname === '/design-proposal.html')) {
      res.writeHead(302, { location: '/' });
      res.end();
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/jobs') {
      json(res, 200, { jobs: loadJobs(), statuses: STATUSES });
      return;
    }

    // 핫 키워드 TOP3 (keyword-intel — 스코어는 참고 지표, 발행 결정은 사람 버튼)
    if (req.method === 'GET' && url.pathname === '/api/hot-keywords') {
      try {
        json(res, 200, { items: await getHotKeywords(), requests: loadDraftRequests() });
      } catch (e) {
        json(res, 200, { items: [], requests: loadDraftRequests(), error: String(e?.message ?? e) });
      }
      return;
    }

    // ---- 소재 리서치: 현지 검색어 변환 캐시(클라우드 D1 대응 로컬 파일판) ----
    if (url.pathname === '/api/keyword-research' && req.method === 'GET') {
      const topic = (url.searchParams.get('topic') ?? '').trim();
      if (!topic) { json(res, 400, { error: 'topic 필수' }); return; }
      const rows = loadResearch();
      const row = rows[topic];
      json(res, 200, row ? { topic, status: row.status, translations: row.data ?? null } : { topic, status: 'none', translations: null });
      return;
    }
    if (url.pathname === '/api/keyword-research/request' && req.method === 'POST') {
      const body = await readBody(req);
      const topic = String(body.topic ?? '').trim();
      if (!topic || topic.length > 100) { json(res, 400, { error: 'topic 필수(100자 이하)' }); return; }
      const rows = loadResearch();
      if (!rows[topic]) { rows[topic] = { status: 'pending', requestedAt: new Date().toISOString() }; saveResearch(rows); }
      json(res, 200, { ok: true });
      return;
    }
    if (url.pathname === '/api/keyword-research/pending' && req.method === 'GET') {
      const rows = loadResearch();
      json(res, 200, { pending: Object.keys(rows).filter((t) => rows[t].status === 'pending') });
      return;
    }
    if (url.pathname === '/api/keyword-research' && req.method === 'PUT') {
      const body = await readBody(req);
      const topic = String(body.topic ?? '').trim();
      const t = body.translations;
      const strArr = (a) => Array.isArray(a) && a.every((x) => typeof x === 'string' && x.length <= 60);
      if (!topic || !t || !strArr(t.xhs) || !strArr(t.dy) || !strArr(t.en)) {
        json(res, 400, { error: 'topic + translations{xhs[],dy[],en[]} 필수' }); return;
      }
      const rows = loadResearch();
      rows[topic] = { status: 'ready', data: { xhs: t.xhs.slice(0, 4), dy: t.dy.slice(0, 4), en: t.en.slice(0, 4) }, updatedAt: new Date().toISOString() };
      saveResearch(rows);
      json(res, 200, { ok: true });
      return;
    }

    // 초안 요청 — 콘텐츠 유형 확장형(shorts 활성, ad/blog/music 예약)
    if (req.method === 'POST' && url.pathname === '/api/draft-requests') {
      const body = await readBody(req);
      const topic = String(body.topic ?? '').trim();
      const contentType = String(body.contentType ?? 'shorts');
      if (!topic) { json(res, 400, { error: 'topic 필수' }); return; }
      if (!CONTENT_TYPES.includes(contentType)) { json(res, 400, { error: `contentType 은 ${CONTENT_TYPES.join('|')}` }); return; }
      if (contentType !== 'shorts') { json(res, 501, { error: `${contentType} 파이프라인은 예약 슬롯 — 아직 shorts 만 활성` }); return; }
      const rows = loadDraftRequests();
      const slug = topic.normalize('NFC').toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '');
      if (rows.some((r) => r.slug === slug)) { json(res, 409, { error: '이미 요청됨' }); return; }
      const memo = typeof body.memo === 'string' && body.memo.trim() ? body.memo.trim().slice(0, 500) : null;
      const reqRow = { slug, topic, contentType, opportunity: body.opportunity ?? null, status: 'pending', requestedAt: new Date().toISOString(), ...(memo ? { memo } : {}) };
      rows.push(reqRow);
      saveDraftRequests(rows);
      hotCache = { at: 0, items: [] };
      json(res, 201, { ok: true, request: reqRow });
      return;
    }

    const dr = url.pathname.match(/^\/api\/draft-requests\/([a-z0-9가-힣-]+)\/done$/);
    if (dr && req.method === 'POST') {
      const rows = loadDraftRequests().filter((r) => r.slug !== decodeURIComponent(dr[1]));
      saveDraftRequests(rows);
      json(res, 200, { ok: true });
      return;
    }

    const drDelete = url.pathname.match(/^\/api\/draft-requests\/([a-z0-9가-힣-]+)$/);
    if (drDelete && req.method === 'DELETE') {
      const slug = decodeURIComponent(drDelete[1]);
      const rows = loadDraftRequests();
      if (!rows.some((r) => r.slug === slug)) {
        json(res, 404, { error: `초안 요청 없음: ${slug}` });
        return;
      }
      saveDraftRequests(rows.filter((r) => r.slug !== slug));
      json(res, 200, { ok: true, deleted: { slug, request: true } });
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

    const jobDelete = url.pathname.match(/^\/api\/jobs\/([a-z0-9-]+)$/);
    if (jobDelete && req.method === 'DELETE') {
      const id = jobDelete[1];
      const jobs = loadJobs();
      const job = findJob(jobs, id);
      if (!job) {
        json(res, 404, { error: `잡 없음: ${id}` });
        return;
      }
      const busy = ['requested', 'running'].includes(job.finalize?.state)
        || ['requested', 'running'].includes(job.upload?.state);
      if (busy) {
        json(res, 409, { error: '후반 작업 또는 업로드가 진행 중이라 삭제할 수 없습니다. 완료 후 다시 시도해 주세요.' });
        return;
      }
      // 로컬 outputVideo/clipPaths는 앱 밖의 원본·공용 산출물일 수 있어 파일은 보존한다.
      saveJobs(jobs.filter((item) => item.brief.id !== id));
      json(res, 200, {
        ok: true,
        deleted: { id, job: true, mediaFilesPreserved: true },
      });
      return;
    }

    // 영상 스트리밍 — /api/jobs/:id/video?which=preview|final|clipN (잡에 기록된 파일만)
    const mv = url.pathname.match(/^\/api\/jobs\/([a-z0-9-]+)\/video$/);
    if (mv && req.method === 'GET') {
      const job = findJob(loadJobs(), mv[1]);
      if (!job) { json(res, 404, { error: `잡 없음: ${mv[1]}` }); return; }
      serveJobVideo(req, res, job, url.searchParams.get('which') ?? 'final');
      return;
    }

    // 제휴 링크 수동 저장 — /api/jobs/:id/set-link {platform, url, label?, primary?}
    const ml = url.pathname.match(/^\/api\/jobs\/([a-z0-9-]+)\/set-link$/);
    if (ml && req.method === 'POST') {
      const body = await readBody(req);
      const jobs = loadJobs();
      const job = findJob(jobs, ml[1]);
      if (!job) { json(res, 404, { error: `잡 없음: ${ml[1]}` }); return; }
      let validated;
      try { validated = validateAffiliateUrl(body.platform, body.url); }
      catch (e) { json(res, 400, { error: String(e.message) }); return; }
      const links = readAffiliateLinks(job);
      if (links.length >= 10) { json(res, 409, { error: '콘텐츠당 제휴 링크는 최대 10개까지 저장할 수 있습니다.' }); return; }
      if (links.some((link) => link.url === validated)) { json(res, 409, { error: '이미 등록된 제휴 링크입니다.' }); return; }
      const label = String(body.label ?? '').trim().slice(0, 60)
        || `${LINK_PLATFORMS[body.platform].label} ${links.filter((link) => link.platform === body.platform).length + 1}`;
      if (body.primary === true) links.forEach((link) => { link.primary = false; });
      links.push({ id: crypto.randomUUID(), platform: body.platform, label, url: validated, primary: body.primary === true || links.length === 0 });
      syncAffiliateState(job, links);
      job.updatedAt = new Date().toISOString();
      saveJobs(jobs);
      // 링크 변경은 고지 요건에 영향 → lint 즉시 재실행해 카드에 반영
      try {
        const r = await withJobFile(job, (p) => runAtomCli(['lint', '--job', p]));
        const fresh = loadJobs();
        const j2 = findJob(fresh, ml[1]);
        j2.lintReport = r.data;
        saveJobs(fresh);
        json(res, 200, { ok: true, affiliateUrl: job.brief.affiliateUrl, affiliateLinks: job.affiliateLinks, lint: r.data });
      } catch {
        json(res, 200, { ok: true, affiliateUrl: job.brief.affiliateUrl, affiliateLinks: job.affiliateLinks });
      }
      return;
    }

    const linkAction = url.pathname.match(/^\/api\/jobs\/([a-z0-9-]+)\/links\/([^/]+)(?:\/(primary))?$/);
    if (linkAction && req.method === 'DELETE' && !linkAction[3]) {
      const jobs = loadJobs();
      const job = findJob(jobs, linkAction[1]);
      if (!job) { json(res, 404, { error: `잡 없음: ${linkAction[1]}` }); return; }
      const linkId = decodeURIComponent(linkAction[2]);
      const links = readAffiliateLinks(job);
      if (!links.some((link) => link.id === linkId)) { json(res, 404, { error: '제휴 링크를 찾을 수 없습니다.' }); return; }
      syncAffiliateState(job, links.filter((link) => link.id !== linkId));
      job.updatedAt = new Date().toISOString();
      saveJobs(jobs);
      json(res, 200, { ok: true, affiliateUrl: job.brief.affiliateUrl, affiliateLinks: job.affiliateLinks });
      return;
    }
    if (linkAction && req.method === 'POST' && linkAction[3] === 'primary') {
      const jobs = loadJobs();
      const job = findJob(jobs, linkAction[1]);
      if (!job) { json(res, 404, { error: `잡 없음: ${linkAction[1]}` }); return; }
      const linkId = decodeURIComponent(linkAction[2]);
      const links = readAffiliateLinks(job);
      if (!links.some((link) => link.id === linkId)) { json(res, 404, { error: '제휴 링크를 찾을 수 없습니다.' }); return; }
      links.forEach((link) => { link.primary = link.id === linkId; });
      syncAffiliateState(job, links);
      job.updatedAt = new Date().toISOString();
      saveJobs(jobs);
      json(res, 200, { ok: true, affiliateUrl: job.brief.affiliateUrl, affiliateLinks: job.affiliateLinks });
      return;
    }

    // 쿠팡 딥링크 자동 변환 — /api/jobs/:id/issue-link {productUrl} (파트너스 키 있을 때만)
    const mi = url.pathname.match(/^\/api\/jobs\/([a-z0-9-]+)\/issue-link$/);
    if (mi && req.method === 'POST') {
      const body = await readBody(req);
      const jobs = loadJobs();
      const job = findJob(jobs, mi[1]);
      if (!job) { json(res, 404, { error: `잡 없음: ${mi[1]}` }); return; }
      if (!body.productUrl || !/^https:\/\/(www\.)?coupang\.com\//.test(body.productUrl)) {
        json(res, 400, { error: '쿠팡 상품 URL(https://www.coupang.com/...)을 주세요' });
        return;
      }
      try {
        const link = await coupangDeeplink(body.productUrl);
        const links = readAffiliateLinks(job);
        if (links.length >= 10) { json(res, 409, { error: '콘텐츠당 제휴 링크는 최대 10개까지 저장할 수 있습니다.' }); return; }
        if (!links.some((item) => item.url === link)) {
          links.push({ id: crypto.randomUUID(), platform: 'coupang', label: `쿠팡 파트너스 ${links.filter((item) => item.platform === 'coupang').length + 1}`, url: link, primary: links.length === 0 });
        }
        syncAffiliateState(job, links);
        job.updatedAt = new Date().toISOString();
        saveJobs(jobs);
        json(res, 200, { ok: true, affiliateUrl: job.brief.affiliateUrl, affiliateLinks: job.affiliateLinks });
      } catch (e) {
        json(res, e.code === 'NO_KEYS' ? 501 : 502, { error: String(e.message ?? e) });
      }
      return;
    }

    // 자막+TTS 조립(비동기 시작) — generated → assembled. Claire 보이스(비용: ElevenLabs).
    const mf = url.pathname.match(/^\/api\/jobs\/([a-z0-9-]+)\/finalize$/);
    if (mf && req.method === 'POST') {
      const id = mf[1];
      const jobs = loadJobs();
      const job = findJob(jobs, id);
      if (!job) { json(res, 404, { error: `잡 없음: ${id}` }); return; }
      if (job.status !== 'generated') { json(res, 400, { error: `generated 상태에서만 가능(현재 ${job.status})` }); return; }
      if (job.finalize?.state === 'running') { json(res, 409, { error: '이미 조립 중' }); return; }
      job.finalize = { state: 'running', at: new Date().toISOString() };
      job.updatedAt = new Date().toISOString();
      saveJobs(jobs);
      finalizeJob(id).catch((e) => {
        const fresh = loadJobs();
        const j2 = findJob(fresh, id);
        if (j2) {
          j2.finalize = { state: 'error', error: String(e?.message ?? e), at: new Date().toISOString() };
          j2.updatedAt = new Date().toISOString();
          saveJobs(fresh);
        }
      });
      json(res, 202, { ok: true, state: 'running' });
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
      if (typeof body.previewVideo === 'string') job.previewVideo = body.previewVideo;
      if (typeof body.outputVideo === 'string') job.outputVideo = body.outputVideo;
      if (typeof body.publishRef === 'string') job.publishRef = body.publishRef;
      job.updatedAt = new Date().toISOString();
      saveJobs(jobs);
      json(res, 200, { ok: true, job });
      return;
    }

    json(res, 404, { error: 'not found' });
  } catch (e) {
    // 스트리밍 도중(헤더 전송 후) 에러면 JSON 을 다시 쓰려다 서버가 죽는다 — 연결만 끊는다
    if (res.headersSent) res.destroy();
    else json(res, 500, { error: String(e?.message ?? e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[shopshorts] http://127.0.0.1:${PORT} (로컬 전용, jobs=${JOBS_PATH})`);
});
