import { resolvedEntries } from '../runtime/sdk.mjs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { realpathSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export const ATOMWORKS_COMMIT = 'ad94eaef54dbb0babe3b5916ca6122a5cc841545';
export const ATOMWORKS_LOCK_SHA = '7bd79fdfbc938f6e4927bb5e371c9b1df9c1689f955caa2e53316f5ad039c446';
const PIN_ROOT = fileURLToPath(new URL('../../../../../atomworks-worktrees/drama-consumer-pin/', import.meta.url));
/** Every failure is a fixed message: the CLI prints it, and Node/git messages would embed local paths.
 * `root` exists for tests only; callers use the fixed pin location. */
export function checkDependency(root = PIN_ROOT) {
  const [major, minor, patch] = process.versions.node.split('.').map(Number);
  if (major !== 22 || minor < 23 || (minor === 23 && patch < 3)) throw new Error('Node >=22.23.3 <23 required');
  const fixed = (message, read) => { try { return read(); } catch { throw new Error(message); } };
  // Explicit stdio captures git's own stderr, which names the directory; the default would inherit it.
  const git = (...args) => fixed('atomworks pin checkout unavailable', () => execFileSync('git', ['-C', root, ...args], {encoding:'utf8',timeout:10_000,stdio:['ignore','pipe','pipe']}).trim());
  if (git('rev-parse','HEAD') !== ATOMWORKS_COMMIT || git('status','--porcelain','--untracked-files=all')) throw new Error('atomworks pin must be clean and at the approved commit');
  const lock = fixed('atomworks lock unreadable', () => readFileSync(resolve(root, 'package-lock.json')));
  if (createHash('sha256').update(lock).digest('hex') !== ATOMWORKS_LOCK_SHA) throw new Error('atomworks lock mismatch');
  for (const [name, entry] of Object.entries(fixed('atomworks SDK entries unresolved', resolvedEntries))) {
    const [installed, expected] = fixed(`unexpected dependency: ${name}`, () => [realpathSync(fileURLToPath(entry)), realpathSync(resolve(root, 'packages/ts', name.split('/')[0]))]);
    if (!installed.startsWith(expected + '/dist/')) throw new Error(`unexpected dependency: ${name}`);
  }
  return { root, commit: ATOMWORKS_COMMIT };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify({ok:true,...checkDependency()})); }
  catch(e) { console.error(e.message); process.exitCode=2; }
}
