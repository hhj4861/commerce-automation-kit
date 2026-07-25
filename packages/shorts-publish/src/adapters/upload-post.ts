/**
 * upload-post.com HTTP 어댑터 — 유일하게 네트워크를 치는 곳.
 * 필드 조립은 core/upload.ts(순수), 여기는 multipart 전송·에러 투명화만.
 *
 * 하나의 REST 호출로 YouTube/Instagram/TikTok 동시 게시. 무료 10건/월.
 * 비동기 처리 상태는 request_id 로 폴링한다.
 */
import { openAsBlob } from 'node:fs';
import { basename } from 'node:path';
import type { PublishTarget, PublishResult } from '@cak/contracts';
import { buildUploadTextFields, UPLOAD_ENDPOINT, UPLOAD_STATUS_ENDPOINT } from '../core/upload.js';

export interface UploadOpts {
  apiKey: string;
  /** upload-post 대시보드의 프로필(user) 이름 */
  user: string;
  /** 9:16 mp4 로컬 경로 */
  video: string;
  target: PublishTarget;
  /** 커버 이미지(선택) */
  thumbnail?: string;
}

/** 완성된 세로 영상 1개를 여러 플랫폼에 동시 업로드. */
export async function uploadShort(opts: UploadOpts): Promise<PublishResult> {
  const { apiKey, user, video, target, thumbnail } = opts;
  if (!apiKey) throw new Error('apiKey 없음 (UPLOAD_POST_API_KEY)');
  if (!user) throw new Error('user 없음 (UPLOAD_POST_USER) — upload-post 대시보드의 프로필 이름');
  if (target.platforms.length === 0) throw new Error('platforms 비어있음');

  const form = new FormData();
  form.append('video', await openAsBlob(video), basename(video));
  for (const f of buildUploadTextFields(target, user)) form.append(f.name, f.value);
  if (thumbnail !== undefined) {
    const tb = await openAsBlob(thumbnail);
    form.append('thumbnail', tb, basename(thumbnail));
    form.append('cover_image', tb, basename(thumbnail));
  }

  let res: Response;
  try {
    res = await fetch(UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Apikey ${apiKey}` },
      body: form,
    });
  } catch (e) {
    // 네트워크 순단은 투명화(호출측이 재시도 판단)
    return { ok: false, status: 0, failures: [`fetch 실패: ${e instanceof Error ? e.message : String(e)}`] };
  }

  const body = await readBody(res);
  const requestId = extractRequestId(body);
  const result: PublishResult = { ok: res.ok, status: res.status, body };
  if (requestId !== undefined) result.requestId = requestId;
  if (!res.ok) result.failures = [`HTTP ${res.status}: ${summarize(body)}`];
  return result;
}

export interface StatusResult {
  ok: boolean;
  status: number;
  body: unknown;
}

/** 비동기 처리 상태 폴링(request_id 기준). */
export async function pollStatus(apiKey: string, requestId: string): Promise<StatusResult> {
  const url = `${UPLOAD_STATUS_ENDPOINT}?request_id=${encodeURIComponent(requestId)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Apikey ${apiKey}` } });
  } catch (e) {
    // uploadShort 와 동일하게 네트워크 순단은 status 0 으로 투명화(호출측이 exit 75 로 재시도 판단)
    return { ok: false, status: 0, body: `fetch 실패: ${e instanceof Error ? e.message : String(e)}` };
  }
  return { ok: res.ok, status: res.status, body: await readBody(res) };
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractRequestId(body: unknown): string | undefined {
  if (body !== null && typeof body === 'object') {
    const rec = body as Record<string, unknown>;
    const id = rec['request_id'] ?? rec['requestId'];
    if (typeof id === 'string' && id.length > 0) return id;
  }
  return undefined;
}

function summarize(body: unknown): string {
  if (typeof body === 'string') return body.slice(0, 200);
  try {
    return JSON.stringify(body).slice(0, 200);
  } catch {
    return '(응답 파싱 불가)';
  }
}
