// JEV 1회 전송: 임시 키(요청 1회·$0.01·1h) 발급 → 호출 → 즉시 회수. 결과 파일에 키는 남지 않는다.
//   node .claude/skills/drama-series/scripts/jev-relay.mjs --request req.json --out res.json
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { request: { type: 'string' }, out: { type: 'string' } } });
if (!values.request || !values.out) {
  console.error('usage: jev-relay.mjs --request req.json --out res.json');
  process.exit(2);
}
const body = fs.readFileSync(values.request, 'utf8');
if (/"(expected|label|answer|gold)"\s*:/i.test(body)) throw Error('label_leak');
const code = fs.readFileSync(new URL('relay.py', import.meta.url), 'utf8');
const quote = (s) => "'" + s.replaceAll("'", "'\"'\"'") + "'";
const child = spawn('/opt/homebrew/share/google-cloud-sdk/bin/gcloud', ['compute', 'ssh', 'shared-ai', '--project=replay-live-508202', '--zone=us-central1-a', '--account=guswhd1085@gmail.com', '--tunnel-through-iap', '--quiet', '--ssh-flag=-o ConnectTimeout=15', '--ssh-flag=-o BatchMode=yes', '--command', 'sudo -n python3 -u -c ' + quote(code)], { stdio: ['pipe', 'pipe', 'pipe'] });
const events = [];
let stderr = '';
child.stderr.on('data', (d) => { stderr += d; });
createInterface({ input: child.stdout }).on('line', (line) => {
  if (!line.startsWith('{')) return;
  const x = JSON.parse(line);
  events.push(x);
  if (x.event === 'ready') child.stdin.write(JSON.stringify(JSON.parse(body)) + '\n');
  if (x.event === 'response' || x.event === 'failure') child.stdin.end();
});
const sshExit = await new Promise((r) => child.on('close', r));
fs.writeFileSync(values.out, JSON.stringify({ sshExit, events, stderrTail: events.length ? undefined : stderr.slice(-800) }, null, 2) + '\n');
const resp = events.find((e) => e.event === 'response');
const cleanup = events.find((e) => e.event === 'cleanup');
const summary = { sshExit, status: resp?.status, usage: resp?.body?.usage, revoked: cleanup?.revoked, afterRevokeStatus: cleanup?.afterRevokeStatus };
console.log(JSON.stringify(summary, null, 2));
process.exitCode = resp?.status === 200 && cleanup?.revoked && cleanup?.afterRevokeStatus === 401 ? 0 : 1;
