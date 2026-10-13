import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {StateStore} from '../runtime/sdk.mjs';
import {makeDraft,saveDraft,parseBundle} from '../src/draft.mjs';
import {checkDependency} from '../tools/check-dependency.mjs';
import {input} from './synthetic.mjs';
assert.ok(process.env.DRAMA_TEST_STATE,'Set DRAMA_TEST_STATE to a nonsynced local directory');
const dir=mkdtempSync(join(process.env.DRAMA_TEST_STATE,'runner-'));after(()=>rmSync(dir,{recursive:true,force:true}));
test('public SDK resolves to clean pinned checkout',()=>assert.match(checkDependency().commit,/^ad94/));
test('successful synthetic legacy plan becomes an explicitly unverified, unauthorized preview',()=>{
  const b=input(); assert.equal(b.legacyResult.ok,true);
  const d=makeDraft(b); assert.equal(d.authorized,false);assert.equal(d.status,'unverified-preview');
  assert.equal(d.plan.clips.length,4);assert.match(d.subject.digests.content,/^sha256:[a-f0-9]{64}$/);
  const changed=structuredClone(b);changed.legacyResult.plan.createdAt='2026-10-11T00:00:00Z';assert.deepEqual(makeDraft(changed),d);
});
test('source, review and execution digests respond independently to bound inputs',()=>{
  const b=input(),d=makeDraft(b), c=structuredClone(b);c.inputs.episode='d'.repeat(64);
  const n=makeDraft(c);assert.notEqual(n.subject.digests.content,d.subject.digests.content);assert.notEqual(n.subject.digests.reviewContext,d.subject.digests.reviewContext);assert.equal(n.subject.digests.execution,d.subject.digests.execution);
  c.inputs=b.inputs;c.legacyResult.plan.clips[0].prompt+=' changed';assert.notEqual(makeDraft(c).subject.digests.execution,d.subject.digests.execution);
});
for(const [name,mutate] of [
  ['failed legacy result',b=>{b.legacyResult.ok=false;b.legacyResult.plan=null;}],
  ['missing report',b=>b.legacyResult.reports.pop()],
  ['contradictory report',b=>b.legacyResult.reports[0].findings.push({severity:'block'})],
  ['wrong report fingerprint',b=>{b.legacyResult.reports[0].fingerprint='other';}],
  ['duplicate cut',b=>{b.legacyResult.plan.clips[1].cutId=b.legacyResult.plan.clips[0].cutId;}],
  ['unknown cost',b=>{b.legacyResult.plan.clips[0].estCredits=null;}],
  ['exceeded budget',b=>{b.legacyResult.plan.budgetCredits=1;}],
  ['bad hash',b=>{b.inputs.series='forged';}],
  ['NFD semantic content',b=>{b.legacyResult.plan.clips[0].prompt+=' 한글'.normalize('NFD');}],
  ['extra approval',b=>{b.authorized=true;}],
]) test(`reject ${name}`,()=>{const b=input();mutate(b);assert.throws(()=>makeDraft(b),{code:'invalid-input',exitCode:2});});
test('strict JSON refuses duplicate keys',()=>assert.throws(()=>parseBundle('{"x":1,"x":2}'),{code:'invalid-json'}));
test('real stale-gate episode result cannot become a preview',()=>{
  const g=JSON.parse(readFileSync(new URL('./fixtures/legacy-golden.json',import.meta.url),'utf8'));const b=input();b.legacyResult=g.plan.stdout;assert.throws(()=>makeDraft(b),{code:'invalid-input'});
});
test('local new store: immutable CAS, repeat delivery, persisted schema and identity',()=>{
  const path=join(dir,'new.db'),d=makeDraft(input());const a=saveDraft(path,d),b=saveDraft(path,d);
  assert.equal(a.ok,true);assert.equal(a.replayed,false);assert.equal(b.ok,true);assert.equal(b.replayed,true);assert.equal(a.previewId,b.previewId);
  const s=StateStore.open({path,knownSchemas:{'commerce.drama-plan-preview':1},syncFolderDenylist:[]});
  try {const doc=s.read([{collection:'drama-previews',key:a.previewId}]).docs[0];assert.equal(doc.revision,1);assert.deepEqual(doc.body,d);assert.equal(doc.updatedBy.agent,'drama-runner');}finally{s.close();}
});
test('mutated authorization/digest is rejected before DB creation',()=>{
  for(const mutate of [d=>{d.authorized=true;},d=>{d.subject.digests.content='sha256:'+'0'.repeat(64);}]) {
    const d=makeDraft(input());mutate(d);const path=join(dir,'must-not-exist.db');assert.throws(()=>saveDraft(path,d),{code:'invalid-input'});assert.equal(existsSync(path),false);
  }
});
test('synced DB is rejected, leaving legacy inputs unchanged',()=>{
  const result=saveDraft(join(process.env.DRAMA_TEST_ARTIFACTS,'denied.db'),makeDraft(input()));assert.equal(result.code,'unsupported-location');assert.equal(result.exitCode,2);
});
test('CLI preview and local storage E2E; generate/approve commands unavailable',()=>{
  const file=join(dir,'input.json');writeFileSync(file,JSON.stringify(input()));
  const run=args=>{const r=spawnSync(process.execPath,['src/cli.mjs',...args],{cwd:new URL('../',import.meta.url),encoding:'utf8',timeout:30_000});assert.equal(r.error,undefined);return {status:r.status,body:JSON.parse(r.stdout)};};
  const preview=run(['preview','--input',file]);assert.equal(preview.status,0);assert.equal(preview.body.preview.authorized,false);
  const saved=run(['preview','--input',file,'--db',join(dir,'cli.db')]);assert.equal(saved.status,0);assert.equal(saved.body.authorized,false);
  for(const verb of ['generate','approve','migrate']) assert.equal(run([verb,'--input',file]).status,2);
});

test('an existing foreign SQLite file is refused without byte changes',()=>{
  const path=join(dir,'legacy.db'),db=new DatabaseSync(path);db.exec('CREATE TABLE legacy(value TEXT); INSERT INTO legacy VALUES (\'preserve\')');db.close();
  const before=readFileSync(path);assert.throws(()=>saveDraft(path,makeDraft(input())),{code:'foreign-database'});assert.deepEqual(readFileSync(path),before);
});

test('owned DB under an exclusive lock returns retryable 75, never foreign-database',()=>{
  const path=join(dir,'locked.db'),draft=makeDraft(input());assert.equal(saveDraft(path,draft).ok,true);
  const lock=new DatabaseSync(path);lock.exec('PRAGMA journal_mode=DELETE; PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE');
  try {assert.deepEqual(saveDraft(path,draft),{ok:false,code:'busy',exitCode:75,retryable:true,detail:'Preview database is locked; retry later'});}
  finally {lock.exec('ROLLBACK');lock.close();}
  assert.equal(saveDraft(path,draft).ok,true);
});
