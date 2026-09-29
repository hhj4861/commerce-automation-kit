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
  await action('speak-mine');
  assert.match(await page.locator('#app').innerText(),/덜 달게 해 주세요/);
  await action('large'); assert.equal(await page.locator('dialog').isVisible(),true);
  await page.keyboard.press('Escape');
  await action('end-translate');
  assert.equal(await page.locator('.capture-choice').count(),0);
  assert.match(await page.locator('#app').innerText(),/여행 번역에서 가져왔어요/);
  checks.push('번역 → 자동 저장 → 스터디 / 선택 단계 없음 / 크게 보기·Escape');
  await action('go:ai'); await action('start-chat');
  await action('record-ai'); await action('stop-ai'); await action('end-ai');
  assert.equal(await page.locator('[data-action="save-capture"]').isDisabled(),true);
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
  await action('go:study');await action('go:courses');
  assert.equal(await page.locator('.level-picker button').count(),4);
  await action('course-level:3');
  assert.match(await page.locator('.level-summary').innerText(),/대화 이어가기/);
  await action('course-unit:club');
  assert.match(await page.locator('#app').innerText(),/같이 춤추실래요/);
  await action('lesson-next');await action('record-lesson');await action('stop-lesson');await action('lesson-next');
  for(let turn=1;turn<=3;turn++){
    assert.match(await page.locator('.role-turn').innerText(),new RegExp(`대화 ${turn} / 3`));
    await action('record-lesson');await action('stop-lesson');await action('lesson-next');
  }
  await action('go:study');await action('go:courses');
  assert.equal(await page.locator('.course-meter').getAttribute('aria-valuenow'),'1');
  assert.match(await page.locator('.level-summary').innerText(),/대화 이어가기/);
  await action('go:settings');await action('choose-lang:th');await action('go:study');await action('go:courses');
  assert.equal(await page.locator('.course-meter').getAttribute('aria-valuenow'),'0');
  assert.match(await page.locator('.level-summary').innerText(),/한마디 시작/);
  checks.push('4단계 과정 / Lv.3 3차례 역할 연습 / 연습 완료만 기록·자동 승급 없음 / 언어별 단계·진행 분리');
  await action('go:scenarios');assert.equal(await page.locator('.scenario-card').count(),8);
  await action('category:사람들과');assert.equal(await page.locator('.scenario-card').count(),3);
  await action('scene:club');await action('course-level:4');
  assert.match(await page.locator('.phrase-preview').innerText(),/오늘은 친구들과 있을게요/);
  await action('scene-chat');await action('record-ai');await action('stop-ai');
  assert.match(await page.locator('.user-bubble').innerText(),/오늘은 친구들과 있을게요/);
  assert.doesNotMatch(await page.locator('.user-bubble').innerText(),/얼음/);
  await action('end-ai');await page.locator('.capture-choice input').check();await action('save-capture');
  await action('personal-lesson');assert.match(await page.locator('.topbar').innerText(),/클럽·바/);
  assert.match(await page.locator('#app').innerText(),/วันนี้ขออยู่กับเพื่อน/);
  checks.push('8개 상황 / 분류 필터 / 클럽 단계별 표현 / 태국어 상황 AI → 표현 저장 → 같은 상황 스터디');
  // English and Spanish must support both sources and keep independent progress.
  for(const [language,order,club] of [
    ['en','Less sweet, please.','This song is great!'],
    ['es','Menos dulce, por favor.','¡Qué buena canción!']
  ]){
    await page.goto(url+'#onboarding');
    assert.equal(await page.locator('#app [data-action^="choose-lang:"]').count(),4);
    await action('choose-lang:'+language);await page.goto(url+'#study');
    await action('language');assert.equal(await page.locator('dialog [data-action^="choose-lang:"]').count(),4);
    await page.keyboard.press('Escape');
    await page.goto(url+'#courses');
    assert.match(await page.locator('.level-summary').innerText(),/한마디 시작/);
    assert.equal(await page.locator('.course-meter').getAttribute('aria-valuenow'),'0');
    await page.goto(url+'#translate');await action('listen');await action('speak-mine');
    assert.match(await page.locator('.translate-panel.mine').innerText(),new RegExp(order));
    await action('end-translate');assert.equal(await page.locator('.capture-choice').count(),0);
    await page.goto(url+'#scenarios');await action('category:전체');await action('scene:club');await action('scene-chat');
    await action('record-ai');await action('stop-ai');
    assert.ok((await page.locator('.chat-bubble').last().innerText()).includes(club));
    await action('end-ai');await page.locator('.capture-choice input').check();await action('save-capture');
    await page.goto(url+'#expressions');assert.equal(await page.locator('.phrase-card').count(),3);
    assert.equal(await page.locator(`.phrase-card [lang="${language}"]`).count(),3);
    await page.locator('[data-action^="practice:"]').last().click();
    assert.ok((await page.locator('.lesson-word').innerText()).includes(club));
    await page.goto(url+'#courses');await action('course-unit:smalltalk');
    await action('lesson-next');await action('record-lesson');await action('stop-lesson');await action('lesson-next');
    await action('record-lesson');await action('stop-lesson');await action('lesson-next');
    await page.goto(url+'#courses');assert.equal(await page.locator('.course-meter').getAttribute('aria-valuenow'),'1');
    await action('course-level:2');
    await page.goto(url+'#settings');assert.equal(await page.locator('#app [data-action^="choose-lang:"]').count(),4);
    await action('choose-lang:ja');await page.goto(url+'#courses');
    assert.match(await page.locator('.level-summary').innerText(),/대화 이어가기/);
    await page.goto(url+'#settings');await action('choose-lang:'+language);await page.goto(url+'#courses');
    assert.match(await page.locator('.level-summary').innerText(),/짧은 문답/);
    await action('course-level:1');assert.equal(await page.locator('.course-meter').getAttribute('aria-valuenow'),'1');
    await page.goto(url+'#expressions');assert.equal(await page.locator('.phrase-card').count(),3);
  }
  checks.push('영어·스페인어: 언어 선택 3곳 / 번역·상황 AI → 각각 저장·수업 / 단계·진행·표현 독립 유지');
  await page.goto(url+'#translate');await page.reload();
  await action('end-translate');await action('go:expressions');assert.equal(await page.locator('.phrase-card').count(),0);
  await action('go:translate');await action('listen');await action('listen');
  await action('go:expressions');assert.equal(await page.locator('.phrase-card').count(),1);
  assert.match(await page.locator('.phrase-card').innerText(),/번역에서 자동 추가/);
  await action('go:translate');await action('speak-mine');await action('speak-mine');await action('end-translate');
  await action('go:expressions');assert.equal(await page.locator('.phrase-card').count(),2);
  await action('go:settings');await action('choose-lang:en');await action('toggle-auto-study');
  assert.equal(await page.getByRole('switch',{name:'번역 자동 학습'}).getAttribute('aria-checked'),'false');
  await action('go:translate');await action('listen');await action('speak-mine');await action('end-translate');
  await action('go:expressions');assert.equal(await page.locator('.phrase-card').count(),0);
  await action('go:settings');await action('toggle-auto-study');await action('go:translate');
  await action('demo-menu');await action('offline');await action('listen');await action('speak-mine');
  await action('go:expressions');assert.equal(await page.locator('.phrase-card').count(),0);
  await action('go:translate');await action('retry');await action('speak-mine');await action('go:expressions');
  assert.equal(await page.locator('.phrase-card').count(),1);
  await page.locator('[data-action^="delete:"]').click();await page.locator('[data-action^="confirm-delete:"]').click();
  await action('go:translate');await action('end-translate');await action('go:expressions');
  assert.equal(await page.locator('.phrase-card').count(),0);
  await action('go:settings');await action('choose-lang:ja');await action('go:expressions');
  assert.equal(await page.locator('.phrase-card').count(),2);
  checks.push('번역 양방향 자동 추가 / 종료 전 탭 이동에도 유지 / 중복 없음 / 끄기 / 빈·실패 제외 / 삭제 후 종료로 복원 안 됨 / 언어 격리');
  for(const width of [360,390,768,1440]) {
    await page.setViewportSize({width,height:width>760?1000:844});
    for(const route of ['study','courses','scenarios','scenario','onboarding','ai','chat','translate','capture','expressions','lesson','complete','settings']){
      await page.goto(url+'#'+route);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}/${route} body overflow`);
      assert.equal(await page.locator('#app').evaluate(el=>el.scrollWidth<=el.clientWidth),true,`${width}/${route} app overflow`);
      assert.equal(await page.locator('#bottom-nav button').count(),4);
      assert.equal(await page.locator('button').evaluateAll(bs=>bs.filter(b=>!b.textContent.trim()&&!b.getAttribute('aria-label')).length),0);
    }
  }
  await page.setViewportSize({width:360,height:844});
  for(const language of ['en','ja','th','es']){
    await action('go:study');await action('go:settings');await action('choose-lang:'+language);
    for(const scene of ['smalltalk','club','cafe','restaurant','hotel','directions','shopping','friends']){
      await action('go:study');await action('go:scenarios');await action('category:전체');await action('scene:'+scene);
      for(const level of [1,2,3,4]){
        await action('course-level:'+level);
        assert.equal(await page.locator('#app').evaluate(el=>el.scrollWidth<=el.clientWidth),true,`${language}/${scene}/${level} overflow`);
        assert.ok((await page.locator('.phrase-preview .pronunciation').innerText()).length>2);
        const target=page.locator('.phrase-preview [lang="'+language+'"]');
        assert.equal(await target.count(),1);
        assert.ok((await target.innerText()).length>2);
        if(['en','es'].includes(language))assert.doesNotMatch(await target.innerText(),/[\u3040-\u30ff\u0e00-\u0e7f]/);
      }
    }
  }
  checks.push('4개 언어 × 8개 상황 × 4단계 (128개) 상세 화면·발음 도움·360px 넘침 확인');
  checks.push('360·390·768·1440px × 13화면 / 가로 넘침 없음 / 버튼 접근 이름');
  await page.setViewportSize({width:1440,height:1000});await page.goto(url+'#study');await page.reload();
  await page.screenshot({path:path.join(dir,'preview-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.goto(url+'#translate');await action('listen');await action('speak-mine');
  await page.waitForTimeout(3100);
  await page.screenshot({path:path.join(dir,'preview-translation.png'),fullPage:true});
  await page.goto(url+'#courses');
  await page.screenshot({path:path.join(dir,'preview-levels.png'),fullPage:true});
  await page.goto(url+'#scenarios');await action('category:사람들과');
  await page.screenshot({path:path.join(dir,'preview-scenarios.png'),fullPage:true});
  await page.goto(url+'#onboarding');
  await page.screenshot({path:path.join(dir,'preview-languages.png'),fullPage:true});
  await action('choose-lang:es');await page.goto(url+'#scenarios');await action('scene:club');
  await page.waitForTimeout(3100); // Let language-change feedback clear before the review image.
  await page.screenshot({path:path.join(dir,'preview-spanish.png'),fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  checks.push('브라우저 실행 오류 0 / 외부 네트워크 요청 0 / PNG 시안 6개');
  console.log(JSON.stringify({status:'passed',browser:browser.version(),checks},null,2));
}finally{await browser.close();}
