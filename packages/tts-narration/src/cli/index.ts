/**
 * tts-narration CLI (원자 #13)
 *
 * 사용법:
 *   generate --text "안녕하세요" --out vo.mp3
 *   generate --file script.txt --out vo.mp3            # 파일 전체를 한 트랙으로
 *   script --script shorts-script.json --outdir vo/     # ShortsScript.beats[].narration
 *          [--join vo/full.mp3]                          # 비트 mp3를 순서대로 이어붙임(ffmpeg)
 *
 * 키: ELEVENLABS_API_KEY (음성/모델 재정의: ELEVENLABS_VOICE_ID / ELEVENLABS_TTS_MODEL)
 * script 결과는 manifest(NarrationBatchResult)를 outdir/narration.json 에 남긴다.
 */
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import type { NarrationBatchResult, NarrationClip, ShortsScript } from '@cak/contracts';
import { synthesizeNarration } from '../adapters/elevenlabs.js';

const run = promisify(execFile);

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY 가 필요합니다');
  return key;
}

async function cmdGenerate(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      text: { type: 'string' },
      file: { type: 'string' },
      out: { type: 'string' },
    },
  });
  const out = values.out;
  if (!out) throw new Error('--out <mp3 경로> 가 필요합니다');
  const text = values.text ?? (values.file ? await readFile(resolve(values.file), 'utf8') : '');
  if (!text.trim()) throw new Error('--text 또는 --file 로 내레이션 텍스트를 주세요');

  const clip = await synthesizeNarration({ apiKey: apiKey(), text, outPath: resolve(out) });
  console.log(JSON.stringify(clip, null, 2));
}

async function cmdScript(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      script: { type: 'string' },
      outdir: { type: 'string' },
      join: { type: 'string' },
    },
  });
  if (!values.script || !values.outdir) {
    throw new Error('--script <ShortsScript json> --outdir <폴더> 가 필요합니다');
  }
  const script = JSON.parse(await readFile(resolve(values.script), 'utf8')) as ShortsScript;
  if (!Array.isArray(script.beats) || script.beats.length === 0) {
    throw new Error('beats 가 비어있음 — ShortsScript 형식인지 확인하세요');
  }

  const outdir = resolve(values.outdir);
  await mkdir(outdir, { recursive: true });

  // 비트 순서 보장을 위해 index 로 정렬 후 순차 생성 (rate limit 배려)
  const beats = [...script.beats].sort((a, b) => a.index - b.index);
  const clips: NarrationClip[] = [];
  for (const beat of beats) {
    const outPath = join(outdir, `beat-${String(beat.index).padStart(2, '0')}.mp3`);
    const clip = await synthesizeNarration({ apiKey: apiKey(), text: beat.narration, outPath });
    clips.push(clip);
    console.error(`✓ beat ${beat.index} (${beat.role}) → ${outPath}`);
  }

  const result: NarrationBatchResult = { clips };
  if (values.join) {
    const joined = resolve(values.join);
    // ffmpeg concat demuxer — 경로에 공백이 있어도 안전하게 단일 트랙으로
    const listPath = join(outdir, 'concat.txt');
    await writeFile(listPath, clips.map((c) => `file '${c.file.replaceAll("'", "'\\''")}'`).join('\n'));
    await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:a', 'libmp3lame', '-q:a', '2', joined]);
    result.joinedFile = joined;
    console.error(`✓ joined → ${joined}`);
  }

  await writeFile(join(outdir, 'narration.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'generate') return cmdGenerate(rest);
  if (cmd === 'script') return cmdScript(rest);
  console.error('사용법: tts-narration <generate|script> [옵션] — 파일 상단 주석 참조');
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
