import { parseStrictJson } from '../core/strict-json.js';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { constants, openSync, closeSync, readSync, writeSync, fstatSync, lstatSync } from 'node:fs';
import { contentSha, ReleaseSourceError } from '../core/release-source.js';

const MAX_BYTES = 256 * 1024 * 1024;
const TIMEOUT = 30_000;
/** Descriptors and copies are read from one opened, non-symlink regular file. */
export function inspectFile(path: string, copyTo?: string): { sha256: string; bytes: number } {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let output: number | undefined;
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size <= 0 || before.size > MAX_BYTES) throw new ReleaseSourceError('입력 파일은 1바이트~256MiB 일반 파일이어야 함');
    if (copyTo) output = openSync(copyTo, 'wx', 0o600);
    const hash = createHash('sha256'), chunk = Buffer.alloc(64 * 1024);
    let bytes = 0, n: number;
    while ((n = readSync(fd, chunk, 0, chunk.length, null)) > 0) {
      bytes += n;
      if (bytes > MAX_BYTES) throw new ReleaseSourceError('입력 파일 크기 제한 초과');
      hash.update(chunk.subarray(0, n));
      if (output !== undefined) {
        let written = 0;
        while (written < n) written += writeSync(output, chunk, written, n - written);
      }
    }
    const after = fstatSync(fd), pathNow = lstatSync(path);
    if (before.size !== bytes || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || before.ino !== pathNow.ino || before.dev !== pathNow.dev || pathNow.isSymbolicLink())
      throw new ReleaseSourceError('검사 중 입력 파일 변경');
    return { sha256: 'sha256:' + hash.digest('hex'), bytes };
  } finally { if (output !== undefined) closeSync(output); closeSync(fd); }
}
export function media(command: 'ffmpeg' | 'ffprobe', args: string[]): string {
  const r = spawnSync(command, args, { encoding:'utf8', timeout:TIMEOUT, maxBuffer:4 * 1024 * 1024 });
  if (r.error || r.signal || r.status !== 0) throw new ReleaseSourceError(`${command} 전체 디코딩/검사 실패 (${r.error?.message ?? r.signal ?? r.status}): ${r.stderr?.slice(-400) ?? ''}`);
  return r.stdout;
}
export const videoInput = (clip: string) => ['-protocol_whitelist','file,pipe','-f','mov','-i',clip];
export function probe(clip: string): void {
  const info = JSON.parse(media('ffprobe', ['-v','error',...videoInput(clip),'-select_streams','v:0','-show_entries','stream=width,height:format=duration','-of','json']));
  const s = info.streams?.[0], duration = Number(info.format?.duration);
  if (!s || !Number.isInteger(s.width) || !Number.isInteger(s.height) || s.width < 1 || s.height < 1 || s.width > 4096 || s.height > 4096 || !Number.isFinite(duration) || duration <= 0 || duration > 120)
    throw new ReleaseSourceError('클립 범위 초과: 영상 스트림·최대4096px·120초 필요');
}
export function pixelFrames(input: string[]): string[] {
  // Check image dimensions before full PNG decoding as well as video dimensions.
  const info = JSON.parse(media('ffprobe', ['-v','error',...input,'-select_streams','v:0','-show_entries','stream=width,height','-of','json']));
  const stream = info.streams?.[0];
  if (!stream || !Number.isInteger(stream.width) || !Number.isInteger(stream.height) || stream.width < 1 || stream.height < 1 || stream.width > 4096 || stream.height > 4096)
    throw new ReleaseSourceError('프레임 크기 범위 초과');
  const text = media('ffmpeg', ['-v','error','-nostdin','-xerror',...input,'-map','0:v:0','-an','-sn','-dn','-vf','format=rgb24','-fps_mode','passthrough','-threads','1','-c:v','rawvideo','-f','framehash','-hash','sha256','pipe:1']);
  const dimensions = /^#dimensions\s+0:\s+(\d+)x(\d+)$/m.exec(text);
  if (!dimensions) throw new ReleaseSourceError('디코딩 프레임 크기 누락');
  const rows = text.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  if (!rows.length || rows.length > 100_000) throw new ReleaseSourceError('디코딩된 프레임 없음 또는 한도 초과');
  return rows.map(row => {
    const cells = row.split(',').map(x => x.trim());
    if (cells.length !== 6 || cells[0] !== '0' || !/^[0-9a-f]{64}$/.test(cells[5]!)) throw new ReleaseSourceError('프레임 해시 형식 오류');
    return contentSha({ width:Number(dimensions[1]), height:Number(dimensions[2]), rgb24Sha256:cells[5] });
  });
}
export const imageInput = (path: string) => ['-protocol_whitelist','file,pipe','-f','png_pipe','-i',path];

/** Bounded descriptor read: reject FIFO/devices before reading, never follow symlinks. */
export function readStrictJsonFile(path:string):unknown {
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try {
    const before=fstatSync(fd),limit=1_048_576;
    if(!before.isFile() || before.size<1 || before.size>limit)throw new Error('JSON은 1바이트~1MiB 일반 파일이어야 함');
    const data=Buffer.alloc(before.size+1);
    let count=0,n=0;
    while(count<data.length && (n=readSync(fd,data,count,data.length-count,null))>0)count+=n;
    const after=fstatSync(fd),now=lstatSync(path);
    if(count!==before.size || after.size!==before.size || after.mtimeMs!==before.mtimeMs || after.ctimeMs!==before.ctimeMs || now.ino!==before.ino || now.dev!==before.dev || now.isSymbolicLink())throw new Error('JSON 읽기 중 파일 변경');
    return parseStrictJson(new TextDecoder('utf-8',{fatal:true}).decode(data.subarray(0,count)));
  } finally {closeSync(fd);}
}
