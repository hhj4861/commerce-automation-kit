/**
 * ffmpeg/ffprobe 실행 어댑터 — 프로세스를 spawn 하는 유일한 곳.
 * 인자 조립은 core(순수), 여기는 실행·타임아웃·에러 투명화 + 길이 프로브만.
 * (원자끼리 import 금지 규칙 때문에 다른 원자의 ffmpeg 어댑터 패턴을 복제한다)
 */
import { spawn } from 'node:child_process';
import { z } from 'zod';

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

// 롱폼(수십 분) 인코딩은 오래 걸려 타임아웃을 넉넉히 둔다.
const DEFAULT_TIMEOUT_MS = 1_800_000;

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
      reject(new Error(`${bin} 타임아웃(${timeoutMs}ms)`));
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

export function lastLine(text: string): string {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.at(-1) ?? '(stderr 없음)';
}

const probeSchema = z.object({
  format: z.object({ duration: z.union([z.string(), z.number()]).optional() }).optional(),
});

/** 오디오/영상 파일의 길이(초). */
export async function probeDuration(input: string): Promise<number> {
  const res = await runFf('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', input,
  ]);
  if (res.code !== 0) throw new Error(`ffprobe 실패(exit ${res.code}): ${lastLine(res.stderr)}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(res.stdout);
  } catch {
    throw new Error(`ffprobe 출력이 JSON 이 아님: ${res.stdout.slice(0, 200)}`);
  }
  const checked = probeSchema.safeParse(parsed);
  const dur = Number(checked.success ? checked.data.format?.duration : NaN);
  if (!Number.isFinite(dur)) throw new Error(`ffprobe 가 duration 을 주지 않음 — 입력: ${input}`);
  return dur;
}

/** ffmpeg 실행 후 비정상 종료면 stderr 마지막 줄 포함해 실패시킨다. */
export async function runFfmpegOrThrow(args: string[]): Promise<void> {
  const res = await runFf('ffmpeg', args);
  if (res.code !== 0) throw new Error(`ffmpeg 실패(exit ${res.code}): ${lastLine(res.stderr)}`);
}
