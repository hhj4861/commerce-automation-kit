// Real Chromium UI verification with synthetic account responses; never uses user credentials.
// PLAYWRIGHT_ENTRY=/absolute/playwright/index.mjs SETTINGS_TEST_DIR=/artifact/path node this-file
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_ENTRY?pathToFileURL(process.env.PLAYWRIGHT_ENTRY).href:'playwright');
const out=process.env.SETTINGS_TEST_DIR;
if(!out)throw Error('SETTINGS_TEST_DIR required');
await mkdir(out,{recursive:true});
const root=resolve(import.meta.dirname,'../public');
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1100}});
let account={configured:false},failRead=false,failWrite=false,delayWrite=false,releaseWrite,puts=0,deletes=0;
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const json=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),p=url.pathname;
  if(url.hostname!=='settings.test')return route.abort();
  if(p==='/api/studio/kandinsky/account'){
    if(request.method()==='PUT'){
      puts++;if(delayWrite)await new Promise(r=>releaseWrite=r);
      if(failWrite)return json(route,{error:'시험: 토큰을 확인하지 못했습니다.'},502);
      account={configured:true,name:'sample-creator',updatedAt:'2026-10-14T12:00:00Z'};
    }
    if(request.method()==='DELETE'){deletes++;account={configured:false};}
    if(failRead)return json(route,{error:'시험: 서버 연결을 확인하세요.'},503);
    return json(route,account);
  }
  if(p==='/auth/status')return json(route,{authenticated:true,user:{name:'UI 검증 계정'}});
  if(p==='/api/jobs')return json(route,{jobs:[],workerAt:new Date().toISOString()});
  if(p==='/api/studio/config')return json(route,{execution:'cloud-worker',capabilities:{workerAt:new Date().toISOString()}});
  if(p.startsWith('/api/'))return json(route,{items:[],requests:[],unreadCount:0,notifications:[],jobs:[],projects:[],configured:false});
  const path=resolve(root,'.'+(p==='/settings'?'/index.html':p));
  if(!path.startsWith(root+'/'))return route.abort();
  try{return route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream',body:await readFile(path)});}catch{return route.fulfill({status:404,body:'fixture missing'});}
});
try{
  await page.goto('https://settings.test/settings');
  const hf=page.locator('hf-account-settings'),state=hf.locator('#state'),token=hf.locator('#token');
  const waitText=async text=>{await page.waitForFunction(text=>document.querySelector('hf-account-settings')?.shadowRoot.querySelector('#state').textContent.includes(text),text);};
  await waitText('계정을 연결');assert.equal(await hf.locator('#account-dialog').isVisible(),false);await hf.locator('#manage').click();assert(await token.isVisible());assert.equal(await hf.locator('#generate').isVisible(),false);
  console.log('PASS missing token invites registration');
  await token.fill('hf_SyntheticBrowserFixture12345');delayWrite=true;
  await hf.locator('#save').click();await waitText('저장하는 중');assert(await token.isDisabled());assert(await hf.locator('#save').isDisabled());
  await page.evaluate(()=>document.querySelector('hf-account-settings').shadowRoot.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(puts,1);await page.keyboard.press('Escape');assert(await hf.locator('#account-dialog').isVisible());releaseWrite();delayWrite=false;
  await waitText('저장이 완료');assert.equal(await token.inputValue(),'');assert.equal(await token.isVisible(),false);assert(await hf.locator('#generate').isVisible());
  assert.match(await hf.locator("#description").innerText(),/sample-creator/);assert.match(await hf.locator("#description").innerText(),/다시 입력할 필요 없어요/);
  console.log('PASS pending blocks duplicate submits; saved view hides token and shows next action');
  await page.screenshot({path:resolve(out,'settings-dialog-desktop.png'),fullPage:true});
  await hf.locator('#close').click();
  const checkAlignment=async()=>{
    const result=await page.evaluate(()=>{
      const host=document.querySelector('hf-account-settings');
      const buttons=[host.shadowRoot.querySelector('#manage'),...document.querySelectorAll('.settings-other .account-action')];
      return buttons.map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el),row=getComputedStyle(el.closest('.account-row'));return {width:r.width,height:r.height,right:r.right,fontSize:s.fontSize,lineHeight:s.lineHeight,letterSpacing:s.letterSpacing,fontWeight:s.fontWeight,paddingTop:row.paddingTop,paddingBottom:row.paddingBottom};});
    });
    assert.equal(result.length,3);
    for(const value of result){assert.equal(value.width,104);assert.equal(value.height,42);assert(Math.abs(value.right-result[0].right)<1);assert.equal(value.fontSize,'13px');assert.equal(value.lineHeight,'20px');assert(['normal','0px'].includes(value.letterSpacing));assert.equal(value.fontWeight,'600');assert.equal(value.paddingTop,'18px');assert.equal(value.paddingBottom,'18px');}
  };
  await checkAlignment();
  await page.screenshot({path:resolve(out,'settings-saved-desktop.png'),fullPage:true});
  await page.reload();await waitText('안전하게 저장');assert.equal(await token.isVisible(),false);
  console.log('PASS reload reads persisted account status');await hf.locator('#manage').click();
  await hf.locator('#replace').click();await token.fill('hf_SyntheticDraft12345');
  await page.evaluate(()=>load(true));assert.equal(await token.inputValue(),'hf_SyntheticDraft12345');
  assert.equal(await hf.locator('#replace').getAttribute('aria-expanded'),'true');
  console.log('PASS automatic jobs refresh preserves token editor and input');
  await hf.locator('#cancel').click();assert.equal(await token.inputValue(),'');assert.equal(await token.isVisible(),false);assert.equal(puts,1);
  console.log('PASS replacement cancel clears draft without writing');
  await hf.locator('#replace').click();await token.fill('hf_SyntheticInvalid12345');failWrite=true;
  await hf.locator('#save').click();await hf.locator('#error').waitFor({state:'visible'});assert.match(await state.innerText(),/안전하게 저장/);assert.equal(await token.inputValue(),'');assert.equal(puts,2);
  console.log('PASS rejected replacement retains stored account and shows failure');
  failWrite=false;await hf.locator('#cancel').click();
  failRead=true;await hf.locator('#retry').click();await waitText('확인하지 못');assert.equal(await token.isVisible(),false);assert.equal(await hf.locator('#generate').isVisible(),false);assert.match(await hf.locator("#description").innerText(),/없다는 뜻은 아닙니다/);
  console.log('PASS read error is unknown, not unconfigured');
  failRead=false;await hf.locator('#retry').click();await waitText('안전하게 저장');
  await hf.locator('#disconnect').click();assert.equal(deletes,0);await hf.locator('#cancel-delete').click();assert.equal(deletes,0);
  await hf.locator('#disconnect').click();await hf.locator('#confirm-delete').click();await waitText('삭제했어요');assert.equal(deletes,1);assert(await token.isVisible());
  console.log('PASS delete requires confirmation and renders registration after success');
  account={configured:true,name:'sample-creator',updatedAt:'2026-10-14T12:00:00Z'};
  await page.setViewportSize({width:390,height:844});await page.reload();await waitText('안전하게 저장');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await checkAlignment();await page.screenshot({path:resolve(out,'settings-saved-mobile.png'),fullPage:true});await hf.locator('#manage').click();
  await hf.locator('#replace').click();await token.fill('hf_SyntheticMobileDraft12345');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:resolve(out,'settings-replace-mobile.png'),fullPage:true});
  console.log('PASS mobile saved/editor layout has no horizontal overflow');
  // A failed mutation followed by an unavailable read must not claim saved or empty.
  failWrite=true;failRead=true;await hf.locator('#save').click();await waitText('확인하지 못');
  assert.equal(await token.isVisible(),false);assert.equal(await token.inputValue(),'');assert.equal(await hf.locator('#generate').isVisible(),false);
  failRead=false;failWrite=false;await hf.locator('#retry').click();await waitText('안전하게 저장');
  console.log('PASS uncertain write plus read failure hides stale account; explicit refresh recovers');
  await hf.locator('#replace').click();await token.fill('hf_SyntheticCancelDraft12345');await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.querySelector('hf-account-settings').shadowRoot.querySelector('#token').value==='');
  assert.equal(await token.inputValue(),'');assert.equal(await hf.locator('#account-dialog').isVisible(),false);
  assert(await hf.locator('#manage').evaluate(el=>el.getRootNode().activeElement===el));
  console.log('PASS dialog Escape clears draft and restores focus; all three account buttons align on desktop and mobile');

  assert.deepEqual(errors,[]);console.log('PASS no browser page errors');
}finally{await browser.close();}
