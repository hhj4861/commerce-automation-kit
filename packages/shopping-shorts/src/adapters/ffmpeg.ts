/**
 * ffmpeg/ffprobe 실행 어댑터 — 유일하게 프로세스를 spawn 하는 곳.
 * 인자 조립은 core/ffargs.ts(순수)에서 하고, 여기는 실행·타임아웃·에러 투명화만.
 * (원자끼리 import 금지 규칙 때문에 shorts-publish 의 ffmpeg 어댑터 패턴을 복제한다)
 */
import { spawn } from 'node:child_process';
import { z } from 'zod';

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

const DEFAULT_TIMEOUT_MS = 300_000;

export function runFf(
  bin: 'ffmpeg' | 'ffprobe',
  args: string[],
  opts: { timeoutMs?: number } = {},
): Promise<RunResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`${bin} 타임아웃(${timeoutMs}ms) — 인자: ${args.join(' ')}`));
    }, timeoutMs);

    child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')));

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        reject(new Error(`${bin} 실행 파일을 찾을 수 없음 — ffmpeg 설치 필요 (brew install ffmpeg)`));
      } else {
        reject(new Error(`${bin} spawn 실패: ${err.message}`));
      }
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

/** stderr 의 마지막 비어있지 않은 줄(에러 원인 투명화용). */
export function lastLine(text: string): string {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.at(-1) ?? '(stderr 없음)';
}

const probeJsonSchema = z.object({
  streams: z
    .array(
      z.object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        duration: z.union([z.string(), z.number()]).optional(),
      }),
    )
    .min(1),
});

export interface ProbeResult {
  width: number;
  height: number;
  durationSec: number;
}

function buildProbeArgs(input: string): string[] {
  return [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,duration',
    '-of', 'json',
    input,
  ];
}

/** 입력 영상의 해상도·길이 조회(ffprobe JSON + zod 검증). */
export async function probe(input: string): Promise<ProbeResult> {
  const res = await runFf('ffprobe', buildProbeArgs(input));
  if (res.code !== 0) {
    throw new Error(`ffprobe 실패(exit ${res.code}): ${lastLine(res.stderr)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(res.stdout);
  } catch {
    throw new Error(`ffprobe 출력이 JSON 이 아님: ${res.stdout.slice(0, 200)}`);
  }
  const checked = probeJsonSchema.safeParse(parsed);
  if (!checked.success) {
    throw new Error(`ffprobe 출력 스키마 불일치: ${checked.error.issues.map((i) => i.message).join('; ')}`);
  }
  const s = checked.data.streams[0]!;
  const durationSec = Number(s.duration);
  if (!Number.isFinite(durationSec)) {
    throw new Error(`ffprobe 가 duration 을 주지 않음(컨테이너 특성) — 입력: ${input}`);
  }
  return { width: s.width, height: s.height, durationSec };
}

/** ffmpeg 실행 후 비정상 종료면 stderr 마지막 줄 포함해 실패시킨다. */
export async function runFfmpegOrThrow(args: string[]): Promise<void> {
  const res = await runFf('ffmpeg', args);
  if (res.code !== 0) {
    throw new Error(`ffmpeg 실패(exit ${res.code}): ${lastLine(res.stderr)}`);
  }
}
