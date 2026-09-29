import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const configuration = JSON.parse(readFileSync(new URL('./targets.json', import.meta.url), 'utf8'));

export function plan({ eventName, event, repository }) {
  if (repository !== configuration.repository) throw new Error('Unexpected repository');
  if (!['push', 'workflow_dispatch'].includes(eventName)) throw new Error('Deployment event not allowed');
  if (event.deleted || event.created) return { include: [] }; // Seeding a release branch never deploys.
  if (event.forced) throw new Error('Forced branch update cannot deploy');
  const entry = Object.entries(configuration.targets).find(([, t]) => event.ref === `refs/heads/${t.branch}`);
  if (!entry) throw new Error('Select a configured deployment branch');
  const [name, target] = entry;
  if (eventName === 'workflow_dispatch' && event.inputs?.target !== name) throw new Error('Target and branch differ');
  // Every promotion deploys its branch's platform. Path-skipping could lose a
  // relevant queued deployment when a later unrelated merge supersedes it.
  return { include: [{ name, driver: target.driver, branch: target.branch }] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    event.ref ||= process.env.GITHUB_REF;
    if (process.env.GITHUB_EVENT_NAME === 'push' && !event.created && !event.deleted) {
      for (const sha of [event.before, event.after]) {
        if (!/^[a-f0-9]{40}$/.test(sha || '') || /^0+$/.test(sha)) throw new Error('Missing full revision');
      }
    }
    const matrix = plan({ eventName: process.env.GITHUB_EVENT_NAME, event, repository: process.env.GITHUB_REPOSITORY });
    const json = JSON.stringify(matrix);
    console.log(json);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${json}\nready=${matrix.include.length > 0}\n`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
