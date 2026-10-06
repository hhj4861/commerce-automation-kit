import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

export class TranscribeError extends Error {}

export function parseWhisperJson(raw: unknown): string {
  if (typeof raw === 'object' && raw !== null && typeof (raw as { text?: unknown }).text === 'string')
    return (raw as { text: string }).text.trim();
  throw new TranscribeError('whisper JSON 에 text 가 없음');
}

/** small·medium 은 생성 영상의 한국어 대사를 자주 놓친다(2026-10-06 실측). 느려도 large-v3 를 쓴다. */
export const DEFAULT_WHISPER_MODEL = 'large-v3';

/** 로컬 whisper CLI(무료)로 한국어 받아쓰기. */
export function transcribe(media: string, workDir: string, model = DEFAULT_WHISPER_MODEL): string {
  mkdirSync(workDir, { recursive: true });
  const r = spawnSync('whisper', [media, '--language', 'ko', '--model', model, '--output_format', 'json', '--output_dir', workDir, '--fp16', 'False'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) throw new TranscribeError(`whisper 실패: ${r.error?.message ?? r.stderr.slice(-400)}`);
  return parseWhisperJson(JSON.parse(readFileSync(join(workDir, `${basename(media, extname(media))}.json`), 'utf8')));
}
