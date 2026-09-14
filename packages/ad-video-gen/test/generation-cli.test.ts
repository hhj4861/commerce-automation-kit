import { expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

it('루트 공통 명령이 계획을 저장하고 검증 실패 시 이전 승인 계획을 교체한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cak-common-cli-'));
  const root = fileURLToPath(new URL('../../..', import.meta.url));
  const input = join(dir, 'request.json');
  const output = join(dir, 'video-plan.json');
  const request = {
    target: 'ad', tier: 'standard',
    concept: {
      subject: '테스트 머그', sellingPoints: ['분리형 손잡이'], evidence: ['테스트 제품 명세'],
      uniqueness: { passed: true, rationale: 'A removable handle.' }, narrativeComplete: true, humanApproved: true,
      beats: [{ index: 0, durationSec: 5, description: 'A sculptural mug in studio lighting.', emphasis: 'hero' }],
    },
  };
  const run = (command: string, args: string[]) => spawnSync('npm', ['run', '--silent', command, '--', ...args], {
    cwd: root, encoding: 'utf8', timeout: 15_000,
  });
  try {
    writeFileSync(input, JSON.stringify(request));
    const success = run('video:plan', ['--request', input, '--out', output]);
    expect(success.status, success.stderr).toBe(0);
    const plan = JSON.parse(readFileSync(output, 'utf8'));
    expect(plan).toEqual(JSON.parse(success.stdout).plan);
    expect(plan.clips[0]).toMatchObject({ model: 'seedance_2_0', resolution: '1080p' });
    for (const invalid of [
      { ...request, concept: { ...request.concept, humanApproved: false } },
      { ...request, tier: 'invalid' },
    ]) {
      writeFileSync(output, JSON.stringify(plan));
      writeFileSync(input, JSON.stringify(invalid));
      const failure = run('video:plan', ['--request', input, '--out', output]);
      expect(failure.status, failure.stderr).toBe(1);
      const saved = JSON.parse(readFileSync(output, 'utf8'));
      expect(saved.ok).toBe(false);
      expect(saved).not.toHaveProperty('clips');
      expect(saved).toEqual(JSON.parse(failure.stdout));
    }
    const estimate = run('video:estimate', ['--durations', '5']);
    expect(estimate.status, estimate.stderr).toBe(0);
    expect(JSON.parse(estimate.stdout)).toMatchObject({ model: 'seedance_2_0', referenceCredits: 45, costPreflightRequired: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 30_000);
