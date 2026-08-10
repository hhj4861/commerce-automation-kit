/**
 * shopshorts Cloudflare API — Pages Functions 라우터.
 *
 * 역할 분담(클라우드는 "상태·미디어"만, 실행은 로컬):
 *  - D1: 잡 큐 단일 진실 소스(전이 화이트리스트를 여기서 강제 — UI/워커 공통 게이트)
 *  - R2: 미리보기/최종 영상 저장·Range 스트리밍
 *  - 실행(대본 lint·TTS·조립·클립 생성)은 로컬 워커/Claude 세션이 수행 후 결과를 밀어넣음
 *
 * 게이트 의미 유지: 승인/발행 같은 사람 전이는 UI 버튼 → 여기서 전이 규칙 검증.
 * lint 는 클라우드에서 못 돌므로(원자 CLI), 워커가 승인 직후 검증해 위반 시
 * draft 로 자동 반려(사유 기록) — "lint 게이트" 는 시점만 뒤로 이동, 우회는 불가.
 */

const TRANSITIONS = {
  draft: ['script-approved', 'rejected'],
  'script-approved': ['generated', 'rejected', 'draft'],
  generated: ['assembled', 'rejected', 'script-approved'],
  assembled: ['review', 'rejected', 'generated'],
  review: ['published', 'rejected', 'assembled'],
  rejected: ['draft'],
  published: ['review'],
};
const CONTENT_TYPES = ['shorts', 'ad', 'blog', 'music'];
const BLOG_CATEGORIES = ['생활정보', '취업', '건강'];
const BLOG_REPO = 'hhj4861/wp-auto-blog';
const BLOG_WORKFLOW = 'auto-post.yml';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function getJob(env, id) {
  const row = await env.DB.prepare('SELECT data FROM jobs WHERE id = ?').bind(id).first();
  return row ? JSON.parse(row.data) : null;
}

async function saveJob(env, job) {
  job.updatedAt = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO jobs (id, data, status, updated_at) VALUES (?1, ?2, ?3, ?4) ' +
      'ON CONFLICT(id) DO UPDATE SET data = ?2, status = ?3, updated_at = ?4',
  )
    .bind(job.brief.id, JSON.stringify(job), job.status, job.updatedAt)
    .run();
  return job;
}

