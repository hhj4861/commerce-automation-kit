/**
 * shopshorts-cloud API — Pages Functions 라우터.
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

// 제휴 링크 검증(로컬 server.mjs 와 동일 규칙)
const LINK_PLATFORMS = {
  coupang: { hosts: ['link.coupang.com', 'www.coupang.com', 'coupa.ng'], label: '쿠팡 파트너스' },
  naverConnect: { hosts: ['naver.me', 'shopping.naver.com', 'smartstore.naver.com', 'brand.naver.com'], label: '네이버 쇼핑커넥트' },
};
const isPlaceholderLink = (u) => /PLACEHOLDER|\/a\/sample/.test(u ?? '');

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
        await saveJob(env, job);
        return json({ ok: true, job });
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
        job.brief.affiliateUrl = validated;
        job.platformLinks = { ...(job.platformLinks ?? {}), [body.platform]: validated };
        delete job.lintChecked;
        job.lintRequested = true;
        await saveJob(env, job);
        return json({ ok: true, affiliateUrl: validated });
      }

      // 쿠팡 딥링크 자동 변환(시크릿 키 있을 때만)
      if (sub === 'issue-link' && method === 'POST') {
        const body = await readJson(request);
        if (!body?.productUrl || !/^https:\/\/(www\.)?coupang\.com\//.test(body.productUrl)) {
          return json({ error: '쿠팡 상품 URL(https://www.coupang.com/...)을 주세요' }, 400);
        }
        try {
          const link = await coupangDeeplink(env, body.productUrl);
          job.brief.affiliateUrl = link;
          job.platformLinks = { ...(job.platformLinks ?? {}), coupang: link };
          delete job.lintChecked;
          job.lintRequested = true;
          await saveJob(env, job);
          return json({ ok: true, affiliateUrl: link });
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
      await env.DB.prepare(
        'INSERT INTO draft_requests (slug, topic, content_type, opportunity, status, requested_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
        .bind(slug, topic, contentType, body.opportunity ?? null, 'pending', new Date().toISOString())
        .run();
      return json({ ok: true, slug }, 201);
    }

    const dr = path.match(/^draft-requests\/([a-z0-9가-힣-]+)\/done$/);
    if (dr && method === 'POST') {
      await env.DB.prepare('DELETE FROM draft_requests WHERE slug = ?').bind(decodeURIComponent(dr[1])).run();
      return json({ ok: true });
    }

    // ---------- 핫 키워드(워커가 push, UI 가 조회) ----------
    if (path === 'hot-keywords' && method === 'GET') {
      const { results: kws } = await env.DB.prepare(
        'SELECT topic, opportunity FROM hot_keywords ORDER BY opportunity DESC LIMIT 20',
      ).all();
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
    return json({ error: String(e?.message ?? e) }, 500);
  }
}
