// Run with HANMADI_PLAYWRIGHT_PATH=/path/to/node_modules/playwright node verify.mjs
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.HANMADI_PLAYWRIGHT_PATH || 'playwright');
const dir = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.join(dir, 'index.html')).href;
const browser = await chromium.launch({ headless: true, channel: process.env.HANMADI_BROWSER_CHANNEL || 'chrome' });
const checks=[];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(6000);
  const errors=[], external=[];
  page.on('pageerror', e=>{errors.push(e.message);console.error('Page error:',e.message);});
  page.on('request', r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
  await page.goto(url);
  assert.deepEqual(errors,[], 'Initial page should render without script errors');
  const action = a => page.locator(`[data-action="${a}"]`).first().click();
  await action('go:translate');
  await action('listen'); await action('speak-mine');
  assert.match(await page.locator('#app').innerText(),/덜 달게 해 주세요/);
  await action('large'); assert.equal(await page.locator('dialog').isVisible(),true);
  await page.keyboard.press('Escape');
  await action('end-translate');
  assert.equal(await page.locator('[data-action="save-capture"]').isDisabled(),true);
  await page.locator('.capture-choice input').check(); await action('save-capture');
  assert.match(await page.locator('#app').innerText(),/여행 번역에서 가져왔어요/);
  checks.push('번역 → 선택 저장 → 스터디 / 기본 선택 없음 / 크게 보기·Escape');
  await action('go:ai'); await action('start-chat');
  await action('record-ai'); await action('stop-ai'); await action('end-ai');
  await page.locator('.capture-choice input').check(); await action('save-capture');
  assert.match(await page.locator('#app').innerText(),/AI 대화에서/);
  await action('go:expressions');assert.equal(await page.locator('.phrase-card').count(),2);
  checks.push('AI 대화 → 선택 저장 → 같은 스터디·내 표현에 반영');
  await action('go:study');await action('personal-lesson');
  await action('lesson-next');
  assert.equal(await page.locator('[data-action="lesson-next"]').isDisabled(),true);
  await action('record-lesson');await action('stop-lesson');await action('lesson-next');
  await action('lesson-hint');await action('record-lesson');await action('stop-lesson');await action('lesson-next');
  assert.match(await page.locator('#app').innerText(),/익숙해졌어요/);
  await action('go:expressions');assert.match(await page.locator('#app').innerText(),/도움받아 연습함/);
  checks.push('듣기·따라 말하기·역할 연습 → 완료 / 목업 평가·실력 상승 주장 없음');
  await page.locator('[data-action^="delete:"]').first().click();
  await page.locator('[data-action^="confirm-delete:"]').click();
  assert.equal(await page.locator('.phrase-card').count(),1);
  await action('go:settings');await action('choose-lang:th');await action('go:expressions');
  assert.equal(await page.locator('.phrase-card').count(),0);
  await action('go:translate');await action('speak-mine');assert.match(await page.locator('#app').innerText(),/ขอหวานน้อย/);
  await action('demo-menu');await action('offline');assert.match(await page.locator('#app').innerText(),/인터넷에 연결되지/);
  await action('repeat');assert.equal(await page.locator('dialog').isVisible(),true);await page.keyboard.press('Escape');
  await action('retry');assert.equal(await page.locator('.inline-alert').count(),0);
  checks.push('언어별 기록 격리·삭제 / 태국어 화면 / 연결 실패·복구·고정 표현');
  await action('go:ai');await page.locator('#topic-input').fill('<script>test</script>');await page.locator('#topic-input').press('Enter');
  assert.match(await page.locator('.topbar').innerText(),/<script>test<\/script>/);
  assert.equal(await page.locator('#app script').count(),0);
  await page.reload();await action('go:expressions');assert.equal(await page.locator('.phrase-card').count(),0);
  checks.push('사용자 주제 HTML 이스케이프 / 새로고침 시 체험 데이터 초기화');
  for(const width of [360,390,768,1440]) {
    await page.setViewportSize({width,height:width>760?1000:844});
    for(const route of ['study','onboarding','ai','chat','translate','capture','expressions','lesson','complete','settings']){
      await page.goto(url+'#'+route);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}/${route} body overflow`);
      assert.equal(await page.locator('#app').evaluate(el=>el.scrollWidth<=el.clientWidth),true,`${width}/${route} app overflow`);
      assert.equal(await page.locator('#bottom-nav button').count(),4);
      assert.equal(await page.locator('button').evaluateAll(bs=>bs.filter(b=>!b.textContent.trim()&&!b.getAttribute('aria-label')).length),0);
    }
  }
  checks.push('360·390·768·1440px × 10화면 / 가로 넘침 없음 / 버튼 접근 이름');
  await page.setViewportSize({width:1440,height:1000});await page.goto(url+'#study');
  await page.screenshot({path:path.join(dir,'preview-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.goto(url+'#translate');await action('listen');await action('speak-mine');
  await page.waitForTimeout(3100);
  await page.screenshot({path:path.join(dir,'preview-translation.png'),fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  checks.push('브라우저 실행 오류 0 / 외부 네트워크 요청 0 / PNG 시안 2개');
  console.log(JSON.stringify({status:'passed',browser:browser.version(),checks},null,2));
}finally{await browser.close();}
