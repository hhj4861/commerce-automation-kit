/** 로컬 실행 브릿지. 원자끼리 import하지 않고 공통 광고 엔진 CLI와 계약 JSON으로 대화한다. */
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shortsGenerationRequest, videoInputFingerprint } from './lib/video-generation.js';

const KIT_ROOT = fileURLToPath(new URL('../..', import.meta.url));

export function runVideoCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', '--silent', 'cli', '-w', '@cak/ad-video-gen', '--', ...args], {
      cwd: KIT_ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('공통 영상 생성기 시간 초과')); }, 30_000);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      try { resolve({ code: code ?? -1, data: JSON.parse(stdout) }); }
      catch { reject(new Error(`공통 영상 생성기 실패(${code}): ${stderr.slice(-300)}`)); }
    });
  });
}

export async function prepareShortsVideo(job, run = runVideoCli) {
  const request = shortsGenerationRequest(job);
  const sourceFingerprint = await videoInputFingerprint(job);
  const dir = await mkdtemp(join(tmpdir(), 'cak-video-plan-'));
  try {
    const path = join(dir, 'request.json');
    await writeFile(path, JSON.stringify(request));
    const result = await run(['video-plan', '--request', path]);
    if (result.code !== 0 || result.data?.ok !== true) {
      throw new Error(result.data?.problems?.join('\n') || '공통 영상 생성 계획 검증 실패');
    }
    return { sourceFingerprint, plan: result.data.plan };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
