import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,symlinkSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {loadInputFiles,verifyInputs} from '../src/inputs.mjs';
import {root} from './legacy.mjs';
import {input} from './synthetic.mjs';
assert.ok(process.env.DRAMA_TEST_STATE,'Set DRAMA_TEST_STATE to a nonsynced local directory');
const dir=mkdtempSync(join(process.env.DRAMA_TEST_STATE,'inputs-'));after(()=>rmSync(dir,{recursive:true,force:true}));
const sha=b=>createHash('sha256').update(b).digest('hex');
let cases=0;
// Real files plus a valid bundle whose manifest records their raw SHA-256 (BOM, CRLF and NFD bytes on purpose).
function fixture() {
  const d=join(dir,`case-${++cases}`);mkdirSync(join(d,'gates'),{recursive:true});
  const put=(rel,text)=>{writeFileSync(join(d,rel),text);return sha(Buffer.from(text));};
  const contents={'props.json':'{"ok":true}','scenario.json':'[]\r\n'};
  const inputs={series:put('series.json','{"title":"s"}\n'),episode:put('episode.json','﻿{"line":"'+'한글 대사'.normalize('NFD')+'"}\r\n'),
    gates:Object.fromEntries(Object.entries(contents).map(([k,text])=>[k,put(`gates/${k}`,text)]))};
  const b=input();b.inputs=inputs;writeFileSync(join(d,'bundle.json'),JSON.stringify(b));
  writeFileSync(join(d,'files.json'),JSON.stringify({series:'series.json',episode:'episode.json',gates:{'props.json':'gates/props.json','scenario.json':'gates/scenario.json'}}));
  return {d,inputs,manifest:join(d,'files.json'),bundle:join(d,'bundle.json')};
}
const cli=(...args)=>{const r=spawnSync(process.execPath,['src/cli.mjs',...args],{cwd:new URL('../',import.meta.url),encoding:'utf8',timeout:30_000});assert.equal(r.error,undefined);return {status:r.status,body:JSON.parse(r.stdout),stdout:r.stdout,stderr:r.stderr};};
// Handled output never carries a path: neither the case folder nor the home folder (repo, pin and SDK live under it).
const pathFree=(r,...paths)=>{for (const s of [r.stdout,r.stderr]) for (const p of [...paths,homedir()]) assert.equal(s.includes(p),false);};
const rejects=(promise,code,failures)=>assert.rejects(promise,e=>{assert.equal(e.code,code);if(failures)assert.deepEqual(e.extra.failures,failures);return true;});
const VERIFIED={method:'sha256-raw-bytes',series:true,episode:true,gates:2};
test('real episode-1 inputs match the raw SHA-256 values recorded before the runner existed',async()=>{
  const g=JSON.parse(readFileSync(new URL('./fixtures/legacy-golden.json',import.meta.url),'utf8')).inputs,src=join(root,'docs/videos/20261006-regression-pilot');
  const gates=Object.keys(g).filter(k=>k.startsWith('gates-9min/'));assert.equal(gates.length,20);
  const declared={series:g['series.json'],episode:g['ep01-9min.json'],gates:Object.fromEntries(gates.map(k=>[k.slice('gates-9min/'.length),g[k]]))};
  const files={series:join(src,'series.json'),episode:join(src,'ep01-9min.json'),gates:Object.fromEntries(gates.map(k=>[k.slice('gates-9min/'.length),join(src,k)]))};
  assert.deepEqual(await verifyInputs(declared,files),{method:'sha256-raw-bytes',series:true,episode:true,gates:20});
  declared.gates['props.json']='0'.repeat(64);
  await rejects(verifyInputs(declared,files),'input-mismatch',[{name:'gates/props.json',reason:'sha-mismatch'}]);
});
test('bytes are hashed as stored: BOM, CRLF and NFD text are never normalized',async()=>{
  const f=fixture(),files=loadInputFiles(f.manifest);
  assert.deepEqual(await verifyInputs(f.inputs,files),VERIFIED);
  writeFileSync(files.episode,readFileSync(files.episode,'utf8').normalize('NFC'));writeFileSync(files.gates['scenario.json'],'[]\n');
  await rejects(verifyInputs(f.inputs,files),'input-mismatch',[{name:'episode',reason:'sha-mismatch'},{name:'gates/scenario.json',reason:'sha-mismatch'}]);
});
test('the files manifest must name exactly the bundle inputs',async()=>{
  const f=fixture(),files=loadInputFiles(f.manifest);
  for (const mutate of [x=>{delete x.gates['props.json'];},x=>{x.gates['extra.json']=x.series;},x=>{delete x.series;},x=>{x.gates['props.json']=7;}]) {
    const c=structuredClone(files);mutate(c);await rejects(verifyInputs(f.inputs,c),'input-manifest-mismatch');
  }
  const b=structuredClone(f.inputs);b.series='forged';await rejects(verifyInputs(b,files),'invalid-input');
});
test('missing, directory, symlink and FIFO inputs are refused without blocking',async()=>{
  const f=fixture(),files=loadInputFiles(f.manifest),link=join(f.d,'link.json'),fifo=join(f.d,'fifo.json');
  symlinkSync(files.series,link);execFileSync('mkfifo',[fifo]);
  for (const [series,reason] of [[link,'not-regular-file'],[f.d,'not-regular-file'],[fifo,'not-regular-file'],[join(f.d,'absent.json'),'missing']])
    await rejects(verifyInputs(f.inputs,{...files,series}),'input-unreadable',[{name:'series',reason}]);
});
test('files manifest is strict JSON with a closed schema',()=>{
  const f=fixture();let i=0;
  const load=text=>{const p=join(f.d,`manifest-${++i}.json`);writeFileSync(p,text);return ()=>loadInputFiles(p);};
  assert.throws(load('{"series":"a","series":"b","episode":"e","gates":{}}'),{code:'invalid-json'});
  for (const bad of [{series:'s',episode:'e',gates:{},extra:1},{series:'',episode:'e',gates:{}},{series:'s',episode:7,gates:{}},{series:'s',episode:'e',gates:{'p.json':''}},{series:'s',episode:'e'}])
    assert.throws(load(JSON.stringify(bad)),{code:'invalid-input'});
  assert.throws(()=>loadInputFiles(join(f.d,'absent-manifest.json')),{code:'input-unreadable'});
});
test('relative paths resolve against the manifest directory; absolute paths are kept',()=>{
  const f=fixture(),files=loadInputFiles(f.manifest);
  assert.equal(files.series,join(f.d,'series.json'));assert.equal(files.gates['props.json'],join(f.d,'gates/props.json'));
  writeFileSync(f.manifest,JSON.stringify({series:join(dir,'elsewhere.json'),episode:'episode.json',gates:{'props.json':'gates/props.json'}}));
  assert.equal(loadInputFiles(f.manifest).series,join(dir,'elsewhere.json'));
});
test('CLI verify-inputs: exit 0 on a match, exit 2 naming inputs but never paths on mismatch or unreadable input',()=>{
  const f=fixture(),ok=cli('verify-inputs','--input',f.bundle,'--files',f.manifest);
  assert.equal(ok.status,0);assert.deepEqual(ok.body,{ok:true,verified:VERIFIED,authorized:false});
  writeFileSync(join(f.d,'gates/props.json'),'{"ok":false}');
  const bad=cli('verify-inputs','--input',f.bundle,'--files',f.manifest);
  assert.equal(bad.status,2);assert.equal(bad.body.code,'input-mismatch');assert.deepEqual(bad.body.failures,[{name:'gates/props.json',reason:'sha-mismatch'}]);
  rmSync(join(f.d,'series.json'));
  const gone=cli('verify-inputs','--input',f.bundle,'--files',f.manifest);
  assert.equal(gone.status,2);assert.equal(gone.body.code,'input-unreadable');assert.deepEqual(gone.body.failures.map(x=>x.name),['series','gates/props.json']);
  rmSync(f.manifest);
  const noManifest=cli('verify-inputs','--input',f.bundle,'--files',f.manifest);
  assert.equal(noManifest.status,2);assert.equal(noManifest.body.code,'input-unreadable');
  for (const r of [bad,gone,noManifest]) pathFree(r,f.d);
});
test('CLI: an unreadable bundle gets a fixed message and no path in either command',()=>{
  const f=fixture(),absent=join(f.d,'absent-bundle.json');
  for (const args of [['verify-inputs','--input',absent,'--files',f.manifest],['verify-inputs','--input',f.d,'--files',f.manifest],['preview','--input',absent],['preview','--input',f.d,'--files',f.manifest]]) {
    const r=cli(...args);
    assert.equal(r.status,2);assert.deepEqual(r.body,{ok:false,code:'input-unreadable',detail:'Cannot read input bundle'});pathFree(r,f.d);
  }
});
test('dependency check failures carry fixed messages and print nothing themselves',()=>{
  const fake=join(dir,'no-such-pin');
  const r=spawnSync(process.execPath,['--input-type=module','-e',`import {checkDependency} from './tools/check-dependency.mjs';try{checkDependency(${JSON.stringify(fake)});}catch(e){console.log(JSON.stringify(e.message));}`],{cwd:new URL('../',import.meta.url),encoding:'utf8',timeout:30_000});
  assert.equal(r.error,undefined);assert.equal(r.status,0);assert.equal(JSON.parse(r.stdout),'atomworks pin checkout unavailable');pathFree(r,fake);
});
test('CLI preview --files verifies before any DB write; without --files the preview output is unchanged',()=>{
  const f=fixture(),plain=cli('preview','--input',f.bundle),checked=cli('preview','--input',f.bundle,'--files',f.manifest);
  assert.equal(checked.status,0);assert.deepEqual(checked.body.preview,plain.body.preview);assert.deepEqual(Object.keys(plain.body),['ok','preview','authorized']);
  assert.deepEqual(checked.body.inputsVerified,VERIFIED);assert.equal(checked.body.preview.status,'unverified-preview');
  const db=join(dir,`preview-${cases}.db`),saved=cli('preview','--input',f.bundle,'--files',f.manifest,'--db',db);
  assert.equal(saved.status,0);assert.deepEqual(saved.body.inputsVerified,VERIFIED);
  const before=readFileSync(db),fresh=join(dir,`refused-${cases}.db`);writeFileSync(join(f.d,'series.json'),'{"title":"changed"}\n');
  for (const target of [db,fresh]) {const r=cli('preview','--input',f.bundle,'--files',f.manifest,'--db',target);assert.equal(r.status,2);assert.equal(r.body.code,'input-mismatch');}
  assert.deepEqual(readFileSync(db),before);assert.equal(existsSync(fresh),false);
});
test('CLI: verify-inputs requires --files and refuses --db; a bad bundle SHA fails before any file is opened',()=>{
  const f=fixture(),never=join(dir,`never-${cases}.db`);
  assert.equal(cli('verify-inputs','--input',f.bundle).body.code,'usage');
  assert.equal(cli('verify-inputs','--input',f.bundle,'--files',f.manifest,'--db',never).body.code,'usage');assert.equal(existsSync(never),false);
  const b=JSON.parse(readFileSync(f.bundle,'utf8'));b.inputs.series='forged';writeFileSync(f.bundle,JSON.stringify(b));rmSync(f.manifest);
  const r=cli('verify-inputs','--input',f.bundle,'--files',f.manifest);assert.equal(r.status,2);assert.equal(r.body.code,'invalid-input');
});
