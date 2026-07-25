/**
 * Suno 가드 스텁 테스트 — 하드 금지선 #2(비공식 엔드포인트 접근 금지)의 회귀 방지.
 * 미래에 누군가 generateSuno 를 실제/비공식 백엔드에 연결하면 이 테스트가 깨진다.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateSuno, SUNO_OFFICIAL_API_AVAILABLE } from '../src/adapters/suno.js';

afterEach(() => vi.unstubAllGlobals());

describe('generateSuno (가드 스텁)', () => {
  it('공식 API 부재 플래그가 false', () => {
    expect(SUNO_OFFICIAL_API_AVAILABLE).toBe(false);
  });

  it('항상 거부하며 suno-manual 로 안내한다', async () => {
    await expect(generateSuno()).rejects.toThrow('suno-manual');
  });

  it('네트워크를 절대 치지 않는다(비공식 엔드포인트 접근 금지)', async () => {
    const spy = vi.fn(async () => new Response('x'));
    vi.stubGlobal('fetch', spy);
    await expect(generateSuno()).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});
