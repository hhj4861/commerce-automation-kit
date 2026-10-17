// Real workerd + service-binding RPC, synthetic credentials only; no production calls.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const argument = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const miniflareEntry = argument('--miniflare') || process.env.MINIFLARE_ENTRY;
const esbuildEntry = argument('--esbuild') || process.env.ESBUILD_ENTRY;
if (!miniflareEntry || !esbuildEntry) throw Error('Set installed Miniflare and esbuild entry paths');
const { Miniflare, convertV4MiniflareOptions } = await import(pathToFileURL(resolve(miniflareEntry)));
const { build } = await import(pathToFileURL(resolve(esbuildEntry)));
const baseline = process.argv.includes('--baseline');
const base = new URL('../../../', import.meta.url).pathname;
const bundled = await build({ absWorkingDir: base, entryPoints: ['apps/shopshorts/functions/_middleware.js'], bundle: true,
  write: false, format: 'esm', platform: 'browser', plugins: baseline ? [{ name: 'deployed-baseline', setup(b) {
    b.onLoad({ filter: /cloud-secrets\.js$/ }, () => ({ contents: execFileSync('git', ['show', 'f6e2bebf21e6ea9c3ca23a549743e92db7d6b509:apps/shopshorts/lib/cloud-secrets.js'], { cwd: base, encoding: 'utf8' }), loader: 'js' }));
  } }] : [] });
const app = `import {onRequest} from './middleware.mjs';
export default {async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path==='/stats')return Response.json(await env.CREDENTIALS.stats());
  if(path==='/fault')return Response.json(await env.CREDENTIALS.fault(request.method==='POST'));
  return onRequest({request,env,data:{},next:()=>Response.json({ok:true})});
}};`;
const broker = `import {WorkerEntrypoint} from 'cloudflare:workers';
let calls=0,failed=false;
export default class Broker extends WorkerEntrypoint {
 getPagesSecrets(){calls++;if(failed)throw Error('synthetic-private-failure');return {SHOPSHORTS_TOKEN:'synthetic-worker',SHOPSHORTS_SESSION_SECRET:'synthetic-session'};}
 stats(){return {calls};} fault(value){failed=value;return {ok:true};}
}`;
const options = { workers: [{ name: 'app', compatibilityDate: '2026-07-01', modulesRoot: '/', modules: [
  { type: 'ESModule', path: '/entry.mjs', contents: app }, { type: 'ESModule', path: '/middleware.mjs', contents: bundled.outputFiles[0].text },
], serviceBindings: { CREDENTIALS: 'broker' } }, { name: 'broker', compatibilityDate: '2026-07-01', modulesRoot: '/', modules: [{ type: 'ESModule', path: '/broker.mjs', contents: broker }] }] };
const mf = new Miniflare(convertV4MiniflareOptions ? convertV4MiniflareOptions(options) : options);
try {
  const get = (path, options) => mf.dispatchFetch('https://fixture.test' + path, options);
  for (let i = 0; i < 12; i++) assert.equal((await get('/api/studio', { headers: { authorization: 'Bearer synthetic-worker' } })).status, 200);
  const count = (await (await get('/stats')).json()).calls;
  if (baseline) { assert.equal(count, 12); console.log(JSON.stringify({ mode: 'baseline', sequential_requests: 12, bundle_rpc_calls: count })); }
  else {
    assert.equal(count, 1);
    for (let i = 0; i < 12; i++) assert.equal((await get('/api/studio')).status, 401);
    assert.equal((await get('/api/studio', { headers: { cookie: 'ss_google=forged' } })).status, 401);
    assert.equal((await get('/api/studio', { method: 'POST', headers: { origin: 'https://other.test' } })).status, 403);
    assert.equal((await (await get('/stats')).json()).calls, 1);
    await get('/fault', { method: 'POST' });
    await new Promise(resolve => setTimeout(resolve, 30_100));
    const outage = await get('/api/studio', { headers: { authorization: 'Bearer synthetic-worker' } });
    assert.equal(outage.status, 503); assert.equal(outage.headers.get('cache-control'), 'no-store');
    assert.doesNotMatch(await outage.text(), /synthetic-|worker|session/);
    await get('/fault');
    assert.equal((await get('/api/studio', { headers: { authorization: 'Bearer synthetic-worker' } })).status, 200);
    console.log(JSON.stringify({ mode: 'fixed', sequential_requests: 12, bundle_rpc_calls: count, anonymous_and_forged_denied: true, cross_origin_denied: true, expired_outage_fail_closed: true, recovery: true, real_service_rpc: true }));
  }
} finally { await mf.dispose(); }
