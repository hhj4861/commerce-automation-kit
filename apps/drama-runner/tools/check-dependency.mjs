import { resolvedEntries } from '../runtime/sdk.mjs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { realpathSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export const ATOMWORKS_COMMIT = 'ad94eaef54dbb0babe3b5916ca6122a5cc841545';
export const ATOMWORKS_LOCK_SHA = '7bd79fdfbc938f6e4927bb5e371c9b1df9c1689f955caa2e53316f5ad039c446';
export function checkDependency() {
  const [major, minor, patch] = process.versions.node.split('.').map(Number);
  if (major !== 22 || minor < 23 || (minor === 23 && patch < 3)) throw new Error('Node >=22.23.3 <23 required');
  const root = fileURLToPath(new URL('../../../../../atomworks-worktrees/drama-consumer-pin/', import.meta.url));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], {encoding:'utf8',timeout:10_000}).trim();
  if (git('rev-parse','HEAD') !== ATOMWORKS_COMMIT || git('status','--porcelain','--untracked-files=all')) throw new Error('atomworks pin must be clean and at the approved commit');
  if (createHash('sha256').update(readFileSync(resolve(root, 'package-lock.json'))).digest('hex') !== ATOMWORKS_LOCK_SHA) throw new Error('atomworks lock mismatch');
  for (const [name, entry] of Object.entries(resolvedEntries())) {
    const installed = realpathSync(fileURLToPath(entry));
    const expected = realpathSync(resolve(root, 'packages/ts', name));
    if (!installed.startsWith(expected + '/dist/')) throw new Error(`unexpected dependency: ${name}`);
  }
  return { root, commit: ATOMWORKS_COMMIT };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify({ok:true,...checkDependency()})); }
  catch(e) { console.error(e.message); process.exitCode=2; }
}
