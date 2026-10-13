// Explicitly authorized disposable account; no personal learner progress is touched.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { starterUnits } from '../lib/v2.ts';
assert(process.argv.includes('--confirm-live'), 'Creates a test account and makes four live chat requests. Explicit authorization required.');
assert(process.env.HANMADI_E2E_ARTIFACTS,'Set HANMADI_E2E_ARTIFACTS');
const base='https://hanmadi-lake.vercel.app';
let cookie='';
const result={at:new Date().toISOString(),base,mode:'live HTTP: no response mocking; browser remains a separate check',languages:[]};
async function call(path,body){
  const start=performance.now();
  const r=await fetch(base+path,{headers:{...(cookie?{cookie}:{}),...(body?{Origin:base,'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(110000)});
  const data=await r.json();
  if(r.headers.getSetCookie().length)cookie=r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
  assert.equal(r.status,200,JSON.stringify({path,status:r.status,error:data.error}));
  return {data,ms:Math.round(performance.now()-start)};
}
const inputs={en:'One coffee, please.',ja:'コーヒーを一つください。',th:'ขอกาแฟหนึ่งแก้วครับ',es:'Un café, por favor.'};
try{
  result.deployment=(await call('/api/deployment')).data;
  await call('/api/study/account',{action:'signup',name:'qa_lang_'+Date.now(),password:randomBytes(24).toString('base64url')});
  // Save only explicit selections for this test, independent of automatic learner analysis.
  await call('/api/study',{action:'settings',autoSave:true,autoSaveChat:false});
  for(const [language,input] of Object.entries(inputs)){
    const check={language}; result.languages.push(check);
    try{
      await call('/api/study',{action:'assess',language,answers:[0,0,0],confidence:1,minutes:5});check.assessment=true;
      const unit=starterUnits(language).find(x=>x.scene==='cafe'&&x.level===1);
      assert(unit);
      await call('/api/study',{action:'completeLesson',language,id:unit.id});check.lesson=true;
      const chat=await call('/api/study',{action:'chat',language,scene:'cafe',selection:'default',messages:[{role:'user',content:input}]});
      check.chatMs=chat.ms;check.reply=chat.data.reply;check.learner=chat.data.learnerPhrase;check.learning=chat.data.learning;
      const phrase=chat.data.learnerPhrase ?? chat.data.reply;
      assert(phrase?.text && phrase?.reading && phrase?.meaning);
      const saved=(await call('/api/study',{action:'save-chat',language,phrase})).data;
      const expression=saved.state.expressions.find(x=>x.language===language&&x.text===phrase.text); assert(expression);
      await call('/api/study',{action:'practice',language,id:expression.id,confidence:'help'});
      const after=(await call('/api/study')).data.state;
      const restored=after.expressions.find(x=>x.id===expression.id);assert(restored.dueAt>restored.practicedAt);
      assert(after.profiles[language].completedLessons[unit.id]);check.savedAndReviewRestored=true;
      console.log('PASS',language,chat.ms+'ms','assessment / lesson / live chat / save / review read-back');
    }catch(e){check.error=e.message;console.log('FAIL',language,check.error);}
  }
}finally{
  await writeFile(resolve(process.env.HANMADI_E2E_ARTIFACTS,'language-live.json'),JSON.stringify(result,null,2));
  if(cookie)await call('/api/study/account',{action:'logout'}).catch(()=>{});
}
if(result.languages.length!==4||result.languages.some(x=>x.error))process.exitCode=1;
