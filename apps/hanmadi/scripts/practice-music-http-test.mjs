// Real local Next routes and storage, no browser or model mocking. Never targets production.
import assert from 'node:assert/strict';
import { practiceSongs } from '../lib/original-music.ts';
import { musicLanguageLessons } from '../lib/music-language.ts';
import { starterUnits } from '../lib/v2.ts';
const base = process.env.HANMADI_TEST_BASE ?? 'http://127.0.0.1:3213';
assert(['127.0.0.1','localhost'].includes(new URL(base).hostname), 'Local synthetic accounts only');
let cookie = '';
async function request(path, body, status=200, origin=true) {
  const res = await fetch(base+path, {method:body?'POST':'GET', headers:{...(cookie?{cookie}:{}), ...(body?{'Content-Type':'application/json',...(origin?{Origin:base}:{})}:{})}, ...(body?{body:JSON.stringify(body)}:{})});
  const data=await res.json();
  assert.equal(res.status,status,JSON.stringify(data));
  if (res.headers.getSetCookie().length) cookie=res.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
  return data;
}
const path='/api/study/practice-music';
await request(path,undefined,401);
await request('/api/study/account',{action:'signup',name:'music_http_'+Date.now(),password:'synthetic-http-password-only'});
const firstCookie=cookie;
const first=await request(path); assert.equal(first.songs.length,4);
await request(path,{action:'move'},403,false);
await request(path,{trackId:'unknown',revision:'bad',index:0,action:'move'},400);
for(const song of practiceSongs){
  const audio=await fetch(base+song.audio);
  assert.equal(audio.status,200); assert.match(audio.headers.get('Content-Type'),/^audio\//);
  assert((await audio.arrayBuffer()).byteLength>10000);
  const range=await fetch(base+song.audio,{headers:{Range:'bytes=0-4095'}});
  assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,4096);
  const language=song.language;
  await request('/api/study',{action:'assess',language,answers:[0,0,0],confidence:1,minutes:5});
  const unit=starterUnits(language)[0];
  await request('/api/study',{action:'practice',language,id:unit.id,confidence:'help'});
  await request('/api/study',{action:'completeLesson',language,id:unit.id});
  const send=(action,index=0,answer,status=200)=>request(path,{trackId:song.id,revision:song.revision,action,index,answer},status);
  await send('answer',0,'line-1',409);
  await request(path,{trackId:song.id,revision:'old',action:'move',index:0},409);
  for(let i=0;i<4;i++) await send('practice',i);
  let saved=(await request(path)).progress[song.id];
  assert.equal(saved.phase,'practice'); assert.equal(saved.practiced.length,4);
  await send('review');
  assert.equal((await send('answer',0,'line-2')).correct,false);
  assert.equal((await request(path)).progress[song.id].reviewed.length,0);
  for(let i=0;i<4;i++) assert.equal((await send('answer',i,`line-${i+1}`)).correct,true);
  saved=(await request(path)).progress[song.id];
  assert.equal(saved.reviewed.length,4); assert(saved.dueAt>saved.completedAt);
  assert.deepEqual((await send('answer',3,'line-4')).progress,saved);
  await send('review');
  assert.equal((await request(path)).progress[song.id].reviewed.length,0);
  for(let i=0;i<4;i++) await send('answer',i,`line-${i+1}`);
  const lesson=musicLanguageLessons[language][0];
  assert.equal((await send('word-answer',0,'line-2')).correct,false);
  assert.equal((await send('word-answer',0,'line-1')).correct,true);
  await send('word-answer',0,'line-1');
  await request(path,{trackId:song.id,revision:song.revision,action:'conversation',index:0,confidence:'alone'});
  await request(path,{trackId:song.id,revision:song.revision,action:'conversation',index:0,confidence:'invalid'},400);
  const originalProgress=(await request(path)).progress[song.id];
  assert.deepEqual(originalProgress.wordsReviewed,['line-1']); assert.equal(originalProgress.conversations['line-1'],'alone');
  assert.equal(originalProgress.reviewed.length,4);
  for(const action of ['save-word','save-expression']) {
    const saved=await request(path,{trackId:song.id,revision:song.revision,action,index:0,phrase:{text:'forged',reading:'가짜',meaning:'가짜'}});
    assert.equal(saved.saved,true);
    await send(action);
  }
  const state=(await request('/api/study')).state;
  const words=state.expressions.filter(x=>x.language===language);
  assert.equal(words.length,2,'explicit saves and retries deduplicate');
  assert(words.every(x=>x.source==='music'));
  assert(words.find(x=>x.text===lesson.word.text)?.inVocabulary);
  assert(words.some(x=>x.text===lesson.answer.text));
  assert(!words.some(x=>x.text==='forged'));

  assert(state.profiles[language].completedLessons[unit.id]);
  assert(state.profiles[language].practiced[unit.id]);
  console.log('PASS',language,'assessment → authored lesson → practice/complete → original song → wrong/correct recall → reload/replay');
}
const before=(await request(path)).progress;
cookie='';
await request('/api/study/account',{action:'signup',name:'music_other_'+Date.now(),password:'synthetic-http-password-only'});
assert.deepEqual((await request('/api/study')).state.expressions,[]);
for(const progress of Object.values((await request(path)).progress)) assert.equal(progress.practiced.length,0);
cookie=firstCookie;
assert.deepEqual((await request(path)).progress,before);
console.log('PASS auth, origin, invalid revision, account isolation, language isolation, completion retry');
