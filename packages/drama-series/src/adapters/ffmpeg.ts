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

/** 앞 클립 마지막 프레임과 다음 클립 첫 프레임의 SSIM(0~1). 컷 경계가 이어지는지 본다. */
export function joinSimilarity(prev: string, next: string): number {
  const r = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-sseof', '-0.1', '-i', prev, '-i', next, '-filter_complex', '[0:v]scale=640:360,setsar=1,trim=end_frame=1,reverse,trim=end_frame=1[a];[1:v]scale=640:360,setsar=1,trim=end_frame=1[b];[a][b]ssim', '-frames:v', '1', '-f', 'null', '-'],
    { encoding: 'utf8' },
  );
  const m = /All:([0-9.]+)/.exec(r.stderr);
  if (r.status !== 0 || !m) throw new FfmpegError(`경계 비교 실패: ${prev} → ${next} ${r.stderr.slice(-300)}`);
  return Number(m[1]);
}
