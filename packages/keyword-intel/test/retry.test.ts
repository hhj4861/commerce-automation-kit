/**
 * withRetry — 지수 백오프, 비재시도 즉시 전파, 시도 상한.
 */
import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../src/obs/retry.js';

const noSleep = async (): Promise<void> => {};

describe('withRetry', () => {
  it('일시 장애는 백오프 후 재시도해 성공하고, 대기시간은 지수 증가한다', async () => {
    let calls = 0;
    const fn = async (): Promise<string> => {
      calls += 1;
      if (calls < 3) throw new Error('boom');
      return 'ok';
    };
    const delays: number[] = [];
    const r = await withRetry(fn, {
      shouldRetry: () => true,
      sleep: noSleep,
      onRetry: (_e, _a, d) => delays.push(d),
    });
    expect(r).toBe('ok');
    expect(calls).toBe(3);
    expect(delays).toHaveLength(2);
    expect(delays[1]!).toBeGreaterThan(delays[0]!); // base*2^n — 지터 포함해도 단조 증가 구간
  });

  it('비재시도 오류는 즉시 던진다 (1회 시도)', async () => {
    const fn = vi.fn(async () => {
      throw new Error('fatal');
    });
    await expect(withRetry(fn, { shouldRetry: () => false, sleep: noSleep })).rejects.toThrow('fatal');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('maxAttempts 소진 시 마지막 오류를 던진다', async () => {
    const fn = vi.fn(async () => {
      throw new Error('always');
    });
    await expect(
      withRetry(fn, { maxAttempts: 3, shouldRetry: () => true, sleep: noSleep }),
    ).rejects.toThrow('always');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
