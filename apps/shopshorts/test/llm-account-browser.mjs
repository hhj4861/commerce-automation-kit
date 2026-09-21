// Integration browser test: real HTTP API, encrypted SQLite vault and queue worker;
// only provider login/generation are fixtures (no subscription credentials needed).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { accountAction, accountRunner } from '../../credential-broker/llm-accounts.mjs';
import { llmAccountApi } from '../lib/llm-account-api.js';
import { signSession } from '../lib/google-auth.js';
import { startAccountWorker } from '../studio-account-worker.mjs';
import { recommendBrief } from '../lib/studio-recommendations.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const db = new Database(':memory:');
db.exec('CREATE TABLE credential_vault(name TEXT PRIMARY KEY, revision INTEGER, payload TEXT, updated_at TEXT)');
const env = { SHOPSHORTS_SESSION_SECRET: 'fixture-session-secret'.repeat(3), SHOPSHORTS_GOOGLE_ALLOW_SIGNUPS: '1',
  VAULT_KEY: { get: async () => Buffer.alloc(32, 6).toString('base64') }, DB: { prepare(sql) { return { bind(...args) { return {
    first: async () => db.prepare(sql).get(...args), all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => ({ meta: { changes: db.prepare(sql).run(...args).changes } }),
  }; } }; } } };