async function githubRequest(env, path, init = {}) {
  if (!env.WP_AUTO_BLOG_GITHUB_TOKEN) {
    const e = new Error('WP_AUTO_BLOG_GITHUB_TOKEN 시크릿이 설정되지 않았습니다.');
    e.status = 503;
    throw e;
  }
  return fetch(`https://api.github.com/repos/${BLOG_REPO}${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${env.WP_AUTO_BLOG_GITHUB_TOKEN}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'shopshorts-blog-poc',
      ...(init.headers ?? {}),
    },
  });
}

// 제휴 링크 검증(로컬 server.mjs 와 동일 규칙)
const LINK_PLATFORMS = {
  coupang: { hosts: ['link.coupang.com', 'www.coupang.com', 'coupa.ng'], label: '쿠팡 파트너스' },
  naverConnect: { hosts: ['naver.me', 'shopping.naver.com', 'smartstore.naver.com', 'brand.naver.com'], label: '네이버 쇼핑커넥트' },
};
const isPlaceholderLink = (u) => /PLACEHOLDER|\/a\/sample/.test(u ?? '');

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

/** 쿠팡 파트너스 딥링크(HMAC CEA) — 시크릿 COUPANG_ACCESS_KEY/COUPANG_SECRET_KEY 있을 때만. */
async function coupangDeeplink(env, productUrl) {
  const accessKey = env.COUPANG_ACCESS_KEY;
  const secretKey = env.COUPANG_SECRET_KEY;
  if (!accessKey || !secretKey) {
    const e = new Error('쿠팡 파트너스 API 키 없음 — Pages 시크릿 COUPANG_ACCESS_KEY/SECRET_KEY 필요(활성화 요건: 누적 실적)');
    e.status = 501;
    throw e;
  }
  const method = 'POST';
  const apiPath = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const datetime = `${String(now.getUTCFullYear()).slice(2)}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secretKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(datetime + method + apiPath));
  const signature = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const resp = await fetch(`https://api-gateway.coupang.com${apiPath}`, {
    method,
    headers: {
      Authorization: `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ coupangUrls: [productUrl] }),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`딥링크 API ${resp.status}: ${JSON.stringify(body).slice(0, 200)}`);
  const link = body?.data?.[0]?.shortenUrl ?? body?.data?.[0]?.landingUrl;
  if (!link) throw new Error('딥링크 응답에 링크 없음');
  return link;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  // 리뷰 확정 결함 수정: pathname 은 퍼센트 인코딩됨 — 한글 슬러그 라우팅을 위해 디코드
  const path = decodeURIComponent(url.pathname).replace(/^\/api\//, '');
  const method = request.method;

  try {
    // ---------- 잡 목록/등록 ----------
    if (path === 'jobs' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT data FROM jobs').all();
      const jobs = results.map((r) => JSON.parse(r.data));
      const hb = await env.DB.prepare("SELECT value FROM meta WHERE key = 'worker_heartbeat'").first();
      return json({
        jobs,
        statuses: Object.keys(TRANSITIONS),
        workerAt: hb ? hb.value : null,
      });
    }

    if (path === 'jobs' && method === 'POST') {
      const body = await readJson(request);
      if (!body?.brief?.id || !body?.script) return json({ error: 'brief/script 필수' }, 400);
      if (await getJob(env, body.brief.id)) return json({ error: `이미 존재: ${body.brief.id}` }, 409);
      const job = {
        brief: body.brief,
        script: body.script,
        status: 'draft',
        ...(body.lintReport !== undefined ? { lintReport: body.lintReport } : {}),
      };
      await saveJob(env, job);
      return json({ ok: true, job }, 201);
    }

    // ---------- 잡 단건 ----------
    const jm = path.match(/^jobs\/([a-z0-9-]+)(?:\/(.+))?$/);
    if (jm) {
      const [, id, sub] = jm;
      const job = await getJob(env, id);
      if (!job) return json({ error: `잡 없음: ${id}` }, 404);

      // 콘텐츠 삭제 — 실행 중인 워커와 경합하지 않게 대기/실행 상태에서는 거부한다.
      // 관리 대상인 D1 작업 레코드와 R2 preview/final만 지우며 원본 소스에는 관여하지 않는다.
      if (!sub && method === 'DELETE') {
        const busy = ['requested', 'running'].includes(job.finalize?.state)
          || ['requested', 'running'].includes(job.upload?.state);
        if (busy) {
          return json({ error: '후반 작업 또는 업로드가 진행 중이라 삭제할 수 없습니다. 완료 후 다시 시도해 주세요.' }, 409);
        }
        const mediaKeys = [`jobs/${id}/preview.mp4`, `jobs/${id}/final.mp4`];
        try {
          await Promise.all(mediaKeys.map((key) => env.MEDIA.delete(key)));
        } catch (e) {
          return json({ error: `R2 영상 삭제 실패 — 작업 기록은 보존됨: ${String(e?.message ?? e)}` }, 502);
        }
        await env.DB.prepare('DELETE FROM jobs WHERE id = ?').bind(id).run();
        return json({ ok: true, deleted: { id, job: true, mediaKeys } });
      }

      // 워커 전용 전체 갱신 — x-shopshorts-worker 헤더 필수(UI 오사용 방지),
      // 대본이 바뀌면 lintChecked 를 무효화해 재검증을 강제(발행 게이트 무결성).
      if (!sub && method === 'PUT') {
        if (request.headers.get('x-shopshorts-worker') !== '1') {
          return json({ error: '워커 전용 엔드포인트(x-shopshorts-worker 헤더 필요) — UI 는 transition 사용' }, 403);
        }
        const body = await readJson(request);
        if (!body?.brief?.id || body.brief.id !== id) return json({ error: 'id 불일치' }, 400);
        if (JSON.stringify(body.script) !== JSON.stringify(job.script)) delete body.lintChecked;
        await saveJob(env, body);
        return json({ ok: true });
      }

      if (sub === 'transition' && method === 'POST') {
        const body = await readJson(request);
        const to = body?.to;
        const allowed = TRANSITIONS[job.status] ?? [];
        if (!allowed.includes(to)) {
          return json({ error: `전이 불가: ${job.status} → ${to} (허용: ${allowed.join(', ') || '없음'})` }, 400);
        }
        // 게이트(리뷰 확정 결함 수정): lint 통과 없이는 생성·발행 단계로 못 감 — 워커 오프라인 우회 차단
        if (to === 'generated' && job.lintChecked !== true) {
          return json({ error: 'lint 검증 대기 중(워커) — 통과 전에는 생성 단계로 갈 수 없음' }, 422);
        }
        if (to === 'review' && !job.mediaUploaded?.final) {
          return json({ error: '최종 영상 없이 review 로 갈 수 없음(자막+TTS 먼저)' }, 422);
        }
        if (to === 'published') {
          if (job.lintChecked !== true) return json({ error: 'lint 검증 없이 발행 불가' }, 422);
          if (!job.mediaUploaded?.final) return json({ error: '최종 영상 없이 발행 불가' }, 422);
          if (isPlaceholderLink(job.brief.affiliateUrl)) {
            return json({ error: '자리표시자 링크로는 발행 불가 — 실제 제휴 링크로 교체 필요' }, 422);
          }
        }
        job.status = to;
        if (typeof body.note === 'string' && body.note.length > 0) job.note = body.note;
        if (typeof body.publishRef === 'string') job.publishRef = body.publishRef;
        if (Array.isArray(body.clipPaths)) job.clipPaths = body.clipPaths;
        if (typeof body.previewVideo === 'string') job.previewVideo = body.previewVideo;
        if (typeof body.outputVideo === 'string') job.outputVideo = body.outputVideo;
        // 승인 전이 → 워커 lint 재검증 대기. 그 외 전이 → 미실행 finalize 요청은 취소(유령 조립 방지)
        if (to === 'script-approved') delete job.lintChecked;
        if (job.finalize?.state === 'requested') delete job.finalize;
        // 발행 확인(사람 게이트 2) → 로컬 워커가 실제 업로드 실행. 이미 참조가 있으면(수동 업로드) 건너뜀
        if (to === 'published' && !job.publishRef) {
          job.upload = {
            state: 'requested',
            at: new Date().toISOString(),
            platforms: Array.isArray(body.platforms) && body.platforms.length > 0
              ? body.platforms : ['youtube', 'instagram'],
          };
        }
        await saveJob(env, job);
        return json({ ok: true, job });
      }

      // 업로드 재요청(실패 후 사람이 다시 시도) — published 상태에서만
      if (sub === 'request-upload' && method === 'POST') {
        if (job.status !== 'published') return json({ error: `published 상태에서만 가능(현재 ${job.status})` }, 400);
        if (job.upload?.state === 'running' || job.upload?.state === 'uploaded') {
          return json({ error: '업로드가 이미 진행 중' }, 409);
        }
        job.upload = { state: 'requested', at: new Date().toISOString(), platforms: job.upload?.platforms ?? ['youtube', 'instagram'] };
        await saveJob(env, job);
        return json({ ok: true, upload: job.upload });
      }

      if (sub === 'request-finalize' && method === 'POST') {
        if (job.status !== 'generated') return json({ error: `generated 상태에서만 가능(현재 ${job.status})` }, 400);
        if (job.finalize?.state === 'requested' || job.finalize?.state === 'running') {
          return json({ error: '이미 조립 대기/진행 중' }, 409);
        }
        job.finalize = { state: 'requested', at: new Date().toISOString() };
        await saveJob(env, job);
        return json({ ok: true, state: 'requested' }, 202);
      }

      // lint 재검증 요청(사람 버튼) — 워커가 집어감
      if (sub === 'request-lint' && method === 'POST') {
        delete job.lintChecked;
        job.lintRequested = true;
        await saveJob(env, job);
        return json({ ok: true }, 202);
      }

      // 제휴 링크 수동 저장 — 도메인 검증 + 대본 재검증 플래그(고지 요건이 링크에 따라 달라짐)
      if (sub === 'set-link' && method === 'POST') {
        const body = await readJson(request);
        let validated;
        try { validated = validateAffiliateUrl(body?.platform, body?.url); }
        catch (e) { return json({ error: String(e.message) }, 400); }
        const links = readAffiliateLinks(job);
        if (links.length >= 10) return json({ error: '콘텐츠당 제휴 링크는 최대 10개까지 저장할 수 있습니다.' }, 409);
        if (links.some((link) => link.url === validated)) return json({ error: '이미 등록된 제휴 링크입니다.' }, 409);
        const label = String(body?.label ?? '').trim().slice(0, 60)
          || `${LINK_PLATFORMS[body.platform].label} ${links.filter((link) => link.platform === body.platform).length + 1}`;
        if (body?.primary === true) links.forEach((link) => { link.primary = false; });
        links.push({ id: crypto.randomUUID(), platform: body.platform, label, url: validated, primary: body?.primary === true || links.length === 0 });
        syncAffiliateState(job, links);
        delete job.lintChecked;
        job.lintRequested = true;
        await saveJob(env, job);
        return json({ ok: true, affiliateUrl: job.brief.affiliateUrl, affiliateLinks: job.affiliateLinks });
      }

      const affiliateLinkAction = sub?.match(/^links\/([^/]+)(?:\/(primary))?$/);
      if (affiliateLinkAction && method === 'DELETE' && !affiliateLinkAction[2]) {
        const linkId = decodeURIComponent(affiliateLinkAction[1]);
        const links = readAffiliateLinks(job);
        if (!links.some((link) => link.id === linkId)) return json({ error: '제휴 링크를 찾을 수 없습니다.' }, 404);
        syncAffiliateState(job, links.filter((link) => link.id !== linkId));
        delete job.lintChecked;
        job.lintRequested = true;
        await saveJob(env, job);
        return json({ ok: true, affiliateUrl: job.brief.affiliateUrl, affiliateLinks: job.affiliateLinks });
      }
      if (affiliateLinkAction && method === 'POST' && affiliateLinkAction[2] === 'primary') {
        const linkId = decodeURIComponent(affiliateLinkAction[1]);
        const links = readAffiliateLinks(job);
        if (!links.some((link) => link.id === linkId)) return json({ error: '제휴 링크를 찾을 수 없습니다.' }, 404);
        links.forEach((link) => { link.primary = link.id === linkId; });
        syncAffiliateState(job, links);
        delete job.lintChecked;
        job.lintRequested = true;
        await saveJob(env, job);
        return json({ ok: true, affiliateUrl: job.brief.affiliateUrl, affiliateLinks: job.affiliateLinks });
      }

      // 쿠팡 딥링크 자동 변환(시크릿 키 있을 때만)
      if (sub === 'issue-link' && method === 'POST') {
        const body = await readJson(request);
        if (!body?.productUrl || !/^https:\/\/(www\.)?coupang\.com\//.test(body.productUrl)) {
          return json({ error: '쿠팡 상품 URL(https://www.coupang.com/...)을 주세요' }, 400);
        }
        try {
          const link = await coupangDeeplink(env, body.productUrl);
          const links = readAffiliateLinks(job);
          if (links.length >= 10) return json({ error: '콘텐츠당 제휴 링크는 최대 10개까지 저장할 수 있습니다.' }, 409);
          if (!links.some((item) => item.url === link)) {
            links.push({ id: crypto.randomUUID(), platform: 'coupang', label: `쿠팡 파트너스 ${links.filter((item) => item.platform === 'coupang').length + 1}`, url: link, primary: links.length === 0 });
          }
          syncAffiliateState(job, links);
          delete job.lintChecked;
          job.lintRequested = true;
          await saveJob(env, job);
          return json({ ok: true, affiliateUrl: job.brief.affiliateUrl, affiliateLinks: job.affiliateLinks });
        } catch (e) {
          return json({ error: String(e.message ?? e) }, e.status ?? 502);
        }
      }

      // ---------- 영상: R2 스트리밍(GET) / 워커 업로드(PUT) ----------
      if (sub === 'video') {
        const which = url.searchParams.get('which') ?? 'final';
        if (!/^(preview|final)$/.test(which)) return json({ error: 'which=preview|final' }, 400);
        const key = `jobs/${id}/${which}.mp4`;

        if (method === 'PUT') {
          await env.MEDIA.put(key, request.body);
          // 리뷰 확정 결함 수정: 업로드는 수십 초 걸릴 수 있음 — 낡은 스냅샷으로 덮지 말고
          // 업로드 완료 후 최신 잡을 다시 읽어 플래그만 병합한다(동시 전이 보존).
          const fresh = (await getJob(env, id)) ?? job;
          fresh.mediaUploaded = { ...(fresh.mediaUploaded ?? {}), [which]: true };
          await saveJob(env, fresh);
          return json({ ok: true, key });
        }

        if (method === 'GET') {
          const rangeHeader = request.headers.get('range');
          if (rangeHeader) {
            const m = rangeHeader.match(/bytes=(\d+)-(\d*)/);
            const offset = m ? Number(m[1]) : 0;
            const head = await env.MEDIA.head(key);
            if (!head) return json({ error: '영상 없음' }, 404);
            const size = head.size;
            const end = m && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
            const length = end - offset + 1;
            const obj = await env.MEDIA.get(key, { range: { offset, length } });
            if (!obj) return json({ error: '영상 없음' }, 404);
            return new Response(obj.body, {
              status: 206,
              headers: {
                'content-type': 'video/mp4',
                'content-range': `bytes ${offset}-${end}/${size}`,
                'content-length': String(length),
                'accept-ranges': 'bytes',
              },
            });
          }
          const obj = await env.MEDIA.get(key);
          if (!obj) return json({ error: '영상 없음' }, 404);
          return new Response(obj.body, {
            headers: {
              'content-type': 'video/mp4',
              'content-length': String(obj.size),
              'accept-ranges': 'bytes',
            },
          });
        }
      }
      return json({ error: 'not found' }, 404);
    }

    // ---------- 초안 요청(콘텐츠 유형 확장형) ----------
    if (path === 'draft-requests' && method === 'POST') {
      const body = await readJson(request);
      const topic = String(body?.topic ?? '').trim();
      const contentType = String(body?.contentType ?? 'shorts');
      if (!topic) return json({ error: 'topic 필수' }, 400);
      if (!CONTENT_TYPES.includes(contentType)) return json({ error: `contentType 은 ${CONTENT_TYPES.join('|')}` }, 400);
      if (contentType !== 'shorts') return json({ error: `${contentType} 파이프라인은 예약 슬롯 — 아직 shorts 만 활성` }, 501);
      const slug = topic.normalize('NFC').toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '');
      const dup = await env.DB.prepare('SELECT slug FROM draft_requests WHERE slug = ?').bind(slug).first();
      if (dup) return json({ error: '이미 요청됨' }, 409);
      // 관찰 메모(소재 리서치에서 본 연출 기록) — 대본 작성 시 연출 참고로 전달
      const memo = typeof body?.memo === 'string' && body.memo.trim() ? body.memo.trim().slice(0, 500) : null;
      try {
        await env.DB.prepare(
          'INSERT INTO draft_requests (slug, topic, content_type, opportunity, status, requested_at, memo) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
          .bind(slug, topic, contentType, body.opportunity ?? null, 'pending', new Date().toISOString(), memo)
          .run();
      } catch {
        // 마이그레이션 0004 미적용 D1 폴백 — memo 없이 저장(요청 자체는 유실 금지)
        await env.DB.prepare(
          'INSERT INTO draft_requests (slug, topic, content_type, opportunity, status, requested_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
          .bind(slug, topic, contentType, body.opportunity ?? null, 'pending', new Date().toISOString())
          .run();
      }
      return json({ ok: true, slug }, 201);
    }

    // ---------- 소재 리서치: 현지 검색어 변환 캐시 (검색어 문자열만 — 콘텐츠 수집 없음) ----------
    if (path === 'keyword-research' && method === 'GET') {
      const topic = (url.searchParams.get('topic') ?? '').trim();
      if (!topic) return json({ error: 'topic 필수' }, 400);
      const row = await env.DB.prepare('SELECT data, status FROM keyword_research WHERE topic = ?').bind(topic).first();
      if (!row) return json({ topic, status: 'none', translations: null });
      return json({ topic, status: row.status, translations: row.data ? JSON.parse(row.data) : null });
    }
    if (path === 'keyword-research/request' && method === 'POST') {
      const body = await readJson(request);
      const topic = String(body?.topic ?? '').trim();
      if (!topic || topic.length > 100) return json({ error: 'topic 필수(100자 이하)' }, 400);
      await env.DB.prepare(
        "INSERT INTO keyword_research (topic, status, requested_at) VALUES (?1, 'pending', ?2) ON CONFLICT(topic) DO NOTHING",
      ).bind(topic, new Date().toISOString()).run();
      return json({ ok: true });
    }
    if (path === 'keyword-research/pending' && method === 'GET') {
      const { results } = await env.DB.prepare("SELECT topic FROM keyword_research WHERE status = 'pending'").all();
      return json({ pending: results.map((r) => r.topic) });
    }
    if (path === 'keyword-research' && method === 'PUT') {
      // 변환 생성자(Claude 세션·워커) 전용 — UI 는 request 만 사용
      if (request.headers.get('x-shopshorts-worker') !== '1') {
        return json({ error: '생성자 전용 엔드포인트(x-shopshorts-worker 헤더 필요)' }, 403);
      }
      const body = await readJson(request);
      const topic = String(body?.topic ?? '').trim();
      const t = body?.translations;
      const strArr = (a) => Array.isArray(a) && a.every((x) => typeof x === 'string' && x.length <= 60);
      if (!topic || !t || !strArr(t.xhs) || !strArr(t.dy) || !strArr(t.en)) {
        return json({ error: 'topic + translations{xhs[],dy[],en[]} 필수(문자열 60자 이하)' }, 400);
      }
      const now = new Date().toISOString();
      await env.DB.prepare(
        "INSERT INTO keyword_research (topic, data, status, requested_at, updated_at) VALUES (?1, ?2, 'ready', ?3, ?3) " +
          "ON CONFLICT(topic) DO UPDATE SET data = ?2, status = 'ready', updated_at = ?3",
      ).bind(topic, JSON.stringify({ xhs: t.xhs.slice(0, 4), dy: t.dy.slice(0, 4), en: t.en.slice(0, 4) }), now).run();
      return json({ ok: true });
    }

    const dr = path.match(/^draft-requests\/([a-z0-9가-힣-]+)\/done$/);
    if (dr && method === 'POST') {
      await env.DB.prepare('DELETE FROM draft_requests WHERE slug = ?').bind(decodeURIComponent(dr[1])).run();
      return json({ ok: true });
    }

    const drDelete = path.match(/^draft-requests\/([a-z0-9가-힣-]+)$/);
    if (drDelete && method === 'DELETE') {
      const slug = decodeURIComponent(drDelete[1]);
      const result = await env.DB.prepare('DELETE FROM draft_requests WHERE slug = ?').bind(slug).run();
      if (!result.meta?.changes) return json({ error: `초안 요청 없음: ${slug}` }, 404);
      return json({ ok: true, deleted: { slug, request: true } });
    }

    // ---------- WordPress 블로그 자동발행 POC ----------
    // POC는 GitHub Actions에 publish=false만 전달한다. 공개 발행은 의도적으로 지원하지 않는다.
    if (path === 'blog-poc-requests' && method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT id, topic, category, status, run_id, run_url, error, requested_at, updated_at ' +
        'FROM blog_poc_requests ORDER BY requested_at DESC LIMIT 30',
      ).all();
      return json({ requests: results });
    }

    if (path === 'blog-poc-requests' && method === 'POST') {
      const body = await readJson(request);
      const topic = String(body?.topic ?? '').trim();
      const category = String(body?.category ?? '').trim();
      if (!topic || topic.length > 100) return json({ error: 'topic은 1~100자여야 합니다.' }, 400);
      // wp-auto-blog의 현재 workflow가 topic을 작은따옴표 셸 인자로 조립한다.
      // 워크플로를 안전한 argv 전달 방식으로 바꾸기 전까지 quote/control 문자는 받지 않는다.
      if (/['\u0000-\u001f\u007f]/.test(topic)) {
        return json({ error: 'topic에는 작은따옴표나 줄바꿈·제어문자를 사용할 수 없습니다.' }, 400);
      }
      if (!BLOG_CATEGORIES.includes(category)) {
        return json({ error: `category는 ${BLOG_CATEGORIES.join('|')} 중 하나여야 합니다.` }, 400);
      }
      // workflow_dispatch는 응답에 run_id를 주지 않는다. 동시에 두 건을 보내면 실행을
      // 요청과 확정적으로 매칭할 수 없으므로 POC에서는 1건씩만 검증한다.
      const active = await env.DB.prepare(
        "SELECT id, topic, status FROM blog_poc_requests " +
        "WHERE status IN ('dispatching', 'queued', 'generating') " +
        "AND datetime(requested_at) >= datetime('now', '-45 minutes') ORDER BY requested_at DESC LIMIT 1",
      ).first();
      if (active) {
        return json({
          error: `이미 “${active.topic}” POC가 ${active.status} 상태입니다. 상태 확인 후 다시 시도해 주세요.`,
          activeRequestId: active.id,
        }, 409);
      }
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await env.DB.prepare(
        'INSERT INTO blog_poc_requests(id, topic, category, status, requested_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).bind(id, topic, category, 'dispatching', now, now).run();

      const dispatched = await githubRequest(env, `/actions/workflows/${BLOG_WORKFLOW}/dispatches`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ref: 'main',
          inputs: { mode: 'general', topic, publish: 'false', category },
        }),
      });
      if (!dispatched.ok) {
        const detail = (await dispatched.text()).slice(0, 500);
        await env.DB.prepare(
          'UPDATE blog_poc_requests SET status = ?, error = ?, updated_at = ? WHERE id = ?',
        ).bind('failed', `GitHub ${dispatched.status}: ${detail}`, new Date().toISOString(), id).run();
        return json({ error: `GitHub Actions 실행 실패(${dispatched.status})`, id }, 502);
      }
      await env.DB.prepare(
        'UPDATE blog_poc_requests SET status = ?, updated_at = ? WHERE id = ?',
      ).bind('queued', new Date().toISOString(), id).run();
      return json({ ok: true, id, status: 'queued', publish: false }, 202);
    }

    const blogSync = path.match(/^blog-poc-requests\/([a-f0-9-]+)\/sync$/);
    if (blogSync && method === 'POST') {
      const row = await env.DB.prepare('SELECT * FROM blog_poc_requests WHERE id = ?')
        .bind(blogSync[1]).first();
      if (!row) return json({ error: 'POC 요청을 찾을 수 없습니다.' }, 404);
      const runsRes = await githubRequest(
        env,
        `/actions/workflows/${BLOG_WORKFLOW}/runs?event=workflow_dispatch&per_page=20`,
      );
      if (!runsRes.ok) return json({ error: `GitHub 실행 조회 실패(${runsRes.status})` }, 502);
      const runs = (await runsRes.json()).workflow_runs ?? [];
      let run = row.run_id ? runs.find((r) => r.id === row.run_id) : null;
      if (!run) {
        const requestedAt = new Date(row.requested_at).getTime() - 10000;
        const claimed = await env.DB.prepare(
          'SELECT run_id FROM blog_poc_requests WHERE run_id IS NOT NULL AND id <> ?',
        ).bind(row.id).all();
        const claimedIds = new Set(claimed.results.map((r) => Number(r.run_id)));
        run = runs
          .filter((r) => new Date(r.created_at).getTime() >= requestedAt && !claimedIds.has(Number(r.id)))
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
      }
      if (!run) return json({ ok: true, request: row, note: 'GitHub 실행 배정을 기다리는 중입니다.' });
      const status = run.status === 'completed'
        ? (run.conclusion === 'success' ? 'draft-ready' : 'failed')
        : (run.status === 'queued' ? 'queued' : 'generating');
      await env.DB.prepare(
        'UPDATE blog_poc_requests SET status = ?, run_id = ?, run_url = ?, error = ?, updated_at = ? WHERE id = ?',
      ).bind(
        status, run.id, run.html_url,
        status === 'failed' ? `GitHub Actions: ${run.conclusion ?? 'failed'}` : null,
        new Date().toISOString(), row.id,
      ).run();
      const updated = await env.DB.prepare('SELECT * FROM blog_poc_requests WHERE id = ?')
        .bind(row.id).first();
      return json({ ok: true, request: updated });
    }

    // ---------- 채널별 키워드 피드(GitHub Actions 가 30분마다 push) ----------
    const feedMatch = path.match(/^keyword-feeds\/(trend|blog)$/);
    if (feedMatch && method === 'PUT') {
      const channel = feedMatch[1];
      const body = await readJson(request);
      if (!Array.isArray(body?.items)) return json({ error: 'items 배열 필요' }, 400);
      const items = body.items.slice(0, 100).map((it) => ({
        topic: String(it?.topic ?? '').trim(),
        score: Math.round(Number(it?.score ?? it?.opportunity ?? it?.blogScore) || 0),
        payload: it,
      })).filter((it) => it.topic.length > 0 && it.topic.length <= 100);
      if (items.length === 0) {
        return json({ error: '빈 피드는 기존 최신 데이터와 아카이브를 보호하기 위해 게시할 수 없습니다.' }, 422);
      }
      const now = new Date().toISOString();
      const requestedDate = body.snapshotDate == null ? '' : String(body.snapshotDate);
      if (requestedDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
        return json({ error: 'snapshotDate는 YYYY-MM-DD 형식이어야 합니다.' }, 400);
      }
      const snapshotDate = requestedDate || new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
      const archiveOnly = body.archiveOnly === true;
      const stmts = [
        env.DB.prepare('DELETE FROM keyword_feed_archive WHERE channel = ? AND snapshot_date = ?')
          .bind(channel, snapshotDate),
      ];
      if (!archiveOnly) {
        stmts.unshift(env.DB.prepare('DELETE FROM keyword_feeds WHERE channel = ?').bind(channel));
      }
      for (const it of items) {
        if (!archiveOnly) {
          stmts.push(env.DB.prepare(
            'INSERT INTO keyword_feeds(channel, topic, score, payload, updated_at) VALUES (?, ?, ?, ?, ?)',
          ).bind(channel, it.topic, it.score, JSON.stringify(it.payload), now));
        }
        stmts.push(env.DB.prepare(
          'INSERT INTO keyword_feed_archive(snapshot_date, channel, topic, score, payload, updated_at) ' +
          'VALUES (?, ?, ?, ?, ?, ?)',
        ).bind(snapshotDate, channel, it.topic, it.score, JSON.stringify(it.payload), now));
      }
      await env.DB.batch(stmts);
      return json({ ok: true, channel, count: items.length, snapshotDate, archiveOnly, updatedAt: now });
    }
    if (feedMatch && method === 'GET') {
      const channel = feedMatch[1];
      const date = url.searchParams.get('date');
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'date는 YYYY-MM-DD 형식이어야 합니다.' }, 400);
      const query = date
        ? env.DB.prepare(
          'SELECT topic, score, payload, updated_at FROM keyword_feed_archive ' +
          'WHERE channel = ? AND snapshot_date = ? ORDER BY score DESC LIMIT 100',
        ).bind(channel, date)
        : env.DB.prepare(
          'SELECT topic, score, payload, updated_at FROM keyword_feeds WHERE channel = ? ORDER BY score DESC LIMIT 100',
        ).bind(channel);
      const { results } = await query.all();
      return json({
        channel,
        snapshotDate: date ?? null,
        items: results.map((row) => ({ ...JSON.parse(row.payload), topic: row.topic, score: row.score })),
        updatedAt: results[0]?.updated_at ?? null,
      });
    }

    if (path === 'keyword-feed-dates' && method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT snapshot_date, MAX(updated_at) AS updated_at FROM keyword_feed_archive ' +
        'GROUP BY snapshot_date ORDER BY snapshot_date DESC LIMIT 90',
      ).all();
      return json({ dates: results });
    }

    // ---------- 핫 키워드(대시보드는 trend 채널 상위 후보를 조회) ----------
    if (path === 'hot-keywords' && method === 'GET') {
      let kws;
      try {
        const { results } = await env.DB.prepare(
          "SELECT topic, score AS opportunity FROM keyword_feeds WHERE channel = 'trend' ORDER BY score DESC LIMIT 20",
        ).all();
        kws = results;
      } catch {
        // 마이그레이션 적용 전 배포에서도 기존 대시보드 조회를 유지한다.
        const { results } = await env.DB.prepare(
          'SELECT topic, opportunity FROM hot_keywords ORDER BY opportunity DESC LIMIT 20',
        ).all();
        kws = results;
      }
      const { results: reqs } = await env.DB.prepare('SELECT * FROM draft_requests').all();
      const { results: jobRows } = await env.DB.prepare('SELECT data FROM jobs').all();
      const taken = new Set(
        jobRows
          .map((r) => {
            const j = JSON.parse(r.data);
            return (j.brief?.keyword ?? '').replace(/\s+/g, '');
          })
          .concat(reqs.map((r) => r.topic.replace(/\s+/g, ''))),
      );
      const items = kws
        .filter((k) => !taken.has(k.topic.replace(/\s+/g, '')))
        .slice(0, 3)
        .map((k) => ({ topic: k.topic, opportunity: k.opportunity }));
      return json({
        items,
        requests: reqs.map((r) => ({
          slug: r.slug, topic: r.topic, contentType: r.content_type, status: r.status,
          ...(r.memo ? { memo: r.memo } : {}),
        })),
      });
    }

    if (path === 'hot-keywords' && method === 'PUT') {
      const body = await readJson(request);
      if (!Array.isArray(body?.items)) return json({ error: 'items 배열 필요' }, 400);
      const now = new Date().toISOString();
      const stmts = [env.DB.prepare('DELETE FROM hot_keywords')];
      for (const it of body.items.slice(0, 30)) {
        stmts.push(
          env.DB.prepare('INSERT INTO hot_keywords (topic, opportunity, updated_at) VALUES (?, ?, ?)')
            .bind(String(it.topic), Number(it.opportunity) || 0, now),
        );
      }
      await env.DB.batch(stmts);
      return json({ ok: true, count: body.items.length });
    }

    // ---------- 워커 하트비트 ----------
    if (path === 'worker-heartbeat' && method === 'PUT') {
      await env.DB.prepare(
        "INSERT INTO meta (key, value) VALUES ('worker_heartbeat', ?1) " +
          'ON CONFLICT(key) DO UPDATE SET value = ?1',
      )
        .bind(new Date().toISOString())
        .run();
      return json({ ok: true });
    }

    return json({ error: 'not found' }, 404);
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, e?.status ?? 500);
  }
}
