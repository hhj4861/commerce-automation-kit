import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { makeDraft, saveDraft, parseBundle, RunnerError } from './draft.mjs';
import { loadInputFiles, verifyInputs } from './inputs.mjs';
import { checkDependency } from '../tools/check-dependency.mjs';
const USAGE='preview --input bundle.json [--files files.json] [--db /local/existing-directory/new.db] | verify-inputs --input bundle.json --files files.json';
try {
  const {values,positionals}=parseArgs({options:{input:{type:'string'},db:{type:'string'},files:{type:'string'}},allowPositionals:true});
  const [command]=positionals;
  if (positionals.length!==1 || !['preview','verify-inputs'].includes(command) || !values.input || (command==='verify-inputs' && (!values.files || values.db!==undefined))) throw new RunnerError('usage',2,USAGE);
  checkDependency();
  // Node's ENOENT/EACCES messages embed the path, so a read failure gets a fixed message for both commands.
  let text;
  try { text=readFileSync(values.input,'utf8'); } catch { throw new RunnerError('input-unreadable',2,'Cannot read input bundle'); }
  const bundle=parseBundle(text);
  const body=makeDraft(bundle);
  // Input files are opened only after the whole bundle, including every SHA, passed validation.
  const verified=values.files===undefined ? undefined : await verifyInputs(bundle.inputs,loadInputFiles(values.files));
  let result;
  if (command==='verify-inputs') result={ok:true,verified,authorized:false};
  else {
    result=values.db ? saveDraft(values.db,body) : {ok:true,preview:body,authorized:false};
    if (verified && result.ok) result={...result,inputsVerified:verified};
  }
  console.log(JSON.stringify(result)); process.exitCode=result.ok ? 0 : result.exitCode;
} catch(e) {
  console.log(JSON.stringify({ok:false,code:e instanceof RunnerError ? e.code : 'invalid-input',detail:e.message,...(e instanceof RunnerError ? e.extra : undefined)}));
  process.exitCode=e instanceof RunnerError ? e.exitCode : 2;
}
