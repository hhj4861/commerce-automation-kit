import { readFileSync, readdirSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
export const root = fileURLToPath(new URL('../../../', import.meta.url));
export const baseline = 'eae6be572e33e0c0932a5deeb3e44685c2127aa6';
const source = join(root, 'docs/videos/20261006-regression-pilot');
const sha = b => createHash('sha256').update(b).digest('hex');
export function captureLegacy(work) {
  mkdirSync(work, { recursive: true });
  const gates = join(work, 'gates'); mkdirSync(gates);
  const names = ['series.json', 'ep01-9min.json', ...readdirSync(join(source, 'gates-9min')).filter(x => x.endsWith('.json')).sort().map(x => `gates-9min/${x}`)];
  const inputs = {};
  for (const name of names) {
    inputs[name] = sha(readFileSync(join(source, name)));
    copyFileSync(join(source, name), join(work, name.replace('gates-9min/', 'gates/')));
  }
  const common = ['--series', join(work, 'series.json'), '--episode', join(work, 'ep01-9min.json'), '--gates', gates];
  function run(command, args, out) {
    const r = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli/index.ts', command, ...args], {
      cwd: join(root, 'packages/drama-series'), encoding: 'utf8', timeout: 60_000, maxBuffer: 8 << 20,
    });
    if (r.error || r.signal || ![0, 1, 2].includes(r.status)) throw new Error(`legacy process failed: ${r.error ?? r.signal ?? r.stderr}`);
    const result = { exitCode: r.status, stdout: JSON.parse(r.stdout) };
    if (out) result.output = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
    // Only the documented wall-clock field may differ between runs.
    if (result.stdout.plan?.createdAt) result.stdout.plan.createdAt = '<createdAt>';
    if (result.output?.createdAt) result.output.createdAt = '<createdAt>';
    return result;
  }
  const validate = run('validate', common);
  const planFile = join(work, 'plan.json');
  const plan = run('plan', [...common, '--budget', '100000', '--out', planFile], planFile);
  const lowFile = join(work, 'low-budget.json');
  const lowBudget = run('plan', [...common, '--budget', '1', '--out', lowFile], lowFile);
  const reports = Object.fromEntries(readdirSync(gates).filter(x=>x.endsWith('.json')).sort().map(x=>[x, JSON.parse(readFileSync(join(gates,x),'utf8'))]));
  return { baseline, inputs, validate, plan, lowBudget, reports };
}
