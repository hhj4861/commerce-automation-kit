// One shadow JEV call through the approved relay (temporary key, 1 request, $0.01 cap, revoked after).
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';

const dir = new URL('.', import.meta.url);
const body = fs.readFileSync(new URL('request.json', dir), 'utf8');
if (body.includes('expected')) throw Error('label_leak');
const code = fs.readFileSync(new URL('relay.py', dir), 'utf8');
const quote = s => "'" + s.replaceAll("'", "'\"'\"'") + "'";
const child = spawn('/opt/homebrew/share/google-cloud-sdk/bin/gcloud', ['compute', 'ssh', 'shared-ai', '--project=replay-live-508202', '--zone=us-central1-a', '--account=guswhd1085@gmail.com', '--tunnel-through-iap', '--quiet', '--ssh-flag=-o ConnectTimeout=15', '--ssh-flag=-o BatchMode=yes', '--command', 'sudo -n python3 -u -c ' + quote(code)], {stdio: ['pipe', 'pipe', 'pipe']});

const events = [];
let stderr = '';
child.stderr.on('data', d => { stderr += d; });
createInterface({input: child.stdout}).on('line', line => {
  if (!line.startsWith('{')) return;
  const x = JSON.parse(line);
  events.push(x);
  if (x.event === 'ready') child.stdin.write(JSON.stringify(JSON.parse(body)) + '\n');
  if (x.event === 'response' || x.event === 'failure') child.stdin.end();
});
const sshExit = await new Promise(r => child.on('close', r));

fs.writeFileSync(new URL('live-results.json', dir), JSON.stringify({sshExit, events, stderrTail: events.length ? undefined : stderr.slice(-800)}, null, 2) + '\n');
const resp = events.find(e => e.event === 'response');
const cleanup = events.find(e => e.event === 'cleanup');
console.log(JSON.stringify({sshExit, status: resp?.status, elapsedMs: resp?.elapsedMs, usage: resp?.body?.usage,
  revoked: cleanup?.revoked, afterRevokeStatus: cleanup?.afterRevokeStatus, spend: cleanup?.policyAndSpend?.spend,
  failure: events.find(e => e.event === 'failure')}, null, 2));
