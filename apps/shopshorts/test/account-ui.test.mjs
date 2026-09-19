import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext, Script } from 'node:vm';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const accountScript = scripts.find(script => script.includes('async function loadAccount()'));
const errorScript = scripts.find(script => script.includes('function isMetaMaskExtensionError'));
const login = readFileSync(new URL('../public/login.html', import.meta.url), 'utf8');

function account(data, options = {}) {
  const make = () => ({ hidden: true, textContent: '', disabled: false, addEventListener(type, handler) { this[type] = handler; } });
  const groups = Object.fromEntries(['data-logout', 'data-account', 'data-account-name', 'data-signin'].map(name => [name, [make(), make()]]));
  const events = {}, messages = [], navigations = [], calls = [];
  runInNewContext(accountScript, {
    document: { querySelectorAll: selector => groups[selector.slice(1, -1)] },
    window: { addEventListener(type, handler) { events[type] = handler; } },
    location: { replace: path => navigations.push(path) },
    showToast: message => messages.push(message),
    AbortSignal,
    fetch: async (path, init) => {
      calls.push({ path, init });
      if (path === '/auth/status' && options.statusFails) throw new Error('offline');
      if (path === '/auth/logout') return { ok: !options.logoutFails };
      return { ok: true, json: async () => data };
    }
  });
  return { groups, events, messages, navigations, calls };
}

test('home renders desktop/mobile accounts safely and logout posts then returns to login', async () => {
  const state = account({ authenticated: true, user: { name: '<b>Owner</b>' } });
  await state.events.pageshow();
  assert.ok(state.groups['data-account'].every(el => !el.hidden));
  assert.ok(state.groups['data-signin'].every(el => el.hidden));
  assert.ok(state.groups['data-account-name'].every(el => el.textContent === '<b>Owner</b>'));
  await state.groups['data-logout'][1].click();
  assert.deepEqual(state.navigations, ['/login']);
  assert.equal(state.calls.at(-1).path, '/auth/logout');
  assert.equal(state.calls.at(-1).init.method, 'POST');
});

test('logout failure keeps the session page and re-enables both logout controls', async () => {
  const state = account({ authenticated: true }, { logoutFails: true });
  await state.events.pageshow();
  await state.groups['data-logout'][0].click();
  assert.deepEqual(state.navigations, []);
  assert.ok(state.groups['data-logout'].every(el => !el.disabled && el.textContent === '로그아웃'));
  assert.match(state.messages[0], /로그아웃하지 못/);
});

test('unauthenticated home returns to login; account lookup failure still permits logout', async () => {
  const local = account({ authenticated: false });
  await local.events.pageshow();
  assert.deepEqual(local.navigations, ['/login']);
  const offline = account({}, { statusFails: true });
  await offline.events.pageshow();
  assert.ok(offline.groups['data-account'].every(el => !el.hidden));
  assert.match(offline.messages[0], /로그인 상태를 확인하지 못/);
});

test('MetaMask connection errors do not become app fatal banners; real app failures remain visible', () => {
  const handlers = {}, shown = [];
  const window = { addEventListener(type, handler) { handlers[type] = handler; } };
  runInNewContext(errorScript, { window });
  window.__showFatal = message => shown.push(message);
  handlers.unhandledrejection({ reason: new Error('Failed to connect to MetaMask') });
  handlers.error({ error: new Error('Failed to connect to MetaMask'), message: 'Failed to connect to MetaMask' });
  assert.deepEqual(shown, []);
  handlers.unhandledrejection({ reason: new Error('Failed to fetch') });
  handlers.error({ message: 'Unknown variable', filename: '/index.html', lineno: 25 });
  assert.equal(shown.length, 2);
  assert.match(shown[0], /Failed to fetch/);
  assert.match(shown[1], /Unknown variable/);
});

test('login has no dashboard bypass or logout, redirects signed-in users home, and scripts parse', async () => {
  assert.match(login, /class="brand" href="\/login"/);
  assert.doesNotMatch(login, /대시보드로 돌아가기|id="logout"|href="\/studio"/);
  const loginScript = login.match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const script of [...scripts, loginScript]) new Script(script);
  const elements = Object.fromEntries([...login.matchAll(/id="([^"]+)"/g)].map(match => [match[1], {
    dataset: {}, textContent: '', addEventListener() {}, setAttribute() {}, removeAttribute() {}
  }]));
  const navigations = [];
  runInNewContext(loginScript, {
    document: { getElementById: id => elements[id] },
    location: { origin: 'http://127.0.0.1:5198', search: '', replace: path => navigations.push(path) },
    URLSearchParams, AbortController, setTimeout, clearTimeout,
    fetch: async () => ({ ok: true, json: async () => ({ ready: true, authenticated: true, user: { name: 'Owner' } }) })
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(navigations, ['/']);
});

test('restoring home after session expiry returns to login when OAuth is enabled', async () => {
  const state = account({ ready: true, authenticated: false, user: null });
  await state.events.pageshow();
  assert.deepEqual(state.navigations, ['/login']);
});

test('GIS button uses a server nonce, posts credentials, retries failures, and navigates home only on success', async () => {
  const loginScript = login.match(/<script>([\s\S]*?)<\/script>/)[1];
  const elements = Object.fromEntries([...login.matchAll(/id="([^"]+)"/g)].map(match => [match[1], {
    dataset: {}, textContent: '', clientWidth: 280, hidden: false,
    addEventListener(type, handler) { this[type] = handler; }, setAttribute() {}, removeAttribute() {}, replaceChildren() {}
  }]));
  const navigations = [], posts = [], initialized = [], rendered = [];
  let fail = true;
  runInNewContext(loginScript, {
    document: { getElementById: id => elements[id] },
    window: { google: { accounts: { id: {
      initialize: options => initialized.push(options), renderButton: (el, options) => rendered.push(options)
    } } } },
    location: { origin: 'http://127.0.0.1:5198', search: '', replace: path => navigations.push(path) },
    URLSearchParams, AbortController, AbortSignal,
    setTimeout: () => 1, clearTimeout() {},
    fetch: async (path, options) => {
      if (path === '/auth/status') return { ok: true, json: async () => ({ ready: true, mode: 'gis', clientId: 'fixture-client' }) };
      if (path === '/auth/google/challenge') return { ok: true, json: async () => ({ nonce: 'fixture-nonce', expiresAt: Date.now() + 300000 }) };
      posts.push({ path, options });
      return { ok: !fail, json: async () => fail ? { error: '다시 로그인하세요.' } : { ok: true, redirect: '/' } };
    }
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(initialized[0].nonce, 'fixture-nonce');
  assert.equal(initialized[0].client_id, 'fixture-client');
  assert.equal(initialized[0].auto_select, false);
  assert.equal(rendered[0].width, 280);
  await initialized[0].callback({ credential: 'test-only-token' });
  assert.equal(elements.retry.hidden, false);
  assert.deepEqual(navigations, []);
  fail = false;
  await elements.retry.click();
  await initialized[1].callback({ credential: 'test-only-token' });
  assert.equal(posts[1].path, '/auth/google/credential');
  assert.equal(posts[1].options.method, 'POST');
  assert.deepEqual(JSON.parse(posts[1].options.body), { credential: 'test-only-token' });
  assert.deepEqual(navigations, ['/']);
});
