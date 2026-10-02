import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createHmac } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { chromium } from "playwright";
const out = process.env.HANMADI_E2E_SCREENSHOTS;
assert(out, "Set HANMADI_E2E_SCREENSHOTS to the approved artifact directory");
await mkdir(out, { recursive: true });
const dir = await mkdtemp(join(resolve(out), "diagnostics-fixture-"));
const dataFile = join(dir, "store.json"), secret = "diagnostic-fixture-only-auth-secret", cronSecret = "diagnostic-fixture-only-cron-secret-32";
let calls = 0, mode = "good";
const phrases = {
  ja: { text: "氷抜きでコーヒーを一杯ください。", reading: "고오리누키데 코히오 입파이 쿠다사이", meaning: "얼음 없이 커피 한 잔 주세요." },
  th: { text: "ขอกาแฟหนึ่งแก้ว ไม่ใส่น้ำแข็งครับ", reading: "커 까패 능 깨우 마이 싸이 남캥 캅", meaning: "얼음 없이 커피 한 잔 주세요." },
  en: { text: "One coffee without ice, please.", reading: "원 커피 위다웃 아이스 플리즈", meaning: "얼음 없이 커피 한 잔 주세요." },
  es: { text: "Un café sin hielo, por favor.", reading: "운 카페 신 이에로 포르 파보르", meaning: "얼음 없이 커피 한 잔 주세요." },
};
const replies = {
  ja: { text: "氷抜きのコーヒーですね。", reading: "고오리누키노 코히데스네", meaning: "얼음 없는 커피군요." },
  th: { text: "ได้ครับ", reading: "다이 캅", meaning: "알겠습니다." },
  en: { text: "One coffee without ice. Got it!", reading: "원 커피 위다웃 아이스 갓 잇", meaning: "얼음 없는 커피 한 잔이군요. 알겠습니다!" },
  es: { text: "De acuerdo, un café sin hielo.", reading: "데 아쿠에르도 운 카페 신 이에로", meaning: "알겠습니다. 얼음 없는 커피 한 잔이요." },
};
const mock = createServer(async (req, res) => {
  try {
    const chunks=[]; for await(const c of req) chunks.push(c);
    const body=JSON.parse(Buffer.concat(chunks).toString()); calls++;
    const first=body.messages[0].content.split("\n")[0];
    const language = /Japanese/.test(first) ? "ja" : /Thai/.test(first) ? "th" : /Spanish/.test(first) ? "es" : "en";
    const p=phrases[language], name=body.response_format?.json_schema?.name;
    const result=name==='hanmadi_translation' ? { translated:p.text, reading:p.reading, practice:p } : name==='hanmadi_learner_turn' ? { phrase:p, reusable:true } : replies[language];
    res.setHeader('Content-Type','application/json');
    if(mode==='recover'){mode='good';res.statusCode=503;res.end('{"error":"fixture-only"}');return;}
    if(mode==='offline'){res.statusCode=503;res.end('{"error":"fixture-only"}');return;}
    const repair=mode==='repair' && name==='hanmadi_roleplay' && !body.messages[0].content.includes('REPAIR:');
    res.end(JSON.stringify({choices:[{message:{content:mode==='invalid'||repair ? 'invalid fixture' : JSON.stringify(result)}}]}));
  } catch {res.statusCode=500;res.end('{}');}
});
mock.listen(0,'127.0.0.1');await once(mock,'listening');
const socket=createServer().listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));
const base=`http://127.0.0.1:${port}`;
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',String(port)],{detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'development',HANMADI_DEPLOYMENT:'admin',AUTH_SECRET:secret,TUTOR_PINS:'owner:654321',HANMADI_LOCAL_DATA_FILE:dataFile,UPSTASH_REDIS_REST_URL:'',UPSTASH_REDIS_REST_TOKEN:'',KV_REST_API_URL:'',KV_REST_API_TOKEN:'',LITELLM_BASE_URL:`http://127.0.0.1:${mock.address().port}`,LITELLM_API_KEY:'fixture-only',LITELLM_MODEL:'fixture',CRON_SECRET:cronSecret,HANMADI_DIAGNOSTICS_ENABLED:'true'}});
let logs='',browser;for(const s of [app.stdout,app.stderr])s.on('data',d=>logs=(logs+d).slice(-24000));
try{
  for(let i=0;;i++){try{if((await fetch(base+'/api/deployment')).ok)break;}catch{}if(i>90||app.exitCode!==null)throw Error('App startup failed');await new Promise(r=>setTimeout(r,1000));}
  const path='/api/study/admin/diagnostics', cron='/api/study/diagnostics/cron';
  assert.equal((await fetch(base+path)).status,403);
  assert.equal((await fetch(base+cron)).status,401);
  assert.equal((await fetch(base+cron,{headers:{Authorization:'Bearer wrong'}})).status,401);
  const payload=Buffer.from(JSON.stringify({n:'guest',tid:'guest-id',r:'tutor',t:Date.now()})).toString('base64url');
  const cookie=`hanmadi_tutor=${payload}.${createHmac('sha256',secret).update(payload).digest('base64url')}`;
  assert.equal((await fetch(base+path,{headers:{cookie}})).status,403);assert.equal(calls,0);
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})});
  const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/admin-login');await page.getByLabel('관리자 PIN').fill('654321');await page.getByRole('button',{name:'관리자 로그인',exact:true}).click();
  await page.getByRole('button',{name:'AI 진단',exact:true}).click();await page.getByRole('button',{name:'일본어 지금 진단'}).waitFor();
  const before=calls;await page.getByRole('button',{name:'상태 새로고침'}).click();await page.getByRole('button',{name:'상태 새로고침'}).waitFor();assert.equal(calls,before,'GET never invokes a model');
  assert.equal((await page.request.post(base+path,{headers:{Origin:'https://evil.test'},data:{language:'ja'}})).status(),403);
  assert.equal((await page.request.post(base+path,{headers:{Origin:base},data:{language:'ko'}})).status(),400);
  async function manual(language){const r=await page.request.post(base+path,{headers:{Origin:base},data:{language}});return {status:r.status(),data:await r.json()};}
  async function scheduled(){const r=await fetch(base+cron,{headers:{Authorization:`Bearer ${cronSecret}`}});return {status:r.status,data:await r.json()};}
  mode='repair';await page.getByRole('button',{name:'일본어 지금 진단'}).click();
  const ja=page.getByRole('article',{name:'일본어 진단'});await ja.getByText('재생성 후 통과',{exact:true}).waitFor();assert.equal(calls-before,4);
  mode='offline';const offline=await manual('th');assert.equal(offline.status,200);assert(offline.data.report.probes.every(p=>p.findings.includes('upstream')&&p.findings.includes('unavailable')&&p.calls===2));
  mode='invalid';const invalid=await manual('es');assert.equal(invalid.data.report.status,'failed');assert(invalid.data.report.probes.every(p=>p.calls===2));
  mode='recover';const good=await manual('en');assert.equal(good.data.report.status,'warning',JSON.stringify(good));assert.deepEqual(good.data.report.probes[0].findings,['recovered']);assert.equal(good.data.report.probes[0].calls,2);assert.equal(good.data.report.probes[0].failures,1);
  await page.getByRole('button',{name:'상태 새로고침'}).click();await page.getByText('AI 호출 실패',{exact:true}).first().waitFor();await page.getByText('일시 장애 후 재시도 성공',{exact:true}).waitFor();await page.getByText('제공자 일시 이용 불가 (503)',{exact:true}).first().waitFor();
  for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:join(out,`diagnostics-${width}.png`),fullPage:true});}
  const scheduledBefore=calls, daily=await scheduled();assert.equal(daily.status,200);assert(daily.data.results.every(r=>r.status==='passed'),JSON.stringify(daily));assert.equal(calls-scheduledBefore,12);
  const onceCalls=calls;assert((await scheduled()).data.results.every(r=>r.status==='already-run'));assert.equal(calls,onceCalls);
  assert.equal((await manual('ja')).status,200);assert.equal((await manual('ja')).status,429);
  await page.reload();await page.getByRole('button',{name:'AI 진단',exact:true}).click();await page.getByRole('article',{name:'일본어 진단'}).getByText('검사 통과',{exact:true}).waitFor();
  const db=JSON.parse(await readFile(dataFile,'utf8'));assert(Object.keys(db['hanmadi:v2']).every(k=>k.startsWith('llm-diagnostics:')),'no study data saved');
  const th=JSON.parse(db['hanmadi:v2']['llm-diagnostics:v1:th']);th.runs[0].status='running';th.runs[0].startedAt=Date.now()-48*3600000;th.runs[0].leaseUntil=Date.now()-1000;db['hanmadi:v2']['llm-diagnostics:v1:th']=JSON.stringify(th);await writeFile(dataFile,JSON.stringify(db));
  await page.getByRole('button',{name:'상태 새로고침'}).click();await page.getByText('진단 중단',{exact:true}).waitFor();await page.getByText('36시간 이상 지난 결과예요. 다시 검사해 주세요.').waitFor();
  assert.deepEqual(errors,[]);await writeFile(join(out,'result.json'),JSON.stringify({passed:true,provider:'synthetic fixture',calls,checks:['owner authentication','origin validation','4 languages / 3 probes','repair / upstream / quality findings','mobile 320 390 / desktop 1440','daily duplicate prevention','manual budget','history persistence','stale / interrupted','no learner storage'],errors},null,2));
  console.log('PASS diagnostics E2E: owner → run → persisted results, cron, budgets, errors, mobile, isolation');
}catch(error){console.error(logs);throw error;}
finally{await browser?.close();const exited=app.exitCode!==null?Promise.resolve():once(app,'exit');try{process.kill(-app.pid,'SIGTERM');}catch{}const timer=setTimeout(()=>{try{process.kill(-app.pid,'SIGKILL');}catch{}},5000);await exited;clearTimeout(timer);await new Promise(r=>mock.close(r));await rm(dir,{recursive:true,force:true});}
