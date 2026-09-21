import test from 'node:test';
import assert from 'node:assert/strict';
import { renderInbox, createNotificationInbox } from '../public/notifications.js';
const item = { id: 'a', source: 'job', sourceId: 'job-a', title: '기획 확인', name: '상품', occurredAt: new Date().toISOString(), read: false };
function fixture(fetcher, openJob = () => {}) {
  const host = { innerHTML: '', isConnected: true };
  const badge = {}, preference = { classList: { toggle() {} }, setAttribute() {} };
  const document = { querySelectorAll: selector => selector === '[data-notification-count]' ? [badge] : selector === '[data-notification-preference]' ? [preference] : [] };
  const controller = createNotificationInbox({ document, fetcher, openJob, openStudio: () => {} });
  const click = dataset => host.onclick({ target: { closest: () => ({ dataset }) } });
  return { host, badge, preference, controller, click };
}
const response = body => ({ ok: true, json: async () => structuredClone(body) });

test('inbox renders escaped content, empty, failure and unread states', () => {
  const html = renderInbox({ items: [{ ...item, title: '<img onerror=x>' }], unreadCount: 1, queue: { dead: 1 } });
  assert.ok(!html.includes('<img')); assert.match(html, /&lt;img/); assert.match(html, /role="alert"/);
  assert.match(renderInbox({ items: [], unreadCount: 0 }, { filter: 'unread' }), /안 읽은 알림이 없어요/);
  assert.match(renderInbox(null, { error: '서버 연결 실패' }), /서버 연결 실패/);
});

test('read, unread filter, read-all cutoff, preference persistence and detail action', async () => {
  const data = { items: [item], unreadCount: 1, throughSeq: 7, enabled: true };
  const calls = [], opened = [];
  const ui = fixture(async (url, options) => {
    calls.push({ url, body: options.body && JSON.parse(options.body) });
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      if (url.endsWith('/preferences')) data.enabled = body.enabled;
      if (url.endsWith('/read')) { data.items[0] = { ...item, read: body.read }; data.unreadCount = body.read ? 0 : 1; }
    }
    return response(data);
  }, id => opened.push(id));
  await ui.controller.mount(ui.host); assert.equal(ui.badge.hidden, false);
  await ui.click({ inboxRead: 'a' }); assert.equal(ui.badge.hidden, true);
  await ui.click({ inboxRead: 'a' }); assert.equal(ui.badge.hidden, false);
  await ui.preference.onclick(); assert.equal(ui.badge.hidden, true); assert.equal(data.enabled, false);
  await ui.click({ inboxAction: 'read-all' }); assert.deepEqual(calls.find(x => x.url.endsWith('/read-all')).body, { throughSeq: 7 });
  await ui.click({ inboxFilter: 'unread' }); assert.ok(calls.at(-1).url.includes('filter=unread'));
  await ui.click({ inboxOpen: 'a' }); assert.deepEqual(opened, ['job-a']);
  ui.controller.unmount(); assert.equal(ui.host.onclick, null);
});

test('failed mutation keeps notification unread and does not navigate', async () => {
  let opened = false;
  const ui = fixture(async (_, options) => options.method === 'POST' ? { ok: false, status: 500 } : response({ items: [item], unreadCount: 1, enabled: true }), () => { opened = true; });
  await ui.controller.mount(ui.host); await ui.click({ inboxOpen: 'a' });
  assert.equal(opened, false); assert.match(ui.host.innerHTML, /role="alert"/); assert.equal(ui.badge.hidden, false);
});

test('stale poll cannot undo a completed read and later pages stay available', async () => {
  let resolvePoll, count = 0;
  const data = { items: [item], unreadCount: 1, enabled: true, nextCursor: 2 };
  const ui = fixture(async (url, options) => {
    if (options.method === 'POST') { data.unreadCount = 0; return response({}); }
    if (++count === 2) return new Promise(resolve => { resolvePoll = resolve; });
    return response(url.includes('before=') ? { ...data, items: [{ ...item, id: 'b' }], nextCursor: null } : data);
  });
  await ui.controller.mount(ui.host);
  const poll = ui.controller.poll();
  await ui.click({ inboxRead: 'a' });
  resolvePoll(response({ ...data, unreadCount: 1 })); await poll;
  assert.equal(ui.badge.hidden, true);
  await ui.click({ inboxAction: 'more' }); assert.match(ui.host.innerHTML, /data-inbox-read="b"/);
});


