import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { synthesizeNarration } from '../src/adapters/elevenlabs.js';

const ok = (bytes = 'audio') => new Response(bytes, { status: 200 });

describe('ElevenLabs 네트워크 재시도', () => {
  it('공식 타임스탬프 응답의 원문과 정렬을 검증해 계약에 보존한다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tts-timing-'));
    const text = '안녕';
    const alignment = { characters: ['안','녕'], character_start_times_seconds:[0,.2], character_end_times_seconds:[.2,.5] };
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({audio_base64:Buffer.from('audio').toString('base64'),alignment})));
    const clip = await synthesizeNarration({apiKey:'k', text, outPath:join(dir,'voice.mp3'),timestamps:true,fetchFn});
    expect(fetchFn.mock.calls[0]?.[0]).toContain('/with-timestamps?');
    expect(clip.alignment).toEqual(alignment);
    expect((await readFile(clip.file)).toString()).toBe('audio');
  });

  it('타임스탬프 요청이 정렬 없는 응답을 받으면 무음으로 대체하지 않는다', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({audio_base64:'YWJj'})));
    await expect(synthesizeNarration({apiKey:'k',text:'안녕',outPath:join(tmpdir(),'never-timing.mp3'),timestamps:true,fetchFn})).rejects.toThrow('오디오 수신 실패');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it('연결 수립 전 오류는 지수 백오프로 재시도한다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tts-retry-'));
    const outPath = join(dir, 'voice.mp3');
    const error = Object.assign(new Error('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
    const fetchFn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(ok());
    const sleep = vi.fn().mockResolvedValue(undefined);

    await synthesizeNarration({ apiKey: 'test', text: '안녕하세요', outPath, fetchFn, sleep });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(500);
    expect((await readFile(outPath)).toString()).toBe('audio');
  });

  it('원인 코드 없는 응답 유실은 이중 과금 방지를 위해 자동 재시도하지 않는다', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('fetch failed'));
    await expect(synthesizeNarration({
      apiKey: 'test', text: '안녕하세요', outPath: join(tmpdir(), 'never.mp3'), fetchFn, sleep: vi.fn(),
    })).rejects.toThrow('fetch 실패');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('429는 Retry-After를 존중해 재시도한다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tts-rate-'));
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429, headers: { 'retry-after': '1' } }))
      .mockResolvedValueOnce(ok());
    const sleep = vi.fn().mockResolvedValue(undefined);
    await synthesizeNarration({ apiKey: 'test', text: '안녕하세요', outPath: join(dir, 'voice.mp3'), fetchFn, sleep });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it('401 같은 설정 오류는 재시도하지 않는다', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 }));
    await expect(synthesizeNarration({
      apiKey: 'bad', text: '안녕하세요', outPath: join(tmpdir(), 'never.mp3'), fetchFn, sleep: vi.fn(),
    })).rejects.toThrow('HTTP 401');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
