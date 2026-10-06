import { spawnSync } from 'node:child_process';

export class FfmpegError extends Error {}

export function ffmpegAvailable(): boolean {
  return spawnSync('ffmpeg', ['-version']).status === 0;
}

export function runFfmpeg(args: string[]): void {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  if (r.error || r.status !== 0) throw new FfmpegError(`ffmpeg 실패: ${r.error?.message ?? r.stderr.slice(-800)}`);
}

export function probeDuration(file: string): number {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' });
  const d = Number(r.stdout.trim());
  if (r.status !== 0 || !Number.isFinite(d)) throw new FfmpegError(`길이 확인 실패: ${file}`);
  return d;
}

export function hasAudio(file: string): boolean {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim().length > 0;
}