const topics=['똑같이 10분 봤는데 기분이 다른 이유. 친구와 대화한 뒤와 남의 일상을 비교한 뒤, 무엇이 달랐을까요?', '할 일을 앞두고 책상부터 정리하는 마음. 미루는 순간의 평가 걱정과 불확실함을 돌아봐요.', '같이 있는데 혼자인 느낌. 대화 중 휴대전화만 보는 상대에게 원하는 관심을 말로 요청하는 이야기.'];
const directions=['차분한 내레이션으로 시작해 두 가지 일상을 나란히 보여주세요. 친구와 취미 이야기를 나누는 장면과 다른 사람의 성취를 보며 한숨 쉬는 장면을 대비합니다. 마지막에는 스스로 돌아볼 질문을 남겨요.', '책상 정리부터 하는 주인공의 가벼운 상황극. 속마음은 짧은 자막으로 표현하고, 마지막에 작은 실천을 제안해요.', '조용한 카페에서 눈높이 화면으로 대화를 보여주세요. 부드러운 말투와 따뜻한 색감으로 마무리해요.'];
const suggestions = topics.map((topic,i)=>({topic,direction:directions[i],reason:'브라우저 검증용 검색 근거입니다. 실제 제공사 호출은 사용하지 않습니다.'}));
let finishLogin, generated = 0, generatedProvider;
let generationDelay = 0, generationFailure = false;
const worker = startAccountWorker({ intervalMs: 20, call: (_, input) => accountRunner(env, input), execute: async (value, { signal, update, read }) => {
  if (value.job.kind === 'connect') {
    if (value.job.provider === 'claude') {
      await update({ job: { manual: { url: 'https://claude.com/cai/oauth/authorize?state=fixture-state', state: 'fixture-state' } } });
      while (!signal.aborted) {
        const fresh = await read();
        if (fresh.job.code) { assert.equal(fresh.job.code, 'authorization-fixture#fixture-state'); await update({ credential: { fixture: true }, provider: 'claude', account: 'claude@example.test', job: { state: 'done', manual: null, code: null } }); return; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      return;
    }
    await update({ job: { device: { url: 'https://auth.openai.com/codex/device', code: 'TEST-CODE' } } });
    await new Promise(resolve => { finishLogin = resolve; signal.addEventListener('abort', resolve, { once: true }); });
    if (signal.aborted) return;
    await update({ credential: { fixture: true }, account: 'browser@example.test', job: { state: 'done', device: null } });
  } else {
    if(generationDelay)await new Promise(resolve=>setTimeout(resolve,generationDelay));
    if(generationFailure)throw Error('fixture-only generation failure');
    assert.equal(value.job.input.category, '심리학'); assert.equal(value.job.input.topic, '내가 쓴 주제');
    const result = await recommendBrief(value.job.input, {}, { provider: value.job.provider, generate: async () => ({ searched: true, value: { suggestions, sources: [{ title: '검색 출처 테스트', url: 'https://example.org/source' }] } }) });
    generated++; generatedProvider = result.provider; await update({ job: { state: 'done', result } });
  }
} });
const server = createServer(async (req, res) => {
  try {
    const origin = `http://127.0.0.1:${server.address().port}`, chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const request = new Request(origin + req.url, { method: req.method, headers: req.headers, ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Buffer.concat(chunks) }) });
    let response = await llmAccountApi(request, env, (owner, operation, input) => accountAction(env, owner, operation, input));
    if (!response) {
      const path = new URL(request.url).pathname;
      if (path === '/api/notifications') response = Response.json({error:'not found'},{status:404}); // Match production Pages: general inbox is local-only.
      else if (path === '/notifications') response = new Response(`<html lang="ko"><head><link rel="stylesheet" href="/notifications.css"></head><body><main id="inbox"></main><script type="module">import {createNotificationInbox} from '/notifications.js'; const inbox=createNotificationInbox({document,recommendations:true,openRecommendation:id=>location.assign('/studio?new=1&recommendation='+encodeURIComponent(id))});inbox.mount(document.querySelector('#inbox'));setInterval(()=>inbox.poll(),1000);</script></body></html>`,{headers:{'content-type':'text/html'}});
      else if (path === '/api/studio/config') response = Response.json({ categories: ['심리학', '건축학'], execution: 'local', capabilities: {} });
      else if (path === '/api/studio') response = Response.json({ projects: [] });
      else if (path === '/auth/status') response = Response.json({ authenticated: true, user: { name: '테스트' } });
      else {
        const file = path === '/studio' ? 'studio.html' : path.slice(1);
        if (!/^[a-zA-Z0-9.-]+$/.test(file)) throw Error('not found');
        response = new Response(await readFile(join(import.meta.dirname, '../public', file)), { headers: { 'content-type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' } });
      }
    }
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500); res.end('fixture server error'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await context.grantPermissions(['clipboard-read','clipboard-write'], { origin });
  await context.addCookies([{ name: 'ss_google', value: await signSession({ type: 'user', sub: 'browser-user', email: 'browser@example.test', exp: Date.now() + 600000 }, env), url: origin }]);
  const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/studio?new=1');
  await page.locator('#topic').fill('내가 쓴 주제'); await page.locator('#direction').fill('내가 쓴 요청사항');
  await page.locator('[data-recommend="topic"]').click();
  await page.locator('.llm-dialog[open]').waitFor();
  assert.match(await page.locator('.llm-dialog[open]').innerText(), /Claude/);
  assert.equal(await page.locator('[data-recommend=direction]').innerText(), '✦ LLM 추천');
  assert.equal(await page.locator('[data-recommend-progress=topic]').getAttribute('data-state'), 'authorization');
  assert.equal(await page.locator('[data-recommend-progress=direction]').isVisible(), false);
  await page.screenshot({ path: '/private/tmp/cak-connection-chooser-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Codex 연결', exact: true }).click();
  await page.getByText('TEST-CODE', { exact: true }).waitFor();
  await page.getByRole('button', { name: '인증 코드 복사', exact: true }).click();
  await page.getByText('인증 코드를 복사했어요.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()), 'TEST-CODE');
  await page.evaluate(()=>{window.originalClipboardWrite=navigator.clipboard.writeText.bind(navigator.clipboard);navigator.clipboard.writeText=async()=>{throw new DOMException('denied','NotAllowedError');};});
  await page.getByRole('button', { name: '인증 코드 복사', exact: true }).click();
  await page.getByText('복사할 수 없습니다.', { exact: false }).waitFor();
  await page.evaluate(()=>{navigator.clipboard.writeText=window.originalClipboardWrite;});
  assert.equal(await page.getByRole('link', { name: /ChatGPT 인증 화면 열기/ }).getAttribute('href'), 'https://auth.openai.com/codex/device');
  await page.screenshot({ path: '/private/tmp/cak-llm-account-desktop.png', fullPage: true });
  finishLogin();
  await page.locator('.recommendation-card').first().waitFor({ timeout: 15000 });
  assert.equal(await page.locator('.recommendation-card').count(), 3); assert.equal(generated, 1);
  const focusDialog=page.locator('.recommend-dialog[open]');
  assert.equal(await focusDialog.locator('h2').evaluate(n=>document.activeElement===n),true);
  assert.equal(await focusDialog.locator('.recommendation-card details[open]').count(),0);
  const firstAction=await focusDialog.locator('[data-apply-recommendation]').first().boundingBox();
  assert.ok(firstAction.y>=0&&firstAction.y+firstAction.height<=900);
  await page.screenshot({path:'/private/tmp/cak-recommendation-focus-results-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'추천 창 닫기',exact:true}).click();
  assert.equal(await page.locator('[data-recommend=topic]').evaluate(n=>document.activeElement===n),true);
  await page.getByRole('button',{name:'이야기 추천 3개 다시 보기',exact:true}).click();
  assert.equal(generated,1);
  assert.equal(await page.locator('#topic').inputValue(), '내가 쓴 주제');
  await page.getByRole('button', { name: '주제·분위기 적용', exact: true }).first().click();
  assert.equal(await page.locator('#topic').inputValue(), suggestions[0].topic);
  await page.getByRole('button', { name: 'AI 계정 연결 관리', exact: true }).click();
  await page.getByRole('button', { name: '연결 해제', exact: true }).click();
  await page.getByRole('button', { name: 'Codex 연결', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#topic').inputValue(), suggestions[0].topic);
  await page.locator('[data-recommend="topic"]').click();
  await page.getByRole('button', { name: 'Codex 연결', exact: true }).click();
  await page.getByText('TEST-CODE', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  for (let i = 0; i < 30; i++) {
    const status = await (await page.request.get(origin + '/api/studio/llm/status')).json();
    if (!status.job) break;
    if (i === 29) throw Error('Escape did not cancel pending authentication');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-recommend="topic"]').click();
  await page.locator('.llm-dialog[open]').waitFor();
  assert.equal(await page.locator('.llm-dialog[open]').evaluate(node => node.scrollWidth <= node.clientWidth), true);
  await page.screenshot({ path: '/private/tmp/cak-llm-account-mobile.png', fullPage: true });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-recommend="topic"]').isEnabled(), true);
  assert.equal(await page.locator('#topic').inputValue(), suggestions[0].topic);
  await page.locator('#topic').fill('내가 쓴 주제');
  await page.locator('[data-recommend="topic"]').click();
  await page.getByRole('button', { name: 'Claude 연결', exact: true }).click();
  await page.getByRole('link', { name: /Claude 인증 화면 열기/ }).waitFor();
  await page.getByLabel('일회용 인증 코드', { exact: true }).fill('authorization-fixture#wrong-state');
  await page.getByRole('button', { name: '연결 완료', exact: true }).click();
  await page.getByText('다른 연결 요청의 인증 코드입니다.', { exact: false }).waitFor();
  await page.getByLabel('일회용 인증 코드', { exact: true }).fill('authorization-fixture#fixture-state');
  await page.waitForTimeout(1800); // Verify polling does not erase the code or focus.
  assert.equal(await page.getByLabel('일회용 인증 코드', { exact: true }).inputValue(), 'authorization-fixture#fixture-state');
  assert.equal(await page.getByLabel('일회용 인증 코드', { exact: true }).evaluate(node => node === document.activeElement), true);
  assert.equal(await page.locator('.llm-dialog[open]').evaluate(node => node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight), true);
  await page.screenshot({ path: '/private/tmp/cak-llm-claude-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '연결 완료', exact: true }).click();
  await page.locator('.recommendation-card').first().waitFor({ timeout: 15000 });
  assert.equal(generatedProvider, 'claude'); assert.equal(generated, 2);
  assert.equal(await page.locator('#topic').inputValue(), '내가 쓴 주제');
  assert.equal(await page.locator('[data-recommend-progress=topic]').getAttribute('data-state'), 'done');
  assert.equal(await page.locator('.recommend-dialog[open]').evaluate(n=>n.scrollWidth<=n.clientWidth),true);
  await page.screenshot({path:'/private/tmp/cak-recommendation-focus-results-mobile.png',fullPage:true});
  await page.keyboard.press('Escape');
  await page.waitForTimeout(5100); // Respect the production same-provider request cooldown.
  const directionBeforeCancel=await page.locator('#direction').inputValue();
  generationDelay=5000;
  await page.locator('[data-recommend=direction]').click();
  await page.waitForFunction(()=>document.querySelector('[data-recommend-progress=direction]').dataset.state==='running');
  assert.equal(await page.locator('[data-recommend=topic]').innerText(), '✦ LLM 추천');
  assert.equal(await page.locator('[data-recommend-progress=topic]').getAttribute('data-state'), 'done');
  assert.equal(await page.locator('.recommend-dialog[open]').isVisible(),true);
  assert.match(await page.locator('.recommend-dialog[open] .recommend-deliverable').innerText(),/분위기 3가지/);
  assert.equal(await page.locator('.recommend-dialog[open] .recommend-flow [aria-current=step]').innerText(), '3\n검색 · 생성');
  assert.equal(await page.locator('.recommend-dialog[open]').evaluate(n=>n.scrollWidth<=n.clientWidth),true);
  await page.screenshot({path:'/private/tmp/cak-recommendation-focus-progress-mobile.png',fullPage:true});
  await page.locator('.recommend-dialog[open] .recommend-stop').click();
  await page.waitForFunction(()=>document.querySelector('[data-recommend-progress=direction]').dataset.state==='cancelled');
  assert.equal(await page.locator('#direction').inputValue(), directionBeforeCancel);
  assert.equal(await page.locator('[data-recommend=direction]').evaluate(n=>document.activeElement===n),true);
  await page.waitForTimeout(5100);
  generationDelay=0;generationFailure=true;
  await page.locator('[data-recommend=direction]').click();
  await page.waitForFunction(()=>document.querySelector('[data-recommend-progress=direction]').dataset.state==='failed');
  assert.equal(await page.locator('[data-recommend-progress=topic]').getAttribute('data-state'), 'done');
  generationFailure=false;
  assert.equal(await page.getByRole('button',{name:'다시 추천받기',exact:true}).isVisible(),true);
  await page.waitForTimeout(5100);
  await page.getByRole('button',{name:'다시 추천받기',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.recommend-dialog[open]')?.dataset.state==='done');
  assert.equal(await page.locator('.recommend-dialog[open] .recommendation-card h3').first().innerText(),suggestions[0].direction);
  const mobileAction=await page.locator('.recommend-dialog[open] [data-apply-recommendation]').first().boundingBox();
  assert.ok(mobileAction.y>=0&&mobileAction.y+mobileAction.height<=844);
  await page.locator('.recommend-dialog[open] details').first().locator('summary').click();
  assert.match(await page.locator('.recommend-dialog[open] details[open]').first().innerText(),/브라우저 검증용/);
  await page.screenshot({path:'/private/tmp/cak-recommendation-focus-direction-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'이 분위기 적용',exact:true}).first().click();
  assert.equal(await page.locator('#direction').inputValue(),suggestions[0].direction);
  assert.equal(await page.locator('#topic').inputValue(),'내가 쓴 주제');
  assert.equal(await page.locator('#direction').evaluate(n=>document.activeElement===n),true);
  await page.waitForTimeout(5100);
  generationDelay=5000;
  const generatedBeforeBackground=generated;
  await page.locator('[data-recommend=topic]').click();
  await page.waitForFunction(()=>document.querySelector('.recommend-dialog[open]')?.dataset.state==='running');
  await page.getByRole('button',{name:'추천 창 닫기',exact:true}).click();
  assert.equal(await page.locator('.recommend-dialog[open]').count(),0);
  await page.waitForFunction(()=>document.querySelector('[data-recommend-progress=topic]').dataset.state==='done',{},{timeout:15000});
  assert.equal(generated,generatedBeforeBackground+1);
  assert.equal(await page.locator('.recommend-dialog[open]').count(),0);
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-notification-count]')].some(n=>!n.hidden));
  const backgroundJob=(await(await page.request.get(origin+'/api/studio/llm/status')).json()).job;
  const notices=await(await page.request.get(origin+'/api/studio/llm/notifications')).json();
  assert.equal(notices.items.filter(n=>n.sourceId===backgroundJob.id).length,1);
  page.on('dialog',dialog=>dialog.accept());
  await page.locator('.studio-inbox:visible').first().click();
  await page.locator(`[data-inbox-open="recommendation:${backgroundJob.id}"]`).click();
  await page.waitForFunction(()=>document.querySelector('.recommend-dialog[open]')?.dataset.state==='done');
  assert.equal(await page.locator('#topic').inputValue(),'내가 쓴 주제');
  assert.equal(await page.locator('.recommend-dialog[open] .recommendation-card').count(),3);
  const readNotices=await(await page.request.get(origin+'/api/studio/llm/notifications')).json();
  assert.equal(readNotices.items.find(n=>n.sourceId===backgroundJob.id).read,true);
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('.recommend-dialog[open]')?.dataset.state==='done');
  assert.equal(generated,generatedBeforeBackground+1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(5100);
  await page.locator('[data-recommend=topic]').click();
  await page.waitForFunction(()=>document.querySelector('.recommend-dialog[open]')?.dataset.state==='running');
  const detachedJob=(await(await page.request.get(origin+'/api/studio/llm/status')).json()).job;
  await page.keyboard.press('Escape');
  await page.locator('#direction').fill('생성 중 다른 방향을 메모해도 기존 요청은 계속됩니다.');
  assert.equal((await(await page.request.get(origin+'/api/studio/llm/status')).json()).job.id,detachedJob.id);
  await page.locator('.studio-inbox:visible').first().click();
  await page.locator(`[data-inbox-open="recommendation:${detachedJob.id}"]`).waitFor({timeout:15000});
  await page.screenshot({path:'/private/tmp/cak-recommendation-background-inbox.png',fullPage:true});
  await page.locator(`[data-inbox-open="recommendation:${detachedJob.id}"]`).click();
  await page.waitForFunction(()=>document.querySelector('.recommend-dialog[open]')?.dataset.state==='done');
  assert.equal(generated,generatedBeforeBackground+2);
  await page.keyboard.press('Escape');
  generationDelay=0;
  await page.getByRole('button', { name: 'AI 계정 연결 관리', exact: true }).click();
  await page.getByText('claude@example.test', { exact: true }).waitFor();
  await page.getByRole('button', { name: '연결 해제', exact: true }).click();
  await page.keyboard.press('Escape');
  await worker.stop(); db.prepare('DELETE FROM credential_vault WHERE name = ?').run('llm/runtime');
  await page.locator('[data-recommend="topic"]').click();
  await page.getByText('LLM 실행기가 오프라인입니다.', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Codex 연결', exact: true }).isDisabled(), true);
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ browser: 'Chrome', checks: ['provider selection', 'Codex device code', 'automatic continuation', 'three recommendations', 'apply suggestion', 'disconnect', 'cancel pending login', 'mobile layout', 'escape preserves input', 'Claude authorization code', 'wrong-state rejection', 'polling preserves code', 'Claude recommendation', 'offline runtime', 'copy code', 'clipboard failure', 'per-field progress', 'cancel recommendation', 'per-field failure', 'focused result dialog', 'result reopen without regeneration', 'visible apply action', 'result keyboard focus', 'progress deliverables', 'collapsed details', 'dialog cancellation', 'retry failed recommendation', 'direction-only result and apply', 'long content mobile action', 'expanded full result', 'close continues generation', 'no completion focus steal', 'completion inbox badge', 'one persisted notification', 'inbox opens saved result', 'read state persists', 'reload restores without generation', 'navigation preserves generation', 'editing does not cancel accepted job'], provider: 'fixture', passed: true }));
} finally {
  if (browser) await browser.close(); await worker.stop();
  await new Promise(resolve => server.close(resolve)); db.close();
}