test('recommendation inbox combines counts and opens only the saved owner result after read persistence', async () => {
 const calls=[],opened=[];let read=false;
 const privateItem={...item,id:'recommendation:one',source:'recommendation',sourceId:'one'};
 const host={innerHTML:'',isConnected:true},badge={};
 const document={querySelectorAll:selector=>selector==='[data-notification-count]'?[badge]:[]};
 const controller=createNotificationInbox({document,recommendations:true,openRecommendation:id=>opened.push(id),fetcher:async(url,options)=>{
  calls.push({url,body:options.body&&JSON.parse(options.body)});
  if(url.endsWith('notification-read')){read=JSON.parse(options.body).read;return response({ok:true});}
  if(url.includes('/api/studio/'))return response({items:[{...privateItem,read}],unreadCount:read?0:1});
  return response({items:[item],unreadCount:1,throughSeq:3,enabled:true});
 }});
 await controller.mount(host);assert.equal(badge.textContent,'2');
 await host.onclick({target:{closest:()=>({dataset:{inboxOpen:'recommendation:one'}})}});
 assert.deepEqual(opened,['one']);assert.equal(badge.textContent,'1');
 assert.deepEqual(calls.find(call=>call.url.endsWith('notification-read')).body,{ids:['one'],read:true});
 await host.onclick({target:{closest:()=>({dataset:{inboxAction:'read-all'}})}});
 assert.deepEqual(calls.filter(call=>call.url.endsWith('notification-read')).at(-1).body,{ids:['one'],read:true});
});


test('Pages without a general inbox still shows private results and supports read-all', async () => {
 const calls=[],opened=[];let read=false;
 const privateItem={...item,id:'recommendation:one',source:'recommendation',sourceId:'one'};
 const host={innerHTML:'',isConnected:true},badge={},preference={classList:{toggle(){}},setAttribute(){}};
 const document={querySelectorAll:selector=>selector==='[data-notification-count]'?[badge]:selector==='[data-notification-preference]'?[preference]:[]};
 const controller=createNotificationInbox({document,recommendations:true,openRecommendation:id=>opened.push(id),fetcher:async(url,options)=>{
  calls.push(url);
  if(url.startsWith('/api/notifications'))return {ok:false,status:404};
  if(url.endsWith('notification-read')){read=JSON.parse(options.body).read;return response({ok:true});}
  return response({items:[{...privateItem,read}],unreadCount:read?0:1});
 }});
 await controller.mount(host);
 assert.equal(badge.textContent,'1');assert.equal(badge.hidden,false);assert.equal(preference.disabled,true);
 assert.doesNotMatch(host.innerHTML,/role="alert"/);
 await host.onclick({target:{closest:()=>({dataset:{inboxAction:'read-all'}})}});
 assert.equal(read,true);assert.equal(badge.hidden,true);assert.ok(!calls.includes('/api/notifications/read-all'));
 await host.onclick({target:{closest:()=>({dataset:{inboxOpen:'recommendation:one'}})}});
 assert.deepEqual(opened,['one']);
});

test('missing general inbox fallback never hides authentication or service failures', async () => {
 for(const status of [401,500]) {
  const host={innerHTML:'',isConnected:true};let privateCalls=0;
  const controller=createNotificationInbox({document:{querySelectorAll:()=>[]},recommendations:true,fetcher:async url=>{
   if(url.includes('/api/studio/'))privateCalls++;
   return {ok:false,status};
  }});
  await controller.mount(host);assert.match(host.innerHTML,/role="alert"/);assert.equal(privateCalls,0);
 }
});
