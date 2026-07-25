/**
 * ElevenLabs Music 어댑터 테스트 — fetch·writeFile 목킹.
 * music_length_ms 클램프, 반환 durationSec(클램프 반영), HTTP/빈응답 에러 검증.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

let lastBody: Record<string, unknown> = {};
vi.mock('node:fs/promises', () => ({ writeFile: async () => {} }));

import { generateElevenLabs } from '../src/adapters/elevenlabs.js';

function stubFetch(res: () => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      lastBody = init?.body ? JSON.parse(init.body as string) : {};
      return res();
    }),
  );
}
const okAudio = () => new Response(new Uint8Array([1, 2, 3, 4]).buffer, { status: 200 });

afterEach(() => {
  vi.unstubAllGlobals();
  lastBody = {};
});

describe('generateElevenLabs — 길이 클램프', () => {
  it('하한 미만(2s) → music_length_ms 3000, durationSec 3', async () => {
    stubFetch(okAudio);
    const t = await generateElevenLabs({ apiKey: 'k', prompt: 'p', lengthSec: 2, instrumental: true, outPath: '/x.mp3' });
    expect(lastBody['music_length_ms']).toBe(3000);
    expect(t.durationSec).toBe(3);
  });
  it('상한 초과(700s) → 600000, durationSec 600', async () => {
    stubFetch(okAudio);
    const t = await generateElevenLabs({ apiKey: 'k', prompt: 'p', lengthSec: 700, instrumental: true, outPath: '/x.mp3' });
    expect(lastBody['music_length_ms']).toBe(600000);
    expect(t.durationSec).toBe(600);
  });
  it('정상(30s) → 30000, force_instrumental/model 전달', async () => {
    stubFetch(okAudio);
    const t = await generateElevenLabs({ apiKey: 'k', prompt: 'p', lengthSec: 30, instrumental: true, modelId: 'music_v2', outPath: '/x.mp3' });
    expect(lastBody['music_length_ms']).toBe(30000);
    expect(lastBody['force_instrumental']).toBe(true);
    expect(lastBody['model_id']).toBe('music_v2');
    expect(t.durationSec).toBe(30);
    expect(t.backend).toBe('elevenlabs');
  });
});

describe('generateElevenLabs — 에러', () => {
  it('apiKey 없으면 throw', async () => {
    await expect(generateElevenLabs({ apiKey: '', prompt: 'p', lengthSec: 30, instrumental: true, outPath: '/x.mp3' }))
      .rejects.toThrow('apiKey');
  });
  it('비2xx → HTTP 코드 포함 throw(일시성 분류용)', async () => {
    stubFetch(() => new Response('rate limited', { status: 429 }));
    await expect(generateElevenLabs({ apiKey: 'k', prompt: 'p', lengthSec: 30, instrumental: true, outPath: '/x.mp3' }))
      .rejects.toThrow('HTTP 429');
  });
  it('빈 응답(0바이트) → throw', async () => {
    stubFetch(() => new Response(new Uint8Array([]).buffer, { status: 200 }));
    await expect(generateElevenLabs({ apiKey: 'k', prompt: 'p', lengthSec: 30, instrumental: true, outPath: '/x.mp3' }))
      .rejects.toThrow('비어있음');
  });
});
