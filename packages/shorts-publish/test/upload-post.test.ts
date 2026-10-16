/**
 * upload-post HTTP 어댑터 테스트 — global.fetch 를 목킹해 실패/성공 경로와
 * 에러 투명화(status 0 / failures)를 검증. openAsBlob 은 실파일 없이 목킹.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('node:fs', () => ({ openAsBlob: async () => new Blob(['x']) }));

import type { PublishTarget } from '@cak/contracts';
import { uploadShort, pollStatus, listProfiles } from '../src/adapters/upload-post.js';

const target: PublishTarget = { platforms: ['youtube'], title: 'T', aiDisclosed: true };

afterEach(() => vi.unstubAllGlobals());

it('reads the selected profile with its opaque destination ID, preserving list mode', async () => {
  const body = { success: true, profile: { username: 'u/name', social_accounts: {
    instagram: { username: '123', handle: 'test_account', reauth_required: false },
  } } };
  const fetcher = vi.fn(async (_url: string, _options: RequestInit) => new Response(JSON.stringify(body)));
  vi.stubGlobal('fetch', fetcher);
  expect((await listProfiles('k', 'u/name')).body).toEqual(body);
  expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.upload-post.com/api/uploadposts/users/u%2Fname');
  await listProfiles('k');
  expect(fetcher.mock.calls[1]?.[0]).toBe('https://api.upload-post.com/api/uploadposts/users');
});

describe('uploadShort', () => {
  it('네트워크 순단 → status 0 + failures(투명화, silent drop 아님)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    const r = await uploadShort({ apiKey: 'k', user: 'u', video: '/x.mp4', target });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(0);
    expect(r.failures?.[0]).toContain('fetch 실패');
  });

  it('비2xx → ok=false + failures 에 HTTP 코드', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'bad' }), { status: 400 })));
    const r = await uploadShort({ apiKey: 'k', user: 'u', video: '/x.mp4', target });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
    expect(r.failures?.[0]).toContain('HTTP 400');
  });

  it('성공 + request_id → requestId 세팅', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ request_id: 'abc' }), { status: 200 })));
    const r = await uploadShort({ apiKey: 'k', user: 'u', video: '/x.mp4', target });
    expect(r.ok).toBe(true);
    expect(r.requestId).toBe('abc');
    expect(r.failures).toBeUndefined();
  });

  it('apiKey/user 없으면 즉시 throw(사용법 실패)', async () => {
    await expect(uploadShort({ apiKey: '', user: 'u', video: '/x.mp4', target })).rejects.toThrow('apiKey');
  });
});

describe('pollStatus', () => {
  it('네트워크 순단 → status 0(일시적, exit 75 로 매핑되게)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('down'); }));
    const s = await pollStatus('k', 'req');
    expect(s.ok).toBe(false);
    expect(s.status).toBe(0);
  });

  it('정상 응답 파싱', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'done' }), { status: 200 })));
    const s = await pollStatus('k', 'req');
    expect(s.ok).toBe(true);
    expect(s.status).toBe(200);
    expect(s.body).toEqual({ status: 'done' });
  });
});


it('passes the stable request id and idempotency key, without retrying POST', async () => {
  const fetcher = vi.fn(async (_url: unknown, _options: RequestInit) => new Response(JSON.stringify({request_id: 'stable-id'})));
  vi.stubGlobal('fetch', fetcher);
  await uploadShort({apiKey:'k', user:'u', video:'/x.mp4', target,
    requestId:'stable-id', idempotencyKey:'stable-key'});
  expect(fetcher).toHaveBeenCalledTimes(1);
  const options = fetcher.mock.calls[0]![1] as unknown as RequestInit;
  expect(options.headers).toMatchObject({'Idempotency-Key':'stable-key'});
  expect((options.body as FormData).get('request_id')).toBe('stable-id');
  expect((options.body as FormData).get('async_upload')).toBe('true');
});
